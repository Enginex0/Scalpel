# Scalpel WebUI -- Requirements & Bridge API

> **Purpose:** Complete requirements bible for WebUI builders. If it is not in this document, the builders do not know about it.
> **Source files processed:** 15 files (~8,500 lines total)
> **Generated:** 2026-02-01
> **Synthesis agent:** Intelligence Synthesis specialist

---

## Project Status & Context

**Project:** Scalpel -- Android module that debloats system apps and systemizes user apps with multi-mode auto-detection across Magisk/KernelSU/APatch.

**Backend status:** 100% complete. Validated at 100/100 score across 7 fix rounds, 2 adversarial auditors, and a TAG polish round. Ship-ready.
(`progress.json:33`, `FOCUS.md:154-157`)

**Overall feature completion:** 21 of 26 features done (81%). The remaining 5 features are ALL WebUI.
(`FOCUS.md:153`, `progress.json:27-28`)

**Completed backend phases:**
- Phase 1: Foundation (config, logging, categories) -- DONE
- Phase 2: Detection + Safety (bootloop, detect) -- DONE
- Phase 3: First Mode + Scanner (mode_pm, scanner) -- DONE
- Phase 4: Primary Modes (whiteout, zeromount, magisk) -- DONE
- Phase 5: Boot Integration (post-fs-data, service) -- DONE
- Phase 6: Systemizer (promote, permissions) -- DONE
- Phase 7: Installation (customize, default debloat, uninstall) -- DONE
- Phase A.1: Validation Fix Round -- DONE
- Phase B: Backend Completion (mountify, symlink, monitor, action) -- DONE
- Phase B5: KSU Feature Integration (boot-completed, REMOVE, override.description) -- DONE
- Phase C: Comprehensive Backend Validation -- DONE
(`FOCUS.md:44-99`)

**Current phase:** Phase D -- WebUI Frontend. This is the ONLY remaining work.
(`FOCUS.md:14-37`, `progress.json:12`)

---

## WebUI Feature Requirements (#21-#24, #28)

The 5 WebUI features from `features.json` with their exact specifications.

### Feature #21: WebUI Scaffold

**Feature ID:** `webui-scaffold`
**Priority:** mvp
**Size:** M
**Status:** pending
**Dependencies:** None (all backend dependencies satisfied)
**Tags:** webui
(`features.json:245-256`)

**Description:**
Fork ZeroMount's `webroot-beta/` as starting point. Reuse bridge.ts, theme system, component library, Vite config, icon loading. Strip ZeroMount-specific tabs. Add tab navigation: Debloat, Systemize, Status, Settings. Add floating reboot FAB button with confirmation dialog.
(`features.json:247`)

**Acceptance Criteria (from FOCUS.md:20-28):**
- [ ] Fork ZeroMount's webroot-beta/ as starting point
- [ ] Reuse bridge.ts, theme system, component library, Vite config, icon loading
- [ ] Strip ZeroMount-specific tabs
- [ ] Add tab navigation: Debloat, Systemize, Status, Settings
- [ ] Add floating reboot FAB button with confirmation dialog

**Source to fork:** `/home/claudetest/zero-mount/nomount/webui-v2-beta/`
(`CLAUDE.md session-context`, `DECISIONS.md:188-194`)

**Reboot FAB specification:**
- Fixed-position Floating Action Button at bottom-right of WebUI (above tab bar)
- Confirmation dialog before executing reboot
- Always visible regardless of active tab
- Reboot command: `svc power reboot` executed via `exec()`
(`DECISIONS.md:203-204`)

---

### Feature #22: Debloat Tab

**Feature ID:** `webui-debloat`
**Priority:** mvp
**Size:** L (largest WebUI feature)
**Status:** pending
**Dependencies:** `webui-scaffold`, `core-scanner` (both satisfied)
**Tags:** webui
(`features.json:257-269`)

**Description:**
App list with lazy loading, category badges (essential/caution/safe/google/unknown), fuzzy search, multi-select, confirmation dialog with risk warnings, nuke button.
(`features.json:260`)

**Acceptance Criteria (from FOCUS.md:25):**
- [ ] App list loaded from cached `app_list.json` (instant, no generation wait)
- [ ] Category badges: essential, caution, safe, google, unknown
- [ ] Fuzzy search across package names and app labels
- [ ] Multi-select with batch operations
- [ ] Nuke button triggers debloat engine
- [ ] Refresh button triggers `scanner.sh` on demand (rare cases)

**Data source:**
- App list: `cat /data/adb/scalpel/app_list.json` via `exec()`
- Categories: `cat /data/adb/scalpel/categories.json` via `exec()` OR from bundled `webroot/categories.json`
- App icons: `ksu://icon/{packageName}` pattern (native KSU API, faster than aapt)
(`ARCHITECTURE.md:74-78`, `COMPLIANCE.md:389-396`, `kernelsu-module-webui.md:295-299`)

**Alternative icon source:** When `ksu://icon/` is unavailable (older managers), fall back to pre-extracted icons in `/data/adb/scalpel/icons/` cached at install time.
(`ARCHITECTURE.md:177`)

**Debloat execution flow:**
1. User selects apps in WebUI
2. JS writes `nuke_list.json` via `exec()` (jq command)
3. JS calls nuke engine: `busybox nsenter -t1 -m /path/to/nuke.sh`
4. User taps FAB reboot button with confirmation dialog
5. After reboot, mode executes at post-fs-data and apps are hidden
(`ARCHITECTURE.md:122-142`, `DESIGN.md:148-151`)

**Risk warning requirement:** When user selects apps in the `essential` or `caution` category, the confirmation dialog MUST display a risk warning explaining the category and potential consequences. Essential apps can cause bootloops.
(`features.json:260`, `DOMAIN.md:84-93`)

---

### Feature #23: Systemize Tab

**Feature ID:** `webui-systemize`
**Priority:** mvp
**Size:** M
**Status:** pending
**Dependencies:** `webui-scaffold`, `systemize-promote` (both satisfied)
**Tags:** webui
(`features.json:270-282`)

**Description:**
List user-installed apps, select target (app/priv-app), promote button, status verification after reboot.
(`features.json:273`)

**Acceptance Criteria (from FOCUS.md:27):**
- [ ] User app list loaded from `listPackages("user")` native API
- [ ] Target selection: app (regular system) or priv-app (privileged system)
- [ ] Promote button triggers systemization engine
- [ ] Post-reboot verification display showing FLAG_SYSTEM + sourceDir status

**Systemize execution flow:**
1. User selects app from user-installed list
2. User chooses target: `app` (regular) or `priv-app` (privileged)
3. JS calls: `exec("/path/to/promote.sh <packageName> <target>")` OR `spawn("promote.sh", [pkg, target])` for streaming progress
4. User reboots via FAB
5. After reboot, PMS scans /system, finds app, sets FLAG_SYSTEM
6. Status tab shows verification: FLAG_SYSTEM set, sourceDir = /system/...
(`ARCHITECTURE.md:144-161`, `COMPLIANCE.md:397-401`)

**User app enumeration:**
- Use `listPackages("user")` native API (faster than shell `pm list packages -3`)
- Use `getPackagesInfo(packages)` for labels, versions, isSystem flags
- Use `ksu://icon/{packageName}` for icons
(`kernelsu-module-webui.md:280-299`, `COMPLIANCE.md:389-396`)

**Important UX note:** Systemization requires a reboot to take effect. The UI should make this clear. The app will NOT appear as a system app until after reboot.
(`ARCHITECTURE.md:156-161`)

---

### Feature #24: Status Tab

**Feature ID:** `webui-status`
**Priority:** mvp
**Size:** M
**Status:** pending
**Dependencies:** `webui-scaffold` (satisfied)
**Tags:** webui
(`features.json:283-295`)

**Description:**
Active mode display, debloated app count, systemized app count, bootloop counter, module health, last operation log.
(`features.json:286`)

**Acceptance Criteria (from FOCUS.md:27):**
- [ ] Active mode display (which of the 6 modes is currently active)
- [ ] Debloated app count and list of debloated packages
- [ ] Systemized app count and verification status per app
- [ ] Bootloop counter value (0-2 normal, 3 = protection triggered)
- [ ] Module health indicators
- [ ] Last operation log viewer

**Data sources:**
- Operation status: `cat /data/adb/scalpel/status.json` via `exec()`
- Config (mode info): `cat /data/adb/scalpel/config.sh` via `exec()`
- Debug log: `cat /data/adb/scalpel/debug.log` via `exec()`
- Bootloop counter: `cat /data/adb/scalpel/count.sh` via `exec()` -- value is `BOOTCOUNT=N`
- Live verification: `dumpsys package <pkg> | grep -E 'flags=|sourceDir='` via `exec()`
- Nuke list: `cat /data/adb/scalpel/nuke_list.json` via `exec()`
- Systemize list: `cat /data/adb/scalpel/systemize_list.json` via `exec()`
(`DESIGN.md:148-156`, `ARCHITECTURE.md:167-178`, `COMPLIANCE.md:402-404`)

**status.json structure (written by nuke.sh):**
Contains: active mode, debloat count, debloat_failed count, partial flag, timestamps. The exact schema is defined by the backend -- read what `nuke.sh` writes.
(`ARCHITECTURE.md:57-60`, `LEARNINGS.md:739-754`)

---

### Feature #28: Settings Tab

**Feature ID:** `webui-settings`
**Priority:** phase2 (lower priority than other tabs, but still part of Phase D)
**Size:** M
**Status:** pending
**Dependencies:** `webui-scaffold` (satisfied)
**Tags:** webui
(`features.json:296-308`)

**Description:**
Mode override, theme selection, accent colors, logging toggle, clear all operations, export/import config.
(`features.json:299`)

**Acceptance Criteria (from FOCUS.md:28):**
- [ ] Mode override dropdown (auto / zeromount / mountify / symlink / whiteout / magisk / pm)
- [ ] Theme selection (dark/light)
- [ ] Accent color picker
- [ ] Logging toggle (enable/disable debug logging)
- [ ] Clear all operations (remove all debloat/systemize state)
- [ ] Export config (download config.sh as file)
- [ ] Import config (upload config.sh replacement)

**Config read/write pattern:**
- Read: `cat /data/adb/scalpel/config.sh` via `exec()`
- Write: Build new config content and write via `exec("echo 'key=value' > /data/adb/scalpel/config.sh")`
(`DESIGN.md:153-154`)

**Config variables the Settings tab controls:**
- `SCALPEL_MODE_OVERRIDE` -- mode override (auto/zeromount/mountify/symlink/whiteout/magisk/pm)
- `SCALPEL_LOG_LEVEL` -- logging level
- `SCALPEL_MONITOR_INTERVAL` -- background monitor poll interval
(`DESIGN.md:66-69`, `ARCHITECTURE.md:169`)

**Valid mode override values:** `auto`, `zeromount`, `mountify`, `symlink`, `whiteout`, `magisk`, `pm`
(`DESIGN.md:15`, `DECISIONS.md:55-56`)

---

## WebUI Design Specifications

### Tab Structure and Navigation

Four tabs in this exact order:
1. **Debloat** -- System app removal interface
2. **Systemize** -- User app promotion to system
3. **Status** -- Health monitoring and verification
4. **Settings** -- Configuration and preferences
(`FOCUS.md:24-28`, `ARCHITECTURE.md:12-22`)

Plus a persistent floating reboot FAB visible on all tabs.
(`DECISIONS.md:203-204`)

### Data Flow: WebUI to Backend

```
WebUI (Solid.js)
  |
  | import { exec, spawn, toast, ... } from 'kernelsu'
  v
kernelsu npm bridge (ksu.* native methods)
  |
  v
KSU/APatch Manager WebView (Android native)
  |
  | root shell execution
  v
Scalpel shell scripts (nuke.sh, promote.sh, scanner.sh)
  |
  | jq read/write
  v
JSON data files (/data/adb/scalpel/*.json)
```
(`COMPLIANCE.md:351-384`, `DESIGN.md:142-156`)

### Key Shell Operations from WebUI

| Operation | Shell Command | Method |
|-----------|--------------|--------|
| Load app list | `cat /data/adb/scalpel/app_list.json` | `exec()` |
| Save nuke list | `jq` write to `nuke_list.json` | `exec()` |
| Execute debloat | `busybox nsenter -t1 -m /path/to/nuke.sh` | `exec()` or `spawn()` |
| Execute systemize | `/path/to/promote.sh <pkg> <target>` | `exec()` or `spawn()` |
| Get status | `cat /data/adb/scalpel/status.json` | `exec()` |
| Read config | `cat /data/adb/scalpel/config.sh` | `exec()` |
| Write config | Write new content to `config.sh` | `exec()` |
| Verify app | `dumpsys package <pkg> \| grep -E 'flags=\|sourceDir='` | `exec()` |
| Refresh scan | Run `scanner.sh` | `exec()` or `spawn()` |
| Reboot | `svc power reboot` | `exec()` |
| Read debug log | `cat /data/adb/scalpel/debug.log` | `exec()` |
| Read categories | `cat /data/adb/scalpel/categories.json` | `exec()` |
(`DESIGN.md:142-156`, `COMPLIANCE.md:388-408`)

### File Build Output Structure

```
module/webroot/
  index.html          # Entry point (REQUIRED per KSU spec)
  assets/             # Vite build output (JS, CSS)
    index-[hash].js
    index-[hash].css
  categories.json     # App risk classifications (copied from build)
```
(`DESIGN.md:134-138`, `COMPLIANCE.md:331-338`)

**Permissions:** Do NOT set permissions on webroot/ manually for KSU/APatch. KernelSU auto-sets permissions and SELinux context on install. Only set for Magisk compatibility:
```sh
if [ -z "$KSU" ] && [ -z "$APATCH" ]; then
    set_perm_recursive "$MODPATH/webroot" 0 0 0755 0644
fi
```
(`kernelsu-module-webui.md:59-68`, `COMPLIANCE.md:340-347`)

### Error Handling Requirements

| Failure | WebUI Behavior | Source |
|---------|---------------|--------|
| Shell command fails (errno != 0) | Display error toast, show stderr in status | `DESIGN.md:82-93` |
| App list JSON missing | Show "No scan data. Tap Refresh to scan." | `DECISIONS.md:170-176` |
| Nuke engine interrupted | Show partial status, suggest reboot | `DESIGN.md:87` |
| Systemize APK copy fails | Show error, app remains as user app | `DESIGN.md:88` |
| Bridge unavailable (no ksu object) | Show "Bridge not available" fallback | `COMPLIANCE.md:416` |

### Performance Requirements

- App list loads instantly from cached JSON -- no generation wait
(`DECISIONS.md:170-171`, `ARCHITECTURE.md:74`)

- Scanner runs ONCE at install time. WebUI NEVER triggers a scan on open.
(`DECISIONS.md:169-176`)

- Manual refresh button available for rare cases (ROM update, manual system changes)
(`DECISIONS.md:171`, `FOCUS.md:25`)

---

## KernelSU WebUI Bridge API

Complete API reference from the `kernelsu` npm package v3.0.0.
(`kernelsu-module-webui.md:1-1088`)

### Available Methods

#### `exec(command, options?): Promise<ExecResults>`

Spawns a root shell and runs a command. Returns Promise resolving with stdout, stderr, and exit code.

**Parameters:**
- `command` (string) -- The shell command to run with space-separated arguments
- `options` (object, optional):
  - `cwd` (string) -- Working directory
  - `env` (object) -- Environment key-value pairs

**Returns:** `Promise<{ errno: number, stdout: string, stderr: string }>`
- `errno` = 0 means success
- All commands run as **root**

**Example:**
```typescript
import { exec } from 'kernelsu';
const { errno, stdout, stderr } = await exec('cat /data/adb/scalpel/app_list.json');
if (errno === 0) {
    const apps = JSON.parse(stdout);
}
```
(`kernelsu-module-webui.md:101-128`)

---

#### `spawn(command, args?, options?): ChildProcess`

Spawns a new root process with streaming output. Use for long-running operations (scanning, nuking).

**Parameters:**
- `command` (string) -- The command to run
- `args` (string[], optional) -- Command arguments
- `options` (object, optional):
  - `cwd` (string) -- Working directory
  - `env` (object) -- Environment key-value pairs

**Returns:** `ChildProcess` with:
- `stdout: Stdio` -- Readable stream, listen via `.on('data', callback)`
- `stderr: Stdio` -- Readable stream
- `.on('exit', (code) => void)` -- Exit event
- `.on('error', (err) => void)` -- Error event

**Example:**
```typescript
import { spawn } from 'kernelsu';
const proc = spawn('promote.sh', [packageName, 'priv-app']);
proc.stdout.on('data', (data) => { /* progress updates */ });
proc.on('exit', (code) => { /* completion */ });
```
(`kernelsu-module-webui.md:134-202`)

---

#### `fullScreen(isFullScreen: boolean): void`

Toggle WebView fullscreen mode. Synchronous call.
(`kernelsu-module-webui.md:205-218`)

---

#### `enableInsets(enable: boolean): void`

Toggle system bar insets padding. Disabled by default.

**Auto-enable via CSS:**
```html
<link rel="stylesheet" type="text/css" href="/internal/insets.css" />
```
Or in CSS:
```css
@import "https://mui.kernelsu.org/internal/insets.css";
```
This provides CSS variables for safe area padding and automatically enables insets.
(`kernelsu-module-webui.md:222-242`, `COMPLIANCE.md:420-428`)

---

#### `toast(message: string): void`

Show an Android toast notification. Synchronous call. Use for user feedback on actions.
(`kernelsu-module-webui.md:246-259`)

---

#### `moduleInfo(): string`

Returns the module ID string. Use to dynamically construct paths instead of hardcoding.
(`kernelsu-module-webui.md:263-275`)

---

#### `listPackages(type: string): string[]`

List installed packages by type. Synchronous call. Native API -- faster than shell `pm list packages`.

**Parameters:**
- `type`: `"user"`, `"system"`, or `"all"`

**Returns:** Array of package name strings.

**Icon URL pattern:** When `listPackages` is available, use `ksu://icon/{packageName}` for app icons:
```typescript
img.src = `ksu://icon/${packageName}`;
```
(`kernelsu-module-webui.md:279-299`)

---

#### `getPackagesInfo(packages: string[]): PackagesInfo[]`

Get detailed information for a list of packages. Synchronous call.

**Returns:** Array of objects with:
- `packageName` (string) -- Package name
- `versionName` (string) -- Version string
- `versionCode` (number) -- Version code integer
- `appLabel` (string) -- Display name
- `isSystem` (boolean) -- Whether system app
- `uid` (number) -- App UID
(`kernelsu-module-webui.md:303-328`)

---

### TypeScript Definitions

Complete type definitions from `kernelsu@3.0.0`:

```typescript
interface ExecOptions {
    cwd?: string,
    env?: { [key: string]: string }
}

interface ExecResults {
    errno: number,
    stdout: string,
    stderr: string
}

declare function exec(command: string): Promise<ExecResults>;
declare function exec(command: string, options: ExecOptions): Promise<ExecResults>;

interface SpawnOptions {
    cwd?: string,
    env?: { [key: string]: string }
}

interface Stdio {
    on(event: 'data', callback: (data: string) => void): void
}

interface ChildProcess {
    stdout: Stdio,
    stderr: Stdio,
    on(event: 'exit', callback: (code: number) => void): void
    on(event: 'error', callback: (err: any) => void): void
}

declare function spawn(command: string): ChildProcess;
declare function spawn(command: string, args: string[]): ChildProcess;
declare function spawn(command: string, options: SpawnOptions): ChildProcess;
declare function spawn(command: string, args: string[], options: SpawnOptions): ChildProcess;

declare function fullScreen(isFullScreen: boolean): void;
declare function enableInsets(enable: boolean): void;
declare function toast(message: string): void;
declare function moduleInfo(): string;

interface PackagesInfo {
    packageName: string;
    versionName: string;
    versionCode: number;
    appLabel: string;
    isSystem: boolean;
    uid: number;
}

declare function listPackages(type: string): string[];
declare function getPackagesInfo(packages: string[]): PackagesInfo[];
```
(`kernelsu-module-webui.md:335-401`)

---

### Bridge Lifecycle

1. KSU/APatch manager opens `webroot/index.html` in an Android WebView.
(`kernelsu-module-webui.md:563`)

2. Manager injects a native `ksu` global object into `window` scope. This is the bridge between JS and Android native layer.
(`kernelsu-module-webui.md:565-566`)

3. **exec() callback pattern:** JS generates a unique callback name, registers it on `window`, calls `ksu.exec(command, optionsJson, callbackName)`. Native side runs the command as root, then calls `window[callbackName](errno, stdout, stderr)`. The callback resolves the Promise and cleans up.
(`kernelsu-module-webui.md:567-573`)

4. **spawn() callback pattern:** A `ChildProcess` object is created and registered on `window`. `ksu.spawn(command, argsJson, optionsJson, childCallbackName)` is called natively. Native side streams via `window[childCallbackName].stdout.emit('data', chunk)`. On exit, `window[childCallbackName].emit('exit', code)` fires. Exit handler cleans up.
(`kernelsu-module-webui.md:574-579`)

5. **Synchronous APIs:** `fullScreen()`, `enableInsets()`, `toast()`, `moduleInfo()`, `listPackages()`, `getPackagesInfo()` call directly into `ksu` native object and return immediately. No callback pattern.
(`kernelsu-module-webui.md:581`)

**Native method table:**

| Native Method | JS Wrapper | Async | Description |
|---------------|-----------|-------|-------------|
| `ksu.exec(cmd, optionsJson, callbackName)` | `exec()` | Yes (Promise) | Run shell command as root |
| `ksu.spawn(cmd, argsJson, optionsJson, callbackName)` | `spawn()` | Yes (streaming) | Spawn process as root |
| `ksu.fullScreen(bool)` | `fullScreen()` | No | Toggle fullscreen |
| `ksu.enableInsets(bool)` | `enableInsets()` | No | Toggle system bar insets |
| `ksu.toast(msg)` | `toast()` | No | Show Android toast |
| `ksu.moduleInfo()` | `moduleInfo()` | No | Get module ID string |
| `ksu.listPackages(type)` | `listPackages()` | No | List packages (returns JSON string) |
| `ksu.getPackagesInfo(packagesJson)` | `getPackagesInfo()` | No | Get package details (returns JSON string) |
(`kernelsu-module-webui.md:587-596`)

**Security model:**
- All commands run as root. No permission escalation needed.
- WebUI is only accessible from the KSU/APatch manager app, not external browsers.
- KSU auto-sets permissions and SELinux context on `webroot/` during install.
(`kernelsu-module-webui.md:599-603`)

### Cross-Manager Differences

#### KernelSU (native WebUI support)

- `webroot/index.html` is loaded directly by the KSU manager app in a WebView
- The `ksu` global object is injected natively
- All 8 API methods are available
- `ksu://icon/{packageName}` works for app icons
- `ksud module config` available for persistent key-value storage (KSU-only enhancement)
(`kernelsu-module-webui.md:39-68`, `kernelsu-module-guide.md:470-503`)

#### APatch (identical to KernelSU)

- APatch's WebUI implementation is "completely the same as KernelSU"
- The `kernelsu` npm package works identically on APatch
- No APatch-specific WebUI adaptation needed
- WebUI support available since APatch version 10568
(`kernelsu-additional-docs.md:877`)

#### Magisk (no native WebUI)

- Magisk does NOT natively support `webroot/` or the `ksu` bridge
- `action.sh` launches a third-party WebUI viewer (KSUWebUIStandalone or MMRL) via `am start`
- These third-party apps open `webroot/index.html` in a WebView and polyfill the `ksu` bridge
- The `kernelsu` npm package will FAIL outside KSU/APatch WebView because the `ksu` global is not injected
- Scalpel's `action.sh` handles detection, download, and launch of these bridge apps
(`ARCHITECTURE.md:113`, `COMPLIANCE.md:410-416`, `kernelsu-module-webui.md:1052-1053`)

**Cross-manager WebUI summary:**

| Feature | KernelSU | APatch | Magisk |
|---------|----------|--------|--------|
| Native webroot/ support | Yes | Yes (identical) | No |
| ksu bridge injected | Yes | Yes | Via third-party app |
| exec() available | Yes | Yes | Via polyfill |
| spawn() available | Yes | Yes | Via polyfill |
| listPackages() available | Yes | Yes | May not be available |
| ksu://icon/ URLs | Yes | Yes | May not work |
| toast() | Yes | Yes | Via polyfill |
| WebUI entry point | Manager opens webroot/ | Manager opens webroot/ | action.sh launches app |
(`kernelsu-additional-docs.md:946-947`, `kernelsu-module-webui.md:1052`)

**Builder implication:** The WebUI code should check for bridge availability gracefully. If `window.ksu` does not exist, display a "Bridge not available" message rather than crashing.

---

## Architectural Decisions (WebUI-affecting)

### Decision 6: Solid.js + TypeScript WebUI

**Date:** 2026-01-31 | **Status:** Accepted

Framework: Solid.js + TypeScript + Vite. No terminal TUI. KSU bridge API via `ksu.exec()`.

**Rationale:** The developer already knows Solid.js from ZeroMount. Type safety prevents bugs found in reference projects. Reactive signals provide clean state management.
(`DECISIONS.md:96-103`)

---

### Decision 11: Scan Once at Install, Load Instantly in WebUI

**Date:** 2026-01-31 | **Status:** Accepted

Generate `app_list.json` ONCE during `customize.sh` installation. Cache in `/data/adb/scalpel/`. WebUI loads cached JSON instantly. Manual refresh button for rare cases (ROM update, manual system changes).

**Consequence for WebUI:** The app list is pre-generated. The WebUI NEVER triggers a scan on open. The refresh button is for rare edge cases.
(`DECISIONS.md:166-176`)

---

### Decision 12: Fork ZeroMount WebUI

**Date:** 2026-01-31 | **Status:** Accepted

Fork ZeroMount's `webroot-beta/` as the starting point. Reuse bridge.ts, theme system, component library, Vite config, icon loading patterns. Adapt tab contents for Scalpel.

**Source:** `/home/claudetest/zero-mount/nomount/webui-v2-beta/`
(`DECISIONS.md:183-194`)

---

### Decision 13: Floating Reboot Button (FAB)

**Date:** 2026-01-31 | **Status:** Accepted

- Fixed-position at bottom-right, above tab bar
- Confirmation dialog before executing reboot
- Always visible on every tab
- Command: `svc power reboot` via `exec()`
(`DECISIONS.md:198-204`)

---

### Decision 14: Default Debloat at Install (Volume Key)

**Date:** 2026-01-31 | **Status:** Accepted

During install, a curated default debloat list is shown with volume key prompt (UP=apply, DOWN=skip, 7s timeout=SKIP). This means some apps may already be debloated before the user ever opens the WebUI.

**WebUI implication:** The debloat tab must reflect the current state of `nuke_list.json`, which may already contain packages from the install-time default debloat.
(`DECISIONS.md:207-224`)

---

### Decision 1: Debloater + Systemizer (Both Directions)

**Date:** 2026-01-31 | **Status:** Accepted

Scalpel supports both debloating (removing system apps) and systemizing (promoting user apps to system). The WebUI must have tabs for both.
(`DECISIONS.md:5-24`)

---

### Decision 4: Auto-Detection with Boot Re-evaluation

**Date:** 2026-01-31 | **Status:** Accepted

Mode is re-evaluated at every boot. The status tab shows which mode was selected. The settings tab allows overriding the auto-detected mode.

**Probe order:** ZeroMount -> mountify/tmpfs -> symlink overlay -> overlayfs whiteouts -> magic mount -> pm disable
(`DECISIONS.md:63-80`)

---

## Hard Requirements Checklist

Every hard requirement extracted from all source documents.

### UI Framework & Build

- [ ] **Solid.js** -- reactive UI framework (`DECISIONS.md:100`)
- [ ] **TypeScript** -- type safety (`DECISIONS.md:100`)
- [ ] **Vite** -- build tool (`DECISIONS.md:100`, `FOCUS.md:31`)
- [ ] **Fork from ZeroMount webroot-beta** -- reuse proven patterns (`DECISIONS.md:188-194`)
- [ ] **No terminal TUI** -- WebUI is the only UI (`DECISIONS.md:100`)

### Visual Design

- [ ] **AMOLED-friendly dark background** (from CLAUDE.md project conventions)
- [ ] **Accent color support** -- user-selectable accent colors (`features.json:299`, `FOCUS.md:28`)
- [ ] **Theme selection** -- dark/light toggle (`features.json:299`)
- [ ] **Animations** -- smooth transitions (from CLAUDE.md project conventions)

### Navigation & Layout

- [ ] **4-tab navigation:** Debloat, Systemize, Status, Settings (`FOCUS.md:24-28`)
- [ ] **Floating Reboot FAB** at bottom-right, above tab bar, always visible (`DECISIONS.md:203-204`)
- [ ] **Confirmation dialog** before reboot execution (`DECISIONS.md:204`)

### Data Loading

- [ ] **App list loads from cached JSON** -- instant, no scan on WebUI open (`DECISIONS.md:170-171`)
- [ ] **Refresh button** for manual re-scan (rare cases) (`DECISIONS.md:171`)
- [ ] **Categories loaded** from bundled or cached JSON (`ARCHITECTURE.md:177`)

### Cross-Manager Compatibility

- [ ] **Must work in KernelSU WebView** -- native support (`kernelsu-module-webui.md:39-44`)
- [ ] **Must work in APatch WebView** -- identical to KSU (`kernelsu-additional-docs.md:877`)
- [ ] **Must work in Magisk WebView** -- via KSUWebUIStandalone/MMRL third-party app (`ARCHITECTURE.md:113`)
- [ ] **Bridge availability check** -- graceful fallback if `ksu` object not present (`COMPLIANCE.md:416`)

### Bridge API Usage

- [ ] **Use exec() for shell commands** -- all run as root (`kernelsu-module-webui.md:101-128`)
- [ ] **Use spawn() for long-running operations** -- streaming progress (`kernelsu-module-webui.md:134-202`)
- [ ] **Use toast() for user feedback** (`kernelsu-module-webui.md:246-259`)
- [ ] **Use moduleInfo()** to get module ID dynamically (`kernelsu-module-webui.md:263-275`)
- [ ] **Use listPackages() and getPackagesInfo()** for package enumeration (native, faster) (`kernelsu-module-webui.md:279-328`)
- [ ] **Use ksu://icon/{packageName}** for app icons (`kernelsu-module-webui.md:295-299`)

### Insets & Fullscreen

- [ ] **Enable system bar insets** via CSS import or enableInsets() call (`kernelsu-module-webui.md:222-242`)
- [ ] **Insets CSS available at** `/internal/insets.css` or `https://mui.kernelsu.org/internal/insets.css` (`kernelsu-module-webui.md:236-237`)

### Build Output

- [ ] **webroot/index.html** MUST exist (KSU requirement) (`kernelsu-module-webui.md:49`)
- [ ] **webroot/ directory** at module root level (`kernelsu-module-webui.md:65`)
- [ ] **Do NOT manually set permissions** on webroot/ for KSU/APatch (`kernelsu-module-webui.md:59`)
- [ ] **Device path:** `/data/adb/modules/scalpel/webroot/` (`kernelsu-module-webui.md:69`)

### Persistent Storage

- [ ] **localStorage works** but is lost if manager app uninstalled (`kernelsu-module-webui.md:1027`)
- [ ] **For persistent data,** write to `/data/adb/scalpel/` or `/data/adb/modules/scalpel/` via `exec()` (`kernelsu-module-webui.md:1028`)

---

## Domain Context for UI

### App Categories

5 risk tiers from `categories.json` (692 apps classified across 8 OEMs):
(`features.json:313-321`, `DOMAIN.md:84-93`)

| Category | Risk Level | User-Facing Description | Color Suggestion |
|----------|-----------|------------------------|-----------------|
| **essential** | CRITICAL -- brick risk | Removing this app may cause bootloops or break core system functionality. Not recommended. | Red |
| **caution** | HIGH -- degraded experience | Removing this app may break related features (connectivity, telephony, etc.). Proceed with care. | Orange/Amber |
| **safe** | LOW -- removable | This app can be safely removed without affecting core system functionality. | Green |
| **google** | LOW -- Google services | Google app that can be removed if GMS is not needed. May break Google-dependent features. | Blue |
| **unknown** | UNKNOWN | This app is not in the classification database. Research before removing. | Gray |

**UI requirement:** Essential and caution apps MUST show a warning badge. Confirmation dialogs for removing essential/caution apps MUST include the risk description.
(`features.json:260`, `LEARNINGS.md:609-631`)

---

### Mode Descriptions (User-Facing)

6 modes from best detection resistance to best compatibility:
(`DECISIONS.md:49-61`, `DESIGN.md:11-16`)

| Mode | User-Facing Name | Description for Status/Settings Tab |
|------|-----------------|-------------------------------------|
| `zeromount` | ZeroMount VFS | Top-tier stealth. Uses kernel-level path interception invisible to mount table scans. Requires ZeroMount metamodule. |
| `mountify` | Standalone Mount | Creates tmpfs+overlayfs mounts per partition. Good detection resistance. Mounts are ephemeral (reset on reboot). |
| `symlink` | Symlink Overlay | Uses empty opaque directories in module overlay. Simpler alternative for overlayfs-native root managers. |
| `whiteout` | OverlayFS Whiteout | Creates character device nodes that overlayfs treats as deleted files. Primary mechanism for stock kernels. |
| `magisk` | Magic Mount | Places whiteout files in module directory. Used automatically by Magisk's built-in mount system. Required for systemization. |
| `pm` | Package Manager | Software-level disable via Android's package manager. Universal fallback that works on all devices. Least stealthy. |

**Auto-detection order (best to worst):** zeromount -> mountify -> symlink -> whiteout -> magisk -> pm
(`DECISIONS.md:75-76`)

**Settings tab:** The mode override dropdown should list `auto` (default) plus all 6 modes. When set to `auto`, the backend selects the best available mode at each boot.
(`DECISIONS.md:72-73`)

---

### Safety Information

**Bootloop protection:** Scalpel has 3-strike bootloop protection. A counter in `count.sh` increments at each boot in post-fs-data. If it reaches 3, the module automatically: restores config backup, deletes whiteouts, disables itself, and reboots. The counter resets when boot completes successfully.
(`DESIGN.md:52-55`, `DOMAIN.md:91`, `GOAL.md:16`)

**Status tab should display:**
- Current bootloop counter value (0 = healthy, 1-2 = recent incomplete boots, 3+ = protection triggered)
- Whether module was auto-disabled by protection

**Systemize safety:** If APK copy fails during systemization, the user copy is NOT removed. The app remains as a user app with no damage. This is by design.
(`DESIGN.md:88`)

**Reboot requirement:** Both debloat and systemize require a reboot to take effect. The floating reboot FAB exists specifically for this. The confirmation dialog should explain why reboot is needed.
(`ARCHITECTURE.md:138`, `ARCHITECTURE.md:156`)

---

## Non-Goals & Constraints

From `GOAL.md:21-29`:

- **NOT a metamodule** -- Scalpel is a regular module that consumes the mounting system
- **NOT reimplementing VFS hooks** -- leverages ZeroMount when available
- **NOT building a standalone SUSFS engine** -- relies on ZeroMount's SUSFS integration
- **NOT supporting x86/x86_64 emulators in v1**
- **NOT providing app backup/restore** (data migration)
- **NOT re-signing APKs with platform keys** (Level 3 system privileges impossible without OEM key)

**WebUI constraints from domain:**
- WebUI must NOT trigger scanning on page open (scan runs at install, cached)
(`DECISIONS.md:169-171`)
- WebUI must NOT modify backend shell scripts -- read-only access to backend, command execution only
(`DESIGN.md:142-156`)
- Commands via exec()/spawn() must use full paths or rely on BusyBox ash PATH
(`kernelsu-module-webui.md:1052`)
- localStorage is volatile (cleared if manager app is uninstalled) -- use file-based persistence for anything important
(`kernelsu-module-webui.md:1027-1028`)

---

## Feature Dependencies Graph

```
                    +------------------+
                    | webui-scaffold   |  <-- No dependencies (backend done)
                    | (Feature #21)    |
                    +--------+---------+
                             |
              +--------------+--------------+--------------+
              |              |              |              |
    +---------v--------+ +---v-----------+ +-v-----------+ +-v-----------+
    | webui-debloat    | | webui-systemize| | webui-status| | webui-settings|
    | (Feature #22)    | | (Feature #23)  | | (Feature #24)| | (Feature #28)|
    | deps: scaffold + | | deps: scaffold +| | deps: scaffold| | deps: scaffold|
    |   core-scanner   | |   sys-promote  | |              | |              |
    +------------------+ +----------------+ +--------------+ +--------------+
```

**Dependency details from features.json:**

| Feature | Blocked By | Status of Blockers |
|---------|-----------|-------------------|
| `webui-scaffold` | (none) | N/A -- ready to start |
| `webui-debloat` | `webui-scaffold`, `core-scanner` | scaffold=pending, scanner=done |
| `webui-systemize` | `webui-scaffold`, `systemize-promote` | scaffold=pending, promote=done |
| `webui-status` | `webui-scaffold` | scaffold=pending |
| `webui-settings` | `webui-scaffold` | scaffold=pending |
(`features.json:252-306`)

**Build order:** Scaffold MUST be built first. After scaffold, the 4 tabs can be built in any order (no inter-tab dependencies). Recommended order from FOCUS.md: Debloat -> Systemize -> Status -> Settings.
(`FOCUS.md:94-99`)

---

## Persistent State Reference

All data files the WebUI reads/writes, with their locations and formats:
(`ARCHITECTURE.md:167-178`)

| File | Path | Format | Read/Write | Purpose |
|------|------|--------|------------|---------|
| `config.sh` | `/data/adb/scalpel/config.sh` | Shell vars | R/W | Module configuration |
| `config.sh.bak` | `/data/adb/scalpel/config.sh.bak` | Shell vars | R | Bootloop recovery backup |
| `nuke_list.json` | `/data/adb/scalpel/nuke_list.json` | JSON | R/W | Apps marked for debloat |
| `systemize_list.json` | `/data/adb/scalpel/systemize_list.json` | JSON | R/W | Apps marked for systemize |
| `app_list.json` | `/data/adb/scalpel/app_list.json` | JSON | R | All system apps (generated at install) |
| `categories.json` | `/data/adb/scalpel/categories.json` | JSON | R | App risk classifications |
| `status.json` | `/data/adb/scalpel/status.json` | JSON | R | Current operation status |
| `count.sh` | `/data/adb/scalpel/count.sh` | Shell var | R | Bootloop counter (BOOTCOUNT=N) |
| `debug.log` | `/data/adb/scalpel/debug.log` | Text | R | Debug log (1MB max, 3 archives) |
| `icons/` | `/data/adb/scalpel/icons/` | PNG files | R | Cached app icons |

---

## npm Package Reference

**Package:** `kernelsu` version 3.0.0
**License:** Apache-2.0
**Repository:** https://github.com/tiann/KernelSU
**npm:** https://www.npmjs.com/package/kernelsu

Install:
```sh
npm install kernelsu
# or
yarn add kernelsu
```
(`kernelsu-module-webui.md:91-95`, `kernelsu-module-webui.md:1057-1073`)
