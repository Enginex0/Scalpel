use std::ffi::CString;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{bail, Result};

use crate::core::types::{Capabilities, RootManager};
use crate::paths;

pub fn detect_root_manager() -> Result<RootManager> {
    if std::env::var("KSU").ok().as_deref() == Some("true") {
        return Ok(RootManager::Ksu);
    }
    if std::env::var("APATCH").ok().as_deref() == Some("true") {
        return Ok(RootManager::Apatch);
    }

    if Path::new("/data/adb/ksu/").exists() {
        return Ok(RootManager::Ksu);
    }
    if Path::new("/data/adb/ap/").exists() {
        return Ok(RootManager::Apatch);
    }
    if Path::new("/data/adb/magisk/").exists() {
        return Ok(RootManager::Magisk);
    }
    bail!("no supported root manager detected")
}

pub fn detect_busybox() -> Option<PathBuf> {
    let paths = [
        "/data/adb/magisk/busybox",
        "/data/adb/ksu/bin/busybox",
        "/data/adb/ap/bin/busybox",
    ];
    paths.iter().find(|p| Path::new(p).exists()).map(PathBuf::from)
}

pub fn detect_aapt() -> Option<PathBuf> {
    let mod_dir = Path::new(paths::mod_dir());
    for abi in ["arm64-v8a", "armeabi-v7a"] {
        let p = mod_dir.join(format!("bin/{abi}/aapt"));
        if p.exists() {
            return Some(p);
        }
    }

    let fallbacks = [
        "/system/bin/aapt",
        "/system/bin/aapt2",
        "/system/xbin/aapt",
    ];
    fallbacks
        .iter()
        .find(|p| Path::new(p).exists())
        .map(PathBuf::from)
}

pub fn detect_metamodule() -> Option<(String, String)> {
    let modules = Path::new(paths::MODULES_DIR);
    for entry in fs::read_dir(modules).ok()?.flatten() {
        let prop_path = entry.path().join("module.prop");
        let Ok(contents) = fs::read_to_string(&prop_path) else { continue };
        let is_meta = contents.lines().any(|l| {
            let t = l.trim();
            t == "metamodule=1" || t == "metamodule=true"
        });
        if !is_meta {
            continue;
        }
        let id = entry.file_name().to_string_lossy().to_string();
        let name = contents
            .lines()
            .find_map(|l| l.strip_prefix("name="))
            .unwrap_or(&id)
            .to_string();
        return Some((id, name));
    }
    None
}

pub fn can_create_whiteouts(module_dir: &Path) -> bool {
    let probe_dir = module_dir.join(".whiteout_probe");
    let _ = fs::create_dir_all(&probe_dir);
    let probe = probe_dir.join("test");
    let c_path = match CString::new(probe.to_string_lossy().as_bytes()) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let ret = unsafe { libc::mknod(c_path.as_ptr(), libc::S_IFCHR | 0o644, 0) };
    let _ = fs::remove_file(&probe);
    let _ = fs::remove_dir(&probe_dir);
    ret == 0
}

pub fn detect_zeromount() -> Option<PathBuf> {
    if !Path::new("/dev/zeromount").exists() {
        return None;
    }
    let paths = [
        "/data/adb/modules/zeromount/bin/zm",
        "/data/adb/ksu/bin/zm",
    ];
    paths.iter().find(|p| Path::new(p).exists()).map(PathBuf::from)
}

pub fn detect_magic_mount() -> bool {
    if std::env::var("KSU_MAGIC_MOUNT").ok().as_deref() == Some("true") {
        return true;
    }
    if let Ok(ver) = std::env::var("KSU_VER_CODE") {
        if ver.parse::<u32>().unwrap_or(0) >= 22098 {
            return true;
        }
    }
    if std::env::var("APATCH_BIND_MOUNT").ok().as_deref() == Some("true") {
        return true;
    }
    Path::new("/data/adb/magisk/").exists()
}

pub fn detect_capabilities(module_dir: &Path) -> Capabilities {
    let root_manager = detect_root_manager().unwrap_or(RootManager::Magisk);
    Capabilities {
        root_manager,
        busybox: detect_busybox(),
        aapt: detect_aapt(),
        can_whiteout: can_create_whiteouts(module_dir),
        has_zeromount: detect_zeromount().is_some(),
        has_metamodule: detect_metamodule().map(|(id, _)| id),
        magic_mount: detect_magic_mount(),
    }
}
