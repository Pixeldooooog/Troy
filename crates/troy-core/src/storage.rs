use crate::market::{CalendarPeriod, Candle, DisplayMode, Instrument, Quote};
use anyhow::{ensure, Context, Result};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, path::Path};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alert {
    pub market: Instrument,
    pub price: f64,
    pub target: f64,
    pub time: i64,
}
pub struct Store(Connection);
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let db = Connection::open(path)?;
        db.execute_batch("PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS latest(market TEXT PRIMARY KEY, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS samples(market TEXT NOT NULL,time REAL NOT NULL,price REAL NOT NULL,
                origin TEXT NOT NULL,observed REAL NOT NULL,plottable INTEGER NOT NULL,payload BLOB NOT NULL,
                PRIMARY KEY(market,time,origin));
            CREATE INDEX IF NOT EXISTS sample_history ON samples(market,time) WHERE plottable=1;
            CREATE TABLE IF NOT EXISTS limits(market TEXT PRIMARY KEY, target REAL NOT NULL, below INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS prefs(key TEXT PRIMARY KEY,value TEXT NOT NULL);")?;
        Ok(Self(db))
    }
    pub fn latest(&self) -> Result<Vec<Quote>> {
        let mut stmt = self.0.prepare("SELECT payload FROM latest")?;
        let mut rows = stmt.query([])?;
        let mut quotes = vec![];
        while let Some(r) = rows.next()? {
            quotes.push(serde_json::from_str(&r.get::<_, String>(0)?)?);
        }
        Ok(quotes)
    }
    pub fn points(&self, m: Instrument, start: i64, end: i64) -> Result<Vec<(i64, f64)>> {
        let mut stmt=self.0.prepare("SELECT CAST(time AS INTEGER),price FROM samples WHERE market=? AND plottable=1 AND time BETWEEN ? AND ? ORDER BY time,observed")?;
        let rows = stmt.query_map(params![m.id(), start, end], |r| Ok((r.get(0)?, r.get(1)?)))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }
    /// The index supports a reverse scan. Stop as soon as the visible periods are full.
    pub fn calendar(
        &self,
        market: Instrument,
        period: CalendarPeriod,
        now: i64,
    ) -> Result<Vec<Candle>> {
        let mut stmt = self.0.prepare("SELECT CAST(time AS INTEGER),price FROM samples WHERE market=? AND plottable=1 AND time<=? ORDER BY time DESC, observed DESC")?;
        let mut rows = stmt.query(params![market.id(), now])?;
        let mut bars: Vec<Candle> = Vec::new();
        let mut previous = None;
        while let Some(row) = rows.next()? {
            let time: i64 = row.get(0)?;
            let price: f64 = row.get(1)?;
            if previous == Some(time) || !price.is_finite() || price <= 0. {
                continue;
            }
            previous = Some(time);
            let Some(bucket) = period.bucket(time) else {
                continue;
            };
            if let Some(bar) = bars.last_mut().filter(|bar| bar.time == bucket) {
                bar.open = price;
                bar.high = bar.high.max(price);
                bar.low = bar.low.min(price);
                bar.count += 1;
            } else {
                if bars.len() == 60 {
                    break;
                }
                bars.push(Candle {
                    time: bucket,
                    open: price,
                    high: price,
                    low: price,
                    close: price,
                    count: 1,
                });
            }
        }
        bars.reverse();
        Ok(bars)
    }
    pub fn preference(&self, key: &str) -> Result<Option<String>> {
        Ok(self
            .0
            .query_row("SELECT value FROM prefs WHERE key=?", [key], |r| r.get(0))
            .optional()?)
    }
    pub fn pin(&self, m: Instrument) -> Result<()> {
        ensure!(m != Instrument::Fx, "汇率仅用于换算");
        self.0.execute(
            "INSERT OR REPLACE INTO prefs VALUES('menuMarket',?)",
            [m.id()],
        )?;
        Ok(())
    }
    pub fn limits(&self) -> Result<BTreeMap<String, f64>> {
        let mut stmt = self.0.prepare("SELECT market,target FROM limits")?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }
    pub fn set_limit(&self, m: Instrument, target: Option<f64>) -> Result<()> {
        ensure!(m != Instrument::Fx, "汇率不支持提醒");
        if let Some(t) = target {
            ensure!(t.is_finite() && (0.01..1e9).contains(&t), "目标价无效");
            self.0.execute("INSERT INTO limits VALUES(?,?,0) ON CONFLICT(market) DO UPDATE SET target=excluded.target,below=0 WHERE target!=excluded.target",params![m.id(),(t*100.).round()/100.])?;
        } else {
            self.0
                .execute("DELETE FROM limits WHERE market=?", [m.id()])?;
        }
        Ok(())
    }
    pub fn chart_settings(&self) -> Result<(DisplayMode, i64)> {
        let mode = match self.preference("goldChartMode")?.as_deref() {
            Some("人民币对比") => DisplayMode::YuanPerGram,
            Some("相对波动") => DisplayMode::Relative,
            _ => DisplayMode::Original,
        };
        let seconds = if self.preference("tapeMinutes")?.as_deref() == Some("5") {
            300
        } else {
            60
        };
        Ok((mode, seconds))
    }
    pub fn set_chart(&mut self, mode: DisplayMode, seconds: i64) -> Result<()> {
        ensure!(matches!(seconds, 60 | 300), "无效周期");
        let label = match mode {
            DisplayMode::Original => "原始价格",
            DisplayMode::YuanPerGram => "人民币对比",
            DisplayMode::Relative => "相对波动",
        };
        let tx = self.0.transaction()?;
        tx.execute(
            "INSERT OR REPLACE INTO prefs VALUES('goldChartMode',?),('tapeMinutes',?)",
            params![label, (seconds / 60).to_string()],
        )?;
        tx.commit()?;
        Ok(())
    }
    pub fn record(&mut self, q: &Quote, now: i64) -> Result<Option<Alert>> {
        ensure!(q.price.is_finite() && q.price > 0., "无效报价");
        let tx = self.0.transaction()?;
        tx.execute(
            "INSERT OR REPLACE INTO latest VALUES(?,?)",
            params![q.market.id(), serde_json::to_string(q)?],
        )?;
        let mut alert = None;
        let current = q.current(now);
        let time = q.published.unwrap_or(q.observed);
        let last: Option<(f64, Vec<u8>, bool)> = tx.query_row(
            "SELECT observed,payload,plottable FROM samples WHERE market=? AND origin='troy2' ORDER BY time DESC LIMIT 1",
            [q.market.id()],|r|Ok((r.get(0)?, r.get(1)?, r.get(2)?)) ).optional()?;
        let save = match last {
            None => true,
            Some((observed, bytes, plottable)) => {
                let mut previous: Quote = serde_json::from_slice(&bytes)?;
                previous.observed = q.observed;
                current != plottable
                    || previous != *q
                    || (q.published.is_none() && current && q.observed - observed as i64 >= 60)
            }
        };
        if save {
            tx.execute("INSERT INTO samples(market,time,price,origin,observed,plottable,payload)
                VALUES(?,?,?,'troy2',?,?,?) ON CONFLICT(market,time,origin) DO UPDATE SET price=excluded.price,observed=excluded.observed,plottable=excluded.plottable,payload=excluded.payload WHERE excluded.plottable OR NOT samples.plottable",params![q.market.id(),time,q.price,q.observed,current,serde_json::to_vec(q)?])?;
        }
        if current {
            let rule: Option<(f64, bool)> = tx
                .query_row(
                    "SELECT target,below FROM limits WHERE market=?",
                    [q.market.id()],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?;
            if let Some((target, was_below)) = rule {
                let below = q.price <= target;
                if below != was_below {
                    tx.execute(
                        "UPDATE limits SET below=? WHERE market=?",
                        params![below, q.market.id()],
                    )?;
                    if below {
                        let a = Alert {
                            market: q.market,
                            price: q.price,
                            target,
                            time: now,
                        };
                        tx.execute(
                            "INSERT OR REPLACE INTO prefs VALUES('lastAlert',?)",
                            [serde_json::to_string(&a)?],
                        )?;
                        alert = Some(a);
                    }
                }
            }
        }
        tx.commit()?;
        Ok(alert)
    }
    /// A read transaction sees a consistent v1 snapshot, including committed WAL entries.
    /// Write only the v2 database; commit the marker with all imported rows.
    pub fn import_swift(&mut self, path: &Path, prefs: &Value) -> Result<()> {
        if self.preference("swiftImported")?.is_some() {
            return Ok(());
        }
        let tx = self.0.transaction()?;
        if path.exists() {
            let mut old = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
            let reader = old.transaction()?;
            let mut samples=reader.prepare("SELECT instrument,chart_at,value,origin,observed_at,plottable,payload FROM samples ORDER BY id")?;
            let mut rows = samples.query([])?;
            while let Some(r) = rows.next()? {
                tx.execute(
                    "INSERT OR IGNORE INTO samples VALUES(?,?,?,?,?,?,?)",
                    params![
                        r.get::<_, String>(0)?,
                        r.get::<_, f64>(1)?,
                        r.get::<_, f64>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, f64>(4)?,
                        r.get::<_, bool>(5)?,
                        r.get::<_, Vec<u8>>(6)?
                    ],
                )?;
            }
            let mut latest = reader.prepare("SELECT payload FROM latest")?;
            let mut rows = latest.query([])?;
            while let Some(r) = rows.next()? {
                let v: Value = serde_json::from_slice(&r.get::<_, Vec<u8>>(0)?)?;
                let timestamp = |key: &str| v[key].as_f64().map(|t| (t + 978307200.) as i64);
                let q = Quote {
                    market: serde_json::from_value(v["instrument"].clone())?,
                    price: v["value"].as_f64().context("旧库价格")?,
                    observed: timestamp("observedAt").context("旧库时间")?,
                    published: timestamp("publishedAt"),
                    source: v["source"].as_str().unwrap_or("").into(),
                    day: v["tradeDate"].as_str().map(str::parse).transpose()?,
                    high: v["high"].as_f64(),
                    low: v["low"].as_f64(),
                    redemption: v["redemption"].as_f64(),
                    daily: v["isDailyReference"] == true,
                    fallback: v["isFallback"] == true,
                };
                tx.execute(
                    "INSERT OR IGNORE INTO latest VALUES(?,?)",
                    params![q.market.id(), serde_json::to_string(&q)?],
                )?;
            }
        }
        for m in Instrument::ALL.into_iter().filter(|m| *m != Instrument::Fx) {
            if let Some(t) = prefs[format!("limit.{}", m.id())]
                .as_f64()
                .filter(|t| *t > 0.)
            {
                tx.execute(
                    "INSERT OR IGNORE INTO limits VALUES(?,?,?)",
                    params![m.id(), t, prefs[format!("below.{}", m.id())] == true],
                )?;
            }
        }
        for key in [
            "menuMarket",
            "goldChartMode",
            "tapeMarket",
            "tapeMinutes",
            "lastGoldAlert",
        ] {
            if let Some(v) = prefs.get(key) {
                tx.execute(
                    "INSERT OR IGNORE INTO prefs VALUES(?,?)",
                    params![
                        key,
                        v.as_str()
                            .map(str::to_owned)
                            .unwrap_or_else(|| v.to_string())
                    ],
                )?;
            }
        }
        tx.execute("INSERT INTO prefs VALUES('swiftImported','1')", [])?;
        tx.commit()?;
        Ok(())
    }
}
