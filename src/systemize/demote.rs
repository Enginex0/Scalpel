use std::fs;
use std::path::Path;

use anyhow::{Context, Result};

use crate::core::types::{PendingDemote, SystemizeTarget};
use crate::paths;
use crate::systemize::permissions;
use crate::systemize::promote::{
    load_pending_demotions, load_systemize_list, save_pending_demotions, save_systemize_list,
};
use crate::utils::cmd::run_pm;

pub fn demote_app(package: &str) -> Result<()> {
    let mut list = load_systemize_list()?;
    let entry = list
        .iter_mut()
        .find(|e| e.package_name == package)
        .context("package not promoted")?;

    let mut pending = load_pending_demotions()?;
    pending.push(PendingDemote {
        package_name: package.to_string(),
        target: entry.target,
    });
    save_pending_demotions(&pending)?;

    entry.pending_demote = true;
    save_systemize_list(&list)?;

    let _ = run_pm(&["install-existing", package]);

    Ok(())
}

pub fn process_pending_demotions(module_dir: &Path) -> Result<()> {
    let pending = load_pending_demotions()?;
    if pending.is_empty() {
        return Ok(());
    }

    let demoted_pkgs: std::collections::HashSet<&str> =
        pending.iter().map(|e| e.package_name.as_str()).collect();

    for entry in &pending {
        let target_str = match entry.target {
            SystemizeTarget::App => "app",
            SystemizeTarget::PrivApp => "priv-app",
        };
        let dir = module_dir
            .join("system")
            .join(target_str)
            .join(&entry.package_name);
        if dir.exists() {
            fs::remove_dir_all(&dir)?;
        }
        if entry.target == SystemizeTarget::PrivApp {
            let _ = permissions::remove_permissions(&entry.package_name, module_dir);
        }
    }

    // Remove demoted entries from systemize list
    let mut list = load_systemize_list()?;
    let before = list.len();
    list.retain(|e| !demoted_pkgs.contains(e.package_name.as_str()));
    if list.len() != before {
        save_systemize_list(&list)?;
    }

    fs::remove_file(paths::PENDING_DEMOTE_PATH).ok();
    Ok(())
}
