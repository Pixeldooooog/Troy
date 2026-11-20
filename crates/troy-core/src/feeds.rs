use crate::market::{beijing, Instrument, Quote};
use anyhow::{anyhow, bail, ensure, Context, Result};
use chrono::{DateTime, NaiveDate, NaiveDateTime, TimeZone, Utc};
use regex::Regex;
use reqwest::blocking::Client;
use serde_json::Value;
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

#[derive(Clone)]
pub struct Feeds(Client, Arc<Mutex<Option<(i64, f64)>>>);
fn number(v: &Value) -> Option<f64> {
    v.as_f64()
        .or_else(|| v.as_str()?.replace(',', "").trim().parse().ok())
        .filter(|v| v.is_finite() && *v > 0.)
}
fn stamp(s: &str, fmt: &str) -> Option<i64> {
    Some(
        beijing()
            .from_local_datetime(&NaiveDateTime::parse_from_str(s, fmt).ok()?)
            .single()?
            .timestamp(),
    )
}
fn blank(market: Instrument, source: &str) -> Quote {
    Quote {
        market,
        price: 0.,
        source: source.into(),
        observed: Utc::now().timestamp(),
        published: None,
        day: None,
        redemption: None,
        high: None,
        low: None,
        daily: false,
        fallback: false,
        reference: None,
    }
}
impl Feeds {
    pub fn new() -> Result<Self> {
        Ok(Self(
            Client::builder()
                .timeout(Duration::from_secs(10))
                .cookie_store(true)
                .user_agent("Troy/2")
                .build()?,
            Arc::default(),
        ))
    }
    fn json(&self, url: &str) -> Result<Value> {
        Ok(self.0.get(url).send()?.error_for_status()?.json()?)
    }
    fn form(&self, url: &str, key: &str, val: &str) -> Result<Value> {
        Ok(self
            .0
            .post(url)
            .form(&[(key, val)])
            .send()?
            .error_for_status()?
            .json()?)
    }
    pub fn fetch(&self, m: Instrument) -> Result<Quote> {
        match m {
            Instrument::Icbc => icbc(&self.form(
                "https://mybank.icbc.com.cn/servlet/AsynGetDataServlet",
                "tranCode",
                "A00622",
            )?),
            Instrument::Cmb => cmb(&self.form(
                "https://mbmodule-openapi.paas.cmbchina.com/product/v1/func/market-center",
                "params",
                r#"[{"prdType":"H","prdCode":""}]"#,
            )?),
            Instrument::Minsheng => jd_quote(
                m,
                "21001001000001",
                &self.json("https://api.jdjygold.com/gw/generic/hj/h5/m/latestPrice")?,
            ),
            Instrument::Zheshang => {
                let sku = "1961543816";
                let data = self
                    .0
                    .post("https://api.jdjygold.com/gw2/generic/jrm/h5/m/stdLatestPrice")
                    .query(&[("productSku", sku)])
                    .json(&serde_json::json!({"reqData":{"productSku":sku}}))
                    .send()?
                    .error_for_status()?
                    .json()?;
                jd_quote(m, sku, &data)
            }
            Instrument::Uob => bail!("retired market"),
            Instrument::Ccb => {
                // The public product page initializes an anonymous session before querying.
                let base = "https://creditcard1.ccb.com/tran/WCCMainPlatV5";
                let request = |code| {
                    self.0
                        .get(base)
                        .query(&[
                            ("CCB_IBSVersion", "V5"),
                            ("SERVLET_NAME", "WCCMainPlatV5"),
                            ("TXCODE", code),
                        ])
                        .header("User-Agent", "Mozilla/5.0 (compatible; Troy/2)")
                        .header("Referer", "https://creditcard1.ccb.com/")
                        .header("Accept", "application/json,text/plain,*/*")
                };
                request("100119").send()?.error_for_status()?;
                ccb(&request("NGJS01").send()?.error_for_status()?.json()?)
            }
            Instrument::Sge => sge(&self
                .0
                .get("https://www.sge.com.cn/sjzx/yshqbg")
                .send()?
                .error_for_status()?
                .text()?),
            Instrument::Spot => match self
                .json("https://api.gold-api.com/price/XAU")
                .and_then(|v| spot(&v))
            {
                Ok(mut q) => {
                    q.reference = self.spot_reference();
                    Ok(q)
                }
                Err(_) => self.sina(m),
            },
            Instrument::Fx => {
                let primary = self.sina(m);
                if primary
                    .as_ref()
                    .is_ok_and(|q| q.current(Utc::now().timestamp()))
                {
                    return primary;
                }
                let reference = self
                    .json("https://open.er-api.com/v6/latest/USD")
                    .and_then(|v| daily(&v));
                match reference {
                    Ok(q) if q.current(Utc::now().timestamp()) => Ok(q),
                    other => primary.or(other),
                }
            }
        }
    }
    fn sina(&self, m: Instrument) -> Result<Quote> {
        let fx = m == Instrument::Fx;
        let sym = if fx { "fx_susdcny" } else { "hf_XAU" };
        let bytes = self
            .0
            .get(format!("https://hq.sinajs.cn/list={sym}"))
            .header("Referer", "https://finance.sina.com.cn/")
            .send()?
            .error_for_status()?
            .bytes()?;
        let text = String::from_utf8_lossy(&bytes);
        sina_quote(m, sym, &text)
    }
    /// Gold API has no previous close, so borrow Sina's, refreshed every 10 minutes.
    fn spot_reference(&self) -> Option<f64> {
        let now = Utc::now().timestamp();
        if let Some((at, close)) = *self.1.lock().unwrap() {
            if now - at < 600 {
                return Some(close);
            }
        }
        let close = self.sina(Instrument::Spot).ok()?.reference?;
        *self.1.lock().unwrap() = Some((now, close));
        Some(close)
    }
    pub fn minutes(&self) -> Result<Vec<(i64, f64)>> {
        exchange_minutes(
            &self.json("https://www.sge.com.cn/graph/quotations?instid=Au99.99")?,
            Utc::now().timestamp(),
        )
    }
}
fn sina_quote(m: Instrument, sym: &str, text: &str) -> Result<Quote> {
    let fx = m == Instrument::Fx;
    let prefix = format!("hq_str_{sym}=\"");
    let record = text
        .split_once(&prefix)
        .and_then(|(_, s)| s.split_once('"'))
        .context("新浪响应格式")?
        .0;
    let fields: Vec<_> = record.split(',').collect();
    ensure!(fields.len() >= if fx { 10 } else { 13 }, "新浪字段缺失");
    let mut q = blank(
        m,
        if fx {
            "新浪财经 · 在岸人民币"
        } else {
            "新浪财经 · 伦敦现货"
        },
    );
    q.price = number(&Value::from(fields[if fx { 8 } else { 0 }])).context("新浪价格")?;
    let (day, clock) = if fx {
        (*fields.last().unwrap(), fields[0])
    } else {
        (fields[12], fields[6])
    };
    q.published = Some(stamp(&format!("{day} {clock}"), "%Y-%m-%d %H:%M:%S").context("新浪时间")?);
    q.fallback = !fx;
    if fx {
        q.reference = number(&fields[3].into());
    } else {
        q.high = number(&fields[4].into());
        q.low = number(&fields[5].into());
        q.reference = number(&fields[7].into());
    }
    Ok(q)
}
fn ccb(v: &Value) -> Result<Quote> {
    ensure!(
        v["SUCCESS"] == "true"
            && v["retCode"] == "000000"
            && v["PM_Txn_Vrty_Cd"] == "33"
            && v["CcyCd"] == "156",
        "建行产品或报价状态无效"
    );
    let mut q = blank(Instrument::Ccb, "建设银行 · 主动积存");
    q.price = number(&v["Cst_Buy_Prc"]).context("建行主动积存价")?;
    q.redemption = Some(number(&v["Cst_Sell_Prc"]).context("建行赎回价")?);
    q.published = Some(
        stamp(v["Tms"].as_str().unwrap_or(""), "%Y-%m-%d %H:%M:%S%.f").context("建行报价时间")?,
    );
    Ok(q)
}
fn jd_quote(market: Instrument, sku: &str, v: &Value) -> Result<Quote> {
    let result = &v["resultData"];
    let row = &result["datas"];
    ensure!(
        v["success"] == true && v["resultCode"] == 0 && result["status"] == "SUCCESS",
        "京东报价暂不可用"
    );
    ensure!(
        row["productSku"] == sku && row["demode"] == false,
        "京东产品或报价状态无效"
    );
    let millis = row["time"]
        .as_str()
        .and_then(|s| s.parse::<i64>().ok())
        .or_else(|| row["time"].as_i64())
        .context("京东报价缺少时间")?;
    ensure!(
        (1_000_000_000_000..10_000_000_000_000).contains(&millis),
        "京东报价时间单位异常"
    );
    let mut q = blank(market, "京东金融 · 积存金渠道参考价");
    q.price = number(&row["price"]).context("京东参考价无效")?;
    q.published = Some(millis / 1000);
    Ok(q)
}
pub fn cmb(v: &Value) -> Result<Quote> {
    let data = &v["data"];
    let row = &data["FQAMBPRCZ1"];
    ensure!(
        v["code"] == "SUC0000"
            && v["success"] == true
            && data["MarketDay"] == true
            && data["QuotedPrice"] == true,
        "招行停报"
    );
    let mut q = blank(Instrument::Cmb, "招商银行 · 黄金账户");
    q.price = number(&row["zBuyPrc"]).context("招行买入价")?;
    q.redemption = Some(number(&row["zSelPrc"]).context("招行赎回价")?);
    q.published = Some(
        stamp(data["NowTime"].as_str().unwrap_or(""), "%Y/%m/%d %H:%M:%S")
            .context("招行银行时间")?,
    );
    Ok(q)
}
pub fn icbc(v: &Value) -> Result<Quote> {
    ensure!(
        v["TranErrorCode"].as_str().unwrap_or("").is_empty(),
        "工行响应错误"
    );
    let row = v["rf"]
        .as_array()
        .and_then(|a| a.iter().find(|r| r["goldTypeNo"] == "JC001"))
        .context("缺少 JC001")?;
    let mut q = blank(Instrument::Icbc, "工商银行 · JC001");
    q.price = number(&row["ActivePrice"]).context("工行主动积存价")?;
    q.redemption = number(&row["SellPrice"]);
    q.high = number(&row["HighPrice"]);
    q.low = number(&row["LowPrice"]);
    q.day = NaiveDate::parse_from_str(row["ActiveDate"].as_str().unwrap_or(""), "%Y-%m-%d").ok();
    Ok(q)
}
pub fn spot(v: &Value) -> Result<Quote> {
    ensure!(
        matches!(v["symbol"].as_str().unwrap_or("XAU"), "XAU" | "XAUUSD")
            && v["currency"].as_str().unwrap_or("USD") == "USD",
        "国际金品种错误"
    );
    let mut q = blank(Instrument::Spot, "Gold API");
    q.price = number(&v["price"]).context("国际金价格")?;
    q.published = Some(
        v["updatedAt"]
            .as_str()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|d| d.timestamp())
            .or_else(|| v["timestamp"].as_i64())
            .context("国际金时间")?,
    );
    Ok(q)
}
fn daily(v: &Value) -> Result<Quote> {
    ensure!(v["base_code"] == "USD", "汇率基准错误");
    let mut q = blank(Instrument::Fx, "ExchangeRate-API 每日参考");
    q.price = number(&v["rates"]["CNY"]).context("汇率")?;
    q.published = Some(v["time_last_update_unix"].as_i64().context("汇率时间")?);
    q.fallback = true;
    q.daily = true;
    Ok(q)
}
pub fn sge(html: &str) -> Result<Quote> {
    let date =
        Regex::new(r"上海黄金交易所\s*(\d{4})年(\d{1,2})月(\d{1,2})日\s*延时行情")?.captures(html);
    let rows = Regex::new(r"(?is)<tr\b[^>]*>(.*?)</tr>")?;
    let cells = Regex::new(r"(?is)<td\b[^>]*>(.*?)</td>")?;
    let tags = Regex::new(r"<[^>]*>")?;
    for row in rows.captures_iter(html) {
        let c: Vec<_> = cells
            .captures_iter(&row[1])
            .map(|c| {
                tags.replace_all(&c[1], "")
                    .replace("&nbsp;", " ")
                    .trim()
                    .to_owned()
            })
            .collect();
        if c.len() < 5 || c[0] != "Au99.99" {
            continue;
        }
        let mut q = blank(Instrument::Sge, "上海黄金交易所 · 延时");
        q.price = number(&Value::from(c[1].as_str())).context("上金所报价")?;
        q.high = number(&Value::from(c[2].as_str()));
        q.low = number(&Value::from(c[3].as_str()));
        q.published = c.get(5).and_then(|v| stamp(v, "%Y-%m-%d %H:%M:%S"));
        q.day = date.as_ref().and_then(|d| {
            NaiveDate::from_ymd_opt(d[1].parse().ok()?, d[2].parse().ok()?, d[3].parse().ok()?)
        });
        return Ok(q);
    }
    bail!("上金所无 Au99.99")
}
pub fn exchange_minutes(v: &Value, now: i64) -> Result<Vec<(i64, f64)>> {
    use chrono::{Datelike, NaiveTime, Timelike};
    ensure!(v["heyue"] == "Au99.99", "分钟品种错误");
    let clocks = v["times"].as_array().context("分钟时间")?;
    let prices = v["data"].as_array().context("分钟价格")?;
    let clock = |s: &str| {
        NaiveTime::parse_from_str(s, "%H:%M")
            .ok()
            .map(|t| t.hour() * 60 + t.minute())
    };
    let end = NaiveDateTime::parse_from_str(
        v["delaystr"].as_str().unwrap_or(""),
        "%Y年%m月%d日 %H:%M:%S",
    )?;
    let minute = end.hour() * 60 + end.minute();
    let weekday = end.weekday().number_from_monday();
    let segment = match (minute, weekday) {
        (1200.., 1..=5) => 1200..=1439,
        (0..=539, 2..=6) => 0..=150,
        (540..=1199, 1..=5) => 540..=930,
        _ => return Ok(vec![]),
    };
    let stop =
        minute.min(clock(v["now"].as_str().unwrap_or("")).ok_or_else(|| anyhow!("分钟截止时间"))?);
    let midnight = beijing()
        .from_local_datetime(&end.date().and_hms_opt(0, 0, 0).unwrap())
        .unwrap()
        .timestamp();
    let mut points = Vec::new();
    for (t, p) in clocks.iter().zip(prices) {
        let (Some(m), Some(price)) = (t.as_str().and_then(clock), number(p)) else {
            continue;
        };
        let time = midnight + i64::from(m) * 60;
        if segment.contains(&m)
            && m <= stop
            && time <= now
            && Some(price) != number(&v["min"]).map(|p| p - 2.)
            && points.last().is_none_or(|&(last, _)| time > last)
        {
            points.push((time, price));
        }
    }
    Ok(points)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn alternate_feeds_keep_their_source_and_clock() {
        let row = r#"var hq_str_hf_XAU="3700,0,0,0,3705,3695,13:50:20,0,0,0,0,0,2026-11-19";"#;
        let q = sina_quote(Instrument::Spot, "hf_XAU", row).unwrap();
        assert!(q.fallback);
        assert_eq!(q.price, 3700.);
        assert_eq!(q.reference, None);
        let close = r#"var hq_str_hf_XAU="3737.23,3724.670,3737.23,3737.58,3758.42,3693.37,16:11:00,3724.67,3728.04,0,0,0,2026-11-19,伦敦金";"#;
        assert_eq!(
            sina_quote(Instrument::Spot, "hf_XAU", close)
                .unwrap()
                .reference,
            Some(3724.67)
        );
        let fx = r#"var hq_str_fx_susdcny="16:11:01,6.6654,6.6655,6.6678,32,6.6670,6.6677,6.6645,6.6655,在岸人民币,-0.0345,-0.0023,0.0032,x,0,0,,2026-11-19";"#;
        let rate = sina_quote(Instrument::Fx, "fx_susdcny", fx).unwrap();
        assert_eq!((rate.price, rate.reference), (6.6655, Some(6.6678)));
        assert_eq!(q.published, Some(1795067420));
        assert!(sina_quote(Instrument::Fx, "fx_susdcny", row).is_err());
        let q = daily(
            &json!({"base_code":"USD","rates":{"CNY":6.7},"time_last_update_unix":1795017600}),
        )
        .unwrap();
        assert!(q.daily && q.fallback);
        assert_eq!(q.price, 6.7);
    }
    #[test]
    fn table_selects_the_requested_contract() {
        let q=sge("<h2>上海黄金交易所 2026年11月19日 延时行情</h2><tr><td>Au99.95</td></tr><tr><td>Au99.99</td><td>803.1</td><td>805</td><td>800</td><td></td><td>2026-11-19 13:50:20</td></tr>").unwrap();
        assert_eq!(q.market, Instrument::Sge);
        assert_eq!(q.published, Some(1795067420));
        assert_eq!(q.day.unwrap().to_string(), "2026-11-19");
        assert!(spot(&json!({"price":803,"currency":"CNY","timestamp":1795067420})).is_err());
    }
}

#[cfg(test)]
mod jd_tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn channel_quote_requires_matching_product_live_price_and_millisecond_timestamp() {
        let sku = "1961543816";
        let mut payload = json!({"success":true,"resultCode":0,"resultData":{"status":"SUCCESS","datas":{"demode":false,"productSku":sku,"price":"803.04","time":"1795068950000"}}});
        let read = |v: &Value| jd_quote(Instrument::Zheshang, sku, v);
        let q = read(&payload).unwrap();
        assert_eq!(
            (q.price, q.published, q.redemption),
            (803.04, Some(1795068950), None)
        );
        for (key, value) in [
            ("productSku", json!("other")),
            ("demode", json!(true)),
            ("price", json!("0")),
            ("time", json!(1795068950)),
        ] {
            let mut invalid = payload.clone();
            invalid["resultData"]["datas"][key] = value;
            assert!(read(&invalid).is_err());
        }
        payload["resultData"]["status"] = json!("FAIL");
        assert!(read(&payload).is_err());
    }
}

#[cfg(test)]
mod official_bank_tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn ccb_requires_active_accumulation_rmb_and_quote_time() {
        let mut v = json!({"SUCCESS":"true","retCode":"000000","CcyCd":"156","PM_Txn_Vrty_Cd":"33","Cst_Buy_Prc":"806.27","Cst_Sell_Prc":"800.27","Tms":"2026-11-19 14:20:29.160"});
        let q = ccb(&v).unwrap();
        assert_eq!((q.price, q.redemption), (806.27, Some(800.27)));
        v["CcyCd"] = json!("840");
        assert!(ccb(&v).is_err());
    }
}
