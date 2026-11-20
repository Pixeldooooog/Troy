use rusqlite::{params, Connection};
use serde_json::json;
use tempfile::tempdir;
use troy_core::{
    feeds,
    market::{candles, Instrument},
    monitor::{Monitor, Status},
    storage::Store,
};

fn bank() -> serde_json::Value {
    json!({"success":true,"code":"SUC0000","data":{
    "MarketDay":true,"QuotedPrice":true,"NowTime":"2026/11/19 13:50:20",
    "FQAMBPRCZ1":{"zBuyPrc":"805.10","zSelPrc":"800.10"}}})
}
#[test]
fn bank_buy_side_and_closed_market() {
    let mut data = bank();
    let q = feeds::cmb(&data).unwrap();
    assert_eq!(q.redemption, Some(800.1));
    assert_eq!(q.price, 805.1);
    assert_eq!(q.published, Some(1795067420));
    data["data"]["QuotedPrice"] = json!(false);
    assert!(feeds::cmb(&data).is_err());
    assert!(feeds::icbc(&json!({"rf":[{"goldTypeNo":"OTHER","ActivePrice":99}]})).is_err());
}
#[test]
fn corrected_samples_and_empty_minutes() {
    let bars = candles(&[(121, 20.), (1, 3.), (5, 4.), (5, 2.), (7, 0.)], 60);
    assert_eq!(bars.len(), 2);
    assert_eq!((bars[0].open, bars[0].close, bars[0].count), (3., 2., 2));
}
#[test]
fn stale_quotes_do_not_trigger_and_latch_survives_restart() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("quotes.sqlite3");
    let mut q = feeds::cmb(&bank()).unwrap();
    let now = q.published.unwrap();
    q.observed = now;
    let mut s = Store::open(&path).unwrap();
    s.set_limit(q.market, Some(q.price)).unwrap();
    assert!(s.record(&q, now + 400).unwrap().is_none());
    assert!(s.record(&q, now).unwrap().is_some());
    drop(s);
    let mut s = Store::open(&path).unwrap();
    s.set_limit(q.market, Some(q.price)).unwrap();
    assert!(s.record(&q, now).unwrap().is_none());
    q.price += 1.;
    assert!(s.record(&q, now).unwrap().is_none());
    q.price -= 1.;
    assert!(s.record(&q, now).unwrap().is_some());
    s.pin(Instrument::Cmb).unwrap();
    let monitor = Monitor::new(s).unwrap();
    let snapshot = monitor.snapshot().unwrap();
    assert_eq!(snapshot.pinned, Instrument::Cmb);
    assert_eq!(
        snapshot
            .readings
            .iter()
            .find(|r| r.market == Instrument::Cmb)
            .unwrap()
            .status,
        Status::LastKnown
    );
    assert!(snapshot.last_alert.is_some());
}
#[test]
fn old_database_wal_epoch_and_retry() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("old");
    let mut dest = Store::open(&dir.path().join("new")).unwrap();
    let old = Connection::open(&src).unwrap();
    old.execute_batch(
        "PRAGMA journal_mode=WAL;
        CREATE TABLE samples(id, instrument,chart_at,value,origin,observed_at,plottable,payload);
        CREATE TABLE latest(payload);INSERT INTO latest VALUES(x'FF')",
    )
    .unwrap();
    let id = Instrument::Cmb.id();
    let epoch = 1795067420;
    for (i, plot) in [(0, true), (1, false)] {
        old.execute(
            "INSERT INTO samples VALUES(?,?,?,?,?,?,?,?)",
            params![
                i,
                id,
                epoch + i,
                805.1,
                "native",
                epoch + i,
                plot,
                b"{}".to_vec()
            ],
        )
        .unwrap();
    }
    let prefs = json!({"menuMarket":id,format!("limit.{id}"):810.0,format!("below.{id}"):true});
    assert!(dest.import_swift(&src, &prefs).is_err());
    assert!(dest
        .points(Instrument::Cmb, 0, epoch + 10)
        .unwrap()
        .is_empty());
    old.execute("UPDATE latest SET payload=?", [serde_json::to_vec(&json!({"instrument":id,"value":805.1,"source":"CMB","observedAt":epoch-978307200,"publishedAt":epoch-978307200})).unwrap()]).unwrap();
    dest.import_swift(&src, &prefs).unwrap();
    dest.import_swift(&src, &prefs).unwrap();
    assert_eq!(
        dest.points(Instrument::Cmb, 0, epoch + 10).unwrap(),
        [(epoch, 805.1)]
    );
    let q = dest.latest().unwrap().pop().unwrap();
    assert_eq!(q.published, Some(epoch));
    assert!(dest.record(&q, epoch).unwrap().is_none());
}
#[test]
fn exchange_minutes_do_not_cross_the_midnight_session() {
    let now = 1795067420;
    let data = json!({"heyue":"Au99.99","delaystr":"2026年11月19日 13:45:00","now":"13:45","times":["00:01","09:01","13:45","13:46","21:00"],"data":[100,101,102,103,104]});
    let points = feeds::exchange_minutes(&data, now).unwrap();
    assert_eq!(points.iter().map(|p| p.1).collect::<Vec<_>>(), [101., 102.]);
}
#[test]
fn chart_units_and_missing_fx() {
    use troy_core::market::{chart_prices, DisplayMode};
    let points = [(1, 31.1034768), (2, 62.2069536)];
    assert!(chart_prices(&points, Instrument::Spot, DisplayMode::YuanPerGram, None).is_empty());
    let prices = chart_prices(
        &points,
        Instrument::Spot,
        DisplayMode::YuanPerGram,
        Some(7.),
    );
    assert!((prices[1].1 - 14.).abs() < 1e-9);
    assert!(
        (chart_prices(&points, Instrument::Spot, DisplayMode::Relative, None)[1].1 - 200.).abs()
            < 1e-9
    );
}

#[test]
fn calendar_candles_use_beijing_midnight_monday_and_calendar_month() {
    use troy_core::market::CalendarPeriod::{Day, Month, Week};
    let dir = tempdir().unwrap();
    let path = dir.path().join("history");
    let store = Store::open(&path).unwrap();
    let db = Connection::open(path).unwrap();
    let epoch = |s: &str| chrono::DateTime::parse_from_rfc3339(s).unwrap().timestamp();
    // Sunday evening UTC is already Monday and June in Beijing.
    let boundary = epoch("2026-05-31T16:00:00Z");
    for (delta, price, eligible) in [
        (-2, 8., true),
        (-1, 7., true),
        (0, 9., true),
        (1, 11., true),
        (2, 10., true),
        (3, 99., false),
    ] {
        db.execute(
            "INSERT INTO samples VALUES(?,?,?,'test',?,?,X'00')",
            params![
                Instrument::Cmb.id(),
                boundary + delta,
                price,
                boundary + delta,
                eligible
            ],
        )
        .unwrap();
    }
    for period in [Day, Week, Month] {
        let bars = store
            .calendar(Instrument::Cmb, period, boundary + 5)
            .unwrap();
        assert_eq!(bars.len(), 2);
        assert_eq!(bars[1].time, boundary);
        assert_eq!(
            (
                bars[1].open,
                bars[1].high,
                bars[1].low,
                bars[1].close,
                bars[1].count
            ),
            (9., 11., 9., 10., 3)
        );
        assert_eq!((bars[0].open, bars[0].close), (8., 7.));
    }
}

#[test]
fn settings_round_trip_keep_order_and_unticked_positions() {
    use troy_core::storage::{CompareAxis, Holding, Lang, Settings};
    let dir = tempdir().unwrap();
    let path = dir.path().join("quotes.sqlite3");
    let mut s = Store::open(&path).unwrap();
    assert_eq!(s.settings().unwrap(), Settings::default());
    let mut next = Settings {
        tracking: Some(troy_core::storage::BankTracking {
            bank: Instrument::Ccb,
            seconds: 3,
        }),
        compare_axis: CompareAxis::Cny,
        auto_updates: false,
        lang: Lang::En,
        held: vec![Instrument::Ccb, Instrument::Icbc],
        ..Settings::default()
    };
    next.holdings.insert(
        Instrument::Cmb.id().into(),
        Holding {
            grams: Some(10.5),
            cost: Some(800.),
        },
    );
    s.save_settings(&next).unwrap();
    drop(s);
    let s = Store::open(&path).unwrap();
    assert_eq!(s.settings().unwrap(), next);

    let mut s = s;
    let mut bad = next.clone();
    bad.tracking.as_mut().unwrap().seconds = 0;
    assert!(s.save_settings(&bad).is_err());
    let mut bad = next.clone();
    bad.held.push(Instrument::Sge);
    assert!(s.save_settings(&bad).is_err());
    let mut bad = next.clone();
    bad.holdings.insert(
        Instrument::Icbc.id().into(),
        Holding {
            grams: Some(-1.),
            cost: None,
        },
    );
    assert!(s.save_settings(&bad).is_err());
    assert_eq!(s.settings().unwrap(), next);
}

#[test]
fn existing_ui_preferences_keep_their_values_when_new_fields_are_absent() {
    use troy_core::storage::{CompareAxis, Lang, Theme};
    let dir = tempdir().unwrap();
    let path = dir.path().join("quotes.sqlite3");
    let store = Store::open(&path).unwrap();
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute(
        "INSERT INTO prefs(key,value) VALUES('ui',?)",
        [r#"{"lang":"en","theme":"dark","ticker":false}"#],
    )
    .unwrap();
    let saved = store.settings().unwrap();
    assert_eq!(
        (saved.lang, saved.theme, saved.ticker),
        (Lang::En, Theme::Dark, false)
    );
    assert_eq!(saved.compare_axis, CompareAxis::Percent);
    assert!(saved.auto_updates);
}

#[test]
fn overview_prefers_official_close_then_previous_local_day() {
    use troy_core::{market::CalendarPeriod, monitor::Basis};
    let dir = tempdir().unwrap();
    let path = dir.path().join("quotes.sqlite3");
    let store = Store::open(&path).unwrap();
    let db = Connection::open(&path).unwrap();
    let now = chrono::Utc::now().timestamp();
    let today = CalendarPeriod::Day.bucket(now).unwrap();
    for (time, price) in [
        (today - 86400 - 60, 700.),
        (today - 3600, 801.),
        (today - 60, 802.),
        (today + 60, 900.),
    ] {
        db.execute(
            "INSERT INTO samples VALUES(?,?,?,'troy2',?,1,x'00')",
            params![Instrument::Icbc.id(), time, price, time],
        )
        .unwrap();
    }
    let monitor = Monitor::new(store).unwrap();
    let mut spot = feeds::spot(&json!({"price": 3737.0, "timestamp": now})).unwrap();
    spot.reference = Some(3724.67);
    monitor.receive(Instrument::Spot, Ok(spot));
    let trends = monitor.overview().unwrap();
    let find = |m: Instrument| trends.iter().find(|t| t.market == m).unwrap();
    assert_eq!(
        (
            find(Instrument::Spot).prev_close,
            find(Instrument::Spot).basis
        ),
        (Some(3724.67), Some(Basis::Official))
    );
    assert_eq!(
        (
            find(Instrument::Icbc).prev_close,
            find(Instrument::Icbc).basis
        ),
        (Some(802.), Some(Basis::Local))
    );
    assert_eq!(
        (
            find(Instrument::Cmb).prev_close,
            find(Instrument::Cmb).basis
        ),
        (None, None)
    );
}

#[test]
fn adopt_copies_a_consistent_snapshot_once() {
    let dir = tempdir().unwrap();
    let old = dir.path().join("old.sqlite3");
    let new = dir.path().join("new.sqlite3");
    let s = Store::open(&old).unwrap();
    s.pin(Instrument::Ccb).unwrap();
    // Keep the writer open so the change only lives in the WAL.
    assert!(Store::adopt(&old, &new).unwrap());
    assert!(!Store::adopt(&old, &new).unwrap());
    assert!(!Store::adopt(&dir.path().join("missing"), &dir.path().join("x")).unwrap());
    let copy = Store::open(&new).unwrap();
    assert_eq!(
        copy.preference("menuMarket").unwrap().as_deref(),
        Some(Instrument::Ccb.id())
    );
    s.set_limit(Instrument::Ccb, Some(1.)).unwrap();
    assert!(old.exists());
}

#[test]
fn delayed_exchange_table_does_not_generate_intraday_ticks() {
    use chrono::Utc;
    use troy_core::market::{beijing, DisplayMode};
    let temp = tempdir().unwrap();
    let monitor = Monitor::new(Store::open(&temp.path().join("history")).unwrap()).unwrap();
    let now = Utc::now().with_timezone(&beijing());
    let html = format!("<h2>上海黄金交易所 {} 延时行情</h2><tr><td>Au99.99</td><td>800</td><td>816</td><td>793</td><td>810</td></tr>",now.format("%Y年%m月%d日"));
    monitor.receive(Instrument::Sge, feeds::sge(&html));
    let snap = monitor.snapshot().unwrap();
    assert_eq!(
        snap.readings
            .iter()
            .find(|r| r.market == Instrument::Sge)
            .unwrap()
            .status,
        troy_core::monitor::Status::Delayed
    );
    assert!(monitor
        .history(Instrument::Sge, 60, DisplayMode::Original)
        .unwrap()
        .is_empty());
}

#[test]
fn retired_uob_preferences_do_not_disable_the_remaining_markets() {
    use troy_core::storage::CompareAxis;
    let dir = tempdir().unwrap();
    let path = dir.path().join("quotes.sqlite3");
    let store = Store::open(&path).unwrap();
    let db = Connection::open(&path).unwrap();
    db.execute_batch(
        r#"
        INSERT INTO prefs VALUES ('menuMarket','uob_sgd_gold_savings'),
          ('ui','{"tracking":{"bank":"uob_sgd_gold_savings","seconds":3},"compareAxis":"sgd"}'),
          ('lastAlert','{"market":"uob_sgd_gold_savings","target":160,"price":150,"time":1}');
        INSERT INTO holdings VALUES ('uob_sgd_gold_savings',0,5,160);
    "#,
    )
    .unwrap();
    let monitor = Monitor::new(store).unwrap();
    let settings = monitor.settings().unwrap();
    assert!(settings.tracking.is_none() && settings.held.is_empty());
    assert_eq!(settings.compare_axis, CompareAxis::Cny);
    monitor.save_settings(&settings).unwrap();
    let snapshot = monitor.snapshot().unwrap();
    assert_eq!(snapshot.pinned, Instrument::Icbc);
    assert!(snapshot.last_alert.is_none());
    assert!(snapshot
        .readings
        .iter()
        .all(|r| r.market != Instrument::Uob));
    let grams: f64 = db
        .query_row(
            "SELECT grams FROM holdings WHERE market='uob_sgd_gold_savings'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(grams, 5.0);
}
