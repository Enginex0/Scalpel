use std::process::Command;

use anyhow::{bail, Result};

pub fn run_pm(args: &[&str]) -> Result<String> {
    let output = Command::new("pm").args(args).output()?;
    if !output.status.success() {
        bail!(
            "pm {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr)
        );
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn run_getprop(key: &str) -> Result<String> {
    let output = Command::new("getprop").arg(key).output()?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn boot_completed() -> bool {
    run_getprop("sys.boot_completed")
        .map(|v| v == "1")
        .unwrap_or(false)
}
