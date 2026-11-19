#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]
mod commands;
mod migrate;
mod text;
mod tray;

use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_notification::NotificationExt;
use troy_core::{feeds::Feeds, monitor::Monitor, storage::Store};

/// Passed by the login item so Troy starts in the menu bar / tray only.
const HIDDEN_ARG: &str = "--hidden";

#[cfg(target_os = "macos")]
extern "C" {
    fn install_troy_quit_handler() -> bool;
}

pub fn show(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn open_store(app: &tauri::App) -> Result<Store, Box<dyn std::error::Error>> {
    let override_dir = std::env::var_os("TROY_DATA_DIR").map(PathBuf::from);
    let base = app.path().app_data_dir()?;
    let dir = override_dir.clone().unwrap_or_else(|| base.join("v2"));
    std::fs::create_dir_all(&dir)?;
    let legacy = migrate::legacy_base(&base).filter(|_| override_dir.is_none());
    if let Some(legacy) = &legacy {
        if migrate::adopt_v2(legacy, &dir)? {
            eprintln!("adopted data from {}", legacy.display());
        }
    }
    #[allow(unused_mut)]
    let mut store = Store::open(&dir.join("quotes.sqlite3"))?;
    #[cfg(target_os = "macos")]
    if let Some(legacy) = &legacy {
        migrate::import_swift(&mut store, legacy)?;
    }
    Ok(store)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![HIDDEN_ARG]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::snapshot,
            commands::overview,
            commands::history,
            commands::calendar,
            commands::pin,
            commands::set_limit,
            commands::set_chart,
            commands::settings,
            commands::save_settings,
            commands::autostart,
            commands::set_autostart,
            commands::check_update,
            commands::install_update,
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
            let core = Monitor::new(open_store(app)?)?;
            tray::install(app, core.clone())?;
            app.manage(core.clone());

            let handle = app.handle().clone();
            let notifier = core.clone();
            app.manage(core.start(Feeds::new()?, move |alert| {
                let lang = notifier.snapshot().map(|s| s.lang).unwrap_or_default();
                let t = text::text(lang);
                let body = format!(
                    "{} {:.2} · {} {:.2}",
                    text::market(alert.market, lang),
                    alert.price,
                    t.target,
                    alert.target
                );
                if let Err(e) = handle
                    .notification()
                    .builder()
                    .title(t.alert_title)
                    .body(body)
                    .show()
                {
                    eprintln!("{e}");
                    if let Some(w) = handle.get_webview_window("main") {
                        let _ =
                            w.request_user_attention(Some(tauri::UserAttentionType::Informational));
                    }
                }
            }));

            let hidden = std::env::args().any(|a| a == HIDDEN_ARG);
            #[cfg(target_os = "macos")]
            if hidden {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
            if !hidden {
                show(app.handle());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Troy 桌面宿主启动失败");
}
