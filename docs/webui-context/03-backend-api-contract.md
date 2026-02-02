# Scalpel Backend -- WebUI API Contract

> Extracted from 27 shell scripts in `/home/claudetest/zero-mount/Scalpel/module/`.
> Every claim cites `file:line`. Zero internal implementation details -- only the API surface.

---

## Directory Structure

```
module/
  action.sh                  # Entry point: KSU/APatch action button, Magisk terminal bridge
  boot-completed.sh          # Entry point: KSU/APatch native boot_completed stage
  customize.sh               # Entry point: module installation (runs scanner, default debloat)
  monitor.sh                 # Stub entry for background daemon (delegates to core/monitor.sh)
  module.prop                # Module metadata (id, name, version, author)
  post-fs-data.sh            # Entry point: early boot (bootloop check + debloat engine)
  service.sh                 # Entry point: late boot (Magisk only -- polls for boot_completed)
  uninstall.sh               # Entry point: module removal (restores all apps, cleans data)
  bin/
    jq                       # Bundled jq binary (persists after install)
    arm64-v8a/aapt           # Architecture-specific aapt (cleaned after install)
    armeabi-v7a/aapt         # Architecture-specific aapt (cleaned after install)
  core/
    bootloop.sh              # Library: 3-strike bootloop protection counter
    config.sh                # Library: persistent config read/write/migrate/backup
    default_debloat.sh       # Library: generates nuke_list.json from safe+google categories
    detect.sh                # Library: mode detection probe chain (6 modes, auto-fallback)
    logging.sh               # Library: 5-level structured logging to kmsg + debug.log
    monitor.sh               # Library: background daemon for periodic verify + auto-repair
    nuke.sh                  # Library: debloat orchestrator (iterates nuke_list, dispatches to mode)
    post_boot.sh             # Library: shared post-boot work (verify, monitor, description update)
    scanner.sh               # Library + CLI: system app discovery engine, writes app_list.json
    verify.sh                # Library + CLI: post-reboot debloat verification
    whiteout_helpers.sh      # Library: shared whiteout create/remove/verify for overlay modes
  modes/
    mode_magisk.sh           # Mode: Magisk magic mount whiteouts
    mode_mountify.sh         # Mode: tmpfs mount overlay
    mode_pm.sh               # Mode: pm disable-user fallback
    mode_symlink.sh          # Mode: opaque overlay directories
    mode_whiteout.sh         # Mode: overlayfs char device whiteouts
    mode_zeromount.sh        # Mode: ZeroMount VFS kernel interception
  systemize/
    permissions.sh           # Library: privapp-permissions XML generator
    promote.sh               # Library + CLI: systemization engine (promote/demote/verify/list)
  webroot/
    categories.json          # Category definitions + package-to-category mappings
```

**Entry points** (executed by root manager at specific lifecycle stages):
- `customize.sh` -- installation (`customize.sh:1-163`)
- `post-fs-data.sh` -- early boot (`post-fs-data.sh:1-28`)
- `service.sh` -- late boot, Magisk only (`service.sh:1-28`)
- `boot-completed.sh` -- after ACTION_BOOT_COMPLETED, KSU/APatch only (`boot-completed.sh:1-11`)
- `action.sh` -- user taps module in root manager (`action.sh:1-128`)
- `uninstall.sh` -- module removal (`uninstall.sh:1-60`)

**Libraries** (sourced by entry points and by each other, never called standalone unless noted):
- `core/scanner.sh` -- also callable as CLI: `sh scanner.sh refresh` or `sh scanner.sh run` (`scanner.sh:188-191`)
- `core/verify.sh` -- also callable as CLI: `sh verify.sh` (`verify.sh:159-161`)
- `core/nuke.sh` -- also callable as CLI: `sh nuke.sh` (`nuke.sh:196-198`)
- `core/monitor.sh` -- also callable as CLI: `sh monitor.sh` (`monitor.sh:179-181`)
- `systemize/promote.sh` -- also callable as CLI: `sh promote.sh {promote|demote|verify|list} [pkg]` (`promote.sh:183-195`)

---

## Runtime Paths

All paths as they exist on the Android device at runtime.

| Path | Purpose | Source |
|------|---------|--------|
| `/data/adb/modules/scalpel/` | Module directory (`$MODDIR`) | `module.prop:1` |
| `/data/adb/scalpel/` | Persistent data directory (`$SCALPEL_DATA`) | `config.sh:5` |
| `/data/adb/scalpel/status.json` | Operation status | `nuke.sh:8` |
| `/data/adb/scalpel/app_list.json` | Scanned system apps | `scanner.sh:7` |
| `/data/adb/scalpel/nuke_list.json` | Apps queued/completed for debloat | `nuke.sh:7` |
| `/data/adb/scalpel/systemize_list.json` | Systemized apps registry | `promote.sh:7` |
| `/data/adb/scalpel/categories.json` | Category DB (copied from webroot at install) | `scanner.sh:8` |
| `/data/adb/scalpel/config.sh` | User configuration (shell variable format) | `config.sh:6` |
| `/data/adb/scalpel/config.sh.bak` | Config backup (bootloop recovery) | `config.sh:7` |
| `/data/adb/scalpel/count.sh` | Bootloop counter | `bootloop.sh:7` |
| `/data/adb/scalpel/debug.log` | Application log | `logging.sh:4` |
| `/data/adb/scalpel/debug.log.1..3` | Rotated log archives | `logging.sh:8` |
| `/data/adb/scalpel/icons/` | Extracted app icons (PNG, keyed by package name) | `scanner.sh:8` |
| `/data/adb/scalpel/icons/{package_name}.png` | Individual app icon | `scanner.sh:77` |
| `/data/adb/scalpel/monitor.pid` | Monitor daemon PID file | `monitor.sh:10` |
| `/data/adb/scalpel/nuke.lock` | Debloat operation lock file | `nuke.sh:64` |
| `/data/adb/scalpel/mountify_mounts.txt` | Mountify mode tracking file | `mode_mountify.sh:7` |
| `/data/adb/scalpel/boot_completed_handled` | One-shot flag for post-boot work | `post_boot.sh:9` |
| `/data/adb/modules/scalpel/bin/jq` | Bundled jq binary | `nuke.sh:13` |
| `/data/adb/modules/scalpel/webroot/` | WebUI static files | `customize.sh:156` |
| `/data/adb/modules/scalpel/system/priv-app/` | Systemized app overlays | `promote.sh:49` |
| `/data/adb/modules/scalpel/system/etc/permissions/` | Priv-app permission XMLs | `permissions.sh:17` |
| `/data/adb/modules/scalpel/disable` | Module disable flag (touched by bootloop recovery) | `bootloop.sh:66` |

---

## JSON Data Structures

### status.json

**Path:** `/data/adb/scalpel/status.json`
**Writers:** `nuke.sh:_write_status` (lines 10-45), `verify.sh:_update_verify_status` (lines 97-152), `monitor.sh:_update_repair_count` (lines 120-137)
**Readers:** `action.sh:_print_status` (lines 15-59), `verify.sh:verify_run` (lines 42-47), `monitor.sh:_check_debloated_apps` (lines 50-51), `post_boot.sh:_finish_deferred_debloat` (lines 20-23), `post_boot.sh:_update_module_description` (lines 67-71)

| Field | Type | Possible Values | Written By | Description |
|-------|------|----------------|------------|-------------|
| `mode` | string | `"zeromount"`, `"mountify"`, `"symlink"`, `"whiteout"`, `"magisk"`, `"pm"`, `"none"`, `"running"`, `"pm_deferred"`, `"error"`, `"unknown"` | nuke.sh | Active debloat mode. `"running"` = in-flight, `"pm_deferred"` = deferred to service.sh, `"none"` = empty nuke list, `"error"` = probe/parse failure |
| `debloated` | integer | 0+ | nuke.sh | Count of successfully debloated apps |
| `debloat_failed` | integer | 0+ | nuke.sh | Count of apps that failed to debloat |
| `systemized` | integer | 0+ | nuke.sh (hardcoded 0) | Count of systemized apps (placeholder, always 0 from nuke.sh) |
| `partial` | boolean | `true`, `false` | nuke.sh | `true` if debloat run hit timeout before completing all packages |
| `last_nuke` | string | ISO 8601 datetime or `"never"` | nuke.sh | Timestamp of last debloat run |
| `timestamp` | integer | Unix epoch seconds | nuke.sh, verify.sh | Raw timestamp for programmatic use |
| `debloat_verified` | integer | 0+ | verify.sh | Count of debloats confirmed holding after reboot |
| `debloat_broken` | integer | 0+ | verify.sh | Count of debloats that reverted after reboot |
| `systemize_verified` | integer | 0+ | verify.sh | Count of verified systemizations (stub: always 0) |
| `systemize_broken` | integer | 0+ | verify.sh | Count of broken systemizations (stub: always 0) |
| `last_verify` | string | ISO 8601 datetime | verify.sh | Timestamp of last verification run |
| `monitor_repairs` | integer | 0+ | monitor.sh | Cumulative count of auto-repairs by monitor daemon |
| `last_monitor` | string | ISO 8601 datetime | monitor.sh | Timestamp of last monitor repair cycle |

**Example:**
```json
{
  "mode": "whiteout",
  "debloated": 12,
  "debloat_failed": 1,
  "systemized": 0,
  "partial": false,
  "last_nuke": "2026-01-31T14:30:00+00:00",
  "timestamp": 1738334400,
  "debloat_verified": 12,
  "debloat_broken": 0,
  "systemize_verified": 0,
  "systemize_broken": 0,
  "last_verify": "2026-01-31T14:31:15+00:00",
  "monitor_repairs": 2,
  "last_monitor": "2026-01-31T15:00:00+00:00"
}
```

**Notes:**
- Fields are incrementally added. After `nuke.sh` runs, only the first 7 fields exist. `verify.sh` merges its fields into the existing object (`verify.sh:112-120`). `monitor.sh` merges `monitor_repairs` and `last_monitor` (`monitor.sh:128-130`).
- The WebUI must handle partial objects -- not all fields will always be present.

---

### app_list.json (Scan Cache)

**Path:** `/data/adb/scalpel/app_list.json`
**Writer:** `scanner.sh:scanner_run` (lines 87-179)
**Readers:** `default_debloat.sh:apply_default_debloat` (lines 21-36), WebUI (primary app listing)

**Schema:** Array of app objects.

| Field | Type | Description | Source |
|-------|------|-------------|--------|
| `package_name` | string | Android package identifier (e.g. `"com.google.android.gm"`) | `scanner.sh:158` |
| `app_name` | string | Human-readable app label (from aapt or directory name fallback) | `scanner.sh:158` |
| `app_path` | string | Absolute path to the APK file (e.g. `"/system/app/Gmail/Gmail.apk"`) | `scanner.sh:158` |
| `partition` | string | `"system"`, `"vendor"`, `"product"`, `"system_ext"`, `"odm"`, `"oem"`, or OEM-specific | `scanner.sh:158` |
| `category` | string | Category ID from categories.json: `"essential"`, `"caution"`, `"safe"`, `"google"`, `"unknown"` | `scanner.sh:158` |
| `is_priv_app` | boolean | `true` if the app lives in a `priv-app/` subdirectory | `scanner.sh:158` |
| `is_split` | boolean | `true` if the app directory contains 2+ APK files (split APK) | `scanner.sh:158` |

**Example:**
```json
[
  {
    "package_name": "com.google.android.gm",
    "app_name": "Gmail",
    "app_path": "/system/app/Gmail/Gmail.apk",
    "partition": "system",
    "category": "google",
    "is_priv_app": false,
    "is_split": false
  },
  {
    "package_name": "com.miui.analytics",
    "app_name": "Analytics",
    "app_path": "/system/priv-app/Analytics/Analytics.apk",
    "partition": "system",
    "category": "safe",
    "is_priv_app": true,
    "is_split": false
  }
]
```

**Notes:**
- Generated once at install (`customize.sh:62-72`). Refreshed on demand via `scanner.sh refresh`.
- Icons are stored separately at `/data/adb/scalpel/icons/{package_name}.png`.
- Partitions scanned include: `/system`, `/vendor`, `/product`, `/system_ext`, `/odm`, `/oem`, plus OEM-specific partitions and symlinked sub-partitions under `/system/` (`scanner.sh:13-33`).

---

### nuke_list.json

**Path:** `/data/adb/scalpel/nuke_list.json`
**Writers:** `default_debloat.sh:apply_default_debloat` (lines 5-80), WebUI (direct write to add/remove apps)
**Readers:** `nuke.sh:nuke_run` (lines 70-166), `verify.sh:verify_run` (lines 20-83), `monitor.sh:_check_debloated_apps` (lines 46-87), `uninstall.sh` (lines 30-41), all `mode_cleanup()` functions, `action.sh` (indirectly via status)

**Schema:** Array of debloat target objects.

| Field | Type | Description | Source |
|-------|------|-------------|--------|
| `app_name` | string | Human-readable app label | `default_debloat.sh:31-33` |
| `package_name` | string | Android package identifier | `default_debloat.sh:31-33` |
| `app_path` | string | Absolute path to the APK file | `default_debloat.sh:31-33` |

**Example:**
```json
[
  {
    "app_name": "Gmail",
    "package_name": "com.google.android.gm",
    "app_path": "/system/app/Gmail/Gmail.apk"
  },
  {
    "app_name": "Analytics",
    "package_name": "com.miui.analytics",
    "app_path": "/system/priv-app/Analytics/Analytics.apk"
  }
]
```

**Notes:**
- This is the authoritative list of what should be debloated. `nuke.sh` iterates it and calls `mode_debloat()` for each entry.
- The WebUI must manage this file directly -- adding entries to debloat, removing entries to restore.
- The `app_path` field is critical: mode scripts use it to locate the app directory (`dirname "$app_path"`).
- `nuke.sh` reads `package_name` and `app_path` via `jq -r '.[] | "\(.package_name)\t\(.app_path)"'` (`nuke.sh:136`).

---

### systemize_list.json

**Path:** `/data/adb/scalpel/systemize_list.json`
**Writer:** `promote.sh:_record_promotion` (lines 96-126), `promote.sh:demote_app` (lines 146-149)
**Readers:** `monitor.sh:_check_systemized_apps` (lines 94-118), `uninstall.sh` (lines 46-54), `action.sh:_print_status` (lines 51-56), `promote.sh:list_promoted` (lines 164-167), `promote.sh:is_promoted` (lines 156-162), `promote.sh:demote_app` (lines 136-138)

**Schema:** Array of systemized app records.

| Field | Type | Description | Source |
|-------|------|-------------|--------|
| `app_name` | string | Derived app directory name (stripped version suffix) | `promote.sh:105-128` |
| `package_name` | string | Android package identifier | `promote.sh:105-128` |
| `original_path` | string | Original APK path in `/data/app/` | `promote.sh:105-128` |
| `system_path` | string | New path in module overlay (`/data/adb/modules/scalpel/system/{app\|priv-app}/...`) | `promote.sh:105-128` |
| `promoted_date` | string | ISO 8601 date (YYYY-MM-DD) | `promote.sh:109` |
| `target` | string | Target directory: `app` or `priv-app` (default: `priv-app` for backward compat) | `promote.sh:107` |

**Example:**
```json
[
  {
    "app_name": "Termux",
    "package_name": "com.termux",
    "original_path": "/data/app/com.termux-abc123/base.apk",
    "system_path": "/data/adb/modules/scalpel/system/priv-app/Termux/base.apk",
    "promoted_date": "2026-01-31",
    "target": "priv-app"
  }
]
```

**Notes:**
- `demote_app` removes entries by filtering `package_name` (`promote.sh:147-149`).
- `_record_promotion` deduplicates by removing existing entry before inserting (`promote.sh:108-111`).

---

### categories.json

**Path (install):** `/data/adb/modules/scalpel/webroot/categories.json`
**Path (runtime):** `/data/adb/scalpel/categories.json` (copied at install, `customize.sh:56-58`)
**Writer:** Shipped with module (static data)
**Readers:** `scanner.sh:_get_category` (lines 58-63), `default_debloat.sh:apply_default_debloat` (lines 23-40), WebUI

**Schema:** Object with two top-level keys.

#### `categories` array:

| Field | Type | Description | Source |
|-------|------|-------------|--------|
| `id` | string | Category identifier: `"essential"`, `"caution"`, `"safe"`, `"google"`, `"unknown"` | `categories.json:4,10,16,22,28` |
| `name` | string | Display name | `categories.json:5,11,17,23,29` |
| `description` | string | User-facing explanation | `categories.json:6,12,18,24,30` |
| `color` | string | Hex color code for UI rendering | `categories.json:7,13,19,25,31` |
| `icon` | string (optional) | Icon hint (only on `"unknown"`: `"help"`) | `categories.json:32` |

**Category definitions:**

| ID | Name | Color | Meaning |
|----|------|-------|---------|
| `essential` | Essential | `#ff6b6b` | Critical system components. Removal causes bootloops/brick. |
| `caution` | Caution | `#ff9800` | System services that may affect functionality. |
| `safe` | Safe to Remove | `#4caf50` | Non-essential. Safe to remove. |
| `google` | Google Services | `#4285f4` | Google ecosystem. Removing breaks Google features. |
| `unknown` | Unknown | `#9e9e9e` | Unclassified. Research before removing. |

#### `apps` object:

Key-value map of `package_name` (string) to `category_id` (string).

```json
{
  "apps": {
    "com.android.systemui": "essential",
    "com.google.android.gms": "google",
    "com.miui.analytics": "safe",
    "com.android.bluetooth": "caution"
  }
}
```

Contains 400+ package-to-category mappings covering AOSP, Samsung, Xiaomi, OPPO/ColorOS, Vivo, Huawei, OnePlus, carrier apps, and common pre-installed apps (`categories.json:36-783`).

---

### config.sh (Configuration)

**Path:** `/data/adb/scalpel/config.sh`
**Format:** Shell variable assignments (NOT JSON). One `KEY="VALUE"` per line.
**Writer:** `config.sh:config_set` (lines 134-152), `config.sh:config_init` (lines 106-122)
**Reader:** `config.sh:config_get` (lines 124-132), sourced by all boot scripts

**Schema:**

| Key | Type | Default | Valid Values | Description | Source |
|-----|------|---------|-------------|-------------|--------|
| `SCALPEL_VERSION` | string | `"0.1.0"` | Any version string | Module version (for migration) | `config.sh:10` |
| `SCALPEL_MODE_OVERRIDE` | string | `""` (empty) | `""`, `"zeromount"`, `"mountify"`, `"symlink"`, `"whiteout"`, `"magisk"`, `"pm"` | Force specific mode instead of auto-detect. Empty = auto-detect. | `config.sh:87-88` |
| `SCALPEL_LOG_LEVEL` | string | `"info"` | `"debug"`, `"info"`, `"warn"`, `"error"`, `"fatal"` | Minimum log level | `config.sh:90-91` |
| `SCALPEL_REFRESH_APPLIST` | string | `"false"` | `"true"`, `"false"` | Re-scan apps on next boot | `config.sh:93-94` |
| `SCALPEL_DISABLE_ONLY` | string | `"false"` | `"true"`, `"false"` | Use pm disable instead of filesystem modes | `config.sh:96-97` |
| `SCALPEL_MONITOR_INTERVAL` | string | `"300"` | Any positive integer (clamped to 60-3600 at runtime) | Background monitor check interval in seconds | `config.sh:99-100` |

**File format example:**
```
SCALPEL_VERSION="0.1.0"
SCALPEL_MODE_OVERRIDE=""
SCALPEL_LOG_LEVEL="info"
SCALPEL_REFRESH_APPLIST="false"
SCALPEL_DISABLE_ONLY="false"
SCALPEL_MONITOR_INTERVAL="300"
```

**Notes:**
- Config is validated before sourcing: only lines matching `^SCALPEL_[A-Z_]+="[^"$`\\]*"$` are accepted (`config.sh:39`).
- Shell metacharacters are stripped from values on write (`config.sh:148`).
- Backup at `/data/adb/scalpel/config.sh.bak` is used during bootloop recovery (`config.sh:170-188`).

---

### count.sh (Bootloop Counter)

**Path:** `/data/adb/scalpel/count.sh`
**Format:** Single line: `BOOTCOUNT=N`
**Writer:** `bootloop.sh:bootloop_init` (lines 33-49), `bootloop.sh:bootloop_reset` (lines 90-93)
**Reader:** `bootloop.sh:bootloop_init` (lines 37-39)

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `BOOTCOUNT` | integer | `0` (healthy), `1-2` (boot attempts), `3+` (triggers recovery), `-1` (recovery marker) | Incremented at each boot. Reset to 0 after successful boot completion. |

---

## Executable Commands

All commands are shell scripts executed via the WebUI bridge (`ksu.exec()` or equivalent).
Base path: `/data/adb/modules/scalpel/`

### Scanner

**Refresh app list:**
```
sh /data/adb/modules/scalpel/core/scanner.sh refresh
```

| Item | Detail |
|------|--------|
| **Arguments** | `refresh` (or `run` -- identical behavior) |
| **Stdout** | None (output goes to debug.log) |
| **Exit code** | `0` = success, `1` = pm list packages failed after 3 retries |
| **Side effects** | Overwrites `/data/adb/scalpel/app_list.json`. Creates/updates icons in `/data/adb/scalpel/icons/`. |
| **Dependencies** | Requires logging.sh and config.sh to be sourced in the calling environment, or source them before calling. When called via CLI (`scanner.sh:188-191`), the caller must have `log_i`/`log_w`/etc available. |
| **Duration** | 5-30 seconds depending on number of system apps and device speed. |
| **Source** | `scanner.sh:181-191` |

**Notes:** The scanner runs ONCE during install (`customize.sh:62-72`). The WebUI should only call it for manual refresh (rare). The WebUI reads `app_list.json` directly for app listings.

---

### Nuke (Debloat)

The nuke engine processes the entire `nuke_list.json`. The WebUI workflow is:

1. Read `nuke_list.json`
2. Add the target app entry (from `app_list.json` data)
3. Write updated `nuke_list.json`
4. Execute nuke

**Run debloat engine:**
```
sh /data/adb/modules/scalpel/core/nuke.sh
```

| Item | Detail |
|------|--------|
| **Arguments** | None |
| **Stdout** | None (output to debug.log and kmsg) |
| **Exit code** | `0` = success (or partial timeout), `1` = failures occurred or nuke list invalid |
| **Side effects** | Writes `/data/adb/scalpel/status.json`. Creates whiteouts/mounts/overlays in module dir. Creates `nuke.lock` during operation. |
| **Concurrency** | Guarded by `nuke.lock` -- monitor.sh checks for this lock before repair cycles (`monitor.sh:47,74`). |
| **Source** | `nuke.sh:47-198` |

**Status values during nuke lifecycle:**

| `mode` value | Meaning | Next action |
|--------------|---------|-------------|
| `"running"` | Nuke in progress (or killed mid-run by KSU timeout) | `post_boot.sh` will re-run (`post_boot.sh:29`) |
| `"none"` | Nuke list was empty | Nothing to do |
| `"pm_deferred"` | No filesystem mode available at post-fs-data | `post_boot.sh` runs with pm mode (`post_boot.sh:32-34`) |
| `"error"` | Mode probe failed or script missing | Check logs |
| `"zeromount"` / `"mountify"` / etc | Completed with that mode | Normal operation |

---

### Restore

Restoring an app requires:
1. Remove the entry from `nuke_list.json`
2. Call the mode's restore function for that specific app

**Approach A -- Direct mode restore (single app):**

The WebUI must know the current mode from `status.json`, then call the appropriate mode script. Each mode script can be sourced and its `mode_restore()` called.

For the simplest bridge approach, wrap in a one-liner:
```
MODDIR=/data/adb/modules/scalpel; . $MODDIR/core/logging.sh; log_init; . $MODDIR/core/config.sh; config_init; . $MODDIR/modes/mode_{MODE}.sh; mode_restore "{PACKAGE}" "{APP_PATH}"
```

| Item | Detail |
|------|--------|
| **Arguments** | `$1` = package_name, `$2` = app_path |
| **Exit code** | `0` = success, `1` = failure |
| **Side effects** | Removes whiteout/mount/overlay for that app. Calls `pm install-existing` to re-register with PMS. |
| **Source** | `mode_whiteout.sh:58-72`, `mode_magisk.sh:74-91`, `mode_zeromount.sh:52-70`, `mode_mountify.sh:69-94`, `mode_symlink.sh:83-108`, `mode_pm.sh:31-48` |

**Approach B -- Remove from nuke_list.json and reboot:**

Simply remove the entry from `nuke_list.json` and reboot. On next boot, `nuke.sh` will only process remaining entries. The removed app's overlay/whiteout persists until mode_cleanup or reboot, but PMS may not re-discover the app until the overlay is removed. Best practice: use Approach A for immediate effect.

---

### Promote (Systemize)

**Promote a user app to system app:**
```
sh /data/adb/modules/scalpel/systemize/promote.sh promote {PACKAGE_NAME} [TARGET]
```

| Item | Detail |
|------|--------|
| **Arguments** | `promote` + package name + optional target (`app` or `priv-app`, default: `priv-app`) |
| **Stdout** | None (output to debug.log) |
| **Exit code** | `0` = success, `1` = package not found, already system, copy failed, invalid target |
| **Side effects** | Copies APK to `$MODDIR/system/{target}/{app_name}/`. For `priv-app` target only: generates permissions XML at `$MODDIR/system/etc/permissions/privapp-permissions-{pkg}.xml`. Calls `pm uninstall -k --user 0` to deregister the /data/app copy. Updates `systemize_list.json` (includes `target` field). |
| **Requires reboot** | Yes -- the overlay won't take effect until the root manager processes the module's `system/` directory at next boot. |
| **Source** | `promote.sh:22-103` |

---

### Demote

**Remove systemization (revert to user app):**
```
sh /data/adb/modules/scalpel/systemize/promote.sh demote {PACKAGE_NAME}
```

| Item | Detail |
|------|--------|
| **Arguments** | `demote` + package name |
| **Stdout** | None |
| **Exit code** | `0` = success, `1` = not in systemize list |
| **Side effects** | Removes system/{app\|priv-app} directory. For `priv-app` entries: also removes permissions XML. Removes entry from `systemize_list.json`. Calls `pm install-existing` to re-register original. |
| **Requires reboot** | Yes (overlay removal requires reboot). |
| **Source** | `promote.sh:136-169` |

---

### Verify Promotion

**Check if a specific app is running as system app:**
```
sh /data/adb/modules/scalpel/systemize/promote.sh verify {PACKAGE_NAME}
```

| Item | Detail |
|------|--------|
| **Arguments** | `verify` + package name |
| **Exit code** | `0` = verified (has FLAG_SYSTEM and sourceDir=/system/*), `1` = not system |
| **Source** | `promote.sh:169-180` |

---

### List Promoted

**List all systemized apps:**
```
sh /data/adb/modules/scalpel/systemize/promote.sh list
```

| Item | Detail |
|------|--------|
| **Arguments** | `list` |
| **Stdout** | JSON array (the contents of `systemize_list.json`) or `[]` if none |
| **Exit code** | `0` |
| **Source** | `promote.sh:164-167` |

---

### Config Operations

**Read a config key:**

The WebUI can either read the `config.sh` file directly (parse `KEY="VALUE"` lines) or source it:
```
. /data/adb/modules/scalpel/core/config.sh; config_get {KEY}
```

| Item | Detail |
|------|--------|
| **Arguments** | Config key name (must start with `SCALPEL_`) |
| **Stdout** | The value for that key |
| **Exit code** | `0` = found, `1` = invalid key |
| **Source** | `config.sh:124-132` |

**Write a config key:**
```
. /data/adb/modules/scalpel/core/config.sh; config_set {KEY} {VALUE}
```

| Item | Detail |
|------|--------|
| **Arguments** | Key name + new value |
| **Stdout** | None |
| **Exit code** | `0` = success, `1` = invalid key or value |
| **Side effects** | Atomically rewrites `/data/adb/scalpel/config.sh` with updated value. Shell metacharacters are stripped from value. |
| **Validation** | Mode override validated against: `""`, `"zeromount"`, `"mountify"`, `"symlink"`, `"whiteout"`, `"magisk"`, `"pm"` (`config.sh:88`). Log level validated against: `"debug"`, `"info"`, `"warn"`, `"error"`, `"fatal"` (`config.sh:91`). Boolean keys validated against: `"true"`, `"false"` (`config.sh:94,97`). Monitor interval validated as positive integer (`config.sh:100`). |
| **Source** | `config.sh:134-152` |

**Simpler approach for WebUI:** Read `config.sh` as text, parse the 6 `KEY="VALUE"` lines. Write the file directly (the format is trivial). This avoids needing to source shell scripts in the bridge.

---

### Mode Detection

**Detect current best mode:**
```
MODDIR=/data/adb/modules/scalpel; . $MODDIR/core/logging.sh; log_init; . $MODDIR/core/config.sh; config_init; . $MODDIR/core/detect.sh; detect_mode
```

| Item | Detail |
|------|--------|
| **Stdout** | Mode name: `"zeromount"`, `"mountify"`, `"symlink"`, `"whiteout"`, `"magisk"`, `"pm"`, or empty string (all probes failed) |
| **Exit code** | `0` = mode found, probes run in order |
| **Probe order** | zeromount > mountify > symlink > whiteout > magisk > pm (`detect.sh:176`) |
| **Source** | `detect.sh:163-187` |

**Detect root manager:**
```
MODDIR=/data/adb/modules/scalpel; . $MODDIR/core/logging.sh; log_init; . $MODDIR/core/detect.sh; detect_root_manager
```

| Item | Detail |
|------|--------|
| **Stdout** | `"ksu"`, `"apatch"`, or `"magisk"` |
| **Source** | `detect.sh:10-22` |

**Note:** For WebUI display purposes, the current mode is already in `status.json`. Use `detect_mode` only if you need to know what mode would be selected on next boot (e.g. after a config change).

---

### Verify

**Run post-reboot verification:**
```
sh /data/adb/modules/scalpel/core/verify.sh
```

| Item | Detail |
|------|--------|
| **Arguments** | None |
| **Stdout** | None (output to debug.log) |
| **Exit code** | `0` = all verified, `1` = some debloats broken |
| **Side effects** | Merges `debloat_verified`, `debloat_broken`, `last_verify` into `status.json`. |
| **Source** | `verify.sh:10-161` |

---

### Monitor Control

**Check if monitor is running:**
```
cat /data/adb/scalpel/monitor.pid 2>/dev/null && kill -0 $(cat /data/adb/scalpel/monitor.pid) 2>/dev/null && echo "running" || echo "stopped"
```

**Stop monitor:**
```
kill $(cat /data/adb/scalpel/monitor.pid 2>/dev/null) 2>/dev/null
```

**Start monitor:**
```
sh /data/adb/modules/scalpel/core/monitor.sh &
```

| Item | Detail |
|------|--------|
| **Singleton** | Only one instance runs. Acquiring a second instance fails silently (`monitor.sh:22-36`). |
| **Auto-start** | Started by `post_boot.sh` after verify completes (`post_boot.sh:124`). |
| **Auto-stop** | Stops if `$MODDIR/disable` or `$MODDIR/remove` exists (`monitor.sh:167-169`). |
| **Interval** | Configured via `SCALPEL_MONITOR_INTERVAL`, clamped to 60-3600s (`monitor.sh:158-159`). |
| **PID file** | `/data/adb/scalpel/monitor.pid` |
| **Source** | `monitor.sh:139-181` |

---

## App Data Model

### System App (scanned)

As returned by the scanner in `app_list.json`:

```typescript
interface ScannedApp {
  package_name: string;   // "com.google.android.gm"
  app_name: string;       // "Gmail"
  app_path: string;       // "/system/app/Gmail/Gmail.apk"
  partition: string;      // "system" | "vendor" | "product" | "system_ext" | "odm" | "oem" | OEM-specific
  category: string;       // "essential" | "caution" | "safe" | "google" | "unknown"
  is_priv_app: boolean;   // true if under priv-app/
  is_split: boolean;      // true if directory has 2+ APK files
}
```

**Icon:** Available at `/data/adb/scalpel/icons/{package_name}.png` (may not exist for all apps).

### Debloated App (nuked)

An entry in `nuke_list.json`:

```typescript
interface DebloatedApp {
  app_name: string;       // "Gmail"
  package_name: string;   // "com.google.android.gm"
  app_path: string;       // "/system/app/Gmail/Gmail.apk"
}
```

**Debloat status** is derived by cross-referencing:
- Present in `nuke_list.json` = queued or debloated
- `status.json.mode` is a real mode (not `"none"`, `"running"`, etc) = debloat has executed
- `status.json.debloat_verified` / `debloat_broken` = post-reboot verification results

### Systemized App (promoted)

An entry in `systemize_list.json`:

```typescript
interface SystemizedApp {
  app_name: string;       // "Termux"
  package_name: string;   // "com.termux"
  original_path: string;  // "/data/app/com.termux-abc123/base.apk"
  system_path: string;    // "/data/adb/modules/scalpel/system/priv-app/Termux/base.apk"
  promoted_date: string;  // "2026-01-31"
  target: string;         // "priv-app" or "app" (default: "priv-app" for backward compat)
}
```

**Verification:** Call `promote.sh verify {pkg}` to check if the app is actually running as system (has FLAG_SYSTEM and sourceDir under /system).

---

## Mode System

Six debloat modes, probed in best-to-worst order. Each implements a standard interface.

### Mode Priority Order

| Priority | Mode | Mechanism | Survives Reboot | Boot Stage | Source |
|----------|------|-----------|-----------------|------------|--------|
| 1 | `zeromount` | ZeroMount kernel VFS path interception | Yes (kernel-level) | post-fs-data | `mode_zeromount.sh` |
| 2 | `mountify` | Empty tmpfs mounted over app directories | No (needs re-mount) | post-fs-data | `mode_mountify.sh` |
| 3 | `symlink` | Empty opaque overlay directories with xattr | Yes (overlay fs) | post-fs-data | `mode_symlink.sh` |
| 4 | `whiteout` | Char device whiteouts (mknod c 0 0) with overlayfs xattr | Yes (overlay fs) | post-fs-data | `mode_whiteout.sh` |
| 5 | `magisk` | Magisk magic mount whiteouts (same as whiteout but Magisk-specific probe) | Yes (magic mount) | post-fs-data | `mode_magisk.sh` |
| 6 | `pm` | `pm disable-user --user 0` | Yes (PMS database) | service.sh/post-boot only | `mode_pm.sh` |

### Mode Interface

Every mode script exports these 5 functions (`detect.sh:151-161`, all mode files):

| Function | Signature | Returns | Description |
|----------|-----------|---------|-------------|
| `mode_probe()` | No args | 0=available, 1=unavailable | Tests if mode can operate on this device |
| `mode_debloat(pkg, app_path)` | package_name, APK path | 0=success, 1=failure | Hides the app |
| `mode_restore(pkg, app_path)` | package_name, APK path | 0=success, 1=failure | Restores the app (undoes debloat) |
| `mode_verify(pkg, app_path)` | package_name, APK path | 0=hidden, 1=visible | Checks if debloat is still active |
| `mode_cleanup()` | No args | 0=success, 1=failures | Restores ALL debloated apps (used during uninstall) |

### Mode Detection for WebUI

The WebUI should display the current mode from `status.json.mode`. For the "what would be selected on next boot" question, call `detect_mode`.

The user can force a mode via `SCALPEL_MODE_OVERRIDE` config key. If the forced mode's probe fails, auto-detect resumes as fallback (`detect.sh:166-173`).

### Mode Probe Requirements

| Mode | Requires | Source |
|------|----------|--------|
| `zeromount` | `/dev/zeromount` device node + `zm` binary in PATH or known locations | `detect.sh:86-94` |
| `mountify` | `busybox mount -t tmpfs` capability | `detect.sh:96-110` |
| `symlink` | `/proc/filesystems` contains `overlay` | `detect.sh:112-114` |
| `whiteout` | overlayfs + busybox with mknod + setfattr xattr support | `detect.sh:116-124` |
| `magisk` | Magisk root manager, OR KSU with magic mount, OR APatch with bind mount | `detect.sh:126-143` |
| `pm` | `sys.boot_completed == 1` + `pm path android` works | `detect.sh:146-149` |

---

## Bootloop Protection State

**Mechanism:** 3-strike counter in `/data/adb/scalpel/count.sh` (`bootloop.sh:1-94`).

| State | BOOTCOUNT | Meaning |
|-------|-----------|---------|
| Healthy | `0` | Boot completed successfully last time |
| Boot attempt 1 | `1` | First boot since debloat was applied |
| Boot attempt 2 | `2` | Second attempt, previous boot did not complete |
| RECOVERY TRIGGERED | `3+` | Bootloop detected. Module disabled, overlays wiped, config restored. |
| Recovery marker | `-1` | Written after recovery. Increments to 0 on next boot. |

**Recovery actions** (when `BOOTCOUNT >= 3`, `bootloop.sh:52-83`):
1. Restore config from backup (`config_restore`)
2. Wipe ALL overlay partition directories from module dir (system, vendor, product, etc -- 21 directories)
3. Touch `$MODDIR/disable` (disables module)
4. Update module description to "Bootloop protection triggered"
5. Write `BOOTCOUNT=-1` (recovery marker)
6. Force reboot

**Reset:** `bootloop_reset()` writes `BOOTCOUNT=0` after `ACTION_BOOT_COMPLETED` fires (`bootloop.sh:90-93`, called by `post_boot.sh:114`).

**WebUI display:**
- Read `/data/adb/scalpel/count.sh` and parse `BOOTCOUNT=N`
- Read `/data/adb/modules/scalpel/disable` existence for module disable state
- The WebUI cannot directly reset the bootloop counter (it's managed by boot scripts), but it can delete the `disable` flag to re-enable the module.

---

## Monitor System

**Purpose:** Background daemon that periodically verifies debloated and systemized apps, auto-repairing debloats that reverted (`monitor.sh:1-181`).

**Behavior:**
1. Checks all apps in `nuke_list.json` via `mode_verify()` (`monitor.sh:44-92`)
2. If any debloat reverted, calls `mode_debloat()` to re-apply (`monitor.sh:78`)
3. Checks all apps in `systemize_list.json` via `verify_promotion()` (`monitor.sh:94-118`)
4. Logs broken systemizations but does NOT auto-re-promote (too dangerous) (`monitor.sh:113`)
5. Updates `status.json` with `monitor_repairs` count and `last_monitor` timestamp (`monitor.sh:120-137`)

**State exposed to WebUI:**

| Data | Source | How to Read |
|------|--------|-------------|
| Running? | PID file | `kill -0 $(cat /data/adb/scalpel/monitor.pid)` |
| PID | PID file | `cat /data/adb/scalpel/monitor.pid` |
| Repair count | status.json | `status.json.monitor_repairs` |
| Last check | status.json | `status.json.last_monitor` |
| Interval | config | `SCALPEL_MONITOR_INTERVAL` (default 300s, range 60-3600s) |

**Concurrency safety:** The monitor checks for `nuke.lock` before attempting repairs and aborts if a nuke operation starts mid-cycle (`monitor.sh:47,74`).

---

## Configuration Keys

Complete reference for all configuration keys the WebUI can read/write.

| Key | Type | Default | Valid Values | UI Control | Description |
|-----|------|---------|-------------|------------|-------------|
| `SCALPEL_VERSION` | string | `"0.1.0"` | Any | Display only | Module version. Used for migration. |
| `SCALPEL_MODE_OVERRIDE` | string | `""` | `""` `"zeromount"` `"mountify"` `"symlink"` `"whiteout"` `"magisk"` `"pm"` | Dropdown/select | Force mode. Empty = auto-detect (recommended). |
| `SCALPEL_LOG_LEVEL` | string | `"info"` | `"debug"` `"info"` `"warn"` `"error"` `"fatal"` | Dropdown/select | Minimum log level for debug.log. |
| `SCALPEL_REFRESH_APPLIST` | boolean-string | `"false"` | `"true"` `"false"` | Toggle | Re-scan system apps on next boot. |
| `SCALPEL_DISABLE_ONLY` | boolean-string | `"false"` | `"true"` `"false"` | Toggle | Force pm disable mode instead of filesystem modes. |
| `SCALPEL_MONITOR_INTERVAL` | integer-string | `"300"` | Positive integer (clamped to 60-3600 at runtime) | Number input / slider | Background monitor check interval in seconds. |

**Read command:** `. /data/adb/modules/scalpel/core/config.sh; config_get SCALPEL_MODE_OVERRIDE`
**Write command:** `. /data/adb/modules/scalpel/core/config.sh; config_set SCALPEL_MODE_OVERRIDE "whiteout"`

**Alternative (simpler for WebUI):** Read/write `/data/adb/scalpel/config.sh` as plain text. Format is strictly `KEY="VALUE"` per line. No need to source shell scripts.

---

## Action Button Behavior

The action button (`action.sh:1-128`) fires when the user taps the module entry in the root manager app.

**On KSU/APatch:**
1. Prints status summary to stdout (`action.sh:115`)
2. Updates module description via `ksud module config set override.description` (`action.sh:62-80`)
3. Shows last 15 lines of debug.log (`action.sh:102-111`)
4. Does NOT launch WebUI (KSU/APatch serve WebUI natively from `webroot/`)

**On Magisk:**
1. Prints status summary to stdout
2. Attempts to launch WebUI viewer app in this priority:
   - `io.github.a13e300.ksuwebui` (KSUWebUIStandalone) (`action.sh:84-87`)
   - `com.dergoogler.mmrl.wx` (WebUI X) (`action.sh:90-93`)
3. If no viewer installed, prints installation instructions (`action.sh:97-99`)
4. Shows last 15 lines of debug.log

**Status summary format** (stdout, `action.sh:15-59`):
```
=== Scalpel Status ===

  Mode:        whiteout
  Debloated:   12 apps
  Failed:      1 apps        (only if > 0)
  Verified:    12
  Broken:      0             (only if > 0)
  Systemized:  2 apps
  Last run:    2026-01-31T14:30:00+00:00
  Sys. queued:  1            (only if > 0)
```

---

## WebUI Integration Points Summary

### Data Files the WebUI Reads

| File | Purpose | Read Frequency |
|------|---------|---------------|
| `/data/adb/scalpel/app_list.json` | System app inventory | On load, after refresh |
| `/data/adb/scalpel/nuke_list.json` | Debloated apps | On load, after debloat/restore |
| `/data/adb/scalpel/systemize_list.json` | Systemized apps | On load, after promote/demote |
| `/data/adb/scalpel/status.json` | Operation status, mode, counters | On load, after operations, periodic |
| `/data/adb/scalpel/categories.json` | Category definitions + mappings | On load (static) |
| `/data/adb/scalpel/config.sh` | User configuration | On load, settings tab |
| `/data/adb/scalpel/count.sh` | Bootloop counter | Status tab |
| `/data/adb/scalpel/debug.log` | Debug log | Log viewer |
| `/data/adb/scalpel/monitor.pid` | Monitor daemon state | Status tab |
| `/data/adb/scalpel/icons/{pkg}.png` | App icons | App listings |

### Data Files the WebUI Writes

| File | Purpose | When |
|------|---------|------|
| `/data/adb/scalpel/nuke_list.json` | Add/remove debloat targets | Debloat tab actions |
| `/data/adb/scalpel/config.sh` | Update configuration | Settings tab save |

### Shell Commands the WebUI Executes

| Action | Command | Tab |
|--------|---------|-----|
| Refresh app scan | `sh /data/adb/modules/scalpel/core/scanner.sh refresh` | Debloat |
| Run debloat engine | `sh /data/adb/modules/scalpel/core/nuke.sh` | Debloat |
| Restore single app | Source mode script + `mode_restore(pkg, path)` | Debloat |
| Promote app | `sh /data/adb/modules/scalpel/systemize/promote.sh promote {pkg} [target]` | Systemize |
| Demote app | `sh /data/adb/modules/scalpel/systemize/promote.sh demote {pkg}` | Systemize |
| List promoted | `sh /data/adb/modules/scalpel/systemize/promote.sh list` | Systemize |
| Verify promotion | `sh /data/adb/modules/scalpel/systemize/promote.sh verify {pkg}` | Systemize |
| Run verification | `sh /data/adb/modules/scalpel/core/verify.sh` | Status |
| Detect mode | Source detect.sh + `detect_mode` | Status/Settings |
| Detect root manager | Source detect.sh + `detect_root_manager` | Status |
| Check monitor | `kill -0 $(cat /data/adb/scalpel/monitor.pid 2>/dev/null) 2>/dev/null` | Status |
| Read config key | `. /data/adb/modules/scalpel/core/config.sh; config_get {KEY}` | Settings |
| Write config key | `. /data/adb/modules/scalpel/core/config.sh; config_set {KEY} {VALUE}` | Settings |
| Read log | `tail -n {N} /data/adb/scalpel/debug.log` | Status |

### Reboot Requirement Matrix

| Operation | Needs Reboot? | Why |
|-----------|--------------|-----|
| Debloat (zeromount) | No | VFS interception is instant |
| Debloat (mountify) | No | tmpfs mount is instant, but non-persistent |
| Debloat (symlink/whiteout/magisk) | Yes | Root manager applies overlays at boot |
| Debloat (pm) | No | pm disable takes effect immediately |
| Restore (any mode) | Depends | `pm install-existing` may restore immediately; overlay removal needs reboot |
| Promote (systemize) | Yes | Root manager must mount the priv-app overlay |
| Demote | Yes | Root manager must remove the overlay |
| Config change | Depends | Mode override and monitor interval take effect next boot/cycle |

### Error States to Handle

| Condition | How to Detect | UI Response |
|-----------|--------------|-------------|
| No status.json | File doesn't exist | "Pending first boot" |
| Corrupted status.json | `jq '.' status.json` fails | "Status file corrupted" |
| Bootloop recovery triggered | `disable` file exists + `count.sh` has `BOOTCOUNT=-1` or 0 | Show recovery banner, offer re-enable |
| Nuke in progress | `nuke.lock` exists and PID alive | Show progress indicator, block new operations |
| Monitor not running | PID file missing or PID dead | Show "Monitor stopped" with restart button |
| No mode available | `status.json.mode` is empty or `"error"` | "No compatible mode found" |
| Partial debloat | `status.json.partial == true` | "Debloat incomplete (timeout). Will resume on next boot." |
| pm deferred | `status.json.mode == "pm_deferred"` | "Debloat deferred to post-boot (pm mode)" |
