use std::fs;
use std::io::Write;
use std::path::Path;

use anyhow::{Context, Result};

use super::types::Status;
use crate::paths::STATUS_PATH;

impl Status {
    pub fn load() -> Result<Self> {
        let path = Path::new(STATUS_PATH);
        if !path.exists() {
            return Ok(Self::default());
        }

        let contents = fs::read_to_string(path).context("reading status.json")?;
        Ok(serde_json::from_str(&contents).unwrap_or_else(|e| {
            tracing::warn!("corrupt status.json, using defaults: {e}");
            Self::default()
        }))
    }

    pub fn save(&self) -> Result<()> {
        let json = serde_json::to_string_pretty(self).context("serializing status")?;
        let tmp = format!("{STATUS_PATH}.tmp");

        let mut f = fs::File::create(&tmp).context("creating status.json.tmp")?;
        f.write_all(json.as_bytes()).context("writing status.json.tmp")?;
        f.sync_all().context("syncing status.json.tmp")?;

        fs::rename(&tmp, STATUS_PATH).context("renaming status.json.tmp to status.json")?;
        Ok(())
    }
}
