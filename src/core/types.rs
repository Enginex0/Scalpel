use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ModeOverride {
    #[default]
    #[serde(alias = "")]
    Auto,
    Zeromount,
    Whiteout,
    Pm,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DebloatModeKind {
    Zeromount,
    Whiteout,
    Pm,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum MountingMode {
    #[default]
    Default,
    Standalone,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Debug,
    #[default]
    Info,
    Warn,
    Error,
    Fatal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    Essential,
    Caution,
    Safe,
    Google,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SystemizeTarget {
    App,
    PrivApp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RootManager {
    Ksu,
    Apatch,
    Magisk,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, clap::ValueEnum)]
pub enum BootStage {
    PostFsData,
    Service,
    BootCompleted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedApp {
    pub package_name: String,
    pub app_name: String,
    pub app_path: String,
    pub partition: String,
    pub category: Category,
    pub is_priv_app: bool,
    pub is_split: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NukeEntry {
    pub app_name: String,
    pub package_name: String,
    pub app_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemizeEntry {
    pub app_name: String,
    pub package_name: String,
    pub original_path: String,
    pub system_path: String,
    pub promoted_date: String,
    pub target: SystemizeTarget,
    #[serde(default)]
    pub needs_uninstall: bool,
    #[serde(default)]
    pub pending_demote: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingDemote {
    pub package_name: String,
    pub target: SystemizeTarget,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Status {
    pub mode: String,
    pub debloated: u32,
    pub debloat_failed: u32,
    pub systemized: u32,
    pub partial: bool,
    pub last_nuke: Option<String>,
    pub timestamp: Option<u64>,
    #[serde(default)]
    pub debloat_verified: Option<u32>,
    #[serde(default)]
    pub debloat_broken: Option<u32>,
    #[serde(default)]
    pub systemize_verified: Option<u32>,
    #[serde(default)]
    pub systemize_broken: Option<u32>,
    #[serde(default)]
    pub last_verify: Option<String>,
    #[serde(default)]
    pub monitor_repairs: Option<u32>,
    #[serde(default)]
    pub last_monitor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoriesFile {
    pub categories: Vec<CategoryDef>,
    pub apps: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryDef {
    pub id: String,
    pub name: String,
    pub description: String,
    pub color: String,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotEntry {
    pub package_name: String,
    pub enabled: bool,
}

pub struct Capabilities {
    pub root_manager: RootManager,
    pub busybox: Option<PathBuf>,
    pub aapt: Option<PathBuf>,
    pub can_whiteout: bool,
    pub has_zeromount: bool,
    pub has_metamodule: Option<String>,
    pub magic_mount: bool,
}
