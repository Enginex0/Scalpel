use std::fs;
use std::path::Path;
use std::process::Command;

use anyhow::Result;

use crate::core::bootloop::read_bootcount;
use crate::core::config::Config;
use crate::core::detect::{detect_root_manager, detect_zeromount};
use crate::core::types::{NukeEntry, Status, SystemizeEntry};
use crate::paths;

pub fn diagnostics_dump(mod_dir: &Path, data_dir: &Path) -> Result<()> {
    section("System Info");
    print_system_info();

    section("Root Manager");
    match detect_root_manager() {
        Ok(rm) => println!("  type: {rm:?}"),
        Err(e) => println!("  detection failed: {e}"),
    }

    section("Module State");
    print_module_state(mod_dir);

    section("Config");
    match Config::load(None) {
        Ok(cfg) => println!("{}", toml::to_string_pretty(&cfg).unwrap_or_default()),
        Err(e) => println!("  failed to load: {e}"),
    }

    section("Status");
    match Status::load() {
        Ok(status) => println!("{}", serde_json::to_string_pretty(&status).unwrap_or_default()),
        Err(e) => println!("  failed to load: {e}"),
    }

    section("Boot Counter");
    println!("  count: {}", read_bootcount());

    section("Nuke List");
    print_json_list::<NukeEntry>(data_dir, "nuke_list.json");

    section("Systemize List");
    print_json_list::<SystemizeEntry>(data_dir, "systemize_list.json");

    section("Whiteouts");
    print_whiteouts(mod_dir);

    section("ZeroMount Rules");
    print_zm_list();

    section("Monitor");
    print_monitor_status(data_dir);

    section("SELinux");
    print_cmd("getenforce", &[]);

    section("Mounts (scalpel)");
    print_filtered_file("/proc/mounts", "scalpel");

    section("Disk Usage");
    print_cmd("df", &["-h", &mod_dir.to_string_lossy(), &data_dir.to_string_lossy()]);

    section("Kernel Log (scalpel)");
    print_dmesg_grep("scalpel");

    section("Debug Log (last 50 lines)");
    print_tail(paths::LOG_FILE, 50);

    Ok(())
}

fn section(name: &str) {
    println!("\n=== {name} ===");
}

fn print_system_info() {
    let fields = [
        ("ro.product.brand", "brand"),
        ("ro.product.model", "model"),
        ("ro.build.version.release", "android"),
        ("ro.build.version.sdk", "sdk"),
    ];
    for (prop, label) in &fields {
        let val = crate::utils::cmd::run_getprop(prop).unwrap_or_default();
        println!("  {label}: {val}");
    }

    if let Ok(output) = Command::new("uname").arg("-r").output() {
        let kernel = String::from_utf8_lossy(&output.stdout);
        println!("  kernel: {}", kernel.trim());
    }

    if let Ok(output) = Command::new("uptime").arg("-s").output() {
        let up = String::from_utf8_lossy(&output.stdout);
        println!("  up since: {}", up.trim());
    }
}

fn print_module_state(mod_dir: &Path) {
    let disabled = mod_dir.join("disable").exists();
    let update = mod_dir.join("update").exists();
    let remove = mod_dir.join("remove").exists();
    println!("  enabled: {}", !disabled);
    println!("  update pending: {update}");
    println!("  remove pending: {remove}");

    if let Ok(contents) = fs::read_to_string(mod_dir.join("module.prop")) {
        for line in contents.lines() {
            if line.starts_with("version=") || line.starts_with("versionCode=") {
                println!("  {line}");
            }
        }
    }
}

fn print_json_list<T: serde::de::DeserializeOwned + std::fmt::Debug>(
    data_dir: &Path,
    filename: &str,
) {
    let path = data_dir.join(filename);
    match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<Vec<T>>(&content) {
            Ok(list) => {
                println!("  count: {}", list.len());
                for entry in &list {
                    println!("  - {entry:?}");
                }
            }
            Err(e) => println!("  parse error: {e}"),
        },
        Err(_) => println!("  (not found)"),
    }
}

fn print_whiteouts(mod_dir: &Path) {
    let system_dir = mod_dir.join("system");
    if !system_dir.exists() {
        println!("  (no system overlay)");
        return;
    }

    let output = Command::new("find")
        .args([
            &system_dir.to_string_lossy().into_owned(),
            "-type",
            "c",
        ])
        .output();

    match output {
        Ok(o) => {
            let text = String::from_utf8_lossy(&o.stdout);
            if text.trim().is_empty() {
                println!("  (none)");
            } else {
                for line in text.lines() {
                    println!("  {line}");
                }
            }
        }
        Err(e) => println!("  find error: {e}"),
    }
}

fn print_zm_list() {
    match detect_zeromount() {
        Some(zm_bin) => {
            let output = Command::new(&zm_bin).arg("list").output();
            match output {
                Ok(o) => {
                    let text = String::from_utf8_lossy(&o.stdout);
                    if text.trim().is_empty() {
                        println!("  (no rules)");
                    } else {
                        print!("{text}");
                    }
                }
                Err(e) => println!("  zm list error: {e}"),
            }
        }
        None => println!("  (zeromount not available)"),
    }
}

fn print_monitor_status(data_dir: &Path) {
    let pid_path = data_dir.join("monitor.pid");
    match fs::read_to_string(&pid_path) {
        Ok(pid_str) => {
            let pid_str = pid_str.trim();
            if let Ok(pid) = pid_str.parse::<i32>() {
                let alive = crate::utils::process::is_pid_alive(pid);
                println!("  pid: {pid} ({})", if alive { "running" } else { "dead" });
            } else {
                println!("  pid file corrupt: {pid_str}");
            }
        }
        Err(_) => println!("  (not running)"),
    }
}

fn print_cmd(cmd: &str, args: &[&str]) {
    match Command::new(cmd).args(args).output() {
        Ok(o) => print!("{}", String::from_utf8_lossy(&o.stdout)),
        Err(e) => println!("  {cmd} failed: {e}"),
    }
}

fn print_filtered_file(path: &str, filter: &str) {
    match fs::read_to_string(path) {
        Ok(content) => {
            let matches: Vec<&str> = content.lines().filter(|l| l.contains(filter)).collect();
            if matches.is_empty() {
                println!("  (no matches)");
            } else {
                for line in matches {
                    println!("  {line}");
                }
            }
        }
        Err(e) => println!("  read error: {e}"),
    }
}

fn print_dmesg_grep(filter: &str) {
    match Command::new("dmesg").output() {
        Ok(o) => {
            let text = String::from_utf8_lossy(&o.stdout);
            let mut count = 0;
            for line in text.lines() {
                if line.contains(filter) {
                    println!("  {line}");
                    count += 1;
                }
            }
            if count == 0 {
                println!("  (no matches)");
            }
        }
        Err(e) => println!("  dmesg failed: {e}"),
    }
}

fn print_tail(path: &str, n: usize) {
    match fs::read_to_string(path) {
        Ok(content) => {
            let lines: Vec<&str> = content.lines().collect();
            let start = lines.len().saturating_sub(n);
            for line in &lines[start..] {
                println!("  {line}");
            }
        }
        Err(_) => println!("  (no log file)"),
    }
}
