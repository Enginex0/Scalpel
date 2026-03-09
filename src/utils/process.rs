use std::fs;
use std::path::Path;

use anyhow::Result;

pub fn write_pid_file(path: &Path) -> Result<()> {
    fs::write(path, std::process::id().to_string())?;
    Ok(())
}

pub fn is_pid_alive(pid: i32) -> bool {
    unsafe { libc::kill(pid, 0) == 0 }
}
