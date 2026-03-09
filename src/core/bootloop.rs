use std::fs;
use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result};

use crate::core::config::Config;
use crate::paths;

const BOOTLOOP_THRESHOLD: u32 = 3;
const WIPE_DIRS: &[&str] = &[
    "system", "system_ext", "vendor", "product", "odm", "oem",
    "mi_ext", "my_bigball", "my_carrier", "my_company", "my_engineering",
    "my_heytap", "my_manifest", "my_preload", "my_product", "my_region",
    "my_reserve", "my_stock",
];

pub fn read_bootcount() -> i32 {
    let content = match fs::read_to_string(paths::BOOTCOUNT_PATH) {
        Ok(s) => s,
        Err(_) => return 0,
    };
    content
        .lines()
        .find_map(|l| l.strip_prefix("BOOTCOUNT="))
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(0)
}

pub fn write_bootcount(count: i32) -> Result<()> {
    let content = format!("BOOTCOUNT={count}\n");
    if let Some(parent) = Path::new(paths::BOOTCOUNT_PATH).parent() {
        fs::create_dir_all(parent).context("creating bootcount parent dir")?;
    }
    fs::write(paths::BOOTCOUNT_PATH, content).context("writing bootcount")
}

pub fn bootloop_init() -> Result<i32> {
    // Shell post-fs-data.sh already incremented — just read
    Ok(read_bootcount())
}

pub fn bootloop_check(module_dir: &Path) -> Result<()> {
    let count = read_bootcount();
    if count >= BOOTLOOP_THRESHOLD as i32 {
        tracing::error!(count, "bootloop threshold reached — triggering recovery");

        for dir in WIPE_DIRS {
            let p = module_dir.join(dir);
            if p.exists() {
                let _ = fs::remove_dir_all(&p);
            }
        }

        let _ = fs::File::create(module_dir.join("disable"));
        update_description_recovery(module_dir);
        write_bootcount(-1)?;
        if let Err(e) = Config::restore_backup() {
            tracing::warn!("config restore failed: {e}");
        }

        force_reboot();
    }
    Ok(())
}

pub fn bootloop_reset() -> Result<()> {
    write_bootcount(0)
}

fn update_description_recovery(module_dir: &Path) {
    let prop_path = module_dir.join("module.prop");
    if let Ok(contents) = fs::read_to_string(&prop_path) {
        let updated: String = contents
            .lines()
            .map(|line| {
                if line.starts_with("description=") {
                    "description=DISABLED: bootloop detected".to_string()
                } else {
                    line.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        let _ = fs::write(&prop_path, updated);
    }
}

pub fn force_reboot() -> ! {
    let _ = Command::new("/system/bin/svc")
        .args(["power", "reboot"])
        .status();
    let _ = fs::write("/proc/sysrq-trigger", "b");
    std::process::exit(1);
}
