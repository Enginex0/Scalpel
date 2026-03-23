use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::Result;

use crate::core::detect::detect_aapt;
use crate::core::types::{CategoriesFile, Category, ScannedApp};
use crate::paths;
use crate::utils::fs::atomic_write;

pub fn scan(data_dir: &Path) -> Result<Vec<ScannedApp>> {
    let app_list_path = data_dir.join("app_list.json");
    if app_list_path.exists() {
        let raw = fs::read_to_string(&app_list_path)?;
        let apps: Vec<ScannedApp> = serde_json::from_str(&raw)?;
        return Ok(apps);
    }

    let categories = load_categories(data_dir)?;
    let aapt = detect_aapt();
    let icon_dir = data_dir.join("icons");
    fs::create_dir_all(&icon_dir)?;

    let (pkg_map, dir_pkg_map) = build_package_map();
    let partitions = scan_partitions();
    let mut apps = Vec::new();

    for partition in &partitions {
        let part_name = partition_name(partition);
        for (subdir, is_priv) in [("app", false), ("priv-app", true)] {
            let base = partition.join(subdir);
            if !base.exists() {
                continue;
            }
            let entries = match fs::read_dir(&base) {
                Ok(e) => e,
                Err(_) => continue,
            };
            for entry in entries.flatten() {
                let ft = match entry.file_type() {
                    Ok(ft) => ft,
                    Err(_) => continue,
                };
                if !ft.is_dir() {
                    continue;
                }
                let app_dir = entry.path();
                let apk = match find_apk(&app_dir) {
                    Some(a) => a,
                    None => continue,
                };

                let dir_name = app_dir
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();

                let badging = run_aapt_badging(&apk, aapt.as_deref());

                let apk_canonical = fs::canonicalize(&apk).unwrap_or_else(|_| apk.clone());
                let pkg = pkg_map
                    .get(&apk_canonical)
                    .cloned()
                    .or_else(|| dir_pkg_map.get(&dir_name).cloned())
                    .or_else(|| parse_package_name(badging.as_deref()))
                    .unwrap_or_else(|| dir_name.clone());

                let name = parse_app_name(badging.as_deref(), &dir_name);
                let category = get_category(&pkg, &categories);
                let is_split = is_split_apk(&app_dir);

                apps.push(ScannedApp {
                    package_name: pkg.clone(),
                    app_name: name,
                    app_path: apk.to_string_lossy().to_string(),
                    partition: part_name.clone(),
                    category,
                    is_priv_app: is_priv,
                    is_split,
                });

                extract_icon_from_badging(&apk, &pkg, &icon_dir, badging.as_deref());
            }
        }
    }

    let json = serde_json::to_string_pretty(&apps)?;
    atomic_write(&data_dir.join("app_list.json"), &json)?;
    Ok(apps)
}

pub fn refresh(data_dir: &Path) -> Result<Vec<ScannedApp>> {
    let app_list_path = data_dir.join("app_list.json");
    if app_list_path.exists() {
        let _ = fs::remove_file(&app_list_path);
    }
    scan(data_dir)
}

pub fn regenerate_icons(data_dir: &Path) -> Result<u32> {
    let app_list_path = data_dir.join("app_list.json");
    if !app_list_path.exists() {
        return Ok(0);
    }
    let raw = fs::read_to_string(&app_list_path)?;
    let apps: Vec<ScannedApp> = serde_json::from_str(&raw)?;

    let aapt = detect_aapt();
    let icon_dir = data_dir.join("icons");
    fs::create_dir_all(&icon_dir)?;

    if let Ok(entries) = fs::read_dir(&icon_dir) {
        for entry in entries.flatten() {
            let _ = fs::remove_file(entry.path());
        }
    }

    let mut count = 0u32;
    for app in &apps {
        let apk = Path::new(&app.app_path);
        let badging = run_aapt_badging(apk, aapt.as_deref());
        extract_icon_from_badging(apk, &app.package_name, &icon_dir, badging.as_deref());
        let dest = icon_dir.join(format!("{}.png", app.package_name));
        if dest.exists() {
            count += 1;
        }
    }
    Ok(count)
}

fn build_package_map() -> (HashMap<PathBuf, String>, HashMap<String, String>) {
    let mut path_map = HashMap::new();
    let mut dir_map = HashMap::new();
    let output = match Command::new("pm")
        .args(["list", "packages", "-f"])
        .output()
    {
        Ok(o) => o,
        Err(_) => return (path_map, dir_map),
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let line = line.trim();
        let rest = match line.strip_prefix("package:") {
            Some(r) => r,
            None => continue,
        };
        if let Some(eq_pos) = rest.rfind('=') {
            let path = &rest[..eq_pos];
            let pkg = &rest[eq_pos + 1..];
            if !path.is_empty() && !pkg.is_empty() {
                let path_buf = PathBuf::from(path);
                let canonical = fs::canonicalize(&path_buf).unwrap_or_else(|_| path_buf.clone());
                path_map.insert(canonical, pkg.to_string());
                if let Some(dir_name) = path_buf.parent().and_then(|p| p.file_name()) {
                    dir_map.entry(dir_name.to_string_lossy().to_string())
                        .or_insert_with(|| pkg.to_string());
                }
            }
        }
    }
    (path_map, dir_map)
}

fn scan_partitions() -> Vec<PathBuf> {
    let mut partitions = Vec::new();
    let mounts = fs::read_to_string("/proc/mounts").unwrap_or_default();

    for line in mounts.lines() {
        let mount_point = match line.split_whitespace().nth(1) {
            Some(m) => m,
            None => continue,
        };
        let name = mount_point.trim_start_matches('/');
        if crate::paths::SYSTEM_PARTITIONS.contains(&name)
            || crate::paths::VENDOR_PARTITIONS.contains(&name)
        {
            partitions.push(PathBuf::from(mount_point));
        }
    }

    for sub in crate::paths::SYSTEM_PARTITIONS {
        if *sub == "system" {
            continue;
        }
        let p = PathBuf::from(format!("/system/{sub}"));
        if p.exists() && !partitions.iter().any(|pp| *pp == PathBuf::from(format!("/{sub}"))) {
            partitions.push(p);
        }
    }

    partitions.sort();
    partitions.dedup();
    partitions
}

fn partition_name(mount_path: &Path) -> String {
    let s = mount_path.to_string_lossy();
    if let Some(sub) = s.strip_prefix("/system/") {
        return sub.to_string();
    }
    s.trim_start_matches('/').to_string()
}

fn is_split_apk(dir: &Path) -> bool {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return false,
    };
    let apk_count = entries
        .flatten()
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "apk")
                .unwrap_or(false)
        })
        .count();
    apk_count > 1
}

fn find_apk(dir: &Path) -> Option<PathBuf> {
    let base = dir.join("base.apk");
    if base.exists() {
        return Some(base);
    }
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map(|e| e == "apk").unwrap_or(false) {
            return Some(path);
        }
    }
    None
}

fn load_categories(data_dir: &Path) -> Result<CategoriesFile> {
    let path = data_dir.join("categories.json");
    if !path.exists() {
        let fallback = Path::new(paths::mod_dir()).join("data/categories.json");
        if fallback.exists() {
            let raw = fs::read_to_string(&fallback)?;
            return Ok(serde_json::from_str(&raw)?);
        }
        return Ok(CategoriesFile {
            categories: Vec::new(),
            apps: HashMap::new(),
        });
    }
    let raw = fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&raw)?)
}

fn get_category(pkg: &str, categories: &CategoriesFile) -> Category {
    let cat_id = match categories.apps.get(pkg) {
        Some(id) => id.as_str(),
        None => return Category::Unknown,
    };
    match cat_id {
        "essential" => Category::Essential,
        "caution" => Category::Caution,
        "safe" => Category::Safe,
        "google" => Category::Google,
        _ => Category::Unknown,
    }
}

fn run_aapt_badging(apk: &Path, aapt: Option<&Path>) -> Option<String> {
    let aapt_path = aapt?;
    let output = Command::new(aapt_path)
        .args(["dump", "badging", &apk.to_string_lossy()])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if stdout.is_empty() { None } else { Some(stdout) }
}

fn parse_app_name(badging: Option<&str>, fallback: &str) -> String {
    if let Some(output) = badging {
        if let Some(label) = output
            .lines()
            .find_map(|l| l.strip_prefix("application-label:'").and_then(|r| r.strip_suffix("'")))
        {
            if !label.is_empty() {
                return label.to_string();
            }
        }
    }
    fallback.to_string()
}

fn parse_package_name(badging: Option<&str>) -> Option<String> {
    let output = badging?;
    for line in output.lines() {
        if line.starts_with("package:") {
            if let Some(start) = line.find("name='") {
                let rest = &line[start + 6..];
                if let Some(end) = rest.find('\'') {
                    let pkg = &rest[..end];
                    if !pkg.is_empty() {
                        return Some(pkg.to_string());
                    }
                }
            }
        }
    }
    None
}

fn extract_icon_from_badging(apk: &Path, pkg: &str, icon_dir: &Path, badging: Option<&str>) {
    let dest = icon_dir.join(format!("{pkg}.png"));
    if dest.exists() {
        return;
    }

    let icon_path = badging.and_then(parse_icon_path);

    let file = match fs::File::open(apk) {
        Ok(f) => f,
        Err(_) => return,
    };
    let mut archive = match zip::ZipArchive::new(file) {
        Ok(a) => a,
        Err(_) => return,
    };

    if let Some(ref path) = icon_path {
        if !path.ends_with(".xml") {
            if let Some(buf) = read_zip_entry(&mut archive, path) {
                if is_png(&buf) {
                    let _ = fs::write(&dest, &buf);
                    return;
                }
            }
        }
    }

    let mut best: Option<(usize, Vec<u8>)> = None;
    for i in 0..archive.len() {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.name().to_string();
        if !is_icon_candidate(&name) {
            continue;
        }
        let mut buf = Vec::new();
        if entry.read_to_end(&mut buf).is_err() {
            continue;
        }
        if !is_png(&buf) {
            continue;
        }
        let size = buf.len();
        if best.as_ref().map(|(s, _)| size > *s).unwrap_or(true) {
            best = Some((size, buf));
        }
    }

    if let Some((_, buf)) = best {
        let _ = fs::write(&dest, &buf);
    }
}

fn parse_icon_path(aapt_output: &str) -> Option<String> {
    for line in aapt_output.lines() {
        if line.starts_with("application-icon-") {
            if let Some(start) = line.find('\'') {
                let rest = &line[start + 1..];
                if let Some(end) = rest.find('\'') {
                    let path = &rest[..end];
                    if !path.is_empty() {
                        return Some(path.to_string());
                    }
                }
            }
        }
    }
    for line in aapt_output.lines() {
        if line.starts_with("application:") {
            if let Some(start) = line.find("icon='") {
                let rest = &line[start + 6..];
                if let Some(end) = rest.find('\'') {
                    let path = &rest[..end];
                    if !path.is_empty() {
                        return Some(path.to_string());
                    }
                }
            }
        }
    }
    None
}

fn read_zip_entry(archive: &mut zip::ZipArchive<fs::File>, name: &str) -> Option<Vec<u8>> {
    let mut entry = archive.by_name(name).ok()?;
    let mut buf = Vec::new();
    entry.read_to_end(&mut buf).ok()?;
    Some(buf)
}

fn is_png(buf: &[u8]) -> bool {
    buf.len() >= 4 && buf[0] == 0x89 && buf[1] == 0x50 && buf[2] == 0x4E && buf[3] == 0x47
}

fn is_icon_candidate(zip_entry_name: &str) -> bool {
    if zip_entry_name.ends_with(".xml") {
        return false;
    }
    if !zip_entry_name.ends_with(".png") && !zip_entry_name.ends_with(".webp") {
        return false;
    }
    let lower = zip_entry_name.to_lowercase();
    (lower.contains("mipmap") || lower.contains("drawable"))
        && (lower.contains("launcher") || lower.contains("ic_launcher") || lower.contains("icon"))
}
