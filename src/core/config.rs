use std::fs;
use std::path::Path;

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use tracing::warn;

use crate::core::types::{LogLevel, ModeOverride, MountingMode};
use crate::paths::{CONFIG_BACKUP, CONFIG_PATH};
use crate::utils::fs::atomic_write;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub debloat: DebloatConfig,
    #[serde(default)]
    pub scan: ScanConfig,
    #[serde(default)]
    pub systemize: SystemizeConfig,
    #[serde(default)]
    pub monitor: MonitorConfig,
    #[serde(default)]
    pub log: LogConfig,
    #[serde(default)]
    pub guard: GuardConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebloatConfig {
    #[serde(default)]
    pub mode_override: ModeOverride,
    #[serde(default)]
    pub mounting_mode: MountingMode,
    #[serde(default)]
    pub disable_only: bool,
    #[serde(default = "default_true")]
    pub uninstall_fallback: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemizeConfig {
    #[serde(default)]
    pub deferred_uninstall: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanConfig {
    #[serde(default)]
    pub refresh_on_boot: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_monitor_interval")]
    pub interval: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogConfig {
    #[serde(default)]
    pub level: LogLevel,
    #[serde(default = "default_log_max_size")]
    pub max_size: u64,
    #[serde(default = "default_log_archives")]
    pub max_archives: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_guard_threshold")]
    pub marker_threshold: u32,
    #[serde(default = "default_boot_timeout")]
    pub boot_timeout_secs: u32,
}

fn default_true() -> bool {
    true
}
fn default_monitor_interval() -> u32 {
    300
}
fn default_log_max_size() -> u64 {
    1_048_576
}
fn default_log_archives() -> u32 {
    3
}
fn default_guard_threshold() -> u32 {
    3
}
fn default_boot_timeout() -> u32 {
    100
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: String::new(),
            debloat: DebloatConfig::default(),
            systemize: SystemizeConfig::default(),
            scan: ScanConfig::default(),
            monitor: MonitorConfig::default(),
            log: LogConfig::default(),
            guard: GuardConfig::default(),
        }
    }
}

impl Default for SystemizeConfig {
    fn default() -> Self {
        Self {
            deferred_uninstall: false,
        }
    }
}

impl Default for DebloatConfig {
    fn default() -> Self {
        Self {
            mode_override: ModeOverride::Auto,
            mounting_mode: MountingMode::default(),
            disable_only: false,
            uninstall_fallback: default_true(),
        }
    }
}

impl Default for ScanConfig {
    fn default() -> Self {
        Self {
            refresh_on_boot: false,
        }
    }
}

impl Default for MonitorConfig {
    fn default() -> Self {
        Self {
            enabled: default_true(),
            interval: default_monitor_interval(),
        }
    }
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            level: LogLevel::default(),
            max_size: default_log_max_size(),
            max_archives: default_log_archives(),
        }
    }
}

impl Default for GuardConfig {
    fn default() -> Self {
        Self {
            enabled: default_true(),
            marker_threshold: default_guard_threshold(),
            boot_timeout_secs: default_boot_timeout(),
        }
    }
}

impl Config {
    pub fn load(path: Option<&Path>) -> Result<Self> {
        let config_path = path.unwrap_or(Path::new(CONFIG_PATH));

        if !config_path.exists() {
            return Ok(Self::default());
        }

        let content = match fs::read_to_string(config_path) {
            Ok(c) => c,
            Err(e) => {
                warn!("failed to read config: {e}");
                return Ok(Self::default());
            }
        };

        match toml::from_str::<Config>(&content) {
            Ok(cfg) => Ok(cfg),
            Err(e) => {
                warn!("corrupt config, resetting to defaults: {e}");
                let fresh = Self::default();
                let _ = fresh.save();
                Ok(fresh)
            }
        }
    }

    pub fn save(&self) -> Result<()> {
        let content = toml::to_string_pretty(self)?;
        atomic_write(Path::new(CONFIG_PATH), &content)?;
        // config.toml is 0600 per spec — contains module configuration
        crate::utils::fs::set_file_perms(Path::new(CONFIG_PATH), 0o600)?;
        Ok(())
    }

    pub fn backup(&self) -> Result<()> {
        fs::copy(CONFIG_PATH, CONFIG_BACKUP)?;
        Ok(())
    }

    pub fn restore_backup() -> Result<Self> {
        let backup = Path::new(CONFIG_BACKUP);
        if !backup.exists() {
            let cfg = Self::default();
            cfg.save()?;
            return Ok(cfg);
        }
        let content = fs::read_to_string(backup)?;
        let cfg: Self = toml::from_str(&content)?;
        cfg.save()?;
        Ok(cfg)
    }

    pub fn get(&self, key: &str) -> Option<String> {
        match key {
            "version" => Some(self.version.clone()),
            "debloat.mode_override" => Some(mode_override_str(self.debloat.mode_override)),
            "debloat.mounting_mode" => Some(mounting_mode_str(self.debloat.mounting_mode)),
            "debloat.disable_only" => Some(self.debloat.disable_only.to_string()),
            "debloat.uninstall_fallback" => Some(self.debloat.uninstall_fallback.to_string()),
            "systemize.deferred_uninstall" => Some(self.systemize.deferred_uninstall.to_string()),
            "scan.refresh_on_boot" => Some(self.scan.refresh_on_boot.to_string()),
            "monitor.enabled" => Some(self.monitor.enabled.to_string()),
            "monitor.interval" => Some(self.monitor.interval.to_string()),
            "log.level" => Some(log_level_str(self.log.level)),
            "log.max_size" => Some(self.log.max_size.to_string()),
            "log.max_archives" => Some(self.log.max_archives.to_string()),
            "guard.enabled" => Some(self.guard.enabled.to_string()),
            "guard.marker_threshold" => Some(self.guard.marker_threshold.to_string()),
            "guard.boot_timeout_secs" => Some(self.guard.boot_timeout_secs.to_string()),
            _ => None,
        }
    }

    pub fn set(&mut self, key: &str, value: &str) -> Result<()> {
        match key {
            "version" => self.version = value.to_string(),
            "debloat.mode_override" => self.debloat.mode_override = parse_mode_override(value)?,
            "debloat.mounting_mode" => self.debloat.mounting_mode = parse_mounting_mode(value)?,
            "debloat.disable_only" => self.debloat.disable_only = parse_bool(value)?,
            "debloat.uninstall_fallback" => self.debloat.uninstall_fallback = parse_bool(value)?,
            "systemize.deferred_uninstall" => self.systemize.deferred_uninstall = parse_bool(value)?,
            "scan.refresh_on_boot" => self.scan.refresh_on_boot = parse_bool(value)?,
            "monitor.enabled" => self.monitor.enabled = parse_bool(value)?,
            "monitor.interval" => self.monitor.interval = value.parse()?,
            "log.level" => self.log.level = parse_log_level(value)?,
            "log.max_size" => self.log.max_size = value.parse()?,
            "log.max_archives" => self.log.max_archives = value.parse()?,
            "guard.enabled" => self.guard.enabled = parse_bool(value)?,
            "guard.marker_threshold" => self.guard.marker_threshold = value.parse()?,
            "guard.boot_timeout_secs" => self.guard.boot_timeout_secs = value.parse()?,
            _ => bail!("unknown config key: {key}"),
        }
        Ok(())
    }

    pub fn migrate_from_shell(path: &Path) -> Result<Self> {
        let content = fs::read_to_string(path)?;
        let mut cfg = Self::default();

        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            let Some((key, raw_val)) = line.split_once('=') else {
                continue;
            };
            let val = raw_val.trim_matches('"');

            match key {
                "SCALPEL_VERSION" => cfg.version = val.to_string(),
                "SCALPEL_MODE_OVERRIDE" => {
                    cfg.debloat.mode_override = match val {
                        "" | "auto" => ModeOverride::Auto,
                        "overlay" => ModeOverride::Overlay,
                        "zeromount" => ModeOverride::Zeromount,
                        "whiteout" => ModeOverride::Whiteout,
                        "pm" => ModeOverride::Pm,
                        "mountify" | "symlink" | "magisk" => ModeOverride::Auto,
                        other => {
                            warn!("unknown legacy mode '{other}', defaulting to auto");
                            ModeOverride::Auto
                        }
                    };
                }
                "SCALPEL_LOG_LEVEL" => {
                    cfg.log.level = parse_log_level(val).unwrap_or_default();
                }
                "SCALPEL_REFRESH_APPLIST" => {
                    cfg.scan.refresh_on_boot = val == "true";
                }
                "SCALPEL_DISABLE_ONLY" => {
                    cfg.debloat.disable_only = val == "true";
                }
                "SCALPEL_UNINSTALL_FALLBACK" => {
                    cfg.debloat.uninstall_fallback = val == "true";
                }
                "SCALPEL_MONITOR_INTERVAL" => {
                    if let Ok(v) = val.parse() {
                        cfg.monitor.interval = v;
                    }
                }
                _ => {}
            }
        }

        Ok(cfg)
    }
}

fn mode_override_str(m: ModeOverride) -> String {
    match m {
        ModeOverride::Auto => "auto".into(),
        ModeOverride::Overlay => "overlay".into(),
        ModeOverride::Zeromount => "zeromount".into(),
        ModeOverride::Whiteout => "whiteout".into(),
        ModeOverride::Pm => "pm".into(),
    }
}

fn log_level_str(l: LogLevel) -> String {
    match l {
        LogLevel::Debug => "debug".into(),
        LogLevel::Info => "info".into(),
        LogLevel::Warn => "warn".into(),
        LogLevel::Error => "error".into(),
        LogLevel::Fatal => "fatal".into(),
    }
}

fn parse_mode_override(s: &str) -> Result<ModeOverride> {
    match s {
        "" | "auto" => Ok(ModeOverride::Auto),
        "overlay" => Ok(ModeOverride::Overlay),
        "zeromount" => Ok(ModeOverride::Zeromount),
        "whiteout" => Ok(ModeOverride::Whiteout),
        "pm" => Ok(ModeOverride::Pm),
        _ => bail!("invalid mode override: {s}"),
    }
}

fn parse_log_level(s: &str) -> Result<LogLevel> {
    match s {
        "debug" => Ok(LogLevel::Debug),
        "info" => Ok(LogLevel::Info),
        "warn" => Ok(LogLevel::Warn),
        "error" => Ok(LogLevel::Error),
        "fatal" => Ok(LogLevel::Fatal),
        _ => bail!("invalid log level: {s}"),
    }
}

fn mounting_mode_str(m: MountingMode) -> String {
    match m {
        MountingMode::Default => "default".into(),
        MountingMode::Standalone => "standalone".into(),
    }
}

fn parse_mounting_mode(s: &str) -> Result<MountingMode> {
    match s {
        "default" | "" => Ok(MountingMode::Default),
        "standalone" => Ok(MountingMode::Standalone),
        _ => bail!("invalid mounting mode: {s}"),
    }
}

fn parse_bool(s: &str) -> Result<bool> {
    match s {
        "true" => Ok(true),
        "false" => Ok(false),
        _ => bail!("expected 'true' or 'false', got: {s}"),
    }
}
