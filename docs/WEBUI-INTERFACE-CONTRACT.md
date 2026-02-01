# Scalpel WebUI Interface Contract

> **Purpose:** Complete interface specification for 3 independent WebUI design agents.
> **Audience:** Frontend developers who will NEVER read backend source code.
> **Authority:** This document IS the backend. If it's not here, it doesn't exist.
> **Generated:** 2026-02-01 from backend source at commit head.

---

## Table of Contents

1. [Bridge API](#1-bridge-api)
2. [Data Files -- Complete Schemas](#2-data-files----complete-schemas)
3. [Command API -- Shell Interface](#3-command-api----shell-interface)
4. [State Machine](#4-state-machine)
5. [Data Flows](#5-data-flows)
6. [UI Requirements -- Tab Specifications](#6-ui-requirements----tab-specifications)
7. [ZeroMount Fork Inventory](#7-zeromount-fork-inventory)
8. [Constraints and Boundaries](#8-constraints-and-boundaries)
9. [Visual Reference Data](#9-visual-reference-data)

---

## 1. Bridge API

The WebUI runs inside a WebView provided by the root manager app (KernelSU Manager, Magisk app, or APatch app). Communication with Android happens through a JavaScript bridge injected into the WebView's `window` scope.

### 1.1 The `ksu` Global Object

KernelSU and APatch inject a native JavaScript object `ksu` into `window`. All commands execute as **root**. No permission escalation needed.

### 1.2 npm Package: `kernelsu@3.0.0`

Install: `npm install kernelsu` or `yarn add kernelsu`

The package wraps the native `ksu` object with async/Promise-based APIs.

### 1.3 Complete API Reference

#### `exec(command, options?): Promise<ExecResults>`

Run a shell command as root. Returns when the command completes.

```typescript
interface ExecOptions {
  cwd?: string;
  env?: { [key: string]: string };
}

interface ExecResults {
  errno: number;   // 0 = success, non-zero = failure
  stdout: string;  // standard output
  stderr: string;  // standard error
}
```

**Example:**
```typescript
import { exec } from 'kernelsu';
const { errno, stdout, stderr } = await exec('cat /data/adb/scalpel/status.json');
if (errno === 0) {
  const status = JSON.parse(stdout);
}
```

**Mechanism:** JS generates unique callback name, registers on `window`, calls `ksu.exec(cmd, optionsJson, callbackName)`. Native side runs command, invokes `window[callbackName](errno, stdout, stderr)`. Promise resolves, callback cleans up.

#### `spawn(command, args?, options?): ChildProcess`

Spawn a long-running process with streaming output.

```typescript
interface SpawnOptions {
  cwd?: string;
  env?: { [key: string]: string };
}

interface Stdio {
  on(event: 'data', callback: (data: string) => void): void;
}

interface ChildProcess {
  stdout: Stdio;
  stderr: Stdio;
  on(event: 'exit', callback: (code: number) => void): void;
  on(event: 'error', callback: (err: any) => void): void;
}
```

**Use for:** Scanner refresh (takes seconds), bulk debloat operations.

#### `fullScreen(isFullScreen: boolean): void`

Toggle WebView fullscreen mode. Synchronous.

#### `enableInsets(enable: boolean): void`

Toggle system bar insets padding. Disabled by default. To auto-enable, import `@import "https://mui.kernelsu.org/internal/insets.css"` in CSS or add `<link rel="stylesheet" type="text/css" href="/internal/insets.css" />` in HTML.

#### `toast(message: string): void`

Show an Android toast notification. Synchronous.

#### `moduleInfo(): string`

Returns the module ID string (`"scalpel"`). Synchronous.

#### `listPackages(type: string): string[]`

List installed packages. `type` is `"user"`, `"system"`, or `"all"`. Returns array of package name strings. Synchronous.

**Faster than shell:** Prefer this over `pm list packages` -- it uses KSU's native Java API.

#### `getPackagesInfo(packages: string[]): PackagesInfo[]`

Get metadata for a list of packages. Synchronous.

```typescript
interface PackagesInfo {
  packageName: string;
  versionName: string;
  versionCode: number;
  appLabel: string;   // human-readable app name
  isSystem: boolean;
  uid: number;
}
```

### 1.4 App Icons via KSU Protocol

When `listPackages` API is available, use the `ksu://` protocol for app icons:

```html
<img src="ksu://icon/com.android.chrome" />
```

This is the fastest method for app icons in KSU/APatch. For Magisk, fall back to icons cached by the scanner at `/data/adb/scalpel/icons/{package_name}.png`.

### 1.5 Root Manager Detection

Detect which root manager is active to adapt behavior:

```typescript
async function detectRootManager(): Promise<'ksu' | 'apatch' | 'magisk'> {
  // ksu global exists on KSU and APatch
  if (typeof globalThis.ksu !== 'undefined') {
    // Distinguish KSU from APatch
    const { stdout } = await exec('[ -n "$APATCH" ] && echo apatch || echo ksu');
    return stdout.trim() as 'ksu' | 'apatch';
  }
  return 'magisk';
}
```

**Or via shell:**
```bash
# In shell context, these env vars are set:
# KSU=true        -> KernelSU
# APATCH=true     -> APatch
# Neither         -> Magisk (default)
```

### 1.6 Magisk WebUI Differences

Magisk does NOT have a native WebView for module UIs. Scalpel handles this via `action.sh`:

- **KSU/APatch:** WebUI is served natively from `webroot/index.html`. User taps module card -> WebUI opens.
- **Magisk:** `action.sh` attempts to launch KSUWebUIStandalone (`io.github.a13e300.ksuwebui`) or WebUI X (`com.dergoogler.mmrl.wx`). If neither is installed, a text-mode status summary is printed to terminal.

The WebUI code itself is identical across all managers. The bridge API (`ksu` object) is available in KSUWebUIStandalone and WebUI X.

### 1.7 Mock Mode for Development

When `ksu` global is undefined (browser development), implement a mock layer. The ZeroMount fork demonstrates this pattern in `src/lib/api.ts` (see Section 7).

---

## 2. Data Files -- Complete Schemas

All persistent data lives at `/data/adb/scalpel/`. The module directory on device is `/data/adb/modules/scalpel/`.

### 2.1 config.sh

**Path:** `/data/adb/scalpel/config.sh`
**Format:** Shell variable assignments (NOT JSON)
**Writer:** Backend (config.sh functions)
**Reader:** Backend (sourced at boot), WebUI (via `config.sh get/set` commands)
**Changes:** On user action (settings change) or migration (module update)

| Key | Type | Default | Valid Values | Description |
|-----|------|---------|--------------|-------------|
| `SCALPEL_VERSION` | string | `"0.1.0"` | Any semver string | Module version for migration tracking |
| `SCALPEL_MODE_OVERRIDE` | string | `""` (empty) | `""`, `"zeromount"`, `"mountify"`, `"symlink"`, `"whiteout"`, `"magisk"`, `"pm"` | Empty = auto-detect. Non-empty forces specific mode. |
| `SCALPEL_LOG_LEVEL` | string | `"info"` | `"debug"`, `"info"`, `"warn"`, `"error"`, `"fatal"` | Minimum log level to record |
| `SCALPEL_REFRESH_APPLIST` | string | `"false"` | `"true"`, `"false"` | If true, scanner re-runs on next boot |
| `SCALPEL_DISABLE_ONLY` | string | `"false"` | `"true"`, `"false"` | If true, use `pm disable` instead of `pm uninstall` in pm mode |
| `SCALPEL_MONITOR_INTERVAL` | string | `"300"` | Any positive integer (string) | Monitor poll interval in seconds. Backend clamps to 60-3600. |

**Example raw file content:**
```bash
SCALPEL_VERSION="0.1.0"
SCALPEL_MODE_OVERRIDE=""
SCALPEL_LOG_LEVEL="info"
SCALPEL_REFRESH_APPLIST="false"
SCALPEL_DISABLE_ONLY="false"
SCALPEL_MONITOR_INTERVAL="300"
```

**Backup:** `/data/adb/scalpel/config.sh.bak` (written by bootloop recovery)

### 2.2 status.json

**Path:** `/data/adb/scalpel/status.json`
**Format:** JSON
**Writer:** Backend (`nuke.sh` writes debloat fields, `verify.sh` merges verification fields, `monitor.sh` merges repair fields)
**Reader:** WebUI (Status tab, Debloat tab badges)
**Changes:** Every boot (nuke + verify), during monitor cycles

```typescript
interface StatusJson {
  mode: string;              // Active debloat mode. See "mode values" below.
  debloated: number;         // Count of successfully debloated apps
  debloat_failed: number;    // Count of failed debloat attempts
  systemized: number;        // Count of systemized apps (always 0 currently)
  partial: boolean;          // true if nuke was interrupted by timeout
  last_nuke: string;         // ISO 8601 timestamp of last nuke run, or "never"
  timestamp: number;         // Unix epoch seconds of last status write

  // Added by verify.sh (may not exist if verify hasn't run):
  debloat_verified?: number;    // Count of debloats confirmed holding
  debloat_broken?: number;      // Count of debloats that reverted
  systemize_verified?: number;  // Count of systemizations confirmed
  systemize_broken?: number;    // Count of systemizations that failed
  last_verify?: string;         // ISO 8601 timestamp of last verify

  // Added by monitor.sh (may not exist if monitor hasn't repaired anything):
  monitor_repairs?: number;     // Cumulative count of auto-repairs
  last_monitor?: string;        // ISO 8601 timestamp of last monitor repair
}
```

**Possible `mode` values:**
| Value | Meaning |
|-------|---------|
| `"running"` | Nuke is currently executing (in-flight marker) |
| `"none"` | No nuke list found or list is empty |
| `"pm_deferred"` | All filesystem probes failed at post-fs-data, deferred to post-boot |
| `"error"` | Mode script not found or probe failed |
| `"zeromount"` | ZeroMount VFS mode was used |
| `"mountify"` | tmpfs+overlayfs mode was used |
| `"symlink"` | symlink+overlayfs mode was used |
| `"whiteout"` | Overlayfs char device whiteout mode was used |
| `"magisk"` | Magisk magic mount mode was used |
| `"pm"` | Package manager disable/uninstall mode was used |
| `"unknown"` | Verify created fresh status without prior nuke data |

**Example:**
```json
{
  "mode": "whiteout",
  "debloated": 12,
  "debloat_failed": 1,
  "systemized": 0,
  "partial": false,
  "last_nuke": "2026-02-01T10:30:45+00:00",
  "timestamp": 1738405845,
  "debloat_verified": 12,
  "debloat_broken": 0,
  "systemize_verified": 0,
  "systemize_broken": 0,
  "last_verify": "2026-02-01T10:31:02+00:00",
  "monitor_repairs": 2,
  "last_monitor": "2026-02-01T11:05:00+00:00"
}
```

### 2.3 app_list.json (scan cache)

**Path:** `/data/adb/scalpel/app_list.json`
**Format:** JSON array
**Writer:** Backend (`scanner.sh` at install time, or on manual refresh)
**Reader:** WebUI (Debloat tab)
**Changes:** Once at install. Only changes on explicit refresh.

```typescript
interface AppEntry {
  package_name: string;    // e.g. "com.facebook.katana"
  app_name: string;        // Human-readable name, e.g. "Facebook"
  app_path: string;        // Full path to APK, e.g. "/system/app/Facebook/Facebook.apk"
  partition: string;       // "system", "vendor", "product", "system_ext", "odm", "oem"
  category: string;        // "essential", "caution", "safe", "google", "unknown"
  is_priv_app: boolean;    // true if in priv-app/ subdirectory
  is_split: boolean;       // true if app has split APKs (base + configs)
}

type AppList = AppEntry[];
```

**Example:**
```json
[
  {
    "package_name": "com.facebook.katana",
    "app_name": "Facebook",
    "app_path": "/system/app/Facebook/Facebook.apk",
    "partition": "system",
    "category": "safe",
    "is_priv_app": false,
    "is_split": true
  },
  {
    "package_name": "com.android.systemui",
    "app_name": "System UI",
    "app_path": "/system/priv-app/SystemUI/SystemUI.apk",
    "partition": "system",
    "category": "essential",
    "is_priv_app": true,
    "is_split": false
  },
  {
    "package_name": "com.miui.analytics",
    "app_name": "Analytics",
    "app_path": "/product/app/Analytics/Analytics.apk",
    "partition": "product",
    "category": "safe",
    "is_priv_app": false,
    "is_split": false
  }
]
```

**Partitions scanned:** `/system`, `/vendor`, `/product`, `/system_ext`, `/odm`, `/oem`, plus symlinked variants under `/system/`.

### 2.4 nuke_list.json

**Path:** `/data/adb/scalpel/nuke_list.json`
**Format:** JSON array (subset of app_list.json entries)
**Writer:** WebUI (when user marks apps for debloat)
**Reader:** Backend (`nuke.sh`, `verify.sh`, `monitor.sh`)
**Changes:** On user debloat/restore actions

```typescript
interface NukeEntry {
  package_name: string;  // e.g. "com.facebook.katana"
  app_path: string;      // e.g. "/system/app/Facebook/Facebook.apk"
}

type NukeList = NukeEntry[];
```

**Example:**
```json
[
  {
    "package_name": "com.facebook.katana",
    "app_path": "/system/app/Facebook/Facebook.apk"
  },
  {
    "package_name": "com.miui.analytics",
    "app_path": "/product/app/Analytics/Analytics.apk"
  }
]
```

**Important:** The WebUI must write this file. Use `exec()` to write via jq:
```typescript
const json = JSON.stringify(nukeEntries);
await exec(`echo '${json}' | /data/adb/modules/scalpel/bin/jq '.' > /data/adb/scalpel/nuke_list.json`);
```

Or safer with heredoc:
```typescript
await exec(`cat << 'SCALPEL_EOF' > /data/adb/scalpel/nuke_list.json
${json}
SCALPEL_EOF`);
```

### 2.5 categories.json

**Path:** `/data/adb/scalpel/categories.json` (runtime copy)
**Bundled at:** `module/webroot/categories.json` (shipped with module)
**Format:** JSON object with two top-level keys
**Writer:** Backend (copied at install)
**Reader:** WebUI (Debloat tab category filtering), Backend (scanner.sh for classification)
**Changes:** Only on module update

```typescript
interface Category {
  id: string;            // "essential", "caution", "safe", "google", "unknown"
  name: string;          // Human-readable: "Essential", "Caution", etc.
  description: string;   // Full description for tooltips
  color: string;         // Hex color code
  icon?: string;         // Optional icon name (only "unknown" has "help")
}

interface CategoriesJson {
  categories: Category[];
  apps: { [packageName: string]: string };  // Maps package -> category id
}
```

**Categories defined:**

| ID | Name | Color | Meaning |
|----|------|-------|---------|
| `essential` | Essential | `#ff6b6b` | WILL cause bootloops/crashes if removed. DO NOT REMOVE. |
| `caution` | Caution | `#ff9800` | May affect device functionality. Remove only if understood. |
| `safe` | Safe to Remove | `#4caf50` | Non-essential. Safe to remove. |
| `google` | Google Services | `#4285f4` | Google ecosystem. Removing breaks Google features. |
| `unknown` | Unknown | `#9e9e9e` | Unclassified. Research before removing. |

**Example:**
```json
{
  "categories": [
    {
      "id": "essential",
      "name": "Essential",
      "description": "Critical system components. Removing these WILL cause bootloops, crashes, or device brick. DO NOT REMOVE.",
      "color": "#ff6b6b"
    },
    {
      "id": "safe",
      "name": "Safe to Remove",
      "description": "Non-essential apps that can be safely removed without affecting system stability.",
      "color": "#4caf50"
    }
  ],
  "apps": {
    "com.android.systemui": "essential",
    "com.facebook.katana": "safe",
    "com.google.android.gms": "google",
    "com.miui.analytics": "safe"
  }
}
```

### 2.6 systemize_list.json

**Path:** `/data/adb/scalpel/systemize_list.json`
**Format:** JSON array
**Writer:** Backend (`promote.sh`)
**Reader:** WebUI (Systemize tab), Backend (`monitor.sh`, `demote_app`)
**Changes:** On promote/demote actions

```typescript
interface SystemizeEntry {
  app_name: string;        // e.g. "MyApp"
  package_name: string;    // e.g. "com.example.myapp"
  original_path: string;   // e.g. "/data/app/~~abc123/com.example.myapp-def456/base.apk"
  system_path: string;     // e.g. "/data/adb/modules/scalpel/system/priv-app/MyApp/base.apk"
  promoted_date: string;   // e.g. "2026-02-01"
}

type SystemizeList = SystemizeEntry[];
```

**Example:**
```json
[
  {
    "app_name": "MyApp",
    "package_name": "com.example.myapp",
    "original_path": "/data/app/~~abc123/com.example.myapp-def456/base.apk",
    "system_path": "/data/adb/modules/scalpel/system/priv-app/MyApp/base.apk",
    "promoted_date": "2026-02-01"
  }
]
```

### 2.7 debug.log

**Path:** `/data/adb/scalpel/debug.log`
**Format:** Line-oriented text
**Writer:** Backend (`logging.sh`)
**Reader:** WebUI (Status tab log viewer)
**Changes:** Continuously during boot and monitor cycles
**Rotation:** Max 1MB per file, 3 archived copies (`debug.log.1`, `debug.log.2`, `debug.log.3`)

**Line format:**
```
[YYYY-MM-DD HH:MM:SS] [LEVEL] [caller] message
```

**Levels:** `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`

**Example lines:**
```
[2026-02-01 10:30:00] [INFO] [nuke] starting debloat run
[2026-02-01 10:30:01] [INFO] [detect] mode=whiteout (auto-detected)
[2026-02-01 10:30:01] [INFO] [nuke] mode=whiteout apps=12
[2026-02-01 10:30:03] [DEBUG] [nuke] debloated: com.facebook.katana
[2026-02-01 10:30:05] [INFO] [nuke] complete: mode=whiteout success=12 failed=0
[2026-02-01 10:31:00] [INFO] [verify] starting post-boot verification
[2026-02-01 10:31:02] [INFO] [verify] complete: verified=12 broken=0
```

### 2.8 count.sh (Bootloop Counter)

**Path:** `/data/adb/scalpel/count.sh`
**Format:** Single shell variable assignment
**Writer:** Backend (`bootloop.sh`)
**Reader:** Backend only (but WebUI can read it for display)
**Changes:** Every boot (incremented), after boot completes (reset to 0)

**Content:** `BOOTCOUNT=N` where N is 0, 1, 2, or -1 (recovery marker).

### 2.9 monitor.pid

**Path:** `/data/adb/scalpel/monitor.pid`
**Format:** Plain text, single number
**Writer/Reader:** Backend (`monitor.sh`)
**Purpose:** Singleton lock -- contains PID of running monitor daemon

### 2.10 nuke.lock

**Path:** `/data/adb/scalpel/nuke.lock`
**Format:** Plain text, single number
**Writer:** Backend (`nuke.sh` -- created at start, deleted at end)
**Purpose:** Prevents monitor from repairing during active nuke. Contains PID.

---

## 3. Command API -- Shell Interface

Every command below is invoked via `exec()` from the WebUI. All commands run as root. The module directory is `/data/adb/modules/scalpel` (use `MODDIR` variable in scripts).

### 3.1 Debloat an App

**Command:**
```bash
/data/adb/modules/scalpel/core/nuke.sh
```

**Invocation:** The WebUI does NOT call `nuke.sh` directly for individual apps. Instead:
1. WebUI writes `nuke_list.json` with the desired app entries
2. WebUI calls `nuke.sh` which processes the entire list

**Return:** Exit code 0 = all succeeded, exit code 1 = one or more failed
**Stdout:** None (all output goes to log)
**Side effects:** Creates whiteouts/mounts per active mode, writes `status.json`
**Timing:** Fast for most modes (<5s for 20 apps). PM mode is slower (1-2s per app).

**The WebUI workflow for debloat:**
```typescript
// 1. Read current nuke_list.json
const { stdout } = await exec('cat /data/adb/scalpel/nuke_list.json 2>/dev/null || echo "[]"');
const current = JSON.parse(stdout);

// 2. Add new entry
current.push({ package_name: "com.facebook.katana", app_path: "/system/app/Facebook/Facebook.apk" });

// 3. Write updated list
await exec(`cat << 'EOF' > /data/adb/scalpel/nuke_list.json
${JSON.stringify(current)}
EOF`);

// 4. Run nuke engine
const result = await exec('/data/adb/modules/scalpel/core/nuke.sh');
// result.errno: 0 = success, 1 = partial failure

// 5. Read status for UI update
const { stdout: statusRaw } = await exec('cat /data/adb/scalpel/status.json');
const status = JSON.parse(statusRaw);
```

### 3.2 Restore a Debloated App

**Workflow:** Remove the entry from `nuke_list.json`, then the mode-specific cleanup happens at next boot. For immediate effect (pm mode), also call `pm enable` or `pm install-existing`.

```typescript
// 1. Read current nuke list
const { stdout } = await exec('cat /data/adb/scalpel/nuke_list.json');
const current = JSON.parse(stdout);

// 2. Remove the app
const updated = current.filter((e: any) => e.package_name !== 'com.facebook.katana');

// 3. Write updated list
await exec(`cat << 'EOF' > /data/adb/scalpel/nuke_list.json
${JSON.stringify(updated)}
EOF`);

// 4. For pm mode, re-enable immediately:
await exec('pm enable com.facebook.katana 2>/dev/null; pm install-existing com.facebook.katana 2>/dev/null');

// 5. For filesystem modes, inform user that reboot is needed
```

**Note:** For non-pm modes (whiteout, zeromount, mountify, symlink, magisk), the app remains hidden until reboot. The WebUI should display "Reboot required for restore to take effect."

### 3.3 Scan / Refresh App List

**Command:**
```bash
/data/adb/modules/scalpel/core/scanner.sh refresh
```

**Return:** Exit code 0 = success, 1 = failure (pm list packages failed after 3 retries)
**Stdout:** None (output to log)
**Side effects:** Overwrites `/data/adb/scalpel/app_list.json`, extracts icons to `/data/adb/scalpel/icons/`
**Timing:** 5-30 seconds depending on number of apps and device speed

```typescript
// Trigger refresh with streaming progress
const scanner = spawn('/data/adb/modules/scalpel/core/scanner.sh', ['refresh']);
scanner.on('exit', async (code) => {
  if (code === 0) {
    // Re-read app list
    const { stdout } = await exec('cat /data/adb/scalpel/app_list.json');
    const apps = JSON.parse(stdout);
    // Update UI
  }
});
```

### 3.4 Systemize (Promote) an App

**Command:**
```bash
/data/adb/modules/scalpel/systemize/promote.sh promote <package_name>
```

**Args:** `promote <package_name>` -- the package must be an installed user app
**Return:** Exit code 0 = success, 1 = failure
**Stdout:** None (output to log)
**Side effects:**
- Copies APK + splits + native libs to `module/system/priv-app/<AppName>/`
- Sets permissions (0755 dirs, 0644 files) and SELinux context
- Generates priv-app permissions XML
- Runs `pm uninstall -k --user 0` to remove /data/app copy
- Appends entry to `systemize_list.json`
**Timing:** 1-5 seconds

```typescript
const { errno, stderr } = await exec(
  '/data/adb/modules/scalpel/systemize/promote.sh promote com.example.myapp'
);
if (errno === 0) {
  toast('App promoted to system. Reboot required.');
} else {
  toast('Promotion failed: ' + stderr);
}
```

### 3.5 Demote (Un-systemize) an App

**Command:**
```bash
/data/adb/modules/scalpel/systemize/promote.sh demote <package_name>
```

**Return:** Exit code 0 = success, 1 = failure
**Side effects:**
- Removes the app's directory from `module/system/priv-app/`
- Removes permissions XML
- Removes entry from `systemize_list.json`
- Runs `pm install-existing` to restore as user app
**Timing:** <1 second

### 3.6 List Promoted Apps

**Command:**
```bash
/data/adb/modules/scalpel/systemize/promote.sh list
```

**Return:** Exit code 0
**Stdout:** JSON array (same format as `systemize_list.json`), or `[]` if empty

### 3.7 Verify Promotion

**Command:**
```bash
/data/adb/modules/scalpel/systemize/promote.sh verify <package_name>
```

**Return:** Exit code 0 = app has FLAG_SYSTEM and sourceDir=/system/..., exit code 1 = verification failed

### 3.8 Run Verification

**Command:**
```bash
/data/adb/modules/scalpel/core/verify.sh
```

**Return:** Exit code 0 = all verified, 1 = some broken
**Side effects:** Merges verification fields into `status.json`
**Timing:** 1-10 seconds

### 3.9 Config Get

**Command:**
```bash
. /data/adb/modules/scalpel/core/config.sh && config_get <KEY>
```

**Simpler invocation for WebUI:**
```bash
grep '^<KEY>=' /data/adb/scalpel/config.sh | cut -d'"' -f2
```

**Args:** Key must be one of the 6 keys from Section 2.1
**Return:** Exit code 0 + stdout = value, exit code 1 = invalid key
**Stdout:** The value of the key (no quotes, no newline)

```typescript
const { stdout } = await exec(
  'grep "^SCALPEL_MODE_OVERRIDE=" /data/adb/scalpel/config.sh | cut -d\'"\' -f2'
);
const modeOverride = stdout.trim();  // "" or "zeromount" etc.
```

### 3.10 Config Set

**Command:**
```bash
. /data/adb/modules/scalpel/core/config.sh && config_init && config_set <KEY> <VALUE>
```

**Args:**
- Key: One of the 6 SCALPEL_* keys
- Value: Must pass validation (see table in Section 2.1)

**Return:** Exit code 0 = success, 1 = invalid key or value
**Side effects:** Rewrites `/data/adb/scalpel/config.sh` atomically
**Timing:** Instant (<100ms)

```typescript
// Set mode override to whiteout
await exec(
  '. /data/adb/modules/scalpel/core/config.sh && config_init && config_set SCALPEL_MODE_OVERRIDE whiteout'
);

// Clear mode override (back to auto-detect)
await exec(
  '. /data/adb/modules/scalpel/core/config.sh && config_init && config_set SCALPEL_MODE_OVERRIDE ""'
);
```

### 3.11 Monitor Status

**Check if monitor is running:**
```bash
if [ -f /data/adb/scalpel/monitor.pid ]; then
  pid=$(cat /data/adb/scalpel/monitor.pid)
  kill -0 "$pid" 2>/dev/null && echo "running" || echo "stopped"
else
  echo "stopped"
fi
```

```typescript
const { stdout } = await exec(
  'pid=$(cat /data/adb/scalpel/monitor.pid 2>/dev/null) && kill -0 "$pid" 2>/dev/null && echo running || echo stopped'
);
const monitorRunning = stdout.trim() === 'running';
```

### 3.12 Read Debug Log

**Full log:**
```bash
cat /data/adb/scalpel/debug.log
```

**Last N lines:**
```bash
tail -n 50 /data/adb/scalpel/debug.log
```

**Timing:** Instant for tail, up to 1MB for full cat.

### 3.13 Read Bootloop Counter

```bash
grep -oE 'BOOTCOUNT=[0-9]+' /data/adb/scalpel/count.sh 2>/dev/null | cut -d= -f2
```

Returns a number: 0 = healthy, 1-2 = boot attempts since last success, 3+ = bootloop triggered.

### 3.14 Module Metadata

```bash
cat /data/adb/modules/scalpel/module.prop
```

**Returns** key=value pairs:
```
id=scalpel
name=Scalpel
version=v0.1.0
versionCode=1
author=Jeremy Wealth
description=Clinical debloater + systemizer with multi-mode auto-detection
```

### 3.15 Reboot Device

```bash
/system/bin/reboot
```

Or safer:
```bash
svc power reboot
```

---

## 4. State Machine

### 4.1 App Debloat States

```
                    ┌───────────┐
                    │ untouched │ (default: app visible, in app_list.json, not in nuke_list.json)
                    └─────┬─────┘
                          │ User adds to nuke list + runs nuke
                          ▼
                    ┌───────────┐
                    │  nuked    │ (app hidden via active mode, in nuke_list.json)
                    └─────┬─────┘
                          │ User removes from nuke list + reboots (or pm enable for pm mode)
                          ▼
                    ┌───────────┐
                    │ restored  │ (same as untouched -- removed from nuke_list.json)
                    └───────────┘
```

**Note:** For pm mode, debloat/restore is immediate. For all other modes, a reboot is required for changes to take effect.

### 4.2 App Systemize States

```
                    ┌───────────────┐
                    │  user app     │ (installed in /data/app/, FLAG_SYSTEM not set)
                    └───────┬───────┘
                            │ promote.sh promote <pkg>
                            ▼
                    ┌───────────────┐
                    │ systemized    │ (APK in module/system/priv-app/, needs reboot)
                    └───────┬───────┘
                            │ After reboot: PMS scans, sets FLAG_SYSTEM
                            ▼
                    ┌───────────────────┐
                    │ system app        │ (sourceDir=/system/priv-app/..., FLAG_SYSTEM set)
                    └───────┬───────────┘
                            │ promote.sh demote <pkg>
                            ▼
                    ┌───────────────┐
                    │  user app     │ (pm install-existing restores, needs reboot for full effect)
                    └───────────────┘
```

### 4.3 Mode Detection States

```
Boot starts
    │
    ▼
detect_mode() called
    │
    ├── SCALPEL_MODE_OVERRIDE set?
    │   ├── Yes → validate override → if valid → use it
    │   │                           → if invalid → fall through to auto-detect
    │   └── No → auto-detect
    │
    ▼ (auto-detect probe chain, first success wins)
    zeromount → mountify → symlink → whiteout → magisk → pm
    │                                                      │
    ├── All passed → use first passing mode                │
    │                                                      │
    └── All failed at post-fs-data ──────────────────────── → "pm_deferred"
        (pm skipped because sys.boot_completed != 1)         → retried at post-boot
```

**Probe requirements:**

| Mode | Requires |
|------|----------|
| `zeromount` | `/dev/zeromount` exists + `zm` binary on PATH |
| `mountify` | busybox + tmpfs mount capability |
| `symlink` | overlayfs in `/proc/filesystems` |
| `whiteout` | overlayfs + busybox + mknod + setfattr with xattr support |
| `magisk` | Magisk root manager, or KSU with magic mount enabled |
| `pm` | `sys.boot_completed == 1` + `pm path android` responds |

### 4.4 Boot Lifecycle States

```
┌──────────────────┐
│  INSTALL         │  customize.sh: detect root manager, migrate config,
│  (one-time)      │  scan apps, volume key prompt, write initial nuke_list
└────────┬─────────┘
         │ reboot
         ▼
┌──────────────────┐
│  POST-FS-DATA    │  bootloop_init() → increment counter
│  (early boot)    │  bootloop_check() → if count >= 3: RECOVERY (disable module, reboot)
│  BLOCKING        │  nuke_run() → detect mode → debloat all apps in nuke_list
│  10s timeout KSU │  Possible: pm_deferred, partial (timeout), running (killed)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  POST-BOOT       │  Magisk: service.sh
│  (late boot)     │  KSU/APatch: boot-completed.sh
│  NON-BLOCKING    │  Both call: post_boot.sh (exactly-once gate)
│                  │    bootloop_reset() → counter = 0
│                  │    _finish_deferred_debloat() → handle pm_deferred/partial/running
│                  │    verify_run() → confirm debloats survived
│                  │    monitor_start() → background daemon (forked)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  RUNNING         │  WebUI accessible
│  (user session)  │  Monitor daemon polling every SCALPEL_MONITOR_INTERVAL seconds
│                  │  User can debloat, restore, systemize, change settings
└──────────────────┘
```

### 4.5 Bootloop Protection States

```
                ┌──────────┐
    ─────────── │ count=0  │ ← bootloop_reset() (called after successful boot)
    │           └────┬─────┘
    │                │ bootloop_init() at post-fs-data
    │                ▼
    │           ┌──────────┐
    │           │ count=1  │ (1st boot attempt)
    │           └────┬─────┘
    │                │ reboot before boot_completed
    │                ▼
    │           ┌──────────┐
    │           │ count=2  │ (2nd boot attempt)
    │           └────┬─────┘
    │                │ reboot before boot_completed
    │                ▼
    │           ┌──────────┐
    │           │ count=3  │ THRESHOLD HIT
    │           └────┬─────┘
    │                │ bootloop_check() triggers:
    │                │   - config_restore()
    │                │   - wipe all overlay dirs from module
    │                │   - touch MODDIR/disable
    │                │   - set description to "Bootloop protection triggered"
    │                │   - write BOOTCOUNT=-1 (recovery marker)
    │                │   - force reboot
    │                ▼
    │           ┌──────────┐
    │           │ count=-1 │ (recovery marker)
    │           └────┬─────┘
    │                │ bootloop_init() → -1+1 = 0
    │                ▼
    └──────────┐ count=0  │ (module disabled, boots cleanly)
               └──────────┘
```

### 4.6 Monitor States

```
┌──────────────┐
│   stopped    │ (no PID file, or PID file with dead process)
└──────┬───────┘
       │ monitor_start() called from post_boot.sh
       ▼
┌──────────────┐
│   running    │ (PID file exists, process alive)
│              │ Loops: sleep interval → check debloated → check systemized
│              │ Repairs broken debloats automatically
│              │ Logs broken systemizations (no auto-repair)
└──────┬───────┘
       │ Module disabled/removed, or process killed
       ▼
┌──────────────┐
│   stopped    │ (cleanup: PID file removed)
└──────────────┘
```

---

## 5. Data Flows

### 5.1 User Taps "Debloat" on an App

```
1. UI: User selects app(s) in Debloat tab, taps "Debloat" button
2. UI: Confirmation dialog (especially for "essential" and "caution" categories)
3. UI: Shows loading spinner

4. JS: Read current nuke_list.json via exec('cat ...')
5. JS: Add new entry/entries to the array
6. JS: Write updated nuke_list.json via exec('cat << EOF > ...')
7. JS: Call exec('/data/adb/modules/scalpel/core/nuke.sh')
        This runs: detect mode → mode_debloat for each package

8. JS: Read status.json for results
9. UI: Update app card to show "Nuked" state
10. UI: If mode != "pm": Show "Reboot required" floating action button
11. UI: If mode == "pm": App is already disabled, show "Debloated" immediately
```

### 5.2 User Taps "Restore" on an App

```
1. UI: User taps "Restore" on a nuked app
2. UI: Confirmation dialog

3. JS: Read nuke_list.json
4. JS: Remove the app's entry
5. JS: Write updated nuke_list.json
6. JS: If pm mode was used:
        exec('pm enable <pkg>; pm install-existing <pkg>')
7. JS: Read status.json

8. UI: Update app card to show "Active" state
9. UI: If non-pm mode: Show "Reboot required" notice
```

### 5.3 User Taps "Systemize" on an App

```
1. UI: User selects app in Systemize tab, taps "Promote"
2. UI: Confirmation dialog ("This will make the app a system app")
3. UI: Loading spinner

4. JS: exec('/data/adb/modules/scalpel/systemize/promote.sh promote <pkg>')
5. JS: Check errno (0 = success)
6. JS: Read systemize_list.json for updated list

7. UI: Update app to show "Promoted" state
8. UI: Show "Reboot required for changes to take effect"
9. UI: Show floating reboot FAB
```

### 5.4 User Taps "Refresh" on Scanner

```
1. UI: User taps refresh button (rare -- only if apps added/removed since install)
2. UI: Show progress indicator

3. JS: spawn('/data/adb/modules/scalpel/core/scanner.sh', ['refresh'])
4. JS: Listen for exit event

5. On exit (code 0):
   JS: exec('cat /data/adb/scalpel/app_list.json')
   UI: Rebuild app list from fresh data

6. On exit (code 1):
   UI: Toast "Scan failed. See log for details."
```

### 5.5 User Changes a Setting

```
1. UI: User changes setting (e.g., mode override dropdown)
2. JS: exec('. /data/adb/modules/scalpel/core/config.sh && config_init && config_set SCALPEL_MODE_OVERRIDE whiteout')
3. JS: Check errno (0 = success, 1 = invalid value)
4. UI: If success: Update UI, toast "Setting saved"
5. UI: If failure: Toast "Invalid value", revert UI
```

### 5.6 User Views Status

```
1. UI: Status tab becomes active (or on initial page load)

2. JS (parallel):
   a. exec('cat /data/adb/scalpel/status.json')           → operation status
   b. exec('cat /data/adb/modules/scalpel/module.prop')    → module metadata
   c. exec('grep SCALPEL_MODE_OVERRIDE= /data/adb/scalpel/config.sh | cut -d\" -f2')  → current mode
   d. exec('pid=$(cat /data/adb/scalpel/monitor.pid 2>/dev/null) && kill -0 "$pid" 2>/dev/null && echo running || echo stopped')  → monitor status
   e. exec('tail -n 20 /data/adb/scalpel/debug.log')      → recent log
   f. exec('grep BOOTCOUNT= /data/adb/scalpel/count.sh 2>/dev/null | cut -d= -f2')  → boot count

3. UI: Display all data in status cards
```

### 5.7 Page Load -- Data Fetch Order

```
1. IMMEDIATE (parallel, all tabs need this):
   a. Read status.json         → determines badges, health indicator
   b. Read module.prop         → module name, version for header

2. DEBLOAT TAB (fetch when tab becomes active, or preload):
   a. Read app_list.json       → full app list for display
   b. Read nuke_list.json      → which apps are nuked (for state display)
   c. Read categories.json     → category definitions for filtering

3. SYSTEMIZE TAB (fetch when tab becomes active):
   a. Read systemize_list.json → promoted apps list
   b. listPackages('user')     → installed user apps (via KSU API, faster)
   c. getPackagesInfo(...)     → app names, versions

4. STATUS TAB (fetch when tab becomes active):
   a. All items from 5.6 above

5. SETTINGS TAB (fetch when tab becomes active):
   a. Read config.sh values    → current settings
```

---

## 6. UI Requirements -- Tab Specifications

### 6.1 Debloat Tab

**Data sources:**
- `app_list.json` -- all system apps discovered by scanner
- `nuke_list.json` -- which apps are currently marked for debloat
- `categories.json` -- category metadata for filtering and risk display
- `status.json` -- current mode and debloat counts

**Display requirements:**
- App list with: icon, app name, package name, partition, category badge
- Category-based grouping or filtering (essential/caution/safe/google/unknown)
- Risk level indicator (color-coded badge matching category)
- State indicator per app: "Active" (not nuked) or "Nuked" (in nuke_list)
- Partition badge (system, vendor, product, etc.)
- Split APK indicator (if `is_split` is true)
- Priv-app indicator (if `is_priv_app` is true)
- Search/filter by app name or package name
- Select all / select none per category
- Total counts: "X apps debloated", "Y apps available"

**Actions:**
- **Debloat selected:** Add to nuke_list.json + run nuke.sh
- **Restore selected:** Remove from nuke_list.json + (pm enable for pm mode)
- **Refresh:** Re-run scanner.sh (button, not automatic)

**Feedback:**
- Loading spinner during nuke/restore operations
- Per-app success/failure indicator after operation
- "Reboot required" banner when filesystem mode changes need reboot
- Confirmation dialog for "essential" and "caution" category apps with warning text

**Category safety behavior:**
- `essential` apps: Show warning dialog with "This will likely cause a bootloop. Are you sure?" and require explicit confirmation
- `caution` apps: Show warning dialog "This may affect device functionality"
- `safe`, `google`, `unknown`: Standard confirmation

### 6.2 Systemize Tab

**Data sources:**
- `systemize_list.json` -- currently promoted apps
- KSU API `listPackages('user')` + `getPackagesInfo(...)` -- installed user apps
- `status.json` -- systemized count

**Display requirements:**
- Two sections: "Promoted Apps" (from systemize_list.json) and "Available Apps" (user apps not yet promoted)
- For each promoted app: name, package, promoted date, verification status
- For each available app: name, package, version, install location
- Badge showing "System App" for promoted apps

**Actions:**
- **Promote:** Call `promote.sh promote <pkg>`
- **Demote:** Call `promote.sh demote <pkg>`
- **Verify:** Call `promote.sh verify <pkg>` and display result

**Feedback:**
- "Reboot required" after any promote/demote action
- Verification badge: checkmark if FLAG_SYSTEM confirmed, warning if not

### 6.3 Status Tab

**Data sources:**
- `status.json` -- all fields
- `module.prop` -- module name, version, author
- `config.sh` -- current mode override
- `debug.log` -- recent log entries
- `count.sh` -- bootloop counter
- `monitor.pid` -- monitor daemon status

**Display requirements:**
- **Module info card:** Name, version, author
- **Mode card:** Current active mode (from status.json), whether auto-detected or overridden
- **Debloat summary card:** debloated count, failed count, verified count, broken count
- **Systemize summary card:** systemized count, verified count, broken count
- **Bootloop card:** Current boot count (0 = healthy), with color indicator (green/yellow/red)
- **Monitor card:** Running/stopped status, last repair timestamp, repair count
- **Last operation timestamps:** last_nuke, last_verify, last_monitor
- **Log viewer:** Last 20-50 lines of debug.log, scrollable, with level-based coloring

**Actions:**
- **Manual verify:** Run verify.sh and refresh status
- **View full log:** Expand log viewer or open full log view
- **Refresh status:** Re-read all status files

### 6.4 Settings Tab

**Data source:** `config.sh` (all 6 keys)

**Display requirements:**

| Setting | UI Control | Current Value Source | Valid Options |
|---------|-----------|---------------------|---------------|
| Mode Override | Dropdown | `SCALPEL_MODE_OVERRIDE` | Auto-detect, ZeroMount, Mountify, Symlink, Whiteout, Magisk, PM |
| Log Level | Dropdown | `SCALPEL_LOG_LEVEL` | Debug, Info, Warn, Error, Fatal |
| Refresh App List on Boot | Toggle | `SCALPEL_REFRESH_APPLIST` | On/Off (true/false) |
| Disable Only (PM mode) | Toggle | `SCALPEL_DISABLE_ONLY` | On/Off (true/false) |
| Monitor Interval | Slider or input | `SCALPEL_MONITOR_INTERVAL` | 60-3600 seconds |

**Mode override dropdown labels:**

| Value | Display Label | Description |
|-------|--------------|-------------|
| `""` | Auto-detect (recommended) | Best mode selected at each boot |
| `"zeromount"` | ZeroMount VFS | Requires ZeroMount kernel module |
| `"mountify"` | Mountify (tmpfs) | Standalone tmpfs+overlayfs |
| `"symlink"` | Symlink Overlay | Symlink + overlayfs |
| `"whiteout"` | Whiteout | Overlayfs char device whiteouts |
| `"magisk"` | Magisk Mount | Magic mount file overlay |
| `"pm"` | Package Manager | pm disable/uninstall (slowest, most compatible) |

**Actions:**
- **Save setting:** `config_set` command for each change
- **Reset to defaults:** Set all keys to defaults (empty override, info level, false flags, 300 interval)

**Descriptions for each setting (show as helper text):**
- **Mode Override:** "Force a specific debloat mode. Leave on Auto-detect unless you know your device's capabilities."
- **Log Level:** "Minimum severity to log. Debug is verbose, Error shows only failures."
- **Refresh App List on Boot:** "Re-scan system partitions on next boot. Use if apps changed outside Scalpel."
- **Disable Only:** "When using PM mode, disable instead of uninstall. Easier to restore but less thorough."
- **Monitor Interval:** "How often the background daemon checks if debloated apps are still hidden. Lower = more battery usage."

**Additional settings (UI-only, stored in localStorage):**
- Theme: dark / light / amoled / auto
- Accent color: preset color picker (see ZeroMount theme system)
- Animations: on/off

---

## 7. ZeroMount Fork Inventory

**Source:** `/home/claudetest/zero-mount/nomount/webui-v2-beta/`

### 7.1 Project Structure

```
webui-v2-beta/
├── .gitignore
├── README.md
├── index.html                          # Vite entry point
├── package.json                        # Dependencies and scripts
├── pnpm-lock.yaml                      # Lock file
├── tsconfig.json                       # Base TS config
├── tsconfig.app.json                   # App TS config
├── tsconfig.node.json                  # Node TS config
├── vite.config.ts                      # Vite build config
├── public/
│   └── vite.svg                        # Favicon
├── src/
│   ├── index.tsx                       # Solid.js entry point
│   ├── App.tsx                         # Root component, tab routing
│   ├── app.css                         # Global styles
│   ├── assets/
│   │   └── solid.svg                   # Asset
│   ├── components/
│   │   ├── core/
│   │   │   ├── Badge.tsx + Badge.css   # Badge component
│   │   │   ├── Button.tsx + Button.css # Button component
│   │   │   ├── Card.tsx + Card.css     # Card component
│   │   │   ├── Input.tsx + Input.css   # Input component
│   │   │   ├── Skeleton.tsx + Skeleton.css # Loading skeleton
│   │   │   └── Toggle.tsx              # Toggle switch
│   │   └── layout/
│   │       ├── Header.tsx + Header.css # App header
│   │       ├── Modal.tsx               # Modal dialog
│   │       ├── NavBar.tsx + NavBar.css # Bottom navigation bar
│   │       └── Toast.tsx               # Toast notification
│   ├── lib/
│   │   ├── api.ts                      # Backend API layer (shell commands)
│   │   ├── api.mock.ts                 # Mock data for development
│   │   ├── constants.ts                # File paths, URLs, version
│   │   ├── icons.ts                    # SVG path data for all icons
│   │   ├── ksu.d.ts                    # TypeScript types for KSU native API
│   │   ├── ksuApi.ts                   # Wrapper around ksu native methods
│   │   ├── store.ts                    # Solid.js reactive store (state management)
│   │   ├── theme.ts                    # Theme system (dark/light/amoled + accent colors)
│   │   └── types.ts                    # Shared TypeScript interfaces
│   └── routes/
│       ├── StatusTab.tsx + StatusTab.css
│       ├── ModulesTab.tsx + ModulesTab.css
│       ├── ConfigTab.tsx + ConfigTab.css
│       └── SettingsTab.tsx + SettingsTab.css
```

### 7.2 package.json

```json
{
  "name": "webui-v2-beta",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@material/material-color-utilities": "^0.4.0",
    "@material/web": "^2.4.1",
    "kernelsu": "^3.0.0",
    "solid-js": "^1.9.10"
  },
  "devDependencies": {
    "@types/node": "^24.10.1",
    "typescript": "~5.9.3",
    "vite": "^7.2.4",
    "vite-plugin-solid": "^2.11.10"
  }
}
```

### 7.3 Vite Config

```typescript
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  base: './',                           // Relative paths (required for WebView)
  plugins: [solid()],
  build: {
    target: 'esnext',
    outDir: '../module/webroot-beta',    // CHANGE for Scalpel: '../module/webroot'
    emptyOutDir: true,
    minify: 'esbuild',
    rollupOptions: {
      external: ['kernelsu'],           // Don't bundle -- provided by KSU WebView
    },
  },
  optimizeDeps: {
    exclude: ['kernelsu'],
  },
  server: {
    port: 5173,
    host: true,
  },
})
```

**Key:** `kernelsu` is externalized -- not bundled. The KSU WebView provides it at runtime.

### 7.4 Component Inventory

| Component | Purpose | Reuse for Scalpel |
|-----------|---------|-------------------|
| `Badge` | Colored label badges | **KEEP** -- use for category badges, status indicators |
| `Button` | Styled button with variants | **KEEP** -- use for all actions |
| `Card` | Glass-morphism card container | **KEEP** -- use for all data cards |
| `Input` | Text input with styling | **KEEP** -- use for search/filter |
| `Skeleton` | Loading placeholder | **KEEP** -- use during data fetch |
| `Toggle` | On/off switch | **KEEP** -- use for boolean settings |
| `Header` | App header with title | **MODIFY** -- change title to "Scalpel", add module version |
| `Modal` | Overlay dialog | **KEEP** -- use for confirmation dialogs |
| `NavBar` | Bottom tab navigation | **MODIFY** -- change tabs to: Debloat, Systemize, Status, Settings |
| `Toast` | Notification popup | **KEEP** -- use for operation feedback |

### 7.5 Theme System

**How it works:**
- 4 themes: `dark`, `light`, `amoled`, `auto` (follows system preference)
- 6 accent color presets: Orange, Emerald, Azure, Slate, Indigo, Coral
- Theme applies via CSS custom properties on `:root`
- `auto-accent` randomizes color on each page visibility change

**CSS variables set by theme:**
```
--bg-primary, --bg-surface, --bg-surface-elevated, --bg-surface-hover
--glass-bg, --glass-border
--text-primary, --text-secondary, --text-tertiary, --text-accent
--gradient-primary, --gradient-secondary
--color-success, --color-success-glow
--color-warning, --color-warning-glow
--color-error, --color-error-glow
--color-info, --color-info-glow
--shadow-small, --shadow-medium, --shadow-large, --shadow-glow
--accent-rgb, --text-on-accent
```

**Fonts:**
- Display: 'Space Grotesk', system-ui, sans-serif
- Body: 'Inter', system-ui, sans-serif
- Mono: 'JetBrains Mono', 'Fira Code', monospace

**Reuse for Scalpel:** Keep the entire theme system. It works well in WebView. Optionally change default accent or add Scalpel-specific accent presets.

### 7.6 Bridge Implementation

ZeroMount's `api.ts` wraps all shell commands:
- Uses `ksuExec()` from `ksuApi.ts` which wraps `ksu.exec()` with timeout handling
- `ksuApi.ts` also wraps `listPackages`, `getPackagesInfo`, `getPackagesIcons` with fallbacks
- `api.mock.ts` provides mock data when `ksu` is unavailable (browser development)
- `shouldUseMock()` detects if running outside KSU WebView

**For Scalpel:** Replace the ZeroMount-specific API functions with Scalpel commands from Section 3.

### 7.7 Icon System

All icons are inline SVG path data in `icons.ts`. Icons include:
- Navigation: power, folder, tune, settings
- Status: shield, check, chevronDown
- Actions: search, checkbox, smartphone, grid
- Theme: palette, moon, sun, autoMode, amoled
- About: info, github
- Toast: error

**For Scalpel:** Keep existing icons, add debloat-specific icons (trash/delete, restore/undo, system/promote, reboot).

### 7.8 Routing

Tab-based routing via Solid.js `Switch`/`Match`:
- Active tab stored in `store.activeTab` signal
- `NavBar` receives `activeTab` and `onTabChange` props
- `App.tsx` renders the matching tab component

**For Scalpel:** Change tab type from `'status' | 'modules' | 'config' | 'settings'` to `'debloat' | 'systemize' | 'status' | 'settings'`.

### 7.9 Build Output

- Output directory: `../module/webroot-beta/` (change to `../module/webroot/` for Scalpel)
- Served from: `/data/adb/modules/scalpel/webroot/index.html`
- KSU auto-sets permissions and SELinux context on the `webroot/` directory

### 7.10 What to KEEP vs STRIP

**KEEP (reuse as-is):**
- All `components/core/` (Badge, Button, Card, Input, Skeleton, Toggle)
- All `components/layout/` (Header, Modal, NavBar, Toast)
- `lib/theme.ts` (entire theme system)
- `lib/icons.ts` (icon SVG paths)
- `lib/ksu.d.ts` (KSU type definitions)
- `lib/ksuApi.ts` (KSU API wrapper with exec/listPackages/getPackagesInfo)
- `vite.config.ts` structure (change outDir)
- `package.json` dependencies (solid-js, kernelsu, vite, typescript)
- `index.html` structure
- Global CSS reset and fonts from `app.css`

**STRIP (replace entirely):**
- `lib/api.ts` -- ZeroMount-specific commands (replace with Scalpel commands)
- `lib/api.mock.ts` -- ZeroMount mock data (replace with Scalpel mock data)
- `lib/constants.ts` -- ZeroMount paths (replace with Scalpel paths)
- `lib/types.ts` -- ZeroMount interfaces (replace with Scalpel interfaces)
- `lib/store.ts` -- ZeroMount state management (replace with Scalpel store)
- All `routes/*.tsx` -- ZeroMount tabs (replace with Scalpel tabs)

**OPTIONAL (evaluate):**
- `@material/material-color-utilities` -- Used for dynamic accent from wallpaper. Keep if desired.
- `@material/web` -- Material Web Components. Keep if using MWC, strip if using custom CSS-only.

---

## 8. Constraints and Boundaries

### 8.1 Mode Detection is Boot-Only

Mode detection (`detect_mode()`) runs at boot. The WebUI displays the current mode from `status.json` but CANNOT re-detect live. If the user changes the mode override in settings, the new mode takes effect on next boot only.

### 8.2 PM Mode Availability

The `pm` command requires PMS (Package Manager Service) to be running. At `post-fs-data`, PMS is NOT ready. PM mode is only available at `post-boot` stage. If all filesystem probes fail at `post-fs-data`, the backend writes `pm_deferred` status and retries with PM at `post-boot`.

### 8.3 Reboot Requirements

| Operation | Immediate Effect | Reboot Required |
|-----------|-----------------|-----------------|
| Debloat (pm mode) | Yes -- app disabled immediately | No |
| Debloat (all other modes) | No -- whiteout/mount created but not active | Yes |
| Restore (pm mode) | Yes -- app re-enabled immediately | No |
| Restore (all other modes) | No -- entry removed but whiteout still active | Yes |
| Systemize (promote) | Partial -- APK copied, pm uninstall done | Yes (PMS needs reboot to see /system change) |
| Systemize (demote) | Partial -- files removed, pm install-existing done | Yes (PMS needs reboot) |
| Settings change | Saved immediately | Mode override takes effect on next boot |

**The WebUI must show a "Reboot Required" floating action button whenever filesystem-mode operations are performed.**

### 8.4 Bootloop Protection is Backend-Only

The 3-strike bootloop protection runs entirely in the backend at `post-fs-data`. The WebUI:
- CAN display the current boot count (0 = healthy, 1-2 = attempts)
- CANNOT reset or modify the bootloop counter
- SHOULD show a warning if boot count is 1 or 2 ("Device rebooted unexpectedly. N/3 strikes before bootloop protection triggers.")

### 8.5 Scanner Runs at Install

The app scanner (`scanner.sh`) runs ONCE during module installation (`customize.sh`). The WebUI reads the cached `app_list.json`. A "Refresh" button is available for rare cases where the system partition changed after install. Refresh takes 5-30 seconds.

### 8.6 Monitor is a Background Daemon

The monitor (`monitor.sh`) runs as a background process forked from post-boot. The WebUI:
- CAN check if it's running (via PID file)
- CANNOT start/stop it (it starts automatically at boot)
- CAN read its repair count from status.json

### 8.7 File Paths are Android-Specific

| Path | Purpose |
|------|---------|
| `/data/adb/scalpel/` | Persistent data (survives module update) |
| `/data/adb/modules/scalpel/` | Module installation directory |
| `/data/adb/modules/scalpel/webroot/` | WebUI files (this is where the built frontend goes) |
| `/data/adb/modules/scalpel/bin/` | Bundled binaries (jq, aapt) |
| `/data/adb/modules/scalpel/core/` | Core shell scripts |
| `/data/adb/modules/scalpel/modes/` | Mode implementation scripts |
| `/data/adb/modules/scalpel/systemize/` | Systemization scripts |
| `/data/adb/modules/scalpel/system/` | Overlaid system files (whiteouts, promoted apps) |
| `/system/app/` | Stock system apps |
| `/system/priv-app/` | Stock privileged system apps |
| `/vendor/app/` | Vendor apps |
| `/product/app/` | Product partition apps |

### 8.8 Root Access is Guaranteed

All `exec()` and `spawn()` calls run as root. No `su` or permission checks needed. The WebUI only runs inside the root manager's WebView, which already has root context.

### 8.9 WebView Constraints

- Runs inside KSU Manager / Magisk app WebView
- Screen size: mobile viewport (typically 360-412px width)
- No window.open, no external navigation
- `localStorage` is available but cleared if manager app is uninstalled
- CSS `env(safe-area-inset-*)` should be used for notch/nav bar avoidance
- Touch-only input (no mouse/keyboard)

### 8.10 Concurrent Operations

- `nuke.lock` prevents monitor from repairing during active nuke operations
- Only one nuke.sh instance can run at a time (PID in lock file)
- Only one monitor.sh instance can run (singleton via PID file)
- The WebUI should disable debloat/restore buttons while an operation is in progress

### 8.11 jq Dependency

All JSON manipulation in the backend uses `jq`. The bundled binary is at `/data/adb/modules/scalpel/bin/jq`. When the WebUI writes JSON files, use `jq '.'` to validate, or write raw JSON and let the backend parse it.

### 8.12 Nuke List is the Source of Truth

The `nuke_list.json` file is the single source of truth for what should be debloated. The backend reads this file at every boot and applies the debloat operations. The WebUI's job is to manage this list. Adding/removing entries and running nuke.sh is the complete debloat workflow.

---

## 9. Visual Reference Data

### 9.1 App Icons

**KSU/APatch (preferred):** Use `ksu://icon/{packageName}` protocol in `<img>` src.

**Magisk/fallback:** Icons cached at `/data/adb/scalpel/icons/{package_name}.png`
- Format: PNG
- Size: Original resolution from APK (typically 48x48 to 192x192)
- Read via: `exec('cat /data/adb/scalpel/icons/com.facebook.katana.png | base64')` then display as data URI

### 9.2 Category Visual Mapping

| Category | Color | Icon Suggestion | Risk Level |
|----------|-------|----------------|------------|
| `essential` | `#ff6b6b` (red) | Shield/lock | CRITICAL -- never remove |
| `caution` | `#ff9800` (orange) | Warning triangle | HIGH -- remove with caution |
| `safe` | `#4caf50` (green) | Checkmark | LOW -- safe to remove |
| `google` | `#4285f4` (Google blue) | Google "G" | MEDIUM -- breaks Google features |
| `unknown` | `#9e9e9e` (grey) | Question mark | UNKNOWN -- research first |

### 9.3 Mode Display Names and Descriptions

| Mode ID | Display Name | Short Description |
|---------|-------------|-------------------|
| `zeromount` | ZeroMount VFS | Kernel-level VFS interception (fastest, cleanest) |
| `mountify` | Mountify | tmpfs overlay mount (no kernel module needed) |
| `symlink` | Symlink Overlay | Symlink + overlayfs (good compatibility) |
| `whiteout` | Whiteout | Overlayfs char device whiteouts (traditional) |
| `magisk` | Magisk Mount | Magic mount file overlay (Magisk-native) |
| `pm` | Package Manager | pm disable/uninstall (slowest, most compatible) |

### 9.4 Status Indicators

| Indicator | Color | Meaning |
|-----------|-------|---------|
| Debloated (success) | `#4caf50` (green) | App successfully hidden |
| Debloated (failed) | `#ff6b6b` (red) | Debloat operation failed |
| Verified | `#4caf50` (green) | Debloat confirmed holding after reboot |
| Broken | `#ff9800` (orange) | Debloat reverted, needs re-application |
| Repaired | `#00b4d8` (blue) | Monitor auto-repaired a broken debloat |
| Pending reboot | `#ff9800` (orange) | Changes applied, reboot needed |
| Bootloop risk | `#ff6b6b` (red) | Boot count > 0, bootloop protection active |

### 9.5 Log Level Colors

| Level | Color | Display |
|-------|-------|---------|
| `DEBUG` | `#9e9e9e` (grey) | Dim text |
| `INFO` | `#ffffff` (white) | Normal text |
| `WARN` | `#ff9800` (orange) | Orange text |
| `ERROR` | `#ff6b6b` (red) | Red text |
| `FATAL` | `#ff6b6b` (red) | Red text, bold |

### 9.6 Partition Display

| Partition | Display Name | Badge Color |
|-----------|-------------|-------------|
| `system` | System | Default |
| `vendor` | Vendor | `#7c4dff` (purple) |
| `product` | Product | `#00b4d8` (blue) |
| `system_ext` | System Ext | Default (dimmed) |
| `odm` | ODM | `#9e9e9e` (grey) |
| `oem` | OEM | `#9e9e9e` (grey) |

### 9.7 Module Identity

| Field | Value |
|-------|-------|
| Module ID | `scalpel` |
| Display Name | Scalpel |
| Version | v0.1.0 |
| Author | Jeremy Wealth |
| Tagline | Clinical debloater + systemizer with multi-mode auto-detection |

---

## Quality Gate Checklist

- [x] Every config.sh key documented with type, default, and valid range (Section 2.1)
- [x] Every command has syntax, return format, and error cases (Section 3)
- [x] Every JSON file has complete schema with examples (Section 2)
- [x] Every tab has data sources, display requirements, and available actions (Section 6)
- [x] Bridge API section covers KSU, Magisk, and APatch differences (Section 1)
- [x] ZeroMount fork inventory is complete (Section 7)
- [x] State transitions cover all paths including error paths (Section 4)
- [x] Constraints section covers every gotcha a frontend dev would hit (Section 8)

---

*End of Interface Contract. This document contains everything needed to build the Scalpel WebUI.*
