# SCALPEL WebUI -- FOUNDATION

> Single source of truth for expressionist builder agents.
> Generated from 4 forensic analyses totaling ~3,830 lines.
> Sources: `01-appnuker-webui-analysis.md` (S1), `02-zeromount-webui-analysis.md` (S2), `03-backend-api-contract.md` (S3), `04-requirements-and-bridge-api.md` (S4)

---

## 1. PROJECT IDENTITY

**Scalpel** is an Android root module that debloats system apps and systemizes (promotes) user apps to system-level, with automatic multi-mode detection across Magisk, KernelSU, and APatch root managers. It selects the best available debloat mechanism at each boot from 6 modes ranging from kernel-level VFS interception to package manager disabling.

| Property | Value |
|----------|-------|
| Module ID | `scalpel` |
| Module directory | `/data/adb/modules/scalpel/` |
| Data directory | `/data/adb/scalpel/` |
| Root managers | KernelSU, APatch, Magisk |
| Backend status | 100% complete, validated at 100/100 score |
| Features done | 21 of 26 (81%) -- remaining 5 are all WebUI |
| Current phase | Phase D -- WebUI Frontend (the ONLY remaining work) |

---

## 2. TECH STACK & FORK BASE

### Fork Source

Fork from: `/home/claudetest/zero-mount/nomount/webui-v2-beta/`

This is a working Solid.js + TypeScript + Vite SPA that runs inside KSU/Magisk WebViews. It manages a VFS redirection engine. The architecture, build system, theme system, and component library are proven and should be preserved. All ZeroMount-specific domain logic (VFS rules, exclusion UIDs, engine toggle) must be replaced with Scalpel domain logic.

### Dependencies (from `package.json`)

**Runtime:**

| Package | Version | Purpose |
|---------|---------|---------|
| `solid-js` | `^1.9.10` | Reactive UI framework (compiled, no virtual DOM) |
| `kernelsu` | `^3.0.0` | KSU WebView bridge types + API (externalized at build) |

**Dev:**

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | `~5.9.3` | Type checking (strict mode) |
| `vite` | `^7.2.4` | Build tool and dev server |
| `vite-plugin-solid` | `^2.11.10` | Solid.js JSX transform |

**Note:** ZeroMount also includes `@material/material-color-utilities` and `@material/web` but neither is used in the source. Builders may drop them.

### Build Configuration (`vite.config.ts`)

```typescript
base: './',                           // REQUIRED for WebView (relative paths)
plugins: [solid()],
build: {
  target: 'esnext',
  outDir: '../module/webroot',        // Build output INTO module directory
  emptyOutDir: true,
  minify: 'esbuild',
  rollupOptions: {
    external: ['kernelsu'],           // KSU bridge provided by WebView runtime
  },
},
server: { port: 5173, host: true },
```

**Critical:** `base: './'` is required for WebView serving. `kernelsu` is externalized because the WebView injects `globalThis.ksu` at runtime.

### TypeScript Configuration

- Target: ES2022, Module: ESNext, bundler resolution
- JSX: preserve with `jsxImportSource: "solid-js"`
- Strict mode enabled
- `erasableSyntaxOnly: true`

### Build Output Structure

```
module/webroot/
  index.html          # Entry point (REQUIRED by KSU spec)
  assets/
    index-[hash].js   # Vite bundle
    index-[hash].css  # Extracted CSS
  categories.json     # App risk classifications (copied from source)
```

**Permissions:** Do NOT set permissions on `webroot/` for KSU/APatch (auto-managed). Only set for Magisk:
```sh
if [ -z "$KSU" ] && [ -z "$APATCH" ]; then
    set_perm_recursive "$MODPATH/webroot" 0 0 0755 0644
fi
```

---

## 3. BRIDGE API CONTRACT

### 3.1 KernelSU npm Package API (`kernelsu@3.0.0`)

The WebUI communicates with Android through the `kernelsu` npm package. Import methods directly:

```typescript
import { exec, spawn, toast, moduleInfo, listPackages, getPackagesInfo } from 'kernelsu';
```

#### `exec(command, options?): Promise<ExecResults>`

Runs a root shell command. Returns `{ errno: number, stdout: string, stderr: string }`.

```typescript
const { errno, stdout, stderr } = await exec('cat /data/adb/scalpel/app_list.json');
if (errno === 0) {
    const apps = JSON.parse(stdout);
}
```

#### `spawn(command, args?, options?): ChildProcess`

Spawns a streaming root process. Use for long-running operations (scanning, nuking).

```typescript
const proc = spawn('sh', ['/data/adb/modules/scalpel/core/nuke.sh']);
proc.stdout.on('data', (chunk) => { /* progress */ });
proc.on('exit', (code) => { /* done */ });
```

#### `toast(message): void`

Shows Android toast notification. Synchronous.

#### `moduleInfo(): string`

Returns module ID string. Use to construct paths dynamically.

#### `listPackages(type): string[]`

Lists packages. `type`: `"user"`, `"system"`, or `"all"`. Synchronous. Faster than shell `pm list packages`.

#### `getPackagesInfo(packages): PackagesInfo[]`

Returns `{ packageName, versionName, versionCode, appLabel, isSystem, uid }[]`. Synchronous.

#### `fullScreen(isFullScreen): void` / `enableInsets(enable): void`

Toggle fullscreen and system bar inset padding. Insets auto-enabled by importing:
```css
@import "https://mui.kernelsu.org/internal/insets.css";
```

### 3.2 TypeScript Definitions

```typescript
interface ExecOptions {
    cwd?: string;
    env?: { [key: string]: string };
}

interface ExecResults {
    errno: number;
    stdout: string;
    stderr: string;
}

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

interface PackagesInfo {
    packageName: string;
    versionName: string;
    versionCode: number;
    appLabel: string;
    isSystem: boolean;
    uid: number;
}
```

### 3.3 Bridge Lifecycle

1. KSU/APatch manager opens `webroot/index.html` in an Android WebView
2. Manager injects native `ksu` global object into `window` scope
3. **exec():** JS registers a unique callback on `window`, calls `ksu.exec(cmd, optionsJson, callbackName)`. Native side runs command as root, then calls the callback with `(errno, stdout, stderr)`. The callback resolves the Promise and self-cleans.
4. **spawn():** Similar callback pattern but with streaming -- native side calls `stdout.emit('data', chunk)` repeatedly, then `emit('exit', code)` on completion.
5. **Synchronous APIs:** `toast()`, `moduleInfo()`, `listPackages()`, `getPackagesInfo()` call directly into `ksu` native object and return immediately.

### 3.4 Cross-Manager Compatibility

| Feature | KernelSU | APatch | Magisk |
|---------|----------|--------|--------|
| Native webroot/ support | Yes | Yes (identical API) | No |
| ksu bridge injected | Yes | Yes | Via third-party app |
| exec() / spawn() | Yes | Yes | Via polyfill |
| listPackages() | Yes | Yes | May not be available |
| `ksu://icon/{pkg}` URLs | Yes | Yes | May not work |
| toast() | Yes | Yes | Via polyfill |
| Entry mechanism | Manager opens webroot/ | Manager opens webroot/ | action.sh launches viewer app |

**Magisk path:** Scalpel's `action.sh` detects Magisk and launches KSUWebUIStandalone (`io.github.a13e300.ksuwebui`) or WebUI X (`com.dergoogler.mmrl.wx`), which polyfill the `ksu` bridge.

**Builder requirement:** Check `typeof globalThis.ksu !== 'undefined'` before using bridge. Display "Bridge not available" fallback if missing.

### 3.5 Shell Execution Patterns

**Argument escaping** (from ZeroMount api.ts, preserve this):
```typescript
function escapeShellArg(arg: string): string {
    return "'" + arg.replace(/'/g, "'\\''") + "'";
}
```

**Mock detection** (from ZeroMount api.ts, preserve this):
```typescript
function shouldUseMock(): boolean {
    return typeof globalThis.ksu === 'undefined';
}
```

When KSU is unavailable (browser dev mode), fall through to MockAPI with synthetic data and simulated delays. This enables development without a device.

**Timeout:** ZeroMount uses 30s default timeout on exec calls. Preserve this pattern.

---

## 4. BACKEND DATA CONTRACTS

### 4.1 status.json

**Path:** `/data/adb/scalpel/status.json`

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `mode` | string | `"zeromount"`, `"mountify"`, `"symlink"`, `"whiteout"`, `"magisk"`, `"pm"`, `"none"`, `"running"`, `"pm_deferred"`, `"error"` | Active debloat mode |
| `debloated` | integer | 0+ | Successfully debloated app count |
| `debloat_failed` | integer | 0+ | Failed debloat count |
| `systemized` | integer | 0+ | Systemized app count (placeholder, 0 from nuke.sh) |
| `partial` | boolean | true/false | True if nuke hit timeout before completing |
| `last_nuke` | string | ISO 8601 or `"never"` | Last debloat timestamp |
| `timestamp` | integer | Unix epoch seconds | Raw timestamp |
| `debloat_verified` | integer | 0+ | Debloats confirmed holding after reboot |
| `debloat_broken` | integer | 0+ | Debloats that reverted after reboot |
| `systemize_verified` | integer | 0+ | Verified systemizations (stub: 0) |
| `systemize_broken` | integer | 0+ | Broken systemizations (stub: 0) |
| `last_verify` | string | ISO 8601 | Last verification timestamp |
| `monitor_repairs` | integer | 0+ | Cumulative auto-repairs by monitor |
| `last_monitor` | string | ISO 8601 | Last monitor cycle timestamp |

**Important:** Fields are incrementally added. After nuke.sh runs, only the first 7 fields exist. verify.sh and monitor.sh merge their fields later. The WebUI MUST handle partial objects.

### 4.2 app_list.json

**Path:** `/data/adb/scalpel/app_list.json`
**Format:** Array of scanned system app objects.

```typescript
interface ScannedApp {
    package_name: string;   // "com.google.android.gm"
    app_name: string;       // "Gmail"
    app_path: string;       // "/system/app/Gmail/Gmail.apk"
    partition: string;      // "system"|"vendor"|"product"|"system_ext"|"odm"|"oem"|OEM-specific
    category: string;       // "essential"|"caution"|"safe"|"google"|"unknown"
    is_priv_app: boolean;   // true if under priv-app/
    is_split: boolean;      // true if 2+ APK files in directory
}
```

**Generated once at install.** WebUI reads this instantly on load. Manual refresh via scanner is for rare cases only.

**Icons:** Available at `/data/adb/scalpel/icons/{package_name}.png`. May not exist for all apps. Preferred fast path: `ksu://icon/{packageName}` (native KSU API).

### 4.3 nuke_list.json

**Path:** `/data/adb/scalpel/nuke_list.json`
**Format:** Array of debloat target objects.

```typescript
interface DebloatedApp {
    app_name: string;       // "Gmail"
    package_name: string;   // "com.google.android.gm"
    app_path: string;       // "/system/app/Gmail/Gmail.apk"
}
```

**This is the authoritative debloat list.** The WebUI manages it directly -- adding entries to debloat, removing entries to restore. `nuke.sh` iterates this file and calls `mode_debloat()` for each entry. The `app_path` field is critical (mode scripts derive the app directory from it).

**Note:** May already contain entries from install-time default debloat (volume key prompt).

### 4.4 systemize_list.json

**Path:** `/data/adb/scalpel/systemize_list.json`
**Format:** Array of systemized app records.

```typescript
interface SystemizedApp {
    app_name: string;       // "Termux"
    package_name: string;   // "com.termux"
    original_path: string;  // "/data/app/com.termux-abc123/base.apk"
    system_path: string;    // "/data/adb/modules/scalpel/system/priv-app/Termux/base.apk"
    promoted_date: string;  // "2026-01-31" (ISO date)
}
```

**Managed by promote.sh.** WebUI reads this for display. Deduplication is handled by the backend.

### 4.5 categories.json

**Path (runtime):** `/data/adb/scalpel/categories.json`
**Format:** Object with two top-level keys.

**`categories` array:**

| ID | Name | Color | Meaning |
|----|------|-------|---------|
| `essential` | Essential | `#ff6b6b` | Critical system components. Removal causes bootloops/brick. |
| `caution` | Caution | `#ff9800` | System services that may affect functionality. |
| `safe` | Safe to Remove | `#4caf50` | Non-essential. Safe to remove. |
| `google` | Google Services | `#4285f4` | Google ecosystem. Removing breaks Google features. |
| `unknown` | Unknown | `#9e9e9e` | Unclassified. Research before removing. |

Each category has: `id` (string), `name` (string), `description` (string), `color` (hex string).

**`apps` object:** Key-value map of `package_name` -> `category_id`. Contains 400+ package-to-category mappings covering AOSP, Samsung, Xiaomi, OPPO, Vivo, Huawei, OnePlus, and carrier apps.

### 4.6 config.sh

**Path:** `/data/adb/scalpel/config.sh`
**Format:** Shell variable assignments. One `KEY="VALUE"` per line. NOT JSON.

| Key | Type | Default | Valid Values | UI Control |
|-----|------|---------|-------------|------------|
| `SCALPEL_VERSION` | string | `"0.1.0"` | Any version | Display only |
| `SCALPEL_MODE_OVERRIDE` | string | `""` | `""` (auto), `"zeromount"`, `"mountify"`, `"symlink"`, `"whiteout"`, `"magisk"`, `"pm"` | Dropdown (display "Auto" for empty) |
| `SCALPEL_LOG_LEVEL` | string | `"info"` | `"debug"`, `"info"`, `"warn"`, `"error"`, `"fatal"` | Dropdown |
| `SCALPEL_REFRESH_APPLIST` | boolean-string | `"false"` | `"true"`, `"false"` | Toggle |
| `SCALPEL_DISABLE_ONLY` | boolean-string | `"false"` | `"true"`, `"false"` | Toggle |
| `SCALPEL_MONITOR_INTERVAL` | integer-string | `"300"` | Positive integer (clamped 60-3600 at runtime) | Slider or number input |

**Read/write:** Either parse/write the file as text (trivial `KEY="VALUE"` format), or use shell source:
- Read: `. /data/adb/modules/scalpel/core/config.sh; config_get {KEY}`
- Write: `. /data/adb/modules/scalpel/core/config.sh; config_set {KEY} {VALUE}`

Config is validated: only lines matching `^SCALPEL_[A-Z_]+="[^"$\`\\]*"$` are accepted. Shell metacharacters are stripped on write.

### 4.7 count.sh (Bootloop Counter)

**Path:** `/data/adb/scalpel/count.sh`
**Format:** Single line: `BOOTCOUNT=N`

| Value | Meaning |
|-------|---------|
| `0` | Healthy (boot completed successfully) |
| `1-2` | Boot attempts (previous boot did not complete) |
| `3+` | Recovery triggered (module auto-disabled) |
| `-1` | Recovery marker (written after recovery, increments to 0) |

---

## 5. EXECUTABLE COMMANDS

All commands run via `exec()` or `spawn()` from the bridge. All run as root.

### 5.1 Scanner (Re-scan)

```
sh /data/adb/modules/scalpel/core/scanner.sh refresh
```

| Item | Detail |
|------|--------|
| Exit code | `0` = success, `1` = pm list failed after retries |
| Side effects | Overwrites `app_list.json`, creates/updates `icons/` |
| Duration | 5-30 seconds |
| When to call | Only on manual refresh button tap. NEVER on WebUI open. |

### 5.2 Nuke (Debloat)

WebUI workflow: (1) Read `nuke_list.json`, (2) add target entry, (3) write updated `nuke_list.json`, (4) execute nuke.

```
sh /data/adb/modules/scalpel/core/nuke.sh
```

| Item | Detail |
|------|--------|
| Exit code | `0` = success/partial, `1` = failures or invalid list |
| Side effects | Writes `status.json`, creates overlays/whiteouts, creates `nuke.lock` during operation |
| Concurrency | Guarded by `nuke.lock` |

### 5.3 Restore (Single App)

Remove entry from `nuke_list.json`, then call mode-specific restore:

```
MODDIR=/data/adb/modules/scalpel; . $MODDIR/core/logging.sh; log_init; . $MODDIR/core/config.sh; config_init; . $MODDIR/modes/mode_{MODE}.sh; mode_restore "{PACKAGE}" "{APP_PATH}"
```

Where `{MODE}` comes from `status.json.mode`. Exit code `0` = success. Calls `pm install-existing` to re-register with PMS.

### 5.4 Promote (Systemize)

```
sh /data/adb/modules/scalpel/systemize/promote.sh promote {PACKAGE_NAME} [TARGET]
```

Where `TARGET` is `priv-app` (default) or `app`. Exit code `0` = success. Copies APK to system/{priv-app|app} overlay, generates permissions XML (priv-app only), calls `pm uninstall -k --user 0`. **Requires reboot.**

### 5.5 Demote

```
sh /data/adb/modules/scalpel/systemize/promote.sh demote {PACKAGE_NAME}
```

Exit code `0` = success. Removes overlay files, updates `systemize_list.json`. **Requires reboot.**

### 5.6 Verify Promotion

```
sh /data/adb/modules/scalpel/systemize/promote.sh verify {PACKAGE_NAME}
```

Exit code `0` = verified (has FLAG_SYSTEM), `1` = not system.

### 5.7 List Promoted

```
sh /data/adb/modules/scalpel/systemize/promote.sh list
```

Stdout: JSON array (contents of `systemize_list.json`) or `[]`.

### 5.8 Config Read/Write

```
. /data/adb/modules/scalpel/core/config.sh; config_get {KEY}
. /data/adb/modules/scalpel/core/config.sh; config_set {KEY} {VALUE}
```

Or simply read/write `/data/adb/scalpel/config.sh` as plain text.

### 5.9 Mode Detection

```
MODDIR=/data/adb/modules/scalpel; . $MODDIR/core/logging.sh; log_init; . $MODDIR/core/config.sh; config_init; . $MODDIR/core/detect.sh; detect_mode
```

Stdout: mode name or empty string. For display only -- current mode is already in `status.json`.

### 5.10 Verify (Post-reboot)

```
sh /data/adb/modules/scalpel/core/verify.sh
```

Merges `debloat_verified`, `debloat_broken`, `last_verify` into `status.json`.

### 5.11 Monitor Control

```bash
# Check if running:
kill -0 $(cat /data/adb/scalpel/monitor.pid 2>/dev/null) 2>/dev/null && echo "running" || echo "stopped"

# Stop:
kill $(cat /data/adb/scalpel/monitor.pid 2>/dev/null) 2>/dev/null

# Start:
sh /data/adb/modules/scalpel/core/monitor.sh &
```

Singleton daemon. Interval from `SCALPEL_MONITOR_INTERVAL` (default 300s, range 60-3600s).

### 5.12 Reboot

```
svc power reboot
```

### Reboot Requirement Matrix

| Operation | Needs Reboot? |
|-----------|--------------|
| Debloat (zeromount, mountify, pm) | No |
| Debloat (symlink, whiteout, magisk) | Yes |
| Restore (any mode) | Depends -- `pm install-existing` may work immediately; overlay removal needs reboot |
| Promote / Demote | Yes |
| Config change (mode override) | Takes effect next boot |

---

## 6. FEATURE REQUIREMENTS

### 6.1 Feature #21: WebUI Scaffold

**ID:** `webui-scaffold` | **Priority:** MVP | **Size:** M | **Dependencies:** None

Fork ZeroMount's `webroot-beta/`. Reuse bridge, theme system, component library, Vite config, icon loading. Strip ZeroMount-specific tabs. Add 4-tab navigation: Debloat, Systemize, Status, Settings. Add floating reboot FAB with confirmation dialog.

**Acceptance criteria:**
- [ ] Fork ZeroMount webroot-beta/ as starting point
- [ ] Reuse bridge.ts, theme system, component library, Vite config
- [ ] Strip ZeroMount-specific tabs (StatusTab, ModulesTab, ConfigTab, SettingsTab content)
- [ ] Add tab navigation: Debloat, Systemize, Status, Settings
- [ ] Add floating reboot FAB at bottom-right, above tab bar, always visible
- [ ] Reboot confirmation dialog before executing `svc power reboot`

### 6.2 Feature #22: Debloat Tab

**ID:** `webui-debloat` | **Priority:** MVP | **Size:** L | **Dependencies:** scaffold

**Data sources:** `app_list.json` (instant load), `categories.json`, `nuke_list.json`, app icons via `ksu://icon/{pkg}` or `/data/adb/scalpel/icons/{pkg}.png`

**Acceptance criteria:**
- [ ] App list loaded from cached `app_list.json` (instant, no scan on open)
- [ ] Category badges: essential (red), caution (orange), safe (green), google (blue), unknown (gray)
- [ ] Fuzzy search across package names and app labels
- [ ] Multi-select with batch operations
- [ ] Risk warning in confirmation dialog when essential/caution apps selected
- [ ] Nuke button triggers debloat engine
- [ ] Refresh button triggers scanner on demand (rare)
- [ ] Already-debloated apps (in nuke_list.json) shown in separate section or visually distinct

**Execution flow:** User selects apps -> writes `nuke_list.json` -> executes `nuke.sh` -> shows result -> reboot FAB.

### 6.3 Feature #23: Systemize Tab

**ID:** `webui-systemize` | **Priority:** MVP | **Size:** M | **Dependencies:** scaffold

**Data sources:** `listPackages("user")` native API, `getPackagesInfo()`, `systemize_list.json`

**Acceptance criteria:**
- [ ] User app list loaded from `listPackages("user")` native API
- [ ] Promote button triggers systemization engine
- [ ] Post-reboot verification display showing FLAG_SYSTEM + sourceDir status
- [ ] Already-promoted apps shown from `systemize_list.json` with demote option
- [ ] Clear indication that reboot is required

**Execution flow:** User selects app -> `promote.sh promote {pkg}` -> reboot FAB -> after reboot, status shows verification.

### 6.4 Feature #24: Status Tab

**ID:** `webui-status` | **Priority:** MVP | **Size:** M | **Dependencies:** scaffold

**Data sources:** `status.json`, `count.sh`, `nuke_list.json`, `systemize_list.json`, `debug.log`, `monitor.pid`

**Acceptance criteria:**
- [ ] Active mode display (which of 6 modes is active)
- [ ] Debloated app count and list of debloated packages
- [ ] Systemized app count and verification status per app
- [ ] Bootloop counter value (0-2 normal, 3+ = protection triggered)
- [ ] Module health indicators (monitor running, last verify, repairs count)
- [ ] Last operation log viewer (tail of debug.log)

### 6.5 Feature #28: Settings Tab

**ID:** `webui-settings` | **Priority:** Phase 2 | **Size:** M | **Dependencies:** scaffold

**Acceptance criteria:**
- [ ] Mode override dropdown: Auto, zeromount, mountify, symlink, whiteout, magisk, pm
- [ ] Theme selection (dark, light, AMOLED)
- [ ] Accent color picker (6 presets + user palette)
- [ ] Log level dropdown: debug, info, warn, error, fatal
- [ ] Refresh app list toggle
- [ ] Disable-only toggle
- [ ] Monitor interval control (60-3600s)
- [ ] Export config
- [ ] About section with module version

---

## 7. FORK BASE ARCHITECTURE

### 7.1 Directory Structure

```
webui-v2-beta/
  index.html                          # App shell (viewport meta, fonts, #root)
  package.json                        # Dependencies
  vite.config.ts                      # Build config
  tsconfig.json / .app.json / .node.json
  src/
    index.tsx                         # Entry: render <App /> into #root
    App.tsx                           # Root: Show/Switch tabs, NavBar, Toast
    app.css                           # Global: variables, resets, keyframes, WebView fixes
    lib/
      types.ts                        # All TypeScript interfaces -- REPLACE
      store.ts                        # Reactive state singleton -- ADAPT
      api.ts                          # Bridge exec wrapper + all API methods -- REPLACE
      api.mock.ts                     # Mock API for dev -- REPLACE
      constants.ts                    # Paths, version, URLs -- REPLACE
      theme.ts                        # Theme objects + accent presets -- KEEP
      icons.ts                        # SVG path data constants -- ADAPT
      ksu.d.ts                        # KSU native type declarations -- KEEP
    components/
      core/
        Badge.tsx + Badge.css         # Status badge -- KEEP
        Button.tsx + Button.css       # Multi-variant button -- KEEP
        Card.tsx + Card.css           # Glass/elevated/gradient card -- KEEP
        Input.tsx + Input.css         # Text input with label/error -- KEEP
        Skeleton.tsx + Skeleton.css   # Loading placeholder -- KEEP
        Toggle.tsx                    # Toggle switch -- KEEP
      layout/
        Header.tsx + Header.css       # App header -- MODIFY (title/subtitle)
        NavBar.tsx + NavBar.css       # Bottom tab navigation -- MODIFY (tab IDs)
        Modal.tsx                     # Bottom sheet modal -- KEEP
        Toast.tsx                     # Toast notification -- KEEP
    routes/
      StatusTab.tsx + .css            # REPLACE entirely
      ModulesTab.tsx + .css           # REPLACE entirely
      ConfigTab.tsx + .css            # REPLACE entirely
      SettingsTab.tsx + .css          # REPLACE entirely
```

### 7.2 Component Inventory

**KEEP as-is:**

| Component | Props | Key Feature |
|-----------|-------|-------------|
| `Badge` | variant: default/success/warning/error/info, size: small/medium | Gradient bg + glow shadow |
| `Button` | variant: primary/secondary/danger/ghost, size: S/M/L, loading | Spring hover, spinner on loading |
| `Card` | variant: glass/elevated/gradient-border, padding, hoverable | 24px radius, backdrop blur |
| `Input` | label, error, placeholder, value, onInput | Gradient-border focus effect |
| `Skeleton` | width, height, borderRadius | Shimmer animation |
| `Toggle` | checked, onChange, disabled | Stretch animation, gradient track |
| `Modal` | open, onClose, title, children | Bottom sheet with backdrop blur |
| `Toast` | message, type: success/error/info, visible | Fixed bottom-center, 3s auto-dismiss |

**MODIFY:**

| Component | Change |
|-----------|--------|
| `Header` | Title: "ZEROMOUNT" -> "SCALPEL", subtitle: "Enginex0" -> project tagline |
| `NavBar` | Tab IDs: `status\|modules\|config\|settings` -> `debloat\|systemize\|status\|settings` |

**REPLACE entirely:** All 4 route components (StatusTab, ModulesTab, ConfigTab, SettingsTab).

### 7.3 State Management Pattern

Solid.js primitives in a `createRoot` singleton:

```typescript
export const store = createRoot(createAppStore);
```

The store contains:
- **Signals** for atomic values (e.g., `activeTab`, `engineActive`)
- **Stores** (`createStore`) for nested objects (e.g., `loading`, `stats`)
- **Memos** (`createMemo`) for derived values (e.g., `currentTheme`)
- **Effects** (`createEffect`) for side effects (theme application, localStorage sync)
- **Actions** for async operations (data loading, state mutations)

**Granular loading states:** Per-domain boolean flags in a `loading` store object.

**Data flow:** `App.tsx:onMount` -> `store.loadInitialData()` -> parallel data fetches -> signals update -> reactive UI renders.

**localStorage keys** (rename `zeromount-*` to `scalpel-*`):

| Key | Default | Purpose |
|-----|---------|---------|
| `scalpel-theme` | `'amoled'` | Theme preference |
| `scalpel-accent` | random preset | Accent color |
| `scalpel-fixedNav` | `'true'` | Fixed bottom nav |
| `scalpel-autoAccent` | `'true'` | Randomize accent on visibility |

**Important:** localStorage is volatile (lost if manager app uninstalled). Anything important should be written to `/data/adb/scalpel/` via exec().

### 7.4 Theme System

**Dual-layer architecture:**
1. JavaScript theme objects (`theme.ts`) -- used for inline styles in Toggle, Modal, Toast
2. CSS custom properties (`app.css`) -- used for CSS file styling

`applyTheme()` writes JS theme object values into CSS custom properties on `:root`, keeping both systems synchronized.

**Three themes:**

| Theme | Key Characteristics |
|-------|-------------------|
| Dark | Gradient bg `#0F0F1A -> #1A1A2E`, white text, semi-transparent surfaces |
| Light | White-based bg, dark text, lighter shadows |
| AMOLED | Pure `#000000` bg, reduced surface opacity, increased shadow intensity |

**Six accent color presets:**

| Name | Color | RGB |
|------|-------|-----|
| Orange | `#FF8E53` | 255, 142, 83 |
| Emerald | `#00D68F` | 0, 214, 143 |
| Azure | `#00B4D8` | 0, 180, 216 |
| Slate | `#64748B` | 100, 116, 139 |
| Indigo | `#6366F1` | 99, 102, 241 |
| Coral | `#FF6B6B` | 255, 107, 107 |

Each preset has: `gradient` (3-stop 135deg), `textAccent`, `rgb`, `textOnAccent`.

`applyAccent()` sets 5 CSS custom properties: `--gradient-primary`, `--text-accent`, `--accent-rgb`, `--text-on-accent`, `--shadow-glow`.

**Auto accent:** On `visibilitychange` (WebView becomes visible), randomizes accent if `autoAccentColor` enabled.

**Utility functions:** `getLuminance()`, `getContrastText()`, `needsDarkText()` -- for auto-contrast text on accent backgrounds.

### 7.5 Animations & Transitions

**Signature easing curve:** `cubic-bezier(0.34, 1.56, 0.64, 1)` -- an overshoot/spring curve used for ALL interactive elements. This is the feel of the UI. Preserve it.

**CSS keyframe animations (14 total):**

| Animation | Duration | Use |
|-----------|----------|-----|
| `heartbeat` | 1.5s ease infinite | Shield/status pulse (scale 1.05 bump) |
| `glowPulse` | 3s ease infinite | Hero glow shadow oscillation |
| `float` | 3s ease infinite | Shield floating (translateY -4px) |
| `slideInRight` | 0.3s ease-out | List items enter from right (staggered) |
| `slideInUp` | - | Enter from bottom |
| `fadeIn` | 0.2s ease-out | Generic fade |
| `scaleIn` | - | Scale 0.9->1 + fade |
| `shimmer` | 1.5s linear infinite | Skeleton loading sweep |
| `textGlow` | 2s ease infinite | Text shadow pulse |
| `rotateRing` | 8s linear infinite | Logo ring rotation |
| `spin` | - | General rotation |
| `pulse` | - | Opacity 1->0.5 |
| `borderGlow` | - | Border opacity pulse |
| `button-spin` | 0.8s linear | Button spinner |

**Staggered list animations:** Items enter with `slideInRight` and `index * 0.05-0.1s` delay. This creates the cascading entry effect.

**Number animation:** `requestAnimationFrame` loop with cubic ease-out `(1 - Math.pow(1 - progress, 3))`, 500ms duration. Stats count up from 0.

**Reduced motion support:**
```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
    }
}
```

### 7.6 Icon System

All icons are inline SVG `<path d="...">` data stored in `lib/icons.ts`. Components render via `<svg viewBox="0 0 24 24"><path d={ICONS.name} /></svg>`. No icon font or external library.

**20 icon constants:** power, folder, tune, settings, shield, shieldHalf, check, chevronDown, search, checkboxChecked, smartphone, grid, palette, moon, sun, autoMode, amoled, info, github, error.

Builders should add Scalpel-specific icons (nuke, restore, promote, demote, reboot, warning, etc.).

### 7.7 WebView Constraints (8 fixes in `app.css`)

| Constraint | Fix |
|------------|-----|
| No pinch zoom | `maximum-scale=1.0, user-scalable=no` on viewport meta |
| iOS safe area | `env(safe-area-inset-bottom)` padding |
| Overscroll bounce | `overscroll-behavior: none` on html+body |
| Tap highlight | `-webkit-tap-highlight-color: transparent` |
| Touch handling | `touch-action: manipulation` on all elements |
| 100vh iOS issue | `min-height: 100dvh` with `100vh` fallback |
| Font smoothing | `-webkit-font-smoothing: antialiased` |
| Stacking context | `isolation: isolate` on `#root` |

### 7.8 CSS Architecture

**Methodology:** BEM naming convention (`.card--glass`, `.button__spinner`, `.navbar__tab--active`).

**Reusable CSS patterns:**

| Pattern | Implementation |
|---------|---------------|
| Glass morphism | `background: var(--glass-bg); backdrop-filter: blur(20px); border: 1px solid var(--glass-border)` |
| Gradient text | `background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent` |
| Gradient border | `background: linear-gradient(surface, surface) padding-box, gradient border-box; border: 2px solid transparent` |
| Glow shadow | Every semantic color has matching glow (`rgba(color, 0.4)`) |

**Font stack (3-tier hierarchy):**

| Usage | Font | Variable |
|-------|------|----------|
| Display headings | Space Grotesk (400-700) | `fontDisplay` |
| Body text | Inter (400-700) | `fontBody` |
| Code/mono | JetBrains Mono (400-500) | `fontMono` |

All loaded from Google Fonts in `index.html`.

**Border radius tokens:** Small=8px, Medium=12px, Large=16px, XLarge=24px.

---

## 8. DESIGN LESSONS FROM APP NUKER

### 8.1 Patterns to Replicate

1. **Category-based risk signaling** -- Color-coded badges (red=essential, orange=caution, green=safe, blue=google) provide immediate visual safety cues. The pre-populated database of categorized apps is a valuable baseline.
2. **Combined fuzzy search + category filters** -- Both active simultaneously. Sequential character matching plus exact substring highlighting.
3. **Safe area insets** -- Critical for real-device rendering. Non-negotiable.
4. **Lazy loading** -- Batch rendering (20 apps at a time) with scroll-triggered loading. Auto-loads more when filtering yields few results.
5. **Scroll-aware chrome** -- FAB hiding on scroll down, header shrinking. Maximizes content area.
6. **Keyboard awareness** -- Modal shift on keyboard appearance prevents input occlusion.
7. **Empty states** -- Provide direction rather than blank screens.
8. **Risk warnings in confirmation** -- Red text for essential/caution apps in the nuke confirmation dialog.

### 8.2 Anti-patterns to Avoid

1. **Monolithic util.js (1,114 lines)** -- Everything in one file. Scalpel uses Solid.js components + store.
2. **Multi-page architecture** -- Full page reloads between tabs. Scalpel uses SPA with signal-based tab switching.
3. **Shell injection via string interpolation** -- `echo '${JSON.stringify(data)}'`. Use `escapeShellArg()`.
4. **No error boundaries** -- Generic toast on failure with no retry or error state. Every async operation needs loading/error/success states.
5. **No progress during operations** -- UI blocks with no feedback during nuke. Use spawn() for streaming progress.
6. **Hardcoded colors bypassing CSS variables** -- Many components used inline hex values. Everything through CSS custom properties.
7. **CSS writes at runtime** -- `sed` editing CSS files on disk. Never modify module source files at runtime.
8. **No virtualization** -- All 200+ apps in DOM simultaneously. For large lists, consider batch rendering.
9. **800+ event listeners** -- No event delegation. Solid.js handles this via compiled reactive bindings.
10. **Polling forever on failure** -- If `app_list.json` never appears, loading screen polls indefinitely. Need timeout + error state.

### 8.3 UX Flows to Improve

1. **Reboot action** -- App Nuker says "Reboot your device!" with no reboot button. Scalpel has a floating reboot FAB.
2. **Progress tracking** -- App Nuker provides zero per-app progress during nuke. Use spawn() for streaming feedback.
3. **Restore without confirmation** -- App Nuker skips confirmation for restore. Scalpel should confirm.

---

## 9. HARD REQUIREMENTS (NON-NEGOTIABLE)

### Framework & Build
- [ ] Solid.js + TypeScript + Vite
- [ ] Fork from ZeroMount webroot-beta/
- [ ] `base: './'` in Vite config (WebView requirement)
- [ ] `kernelsu` externalized in Vite build
- [ ] `webroot/index.html` MUST exist at module root level

### Visual Design
- [ ] AMOLED background as default theme
- [ ] Three themes: dark, light, AMOLED
- [ ] Six accent color presets (user-selectable)
- [ ] Auto-accent randomization on visibility change
- [ ] Glass morphism on cards, NavBar, modals
- [ ] Gradient-as-accent pattern (buttons, text, indicators)
- [ ] Glow shadows on semantic elements
- [ ] Signature spring curve `cubic-bezier(0.34, 1.56, 0.64, 1)` on interactions
- [ ] Staggered list entry animations
- [ ] Number count-up animation on stats
- [ ] Reduced motion media query support
- [ ] Three-font hierarchy (Space Grotesk, Inter, JetBrains Mono)

### Navigation & Layout
- [ ] 4-tab navigation: Debloat, Systemize, Status, Settings
- [ ] Floating reboot FAB at bottom-right, above tab bar, always visible
- [ ] Confirmation dialog before reboot
- [ ] Signal-based tab switching (no URL routing)
- [ ] Safe area insets for notch/nav bar

### Data & Performance
- [ ] App list loads from cached JSON (instant, no scan on open)
- [ ] Manual refresh button for re-scan (rare cases)
- [ ] Categories loaded from cached/bundled JSON
- [ ] Mock API for browser development (shouldUseMock pattern)
- [ ] Granular loading states per data domain
- [ ] Shell argument escaping on all exec() calls

### Cross-Manager
- [ ] Works in KernelSU WebView
- [ ] Works in APatch WebView (identical API)
- [ ] Works in Magisk WebView (via third-party bridge app)
- [ ] Bridge availability check (graceful fallback if ksu missing)
- [ ] App icons via `ksu://icon/{pkg}` with fallback to cached PNGs

### WebView Constraints
- [ ] No pinch zoom (`user-scalable=no`)
- [ ] Overscroll prevention
- [ ] Tap highlight removal
- [ ] Touch action manipulation
- [ ] dvh/vh fallback for viewport height
- [ ] Font smoothing
- [ ] Safe area padding

### Data Integrity
- [ ] WebUI NEVER modifies backend shell scripts
- [ ] Shell execution only via exec()/spawn()
- [ ] nuke_list.json managed directly by WebUI
- [ ] Config written as `KEY="VALUE"` text format
- [ ] Handle partial status.json (fields added incrementally)

---

## 10. DOMAIN CONTEXT

### 10.1 App Categories

5 risk tiers applied to system apps:

| Category | Risk | Color | UI Guidance |
|----------|------|-------|-------------|
| Essential | CRITICAL | `#ff6b6b` (red) | "Removing may cause bootloops. Not recommended." Show strong warning. |
| Caution | HIGH | `#ff9800` (orange) | "May break related features. Proceed with care." Show warning. |
| Safe | LOW | `#4caf50` (green) | "Can be safely removed." No warning needed. |
| Google | LOW | `#4285f4` (blue) | "Removing breaks Google features." Informational note. |
| Unknown | UNKNOWN | `#9e9e9e` (gray) | "Not classified. Research before removing." Informational note. |

**Confirmation dialog requirement:** When essential or caution apps are selected, the dialog MUST display risk text explaining potential consequences.

### 10.2 Debloat Modes

6 modes, auto-detected in best-to-worst order:

| Mode | User-Facing Name | Description |
|------|-----------------|-------------|
| `zeromount` | ZeroMount VFS | Kernel-level path interception. Top stealth. Requires ZeroMount metamodule. |
| `mountify` | Standalone Mount | tmpfs mounts per partition. Ephemeral (re-applied each boot). |
| `symlink` | Symlink Overlay | Empty opaque directories in module overlay. |
| `whiteout` | OverlayFS Whiteout | Character device nodes treated as deleted by overlayfs. |
| `magisk` | Magic Mount | Whiteout files in module directory for Magisk's mount system. |
| `pm` | Package Manager | `pm disable-user`. Universal fallback. Least stealthy. |

### 10.3 Bootloop Protection

3-strike counter. Each boot increments `BOOTCOUNT`. If it reaches 3 before `ACTION_BOOT_COMPLETED`:
1. Config restored from backup
2. All overlay directories wiped
3. Module disabled (`disable` flag file created)
4. Forced reboot

**Status tab should show:** counter value, whether module was auto-disabled, option to re-enable (delete `disable` flag).

### 10.4 Safety Information for UI

- Debloat + systemize both require reboot (for most modes). The reboot FAB exists for this.
- If APK copy fails during systemization, the user copy is NOT removed. No damage done.
- The `pm` mode takes effect immediately without reboot.
- The `mountify` mode is ephemeral -- re-applied each boot from `nuke_list.json`.

---

## 11. NON-GOALS

The WebUI must NOT:

- Trigger a scan on page open (scan is cached from install)
- Modify backend shell scripts (read-only access, command execution only)
- Provide app backup/restore (data migration)
- Re-sign APKs with platform keys
- Support x86/x86_64 emulators in v1
- Implement a terminal TUI (WebUI is the only UI)
- Use localStorage for anything important (it's volatile -- use file-based persistence)

---

## 12. APPENDIX: FILE PATH REFERENCE

### Data Files (Read by WebUI)

| Path | Format | Purpose |
|------|--------|---------|
| `/data/adb/scalpel/app_list.json` | JSON array | Scanned system apps |
| `/data/adb/scalpel/nuke_list.json` | JSON array | Apps queued/completed for debloat |
| `/data/adb/scalpel/systemize_list.json` | JSON array | Systemized apps registry |
| `/data/adb/scalpel/status.json` | JSON object | Operation status and counters |
| `/data/adb/scalpel/categories.json` | JSON object | Category definitions + mappings |
| `/data/adb/scalpel/config.sh` | Shell vars | User configuration |
| `/data/adb/scalpel/count.sh` | Shell var | Bootloop counter |
| `/data/adb/scalpel/debug.log` | Text | Debug log (1MB max, 3 archives) |
| `/data/adb/scalpel/monitor.pid` | Text | Monitor daemon PID |
| `/data/adb/scalpel/icons/{pkg}.png` | PNG | Cached app icons |

### Data Files (Written by WebUI)

| Path | Format | Purpose |
|------|--------|---------|
| `/data/adb/scalpel/nuke_list.json` | JSON array | Add/remove debloat targets |
| `/data/adb/scalpel/config.sh` | Shell vars | Update configuration |

### Module Scripts (Executed by WebUI)

| Path | Purpose |
|------|---------|
| `/data/adb/modules/scalpel/core/scanner.sh` | App list refresh |
| `/data/adb/modules/scalpel/core/nuke.sh` | Debloat engine |
| `/data/adb/modules/scalpel/core/verify.sh` | Post-reboot verification |
| `/data/adb/modules/scalpel/core/monitor.sh` | Background daemon |
| `/data/adb/modules/scalpel/core/config.sh` | Config read/write (source) |
| `/data/adb/modules/scalpel/core/detect.sh` | Mode detection (source) |
| `/data/adb/modules/scalpel/core/logging.sh` | Logging init (source) |
| `/data/adb/modules/scalpel/systemize/promote.sh` | Systemize engine |
| `/data/adb/modules/scalpel/modes/mode_*.sh` | Mode-specific restore (source) |

### Module Structural Paths

| Path | Purpose |
|------|---------|
| `/data/adb/modules/scalpel/` | Module directory ($MODDIR) |
| `/data/adb/modules/scalpel/webroot/` | WebUI static files |
| `/data/adb/modules/scalpel/webroot/index.html` | WebUI entry point (REQUIRED) |
| `/data/adb/modules/scalpel/system/priv-app/` | Systemized app overlays |
| `/data/adb/modules/scalpel/system/etc/permissions/` | Priv-app permission XMLs |
| `/data/adb/modules/scalpel/disable` | Module disable flag (bootloop recovery) |
| `/data/adb/modules/scalpel/bin/jq` | Bundled jq binary |

### Error Detection Paths

| Condition | How to Detect |
|-----------|--------------|
| No scan data | `app_list.json` doesn't exist |
| Corrupted status | `JSON.parse(status.json)` throws |
| Bootloop recovery triggered | `disable` file exists + `BOOTCOUNT=-1` or 0 in `count.sh` |
| Nuke in progress | `nuke.lock` exists |
| Monitor not running | PID file missing or `kill -0 $PID` fails |
| No mode available | `status.json.mode` is `"error"` or empty |
| Partial debloat | `status.json.partial === true` |
| pm deferred | `status.json.mode === "pm_deferred"` |

---

*Consolidated from 4 forensic analyses. Every fact traced to source material. Builders reading ONLY this document have everything needed to construct the complete Scalpel WebUI.*
