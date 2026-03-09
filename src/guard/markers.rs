use std::fs::{self, OpenOptions};

use anyhow::Result;

use crate::paths::GUARD_DIR;

pub fn record_marker(prefix: &str, threshold: u32) -> Result<()> {
    fs::create_dir_all(GUARD_DIR)?;
    let count = count_markers(prefix);
    if count + 1 >= threshold {
        tracing::error!(prefix, count = count + 1, "guard threshold reached");
        super::recovery::execute();
    }
    let path = format!("{GUARD_DIR}/{prefix}_{}", count + 1);
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)?;
    Ok(())
}

pub fn clear_all() -> Result<()> {
    if let Ok(entries) = fs::read_dir(GUARD_DIR) {
        for entry in entries.flatten() {
            let _ = fs::remove_file(entry.path());
        }
    }
    Ok(())
}

pub fn count_markers(prefix: &str) -> u32 {
    let pat = format!("{prefix}_");
    fs::read_dir(GUARD_DIR)
        .ok()
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| e.file_name().to_string_lossy().starts_with(&pat))
                .count() as u32
        })
        .unwrap_or(0)
}
