use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};

use crate::core::config::Config;
use crate::core::types::{SystemizeEntry, SystemizeTarget};
use crate::paths;
use crate::systemize::permissions;
use crate::utils::cmd::run_pm;
use crate::utils::fs::{atomic_write, set_file_perms, set_permissions_recursive};
use crate::utils::selinux::{set_selinux_context, set_selinux_context_recursive};

pub fn promote_app(
    package: &str,
    target: SystemizeTarget,
    label: Option<&str>,
    module_dir: &Path,
) -> Result<()> {
    let pm_output = run_pm(&["path", package])?;
    let source_dir = parse_pm_path(&pm_output)?;

    if !source_dir.starts_with("/data/app/") {
        bail!(
            "only /data/app/ apps can be promoted, got: {}",
            source_dir.display()
        );
    }

    let sys_pkgs = run_pm(&["list", "packages", "-s"])?;
    if sys_pkgs.lines().any(|l| l.trim_start_matches("package:") == package) {
        bail!("{package} is already a system app");
    }

    let target_str = match target {
        SystemizeTarget::App => "app",
        SystemizeTarget::PrivApp => "priv-app",
    };
    let system_dir = module_dir.join("system");
    let target_parent = system_dir.join(target_str);
    let dest = target_parent.join(package);
    fs::create_dir_all(&dest)?;
    copy_apk_tree(&source_dir, &dest)?;

    let finalize = || -> Result<()> {
        set_file_perms(&system_dir, 0o755)?;
        set_file_perms(&target_parent, 0o755)?;
        set_selinux_context(&system_dir, "u:object_r:system_file:s0");
        set_selinux_context(&target_parent, "u:object_r:system_file:s0");

        set_permissions_recursive(&dest)?;
        set_selinux_context_recursive(&dest, "u:object_r:system_file:s0");
        if target == SystemizeTarget::PrivApp {
            permissions::generate_permissions(package, &dest, module_dir)?;
        }
        Ok(())
    };

    if let Err(e) = finalize() {
        let _ = fs::remove_dir_all(&dest);
        return Err(e);
    }

    let config = Config::load(None)?;
    let app_name = label.unwrap_or(package);
    let system_path = dest.join("base.apk").to_string_lossy().to_string();
    record_promotion(
        package,
        app_name,
        &source_dir.to_string_lossy(),
        &system_path,
        target,
        config.systemize.deferred_uninstall,
    )?;

    Ok(())
}

pub fn record_promotion(
    package: &str,
    app_name: &str,
    original_path: &str,
    system_path: &str,
    target: SystemizeTarget,
    needs_uninstall: bool,
) -> Result<()> {
    let mut list = load_systemize_list()?;
    list.retain(|e| e.package_name != package);
    list.push(SystemizeEntry {
        app_name: app_name.to_string(),
        package_name: package.to_string(),
        original_path: original_path.to_string(),
        system_path: system_path.to_string(),
        promoted_date: today_iso(),
        target,
        needs_uninstall,
        pending_demote: false,
    });
    save_systemize_list(&list)
}

pub fn list_promoted() -> Result<Vec<SystemizeEntry>> {
    let mut list = load_systemize_list()?;
    let pending = load_pending_demotions().unwrap_or_default();
    let pending_pkgs: HashSet<&str> = pending.iter().map(|p| p.package_name.as_str()).collect();
    for entry in &mut list {
        entry.pending_demote = pending_pkgs.contains(entry.package_name.as_str());
    }
    Ok(list)
}

fn copy_apk_tree(source: &Path, dest: &Path) -> Result<()> {
    for entry in fs::read_dir(source)?.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str.ends_with(".apk") {
            fs::copy(entry.path(), dest.join(&name))?;
        }
    }
    let lib_src = source.join("lib");
    if lib_src.exists() {
        copy_dir_recursive(&lib_src, &dest.join("lib"))?;
    }
    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

fn parse_pm_path(output: &str) -> Result<PathBuf> {
    let line = output
        .lines()
        .find(|l| l.starts_with("package:"))
        .context("pm path returned no package line")?;
    let apk_path = Path::new(line.trim_start_matches("package:"));
    apk_path
        .parent()
        .map(PathBuf::from)
        .context("could not determine parent directory from pm path")
}

fn today_iso() -> String {
    std::process::Command::new("date")
        .arg("+%Y-%m-%d")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

pub(crate) fn load_systemize_list() -> Result<Vec<SystemizeEntry>> {
    let path = Path::new(paths::SYSTEMIZE_LIST_PATH);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&data)?)
}

pub(crate) fn save_systemize_list(list: &[SystemizeEntry]) -> Result<()> {
    let json = serde_json::to_string_pretty(list)?;
    let path = Path::new(paths::SYSTEMIZE_LIST_PATH);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    atomic_write(path, &json)
}

pub(crate) fn load_pending_demotions() -> Result<Vec<crate::core::types::PendingDemote>> {
    let path = Path::new(paths::PENDING_DEMOTE_PATH);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&data)?)
}

pub(crate) fn save_pending_demotions(list: &[crate::core::types::PendingDemote]) -> Result<()> {
    let json = serde_json::to_string_pretty(list)?;
    let path = Path::new(paths::PENDING_DEMOTE_PATH);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    atomic_write(path, &json)
}
