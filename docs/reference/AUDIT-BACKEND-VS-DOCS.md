# Scalpel Backend Audit Report -- Implementation vs Official Documentation

**Auditor:** Red Team Rex
**Date:** 2026-02-01
**Scope:** 19 shell scripts + module.prop cross-referenced against KernelSU module guide, KernelSU module config, KernelSU additional docs (APatch, boot stages, metamodule), and Android shell reference.
**Verdict:** 17 findings (3 CRITICAL, 4 HIGH, 5 MEDIUM, 3 LOW, 2 INFO)

---

## CRITICAL-01: nuke.sh Runs Debloat Engine at post-fs-data Stage -- PM Mode Will Always Fail

**File:** post-fs-data.sh:21-22
**Category:** Boot Stage
**Documentation Reference:** kernelsu-module-guide.md:327-333, android-shell-reference.md:56-88
**Issue:** `post-fs-data.sh` sources and executes `nuke_run()`, which calls `detect_mode()`. When auto-detection falls through to `pm` mode (the universal fallback), `mode_pm.sh` executes `pm disable-user --user 0`. However, PMS (PackageManagerService) is **not running** at the post-fs-data stage. The documentation is explicit: "This stage happens before Zygote is started" and "PMS is NOT available here." The `pm` command communicates via binder to `system_server`, which has not started yet.

While `service.sh` has a `_retry_pm_debloat()` function that re-runs pm mode after boot, the initial failure in post-fs-data will (a) write `debloat_failed > 0` to status.json, (b) log errors for every package, and (c) waste time attempting commands that cannot succeed.

For overlay-based modes (whiteout, magisk, zeromount), running at post-fs-data is correct -- these are filesystem operations that SHOULD happen before module mounting. But the orchestrator does not differentiate.

**Evidence:**
```sh
# post-fs-data.sh:21-22
. "${MODDIR}/core/nuke.sh"
nuke_run || log_w "post-fs-data" "nuke completed with failures"
```
```sh
# mode_pm.sh:16
pm disable-user --user 0 "$pkg" 2>/dev/null | grep -q "disabled"
```

**Fix:** Defer pm-mode debloat entirely to service.sh. In `nuke_run()` or `post-fs-data.sh`, check if the detected mode is `pm` and skip execution, writing a marker for service.sh to pick it up. Alternatively, split the orchestration so that filesystem-based modes run at post-fs-data and pm mode runs at service.sh (or boot-completed.sh on KSU/APatch). The retry mechanism in service.sh already exists but currently only catches the *failures* after wasting the initial attempt.

---

## CRITICAL-02: scanner.sh Uses pm Commands During customize.sh -- May Fail on Some Devices

**File:** customize.sh:62-72, scanner.sh:102-107
**Category:** Boot Stage / Root Manager
**Documentation Reference:** android-shell-reference.md:790-797
**Issue:** `scanner_run()` calls `pm list packages -f -s` as its primary data source. This is called from `customize.sh` during module installation. During installation, PMS is usually available (the device is fully booted with the manager app running). However, there are edge cases:

1. On devices with aggressive memory management, PMS may be sluggish during module installation
2. The scanner has **no retry logic** -- if `pm list packages` returns empty, it aborts with `return 1`
3. The `default_debloat.sh` fallback path (lines 40-55) also calls `pm path` in a loop, which compounds the issue

This is not a guaranteed failure but a fragility concern for the "hundreds of millions of users" target.

**Evidence:**
```sh
# scanner.sh:102-107
pm_cache=$(pm list packages -f -s 2>/dev/null)
if [ -z "$pm_cache" ]; then
    log_e "$TAG" "pm list packages failed"
    return 1
fi
```

**Fix:** Add a brief retry loop (3 attempts with 2-second delay) before declaring failure. This is a standard defensive pattern for PMS interaction even when you expect it to be available.

---

## CRITICAL-03: setprop Used in Bootloop Recovery Reboot Chain

**File:** bootloop.sh:27
**Category:** Boot Stage
**Documentation Reference:** kernelsu-module-guide.md:332
**Issue:** The `_bl_reboot()` function has a 3-method reboot fallback chain: `reboot`, `/system/bin/reboot`, and `setprop sys.powerctl reboot`. The bootloop counter is incremented and checked in `bootloop_init()` and `bootloop_check()`, both called from `post-fs-data.sh`. The KernelSU documentation explicitly states: "Using setprop will deadlock the boot process! Please use resetprop -n instead." If the first two reboot methods fail and execution reaches `setprop sys.powerctl reboot`, the boot process will **deadlock** on KernelSU devices, turning a recoverable bootloop into an unrecoverable hang.

**Evidence:**
```sh
# bootloop.sh:25-28
_bl_reboot() {
    sync
    reboot 2>/dev/null
    /system/bin/reboot 2>/dev/null
    setprop sys.powerctl reboot 2>/dev/null
}
```

**Fix:** Replace `setprop sys.powerctl reboot` with `resetprop -n sys.powerctl reboot`. The `resetprop` command is available in BusyBox ash from all three root managers and does not deadlock the init property service.

---

## HIGH-01: post-fs-data.sh Blocked by nuke_run Without Timeout Awareness

**File:** post-fs-data.sh:21-22
**Category:** Boot Stage
**Documentation Reference:** kernelsu-module-guide.md:328-329
**Issue:** The KernelSU documentation states: "This stage is BLOCKING. The boot process is paused before execution is done **or after 10 seconds**." The Scalpel `post-fs-data.sh` runs the entire debloat engine (`nuke_run`) which iterates over every package in `nuke_list.json`, creates whiteout nodes, sets xattrs, and fixes vendor symlinks. For a large nuke list (50+ packages), this could exceed the 10-second timeout, causing KernelSU to **kill the script mid-execution**. This would leave the module in a partially-debloated state.

Magisk is more lenient with the timeout (some versions wait up to 40 seconds), but KernelSU is strict at 10 seconds per the documentation.

**Evidence:**
```sh
# post-fs-data.sh - entire script blocks boot
. "${MODDIR}/core/nuke.sh"
nuke_run || log_w "post-fs-data" "nuke completed with failures"
```

**Fix:** Two options: (1) Move the main debloat execution to `service.sh` or `boot-completed.sh`, using `post-fs-data.sh` only for the bootloop check and the minimal critical-path operations. (2) If post-fs-data is essential for whiteout modes (filesystem must be set up before module mounting), add internal time-budgeting to `nuke_run()` so it can bail out early after 8 seconds and defer remaining work to service.sh.

---

## HIGH-02: Missing boot-completed.sh -- Not Using KSU/APatch's Native Stage

**File:** (missing file)
**Category:** Missing Feature
**Documentation Reference:** kernelsu-module-guide.md:116, kernelsu-module-guide.md:353, kernelsu-additional-docs.md:941-942
**Issue:** KernelSU and APatch both provide `boot-completed.sh` that runs after `ACTION_BOOT_COMPLETED`. Scalpel's `service.sh` manually polls `sys.boot_completed` in a while loop with a 300-second timeout:

```sh
while [ "$(getprop sys.boot_completed)" != "1" ]; do
    sleep 1
```

This is the correct approach for Magisk (which lacks boot-completed.sh), but on KSU/APatch, the entire service.sh blocks for the full boot duration doing nothing but sleeping. A `boot-completed.sh` would execute at exactly the right time without polling overhead, and the module could have a slimmer `service.sh` that only does stage-appropriate work.

The cross-manager comparison table in the reference docs confirms: Magisk does NOT have boot-completed.sh, but KSU and APatch both do.

**Evidence:**
```sh
# service.sh:9-17
_boot_wait=0
while [ "$(getprop sys.boot_completed)" != "1" ]; do
    sleep 1
    _boot_wait=$((_boot_wait + 1))
    if [ "$_boot_wait" -ge 300 ]; then
        echo "scalpel: boot_completed timeout after 300s, proceeding anyway" > /dev/kmsg
        break
    fi
done
```

**Fix:** Create a `boot-completed.sh` that contains the post-boot logic (bootloop_reset, verify_run, _update_module_description, _retry_pm_debloat). Keep service.sh as a compatibility layer for Magisk only. The detect logic can determine at runtime whether to use boot-completed.sh or the polling approach. This is documented in the project's own DECISIONS as something to implement.

---

## HIGH-03: REMOVE Variable Not Used in customize.sh for Debloat

**File:** customize.sh (entire file)
**Category:** Missing Feature
**Documentation Reference:** kernelsu-module-guide.md:202-212, kernelsu-additional-docs.md:304-313
**Issue:** KernelSU and APatch support the `REMOVE` variable in `customize.sh` that automatically creates `mknod ... c 0 0` whiteouts during installation:

```sh
REMOVE="
/system/app/YouTube
/system/app/Bloatware
"
```

Scalpel manually creates whiteouts via `whiteout_helpers.sh` and `nuke_run()` at boot time. For the default debloat list that is known at install time (after volume key selection), the module could pre-populate the `REMOVE` variable, letting the root manager handle whiteout creation natively. This would:
1. Eliminate the need for mknod at post-fs-data (no 10-second timeout risk)
2. Use the officially documented and tested code path
3. Work identically on KSU and APatch without custom whiteout code

Note: This only applies to KSU and APatch. Magisk does NOT support the `REMOVE` variable.

**Evidence:** customize.sh does not use or set `REMOVE` anywhere.

**Fix:** After `apply_default_debloat` builds the nuke list, on KSU/APatch, populate the `REMOVE` variable with the app directory paths. This makes the initial debloat instant and native. Keep the whiteout engine for runtime WebUI-driven debloats.

---

## HIGH-04: Whiteout Method Differs from Official KSU Documentation

**File:** whiteout_helpers.sh:31-47
**Category:** Filesystem / Root Manager
**Documentation Reference:** kernelsu-module-guide.md:199-201
**Issue:** The official KernelSU documentation specifies that to delete a file/folder, you create a file with `mknod filename c 0 0`. The documentation does NOT mention setting `trusted.overlay.whiteout` xattr as a required step. However, Scalpel's `whiteout_create()` does THREE things:
1. `mknod "$wo_path" c 0 0` (matches docs)
2. `chcon --reference` (not mentioned in docs, but reasonable)
3. `setfattr -n trusted.overlay.whiteout -v y` (NOT in the docs)

The `setfattr` step sets the OverlayFS whiteout xattr directly. While this is technically correct for OverlayFS internals, the official method relies on `mknod c 0 0` alone -- the OverlayFS kernel driver recognizes character device 0:0 as a whiteout without the xattr on modern kernels (5.x+). The xattr approach is an older method.

This creates a problem: if the xattr-setting command fails (e.g., `setfattr` not available, filesystem doesn't support xattrs on that mount), the function returns failure and **removes the mknod node**, even though the mknod alone would have been sufficient.

On Magisk (which uses bind-mount/magic mount, not OverlayFS), the `setfattr` is meaningless and may fail outright. Magisk uses `.replace` files or its own internal whiteout mechanism, neither of which involves `setfattr`.

**Evidence:**
```sh
# whiteout_helpers.sh:43-47
if ! busybox setfattr -n trusted.overlay.whiteout -v y "$wo_path"; then
    log_e "$TAG" "setfattr failed: $wo_path"
    rm -f "$wo_path" 2>/dev/null
    return 1
fi
```

**Fix:** Make the `setfattr` step optional/best-effort rather than mandatory. If `mknod c 0 0` succeeds, the whiteout should be considered created. The `setfattr` can be attempted as a belt-and-suspenders addition but should not cause failure if it fails. Also, for Magisk mode, consider using `.replace` files instead of `mknod` (though the current whiteout_create is shared by both mode_whiteout and mode_magisk, which complicates this).

---

## MEDIUM-01: module.prop Missing updateJson Field

**File:** module.prop:1-6
**Category:** Format
**Documentation Reference:** kernelsu-module-guide.md:157
**Issue:** The module.prop does not include the `updateJson` field. While optional, this field enables in-app update checking across all three root managers. For a module targeting "hundreds of millions of users," automatic update notification is important for security patch distribution.

**Evidence:**
```
id=scalpel
name=Scalpel
version=v0.1.0
versionCode=1
author=Jeremy Wealth
description=Clinical debloater + systemizer with multi-mode auto-detection
```

**Fix:** Add `updateJson=<url>` pointing to a hosted JSON file following the update format. Also consider adding `webuiIcon=webroot/icon.png` for the KernelSU/APatch manager UI.

---

## MEDIUM-02: sed -i Used on module.prop at Boot Time

**File:** bootloop.sh:67-68, service.sh:74
**Category:** Shell Compat / Missing Feature
**Documentation Reference:** kernelsu-module-config.md:103-115, kernelsu-module-guide.md:170-173
**Issue:** Both `bootloop.sh` and `service.sh` modify the module description via `sed -i` on `module.prop`:

```sh
sed -i 's/^description=.*/description=...' "$MODDIR/module.prop"
```

The KernelSU documentation provides a better mechanism: `override.description` via the module configuration system:

```sh
ksud module config set override.description "Custom description"
```

This is cleaner because: (a) it does not modify `module.prop` on disk (which is supposed to be static metadata), (b) it avoids potential race conditions if two scripts try to sed the same file, (c) it survives module updates without the description being reset.

However, `ksud module config` is only available on KernelSU, not Magisk or APatch. The `sed` approach works universally but is less elegant.

Additionally, in `service.sh:73`, the sed separator is `|` but the description string is stripped of `|` on the previous line -- this is correctly handled but fragile.

**Evidence:**
```sh
# service.sh:73-74
desc="$(echo "$desc" | tr -d '|/&\\')"
sed -i "s|^description=.*|description=${desc}|" "${MODDIR}/module.prop" 2>/dev/null
```
```sh
# bootloop.sh:67-68
sed -i 's/^description=.*/description=Bootloop protection triggered. Module disabled. Re-enable manually./' \
    "$MODDIR/module.prop" 2>/dev/null
```

**Fix:** On KernelSU, use `ksud module config set override.description`. Fall back to `sed -i` on Magisk/APatch. This uses the officially recommended mechanism where available while maintaining universal compatibility.

---

## MEDIUM-03: detect.sh Root Manager Detection Could Mis-identify Magisk

**File:** detect.sh:11-22
**Category:** Root Manager
**Documentation Reference:** kernelsu-additional-docs.md:962-968, android-shell-reference.md:152-164
**Issue:** The `detect_root_manager()` function checks `$KSU` first, then `$APATCH`, then falls through to `"magisk"` as default. The reference documentation provides a more robust detection pattern that checks `$MAGISK_VER_CODE` and accounts for the fact that KSU sets it to `25200` and APatch sets it to `27000`:

```sh
# Reference pattern from docs:
if [ -n "$KSU" ] && [ "$KSU" = "true" ]; then
    echo "kernelsu"
elif [ -n "$APATCH" ] && [ "$APATCH" = "true" ]; then
    echo "apatch"
elif [ -n "$MAGISK_VER_CODE" ]; then
    echo "magisk"
else
    echo "unknown"
fi
```

Scalpel's version checks `[ -n "$KSU" ]` without verifying `= "true"`. If some other tool happens to set `KSU` to a non-true value (or empty string but exported), the `-n` check would pass. More importantly, the fallthrough to "magisk" means if NO root manager environment variables are set (e.g., running from a shell outside the module script context), the function returns "magisk" when it should return "unknown."

In boot scripts (post-fs-data.sh, service.sh), environment variables ARE set by the root manager. But in `customize.sh`, the KSU variable might not be set if the installer runs differently. The docs say `$KSU` is available in customize.sh, post-fs-data.sh, and service.sh.

**Evidence:**
```sh
# detect.sh:13-18
if [ -n "$KSU" ]; then
    _DETECT_ROOT_MGR="ksu"
elif [ -n "$APATCH" ]; then
    _DETECT_ROOT_MGR="apatch"
else
    _DETECT_ROOT_MGR="magisk"
fi
```

**Fix:** Check `[ "$KSU" = "true" ]` and `[ "$APATCH" = "true" ]` per the documentation pattern. Add a final else that checks for Magisk presence via `[ -d "/data/adb/magisk" ]` before defaulting to "unknown". The `mode_magisk.sh:24-31` probe already does this correctly -- `detect.sh` should match.

---

## MEDIUM-04: uninstall.sh Uses MODPATH Instead of MODDIR for Boot-Time Context

**File:** uninstall.sh:7
**Category:** Boot Stage / Root Manager
**Documentation Reference:** kernelsu-module-guide.md:117, 181-182
**Issue:** The documentation states: "In all scripts of your module, please use `MODDIR=${0%/*}` to get your module's base directory path; do NOT hardcode your module path in scripts." The `uninstall.sh` uses:

```sh
MODPATH="${MODPATH:-${0%/*}}"
```

The variable is named `MODPATH` (the installation-time variable), not `MODDIR` (the boot-time variable). While `${0%/*}` will resolve correctly regardless of the variable name, the naming is semantically wrong and could cause confusion. `MODPATH` is defined by the root manager only during `customize.sh` execution. `uninstall.sh` is called at module removal time, not installation time.

KernelSU's `uninstall.sh` documentation says it "will be executed when KernelSU removes your module" -- this is at a different lifecycle point than customize.sh. The correct pattern is `MODDIR="${0%/*}"`.

The jq reference on line 12 also uses `MODPATH`:
```sh
_jq="${MODPATH}/bin/jq"
```

Since `bin/` was deleted in customize.sh line 107 (`rm -rf "$MODPATH/bin"`), the jq binary will NOT exist in the module directory at uninstall time. This means `$_jq` will always fall back to bare `jq`, which is only available if BusyBox provides it (Scalpel bundles its own jq; it does not rely on system jq).

**Evidence:**
```sh
# uninstall.sh:7
MODPATH="${MODPATH:-${0%/*}}"
# uninstall.sh:12-13
_jq="${MODPATH}/bin/jq"
[ ! -x "$_jq" ] && _jq="jq"
```
```sh
# customize.sh:107
rm -rf "$MODPATH/bin" 2>/dev/null
```

**Fix:** Rename `MODPATH` to `MODDIR` in uninstall.sh per documentation convention. Additionally, since `bin/jq` is deleted at install time, either: (a) keep the jq binary in a different path that is not deleted (e.g., `$MODDIR/common/jq`), or (b) accept that uninstall.sh always uses BusyBox's jq from PATH (which is the current effective behavior and works because BusyBox ash standalone mode provides jq if present, but jq is NOT a BusyBox applet). This means if jq is not separately installed, the nuke_list/systemize_list parsing in uninstall.sh will silently fail and apps will not be restored.

---

## MEDIUM-05: customize.sh Uses `local` Keyword in Non-Function Context

**File:** customize.sh:66
**Category:** Shell Compat
**Documentation Reference:** android-shell-reference.md:44
**Issue:** Line 66 of customize.sh uses:

```sh
local_count=$(jq 'length' "$SCALPEL_DATA/app_list.json" 2>/dev/null)
```

This is NOT actually using the `local` keyword (the variable is named `local_count`), so it is not a bug. However, this is worth flagging as a readability concern -- it could be mistaken for an attempt to use `local` outside a function.

The actual shell compatibility concern: `customize.sh` is sourced (not executed) by the root manager's install script. All variables it defines become global. The `_chooseport` and `_setup_aapt` functions correctly use `local` inside their function bodies, which is fine.

**Evidence:**
```sh
# customize.sh:66 - not a bug, just confusing naming
local_count=$(jq 'length' "$SCALPEL_DATA/app_list.json" 2>/dev/null)
```

**Fix:** Rename to `app_count` or `scan_count` to avoid confusion.

---

## LOW-01: No Magisk-Specific .replace File Support in mode_magisk.sh

**File:** mode_magisk.sh (entire file)
**Category:** Root Manager
**Documentation Reference:** kernelsu-additional-docs.md:954-958
**Issue:** On Magisk, the documented method for hiding files/directories is the `.replace` file mechanism. Scalpel's `mode_magisk.sh` uses `mknod c 0 0` + `setfattr` (via whiteout_helpers.sh), which is the KernelSU/OverlayFS method.

On Magisk, this CAN work because Magisk's magic mount does recognize character device nodes in the module overlay. However, it is not the officially documented method. The `.replace` file approach is simpler on Magisk:

```sh
mkdir -p "$MODDIR/system/app/Bloatware"
touch "$MODDIR/system/app/Bloatware/.replace"
```

This replaces the directory with an empty one (effectively removing the app).

The current approach works on Magisk because magic mount processes the overlay directory structure, and a directory containing a character device node effectively hides the original. But it depends on implementation details rather than the documented API.

**Evidence:** `mode_magisk.sh` delegates entirely to `whiteout_helpers.sh` which uses `mknod c 0 0` + `setfattr`.

**Fix:** For Magisk-detected environments, use the `.replace` file method instead of `mknod`. Keep `mknod` for KSU/APatch where it is the documented approach.

---

## LOW-02: Bootloop Counter File Uses Shell Source Format

**File:** bootloop.sh:18-19, 35-36
**Category:** Filesystem
**Documentation Reference:** (general best practice)
**Issue:** The bootloop counter is stored as `BOOTCOUNT=N` in a shell-sourceable format but is read via `grep -oE` rather than sourcing. This is actually GOOD (avoids code injection via the counter file). However, the write function creates a file that looks source-able:

```sh
_bl_write_count() {
    echo "BOOTCOUNT=$1" > "$BOOTLOOP_COUNT_FILE" 2>/dev/null
}
```

The read function correctly uses safe parsing:
```sh
BOOTCOUNT="$(grep -oE '^BOOTCOUNT=[0-9]+$' "$BOOTLOOP_COUNT_FILE" 2>/dev/null | head -1 | cut -d= -f2)"
```

But there is a subtle issue: the recovery marker writes `BOOTCOUNT=-1` (line 72), and the grep pattern `[0-9]+` will NOT match `-1`. This means after a bootloop recovery, on the next boot, `BOOTCOUNT` will be empty, hit the sanitization case, and reset to 0, then increment to 1. This is actually the INTENDED behavior (the comment says "Recovery marker: -1 increments to 0 on next boot"), but the mechanism is fragile and depends on the grep NOT matching `-1`.

**Evidence:**
```sh
# bootloop.sh:72
_bl_write_count -1
# bootloop.sh:36
BOOTCOUNT="$(grep -oE '^BOOTCOUNT=[0-9]+$' ...)"
# After -1 write, grep fails, sanitization resets to 0, increment to 1
```

**Fix:** This works correctly but is unnecessarily clever. Write `BOOTCOUNT=0` directly instead of `-1` and remove the dependency on grep failure behavior. Alternatively, add a comment explaining the -1 recovery mechanism explicitly.

---

## LOW-03: Temporary Files in /data/local/tmp May Leak

**File:** mode_pm.sh:64, mode_whiteout.sh:92, mode_zeromount.sh:91, mode_magisk.sh:112
**Category:** Filesystem
**Documentation Reference:** (general best practice)
**Issue:** Several mode scripts write temporary files to `/data/local/tmp/`:
```sh
local tmp="/data/local/tmp/.scalpel_cleanup_$$"
```

If the script is interrupted (e.g., by KernelSU's 10-second timeout at post-fs-data, or by a crash), the temp file is never cleaned up. Over many boots, these files accumulate. The nuke.sh and verify.sh scripts correctly write temp files to `$SCALPEL_DATA/` (the module's own data directory), which is cleaned up on uninstall.

**Evidence:**
```sh
# mode_pm.sh:64
local tmp="/data/local/tmp/.scalpel_cleanup_$$"
# mode_whiteout.sh:92
local tmp="/data/local/tmp/.scalpel_wo_cleanup_$$"
```

**Fix:** Use `${SCALPEL_DATA:-/data/adb/scalpel}/.mode_tmp.$$` instead of `/data/local/tmp/`. This keeps temp files in the module's data directory and ensures they are cleaned up on module removal.

---

## INFO-01: KSU Module Configuration System Not Leveraged

**File:** (all config-related files)
**Category:** Missing Feature
**Documentation Reference:** kernelsu-module-config.md (entire document)
**Issue:** KernelSU provides a built-in key-value configuration system via `ksud module config` that stores data in `/data/adb/ksu/module_configs/<module_id>/`. This system provides:
- Persistent and temporary configs
- Automatic cleanup on module uninstall
- Binary-safe value storage up to 1MB
- `override.description` for dynamic module descriptions
- `manage.kernel_umount` for controlling mount visibility

Scalpel implements its own config system (`config.sh`) using shell variable files with `source`-based reading. This works but is redundant on KernelSU. On the other hand, Scalpel's config system works across ALL three root managers, which `ksud module config` does not.

Specific missed opportunity: `manage.kernel_umount` could control whether debloated apps remain hidden from detection tools -- directly relevant to Scalpel's mission.

**Evidence:** config.sh implements its own key-value store; no ksud calls anywhere.

**Fix:** No immediate action needed -- the current approach is cross-platform correct. Future enhancement: on KSU, use `ksud module config` for the `override.description` feature and `manage.kernel_umount` feature. Keep the shell-based config as the cross-platform store.

---

## INFO-02: Architecture Correctly Uses MODDIR=${0%/*} Pattern

**File:** post-fs-data.sh:3, service.sh:3
**Category:** Format (positive finding)
**Documentation Reference:** kernelsu-module-guide.md:181
**Issue:** This is a **positive finding**. Both boot scripts correctly use the KernelSU-recommended pattern:

```sh
MODDIR="${0%/*}"
```

The documentation explicitly states: "In all scripts of your module, please use `MODDIR=${0%/*}` to get your module's base directory path; do NOT hardcode your module path in scripts."

The `customize.sh` correctly uses `$MODPATH` (the installation-time variable) and sets `MODDIR="$MODPATH"` when it needs to call scripts that expect `MODDIR`.

**Evidence:**
```sh
# post-fs-data.sh:3
MODDIR="${0%/*}"
# service.sh:3
MODDIR="${0%/*}"
# customize.sh:61
MODDIR="$MODPATH"
```

**Fix:** None needed -- this is correct.

---

## Summary Table

| # | Severity | Title | File | Category |
|---|----------|-------|------|----------|
| C-01 | CRITICAL | PM mode debloat at post-fs-data (PMS unavailable) | post-fs-data.sh:21 | Boot Stage |
| C-02 | CRITICAL | Scanner pm commands may fail during install | customize.sh:62 | Boot Stage |
| C-03 | CRITICAL | setprop deadlocks KSU at post-fs-data | bootloop.sh:27 | Boot Stage |
| H-01 | HIGH | nuke_run may exceed 10s post-fs-data timeout | post-fs-data.sh:21 | Boot Stage |
| H-02 | HIGH | No boot-completed.sh for KSU/APatch | (missing) | Missing Feature |
| H-03 | HIGH | REMOVE variable not used in customize.sh | customize.sh | Missing Feature |
| H-04 | HIGH | Whiteout xattr step blocks success of working mknod | whiteout_helpers.sh:43 | Filesystem |
| M-01 | MEDIUM | module.prop missing updateJson | module.prop | Format |
| M-02 | MEDIUM | sed on module.prop instead of ksud override.description | service.sh:74 | Missing Feature |
| M-03 | MEDIUM | Root manager detection defaults to magisk unsafely | detect.sh:18 | Root Manager |
| M-04 | MEDIUM | uninstall.sh uses MODPATH name + jq binary deleted | uninstall.sh:7 | Boot Stage |
| M-05 | MEDIUM | Confusing variable name local_count | customize.sh:66 | Shell Compat |
| L-01 | LOW | No .replace support for Magisk mode | mode_magisk.sh | Root Manager |
| L-02 | LOW | Bootloop -1 recovery depends on grep failure | bootloop.sh:72 | Filesystem |
| L-03 | LOW | Temp files in /data/local/tmp may leak | mode_pm.sh:64 | Filesystem |
| I-01 | INFO | KSU module config system not leveraged | config.sh | Missing Feature |
| I-02 | INFO | MODDIR pattern correctly implemented (positive) | post-fs-data.sh:3 | Format |

---

## Risk Assessment

**Highest Risk Paths:**

1. **KernelSU + PM mode + large nuke list**: CRITICAL-01 + CRITICAL-03 + HIGH-01 combine into a scenario where post-fs-data runs nuke_run, detects pm mode (because no overlayfs/zeromount available), pm commands all fail (PMS not running), then if something goes wrong with reboots, setprop deadlocks. The retry in service.sh saves it eventually, but the boot is delayed and error-logged.

2. **KernelSU + whiteout mode + 50+ apps**: HIGH-01 alone -- if the 10-second timeout kills the script mid-whiteout-creation, some apps are debloated and some are not, with no record of which ones completed.

3. **Uninstall with deleted jq binary**: MEDIUM-04 -- if jq is not available via PATH, uninstall.sh silently fails to restore any debloated or systemized apps.

**What's Working Well:**

- Boot script `MODDIR=${0%/*}` pattern (correct per docs)
- Atomic file write patterns throughout (tmp+mv)
- Config validation prevents code injection
- Shell compatibility is good (no bashisms, BusyBox ash compatible)
- SELinux context handling in whiteout_helpers.sh (chcon --reference)
- Vendor symlink dedup logic
- 3-strike bootloop protection concept is sound

---

## Priority Fix Order

1. **CRITICAL-03**: Replace `setprop` with `resetprop -n` in bootloop.sh (1-line fix, prevents deadlock)
2. **CRITICAL-01**: Defer pm-mode to service.sh (architectural, prevents wasted boot time)
3. **HIGH-04**: Make setfattr optional in whiteout_helpers.sh (prevents false failures)
4. **HIGH-01**: Add time budget to nuke_run or move to service.sh (prevents timeout kill)
5. **MEDIUM-04**: Fix uninstall.sh variable naming and jq availability (prevents restore failure)
6. **CRITICAL-02**: Add retry loop to scanner pm calls (prevents fragile install)
7. **HIGH-02**: Create boot-completed.sh for KSU/APatch (eliminates polling waste)
8. **HIGH-03**: Use REMOVE variable in customize.sh for KSU/APatch (native debloat)

---

*Report generated by Red Team Rex -- "Assume all code is broken until proven otherwise."*
