//! One-time moves of earlier data into the current data directory.
use std::path::{Path, PathBuf};
use troy_core::storage::Store;

/// Identifier used by Troy 1.x (Swift) and Troy 2.0.x. Data under it is adopted once.
pub const LEGACY_ID: &str = "local.goldmonitor.desktop";

/// `<app data parent>/local.goldmonitor.desktop`, a sibling of the current data directory.
pub fn legacy_base(base: &Path) -> Option<PathBuf> {
    Some(base.parent()?.join(LEGACY_ID))
}

/// Brings a 2.0.x database across when the identifier changed. Returns whether it copied.
pub fn adopt_v2(legacy: &Path, dir: &Path) -> Result<bool, Box<dyn std::error::Error>> {
    Ok(Store::adopt(
        &legacy.join("v2").join("quotes.sqlite3"),
        &dir.join("quotes.sqlite3"),
    )?)
}

/// Imports the Swift 1.x database and preferences on first launch on a Mac.
#[cfg(target_os = "macos")]
pub fn import_swift(store: &mut Store, legacy: &Path) -> Result<(), Box<dyn std::error::Error>> {
    if store.preference("swiftImported")?.is_some() {
        return Ok(());
    }
    let defaults = std::process::Command::new("/usr/bin/defaults")
        .args(["export", LEGACY_ID, "-"])
        .output()?;
    let prefs = if defaults.status.success() {
        plist::from_bytes::<serde_json::Value>(&defaults.stdout)?
    } else {
        serde_json::Value::Null
    };
    store.import_swift(&legacy.join("quotes.sqlite3"), &prefs)?;
    Ok(())
}
