//! Menu bar (macOS) / notification area (Windows) entry, kept in sync with the core.
//!
//! The menu is grouped like the sidebar: held accounts, other banks, market
//! benchmarks, the last alert, then app actions. It is rebuilt only when that
//! grouping changes; otherwise the existing items are relabelled in place.
use std::{
    collections::BTreeMap,
    thread,
    time::{Duration, Instant},
};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    App, AppHandle, Emitter, Manager, Wry,
};
use troy_core::{
    market::Instrument,
    monitor::{Monitor, Reading, Snapshot, Status},
    storage::Lang,
};

use crate::text::{market, text};

/// What decides the menu's structure; a change means the menu is rebuilt.
#[derive(Clone, PartialEq)]
struct Layout {
    held: Vec<Instrument>,
    lang: Lang,
    has_alert: bool,
}

struct Built {
    menu: Menu<Wry>,
    markets: Vec<(Instrument, CheckMenuItem<Wry>)>,
    last: Option<MenuItem<Wry>>,
}

pub fn install(app: &mut App, core: Monitor) -> tauri::Result<()> {
    let handle = app.handle().clone();
    let layout = layout_of(&core, core.snapshot().ok().as_ref());
    let built = build(&handle, &layout)?;
    let tray = TrayIconBuilder::new()
        .icon(tauri::image::Image::from_bytes(include_bytes!(
            "../icons/icon.png"
        ))?)
        .menu(&built.menu)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "open" => crate::show(app),
            "exit" => app.exit(0),
            id => {
                if let Some(m) = Instrument::from_id(id) {
                    if let Err(e) = app.state::<Monitor>().pin(m) {
                        eprintln!("{e}")
                    }
                }
            }
        })
        .build(app)?;

    thread::spawn(move || {
        let mut built = built;
        let mut layout = layout;
        let mut previous = None;
        // Previous closes change once a day; refresh them at most once a minute.
        let mut closes: BTreeMap<Instrument, f64> = BTreeMap::new();
        let mut closes_at: Option<Instant> = None;
        loop {
            thread::sleep(Duration::from_secs(1));
            let Ok(s) = core.snapshot() else { continue };
            let next = layout_of(&core, Some(&s));
            let stamp = (
                s.revision,
                s.pinned,
                s.readings.iter().map(|r| r.status).collect::<Vec<_>>(),
            );
            if previous.as_ref() == Some(&stamp) && next == layout {
                continue;
            }
            previous = Some(stamp);
            let _ = handle.emit_to("main", "market-changed", s.revision);
            if closes_at.is_none_or(|t| t.elapsed() >= Duration::from_secs(60)) {
                if let Ok(trends) = core.overview() {
                    closes = trends
                        .into_iter()
                        .filter_map(|t| Some((t.market, t.prev_close?)))
                        .collect();
                    closes_at = Some(Instant::now());
                }
            }
            if next != layout {
                match build(&handle, &next) {
                    Ok(fresh) => {
                        let _ = tray.set_menu(Some(fresh.menu.clone()));
                        built = fresh;
                        layout = next;
                    }
                    Err(e) => eprintln!("{e}"),
                }
            }
            render(&s, &built, &closes, &tray);
        }
    });
    Ok(())
}

fn layout_of(core: &Monitor, s: Option<&Snapshot>) -> Layout {
    let held = core
        .settings()
        .map(|settings| settings.held)
        .unwrap_or_default();
    Layout {
        held: held.into_iter().filter(|m| m.is_bank()).collect(),
        lang: s.map(|s| s.lang).unwrap_or_default(),
        has_alert: s.is_some_and(|s| s.last_alert.is_some()),
    }
}

/// Section heading: a disabled item, which macOS draws in grey.
fn heading(app: &AppHandle, id: &str, label: &str) -> tauri::Result<MenuItem<Wry>> {
    MenuItem::with_id(app, id, label, false, None::<&str>)
}

fn build(app: &AppHandle, layout: &Layout) -> tauri::Result<Built> {
    let t = text(layout.lang);
    let menu = Menu::new(app)?;
    let mut markets = vec![];
    let others: Vec<Instrument> = Instrument::ALL
        .into_iter()
        .filter(|m| m.is_bank() && !layout.held.contains(m))
        .collect();
    let benchmarks = [Instrument::Sge, Instrument::Spot];
    let sections: [(&str, &str, &[Instrument]); 3] = [
        ("h-held", t.my_gold, &layout.held),
        ("h-other", t.other_banks, &others),
        ("h-bench", t.benchmarks, &benchmarks),
    ];
    let mut first = true;
    for (id, title, group) in sections {
        if group.is_empty() {
            continue;
        }
        if !first {
            menu.append(&PredefinedMenuItem::separator(app)?)?;
        }
        first = false;
        menu.append(&heading(app, id, title)?)?;
        for &m in group {
            let item = CheckMenuItem::with_id(
                app,
                m.id(),
                market(m, layout.lang),
                true,
                false,
                None::<&str>,
            )?;
            menu.append(&item)?;
            markets.push((m, item));
        }
    }
    let last = if layout.has_alert {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        let item = MenuItem::with_id(app, "last", t.last_alert, false, None::<&str>)?;
        menu.append(&item)?;
        Some(item)
    } else {
        None
    };
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        "open",
        t.open,
        true,
        Some("CmdOrCtrl+O"),
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "exit",
        t.quit,
        true,
        Some("CmdOrCtrl+Q"),
    )?)?;
    Ok(Built {
        menu,
        markets,
        last,
    })
}

/// "工行  760.52  +0.21%", with the status appended only when it is not live.
fn label(r: &Reading, close: Option<f64>, lang: Lang) -> String {
    let status = (r.status != Status::Live).then(|| r.status.label(lang));
    format_label(
        market(r.market, lang),
        r.quote.as_ref().map(|q| q.price),
        close,
        status,
    )
}

fn format_label(
    name: &str,
    price: Option<f64>,
    close: Option<f64>,
    status: Option<&str>,
) -> String {
    let mut label = match price {
        Some(price) => format!("{name}  {price:.2}"),
        None => format!("{name}  —"),
    };
    if let (Some(price), Some(prev)) = (price, close.filter(|p| *p > 0.0)) {
        let pct = (price / prev - 1.0) * 100.0;
        let sign = if pct >= 0.005 {
            "+"
        } else if pct <= -0.005 {
            "−"
        } else {
            ""
        };
        label += &format!("  {sign}{:.2}%", pct.abs());
    }
    if let Some(status) = status {
        label += &format!("  · {status}");
    }
    label
}

fn render(s: &Snapshot, built: &Built, closes: &BTreeMap<Instrument, f64>, tray: &TrayIcon) {
    let lang: Lang = s.lang;
    let t = text(lang);
    for (m, item) in &built.markets {
        let _ = item.set_checked(*m == s.pinned);
        let Some(r) = s.readings.iter().find(|r| r.market == *m) else {
            continue;
        };
        let _ = item.set_text(label(r, closes.get(m).copied(), lang));
    }
    if let Some(r) = s.readings.iter().find(|r| r.market == s.pinned) {
        let name = market(s.pinned, lang);
        let price = r
            .quote
            .as_ref()
            .map(|q| format!("{:.2}", q.price))
            .unwrap_or_else(|| "—".into());
        let mut tip = format!("{name} {price} · {}", r.status.label(lang));
        if let Some(q) = &r.quote {
            let (timestamp, kind) = q
                .published
                .map_or((q.observed, t.observed), |ts| (ts, t.quoted));
            if let Some(time) = chrono::DateTime::from_timestamp(timestamp, 0) {
                tip = format!(
                    "{tip} · {kind} {} {}",
                    time.with_timezone(&troy_core::market::beijing())
                        .format("%m-%d %H:%M:%S"),
                    t.beijing
                );
            }
        }
        let _ = tray.set_tooltip(Some(&tip));
        #[cfg(target_os = "macos")]
        let _ = tray.set_title(Some(format!(
            "{name} {price}{}",
            if r.status == Status::Live { "" } else { " ·" }
        )));
    }
    if let (Some(item), Some(a)) = (&built.last, &s.last_alert) {
        let time = chrono::DateTime::from_timestamp(a.time, 0)
            .map(|t| {
                t.with_timezone(&troy_core::market::beijing())
                    .format("%H:%M ")
                    .to_string()
            })
            .unwrap_or_default();
        let _ = item.set_text(format!(
            "{} · {time}{} {:.2}",
            t.last_alert,
            market(a.market, lang),
            a.price
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::format_label;

    #[test]
    fn labels_show_change_and_only_unusual_status() {
        assert_eq!(
            format_label("工行", Some(760.52), Some(758.93), None),
            "工行  760.52  +0.21%"
        );
        assert_eq!(
            format_label("建行", Some(762.61), Some(763.07), None),
            "建行  762.61  −0.06%"
        );
        assert_eq!(
            format_label("招行", Some(762.97), Some(762.97), None),
            "招行  762.97  0.00%"
        );
        assert_eq!(
            format_label("国际金", Some(3547.02), None, None),
            "国际金  3547.02"
        );
        assert_eq!(
            format_label("上金所", Some(761.0), None, Some("延时参考")),
            "上金所  761.00  · 延时参考"
        );
        assert_eq!(
            format_label("大华", None, Some(170.0), Some("等待报价")),
            "大华  —  · 等待报价"
        );
    }
}
