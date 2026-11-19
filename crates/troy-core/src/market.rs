use chrono::{DateTime, FixedOffset, NaiveDate};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Instrument {
    #[serde(rename = "icbc_acc_gold_buy")]
    Icbc,
    #[serde(rename = "cmb_gold_account_buy")]
    Cmb,
    #[serde(rename = "jd_minsheng_gold")]
    Minsheng,
    #[serde(rename = "jd_zheshang_gold")]
    Zheshang,
    #[serde(rename = "sge_au9999")]
    Sge,
    #[serde(rename = "xauusd_live_proxy")]
    Spot,
    #[serde(rename = "usd_cny")]
    Fx,
}
impl Instrument {
    pub const ALL: [Self; 7] = [
        Self::Icbc,
        Self::Cmb,
        Self::Minsheng,
        Self::Zheshang,
        Self::Sge,
        Self::Spot,
        Self::Fx,
    ];
    pub fn id(self) -> &'static str {
        match self {
            Self::Icbc => "icbc_acc_gold_buy",
            Self::Cmb => "cmb_gold_account_buy",
            Self::Minsheng => "jd_minsheng_gold",
            Self::Zheshang => "jd_zheshang_gold",
            Self::Sge => "sge_au9999",
            Self::Spot => "xauusd_live_proxy",
            Self::Fx => "usd_cny",
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            Self::Icbc => "工行",
            Self::Cmb => "招行",
            Self::Minsheng => "民生·京东",
            Self::Zheshang => "浙商·京东",
            Self::Sge => "上金所",
            Self::Spot => "国际金",
            Self::Fx => "美元兑人民币",
        }
    }
    pub fn interval(self) -> u64 {
        match self {
            Self::Icbc | Self::Cmb => 15,
            Self::Sge | Self::Minsheng | Self::Zheshang => 30,
            Self::Spot => 10,
            Self::Fx => 60,
        }
    }
}
pub fn beijing() -> FixedOffset {
    FixedOffset::east_opt(8 * 3600).unwrap()
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Quote {
    pub market: Instrument,
    pub price: f64,
    pub source: String,
    pub observed: i64,
    pub published: Option<i64>,
    pub day: Option<NaiveDate>,
    pub redemption: Option<f64>,
    pub high: Option<f64>,
    pub low: Option<f64>,
    pub daily: bool,
    pub fallback: bool,
}
impl Quote {
    pub fn current(&self, now: i64) -> bool {
        let Some(clock) = DateTime::from_timestamp(now, 0) else {
            return false;
        };
        if !(0..=(120.max(self.market.interval() as i64 * 3))).contains(&(now - self.observed)) {
            return false;
        }
        if self
            .day
            .is_some_and(|day| day != clock.with_timezone(&beijing()).date_naive())
        {
            return false;
        }
        self.published.map_or(self.day.is_some(), |t| {
            (-60..=if self.daily { 345600 } else { 300 }).contains(&(now - t))
        })
    }
}
#[derive(Clone, Debug, Serialize)]
pub struct Candle {
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub count: usize,
}
pub fn candles(points: &[(i64, f64)], seconds: i64) -> Vec<Candle> {
    let mut buckets = BTreeMap::<i64, Candle>::new();
    if seconds <= 0 {
        return vec![];
    }
    let mut unique = BTreeMap::new();
    for &(time, price) in points {
        if price.is_finite() && price > 0.0 {
            unique.insert(time, price);
        }
    }
    for (t, p) in unique {
        let time = t.div_euclid(seconds) * seconds;
        let bar = buckets.entry(time).or_insert(Candle {
            time,
            open: p,
            high: p,
            low: p,
            close: p,
            count: 0,
        });
        bar.high = bar.high.max(p);
        bar.low = bar.low.min(p);
        bar.close = p;
        bar.count += 1;
    }
    buckets.into_values().collect()
}

/// Chart normalization uses the latest eligible FX observation, as in the Mac app.
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DisplayMode {
    Original,
    YuanPerGram,
    Relative,
}

pub fn chart_prices(
    points: &[(i64, f64)],
    market: Instrument,
    mode: DisplayMode,
    fx: Option<f64>,
) -> Vec<(i64, f64)> {
    let scale = match (mode, market) {
        (DisplayMode::Relative, _) => points
            .first()
            .filter(|(_, p)| *p > 0.)
            .map(|(_, p)| 100. / p),
        (DisplayMode::YuanPerGram, Instrument::Spot) => fx
            .filter(|v| v.is_finite() && *v > 0.)
            .map(|rate| rate / 31.1034768),
        _ => Some(1.),
    };
    scale
        .map(|s| points.iter().map(|(t, p)| (*t, p * s)).collect())
        .unwrap_or_default()
}
