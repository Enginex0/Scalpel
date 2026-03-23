pub const SCALPEL_DATA: &str = "/data/adb/scalpel";
pub const CONFIG_PATH: &str = "/data/adb/scalpel/config.toml";
pub const CONFIG_BACKUP: &str = "/data/adb/scalpel/config.toml.bak";
pub const LEGACY_CONFIG: &str = "/data/adb/scalpel/config.sh";
pub const BOOTCOUNT_PATH: &str = "/data/adb/scalpel/count.sh";
pub const STATUS_PATH: &str = "/data/adb/scalpel/status.json";
pub const APP_LIST_PATH: &str = "/data/adb/scalpel/app_list.json";
pub const NUKE_LIST_PATH: &str = "/data/adb/scalpel/nuke_list.json";
pub const SYSTEMIZE_LIST_PATH: &str = "/data/adb/scalpel/systemize_list.json";
pub const PENDING_DEMOTE_PATH: &str = "/data/adb/scalpel/pending_demote.json";
pub const CATEGORIES_PATH: &str = "/data/adb/scalpel/categories.json";
pub const RAW_WHITEOUTS_PATH: &str = "/data/adb/scalpel/raw_whiteouts.txt";
pub const LOG_FILE: &str = "/data/adb/scalpel/debug.log";
pub const MONITOR_PID: &str = "/data/adb/scalpel/monitor.pid";
pub const LOCK_PATH: &str = "/data/adb/scalpel/.lock";
pub const ICON_DIR: &str = "/data/adb/scalpel/icons";
pub const MODULES_DIR: &str = "/data/adb/modules";
pub const BOOT_GATE_DIR: &str = "/data/adb/scalpel/boot_completed_handled";
pub const GUARD_DIR: &str = "/data/adb/scalpel/guard";
pub const SNAPSHOT_PATH: &str = "/data/adb/scalpel/snapshot.json";
pub const PENDING_RESET: &str = "/data/adb/scalpel/pending_reset";

pub const SYSTEM_PARTITIONS: &[&str] = &[
    "system", "vendor", "product", "system_ext", "odm", "oem",
];

pub const VENDOR_PARTITIONS: &[&str] = &[
    "mi_ext",
    "my_bigball", "my_carrier", "my_company", "my_engineering",
    "my_heytap", "my_manifest", "my_preload", "my_product",
    "my_region", "my_reserve", "my_stock",
];

pub fn mod_dir() -> &'static str {
    "/data/adb/modules/scalpel"
}

pub fn data_dir() -> &'static str {
    "/data/adb/scalpel"
}
