use std::fs;
use std::path::Path;

use anyhow::{Context, Result};
use tracing::{debug, info, warn};

use crate::core::bootloop;
use crate::core::config::Config;
use crate::core::detect::{detect_capabilities, detect_root_manager};
use crate::core::types::{NukeEntry, RootManager, Status, SystemizeEntry};
use crate::debloat::detect_best_mode;
use crate::systemize::demote;
use crate::utils::cmd::run_pm;

pub fn post_boot_run(mod_dir: &Path, data_dir: &Path) -> Result<()> {
    let gate = data_dir.join("boot_completed_handled");
    match fs::create_dir(&gate) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            debug!("post_boot already ran this boot cycle");
            return Ok(());
        }
        Err(e) => return Err(e).context("creating post_boot gate"),
    }

    info!("post-boot sequence starting");

    let config = Config::load(None)?;
    bootloop::bootloop_reset()?;
    finish_deferred_debloat(data_dir)?;
    remove_system_updates(data_dir)?;
    uninstall_fallback(&config, data_dir)?;
    restore_app_states(data_dir)?;
    verify_debloat(data_dir, mod_dir)?;
    verify_systemized_apps(data_dir, mod_dir)?;
    demote::process_pending_demotions(mod_dir)?;

    let _ = fs::remove_file(data_dir.join("monitor.pid"));

    let root_mgr = detect_root_manager().unwrap_or(RootManager::Magisk);
    let _ = crate::description::update_description(mod_dir, root_mgr);

    info!("post-boot sequence complete");
    Ok(())
}

fn finish_deferred_debloat(data_dir: &Path) -> Result<()> {
    let nuke_path = data_dir.join("nuke_list.json");
    if !nuke_path.exists() {
        return Ok(());
    }

    let status = Status::load().unwrap_or_default();
    if status.debloated > 0 {
        return Ok(());
    }

    let entries = load_nuke_list(&nuke_path)?;
    if entries.is_empty() {
        return Ok(());
    }

    info!(count = entries.len(), "finishing deferred debloat");
    crate::debloat::nuke::nuke_run(None)?;
    Ok(())
}

fn remove_system_updates(data_dir: &Path) -> Result<()> {
    let nuke_list = load_nuke_list_from_data(data_dir)?;
    if nuke_list.is_empty() {
        return Ok(());
    }

    let updatable = run_pm(&["list", "packages", "-u"]).unwrap_or_default();

    for entry in &nuke_list {
        if !updatable.lines().any(|l| l.trim_start_matches("package:") == entry.package_name) {
            continue;
        }
        if has_data_app_copy(&entry.package_name) {
            debug!(pkg = %entry.package_name, "skipping system update removal: user has /data/app copy");
            continue;
        }
        if run_pm(&["uninstall", "-k", "--user", "0", &entry.package_name]).is_ok() {
            debug!(pkg = %entry.package_name, "removed system update");
        }
    }
    Ok(())
}

fn uninstall_fallback(config: &Config, data_dir: &Path) -> Result<()> {
    if !config.debloat.uninstall_fallback {
        return Ok(());
    }

    let nuke_list = load_nuke_list_from_data(data_dir)?;
    if nuke_list.is_empty() {
        return Ok(());
    }

    let done_path = data_dir.join("uninstall_fallback_done.json");
    let raw_done: std::collections::HashSet<String> = if done_path.exists() {
        fs::read_to_string(&done_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        std::collections::HashSet::new()
    };

    // Prune stale entries (restored-then-re-nuked apps)
    let nuke_pkgs: std::collections::HashSet<&str> =
        nuke_list.iter().map(|e| e.package_name.as_str()).collect();
    let done: std::collections::HashSet<String> = raw_done
        .into_iter()
        .filter(|pkg| nuke_pkgs.contains(pkg.as_str()))
        .collect();

    let mut updated = done.clone();

    for entry in &nuke_list {
        if done.contains(&entry.package_name) {
            continue;
        }
        if has_data_app_copy(&entry.package_name) {
            debug!(pkg = %entry.package_name, "skipping uninstall fallback: user has /data/app copy");
            continue;
        }
        match run_pm(&["uninstall", "-k", "--user", "0", &entry.package_name]) {
            Ok(_) => debug!(pkg = %entry.package_name, "uninstall fallback ok"),
            Err(_) => {}
        }
        updated.insert(entry.package_name.clone());
    }

    if updated != done {
        if let Ok(json) = serde_json::to_string(&updated) {
            let _ = crate::utils::fs::atomic_write(&done_path, &json);
        }
    }
    Ok(())
}

fn has_data_app_copy(pkg: &str) -> bool {
    run_pm(&["path", pkg])
        .unwrap_or_default()
        .lines()
        .any(|l| {
            l.trim()
                .strip_prefix("package:")
                .map(|p| p.starts_with("/data/app/"))
                .unwrap_or(false)
        })
}

fn restore_app_states(data_dir: &Path) -> Result<()> {
    let nuke_list = load_nuke_list_from_data(data_dir)?;
    if nuke_list.is_empty() {
        return Ok(());
    }

    // Android Rescue Party re-enables disabled apps during bootloop recovery
    let disabled_output = run_pm(&["list", "packages", "-d"]).unwrap_or_default();
    let enabled_output = run_pm(&["list", "packages", "-e"]).unwrap_or_default();

    for entry in &nuke_list {
        let needle = format!("package:{}", entry.package_name);
        if !disabled_output.lines().any(|l| l.trim() == needle)
            && enabled_output.lines().any(|l| l.trim() == needle)
        {
            let _ = run_pm(&["disable-user", "--user", "0", &entry.package_name]);
            debug!(pkg = %entry.package_name, "re-disabled after rescue party");
        }
    }
    Ok(())
}

fn verify_debloat(data_dir: &Path, mod_dir: &Path) -> Result<()> {
    let nuke_list = load_nuke_list_from_data(data_dir)?;
    if nuke_list.is_empty() {
        return Ok(());
    }

    let config = Config::load(None)?;
    let caps = detect_capabilities(mod_dir);
    let mode = detect_best_mode(&caps, &config);

    let mut verified = 0u32;
    let mut broken = 0u32;

    for entry in &nuke_list {
        let stored = Path::new(&entry.app_path);
        let resolved = fs::canonicalize(stored).unwrap_or_else(|_| stored.to_path_buf());
        match mode.verify(&entry.package_name, &resolved, mod_dir) {
            Ok(true) => verified += 1,
            _ => {
                warn!(pkg = %entry.package_name, "debloat broken, repairing");
                if mode.debloat(&entry.package_name, &resolved, mod_dir).is_ok() {
                    verified += 1;
                } else {
                    broken += 1;
                }
            }
        }
    }

    let mut status = Status::load().unwrap_or_default();
    status.debloat_verified = Some(verified);
    status.debloat_broken = Some(broken);
    status.save()?;

    info!(verified, broken, "debloat verification complete");
    Ok(())
}

fn verify_systemized_apps(data_dir: &Path, _mod_dir: &Path) -> Result<()> {
    let list_path = data_dir.join("systemize_list.json");
    if !list_path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&list_path).context("reading systemize_list.json")?;
    let mut entries: Vec<SystemizeEntry> =
        serde_json::from_str(&content).unwrap_or_default();

    if entries.is_empty() {
        return Ok(());
    }

    let sys_pkgs = run_pm(&["list", "packages", "-s"]).unwrap_or_default();
    let mut verified = 0u32;
    let mut pending = 0u32;
    let mut uninstalled = 0u32;

    for entry in &mut entries {
        let needle = format!("package:{}", entry.package_name);
        if sys_pkgs.lines().any(|l| l.trim() == needle) {
            verified += 1;
            if entry.needs_uninstall {
                match run_pm(&["uninstall", "-k", "--user", "0", &entry.package_name]) {
                    Ok(_) => {
                        info!(pkg = %entry.package_name, "deferred uninstall completed");
                        entry.needs_uninstall = false;
                        uninstalled += 1;
                    }
                    Err(e) => {
                        warn!(pkg = %entry.package_name, err = %e, "deferred uninstall failed");
                    }
                }
            }
        } else {
            pending += 1;
            warn!(pkg = %entry.package_name, "not yet system (reboot may be needed)");
        }
    }

    if uninstalled > 0 {
        let json = serde_json::to_string_pretty(&entries)?;
        crate::utils::fs::atomic_write(&list_path, &json)?;
    }

    let mut status = Status::load().unwrap_or_default();
    status.systemize_verified = Some(verified);
    status.systemize_broken = Some(pending);
    status.save()?;

    info!(verified, pending, uninstalled, "systemize verification complete");
    Ok(())
}

fn load_nuke_list(path: &Path) -> Result<Vec<NukeEntry>> {
    let content = fs::read_to_string(path).context("reading nuke_list.json")?;
    Ok(serde_json::from_str(&content).unwrap_or_default())
}

fn load_nuke_list_from_data(data_dir: &Path) -> Result<Vec<NukeEntry>> {
    let path = data_dir.join("nuke_list.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    load_nuke_list(&path)
}
