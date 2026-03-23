pub mod default_debloat;
pub mod mountify;
pub mod nuke;
pub mod scanner;
pub mod whiteout;

use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{bail, Result};
use tracing::{debug, info, warn};

use crate::core::config::Config;
use crate::core::detect;
use crate::core::types::{Capabilities, DebloatModeKind, ModeOverride};

pub enum DebloatMode {
    Zeromount { zm_bin: PathBuf },
    Whiteout,
    Pm,
}

impl DebloatMode {
    pub fn kind(&self) -> DebloatModeKind {
        match self {
            Self::Zeromount { .. } => DebloatModeKind::Zeromount,
            Self::Whiteout => DebloatModeKind::Whiteout,
            Self::Pm => DebloatModeKind::Pm,
        }
    }

    pub fn probe(&self) -> Result<bool> {
        match self {
            Self::Zeromount { zm_bin } => Ok(zm_bin.exists()),
            Self::Whiteout => Ok(detect::can_create_whiteouts(Path::new(crate::paths::mod_dir()))),
            Self::Pm => Ok(true),
        }
    }

    pub fn debloat(&self, package: &str, app_path: &Path, module_dir: &Path) -> Result<()> {
        match self {
            Self::Zeromount { zm_bin } => {
                whiteout::whiteout_create(module_dir, app_path)?;
                zm_sync(zm_bin, module_dir)
            }
            Self::Whiteout => whiteout::whiteout_create(module_dir, app_path),
            Self::Pm => {
                crate::utils::cmd::run_pm(&["disable-user", "--user", "0", package])?;
                Ok(())
            }
        }
    }

    pub fn restore(&self, package: &str, app_path: &Path, module_dir: &Path) -> Result<()> {
        match self {
            Self::Zeromount { zm_bin } => {
                whiteout::whiteout_remove(module_dir, app_path)?;
                zm_sync(zm_bin, module_dir)?;
            }
            Self::Whiteout => {
                whiteout::whiteout_remove(module_dir, app_path)?;
            }
            Self::Pm => {}
        }
        let _ = crate::utils::cmd::run_pm(&["enable", package]);
        let _ = crate::utils::cmd::run_pm(&["install-existing", package]);
        Ok(())
    }

    pub fn verify(&self, package: &str, app_path: &Path, module_dir: &Path) -> Result<bool> {
        match self {
            Self::Zeromount { .. } | Self::Whiteout => {
                whiteout::whiteout_verify(module_dir, app_path)
            }
            Self::Pm => {
                let out = crate::utils::cmd::run_pm(&["list", "packages", "-d"])?;
                Ok(out.contains(package))
            }
        }
    }

    pub fn cleanup(&self, module_dir: &Path) -> Result<()> {
        match self {
            Self::Zeromount { zm_bin } => {
                whiteout::cleanup_all(module_dir)?;
                zm_sync(zm_bin, module_dir)
            }
            Self::Whiteout => whiteout::cleanup_all(module_dir),
            Self::Pm => Ok(()),
        }
    }
}

pub fn detect_best_mode(caps: &Capabilities, config: &Config) -> DebloatMode {
    match config.debloat.mode_override {
        ModeOverride::Zeromount => {
            return DebloatMode::Zeromount {
                zm_bin: detect::detect_zeromount().unwrap_or_default(),
            };
        }
        ModeOverride::Whiteout => return DebloatMode::Whiteout,
        ModeOverride::Pm => return DebloatMode::Pm,
        ModeOverride::Auto | ModeOverride::Overlay => {}
    }

    if caps.has_zeromount {
        if let Some(bin) = detect::detect_zeromount() {
            info!("auto-detected zeromount mode");
            return DebloatMode::Zeromount { zm_bin: bin };
        }
    }
    if caps.can_whiteout {
        info!("auto-detected whiteout mode");
        return DebloatMode::Whiteout;
    }
    if config.debloat.mode_override == ModeOverride::Overlay {
        info!("overlay requested but no overlay capability, falling back to pm");
    }
    info!("falling back to pm mode");
    DebloatMode::Pm
}

fn zm_sync(zm_bin: &Path, _module_dir: &Path) -> Result<()> {
    let zm_root = zm_bin
        .parent()
        .and_then(|p| p.parent())
        .ok_or_else(|| anyhow::anyhow!("zm_bin path too short to find sync.sh"))?;
    let sync_sh = zm_root.join("sync.sh");

    if !sync_sh.exists() {
        warn!("sync.sh not found at {}", sync_sh.display());
        return Ok(());
    }

    let status = Command::new("sh")
        .arg(&sync_sh)
        .arg("scalpel")
        .status()?;

    if !status.success() {
        bail!("sync.sh exited with status {status}");
    }

    debug!("zeromount sync completed");
    Ok(())
}
