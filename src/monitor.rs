use std::fs;
use std::path::Path;
use std::time::Duration;

use anyhow::Result;
use tracing::{error, info, warn};

use crate::core::config::Config;
use crate::core::detect::{detect_capabilities, detect_root_manager};
use crate::core::types::{DebloatModeKind, NukeEntry, RootManager, Status, SystemizeEntry};
use crate::debloat::{detect_best_mode, whiteout, DebloatMode};
use crate::paths;

const MAX_RESTARTS: u32 = 10;
const COOLDOWN_SECS: u64 = 60;

pub fn monitor_supervised() -> Result<()> {
    let cooldown = Duration::from_secs(COOLDOWN_SECS);

    for restart in 0..MAX_RESTARTS {
        let mod_dir = Path::new(paths::mod_dir());
        if mod_dir.join("disable").exists() || mod_dir.join("remove").exists() {
            return Ok(());
        }

        let config = Config::load(None)?;
        match monitor_start(&config, mod_dir, Path::new(paths::data_dir())) {
            Ok(()) => return Ok(()),
            Err(e) => {
                warn!(restart, "monitor crashed: {e}");
                if restart + 1 < MAX_RESTARTS {
                    std::thread::sleep(cooldown);
                }
            }
        }
    }

    error!("monitor exceeded {MAX_RESTARTS} restarts");
    Ok(())
}

fn monitor_start(config: &Config, mod_dir: &Path, data_dir: &Path) -> Result<()> {
    acquire_singleton(data_dir)?;

    let interval = config.monitor.interval.clamp(60, 3600);
    let caps = detect_capabilities(mod_dir);
    let mode = detect_best_mode(&caps, config);

    info!(interval, mode = ?mode.kind(), "monitor started");

    loop {
        if crate::utils::signal::shutdown_requested() {
            break;
        }
        if mod_dir.join("disable").exists() || mod_dir.join("remove").exists() {
            break;
        }

        std::thread::sleep(Duration::from_secs(interval as u64));

        let repairs = check_debloated_apps(data_dir, mod_dir, &mode);
        check_systemized_apps(data_dir);

        if repairs > 0 {
            let _ = update_repair_count(data_dir, repairs);
            if mode.kind() != DebloatModeKind::Pm {
                let _ = whiteout::fix_vendor_symlinks(mod_dir);
            }
        }

        let root_mgr = detect_root_manager().unwrap_or(RootManager::Magisk);
        let _ = crate::description::update_description(mod_dir, root_mgr);
    }

    info!("monitor shutting down");
    let _ = fs::remove_file(data_dir.join("monitor.pid"));
    Ok(())
}

fn check_debloated_apps(data_dir: &Path, mod_dir: &Path, mode: &DebloatMode) -> u32 {
    let nuke_list = load_nuke_list(data_dir).unwrap_or_default();
    let mut repairs = 0u32;

    for entry in &nuke_list {
        match mode.verify(&entry.package_name, Path::new(&entry.app_path), mod_dir) {
            Ok(true) => {}
            _ => {
                warn!(pkg = %entry.package_name, "debloat broken, repairing");
                if mode
                    .debloat(&entry.package_name, Path::new(&entry.app_path), mod_dir)
                    .is_ok()
                {
                    repairs += 1;
                }
            }
        }
    }
    repairs
}

fn check_systemized_apps(data_dir: &Path) -> u32 {
    let list = load_systemize_list(data_dir).unwrap_or_default();
    let mut broken = 0u32;

    for entry in &list {
        if entry.pending_demote {
            continue;
        }
        let sys_path = Path::new(&entry.system_path);
        if !sys_path.exists() {
            warn!(pkg = %entry.package_name, "systemized app missing");
            broken += 1;
        }
    }
    broken
}

fn update_repair_count(_data_dir: &Path, repairs: u32) -> Result<()> {
    let mut status = Status::load().unwrap_or_default();
    let prev = status.monitor_repairs.unwrap_or(0);
    status.monitor_repairs = Some(prev + repairs);

    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    status.last_monitor = Some(format!("{secs}"));
    status.save()
}

fn acquire_singleton(data_dir: &Path) -> Result<()> {
    let pid_path = data_dir.join("monitor.pid");

    if let Ok(content) = fs::read_to_string(&pid_path) {
        if let Ok(pid) = content.trim().parse::<i32>() {
            if crate::utils::process::is_pid_alive(pid) {
                anyhow::bail!("monitor already running (PID {pid})");
            }
        }
    }

    crate::utils::process::write_pid_file(&pid_path)?;

    let lock_path = data_dir.join("monitor.lock");
    let _lock = crate::utils::fs::acquire_flock(&lock_path)?;
    std::mem::forget(_lock); // Hold the lock for the process lifetime

    Ok(())
}

fn load_nuke_list(data_dir: &Path) -> Result<Vec<NukeEntry>> {
    let path = data_dir.join("nuke_list.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&data)?)
}

fn load_systemize_list(data_dir: &Path) -> Result<Vec<SystemizeEntry>> {
    let path = data_dir.join("systemize_list.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&data)?)
}
