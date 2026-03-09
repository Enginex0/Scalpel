use std::path::PathBuf;

use clap::{Parser, Subcommand};

use crate::core::types::BootStage;

#[derive(Parser)]
#[command(name = "scalpel", version = env!("CARGO_PKG_VERSION"))]
pub struct Cli {
    #[arg(long, short, global = true)]
    pub verbose: bool,
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand)]
pub enum Commands {
    #[command(name = "boot-init")]
    BootInit {
        #[arg(long, value_enum)]
        stage: BootStage,
    },
    #[command(name = "post-boot")]
    PostBoot,
    Scan {
        #[arg(long)]
        refresh: bool,
        #[arg(long)]
        icons_only: bool,
        #[arg(long)]
        json: bool,
    },
    Nuke {
        #[arg(long)]
        mode: Option<String>,
        #[arg(long)]
        json: bool,
    },
    Restore {
        package: String,
    },
    Promote {
        package: String,
        #[arg(long, default_value = "priv-app")]
        target: String,
        #[arg(long)]
        name: Option<String>,
    },
    Demote {
        package: String,
    },
    Verify {
        #[arg(long)]
        json: bool,
    },
    Status {
        #[arg(long)]
        json: bool,
        #[arg(long)]
        boot_info: bool,
    },
    Detect {
        #[command(subcommand)]
        what: DetectTarget,
    },
    Diagnose {
        #[arg(long)]
        output: Option<PathBuf>,
    },
    #[command(name = "export-packages")]
    ExportPackages {
        #[arg(long)]
        output: PathBuf,
    },
    Monitor {
        #[command(subcommand)]
        action: Option<MonitorAction>,
    },
    Config {
        #[command(subcommand)]
        action: ConfigAction,
    },
    List {
        #[command(subcommand)]
        what: ListTarget,
    },
    #[command(name = "sync-description")]
    SyncDescription,
    #[command(name = "webui-init")]
    WebUiInit,
    Install {
        #[arg(long)]
        modpath: PathBuf,
        #[arg(long)]
        apply_default: Option<bool>,
    },
    Uninstall,
    Version,
    Log {
        #[command(subcommand)]
        action: LogAction,
    },
}

#[derive(Subcommand)]
pub enum ConfigAction {
    Get { key: String },
    Set { key: String, value: String },
}

#[derive(Subcommand)]
pub enum ListTarget {
    Apps,
    Nuked,
    Promoted,
}

#[derive(Subcommand)]
pub enum DetectTarget {
    Metamodule {
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand)]
pub enum MonitorAction {
    Status {
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand)]
pub enum LogAction {
    Tail {
        #[arg(long, default_value = "50")]
        lines: usize,
        #[arg(long)]
        json: bool,
    },
    Clear,
}
