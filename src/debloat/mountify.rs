use std::fs;
use std::io::Read;
use std::path::Path;
use std::process::Command;

use anyhow::{bail, Result};
use tracing::{debug, info};

fn random_mount_name() -> String {
    let mut buf = [0u8; 5];
    if let Ok(mut f) = fs::File::open("/dev/urandom") {
        let _ = f.read_exact(&mut buf);
    } else {
        let t = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0) as u64;
        buf.copy_from_slice(&t.to_ne_bytes()[..5]);
    }
    // Blend in with OEM partition names like my_product, my_bigball
    let hex: String = buf.iter().map(|b| format!("{b:02x}")).collect();
    format!("my_{}", hex)
}

const TARGETS: &[&str] = &[
    "odm", "product", "system_ext", "vendor",
    "mi_ext", "my_bigball", "my_carrier", "my_company",
    "my_engineering", "my_heytap", "my_manifest", "my_preload",
    "my_product", "my_region", "my_reserve", "my_stock",
];

pub fn standalone_mount(module_dir: &Path, magic_mount: bool) -> Result<()> {
    let base_dir = module_dir.join("system");
    if !base_dir.exists() {
        debug!("no system/ overlay dir — nothing to mount");
        return Ok(());
    }

    let mnt = find_writable_mount()?;
    let name = random_mount_name();
    let work_dir = mnt.join(&name);

    if work_dir.exists() {
        bail!("mount workdir already exists: {}", work_dir.display());
    }

    touch_skip_files(module_dir);

    if magic_mount {
        tmpfs_mount(&base_dir, &work_dir)?;
    } else {
        symlink_mount(module_dir, &work_dir)?;
    }

    info!("standalone mount complete");
    Ok(())
}

fn find_writable_mount() -> Result<std::path::PathBuf> {
    for candidate in ["/mnt/vendor", "/mnt"] {
        let p = Path::new(candidate);
        if p.exists() && is_writable(p) {
            return Ok(p.to_path_buf());
        }
    }
    bail!("no writable mount point found (/mnt, /mnt/vendor)")
}

fn is_writable(path: &Path) -> bool {
    let probe = path.join(".scalpel_probe");
    if fs::write(&probe, "").is_ok() {
        let _ = fs::remove_file(&probe);
        true
    } else {
        false
    }
}

fn touch_skip_files(module_dir: &Path) {
    let _ = fs::write(module_dir.join("skip_mount"), "");
    let _ = fs::write(module_dir.join("skip_mountify"), "");
}

fn tmpfs_mount(base_dir: &Path, work_dir: &Path) -> Result<()> {
    fs::create_dir_all(work_dir)?;

    let work_str = work_dir.to_string_lossy();
    run_cmd("busybox", &["mount", "-t", "tmpfs", "tmpfs", &work_str])?;

    // Copy module overlay into tmpfs
    let src_glob = format!("{}/.", base_dir.display());
    run_cmd("cp", &["-Lrf", &src_glob, &work_str])?;

    mirror_selinux(base_dir, work_dir)?;
    copy_opaque_xattrs(base_dir, work_dir)?;

    // Mount single-depth /system subdirs (skip partition targets)
    mount_single_depth(work_dir)?;

    // Mount partition targets with controlled depth
    mount_partition_targets(work_dir)?;

    run_cmd("busybox", &["umount", "-l", &work_str])?;
    debug!("tmpfs cleaned up");
    Ok(())
}

fn symlink_mount(module_dir: &Path, work_dir: &Path) -> Result<()> {
    let sys_dir = module_dir.join("system");
    let sys_str = sys_dir.to_string_lossy();
    let work_str = work_dir.to_string_lossy();
    run_cmd("busybox", &["ln", "-sf", &sys_str, &work_str])?;

    if !work_dir.exists() {
        bail!("symlink creation failed");
    }

    mount_partition_targets(work_dir)?;

    let entries = fs::read_dir(work_dir)?;
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_dir() || p.is_symlink() {
            continue;
        }
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if TARGETS.contains(&name_str.as_ref()) {
            continue;
        }
        let lower = format!("{}/{}", work_str, name_str);
        let mount_point = format!("/system/{}", name_str);
        if Path::new(&mount_point).exists() {
            overlay_mount(&lower, &mount_point)?;
        }
    }

    Ok(())
}

fn mount_single_depth(work_dir: &Path) -> Result<()> {
    let entries = fs::read_dir(work_dir)?;
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if TARGETS.contains(&name_str.as_ref()) {
            continue;
        }
        let lower = format!("{}/{}", work_dir.display(), name_str);
        let mount_point = format!("/system/{}", name_str);
        if Path::new(&mount_point).exists() {
            overlay_mount(&lower, &mount_point)?;
        }
    }
    Ok(())
}

fn mount_partition_targets(work_dir: &Path) -> Result<()> {
    for part in TARGETS {
        let part_dir = work_dir.join(part);
        if !part_dir.is_dir() {
            continue;
        }

        // Determine mount base: legacy (/system/$part) vs modern (/$part)
        let is_legacy = Path::new(&format!("/{part}")).is_symlink()
            && !Path::new(&format!("/system/{part}")).is_symlink();

        let entries = fs::read_dir(&part_dir)?;
        for entry in entries.flatten() {
            if !entry.path().is_dir() {
                continue;
            }
            let dir_name = entry.file_name();
            let dir_str = dir_name.to_string_lossy();
            let lower = format!("{}/{}/{}", work_dir.display(), part, dir_str);

            let mount_point = if is_legacy {
                format!("/system/{}/{}", part, dir_str)
            } else {
                format!("/{}/{}", part, dir_str)
            };

            if Path::new(&mount_point).exists() {
                overlay_mount(&lower, &mount_point)?;
            }
        }
    }
    Ok(())
}

fn overlay_mount(lower: &str, mount_point: &str) -> Result<()> {
    let opts = format!("lowerdir={}:{}", lower, mount_point);
    run_cmd("busybox", &["mount", "-t", "overlay", "-o", &opts, "overlay", mount_point])?;
    debug!("overlay mounted: {mount_point}");
    Ok(())
}

fn mirror_selinux(src_base: &Path, dst_base: &Path) -> Result<()> {
    let output = Command::new("find")
        .arg("-L")
        .arg(src_base)
        .output()?;
    let paths = String::from_utf8_lossy(&output.stdout);
    let src_prefix = src_base.to_string_lossy();

    for line in paths.lines() {
        if line.is_empty() {
            continue;
        }
        let relative = line.strip_prefix(src_prefix.as_ref()).unwrap_or("");
        if relative.is_empty() {
            continue;
        }
        let dst = format!("{}{}", dst_base.display(), relative);
        if Path::new(&dst).exists() {
            let _ = Command::new("busybox")
                .args(["chcon", "--reference", line, &dst])
                .status();
        }
    }
    debug!("selinux contexts mirrored");
    Ok(())
}

fn copy_opaque_xattrs(src_base: &Path, dst_base: &Path) -> Result<()> {
    let output = Command::new("find")
        .args(["-L", &src_base.to_string_lossy(), "-type", "d"])
        .output()?;
    let dirs = String::from_utf8_lossy(&output.stdout);
    let src_prefix = src_base.to_string_lossy();

    for line in dirs.lines() {
        if line.is_empty() {
            continue;
        }
        let attr_out = Command::new("/system/bin/getfattr")
            .args(["-d", line])
            .output()
            .or_else(|_| Command::new("busybox").args(["getfattr", "-d", line]).output());
        let has_opaque = attr_out
            .map(|o| String::from_utf8_lossy(&o.stdout).contains("trusted.overlay.opaque"))
            .unwrap_or(false);

        if has_opaque {
            let relative = line.strip_prefix(src_prefix.as_ref()).unwrap_or("");
            let dst = format!("{}{}", dst_base.display(), relative);
            if Path::new(&dst).exists() {
                let _ = Command::new("busybox")
                    .args(["setfattr", "-n", "trusted.overlay.opaque", "-v", "y", &dst])
                    .status();
            }
        }
    }
    Ok(())
}

fn run_cmd(cmd: &str, args: &[&str]) -> Result<()> {
    let status = Command::new(cmd).args(args).status()?;
    if !status.success() {
        bail!("{} {} failed with {status}", cmd, args.join(" "));
    }
    Ok(())
}
