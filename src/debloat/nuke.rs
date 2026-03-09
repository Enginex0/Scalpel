use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use tracing::{debug, error, info, warn};
use crate::utils::time as utime;

use crate::core::config::Config;
use crate::core::detect::detect_capabilities;
use crate::core::types::{NukeEntry, Status};
use crate::debloat::{detect_best_mode, whiteout, DebloatMode};
use crate::paths;
use crate::utils::cmd::boot_completed;
use crate::utils::fs::acquire_mkdir_lock;

pub struct NukeResult {
    pub ok: u32,
    pub failed: u32,
    pub mode: String,
}

struct LockGuard {
    path: std::path::PathBuf,
}

impl Drop for LockGuard {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

pub fn nuke_run(mode_override: Option<&str>) -> Result<NukeResult> {
    info!("starting debloat run");

    let data_dir = Path::new(paths::data_dir());
    let module_dir = Path::new(paths::mod_dir());
    let lock_dir = data_dir.join("nuke.lock.d");

    acquire_mkdir_lock(&lock_dir)?;
    let _guard = LockGuard { path: lock_dir };

    let nuke_path = Path::new(paths::NUKE_LIST_PATH);
    if !nuke_path.exists() {
        info!("no nuke list found, nothing to do");
        save_status("none", 0, 0, false)?;
        return Ok(NukeResult { ok: 0, failed: 0, mode: "none".into() });
    }

    let content = fs::read_to_string(nuke_path).context("reading nuke_list.json")?;
    let entries: Vec<NukeEntry> = serde_json::from_str(&content)
        .context("parsing nuke_list.json")?;

    if entries.is_empty() {
        info!("nuke list empty, nothing to do");
        save_status("none", 0, 0, false)?;
        return Ok(NukeResult { ok: 0, failed: 0, mode: "none".into() });
    }

    let mut config = Config::load(None)?;
    if let Some(ov) = mode_override {
        config.set("debloat.mode_override", ov)?;
    }
    if config.debloat.disable_only {
        config.set("debloat.mode_override", "pm")?;
    }

    let caps = detect_capabilities(module_dir);
    let mode = detect_best_mode(&caps, &config);
    let mode_name = format!("{:?}", mode.kind()).to_lowercase();

    info!(mode = %mode_name, apps = entries.len(), "debloat plan");

    if boot_completed() && !matches!(mode, DebloatMode::Pm) {
        debug!("pre-debloat: disabling packages via pm");
        for entry in &entries {
            let _ = crate::utils::cmd::run_pm(&[
                "disable-user", "--user", "0", &entry.package_name,
            ]);
        }
    }

    let mut ok: u32 = 0;
    let mut failed: u32 = 0;

    for entry in &entries {
        let app_path = Path::new(&entry.app_path);
        match mode.debloat(&entry.package_name, app_path, module_dir) {
            Ok(()) => {
                ok += 1;
                debug!(pkg = %entry.package_name, "debloated");
            }
            Err(e) => {
                failed += 1;
                error!(pkg = %entry.package_name, err = %e, "debloat failed");
            }
        }
    }

    if !matches!(mode, DebloatMode::Pm) {
        process_raw_whiteouts(&mode, module_dir)?;
        whiteout::fix_vendor_symlinks(module_dir)?;
    }

    if boot_completed() && !matches!(mode, DebloatMode::Pm) {
        reenable_collateral(&entries)?;
    }

    save_status(&mode_name, ok, failed, false)?;

    info!(mode = %mode_name, ok, failed, "debloat complete");

    Ok(NukeResult { ok, failed, mode: mode_name })
}

pub fn nuke_restore(package: &str, app_path: &str) -> Result<()> {
    let module_dir = Path::new(paths::mod_dir());
    let config = Config::load(None)?;
    let caps = detect_capabilities(module_dir);
    let mode = detect_best_mode(&caps, &config);

    mode.restore(package, Path::new(app_path), module_dir)?;

    let nuke_path = Path::new(paths::NUKE_LIST_PATH);
    if nuke_path.exists() {
        let content = fs::read_to_string(nuke_path)?;
        let mut entries: Vec<NukeEntry> = serde_json::from_str(&content)?;
        entries.retain(|e| e.package_name != package);
        let json = serde_json::to_string_pretty(&entries)?;
        crate::utils::fs::atomic_write(nuke_path, &json)?;
    }

    info!(pkg = %package, "restored");
    Ok(())
}

fn process_raw_whiteouts(mode: &DebloatMode, module_dir: &Path) -> Result<()> {
    let path = Path::new(paths::RAW_WHITEOUTS_PATH);
    if !path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(path)?;
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let valid = line.starts_with("/system/")
            || line.starts_with("/vendor/")
            || line.starts_with("/product/")
            || line.starts_with("/system_ext/")
            || line.starts_with("/oem/")
            || line.starts_with("/odm/");

        if !valid {
            warn!(path = %line, "raw: skipping invalid path");
            continue;
        }

        // whiteout_create targets the parent dir of the path it receives
        let wo_target = Path::new(line).join("_.apk");
        if let Err(e) = mode.debloat("", &wo_target, module_dir) {
            warn!(path = %line, err = %e, "raw whiteout failed");
        } else {
            debug!(path = %line, "raw hidden");
        }
    }
    Ok(())
}

fn reenable_collateral(nuke_entries: &[NukeEntry]) -> Result<()> {
    let app_list_path = Path::new(paths::APP_LIST_PATH);
    if !app_list_path.exists() {
        return Ok(());
    }

    let disabled_output = crate::utils::cmd::run_pm(&["list", "packages", "-d"])
        .unwrap_or_default();

    let app_content = fs::read_to_string(app_list_path)?;
    let app_list: Vec<crate::core::types::ScannedApp> = serde_json::from_str(&app_content)
        .unwrap_or_default();

    for app in &app_list {
        if nuke_entries.iter().any(|n| n.package_name == app.package_name) {
            continue;
        }
        let needle = format!("package:{}", app.package_name);
        if disabled_output.lines().any(|l| l.trim() == needle) {
            let _ = crate::utils::cmd::run_pm(&["enable", &app.package_name]);
            debug!(pkg = %app.package_name, "re-enabled");
        }
    }
    Ok(())
}

fn save_status(mode: &str, ok: u32, failed: u32, partial: bool) -> Result<()> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let mut status = Status::load().unwrap_or_default();
    status.mode = mode.to_string();
    status.debloated = ok;
    status.debloat_failed = failed;
    status.partial = partial;
    status.timestamp = Some(timestamp);
    status.last_nuke = Some(iso_timestamp());
    status.save()
}

fn iso_timestamp() -> String {
    utime::iso8601()
}
