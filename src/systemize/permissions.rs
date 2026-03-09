use std::fs;
use std::path::Path;
use std::process::Command;

use anyhow::{bail, Result};

use crate::core::detect::detect_aapt;
use crate::utils::cmd::run_getprop;
use crate::utils::fs::{atomic_write, set_file_perms};
use crate::utils::selinux::{set_selinux_context};

pub fn generate_permissions(package: &str, apk_dir: &Path, module_dir: &Path) -> Result<()> {
    let etc_dir = module_dir.join("system/etc");
    let xml_dir = etc_dir.join("permissions");
    fs::create_dir_all(&xml_dir)?;
    set_file_perms(&etc_dir, 0o755)?;
    set_file_perms(&xml_dir, 0o755)?;
    set_selinux_context(&etc_dir, "u:object_r:system_file:s0");
    set_selinux_context(&xml_dir, "u:object_r:system_file:s0");

    let apk = find_base_apk(apk_dir)?;
    let perms = extract_permissions(&apk, package)?;

    if perms.is_empty() {
        let enforce = run_getprop("ro.control_privapp_permissions")?;
        if enforce.trim() == "enforce" {
            bail!("zero permissions extracted and enforce mode active — would crash PMS");
        }
    }

    let xml_path = xml_dir.join(format!("privapp-permissions-{package}.xml"));
    write_xml(package, &perms, &xml_path)?;
    set_file_perms(&xml_path, 0o644)?;
    set_selinux_context(&xml_path, "u:object_r:system_file:s0");

    Ok(())
}

pub fn remove_permissions(package: &str, module_dir: &Path) -> Result<()> {
    let xml_path = module_dir
        .join("system/etc/permissions")
        .join(format!("privapp-permissions-{package}.xml"));
    if xml_path.exists() {
        fs::remove_file(&xml_path)?;
    }
    Ok(())
}

fn find_base_apk(dir: &Path) -> Result<std::path::PathBuf> {
    let base = dir.join("base.apk");
    if base.exists() {
        return Ok(base);
    }
    for entry in fs::read_dir(dir)?.flatten() {
        let name = entry.file_name();
        if name.to_string_lossy().ends_with(".apk") {
            return Ok(entry.path());
        }
    }
    bail!("no APK found in {}", dir.display())
}

fn extract_permissions(apk: &Path, package: &str) -> Result<Vec<String>> {
    if let Some(aapt) = detect_aapt() {
        let output = Command::new(&aapt)
            .args(["dump", "permissions", &apk.to_string_lossy()])
            .output()?;
        let perms = parse_aapt_permissions(&String::from_utf8_lossy(&output.stdout));
        if !perms.is_empty() {
            return Ok(perms);
        }
    }
    let output = Command::new("dumpsys")
        .args(["package", package])
        .output()?;
    Ok(parse_dumpsys_permissions(&String::from_utf8_lossy(
        &output.stdout,
    )))
}

fn parse_aapt_permissions(output: &str) -> Vec<String> {
    output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if !line.starts_with("uses-permission") {
                return None;
            }
            let start = line.find("name='")?;
            let rest = &line[start + 6..];
            let end = rest.find('\'')?;
            Some(rest[..end].to_string())
        })
        .collect()
}

fn parse_dumpsys_permissions(output: &str) -> Vec<String> {
    let mut perms = Vec::new();
    let mut in_requested = false;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("requested permissions:") {
            in_requested = true;
            continue;
        }
        if in_requested {
            if trimmed.is_empty() || (!trimmed.contains('.') && !trimmed.starts_with("android")) {
                in_requested = false;
                continue;
            }
            let perm = trimmed.trim_end_matches(':');
            if perm.contains('.') {
                perms.push(perm.to_string());
            }
        }
    }
    perms
}

fn write_xml(package: &str, permissions: &[String], path: &Path) -> Result<()> {
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<permissions>\n");
    xml.push_str(&format!(
        "  <privapp-permissions package=\"{package}\">\n"
    ));
    for perm in permissions {
        xml.push_str(&format!("    <permission name=\"{perm}\"/>\n"));
    }
    xml.push_str("  </privapp-permissions>\n</permissions>\n");
    atomic_write(path, &xml)
}
