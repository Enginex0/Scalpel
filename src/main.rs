use std::fs;
use std::io::{self, Read};
use std::path::Path;

use anyhow::{bail, Context, Result};
use clap::Parser;
use serde::Serialize;
use tracing::info;

use scalpel::cli::{Cli, Commands, ConfigAction, DetectTarget, ListTarget, LogAction, MonitorAction};
use scalpel::core::bootloop;
use scalpel::core::config::Config;
use scalpel::core::detect;
use scalpel::core::diagnostics;
use scalpel::core::logging;
use scalpel::core::types::{BootStage, NukeEntry, ScannedApp, Status, SystemizeEntry, SystemizeTarget};
use scalpel::debloat::default_debloat;
use scalpel::debloat::nuke;
use scalpel::debloat::scanner;
use scalpel::description;
use scalpel::guard;
use scalpel::monitor;
use scalpel::paths;
use scalpel::post_boot;
use scalpel::systemize::{demote, promote};
use scalpel::utils::signal;

fn main() -> Result<()> {
    let cli = Cli::parse();
    let config = Config::load(None)?;
    logging::init(cli.verbose, &config.log)?;
    signal::register_shutdown_handler();

    match cli.command {
        Commands::BootInit { stage } => handle_boot_init(stage),
        Commands::PostBoot => handle_post_boot(),
        Commands::Scan { refresh, icons_only, json } => handle_scan(refresh, icons_only, json),
        Commands::Nuke { mode, json } => handle_nuke(mode, json),
        Commands::Restore { package } => handle_restore(&package),
        Commands::Promote { package, target, name } => {
            handle_promote(&package, &target, name.as_deref())
        }
        Commands::Demote { package } => handle_demote(&package),
        Commands::Verify { json } => handle_verify(json),
        Commands::Status { json, boot_info } => handle_status(json, boot_info),
        Commands::Detect { what } => handle_detect(what),
        Commands::Diagnose { output } => handle_diagnose(output.as_deref()),
        Commands::ExportPackages { output } => handle_export_packages(&output),
        Commands::Monitor { action } => handle_monitor(action),
        Commands::Config { action } => handle_config(action),
        Commands::List { what } => handle_list(what),
        Commands::SyncDescription => handle_sync_description(),
        Commands::WebUiInit => handle_webui_init(),
        Commands::Install { modpath, apply_default } => handle_install(&modpath, apply_default),
        Commands::Uninstall => handle_uninstall(),
        Commands::Version => {
            println!("v{}", env!("CARGO_PKG_VERSION"));
            Ok(())
        }
        Commands::Log { action } => handle_log(action),
    }
}

fn handle_boot_init(stage: BootStage) -> Result<()> {
    let mod_dir = Path::new(paths::mod_dir());
    let data_dir = Path::new(paths::data_dir());

    match stage {
        BootStage::PostFsData => {
            let gate = Path::new(paths::BOOT_GATE_DIR);
            if gate.exists() {
                let _ = fs::remove_dir_all(gate);
            }

            let config = Config::load(None)?;
            if config.guard.enabled {
                guard::markers::record_marker("boot", config.guard.marker_threshold)?;
            }

            let count = bootloop::bootloop_init()?;
            bootloop::bootloop_check(mod_dir)?;
            info!(count, "post-fs-data init");

            nuke::nuke_run(None)?;
        }
        BootStage::Service => {
            info!("service stage — spawning monitor");
            let _ = std::process::Command::new(std::env::current_exe()?)
                .args(["monitor"])
                .spawn();
        }
        BootStage::BootCompleted => {
            post_boot::post_boot_run(mod_dir, data_dir)?;
            guard::markers::clear_all()?;
        }
    }
    Ok(())
}

fn handle_post_boot() -> Result<()> {
    let mod_dir = Path::new(paths::mod_dir());
    let data_dir = Path::new(paths::data_dir());
    post_boot::post_boot_run(mod_dir, data_dir)
}

fn handle_scan(refresh: bool, icons_only: bool, json: bool) -> Result<()> {
    let data_dir = Path::new(paths::data_dir());

    if icons_only {
        let count = scanner::regenerate_icons(data_dir)?;
        if json {
            println!("{}", serde_json::to_string(&serde_json::json!({"icons": count}))?);
        } else {
            println!("{count} icons regenerated");
        }
        return Ok(());
    }

    let apps = if refresh {
        scanner::refresh(data_dir)?
    } else {
        scanner::scan(data_dir)?
    };

    if json {
        println!("{}", serde_json::to_string(&apps)?);
    } else {
        println!("{} apps scanned", apps.len());
    }
    Ok(())
}

fn handle_nuke(mode: Option<String>, json: bool) -> Result<()> {
    if json {
        let mut input = String::new();
        io::stdin().read_to_string(&mut input)?;
        let new_entries: Vec<NukeEntry> =
            serde_json::from_str(&input).context("parsing nuke list from stdin")?;

        let nuke_path = Path::new(paths::NUKE_LIST_PATH);
        let mut existing: Vec<NukeEntry> = if nuke_path.exists() {
            serde_json::from_str(&fs::read_to_string(nuke_path).unwrap_or_default())
                .unwrap_or_default()
        } else {
            Vec::new()
        };

        let known: std::collections::HashSet<String> =
            existing.iter().map(|e| e.package_name.clone()).collect();
        existing.extend(
            new_entries.into_iter().filter(|e| !known.contains(&e.package_name))
        );

        let list_json = serde_json::to_string_pretty(&existing)?;
        scalpel::utils::fs::atomic_write(nuke_path, &list_json)?;

        let result = nuke::nuke_run(mode.as_deref())?;
        println!(
            "{}",
            serde_json::to_string(&serde_json::json!({
                "ok": result.ok,
                "failed": result.failed
            }))?
        );
    } else {
        let result = nuke::nuke_run(mode.as_deref())?;
        println!("{} debloated, {} failed (mode: {})", result.ok, result.failed, result.mode);
    }
    refresh_description();
    Ok(())
}

fn handle_restore(package: &str) -> Result<()> {
    let nuke_path = Path::new(paths::NUKE_LIST_PATH);
    if !nuke_path.exists() {
        bail!("no nuke list found");
    }
    let content = fs::read_to_string(nuke_path)?;
    let entries: Vec<NukeEntry> = serde_json::from_str(&content)?;
    let entry = entries
        .iter()
        .find(|e| e.package_name == package)
        .context("package not in nuke list")?;

    nuke::nuke_restore(package, &entry.app_path)?;
    refresh_description();
    println!("ok");
    Ok(())
}

fn handle_promote(package: &str, target: &str, name: Option<&str>) -> Result<()> {
    let sys_target = match target {
        "app" => SystemizeTarget::App,
        "priv-app" => SystemizeTarget::PrivApp,
        _ => bail!("invalid target: {target} (expected 'app' or 'priv-app')"),
    };
    let mod_dir = Path::new(paths::mod_dir());
    promote::promote_app(package, sys_target, name, mod_dir)?;
    refresh_description();
    println!("ok");
    Ok(())
}

fn handle_demote(package: &str) -> Result<()> {
    demote::demote_app(package)?;
    refresh_description();
    println!("ok");
    Ok(())
}

fn refresh_description() {
    let mod_dir = Path::new(paths::mod_dir());
    let root_mgr = detect::detect_root_manager().unwrap_or(scalpel::core::types::RootManager::Magisk);
    let _ = description::update_description(mod_dir, root_mgr);
}

fn handle_verify(json: bool) -> Result<()> {
    let mod_dir = Path::new(paths::mod_dir());

    let config = Config::load(None)?;
    let caps = detect::detect_capabilities(mod_dir);
    let mode = scalpel::debloat::detect_best_mode(&caps, &config);

    let nuke_list = load_json_list::<NukeEntry>(paths::NUKE_LIST_PATH);
    let sys_list = load_json_list::<SystemizeEntry>(paths::SYSTEMIZE_LIST_PATH);

    let mut debloat_ok = 0u32;
    let mut debloat_broken = 0u32;
    for entry in &nuke_list {
        match mode.verify(&entry.package_name, Path::new(&entry.app_path), mod_dir) {
            Ok(true) => debloat_ok += 1,
            _ => debloat_broken += 1,
        }
    }

    let mut sys_ok = 0u32;
    let mut sys_broken = 0u32;
    for entry in &sys_list {
        if Path::new(&entry.system_path).exists() {
            sys_ok += 1;
        } else {
            sys_broken += 1;
        }
    }

    if json {
        println!(
            "{}",
            serde_json::to_string(&serde_json::json!({
                "debloat_verified": debloat_ok,
                "debloat_broken": debloat_broken,
                "systemize_verified": sys_ok,
                "systemize_broken": sys_broken,
            }))?
        );
    } else {
        println!("debloat: {debloat_ok} ok, {debloat_broken} broken");
        println!("systemize: {sys_ok} ok, {sys_broken} broken");
    }

    let mut status = Status::load().unwrap_or_default();
    status.debloat_verified = Some(debloat_ok);
    status.debloat_broken = Some(debloat_broken);
    status.systemize_verified = Some(sys_ok);
    status.systemize_broken = Some(sys_broken);
    status.save()?;

    Ok(())
}

fn handle_status(json: bool, boot_info: bool) -> Result<()> {
    if boot_info && json {
        let count = bootloop::read_bootcount();
        println!(
            "{}",
            serde_json::to_string(&BootInfo { boot_count: count })?
        );
        return Ok(());
    }

    let status = Status::load()?;
    if json {
        println!("{}", serde_json::to_string(&status)?);
    } else {
        println!("mode: {}", status.mode);
        println!("debloated: {}", status.debloated);
        println!("debloat_failed: {}", status.debloat_failed);
        println!("systemized: {}", status.systemized);
        if let Some(v) = status.debloat_verified {
            println!("debloat_verified: {v}");
        }
        if let Some(b) = status.debloat_broken {
            println!("debloat_broken: {b}");
        }
        if let Some(v) = status.systemize_verified {
            println!("systemize_verified: {v}");
        }
        if let Some(b) = status.systemize_broken {
            println!("systemize_broken: {b}");
        }
        if let Some(ref t) = status.last_nuke {
            println!("last_nuke: {t}");
        }
        if let Some(ref repairs) = status.monitor_repairs {
            println!("monitor_repairs: {repairs}");
        }
    }
    Ok(())
}

fn handle_detect(what: DetectTarget) -> Result<()> {
    match what {
        DetectTarget::Metamodule { json } => {
            let meta = detect::detect_metamodule();
            if json {
                match meta {
                    Some(id) => {
                        println!(
                            "{}",
                            serde_json::to_string(&MetamoduleInfo {
                                id: id.clone(),
                                name: id,
                            })?
                        );
                    }
                    None => println!("null"),
                }
            } else {
                match meta {
                    Some(id) => println!("metamodule: {id}"),
                    None => println!("no metamodule detected"),
                }
            }
        }
    }
    Ok(())
}

fn handle_diagnose(output: Option<&Path>) -> Result<()> {
    let mod_dir = Path::new(paths::mod_dir());
    let data_dir = Path::new(paths::data_dir());

    if let Some(out_path) = output {
        let _guard = StdoutRedirect::new(out_path)?;
        diagnostics::diagnostics_dump(mod_dir, data_dir)?;
    } else {
        diagnostics::diagnostics_dump(mod_dir, data_dir)?;
    }
    Ok(())
}

fn handle_export_packages(output: &Path) -> Result<()> {
    let data_dir = Path::new(paths::data_dir());
    let apps = scanner::scan(data_dir)?;
    let json = serde_json::to_string_pretty(&apps)?;
    fs::write(output, json)?;
    println!("exported {} packages to {}", apps.len(), output.display());
    Ok(())
}

fn handle_monitor(action: Option<MonitorAction>) -> Result<()> {
    match action {
        Some(MonitorAction::Status { json }) => {
            let pid_path = Path::new(paths::MONITOR_PID);
            let running = if let Ok(content) = fs::read_to_string(pid_path) {
                content
                    .trim()
                    .parse::<i32>()
                    .map(scalpel::utils::process::is_pid_alive)
                    .unwrap_or(false)
            } else {
                false
            };

            let config = Config::load(None)?;
            if json {
                println!(
                    "{}",
                    serde_json::to_string(&MonitorInfo {
                        running,
                        interval: config.monitor.interval,
                    })?
                );
            } else {
                println!(
                    "monitor: {} (interval: {}s)",
                    if running { "running" } else { "stopped" },
                    config.monitor.interval
                );
            }
        }
        None => {
            monitor::monitor_supervised()?;
        }
    }
    Ok(())
}

fn handle_config(action: ConfigAction) -> Result<()> {
    match action {
        ConfigAction::Get { key } => {
            let config = Config::load(None)?;
            match config.get(&key) {
                Some(val) => println!("{val}"),
                None => bail!("unknown config key: {key}"),
            }
        }
        ConfigAction::Set { key, value } => {
            let mut config = Config::load(None)?;
            config.set(&key, &value)?;
            config.save()?;
            println!("ok");
        }
    }
    Ok(())
}

fn handle_list(what: ListTarget) -> Result<()> {
    match what {
        ListTarget::Apps => {
            let data_dir = Path::new(paths::data_dir());
            let apps = scanner::scan(data_dir)?;
            println!("{}", serde_json::to_string(&apps)?);
        }
        ListTarget::Nuked => {
            let list = load_json_list::<NukeEntry>(paths::NUKE_LIST_PATH);
            println!("{}", serde_json::to_string(&list)?);
        }
        ListTarget::Promoted => {
            let list = promote::list_promoted()?;
            println!("{}", serde_json::to_string(&list)?);
        }
    }
    Ok(())
}

fn handle_sync_description() -> Result<()> {
    let mod_dir = Path::new(paths::mod_dir());
    let root_mgr = detect::detect_root_manager()?;
    description::update_description(mod_dir, root_mgr)?;
    println!("ok");
    Ok(())
}

fn handle_webui_init() -> Result<()> {
    let data_dir = Path::new(paths::data_dir());
    let scanned_apps = scanner::scan(data_dir).unwrap_or_default();
    let nuked_apps = load_json_list::<NukeEntry>(paths::NUKE_LIST_PATH);
    let promoted_apps = promote::list_promoted().unwrap_or_default();
    let status = Status::load().unwrap_or_default();
    let boot_count = bootloop::read_bootcount();

    let pid_path = Path::new(paths::MONITOR_PID);
    let monitor_running = fs::read_to_string(pid_path)
        .ok()
        .and_then(|s| s.trim().parse::<i32>().ok())
        .map(scalpel::utils::process::is_pid_alive)
        .unwrap_or(false);

    let config = Config::load(None)?;
    let metamodule = detect::detect_metamodule().map(|id| MetamoduleInfo {
        id: id.clone(),
        name: id,
    });

    let response = WebUiInitResponse {
        scanned_apps,
        nuked_apps,
        promoted_apps,
        status,
        boot_info: BootInfo { boot_count },
        monitor_info: MonitorInfo {
            running: monitor_running,
            interval: config.monitor.interval,
        },
        version: env!("CARGO_PKG_VERSION").to_string(),
        metamodule,
    };

    println!("{}", serde_json::to_string(&response)?);
    Ok(())
}

fn handle_install(modpath: &Path, apply_default: Option<bool>) -> Result<()> {
    let data_dir = Path::new(paths::data_dir());
    fs::create_dir_all(data_dir)?;

    let dest_cat = data_dir.join("categories.json");
    if !dest_cat.exists() {
        let src_cat = modpath.join("data/categories.json");
        if src_cat.exists() {
            fs::copy(&src_cat, &dest_cat)?;
        }
    }

    let legacy = Path::new(paths::LEGACY_CONFIG);
    if legacy.exists() && !Path::new(paths::CONFIG_PATH).exists() {
        let migrated = Config::migrate_from_shell(legacy)?;
        migrated.save()?;
        info!("migrated legacy config");
    }

    if apply_default.unwrap_or(false) {
        // Fresh slate — remove old debloat/systemize state so WebUI isn't confused
        for stale in [
            paths::NUKE_LIST_PATH,
            paths::SYSTEMIZE_LIST_PATH,
            paths::PENDING_DEMOTE_PATH,
            paths::STATUS_PATH,
        ] {
            fs::remove_file(stale).ok();
        }

        let data_dir = Path::new(paths::data_dir());
        let entries = default_debloat::apply_default_debloat(data_dir)?;
        info!(count = entries.len(), "default debloat applied");
    }

    println!("ok");
    Ok(())
}

fn handle_uninstall() -> Result<()> {
    let data_dir = Path::new(paths::data_dir());
    let mod_dir = Path::new(paths::mod_dir());

    let pid_file = data_dir.join("monitor.pid");
    if let Ok(pid_str) = fs::read_to_string(&pid_file) {
        if let Ok(pid) = pid_str.trim().parse::<i32>() {
            unsafe { libc::kill(pid, libc::SIGTERM); }
        }
    }

    let nuke_list = load_json_list::<NukeEntry>(paths::NUKE_LIST_PATH);
    let config = Config::load(None).unwrap_or_default();
    let caps = detect::detect_capabilities(mod_dir);
    let mode = scalpel::debloat::detect_best_mode(&caps, &config);

    for entry in &nuke_list {
        let _ = mode.restore(&entry.package_name, Path::new(&entry.app_path), mod_dir);
    }

    let sys_list = load_json_list::<SystemizeEntry>(paths::SYSTEMIZE_LIST_PATH);
    for entry in &sys_list {
        let _ = scalpel::utils::cmd::run_pm(&["enable", &entry.package_name]);
        let _ = scalpel::utils::cmd::run_pm(&["install-existing", &entry.package_name]);
    }

    // Wipe overlay so KSU stops mounting stale whiteouts/systemize dirs
    let system_dir = mod_dir.join("system");
    if system_dir.exists() {
        let _ = fs::remove_dir_all(&system_dir);
    }

    let _ = fs::remove_dir_all(data_dir);

    println!("ok");
    Ok(())
}

fn handle_log(action: LogAction) -> Result<()> {
    match action {
        LogAction::Tail { lines, json } => {
            let content = fs::read_to_string(paths::LOG_FILE).unwrap_or_default();
            let all_lines: Vec<&str> = content.lines().collect();
            let start = all_lines.len().saturating_sub(lines);
            let tail: Vec<&str> = all_lines[start..].to_vec();

            if json {
                println!("{}", serde_json::to_string(&tail)?);
            } else {
                for line in &tail {
                    println!("{line}");
                }
            }
        }
        LogAction::Clear => {
            let _ = fs::write(paths::LOG_FILE, "");
            println!("ok");
        }
    }
    Ok(())
}

fn load_json_list<T: serde::de::DeserializeOwned>(path: &str) -> Vec<T> {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[derive(Serialize)]
struct WebUiInitResponse {
    scanned_apps: Vec<ScannedApp>,
    nuked_apps: Vec<NukeEntry>,
    promoted_apps: Vec<SystemizeEntry>,
    status: Status,
    boot_info: BootInfo,
    monitor_info: MonitorInfo,
    version: String,
    metamodule: Option<MetamoduleInfo>,
}

#[derive(Serialize)]
struct BootInfo {
    boot_count: i32,
}

#[derive(Serialize)]
struct MonitorInfo {
    running: bool,
    interval: u32,
}

#[derive(Serialize)]
struct MetamoduleInfo {
    id: String,
    name: String,
}

struct StdoutRedirect {
    _file: fs::File,
}

impl StdoutRedirect {
    fn new(path: &Path) -> Result<Self> {
        use std::os::unix::io::AsRawFd;
        let file = fs::File::create(path)?;
        unsafe {
            libc::dup2(file.as_raw_fd(), 1);
        }
        Ok(Self { _file: file })
    }
}
