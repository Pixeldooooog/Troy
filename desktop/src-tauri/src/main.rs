#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]
use std::{path::PathBuf, thread, time::Duration};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State,
};
use troy_core::{
    feeds::Feeds,
    market::{CalendarPeriod, Candle, DisplayMode, Instrument},
    monitor::{Monitor, Snapshot},
    storage::Store,
};

#[tauri::command]
fn snapshot(core: State<'_, Monitor>) -> Result<Snapshot, String> {
    core.snapshot().map_err(|e| e.to_string())
}
#[tauri::command]
fn pin(core: State<'_, Monitor>, market: Instrument) -> Result<(), String> {
    core.pin(market).map_err(|e| e.to_string())
}
#[tauri::command]
fn set_limit(
    core: State<'_, Monitor>,
    market: Instrument,
    target: Option<f64>,
) -> Result<(), String> {
    core.set_limit(market, target).map_err(|e| e.to_string())
}
#[tauri::command]
fn set_chart(core: State<'_, Monitor>, mode: DisplayMode, seconds: i64) -> Result<(), String> {
    core.set_chart(mode, seconds).map_err(|e| e.to_string())
}
#[tauri::command]
fn calendar(
    core: State<'_, Monitor>,
    market: Instrument,
    period: CalendarPeriod,
) -> Result<Vec<Candle>, String> {
    core.calendar(market, period).map_err(|e| e.to_string())
}
#[tauri::command]
fn history(
    core: State<'_, Monitor>,
    market: Instrument,
    seconds: i64,
    mode: DisplayMode,
) -> Result<Vec<Candle>, String> {
    core.history(market, seconds, mode)
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
extern "C" {
    fn install_troy_quit_handler() -> bool;
}
fn show(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
#[cfg(target_os = "macos")]
fn migrate(store: &mut Store, dir: &std::path::Path) -> Result<(), Box<dyn std::error::Error>> {
    if store.preference("swiftImported")?.is_some() {
        return Ok(());
    }
    let defaults = std::process::Command::new("/usr/bin/defaults")
        .args(["export", "local.goldmonitor.desktop", "-"])
        .output()?;
    let prefs = if defaults.status.success() {
        plist::from_bytes::<serde_json::Value>(&defaults.stdout)?
    } else {
        serde_json::Value::Null
    };
    store.import_swift(&dir.join("quotes.sqlite3"), &prefs)?;
    Ok(())
}
fn main() {
    let builder =
        tauri::Builder::default().plugin(tauri_plugin_single_instance::init(|app, _, _| show(app)));
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_plugin_notification::init());
    builder
        .invoke_handler(tauri::generate_handler![
            snapshot, pin, set_limit, set_chart, history, calendar
        ])
        .on_window_event(|w, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = w.hide();
                #[cfg(target_os = "macos")]
                let _ = w
                    .app_handle()
                    .set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            // Tauri runs setup on the AppKit main thread after installing its delegate.
            if !unsafe { install_troy_quit_handler() } {
                return Err("无法配置 macOS 菜单栏驻留".into());
            }
            let override_dir = std::env::var_os("TROY_DATA_DIR").map(PathBuf::from);
            let base = app.path().app_data_dir()?;
            let dir = override_dir.clone().unwrap_or_else(|| base.join("v2"));
            std::fs::create_dir_all(&dir)?;
            #[allow(unused_mut)]
            let mut store = Store::open(&dir.join("quotes.sqlite3"))?;
            #[cfg(target_os = "macos")]
            if override_dir.is_none() {
                migrate(&mut store, &base)?;
            }
            let core = Monitor::new(store)?;
            let menu = Menu::new(app)?;
            let mut items = vec![];
            for m in Instrument::ALL.into_iter().filter(|m| *m != Instrument::Fx) {
                let item = MenuItem::with_id(app, m.id(), m.name(), true, None::<&str>)?;
                menu.append(&item)?;
                items.push((m, item));
            }
            let last = MenuItem::with_id(app, "last", "尚无到价记录", false, None::<&str>)?;
            menu.append(&last)?;
            for (id, title) in [("open", "打开 Troy"), ("exit", "退出 Troy")] {
                menu.append(&MenuItem::with_id(app, id, title, true, None::<&str>)?)?;
            }
            let tray = TrayIconBuilder::new()
                .icon(tauri::image::Image::from_bytes(include_bytes!(
                    "../icons/icon.png"
                ))?)
                .menu(&menu)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "open" => show(app),
                    "exit" => app.exit(0),
                    id => {
                        if let Some(m) = Instrument::ALL.into_iter().find(|m| m.id() == id) {
                            if let Err(e) = app.state::<Monitor>().pin(m) {
                                eprintln!("{e}")
                            }
                        }
                    }
                })
                .build(app)?;
            app.manage(core.clone());
            #[cfg(target_os = "macos")]
            let handle = app.handle().clone();
            app.manage(core.start(Feeds::new()?, move |alert| {
                #[cfg(target_os = "macos")]
                {
                    use tauri_plugin_notification::NotificationExt;
                    let body = format!(
                        "{} {:.2}，目标价 {:.2}",
                        alert.market.name(),
                        alert.price,
                        alert.target
                    );
                    if let Err(e) = handle
                        .notification()
                        .builder()
                        .title("Troy · 到价提醒")
                        .body(body)
                        .show()
                    {
                        eprintln!("{e}");
                        let _ = handle.get_webview_window("main").map(|w| {
                            w.request_user_attention(Some(tauri::UserAttentionType::Informational))
                        });
                    }
                }
                #[cfg(not(target_os = "macos"))]
                let _ = alert;
            }));
            let events = app.handle().clone();
            let mut previous = None;
            thread::spawn(move || loop {
                if let Ok(s) = core.snapshot() {
                    let stamp = (
                        s.revision,
                        s.readings.iter().map(|r| r.status).collect::<Vec<_>>(),
                    );
                    if previous.as_ref() == Some(&stamp) {
                        thread::sleep(Duration::from_secs(1));
                        continue;
                    }
                    previous = Some(stamp);
                    let _ = events.emit_to("main", "market-changed", s.revision);
                    for (m, item) in &items {
                        if let Some(r) = s.readings.iter().find(|r| r.market == *m) {
                            let price = r
                                .quote
                                .as_ref()
                                .map(|q| format!("{:.2}", q.price))
                                .unwrap_or_else(|| "—".into());
                            let label = format!("{} {} · {}", m.name(), price, r.status);
                            let _ = item.set_text(&label);
                            if *m == s.pinned {
                                let _ = tray.set_tooltip(Some(&label));
                                #[cfg(target_os = "macos")]
                                let _ = tray.set_title(Some(format!(
                                    "{} {}{}",
                                    m.name(),
                                    price,
                                    if r.status == "有效" { "" } else { " ·" }
                                )));
                            }
                        }
                    }
                    if let Some(a) = s.last_alert {
                        let _ =
                            last.set_text(format!("最近提醒 · {} {:.2}", a.market.name(), a.price));
                    }
                }
                thread::sleep(Duration::from_secs(1));
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Troy 桌面宿主启动失败");
}
