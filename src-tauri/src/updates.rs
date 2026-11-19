use semver::Version;
use serde::Deserialize;
use std::time::Duration;

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
}

impl Release {
    fn newer_than(self, installed: &Version) -> Result<Option<String>, String> {
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

#[tauri::command]
pub async fn check_update(app: tauri::AppHandle) -> Result<Option<String>, String> {
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
    release.newer_than(version)
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
            };
            assert_eq!(release.newer_than(&installed).unwrap().as_deref(), expected);
        }
    }
}
