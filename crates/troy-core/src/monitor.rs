use crate::{
    feeds::Feeds,
    market::{candles, chart_prices, CalendarPeriod, Candle, DisplayMode, Instrument, Quote},
    storage::{Alert, BankTracking, Lang, Settings, Store},
};
use anyhow::{ensure, Result};
use chrono::Utc;
use serde::Serialize;
use std::{
    collections::BTreeMap,
    sync::{mpsc, Arc, Mutex},
    thread,
    time::Duration,
};

/// Quote state as a stable code; the window and tray translate it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    /// Fresh quote from the primary source.
    Live,
    /// Fresh, but the source itself is delayed or a daily reference.
    Delayed,
    /// The latest fetch failed or none has finished since launch.
    LastKnown,
    /// The quote is older than its freshness window.
    Stale,
    /// No quote and no attempt yet.
    Waiting,
    /// No quote and the last attempt failed.
    Unavailable,
}
impl Status {
    pub fn label(self, lang: Lang) -> &'static str {
        match (self, lang) {
            (Self::Live, Lang::Zh) => "有效",
            (Self::Delayed, Lang::Zh) => "延时参考",
            (Self::LastKnown, Lang::Zh) => "上次报价",
            (Self::Stale, Lang::Zh) => "报价过期",
            (Self::Waiting, Lang::Zh) => "等待报价",
            (Self::Unavailable, Lang::Zh) => "暂不可用",
            (Self::Live, Lang::En) => "Live",
            (Self::Delayed, Lang::En) => "Delayed",
            (Self::LastKnown, Lang::En) => "Last known",
            (Self::Stale, Lang::En) => "Stale",
            (Self::Waiting, Lang::En) => "Waiting",
            (Self::Unavailable, Lang::En) => "Unavailable",
        }
    }
}
#[derive(Clone, Serialize)]
pub struct Reading {
    pub market: Instrument,
    pub quote: Option<Quote>,
    pub status: Status,
    pub detail: Option<String>,
}
/// Where a day-over-day baseline came from.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Basis {
    /// Previous close published by the source.
    Official,
    /// Last quote recorded locally on the previous Beijing calendar day.
    Local,
}
/// Everything the overview needs for one market, fetched in one call.
#[derive(Clone, Serialize)]
pub struct Trend {
    pub market: Instrument,
    /// 1-minute bars over the last 30 minutes in the market's own unit.
    pub intraday: Vec<Candle>,
    pub prev_close: Option<f64>,
    pub basis: Option<Basis>,
}
#[derive(Serialize)]
pub struct Snapshot {
    pub revision: u64,
    pub readings: Vec<Reading>,
    pub pinned: Instrument,
    pub limits: BTreeMap<String, f64>,
    pub last_alert: Option<Alert>,
    pub storage_error: Option<String>,
    pub chart: (DisplayMode, i64),
    pub legacy_alert: Option<String>,
    pub lang: Lang,
}
struct State {
    tracking: Option<BankTracking>,
    store: Store,
    quotes: BTreeMap<Instrument, Quote>,
    attempts: BTreeMap<Instrument, Option<String>>,
    minutes: Vec<(i64, f64)>,
    revision: u64,
    storage_error: Option<String>,
}
#[derive(Clone)]
pub struct Monitor(Arc<Mutex<State>>);
pub struct Workers {
    _stop: Vec<mpsc::Sender<()>>,
}
impl Monitor {
    pub fn new(store: Store) -> Result<Self> {
        let quotes = store.latest()?.into_iter().map(|q| (q.market, q)).collect();
        Ok(Self(Arc::new(Mutex::new(State {
            tracking: store.settings()?.tracking,
            store,
            quotes,
            attempts: BTreeMap::new(),
            minutes: vec![],
            revision: 0,
            storage_error: None,
        }))))
    }
    pub fn start(&self, feeds: Feeds, notify: impl Fn(Alert) + Send + Sync + 'static) -> Workers {
        let notify = Arc::new(notify);
        let mut stop = vec![];
        for market in Instrument::ALL
            .into_iter()
            .map(Some)
            .chain(std::iter::once(None))
        {
            let (tx, rx) = mpsc::channel();
            stop.push(tx);
            let monitor = self.clone();
            let feeds = feeds.clone();
            let notify = notify.clone();
            let mut failures: u32 = 0;
            thread::spawn(move || loop {
                let mut delay = market.map_or(60, Instrument::interval);
                if let Some(m) = market {
                    let result = feeds.fetch(m);
                    failures = if result.is_ok() {
                        0
                    } else {
                        (failures + 1).min(6)
                    };
                    let tracking = monitor.0.lock().unwrap().tracking;
                    if let Some(t) = tracking.filter(|t| t.bank == m) {
                        delay = if failures == 0 {
                            t.seconds
                        } else {
                            (delay * 2u64.pow(failures - 1)).min(300)
                        };
                    }
                    if let Some(alert) = monitor.receive(m, result) {
                        notify(alert);
                    }
                } else if let Ok(points) = feeds.minutes() {
                    let mut state = monitor.0.lock().unwrap();
                    state.minutes = points;
                    state.revision += 1;
                }
                if rx.recv_timeout(Duration::from_secs(delay))
                    != Err(mpsc::RecvTimeoutError::Timeout)
                {
                    break;
                }
            });
        }
        Workers { _stop: stop }
    }
    pub fn receive(&self, m: Instrument, result: Result<Quote>) -> Option<Alert> {
        let mut s = self.0.lock().unwrap();
        s.revision += 1;
        match result {
            Ok(q) => {
                s.attempts.insert(m, None);
                let saved = s.store.record(&q, Utc::now().timestamp());
                s.quotes.insert(m, q);
                match saved {
                    Ok(alert) => {
                        s.storage_error = None;
                        alert
                    }
                    Err(e) => {
                        s.storage_error = Some(e.to_string());
                        None
                    }
                }
            }
            Err(e) => {
                s.attempts.insert(m, Some(e.to_string()));
                None
            }
        }
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        let s = self.0.lock().unwrap();
        let now = Utc::now().timestamp();
        let pinned = s
            .store
            .preference("menuMarket")?
            .and_then(|id| {
                Instrument::ALL
                    .into_iter()
                    .find(|m| m.id() == id && *m != Instrument::Fx)
            })
            .unwrap_or(Instrument::Icbc);
        let readings = Instrument::ALL
            .into_iter()
            .map(|market| {
                let quote = s.quotes.get(&market).cloned();
                let attempt = s.attempts.get(&market);
                let status = match (&quote, attempt) {
                    (None, None) => Status::Waiting,
                    (None, _) => Status::Unavailable,
                    (Some(_), None | Some(Some(_))) => Status::LastKnown,
                    (Some(q), _) if !q.current(now) => Status::Stale,
                    (Some(q), _) if q.daily || market == Instrument::Sge => Status::Delayed,
                    _ => Status::Live,
                };
                Reading {
                    market,
                    quote,
                    status,
                    detail: attempt.cloned().flatten(),
                }
            })
            .collect();
        Ok(Snapshot {
            revision: s.revision,
            pinned,
            readings,
            limits: s.store.limits()?,
            chart: s.store.chart_settings()?,
            legacy_alert: s.store.preference("lastGoldAlert")?,
            last_alert: s
                .store
                .preference("lastAlert")?
                .map(|s| serde_json::from_str(&s))
                .transpose()?,
            storage_error: s.storage_error.clone(),
            lang: s.store.settings()?.lang,
        })
    }
    pub fn settings(&self) -> Result<Settings> {
        self.0.lock().unwrap().store.settings()
    }
    pub fn save_settings(&self, settings: &Settings) -> Result<()> {
        let mut s = self.0.lock().unwrap();
        s.store.save_settings(settings)?;
        s.tracking = settings.tracking;
        s.revision += 1;
        Ok(())
    }
    /// Intraday bars and a day-change baseline for every market in one lock.
    pub fn overview(&self) -> Result<Vec<Trend>> {
        let now = Utc::now().timestamp();
        let s = self.0.lock().unwrap();
        let today = CalendarPeriod::Day.bucket(now).unwrap_or(now);
        Instrument::ALL
            .into_iter()
            .map(|market| {
                let official = s.quotes.get(&market).and_then(|q| q.reference);
                let (prev_close, basis) = match official {
                    Some(close) => (Some(close), Some(Basis::Official)),
                    None => match s.store.last_close(market, today - 86400, today)? {
                        Some(close) => (Some(close), Some(Basis::Local)),
                        None => (None, None),
                    },
                };
                Ok(Trend {
                    market,
                    intraday: Self::history_in(&s, market, 60, DisplayMode::Original, now)?,
                    prev_close,
                    basis,
                })
            })
            .collect()
    }
    pub fn pin(&self, m: Instrument) -> Result<()> {
        let mut s = self.0.lock().unwrap();
        s.store.pin(m)?;
        s.revision += 1;
        Ok(())
    }
    pub fn set_limit(&self, m: Instrument, t: Option<f64>) -> Result<()> {
        let mut s = self.0.lock().unwrap();
        s.store.set_limit(m, t)?;
        s.revision += 1;
        Ok(())
    }
    pub fn set_chart(&self, mode: DisplayMode, seconds: i64) -> Result<()> {
        let mut s = self.0.lock().unwrap();
        s.store.set_chart(mode, seconds)?;
        s.revision += 1;
        Ok(())
    }
    pub fn calendar(&self, market: Instrument, period: CalendarPeriod) -> Result<Vec<Candle>> {
        self.0
            .lock()
            .unwrap()
            .store
            .calendar(market, period, Utc::now().timestamp())
    }
    pub fn history(&self, m: Instrument, seconds: i64, mode: DisplayMode) -> Result<Vec<Candle>> {
        let s = self.0.lock().unwrap();
        Self::history_in(&s, m, seconds, mode, Utc::now().timestamp())
    }
    fn history_in(
        s: &State,
        m: Instrument,
        seconds: i64,
        mode: DisplayMode,
        now: i64,
    ) -> Result<Vec<Candle>> {
        ensure!(matches!(seconds, 60 | 300), "周期应为 1 或 5 分钟");
        let start = now - 1800;
        let points = if m == Instrument::Sge {
            // Only the exchange's minute feed supplies intraday timestamps.
            // Polling the delayed table after close must not create fresh candles.
            s.minutes
                .iter()
                .copied()
                .filter(|(t, _)| (start..=now).contains(t))
                .collect()
        } else {
            s.store.points(m, start, now)?
        };
        let fx = s
            .quotes
            .get(&Instrument::Fx)
            .filter(|q| q.current(now) && matches!(s.attempts.get(&Instrument::Fx), Some(None)))
            .map(|q| q.price);
        Ok(candles(&chart_prices(&points, m, mode, fx), seconds))
    }
}
