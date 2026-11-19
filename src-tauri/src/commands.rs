//! IPC commands the window calls through `src/lib/api.ts`.
use tauri::{AppHandle, State};
use tauri_plugin_autostart::ManagerExt as _;
use troy_core::{
    market::{CalendarPeriod, Candle, DisplayMode, Instrument},
    monitor::{Monitor, Snapshot, Trend},
    storage::Settings,
};

type Res<T> = Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
pub fn snapshot(core: State<'_, Monitor>) -> Res<Snapshot> {
    core.snapshot().map_err(err)
}
#[tauri::command]
pub fn overview(core: State<'_, Monitor>) -> Res<Vec<Trend>> {
    core.overview().map_err(err)
}
#[tauri::command]
pub fn history(
    core: State<'_, Monitor>,
    market: Instrument,
    seconds: i64,
    mode: DisplayMode,
) -> Res<Vec<Candle>> {
    core.history(market, seconds, mode).map_err(err)
}
#[tauri::command]
pub fn calendar(
    core: State<'_, Monitor>,
    market: Instrument,
    period: CalendarPeriod,
) -> Res<Vec<Candle>> {
    core.calendar(market, period).map_err(err)
}
#[tauri::command]
pub fn pin(core: State<'_, Monitor>, market: Instrument) -> Res<()> {
    core.pin(market).map_err(err)
}
#[tauri::command]
pub fn set_limit(core: State<'_, Monitor>, market: Instrument, target: Option<f64>) -> Res<()> {
    core.set_limit(market, target).map_err(err)
}
#[tauri::command]
pub fn set_chart(core: State<'_, Monitor>, mode: DisplayMode, seconds: i64) -> Res<()> {
    core.set_chart(mode, seconds).map_err(err)
}
#[tauri::command]
pub fn settings(core: State<'_, Monitor>) -> Res<Settings> {
    core.settings().map_err(err)
}
#[tauri::command]
pub fn save_settings(core: State<'_, Monitor>, settings: Settings) -> Res<()> {
    core.save_settings(&settings).map_err(err)
}

#[tauri::command]
pub fn autostart(app: AppHandle) -> Res<bool> {
    app.autolaunch().is_enabled().map_err(err)
}
#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Res<()> {
    let launcher = app.autolaunch();
    if enabled {
        launcher.enable()
    } else {
        launcher.disable()
    }
    .map_err(err)
}
