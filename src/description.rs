use std::fs;
use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result};

use crate::core::types::RootManager;
use crate::paths;

pub fn update_description(module_dir: &Path, root_mgr: RootManager) -> Result<()> {
    let nuked = count_json_list(paths::NUKE_LIST_PATH);
    let promoted = count_json_list(paths::SYSTEMIZE_LIST_PATH);
    let mode = load_mode_string();
    let repairs = load_repairs();

    let desc = build_desc(nuked, promoted, repairs, &mode);
    write_module_prop_description(module_dir, &desc)?;

    if root_mgr == RootManager::Ksu || root_mgr == RootManager::Apatch {
        let _ = Command::new("ksud")
            .env("KSU_MODULE", "scalpel")
            .args(["module", "config", "set", "override.description", &desc])
            .output();
    }
    Ok(())
}

fn write_module_prop_description(module_dir: &Path, desc: &str) -> Result<()> {
    let prop_path = module_dir.join("module.prop");
    let contents = fs::read_to_string(&prop_path).context("reading module.prop")?;
    let updated: String = contents
        .lines()
        .map(|line| {
            if line.starts_with("description=") {
                format!("description={desc}")
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    crate::utils::fs::atomic_write(&prop_path, &updated)?;
    Ok(())
}

fn count_json_list(path: &str) -> usize {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<serde_json::Value>>(&s).ok())
        .map(|v| v.len())
        .unwrap_or(0)
}

fn load_mode_string() -> String {
    fs::read_to_string(paths::STATUS_PATH)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("mode")?.as_str().map(String::from))
        .unwrap_or_else(|| "auto".to_string())
}

fn load_repairs() -> u32 {
    fs::read_to_string(paths::STATUS_PATH)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("monitor_repairs")?.as_u64())
        .unwrap_or(0) as u32
}

fn build_desc(nuked: usize, promoted: usize, repairs: u32, mode: &str) -> String {
    if repairs > 0 {
        let mut d = format!("⚠️ {repairs} repairs");
        if nuked > 0 { d += &format!(" | {nuked} Debloated"); }
        if promoted > 0 { d += &format!(" | {promoted} Systemized"); }
        if mode != "none" { d += &format!(" | {mode}"); }
        return d;
    }

    if nuked > 0 || promoted > 0 {
        let mut d = "⚕️ Active".to_string();
        if nuked > 0 { d += &format!(" | {nuked} Debloated"); }
        if promoted > 0 { d += &format!(" | {promoted} Systemized"); }
        if mode != "none" { d += &format!(" | {mode}"); }
        return d;
    }

    "😴 Idle — Ready to operate".to_string()
}
