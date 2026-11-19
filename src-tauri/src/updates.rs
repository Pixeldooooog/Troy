use semver::Version;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri_plugin_updater::UpdaterExt;

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    body: Option<String>,
}

impl Release {
    fn newer_than(&self, installed: &Version) -> Result<Option<String>, String> {
        if self.draft || self.prerelease {
            return Ok(None);
        }
        let tag = self
            .tag_name
            .strip_prefix('v')
            .ok_or("Unexpected release tag")?;
        let version = Version::parse(tag).map_err(|e| e.to_string())?;
        Ok(
            (version.pre.is_empty() && version.cmp_precedence(installed).is_gt())
                .then(|| version.to_string()),
        )
    }
}

#[derive(Serialize)]
pub struct Update {
    version: String,
    notes: Option<String>,
    installable: bool,
}

#[tauri::command]
pub async fn check_update(app: tauri::AppHandle) -> Result<Option<Update>, String> {
    let version = &app.package_info().version;
    let release: Release = reqwest::Client::new()
        .get("https://api.github.com/repos/Pixeldooooog/Troy/releases/latest")
        .header("User-Agent", format!("Troy/{version}"))
        .header("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let Some(version) = release.newer_than(version)? else {
        return Ok(None);
    };
    // A public release can exist without a signed bundle for this platform.
    let installable = if app.config().identifier == crate::PRODUCT_ID {
        match app.updater() {
            Ok(updater) => updater
                .check()
                .await
                .ok()
                .flatten()
                .is_some_and(|u| u.version == version),
            Err(_) => false,
        }
    } else {
        false
    };
    Ok(Some(Update {
        version,
        notes: release.body,
        installable,
    }))
}

// Only a validated version reaches the OS browser. Installation remains user-initiated.
#[tauri::command]
pub fn open_update_page(version: String) -> Result<(), String> {
    let version = Version::parse(&version).map_err(|e| e.to_string())?;
    open::that_detached(format!(
        "https://github.com/Pixeldooooog/Troy/releases/tag/v{version}"
    ))
    .map_err(|e| e.to_string())
}

/// Install only the signed version the user selected, even if latest.json changed.
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle, version: String) -> Result<(), String> {
    if app.config().identifier != crate::PRODUCT_ID {
        return Err("Signed updates target the production app.".into());
    }
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .filter(|u| u.version == version)
        .ok_or_else(|| "This update changed. Check again.".to_string())?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    app.restart()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_newer_public_stable_releases() {
        let installed = Version::parse("2.9.0").unwrap();
        for (tag, draft, prerelease, expected) in [
            ("v2.10.0", false, false, Some("2.10.0")),
            ("v2.10.0", true, false, None),
            ("v2.10.0", false, true, None),
            ("v3.0.0-rc.1", false, false, None),
            ("v2.9.0", false, false, None),
            ("v2.9.0+123", false, false, None),
            ("v2.1.0", false, false, None),
        ] {
            let release = Release {
                tag_name: tag.into(),
                draft,
                prerelease,
                body: None,
            };
            assert_eq!(release.newer_than(&installed).unwrap().as_deref(), expected);
        }
    }
}
