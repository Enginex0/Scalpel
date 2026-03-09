use std::fs;
use std::path::Path;
use std::process::Command;

use crate::paths;

pub fn execute() -> ! {
    let modules_dir = Path::new(paths::MODULES_DIR);

    if let Ok(entries) = fs::read_dir(modules_dir) {
        for entry in entries.flatten() {
            let _ = fs::File::create(entry.path().join("disable"));
        }
    }

    let _ = super::markers::clear_all();

    let desc = "Guard recovery -- modules disabled. Re-enable in module manager.";
    update_module_prop_description(desc);

    let _ = Command::new("/system/bin/svc")
        .args(["power", "reboot"])
        .status();
    let _ = fs::write("/proc/sysrq-trigger", "b");
    std::process::exit(1);
}

fn update_module_prop_description(desc: &str) {
    let prop_path = Path::new(paths::mod_dir()).join("module.prop");
    if let Ok(contents) = fs::read_to_string(&prop_path) {
        let updated: String = contents
            .lines()
            .map(|line| {
                if line.starts_with("description=") {
                    format!("description={desc}")
                } else {
                    line.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        let _ = fs::write(&prop_path, updated);
    }
}
