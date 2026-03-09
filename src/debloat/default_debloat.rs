use std::path::Path;

use anyhow::Result;
use tracing::info;

use crate::core::types::NukeEntry;
use crate::paths;

const DEFAULT_NUKE: &[(&str, &str)] = &[
    ("FM Radio", "com.miui.fm"),
    ("FM Radio Service", "com.miui.fmservice"),
    ("YouTube Music", "com.google.android.apps.youtube.music"),
    ("Music", "com.miui.player"),
    ("Meet", "com.google.android.apps.tachyon"),
    ("Google TV", "com.google.android.videos"),
    ("Google One", "com.google.android.apps.subscriptions.red"),
    ("Game Center", "com.xiaomi.glgm"),
    ("Mi Browser", "com.mi.globalbrowser"),
];

pub fn apply_default_debloat(_data_dir: &Path) -> Result<Vec<NukeEntry>> {
    let mut entries = Vec::new();

    for &(label, pkg) in DEFAULT_NUKE {
        let path = match resolve_app_path(pkg) {
            Some(p) => p,
            None => continue,
        };
        entries.push(NukeEntry {
            app_name: label.to_string(),
            package_name: pkg.to_string(),
            app_path: path,
        });
    }

    if entries.is_empty() {
        info!("no default debloat apps found on device");
        return Ok(entries);
    }

    let nuke_path = Path::new(paths::NUKE_LIST_PATH);
    let json = serde_json::to_string_pretty(&entries)?;
    crate::utils::fs::atomic_write(nuke_path, &json)?;

    info!(count = entries.len(), "default debloat list created");
    Ok(entries)
}

fn resolve_app_path(pkg: &str) -> Option<String> {
    let output = crate::utils::cmd::run_pm(&["path", pkg]).ok()?;
    output
        .lines()
        .next()
        .and_then(|l| l.strip_prefix("package:"))
        .map(|s| s.trim().to_string())
}
