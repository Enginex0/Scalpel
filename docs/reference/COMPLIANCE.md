# Scalpel Compliance Checklist

> Cross-reference of official KernelSU/APatch/Magisk documentation against Scalpel's architecture, design, and implemented code.
> Generated: 2026-02-01

---

## 1. What Scalpel Does Right

These are areas where Scalpel's design and implementation already align with the official documentation.

### 1.1 Module Structure (PASS)

Scalpel's `module/` directory follows the standard structure defined in kernelsu-module-guide.md (lines 83-138):
- `module.prop` present with correct format (id matches `^[a-zA-Z][a-zA-Z0-9._-]+$`, versionCode is integer)
- `post-fs-data.sh`, `service.sh`, `customize.sh`, `uninstall.sh`, `action.sh` in correct locations
- `webroot/` directory planned at module root level
- No manual creation of auto-generated symlinks (`vendor`, `product`, `system_ext`)

### 1.2 Root Manager Detection (PASS)

`core/detect.sh` (lines 11-22) correctly detects all three root managers using the documented environment variables:
- `$KSU` for KernelSU (kernelsu-additional-docs.md line 965)
- `$APATCH` for APatch (kernelsu-additional-docs.md line 966)
- Default fallback to Magisk
- Does NOT use `MAGISK_VER_CODE` for detection (which is faked: 25200 on KSU, 27000 on APatch)

### 1.3 BusyBox Path Discovery (PASS)

`core/detect.sh` (lines 24-38) searches all three documented BusyBox paths:
- `/data/adb/magisk/busybox` (Magisk)
- `/data/adb/ksu/bin/busybox` (KernelSU)
- `/data/adb/ap/bin/busybox` (APatch)

This matches kernelsu-additional-docs.md lines 986-993.

### 1.4 MODDIR Usage (PASS)

All boot scripts use `MODDIR="${0%/*}"` as documented in kernelsu-module-guide.md line 180-181. The `customize.sh` correctly uses `$MODPATH` (the installation-time variable) and sets `MODDIR="$MODPATH"` when sourcing scanner (customize.sh line 61).

### 1.5 Boot Stage Awareness (PASS)

- `post-fs-data.sh` correctly avoids `pm` commands (PMS unavailable). The nuke engine runs but pm mode failures are expected and retried in `service.sh`.
- `service.sh` waits for `sys.boot_completed` before running pm operations (lines 10-17).
- Decision 15 (DECISIONS.md) explicitly documents and handles pm mode deferral.

### 1.6 setprop Avoidance in post-fs-data (PASS)

`post-fs-data.sh` does not use `setprop`. This avoids the documented deadlock (kernelsu-module-guide.md line 332, android-shell-reference.md lines 71-76).

### 1.7 customize.sh Functions (PASS)

`customize.sh` correctly uses:
- `ui_print` (not `echo`) for console output
- `set_perm` and `set_perm_recursive` for permissions
- Does not use `exit` (would skip cleanup)

### 1.8 Whiteout Creation Method (PASS)

`core/whiteout_helpers.sh` uses `mknod <path> c 0 0` for KernelSU/APatch file deletion, matching the documented OverlayFS whiteout pattern (kernelsu-module-guide.md lines 199-213). The `setfattr -n trusted.overlay.whiteout -v y` attribute is also applied, matching the xattr documentation.

### 1.9 jq Bundling Strategy (PASS)

Scalpel bundles its own jq binary, correctly identified as not available on stock Android (android-shell-reference.md lines 489-496). Architecture-specific binaries are placed in `bin/` and selected during `customize.sh`.

### 1.10 Atomic JSON Writes (PASS)

The project design specifies writing to `.tmp` files and using `mv` for atomic replacement, matching the documented best practice (android-shell-reference.md lines 600-633).

### 1.11 KSU/APatch WebUI Action.sh Removal (PASS)

`customize.sh` (lines 109-112) removes `action.sh` when running on KSU or APatch, since these have native WebUI support via `webroot/`. The `action.sh` is only retained for Magisk, which needs a bridge to an external WebUI app.

---

## 2. What Scalpel Must Fix (CRITICAL)

These are contradictions between Scalpel's current implementation and the official documentation.

### 2.1 CRITICAL: module.prop Missing Fields

**File:** `/home/claudetest/zero-mount/Scalpel/module/module.prop`
**Issue:** Missing optional but valuable fields documented in kernelsu-module-guide.md (lines 146-169):

Current:
```
id=scalpel
name=Scalpel
version=v0.1.0
versionCode=1
author=Jeremy Wealth
description=Clinical debloater + systemizer with multi-mode auto-detection
```

Missing:
- `updateJson=<url>` -- For OTA module updates via KSU/APatch manager
- `webuiIcon=<path>` -- Custom icon for WebUI shortcut in manager (e.g., `webuiIcon=icon/scalpel.png`)

**Severity:** Medium. Not a functional issue, but leaving `updateJson` empty means no in-app update support. The `webuiIcon` improves UX in the KSU/APatch manager.

### 2.2 CRITICAL: Module Description Update Uses sed on module.prop

**File:** `/home/claudetest/zero-mount/Scalpel/module/service.sh` (lines 59-75)
**Issue:** The `_update_module_description()` function modifies `module.prop` directly via `sed`:

```sh
sed -i "s|^description=.*|description=${desc}|" "${MODDIR}/module.prop" 2>/dev/null
```

**Problem:** KernelSU provides a proper API for this exact purpose -- `ksud module config set override.description` (kernelsu-module-config.md lines 103-116). The `override.description` config key is specifically designed to dynamically change the module description shown in the manager without modifying `module.prop`.

**Impact on KernelSU:** The sed approach works but is fragile and not the "official" way. The `module.prop` on disk may be inside an ext4 image on meta-overlayfs, making in-place sed edits unreliable or fail silently.

**Impact on Magisk/APatch:** On Magisk, there is no `ksud` so `sed` on `module.prop` is the only option. On APatch, `ksud` is not available either.

**Fix:** Use `ksud module config set override.description` when `$KSU=true`, fall back to sed for Magisk/APatch.

### 2.3 CRITICAL: No boot-completed.sh Script

**Issue:** Scalpel does not have a `boot-completed.sh` script. All post-boot work is done in `service.sh` by polling `sys.boot_completed`. KernelSU and APatch natively support `boot-completed.sh` (kernelsu-module-guide.md lines 229, 267-268), which runs after the `ACTION_BOOT_COMPLETED` broadcast.

**Impact:** The current polling approach works but wastes CPU cycles and adds latency. On KernelSU/APatch, the module could use `boot-completed.sh` for operations that truly need full boot (verification, monitor start, description update), while keeping `service.sh` lean.

**Fix:** Move the bootloop counter reset, pm retry, verification, and description update into `boot-completed.sh`. Keep `service.sh` for minimal early work. On Magisk (which lacks `boot-completed.sh`), keep the polling approach in `service.sh`.

### 2.4 CRITICAL: No post-mount.sh Script

**Issue:** KernelSU and APatch support `post-mount.sh` which runs after OverlayFS is mounted (kernelsu-module-guide.md lines 228, 285). Scalpel does not use this. For modes that depend on mounted overlays (mode_whiteout), `post-mount.sh` is the correct stage to verify mounts took effect.

**Impact:** Low for current implementation (verification happens in service.sh after full boot anyway), but this is a missed optimization for KernelSU/APatch users.

### 2.5 CRITICAL: Scalpel Does NOT Check for Metamodule

**Issue:** On KernelSU, `/system` overlay modifications only work if the user has a metamodule installed (kernelsu-module-guide.md lines 44-47, 192-195; kernelsu-additional-docs.md lines 135-136). Scalpel's `detect.sh` probes for OverlayFS support in `/proc/filesystems` but does NOT check whether a metamodule is actually installed.

**How to check:** Look for the `/data/adb/metamodule` symlink (kernelsu-module-guide.md lines 822-829). If it does not exist on a KernelSU device, whiteout/overlay modes will silently fail.

**Fix:** In `detect.sh`, when root manager is KSU, verify `/data/adb/metamodule` exists before selecting overlay-based modes (whiteout, mountify, symlink). If missing, log a warning and fall through to pm mode.

**Severity:** HIGH. Without this check, Scalpel may create whiteouts that never take effect, giving users the false impression apps are removed.

---

## 3. What Scalpel Should Consider

These are features or behaviors mentioned in the documentation that Scalpel has not addressed but should.

### 3.1 Module Disable Flag Check in post-fs-data.sh

**Issue:** `service.sh` checks `[ -f "${MODDIR}/disable" ] && exit 0` (line 6), but `post-fs-data.sh` does not. The docs say disabled modules should not execute scripts (kernelsu-module-guide.md line 107, line 433). KernelSU/APatch may handle this at the framework level, but Magisk does not always enforce it for all scripts.

**Recommendation:** Add disable check at the top of `post-fs-data.sh` for safety.

### 3.2 KernelSU AB Update Rollback

**Documentation:** KernelSU uses Android's AB update mechanism -- if module installation causes a boot failure, the system auto-rolls back (kernelsu-additional-docs.md lines 626-629). This means Scalpel's 3-strike bootloop protection is complementary (additional safety), not redundant. On KernelSU, the AB rollback may trigger before Scalpel's counter reaches 3.

**Recommendation:** Document this interaction. Scalpel's bootloop protection is most valuable on Magisk (no AB rollback) and APatch (limited rollback).

### 3.3 Safe Mode Interaction

**Documentation:** All three root managers support Volume Down safe mode (kernelsu-additional-docs.md lines 1012-1019). In safe mode, all modules are disabled. Scalpel's bootloop protection should be aware that safe mode may reset the boot counter via a different mechanism.

**Recommendation:** In `bootloop.sh`, check if safe mode was triggered (e.g., `getprop ro.sys.safemode`) and log accordingly.

### 3.4 Split APK Handling for Systemization

**Documentation:** Modern Android extensively uses split APKs (android-shell-reference.md lines 1168-1175). `pm path` may return multiple APK paths for a single package.

**Recommendation:** Verify `promote.sh` handles all split APKs (base + config splits). The `pm path` output can include `split_config.arm64_v8a.apk`, `split_config.xxhdpi.apk`, etc.

### 3.5 SELinux Context Restoration

**Documentation:** After writing files to `/data/adb/`, SELinux context may need restoration (android-shell-reference.md lines 591-594):
```sh
chcon u:object_r:adb_data_file:s0 /data/adb/scalpel/config.json
```

**Recommendation:** After creating/modifying files in `/data/adb/scalpel/`, ensure correct SELinux context. The `restorecon` command or explicit `chcon` should be used.

### 3.6 UNIX (LF) Line Endings in module.prop

**Documentation:** module.prop must use `UNIX (LF)` line breaks (kernelsu-module-guide.md line 167). If any build step or editor introduces CRLF, the module will malfunction.

**Recommendation:** Add a `.gitattributes` or build-step check to enforce LF line endings on all `.prop` and `.sh` files.

### 3.7 General Scripts Directory Warning

**Documentation:** Modules should NOT add general scripts during installation (kernelsu-module-guide.md line 348, line 429). General scripts go in `/data/adb/post-fs-data.d/`, `/data/adb/service.d/`, etc.

**Status:** Scalpel does not add general scripts. This is correct. Noted for future development.

---

## 4. KernelSU-Specific Features Scalpel Can Leverage

### 4.1 `ksud module config` -- Built-in Key-Value Store

**Reference:** kernelsu-module-config.md (full document), kernelsu-module-webui.md (lines 606-716)

Scalpel currently uses file-based config (`/data/adb/scalpel/config.sh`). On KernelSU, the `ksud module config` system provides:
- Persistent key-value storage (survives reboots)
- Temporary key-value storage (cleared on boot)
- Binary-safe storage up to 1MB per value
- Automatic cleanup on module uninstall
- 32 entries per module

**Opportunity:** For KernelSU users, store mode preference, last verified state, and UI preferences via `ksud module config` instead of or in addition to the shell config file. The temp config is ideal for runtime state (e.g., current boot's detected mode).

**Constraint:** Only available on KernelSU. Magisk and APatch have no equivalent. Scalpel must maintain the file-based config as the primary system, using `ksud module config` as an enhancement.

### 4.2 `override.description` -- Dynamic Module Description

**Reference:** kernelsu-module-config.md (lines 103-116)

```sh
ksud module config set override.description "Debloated: 15 | Verified: 15 | Mode: whiteout"
```

This is the proper way to update the module description in the KSU manager. Much cleaner than `sed` on `module.prop`, and the value is shown immediately without module reload.

### 4.3 `manage.kernel_umount` -- Control Kernel Unmount

**Reference:** kernelsu-module-config.md (lines 119-148)

Scalpel could declare:
```sh
ksud module config set manage.kernel_umount false
```

This tells KernelSU that Scalpel is managing the kernel unmount feature and wants it disabled. This is relevant because Scalpel's debloated apps should remain hidden from all app scans -- if kernel_umount is enabled, KernelSU might unmount overlays for certain apps, making debloated packages visible again.

**Recommendation:** Evaluate whether Scalpel should manage this feature. If debloat relies on OverlayFS mounts persisting in all app contexts, disabling kernel_umount may be necessary.

### 4.4 `boot-completed.sh` -- Dedicated Boot-Complete Stage

**Reference:** kernelsu-module-guide.md (lines 229, 267-268, 433)

Available on KernelSU and APatch but not Magisk. This is the clean place for:
- Bootloop counter reset
- PM retry for pm mode
- Verification run
- Module description update
- Monitor daemon start

### 4.5 `post-mount.sh` -- Post-Mount Verification

**Reference:** kernelsu-module-guide.md (lines 228, 285, 433)

Runs after metamodule mounts all modules. Useful for early verification that OverlayFS whiteouts are in effect before the system fully boots.

### 4.6 `REMOVE` Variable in customize.sh

**Reference:** kernelsu-module-guide.md (lines 199-213)

Scalpel could use the `REMOVE` variable in `customize.sh` for immediate default debloat during installation:
```sh
REMOVE="
/system/app/YouTube
/system/app/Bloatware
"
```

KernelSU/APatch will auto-create `mknod` whiteouts in the module directory. This is simpler than Scalpel's current manual whiteout creation for the default debloat list.

**Caveat:** This only works at install time, not for dynamic debloat. And it creates whiteouts in the module's `system/` directory, which requires a metamodule to take effect.

### 4.7 `action.sh` for Quick Actions

**Reference:** kernelsu-module-guide.md (lines 118, 231, 269)

On KernelSU/APatch, `action.sh` runs when the user clicks the Action button in the manager. Scalpel could use this for quick actions (e.g., rescan apps, force verify, toggle debloat).

**Note:** Scalpel currently removes `action.sh` on KSU/APatch (customize.sh line 110-112). This should be reconsidered -- `action.sh` and `webroot/` can coexist.

---

## 5. APatch-Specific Considerations

### 5.1 ARM64 Only

**Reference:** kernelsu-additional-docs.md (line 841, line 973)

APatch supports ARM64 architecture only. Scalpel's `detect_aapt()` handles arm64 and armeabi-v7a -- the ARM32 path is irrelevant on APatch but does not cause harm.

### 5.2 No `ksud module config`

APatch does not have KernelSU's `ksud module config` system. All configuration must be file-based. Scalpel's current `config.sh` approach works for APatch.

### 5.3 MAGISK_VER_CODE = 27000

**Reference:** kernelsu-additional-docs.md (line 717, line 968)

APatch fakes `MAGISK_VER_CODE=27000` (vs KernelSU's `25200`). Scalpel correctly does not use this for detection (uses `$APATCH` instead).

### 5.4 SELinux Bypass vs Modification

**Reference:** kernelsu-additional-docs.md (lines 809-811)

APatch uses KernelPatch to bypass SELinux via kernel hooks rather than modifying the SELinux policy. `sepolicy.rule` still works (APatch uses `magiskpolicy` internally), but the underlying mechanism is different. This means:
- Scalpel's `sepolicy.rule` (if added) will work on APatch
- Direct SELinux context checks may behave differently on APatch
- `getenforce` may still return "Enforcing" even though hooks bypass enforcement

### 5.5 WebUI Compatibility

**Reference:** kernelsu-additional-docs.md (line 877)

APatch's WebUI implementation is "completely the same as KernelSU." The `kernelsu` npm package works on both. No APatch-specific WebUI adaptation needed.

### 5.6 module.img Dropped (APatch 10977+)

**Reference:** kernelsu-additional-docs.md (lines 886-888)

APatch dropped `module.img` support. All previously installed modules are lost on update. This is a user concern, not a Scalpel code concern, but the WebUI status tab could check APatch version and warn about this.

### 5.7 APatch Metamodule Support

**Reference:** kernelsu-additional-docs.md (lines 815-831)

APatch has adopted the metamodule system from KernelSU. Available metamodules include overlayfs, mountify, magic mount, hybrid mount. Scalpel's metamodule check (recommended in Section 2.5) should also apply to APatch.

---

## 6. WebUI Blueprint

Based on the documentation, Scalpel's WebUI architecture should follow this structure.

### 6.1 File Structure

```
module/webroot/
  index.html          # Entry point (REQUIRED, per kernelsu-module-webui.md line 49)
  assets/             # Vite build output (JS, CSS, images)
    index-[hash].js
    index-[hash].css
  categories.json     # App risk classifications (copied from build)
```

**Permissions:** Do NOT set manually. KernelSU auto-sets permissions and SELinux context on `webroot/` during install (kernelsu-module-webui.md lines 59-68).

**Note on customize.sh line 119:** Scalpel currently calls `set_perm_recursive "$MODPATH/webroot" 0 0 0755 0644`. Per the docs, this is unnecessary and potentially counterproductive for KernelSU. However, it is needed for Magisk compatibility (where the manager does not auto-set webroot permissions). Consider making this conditional:
```sh
if [ -z "$KSU" ] && [ -z "$APATCH" ]; then
    set_perm_recursive "$MODPATH/webroot" 0 0 0755 0644
fi
```

### 6.2 Bridge Pattern

```
                 +-----------------+
                 |   Solid.js UI   |
                 |  (index.html)   |
                 +--------+--------+
                          |
                    import { exec, spawn, toast,
                    moduleInfo, listPackages,
                    getPackagesInfo } from 'kernelsu'
                          |
                 +--------v--------+
                 |  kernelsu npm   |
                 |  (bridge.js)    |
                 +--------+--------+
                          |
                  window.ksu.exec()
                  window.ksu.spawn()
                  window.ksu.toast()   (sync)
                  window.ksu.moduleInfo()  (sync)
                  window.ksu.listPackages()  (sync)
                          |
                 +--------v--------+
                 | KSU Manager     |
                 | (Android native)|
                 | WebView + JNI   |
                 +--------+--------+
                          |
                    root shell execution
                          |
                 +--------v--------+
                 | Scalpel scripts |
                 | (nuke.sh, etc)  |
                 +-----------------+
```

### 6.3 Key API Usage for Scalpel Tabs

**Debloat Tab:**
- `listPackages("system")` -- get system package names (native API, faster than `pm list packages -s`)
- `getPackagesInfo(pkgs)` -- get labels, versions, isSystem flags
- `ksu://icon/{packageName}` -- app icons (no aapt needed for WebUI)
- `exec("cat /data/adb/scalpel/app_list.json")` -- load cached scan
- `exec("cat /data/adb/scalpel/categories.json")` -- load risk categories
- `exec("/path/to/nuke.sh ...")` -- execute debloat
- `toast("3 apps debloated")` -- feedback

**Systemize Tab:**
- `listPackages("user")` -- list user-installed apps
- `exec("/path/to/promote.sh <pkg> <target>")` -- systemize
- `spawn("promote.sh", [pkg, target])` -- streaming progress

**Status Tab:**
- `exec("cat /data/adb/scalpel/status.json")` -- operation status
- `exec("dumpsys package <pkg> | grep -E 'flags=|sourceDir='")` -- live verification

**Settings Tab:**
- `exec("cat /data/adb/scalpel/config.sh")` -- read config
- `exec("echo 'SCALPEL_MODE_OVERRIDE=whiteout' > /data/adb/scalpel/config.sh")` -- write config

### 6.4 Magisk Compatibility

On Magisk, `webroot/` is not natively supported. The `action.sh` script should launch a third-party WebUI viewer:
- KSUWebUIStandalone or MMRL (opens `webroot/index.html` in a WebView with the `ksu` bridge polyfilled)
- The ZeroMount project uses this pattern

The `kernelsu` npm package will fail outside KSU/APatch WebView because the `ksu` global is not injected. For Magisk, the bridge must be polyfilled (e.g., via `am start` to a local HTTP server that proxies shell commands).

### 6.5 Insets and Fullscreen

For proper display:
```html
<link rel="stylesheet" type="text/css" href="/internal/insets.css" />
```
Or in CSS:
```css
@import "https://mui.kernelsu.org/internal/insets.css";
```
This auto-enables `enableInsets(true)` and provides CSS variables for safe area padding (kernelsu-module-webui.md lines 234-237).

---

## 7. sed vs awk Clarification

### 7.1 Availability

| Tool | Stock Android | Minimum Version | BusyBox (all root managers) |
|------|---------------|-----------------|----------------------------|
| `sed` | Yes (toybox) | Android 6.0 (API 23) | Yes |
| `awk` | Yes (toybox "one true awk") | **Android 9.0 (API 28)** | Yes |

**Reference:** android-shell-reference.md (lines 286-360)

### 7.2 What Scalpel Currently Uses

Scalpel uses `sed` in one location:
- `service.sh` line 74: `sed -i "s|^description=.*|description=${desc}|" "${MODDIR}/module.prop"`

Scalpel does NOT use `awk` in any script. All text processing is done via `jq` for JSON and built-in shell parameter expansion for strings.

### 7.3 What Is Safe to Use

**sed:** Safe on all supported Android versions (6.0+) and in BusyBox ash Standalone Mode. Both toybox and BusyBox sed support `-i` (in-place) and `-E` (extended regex). Neither supports GNU extensions (`\U`, `\L`).

**awk:** Safe in BusyBox ash Standalone Mode (always available through BusyBox). NOT safe if calling stock toybox awk on Android 8.x or earlier (toybox awk was added in Android 9). Since Scalpel module scripts always run in BusyBox ash with Standalone Mode, BusyBox awk is always available. However, if you ever call `/system/bin/awk` explicitly, it may not exist on older devices.

### 7.4 Recommendation

- **For module scripts (post-fs-data.sh, service.sh, etc.):** Both `sed` and `awk` are safe because BusyBox Standalone Mode is active and both are BusyBox applets.
- **For customize.sh:** Both are safe because customize.sh also runs in BusyBox ash Standalone Mode (kernelsu-module-guide.md line 275, line 364).
- **For WebUI shell commands via `exec()`:** Commands run as root. BusyBox may or may not be in PATH depending on how the root manager launches the shell. Prefer explicit BusyBox paths or use `jq` for structured data.
- **Scalpel's approach is correct:** Use `jq` for JSON processing (bundled), use shell builtins for string processing, minimize `sed`/`awk` usage.

### 7.5 The sed in service.sh Should Be Replaced

The single `sed` usage in `service.sh` (for module description) should be replaced with `ksud module config set override.description` on KernelSU (see Section 2.2). On Magisk/APatch where `ksud` is unavailable, `sed` on `module.prop` is acceptable.

---

## Summary: Priority Action Items

### Must Fix (Before Release)

| Priority | Item | Section | Impact |
|----------|------|---------|--------|
| P0 | Add metamodule check in detect.sh for KSU/APatch | 2.5 | Silent debloat failure on KSU without metamodule |
| P1 | Use `override.description` on KSU instead of sed | 2.2 | Fragile on meta-overlayfs ext4 images |
| P1 | Add `boot-completed.sh` for KSU/APatch | 2.3 | Wasted CPU from polling; cleaner separation |
| P2 | Add `disable` flag check in post-fs-data.sh | 3.1 | Potential script execution when module disabled |

### Should Do (Before v1.0)

| Priority | Item | Section | Impact |
|----------|------|---------|--------|
| P2 | Add `updateJson` and `webuiIcon` to module.prop | 2.1 | No in-app updates; missing icon |
| P2 | Leverage `REMOVE` variable for default debloat | 4.6 | Simpler install-time debloat |
| P2 | Reconsider action.sh removal on KSU/APatch | 4.7 | Lost quick-action capability |
| P3 | Add `post-mount.sh` for early mount verification | 2.4 | Missed optimization opportunity |
| P3 | Conditional webroot permissions in customize.sh | 6.1 | Unnecessary perm set on KSU/APatch |
| P3 | Add metamodule check for APatch too | 5.7 | Same issue as KSU |
| P3 | Enforce LF line endings in build pipeline | 3.6 | Preventive measure |

### Nice to Have (Future)

| Priority | Item | Section | Impact |
|----------|------|---------|--------|
| P4 | Use `ksud module config` for KSU-specific settings | 4.1 | Better integration with KSU ecosystem |
| P4 | Evaluate `manage.kernel_umount` declaration | 4.3 | Prevent overlay unmount for debloated apps |
| P4 | Use `listPackages()` and `getPackagesInfo()` in WebUI | 6.3 | Native API faster than shell `pm list` |
| P4 | Use `ksu://icon/{packageName}` for app icons | 6.3 | No aapt needed for icons in WebUI |
| P4 | Check safe mode property in bootloop.sh | 3.3 | Better logging and counter behavior |
