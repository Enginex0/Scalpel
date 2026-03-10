use std::ffi::CString;
use std::fs;
use std::io;
use std::os::unix::fs::FileTypeExt;
use std::path::Path;

use anyhow::{bail, Context, Result};
use tracing::{debug, warn};

const VENDOR_PARTS: &[&str] = &[
    "mi_ext",
    "my_bigball",
    "my_carrier",
    "my_company",
    "my_engineering",
    "my_heytap",
    "my_manifest",
    "my_preload",
    "my_product",
    "my_region",
    "my_reserve",
    "my_stock",
];

pub fn whiteout_create(module_dir: &Path, app_path: &Path) -> Result<()> {
    let app_dir = app_path
        .parent()
        .context("app_path has no parent")?;
    let app_dir_relative = app_dir
        .strip_prefix("/")
        .unwrap_or(app_dir);
    let parent_relative = app_dir_relative
        .parent()
        .context("app_dir has no grandparent")?;

    let wo_parent = module_dir.join(parent_relative);
    let wo_path = module_dir.join(app_dir_relative);

    if wo_path.symlink_metadata().map(|m| m.file_type().is_char_device()).unwrap_or(false) {
        return Ok(());
    }

    if wo_path.exists() || wo_path.symlink_metadata().is_ok() {
        let _ = fs::remove_dir_all(&wo_path);
    }

    fs::create_dir_all(&wo_parent)
        .with_context(|| format!("mkdir {}", wo_parent.display()))?;
    crate::utils::fs::set_file_perms(&wo_parent, 0o755)?;

    let c_path = CString::new(wo_path.to_string_lossy().as_bytes())
        .context("invalid path for mknod")?;
    let ret = unsafe { libc::mknod(c_path.as_ptr(), libc::S_IFCHR | 0o644, 0) };
    if ret != 0 {
        bail!("mknod failed on {}: {}", wo_path.display(), io::Error::last_os_error());
    }

    let real_parent = Path::new("/").join(parent_relative);
    crate::utils::selinux::copy_selinux_context(&real_parent, &wo_path);

    if let Err(e) = crate::utils::selinux::set_xattr(&wo_path, "trusted.overlay.whiteout", b"y") {
        warn!("setfattr failed for {}: {e}", wo_path.display());
    }

    debug!("created whiteout: {}", wo_path.display());
    Ok(())
}

pub fn whiteout_remove(module_dir: &Path, app_path: &Path) -> Result<()> {
    let app_dir = app_path
        .parent()
        .context("app_path has no parent")?;
    let app_dir_relative = app_dir
        .strip_prefix("/")
        .unwrap_or(app_dir);

    let wo_path = module_dir.join(app_dir_relative);

    if wo_path.symlink_metadata().map(|m| m.file_type().is_char_device()).unwrap_or(false) {
        fs::remove_file(&wo_path)?;
    } else if wo_path.exists() {
        let _ = fs::remove_dir_all(&wo_path);
    }

    let mut dir = wo_path.parent();
    while let Some(d) = dir {
        if d == module_dir || d == Path::new("/") {
            break;
        }
        if fs::remove_dir(d).is_err() {
            break;
        }
        dir = d.parent();
    }

    debug!("removed whiteout: {}", wo_path.display());
    Ok(())
}

pub fn whiteout_verify(module_dir: &Path, app_path: &Path) -> Result<bool> {
    let app_dir = app_path
        .parent()
        .context("app_path has no parent")?;
    let app_dir_relative = app_dir
        .strip_prefix("/")
        .unwrap_or(app_dir);

    let wo_path = module_dir.join(app_dir_relative);
    Ok(wo_path.symlink_metadata().map(|m| m.file_type().is_char_device()).unwrap_or(false))
}

pub fn fix_vendor_symlinks(module_dir: &Path) -> Result<()> {
    for part in VENDOR_PARTS {
        let overlay_path = module_dir.join("system").join(part);
        let real_path = Path::new("/").join(part);

        if overlay_path.is_dir() && !real_path.is_symlink() {
            let target = module_dir.join(part);
            if let Err(e) = fs::rename(&overlay_path, &target) {
                warn!("vendor symlink fix failed for {part}: {e}");
                continue;
            }
            let _ = std::os::unix::fs::symlink(format!("../{part}"), &overlay_path);
            debug!("fixed vendor symlink: {part}");
        }
    }
    Ok(())
}

pub fn cleanup_all(module_dir: &Path) -> Result<()> {
    let system_dir = module_dir.join("system");
    if !system_dir.exists() {
        return Ok(());
    }

    remove_whiteouts_recursive(&system_dir)?;
    clean_empty_dirs(&system_dir);
    Ok(())
}

fn remove_whiteouts_recursive(dir: &Path) -> Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let ft = entry.file_type()?;
        if ft.is_char_device() {
            fs::remove_file(entry.path())?;
        } else if ft.is_dir() {
            remove_whiteouts_recursive(&entry.path())?;
        }
    }
    Ok(())
}

fn clean_empty_dirs(dir: &Path) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                clean_empty_dirs(&entry.path());
            }
        }
    }
    let _ = fs::remove_dir(dir);
}
