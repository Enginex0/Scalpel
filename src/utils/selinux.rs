use std::ffi::CString;
use std::io;
use std::path::Path;

use anyhow::{bail, Result};
use tracing::warn;

pub fn get_selinux_context(path: &Path) -> Option<String> {
    let c_path = CString::new(path.to_string_lossy().as_bytes()).ok()?;
    let mut buf = vec![0u8; 256];
    let len = unsafe {
        libc::lgetxattr(
            c_path.as_ptr(),
            b"security.selinux\0".as_ptr() as *const _,
            buf.as_mut_ptr() as *mut _,
            buf.len(),
        )
    };
    if len <= 0 {
        return None;
    }
    buf.truncate(len as usize);
    if buf.last() == Some(&0) {
        buf.pop();
    }
    String::from_utf8(buf).ok()
}

pub fn set_selinux_context(path: &Path, context: &str) {
    let c_path = match CString::new(path.to_string_lossy().as_bytes()) {
        Ok(p) => p,
        Err(_) => return,
    };
    let c_ctx = match CString::new(context) {
        Ok(c) => c,
        Err(_) => return,
    };
    let ret = unsafe {
        libc::lsetxattr(
            c_path.as_ptr(),
            b"security.selinux\0".as_ptr() as *const _,
            c_ctx.as_ptr() as *const _,
            c_ctx.as_bytes_with_nul().len(),
            0,
        )
    };
    if ret != 0 {
        warn!(
            "lsetxattr failed on {}: {}",
            path.display(),
            io::Error::last_os_error()
        );
    }
}

pub fn set_selinux_context_recursive(path: &Path, context: &str) {
    set_selinux_context(path, context);
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                set_selinux_context_recursive(&p, context);
            } else {
                set_selinux_context(&p, context);
            }
        }
    }
}

pub fn copy_selinux_context(source: &Path, target: &Path) {
    if let Some(ctx) = get_selinux_context(source) {
        set_selinux_context(target, &ctx);
    }
}

pub fn set_xattr(path: &Path, name: &str, value: &[u8]) -> Result<()> {
    let c_path = CString::new(path.to_string_lossy().as_bytes())?;
    let c_name = CString::new(name)?;
    let ret = unsafe {
        libc::lsetxattr(
            c_path.as_ptr(),
            c_name.as_ptr(),
            value.as_ptr() as *const _,
            value.len(),
            0,
        )
    };
    if ret != 0 {
        bail!("setxattr failed: {}", io::Error::last_os_error());
    }
    Ok(())
}
