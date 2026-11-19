use crate::{
    feeds::Feeds,
    market::{candles, chart_prices, CalendarPeriod, Candle, DisplayMode, Instrument, Quote},
    storage::{Alert, Store},
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

#[derive(Clone, Serialize)]
pub struct Reading {
    pub market: Instrument,
    pub quote: Option<Quote>,
    pub status: &'static str,
    pub detail: Option<String>,
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
}
struct State {
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
            thread::spawn(move || loop {
                if let Some(m) = market {
                    if let Some(alert) = monitor.receive(m, feeds.fetch(m)) {
                        notify(alert);
                    }
                } else if let Ok(points) = feeds.minutes() {
                    let mut state = monitor.0.lock().unwrap();
                    state.minutes = points;
                    state.revision += 1;
                }
                if rx.recv_timeout(Duration::from_secs(market.map_or(60, Instrument::interval)))
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
                    (None, None) => "等待报价",
                    (None, _) => "暂不可用",
                    (Some(_), None | Some(Some(_))) => "上次报价",
                    (Some(q), _) if !q.current(now) => "报价过期",
                    (Some(q), _) if q.daily || market == Instrument::Sge => "延时参考",
                    _ => "有效",
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
        })
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
        ensure!(matches!(seconds, 60 | 300), "周期应为 1 或 5 分钟");
        let now = Utc::now().timestamp();
        let start = now - 1800;
        let s = self.0.lock().unwrap();
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
