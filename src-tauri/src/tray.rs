//! Menu bar (macOS) / notification area (Windows) entry, kept in sync with the core.
use std::{thread, time::Duration};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    App, Emitter, Manager, Wry,
};
use troy_core::{market::Instrument, monitor::Monitor, storage::Lang};

use crate::text::{market, text};

pub fn install(app: &mut App, core: Monitor) -> tauri::Result<()> {
    let lang = core.snapshot().map(|s| s.lang).unwrap_or_default();
    let t = text(lang);
    let menu = Menu::new(app)?;
    let mut items = vec![];
    for m in Instrument::ALL.into_iter().filter(|m| *m != Instrument::Fx) {
        let item = MenuItem::with_id(app, m.id(), market(m, lang), true, None::<&str>)?;
        menu.append(&item)?;
        items.push((m, item));
    }
    let last = MenuItem::with_id(app, "last", t.no_alert, false, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", t.open, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "exit", t.quit, true, None::<&str>)?;
    for item in [&last, &open, &quit] {
        menu.append(item)?;
    }
    let tray = TrayIconBuilder::new()
        .icon(tauri::image::Image::from_bytes(include_bytes!(
            "../icons/icon.png"
        ))?)
        .menu(&menu)
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

    let events = app.handle().clone();
    thread::spawn(move || {
        let mut previous = None;
        loop {
            thread::sleep(Duration::from_secs(1));
            let Ok(s) = core.snapshot() else { continue };
            let stamp = (
                s.revision,
                s.readings.iter().map(|r| r.status).collect::<Vec<_>>(),
            );
            if previous.as_ref() == Some(&stamp) {
                continue;
            }
            previous = Some(stamp);
            let _ = events.emit_to("main", "market-changed", s.revision);
            render(&s, &items, &last, &open, &quit, &tray);
        }
    });
    Ok(())
}

fn render(
    s: &troy_core::monitor::Snapshot,
    items: &[(Instrument, MenuItem<Wry>)],
    last: &MenuItem<Wry>,
    open: &MenuItem<Wry>,
    quit: &MenuItem<Wry>,
    tray: &tauri::tray::TrayIcon,
) {
    let lang: Lang = s.lang;
    let t = text(lang);
    let _ = open.set_text(t.open);
    let _ = quit.set_text(t.quit);
    for (m, item) in items {
        let Some(r) = s.readings.iter().find(|r| r.market == *m) else {
            continue;
        };
        let price = r
            .quote
            .as_ref()
            .map(|q| format!("{:.2}", q.price))
            .unwrap_or_else(|| "—".into());
        let label = format!("{} {} · {}", market(*m, lang), price, r.status.label(lang));
        let _ = item.set_text(&label);
        if *m == s.pinned {
            let mut tip = label.clone();
            if let Some(q) = &r.quote {
                let (timestamp, kind) = q
                    .published
                    .map_or((q.observed, t.observed), |ts| (ts, t.quoted));
                if let Some(time) = chrono::DateTime::from_timestamp(timestamp, 0) {
                    tip = format!(
                        "{label} · {kind} {} {}",
                        time.with_timezone(&troy_core::market::beijing())
                            .format("%m-%d %H:%M:%S"),
                        t.beijing
                    );
                }
            }
            let _ = tray.set_tooltip(Some(&tip));
            #[cfg(target_os = "macos")]
            let _ = tray.set_title(Some(format!(
                "{} {}{}",
                market(*m, lang),
                price,
                if r.status == troy_core::monitor::Status::Live {
                    ""
                } else {
                    " ·"
                }
            )));
        }
    }
    let _ = last.set_text(match &s.last_alert {
        Some(a) => format!(
            "{} · {} {:.2}",
            t.last_alert,
            market(a.market, lang),
            a.price
        ),
        None => t.no_alert.into(),
    });
}
