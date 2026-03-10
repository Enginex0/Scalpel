use std::fs;
use std::io::Read;
use std::path::Path;
use std::process::Command;

use anyhow::{bail, Result};
use tracing::{debug, info, warn};

const TARGETS: &[&str] = &[
    "odm", "product", "system_ext", "vendor",
    "mi_ext", "my_bigball", "my_carrier", "my_company",
    "my_engineering", "my_heytap", "my_manifest", "my_preload",
    "my_product", "my_region", "my_reserve", "my_stock",
];

pub fn standalone_mount(module_dir: &Path, magic_mount: bool) -> Result<()> {
    let base_dir = module_dir.join("system");
    if !base_dir.exists() {
        return Ok(());
    }

    let mnt = find_writable_mnt().ok_or_else(|| anyhow::anyhow!("no writable mount point"))?;
    let name = gen_mount_name();
    let work_dir = format!("{mnt}/{name}");

    if Path::new(&work_dir).exists() {
        bail!("mount dir already exists: {work_dir}");
    }

    let _ = fs::File::create(module_dir.join("skip_mount"));
    let _ = fs::File::create(module_dir.join("skip_mountify"));

    info!(magic_mount, mount_dir = %work_dir, "standalone mount starting");

    let result = if magic_mount {
        tmpfs_mount(&base_dir, &mnt, &name)
    } else {
        symlink_mount(module_dir, &mnt, &name)
    };

    if let Err(e) = &result {
        warn!("standalone mount failed: {e}");
    }

    result
}

fn tmpfs_mount(base_dir: &Path, mnt: &str, name: &str) -> Result<()> {
    let work_dir = format!("{mnt}/{name}");
    fs::create_dir_all(&work_dir)?;

    let real_path = fs::canonicalize(&work_dir)?;
    let real_str = real_path.to_string_lossy().to_string();

    busybox(&["mount", "-t", "tmpfs", "tmpfs", &real_str])?;

    let result = tmpfs_mount_inner(base_dir, &work_dir);

    // Always lazy-unmount tmpfs — overlays keep their own references
    let _ = busybox(&["umount", "-l", &real_str]);

    if result.is_ok() {
        info!("standalone tmpfs mount complete");
    }
    result
}

fn tmpfs_mount_inner(base_dir: &Path, work_dir: &str) -> Result<()> {
    let cp_cmd = format!(
        "busybox cp -Lrf {}/* {}",
        base_dir.display(),
        work_dir
    );
    let status = Command::new("sh").args(["-c", &cp_cmd]).status()?;
    if !status.success() {
        bail!("file copy to tmpfs failed");
    }

    mirror_selinux(base_dir, Path::new(work_dir))?;
    copy_opaque_xattrs(base_dir, work_dir)?;
    mount_overlays(work_dir)
}

fn symlink_mount(module_dir: &Path, mnt: &str, name: &str) -> Result<()> {
    let link_path = format!("{mnt}/{name}");
    busybox(&["ln", "-sf", &module_dir.to_string_lossy(), &link_path])?;

    if !Path::new(&link_path).exists() {
        bail!("symlink creation failed");
    }

    let sys_dir = format!("{link_path}/system");
    if Path::new(&sys_dir).exists() {
        mount_system_dirs(&sys_dir)?;
    }

    for part in TARGETS {
        let part_dir = format!("{link_path}/{part}");
        if !Path::new(&part_dir).is_dir() {
            continue;
        }
        let entries = fs::read_dir(&part_dir)?;
        for entry in entries.flatten() {
            if !entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                continue;
            }
            let dir_name = entry.file_name();
            let lower = format!("{link_path}/{part}/{}", dir_name.to_string_lossy());
            let mount_point = format!("/{part}/{}", dir_name.to_string_lossy());
            let _ = overlay_mount(&lower, &mount_point);
        }
    }

    info!("standalone symlink mount complete");
    Ok(())
}

fn mount_overlays(work_dir: &str) -> Result<()> {
    mount_system_dirs(work_dir)?;

    for part in TARGETS {
        let part_dir = format!("{work_dir}/{part}");
        if !Path::new(&part_dir).is_dir() {
            continue;
        }

        // Legacy: /product is symlink to /system/product
        let mount_prefix = if Path::new(&format!("/{part}")).is_symlink()
            && !Path::new(&format!("/system/{part}")).is_symlink()
        {
            "/system/"
        } else {
            "/"
        };

        let entries = fs::read_dir(&part_dir)?;
        for entry in entries.flatten() {
            if !entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                continue;
            }
            let dir_name = entry.file_name();
            let lower = format!("{work_dir}/{part}/{}", dir_name.to_string_lossy());
            let mount_point = format!("{mount_prefix}{part}/{}", dir_name.to_string_lossy());
            let _ = overlay_mount(&lower, &mount_point);
        }
    }
    Ok(())
}

fn mount_system_dirs(work_dir: &str) -> Result<()> {
    let entries = match fs::read_dir(work_dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };

    for entry in entries.flatten() {
        if !entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
            continue;
        }
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        if TARGETS.contains(&name_str.as_ref()) {
            continue;
        }
        // KSU creates symlinks inside /system — skip those
        if entry.path().is_symlink() {
            continue;
        }

        let lower = format!("{work_dir}/{name_str}");
        let mount_point = format!("/system/{name_str}");
        let _ = overlay_mount(&lower, &mount_point);
    }
    Ok(())
}

fn overlay_mount(lower: &str, mount_point: &str) -> Result<()> {
    if !Path::new(mount_point).exists() {
        debug!(mount_point, "skipping non-existent mount point");
        return Ok(());
    }
    let opt = format!("lowerdir={lower}:{mount_point}");
    busybox(&["mount", "-t", "overlay", "-o", &opt, "overlay", mount_point])?;
    debug!(mount_point, "overlay mounted");
    Ok(())
}

fn mirror_selinux(src_base: &Path, dst_base: &Path) -> Result<()> {
    walk_and_chcon(src_base, src_base, dst_base)
}

fn walk_and_chcon(current: &Path, src_root: &Path, dst_root: &Path) -> Result<()> {
    let relative = current.strip_prefix(src_root).unwrap_or(Path::new(""));
    let dst_path = dst_root.join(relative);

    if dst_path.exists() {
        let _ = busybox(&[
            "chcon",
            "--reference",
            &current.to_string_lossy(),
            &dst_path.to_string_lossy(),
        ]);
    }

    if current.is_dir() {
        if let Ok(entries) = fs::read_dir(current) {
            for entry in entries.flatten() {
                walk_and_chcon(&entry.path(), src_root, dst_root)?;
            }
        }
    }
    Ok(())
}

fn copy_opaque_xattrs(src_base: &Path, dst_base: &str) -> Result<()> {
    walk_opaque(src_base, src_base, dst_base)
}

fn walk_opaque(current: &Path, src_root: &Path, dst_base: &str) -> Result<()> {
    if current.is_dir() {
        let output = Command::new("/system/bin/getfattr")
            .arg("-d")
            .arg(current)
            .output()
            .or_else(|_| Command::new("toybox").args(["getfattr", "-d"]).arg(current).output());

        if let Ok(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            if stdout.contains("trusted.overlay.opaque") {
                let relative = current.strip_prefix(src_root).unwrap_or(Path::new(""));
                let dst = format!("{dst_base}/{}", relative.display());
                let _ = busybox(&["setfattr", "-n", "trusted.overlay.opaque", "-v", "y", &dst]);
            }
        }

        if let Ok(entries) = fs::read_dir(current) {
            for entry in entries.flatten() {
                if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    walk_opaque(&entry.path(), src_root, dst_base)?;
                }
            }
        }
    }
    Ok(())
}

fn find_writable_mnt() -> Option<String> {
    let mut mnt = None;
    if is_writable("/mnt") {
        mnt = Some("/mnt".to_string());
    }
    if is_writable("/mnt/vendor") {
        mnt = Some("/mnt/vendor".to_string());
    }
    mnt
}

fn is_writable(path: &str) -> bool {
    let c_path = match std::ffi::CString::new(path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    unsafe { libc::access(c_path.as_ptr(), libc::W_OK) == 0 }
}

fn gen_mount_name() -> String {
    let mut buf = [0u8; 6];
    if let Ok(mut f) = fs::File::open("/dev/urandom") {
        let _ = f.read_exact(&mut buf);
    } else {
        let pid = std::process::id();
        buf[..4].copy_from_slice(&pid.to_le_bytes());
    }

    // Looks like an OEM vendor partition to blend in
    let suffix: String = buf
        .iter()
        .map(|b| {
            let idx = (*b as usize) % 26;
            (b'a' + idx as u8) as char
        })
        .collect();

    format!("my_{suffix}")
}

fn busybox(args: &[&str]) -> Result<()> {
    let status = Command::new("busybox").args(args).status()?;
    if !status.success() {
        bail!("busybox {} failed (exit {})", args[0], status);
    }
    Ok(())
}
