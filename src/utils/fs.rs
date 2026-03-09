use std::ffi::CString;
use std::fs::{self, File, OpenOptions};
use std::io;
use std::os::unix::io::AsRawFd;
use std::path::Path;

use anyhow::{bail, Result};

pub fn atomic_write(path: &Path, content: &str) -> Result<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, content)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

pub fn set_file_perms(path: &Path, mode: u32) -> Result<()> {
    let c_path = CString::new(path.to_string_lossy().as_bytes())?;
    let ret = unsafe { libc::chmod(c_path.as_ptr(), mode as libc::mode_t) };
    if ret != 0 {
        bail!(
            "chmod failed on {}: {}",
            path.display(),
            io::Error::last_os_error()
        );
    }
    Ok(())
}

pub fn set_permissions_recursive(dir: &Path) -> Result<()> {
    set_file_perms(dir, 0o755)?;
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            set_permissions_recursive(&path)?;
        } else {
            set_file_perms(&path, 0o644)?;
        }
    }

    let lib_dir = dir.join("lib");
    if lib_dir.exists() {
        set_lib_perms_recursive(&lib_dir)?;
    }
    Ok(())
}

fn set_lib_perms_recursive(dir: &Path) -> Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            set_lib_perms_recursive(&path)?;
        } else {
            set_file_perms(&path, 0o755)?;
        }
    }
    Ok(())
}

pub fn acquire_flock(path: &Path) -> Result<File> {
    let file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)?;
    let fd = file.as_raw_fd();
    let ret = unsafe { libc::flock(fd, libc::LOCK_EX | libc::LOCK_NB) };
    if ret != 0 {
        bail!("lock held by another process");
    }
    Ok(file)
}

pub fn acquire_mkdir_lock(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    match fs::create_dir(path) {
        Ok(()) => {
            let pid_file = path.join("pid");
            fs::write(&pid_file, std::process::id().to_string())?;
            Ok(())
        }
        Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {
            let pid_file = path.join("pid");
            if let Ok(pid_str) = fs::read_to_string(&pid_file) {
                if let Ok(pid) = pid_str.trim().parse::<i32>() {
                    if unsafe { libc::kill(pid, 0) } == 0 {
                        bail!("lock held by PID {pid}");
                    }
                }
            }
            let _ = fs::remove_dir_all(path);
            fs::create_dir(path)?;
            let pid_file = path.join("pid");
            fs::write(&pid_file, std::process::id().to_string())?;
            Ok(())
        }
        Err(e) => Err(e.into()),
    }
}
