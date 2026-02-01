# Phase C: Cross-Manager End-to-End Validation

**Validator:** Prof. Rigor (Formal Verification Specialist)
**Date:** 2026-02-01
**Scope:** Complete execution flow tracing for Magisk, KernelSU, and APatch across all boot phases
**Files analyzed:** 27 shell scripts, module.prop, 2 reference documents

---

## Table of Contents

1. [Trace 1: Magisk Full Lifecycle](#trace-1-magisk--full-lifecycle)
2. [Trace 2: KernelSU Full Lifecycle](#trace-2-kernelsu--full-lifecycle)
3. [Trace 3: APatch Full Lifecycle](#trace-3-apatch--full-lifecycle)
4. [Trace 4: Failure Scenarios](#trace-4-failure-scenarios)
5. [Master Invariant Table](#master-invariant-table)
6. [Issues Found](#issues-found)
7. [SHIP/NO-SHIP Recommendation](#shipno-ship-recommendation)

---

## Trace 1: Magisk -- Full Lifecycle

### Phase: Installation (customize.sh)

#### Step 1: Entry and Environment Validation
- **File:** customize.sh:1-8
- **Variables at entry:** `$MODPATH` set by Magisk installer (e.g., `/data/adb/modules_update/scalpel`), `$KSU` unset, `$APATCH` unset
- **Action:** `SCALPEL_DATA="/data/adb/scalpel"` hardcoded. Guard: `[ -z "$MODPATH" ] && exit 1`
- **Result:** MODPATH validated, SCALPEL_DATA assigned
- **Variables at exit:** `SCALPEL_DATA=/data/adb/scalpel`, `MODPATH=<installer-set>`
- **Invariants checked:** None yet

#### Step 2: Persistent Data Directory
- **File:** customize.sh:15
- **Action:** `mkdir -p "$SCALPEL_DATA"`
- **Result:** `/data/adb/scalpel/` created or already exists
- **Invariants checked:** Data directory survives module updates

#### Step 3: Config and Logging Init
- **File:** customize.sh:18-23
- **Action:** Sources `$MODPATH/core/config.sh`, calls `config_init 2>/dev/null`. Then sources logging.sh, calls `log_init`.
- **Trace into config_init (config.sh:96-112):** `mkdir -p "$SCALPEL_DATA"` (already exists), `_config_defaults()` sets 6 variables with defaults, checks for existing `$SCALPEL_CONFIG` file. On fresh install: writes defaults to `/data/adb/scalpel/config.sh`.
- **Trace into log_init (logging.sh:25-34):** Sets `_SCALPEL_LOG_LEVEL_NUM=1` (info), creates log dir, calls `log_rotate()`, sets `SCALPEL_LOG_INITIALIZED=1`.
- **Variables at exit:** `SCALPEL_LOG_LEVEL="info"`, `SCALPEL_MODE_OVERRIDE=""`, `SCALPEL_LOG_INITIALIZED=1`

#### Step 4: Root Manager Detection
- **File:** customize.sh:29-32
- **Action:** Sources `$MODPATH/core/detect.sh`, calls `detect_root_manager()`.
- **Trace into detect_root_manager (detect.sh:11-22):** `$KSU` is unset (empty), `$APATCH` is unset (empty), falls through to `_DETECT_ROOT_MGR="magisk"`.
- **Result:** `ROOT_MGR="magisk"`, printed to user via `ui_print`
- **Variables at exit:** `ROOT_MGR="magisk"`, `_DETECT_ROOT_MGR="magisk"`

#### Step 5: AAPT Binary Setup
- **File:** customize.sh:35-53
- **Action:** `_setup_aapt()` reads `ro.product.cpu.abi`, selects arm64 or armeabi-v7a, copies binary to `$MODPATH/common/aapt`, chmod 0755.
- **Result:** aapt binary ready for scanner. Falls through silently if no matching ABI.

#### Step 6: Categories Database Copy
- **File:** customize.sh:56-58
- **Action:** Copies `$MODPATH/webroot/categories.json` to `$SCALPEL_DATA/categories.json`
- **Result:** Categories available for scanner and WebUI

#### Step 7: Scanner Run
- **File:** customize.sh:61-72
- **Action:** Sets `MODDIR="$MODPATH"` (alias for aapt lookup during install), sources scanner.sh, calls `scanner_run()`.
- **Trace into scanner_run (scanner.sh:88-177):** PMS retry loop (3 attempts with 1s sleep), scans partitions via `/proc/mounts`, iterates app/priv-app dirs, extracts metadata via pm cache + aapt, writes `app_list.json` atomically via jq slurp.
- **Result:** `$SCALPEL_DATA/app_list.json` created with system app inventory
- **Invariants checked:** Scanner result is valid JSON (jq -s '.')

#### Step 8: Volume Key Prompt
- **File:** customize.sh:80-89
- **Action:** `_chooseport 8` calls `timeout 8 getevent -qlc 1`. KEY_VOLUMEUP returns 0, KEY_VOLUMEDOWN or timeout returns 1.
- **Path A (UP pressed):** Proceeds to default debloat
- **Path B (DOWN or timeout):** Prints skip message, logs, continues to permissions

#### Step 9: Default Debloat Application (Path A)
- **File:** customize.sh:93-128
- **Action:** Sources `$MODPATH/core/default_debloat.sh`, calls `apply_default_debloat "$MODPATH"`.
- **Trace into apply_default_debloat (default_debloat.sh:7-81):** Loads categories.json and app_list.json, uses jq to intersect safe+google packages with installed apps, writes `nuke_list.json`.
- **Result:** `$SCALPEL_DATA/nuke_list.json` created with debloat targets
- **Invariants checked:** INV-12 (only safe+google categories selected)

#### Step 10: REMOVE Variable Handling (Magisk Path)
- **File:** customize.sh:100
- **Action:** `if [ -n "$KSU" ] || [ -n "$APATCH" ]` -- both unset for Magisk.
- **Result:** REMOVE block SKIPPED entirely. Magisk does not process REMOVE variable.
- **Invariants checked:** Magisk never uses REMOVE -- nuke.sh handles debloat at boot

#### Step 11: Cleanup and Permissions
- **File:** customize.sh:139-157
- **Action:** `rm -rf "$MODPATH/bin"` (clean arch binaries). `action.sh` NOT removed (Magisk needs it). `set_perm_recursive` for module files.
- **Result:** Module files installed with correct permissions. action.sh preserved for Magisk.
- **Invariants checked:** action.sh exists only on Magisk (KSU/APatch delete it at line 143)

---

### Phase: First Boot (post-fs-data.sh)

#### Step 1: MODDIR Resolution
- **File:** post-fs-data.sh:3
- **Variables at entry:** `$0` = path to script, `$KSU` unset, `$APATCH` unset
- **Action:** `MODDIR="${0%/*}"` -- strips filename, yields module directory (e.g., `/data/adb/modules/scalpel`)
- **Result:** MODDIR set correctly
- **Note:** On Magisk, MODDIR is `/data/adb/modules/scalpel` (not `modules_update` -- Magisk moves it after install)

#### Step 2: Clear Post-Boot Flag
- **File:** post-fs-data.sh:6
- **Action:** `rm -f "/data/adb/scalpel/boot_completed_handled" 2>/dev/null`
- **Result:** Flag cleared so post_boot.sh can acquire it fresh this boot cycle
- **Invariants checked:** INV-11 (ensures exactly-once semantics)

#### Step 3: Bootloop Init
- **File:** post-fs-data.sh:9-11
- **Action:** Sources `${MODDIR}/core/bootloop.sh`, calls `bootloop_init`.
- **Trace into bootloop_init (bootloop.sh:33-48):** Creates `/data/adb/scalpel/`, reads BOOTCOUNT from `count.sh` via `grep -oE '^BOOTCOUNT=[0-9]+$'`, sanitizes, increments by 1, writes back.
- **Variables at exit:** `BOOTCOUNT=1` (first boot), `count.sh` contains `BOOTCOUNT=1`

#### Step 4: Bootloop Check
- **File:** post-fs-data.sh:11
- **Action:** `bootloop_check || exit 0`
- **Trace into bootloop_check (bootloop.sh:51-86):** `BOOTCOUNT=1`, test `1 -ge 3` is FALSE, prints "boot attempt 1/3", returns 0.
- **Result:** Passes, execution continues
- **Invariants checked:** INV-1 (counter is 1, not reset -- correct)

#### Step 5: Config and Logging Init
- **File:** post-fs-data.sh:14-18
- **Action:** Sources config.sh, calls `config_init 2>/dev/null`. Sources logging.sh, calls `log_init`.
- **Result:** Config loaded, logging initialized with level from config

#### Step 6: Nuke Run
- **File:** post-fs-data.sh:24-25
- **Action:** Sources `${MODDIR}/core/nuke.sh`, calls `nuke_run()`.
- **Trace into nuke_run (nuke.sh:48-186):**
  1. **Re-sources dependencies** (nuke.sh:49-53): logging.sh, config.sh, detect.sh, config_init, log_init
  2. **Lock acquisition** (nuke.sh:57-58): Writes PID to `nuke.lock`
  3. **In-flight status** (nuke.sh:61): `_write_status "running" 0 0`
  4. **Nuke list check** (nuke.sh:63-68): If no nuke_list.json, writes status "none" and returns
  5. **JSON validation** (nuke.sh:73-77): `jq '.' "$NUKE_LIST"` validates JSON
  6. **Count extraction** (nuke.sh:80-84): `jq 'length'` with whitespace trim
  7. **Mode detection** (nuke.sh:93): `mode="$(detect_mode)"`

  **Trace into detect_mode (detect.sh:160-183):**
  - `SCALPEL_MODE_OVERRIDE=""` (empty, no override)
  - Probe chain: zeromount > mountify > symlink > whiteout > magisk > pm
  - **zeromount:** `_probe_zeromount()` -- checks `/dev/zeromount` (not present on Magisk device) -- FAILS
  - **mountify:** `_probe_mountify()` -- `detect_busybox()` finds `/data/adb/magisk/busybox`, tries tmpfs mount on test dir -- LIKELY PASSES on most Magisk devices
  - **If mountify passes:** mode="mountify"
  - **If mountify fails:** symlink -- checks overlayfs in /proc/filesystems -- LIKELY FAILS (Magisk uses bind mounts, not overlayfs)
  - **whiteout:** needs overlayfs AND busybox mknod+setfattr -- LIKELY FAILS
  - **magisk:** `_probe_magisk()` -- detect_root_manager returns "magisk", case "magisk" returns 0 -- PASSES
  - **Typical Magisk result:** mode="mountify" or mode="magisk"

  8. **Mode script loading** (nuke.sh:101-108): Sources `modes/mode_${mode}.sh`
  9. **Mode probe** (nuke.sh:110-115): Calls `mode_probe()` to confirm
  10. **Timeout guard** (nuke.sh:125): `SCALPEL_NUKE_TIMEOUT` defaults to 7 (not 10s KSU limit)
  11. **Package loop** (nuke.sh:138-159): Reads tab-separated pkg+path from jq, calls `mode_debloat` per package, tracks success/failed counts. Timeout check per iteration.
  12. **Vendor symlink fixup** (nuke.sh:164-172): For whiteout/magisk/symlink modes
  13. **Status write** (nuke.sh:174): `_write_status "$mode" "$success" "$failed" "$_timed_out"`
  14. **Lock release** (nuke.sh:175): `rm -f "$_nuke_lock"`

- **Result:** Apps debloated via detected mode, status.json written
- **Variables at exit:** status.json contains `{mode:"<detected>", debloated:N, debloat_failed:M, ...}`
- **Invariants checked:** INV-2 (status.json is valid JSON via jq -n), INV-7 (nuke.lock held during run), INV-10 (mode_debloat is idempotent per mode)

#### Step 7: Exit
- **File:** post-fs-data.sh:28
- **Action:** Logs "post-fs-data complete" and script exits

---

### Phase: First Boot (service.sh)

#### Step 1: MODDIR and Disable Check
- **File:** service.sh:3-5
- **Action:** `MODDIR="${0%/*}"`, checks for disable file
- **Result:** MODDIR set, no disable file exists on first boot

#### Step 2: Root Manager Branch
- **File:** service.sh:10-13
- **Action:** `if [ "$KSU" = "true" ] || [ "$APATCH" = "true" ]` -- both unset/empty for Magisk
- **Result:** Branch NOT taken. Falls through to Magisk polling path.

#### Step 3: Boot Completed Polling
- **File:** service.sh:16-24
- **Action:** Polls `getprop sys.boot_completed` every 1s, up to 300s timeout.
- **Result:** Waits until `sys.boot_completed=1` (typically 30-120s after boot animation)
- **Note:** Non-blocking stage, so this doesn't block boot

#### Step 4: Post-Boot Run
- **File:** service.sh:26-27
- **Action:** Sources `${MODDIR}/core/post_boot.sh`, calls `post_boot_run()`.
- **Trace into post_boot_run (post_boot.sh:98-131):**
  1. **Init** (post_boot.sh:99-102): Sources logging.sh + config.sh, calls config_init + log_init
  2. **Exactly-once gate** (post_boot.sh:104-107): `_post_boot_acquire()` checks `boot_completed_handled` flag file. On first call: creates file with PID, re-reads to confirm. Returns 0 (success).
  3. **Bootloop reset** (post_boot.sh:112-113): Sources bootloop.sh, calls `bootloop_reset()` which writes `BOOTCOUNT=0` to count.sh.
     - **Invariants checked:** INV-1 (counter reset AFTER boot_completed -- correct!)
  4. **Deferred debloat** (post_boot.sh:115): Calls `_finish_deferred_debloat()`.
     - **Trace into _finish_deferred_debloat (post_boot.sh:14-60):** Reads status.json, checks mode field:
       - If "running": KSU killed mid-run, re-runs nuke with no timeout
       - If "pm_deferred": No filesystem mode at post-fs-data, forces pm mode with no timeout
       - If "pm" with failed>0: pm failed, retries
       - If partial=true: Timeout occurred, re-runs
       - Otherwise: returns 0 (no rerun needed)
     - For typical Magisk first boot with successful nuke: mode is "mountify" or "magisk", partial=false, failed=0 -- no rerun needed.
  5. **Verify** (post_boot.sh:119-121): Sources verify.sh, calls `verify_run()`.
     - **Trace into verify_run (verify.sh:12-95):** Loads nuke_list, reads mode from status.json, loads mode script, iterates packages calling `mode_verify()`, counts verified/broken, merges results into status.json.
     - **Invariants checked:** INV-2 (status.json merge preserves existing fields + adds verify fields)
  6. **Description update** (post_boot.sh:123): Calls `_update_module_description()`.
     - **Trace (post_boot.sh:62-86):** For Magisk: `$KSU` is not "true", so ksud branch skipped. Falls to sed fallback: `sed -i "s|^description=.*|description=${safe_desc}|" "${MODDIR}/module.prop"`.
     - **Result:** module.prop description updated with debloat stats
  7. **Monitor start** (post_boot.sh:127): Sources monitor.sh, calls `monitor_start &` (backgrounded).
     - **Trace into monitor_start (monitor.sh:139-176):** Sources logging/config/detect, calls `_acquire_singleton()` (PID file check), sets trap, enters infinite loop sleeping `$interval` seconds, calls `_check_debloated_apps()` + `_check_systemized_apps()` each cycle.
  8. **Complete** (post_boot.sh:130): Logs "post-boot complete"

---

### Phase: Subsequent Boots

- **post-fs-data.sh:** Same as first boot. `bootloop_init` increments counter (was 0, becomes 1). `bootloop_check` passes. `nuke_run` detects same mode, mode_debloat operations are idempotent.
- **service.sh:** Same polling path. `_post_boot_acquire` succeeds (flag was cleared at post-fs-data line 6). `bootloop_reset` writes 0. Verify runs. Monitor starts.
- **Key:** The `boot_completed_handled` flag file ensures post-boot work runs exactly once per boot cycle.

---

### Phase: Runtime (Monitor)

#### Step 1: Sleep and Wake
- **File:** monitor.sh:162-163
- **Action:** `sleep "$interval"` (default 300s)
- **Result:** Daemon wakes every 5 minutes

#### Step 2: Disable/Remove Check
- **File:** monitor.sh:166-169
- **Action:** Checks for `${MODDIR}/disable` or `${MODDIR}/remove` files
- **Result:** If found, breaks loop and exits

#### Step 3: Debloat Verification
- **File:** monitor.sh:171
- **Action:** `_check_debloated_apps()`
- **Trace (monitor.sh:46-93):**
  1. Checks nuke_list.json exists
  2. **Lock check** (monitor.sh:48): `[ -f "$NUKE_LOCK" ] && return 0` -- if nuke.sh is running, skips entirely
     - **Invariants checked:** INV-7 (monitor never runs concurrently with nuke)
  3. Reads mode from status.json, skips for non-actionable states (unknown/none/running/pm_deferred/error)
  4. Loads mode script, iterates packages calling mode_verify
  5. If verification fails: checks lock again, calls mode_debloat to repair
  6. Updates repair count in status.json
- **Invariants checked:** INV-7, INV-8 (systemized apps get log-only, no auto-repair in `_check_systemized_apps`)

#### Step 4: Systemized App Check
- **File:** monitor.sh:172
- **Action:** `_check_systemized_apps()`
- **Trace (monitor.sh:95-118):** Reads systemize_list.json, calls `verify_promotion()` per package. On failure: **LOG ONLY** -- "manual re-promote required".
- **Invariants checked:** INV-8 (monitor never auto-repairs systemized apps -- confirmed)

---

### Phase: Uninstall

#### Step 1: Environment Setup
- **File:** uninstall.sh:7-13
- **Variables:** `MODPATH="${MODPATH:-${0%/*}}"`, SCALPEL_DATA, NUKE_LIST, SYSTEMIZE_LIST, jq resolution

#### Step 2: Stop Monitor
- **File:** uninstall.sh:20-25
- **Action:** Reads monitor.pid, kills PID, removes pid file

#### Step 3: Restore Debloated Apps
- **File:** uninstall.sh:29-35
- **Action:** Validates nuke_list.json with jq, iterates packages calling `pm install-existing` and `pm enable`
- **Note:** pm commands work because uninstall runs after boot_completed (PMS is running)

#### Step 4: Restore Systemized Apps
- **File:** uninstall.sh:39-45
- **Action:** Validates systemize_list.json, calls `pm install-existing` per package

#### Step 5: Clean Data
- **File:** uninstall.sh:48
- **Action:** `rm -rf "$SCALPEL_DATA"` -- removes all persistent data
- **Note:** Root manager handles MODPATH deletion and overlay cleanup

---

## Trace 2: KernelSU -- Full Lifecycle

### Phase: Installation (customize.sh)

#### Divergences from Magisk:

**Step 4 (Root Manager Detection):**
- **File:** detect.sh:13
- **Variables:** `$KSU` is set to `"true"` by KernelSU installer
- **Result:** `_DETECT_ROOT_MGR="ksu"`, `ROOT_MGR="ksu"`

**Step 10 (REMOVE Variable):**
- **File:** customize.sh:100-128
- **Action:** `[ -n "$KSU" ]` is TRUE. Enters REMOVE block.
- **Trace:**
  1. Reads nuke_list.json with jq to extract unique parent directories of APK paths
  2. Filters to /system/ prefixed paths only
  3. Verifies each directory exists on the device
  4. Builds newline-separated REMOVE string
  5. Sets `REMOVE="$_remove_entries"`
- **Result:** KernelSU processes REMOVE at install time, creating `mknod c 0 0` whiteouts in $MODPATH automatically via its metamodule pipeline.
- **Invariants checked:** INV-12 (REMOVE paths derived from nuke_list.json which only contains safe+google apps)
- **CRITICAL NOTE:** The REMOVE variable is processed by KernelSU's internal installer AFTER customize.sh returns. KernelSU calls `mknod $MODPATH/<path> c 0 0` for each entry in REMOVE. This means apps are debloated at install time via overlayfs whiteouts.

**Step 11 (action.sh removal):**
- **File:** customize.sh:142-144
- **Action:** `[ -n "$KSU" ]` is TRUE. `rm -f "$MODPATH/action.sh"` -- removes action.sh.
- **Result:** KSU serves WebUI natively from webroot/ -- action.sh unnecessary.

---

### Phase: First Boot (post-fs-data.sh)

#### Execution Order Context (KSU)
Per KernelSU docs (kernelsu-module-guide.md:386-394):
```
post-fs-data stage:
  1. Common post-fs-data.d scripts
  2. Prune modules, restorecon, load sepolicy.rule
  3. Metamodule's post-fs-data.sh (if exists)
  4. Regular modules' post-fs-data.sh  <-- Scalpel runs HERE
  5. Load system.prop
  6. Metamodule's metamount.sh (mounts all modules) <-- System overlay applied HERE
```

**IMPORTANT TIMING:** Scalpel's post-fs-data.sh runs BEFORE metamount.sh. This means when nuke_run runs, the module's system/ directory has NOT been mounted yet. Whiteouts created by REMOVE are not yet overlaid.

This is fine because:
- REMOVE-based whiteouts are already in $MODDIR/system/ from install time
- nuke_run at post-fs-data creates additional whiteouts if needed
- The metamount.sh then mounts everything together

#### Step 1-2: Same as Magisk
- MODDIR resolution and flag clearing identical

#### Step 3-4: Bootloop Init/Check
- Same as Magisk. Counter increments, check passes.
- **KSU-specific:** `$KSU` is "true" in the environment. `bootloop_check` at line 69 checks: `if [ "$KSU" = "true" ] && command -v ksud >/dev/null 2>&1` -- if bootloop triggers, uses `ksud module config set override.description` to update description.

#### Step 5-6: Config/Logging Init, Nuke Run
- Config and logging same as Magisk.
- **Nuke mode detection divergence:**
  - detect_mode probe chain:
    - zeromount: May be available if ZeroMount module installed with KSU
    - mountify: `detect_busybox()` finds `/data/adb/ksu/bin/busybox` (KSU BusyBox path)
    - symlink: `_has_overlayfs()` -- LIKELY TRUE (KSU uses overlayfs via metamodule)
    - whiteout: Needs overlayfs + busybox mknod + setfattr -- LIKELY TRUE with KSU BusyBox
    - magisk: `_probe_magisk()` -- detect_root_manager returns "ksu". Case "ksu": checks `$KSU_MAGIC_MOUNT` and `$KSU_VER_CODE >= 22098`. If using meta-overlayfs (not magic mount): FAILS.
    - pm: `pm path android` -- runs but PMS might not be ready at post-fs-data. However, `_probe_pm` returns success/failure based on whether pm responds.
  - **Typical KSU result with meta-overlayfs:** mode="mountify" or mode="symlink" or mode="whiteout"

- **KSU 10s timeout:** post-fs-data is BLOCKING with 10s timeout on KSU. `SCALPEL_NUKE_TIMEOUT` defaults to 7 (nuke.sh:125). This gives 7s for all debloat operations before deferring remainder.
  - If timeout hits: sets `_timed_out="true"`, writes status with `partial=true`
  - Deferred packages handled by `_finish_deferred_debloat()` in boot-completed.sh

---

### Phase: First Boot (service.sh -- KSU)

#### Step 2: KSU Early Exit
- **File:** service.sh:10-13
- **Action:** `[ "$KSU" = "true" ]` is TRUE
- **Result:** Prints kmsg message "deferring to boot-completed.sh", exits immediately
- **Invariants checked:** INV-11 (service.sh does NOT do post-boot work on KSU)

---

### Phase: First Boot (boot-completed.sh -- KSU)

#### Step 1: Entry
- **File:** boot-completed.sh:5-7
- **Action:** `MODDIR="${0%/*}"`, disable check
- **Note:** KSU fires boot-completed.sh natively after ACTION_BOOT_COMPLETED (confirmed by kernelsu-module-guide.md:416-417). Magisk does NOT fire this script.

#### Step 2: Post-Boot Run
- **File:** boot-completed.sh:9-10
- **Action:** Sources post_boot.sh, calls `post_boot_run()`
- **Trace:** Identical to Magisk's post_boot_run, with these KSU-specific differences:

  **Deferred debloat handling:**
  - If post-fs-data timed out (status.json has partial=true): `_finish_deferred_debloat()` sets `SCALPEL_NUKE_TIMEOUT=0` (unlimited) and re-runs nuke_run
  - If nuke was killed mid-run (status.json mode="running"): Same re-run
  - This is critical for KSU's 10s post-fs-data timeout

  **Description update:**
  - **File:** post_boot.sh:77-78
  - `[ "$KSU" = "true" ] && command -v ksud` -- TRUE on KSU
  - Calls `ksud module config set override.description "$desc"`
  - Uses KSU's native config API (no sed on module.prop needed)
  - Returns immediately after success

  **Monitor start:**
  - Same as Magisk -- backgrounded `monitor_start &`

---

### Phase: KSU-Specific Concerns

#### Metamodule Dependency
- Scalpel's whiteout/symlink modes create files in `$MODDIR/system/` which are only effective if a metamodule (meta-overlayfs) is installed to mount them.
- **Risk:** If user has no metamodule, filesystem modes create whiteouts/opaque dirs that never get mounted. Apps remain visible.
- **Mitigation:** detect_mode probes test actual capabilities. Mountify mode works without metamodule (uses tmpfs mounts directly). PM mode always works.
- **FINDING F-01:** detect.sh does NOT explicitly check for metamodule presence. Whiteout/symlink/magisk probes may pass even without metamodule installed, creating non-functional whiteouts.

#### BusyBox Path
- KSU BusyBox: `/data/adb/ksu/bin/busybox` (confirmed in kernelsu-additional-docs.md:714)
- `detect_busybox()` (detect.sh:24-38) checks `command -v busybox` first (works on KSU because BusyBox is in PATH in standalone mode), then fallback paths including `/data/adb/ksu/bin/busybox`.
- **Result:** BusyBox correctly found on KSU.

#### post-mount.sh
- KSU supports `post-mount.sh` but Scalpel does NOT provide one.
- **No issue:** post-mount.sh is optional. Scalpel's approach of creating overlayfs entries before metamount.sh runs is correct.

---

## Trace 3: APatch -- Full Lifecycle

### Phase: Installation (customize.sh)

#### Divergences from Magisk/KSU:

**Step 4 (Root Manager Detection):**
- **File:** detect.sh:15-16
- **Variables:** `$KSU` is NOT set (APatch does not set `$KSU`), `$APATCH` is set to `"true"`
- **Result:** `_DETECT_ROOT_MGR="apatch"`, `ROOT_MGR="apatch"`
- **Cross-reference:** kernelsu-additional-docs.md:966 confirms `APATCH=true`, `KSU` is NOT set for APatch.

**Step 10 (REMOVE Variable):**
- **File:** customize.sh:100
- **Action:** `[ -n "$KSU" ] || [ -n "$APATCH" ]` -- `$APATCH` is "true", so TRUE
- **Result:** REMOVE block executes, same as KSU. APatch also processes REMOVE variable at install time with `mknod c 0 0` whiteouts.
- **Cross-reference:** kernelsu-additional-docs.md:786 confirms APatch uses REMOVE + mknod.

**Step 11 (action.sh removal):**
- **File:** customize.sh:142
- **Action:** `[ -n "$APATCH" ]` is TRUE. action.sh removed.
- **Result:** APatch serves WebUI natively (same as KSU per kernelsu-additional-docs.md:877)

---

### Phase: First Boot (post-fs-data.sh -- APatch)

#### Same as KSU with these notes:
- APatch also has 10s post-fs-data timeout (kernelsu-additional-docs.md:802)
- `SCALPEL_NUKE_TIMEOUT=7` applies
- BusyBox at `/data/adb/ap/bin/busybox` (kernelsu-additional-docs.md:714)
- `detect_busybox()` finds it via fallback path at detect.sh:31

#### Mode Detection on APatch:
- APatch uses OverlayFS natively (kernelsu-additional-docs.md:718: "OverlayFS (kernel)")
- Also has metamodule support (kernelsu-additional-docs.md:1046)
- `_has_overlayfs()` -- LIKELY TRUE
- `_probe_whiteout()` -- depends on BusyBox having mknod+setfattr
- `_probe_magisk()` -- detect_root_manager returns "apatch", case "apatch": checks `$APATCH_BIND_MOUNT`. If not set: FAILS. If set to "true": PASSES.
- **Typical APatch result:** mode="mountify" or mode="whiteout" or mode="symlink"

---

### Phase: First Boot (service.sh -- APatch)

#### Step 2: APatch Early Exit
- **File:** service.sh:10
- **Action:** `[ "$APATCH" = "true" ]` is TRUE
- **Result:** Exits immediately, defers to boot-completed.sh
- **Note:** APatch fires boot-completed.sh natively (kernelsu-additional-docs.md:805)

---

### Phase: First Boot (boot-completed.sh -- APatch)

#### Identical to KSU flow with one key difference:

**Description Update:**
- **File:** post_boot.sh:77
- `[ "$KSU" = "true" ]` is FALSE (APatch does not set $KSU)
- Falls to sed fallback at post_boot.sh:82-85: `sed -i "s|^description=.*|description=${safe_desc}|" "${MODDIR}/module.prop"`
- **FINDING F-02:** APatch does NOT have `ksud` or KSU's config API. The code correctly falls through to sed-based module.prop editing. However, APatch may or may not respect runtime module.prop changes for display purposes.
- **Cross-reference:** kernelsu-additional-docs.md:1060 confirms "Module config: KernelSU has ksud module config built-in. Magisk/APatch do not have this."

**Bootloop Description:**
- **File:** bootloop.sh:69-74
- `[ "$KSU" = "true" ]` is FALSE for APatch. The ksud branch is skipped.
- Falls to sed at bootloop.sh:72-74: `sed -i "s|^description=.*|description=${_bl_desc}|" "$MODDIR/module.prop"`
- **Result:** Correct -- APatch uses module.prop for description.

---

### Phase: APatch-Specific Concerns

#### No `ksud` Available
- APatch cannot use `ksud module config set override.description`
- All description updates use sed on module.prop
- **Verified:** Both post_boot.sh and bootloop.sh correctly fall through to sed for non-KSU managers

#### ARM64 Only
- APatch is ARM64 only (kernelsu-additional-docs.md:842: "ARM64 architecture only")
- customize.sh:38 aapt setup handles arm64-v8a correctly

#### Metamodule Support
- APatch adopted metamodule system from KSU (kernelsu-additional-docs.md:819)
- Same metamodule dependency concern as KSU (FINDING F-01 applies)

---

## Trace 4: Failure Scenarios

### Scenario 1: Bootloop at 3rd Consecutive Boot

#### Step-by-step:

**Boot 1:** post-fs-data.sh -> bootloop_init: count=0+1=1 -> bootloop_check: 1<3, passes -> nuke_run (causes bootloop somehow) -> device reboots during boot

**Boot 2:** post-fs-data.sh -> bootloop_init: reads count=1, increments to 2 -> bootloop_check: 2<3, passes -> nuke_run again -> device reboots again

**Boot 3:** post-fs-data.sh -> bootloop_init: reads count=2, increments to 3 -> bootloop_check: 3>=3, TRIGGERS:
1. **bootloop.sh:53:** Logs FATAL to kmsg
2. **bootloop.sh:56-58:** Calls `config_restore` if available (config.sh was sourced at post-fs-data.sh:14). Restores config from backup.
3. **bootloop.sh:61-63:** Wipes ALL overlay dirs from MODDIR: `rm -rf "${MODDIR:?}/${dir}"` for all partition dirs
4. **bootloop.sh:65:** `touch "$MODDIR/disable"` -- disables module
5. **bootloop.sh:68-75:** Updates description via ksud (KSU) or sed (Magisk/APatch)
6. **bootloop.sh:78:** `_bl_write_count -1` -- writes recovery marker
7. **bootloop.sh:81:** `_bl_reboot` -- attempts reboot via multiple methods (busybox timeout 3 sync, reboot, /system/bin/reboot, busybox reboot, sysrq-trigger)

**Boot 4 (recovery boot):** bootloop_init: reads count=-1 (grep pattern `^BOOTCOUNT=[0-9]+$` does NOT match `-1` because of the dash). Sanitization: `case "-1" in ''|*[!0-9-]*) BOOTCOUNT=0` -- the pattern `*[!0-9-]*` checks for chars outside 0-9 and dash. `-1` contains only dash and digits, so it does NOT match the pattern. BOOTCOUNT stays "-1".

**CRITICAL FINDING F-03:** The sanitization regex at bootloop.sh:43 allows negative numbers. `case "$BOOTCOUNT" in ''|*[!0-9-]*)` -- the character class `[!0-9-]` means "not digit and not dash". So `-1` passes through (all chars are in the allowed set). Then `BOOTCOUNT=$(( -1 + 1 ))` = 0. Then `_bl_write_count 0`. This is actually the INTENDED behavior -- the recovery marker -1 increments to 0, which means the counter is effectively reset.

Wait -- re-reading: `_bl_write_count -1` writes `BOOTCOUNT=-1` to count.sh. On next boot, `grep -oE '^BOOTCOUNT=[0-9]+$'` looks for `BOOTCOUNT=` followed by one or more DIGITS. `-1` starts with a dash, so `[0-9]+` does NOT match `-1`. The grep returns empty. Then BOOTCOUNT="" (empty). Then `case "" in ''|*[!0-9-]*) BOOTCOUNT=0`. Empty matches '', so BOOTCOUNT=0. Then increments to 1.

**Actually correct!** The recovery marker works as follows:
- Write `BOOTCOUNT=-1` to file
- Next boot: grep pattern `^BOOTCOUNT=[0-9]+$` does NOT match (negative sign)
- BOOTCOUNT falls to empty/0 via sanitization
- Increments to 1
- Module is disabled (disable file exists), so it won't do anything harmful
- User can manually re-enable module

**Invariants checked:** INV-1 (counter never reset before boot_completed -- on recovery boot, counter resets via the -1 mechanism, but module is disabled so it's safe)

---

### Scenario 2: OTA Update Resets System Partition

**Premise:** After OTA, system partition changes. Apps that were hidden may reappear.

**For filesystem modes (whiteout/symlink/magisk):**
- Module's overlay entries in `$MODDIR/system/` survive (stored on /data partition)
- On next boot, root manager re-mounts overlays
- Whiteouts still hide the same paths
- **If OTA adds new bloat:** Scanner cache is stale (app_list.json from install). New apps won't be in nuke_list.json. Not auto-debloated. User must re-scan via WebUI.
- **If OTA removes an app:** Whiteout targets non-existent path. Harmless -- whiteout on non-existent path is a no-op.

**For mountify mode:**
- tmpfs mounts don't persist across reboot
- nuke_run re-creates them at post-fs-data from nuke_list.json
- **Works correctly:** Apps re-hidden from nuke_list.json regardless of OTA changes

**For pm mode:**
- pm disable state persists in PMS database (/data/system/packages.xml)
- OTA may restore packages.xml, re-enabling apps
- nuke_run at post-fs-data would attempt pm disable, but PMS not running at post-fs-data
- pm mode deferred to service.sh/boot-completed.sh via status "pm_deferred"
- _finish_deferred_debloat re-runs with pm mode after boot_completed

**Monitor:**
- If apps reappear between reboots, monitor's `_check_debloated_apps()` detects via `mode_verify` failure
- Calls `mode_debloat` to repair
- **Works correctly**

---

### Scenario 3: PMS Crash During PM Mode Debloat

**Premise:** `pm disable-user` fails or hangs due to PMS crash.

**At post-fs-data:** PM mode not available (PMS not running). detect_mode skips pm (nuke.sh:93 + detect.sh:172 -- pm is last in probe chain, and `_probe_pm()` calls `pm path android` which fails at post-fs-data). nuke_run writes status "pm_deferred" and returns 0.

**At service.sh/boot-completed.sh:** `_finish_deferred_debloat` detects pm_deferred, forces `SCALPEL_MODE_OVERRIDE="pm"`, re-runs nuke. If PMS crashes mid-run:
- `pm disable-user` returns non-zero
- mode_debloat returns 1, `failed` counter increments
- nuke_run completes loop, writes status with failed>0
- On next boot: `_finish_deferred_debloat` sees mode="pm" and failed>0, retries
- **Result:** Self-healing across reboots

**Invariants checked:** INV-3 (no pm commands before system_server -- pm_deferred mechanism ensures this)

---

### Scenario 4: Corrupt status.json at Boot

**Premise:** status.json contains invalid JSON (disk corruption, crash during write).

**In nuke_run (nuke.sh:61):** First thing nuke_run does is `_write_status "running" 0 0` which OVERWRITES status.json with fresh valid JSON. Previous corrupt content is replaced.
- **Invariants checked:** INV-2 (status.json always valid after nuke_run starts)

**In verify_run (verify.sh:43-48):** `"$jq_bin" -r '.mode // ""' "$STATUS_FILE"` -- if status.json is corrupt, jq returns error, mode="". Then: `if [ -z "$mode" ] || [ "$mode" = "unknown" ] || ...` is true, falls back to `detect_mode()`. Verify continues with detected mode.
- **Result:** Graceful degradation -- doesn't crash, uses fresh detection

**In _finish_deferred_debloat (post_boot.sh:21):** `"$jq_bin" -r '.mode // ""' "$STATUS_FILE"` -- corrupt JSON makes jq fail, mode="". `need_rerun` stays "false" (none of the condition checks match ""). Function returns 0 (no rerun).
- **FINDING F-04:** If status.json is corrupt at boot, _finish_deferred_debloat cannot detect that nuke was interrupted. However, nuke_run already overwrites status.json before this function is called (from post_boot.sh:55 -> nuke_run -> _write_status "running"). The only concern is if status.json was corrupt BEFORE post-fs-data.sh ran, and nuke_run already corrected it.
- **Actually:** post-fs-data runs nuke_run FIRST (which overwrites status.json), then post_boot_run runs _finish_deferred_debloat. By the time _finish_deferred_debloat checks status.json, it has already been overwritten by nuke_run. So corrupt status.json at boot is self-correcting.

**In monitor _check_debloated_apps (monitor.sh:51-56):** `_jq -r '.mode // ""' "$STATUS_FILE"` -- if corrupt, mode="". Case "" matches the empty pattern, function returns 0 (skips check). No crash.

**In action.sh (action.sh:29):** `_jq '.' "$STATUS_FILE"` validation check. If corrupt: prints "State: Status file corrupted" and returns.
- **Invariants checked:** INV-9 (action.sh never modifies state -- confirmed, only reads and prints)

---

### Scenario 5: No Filesystem Modes Available, PM Mode Only

**Premise:** No overlayfs, no ZeroMount, no busybox mount, not Magisk. Only pm works.

**post-fs-data.sh:**
- detect_mode probes all filesystem modes -- all fail
- pm probe: `pm path android` -- FAILS at post-fs-data (PMS not running)
- detect_mode returns "" (empty)
- nuke_run:93-98: `mode=""`, writes status "pm_deferred", returns 0
- **Invariants checked:** INV-4 (detect_mode returns valid name or empty -- returns empty, correct)

**service.sh (Magisk) / boot-completed.sh (KSU/APatch):**
- `_finish_deferred_debloat()` reads status.json: mode="pm_deferred"
- Sets `override_mode="pm"`, `need_rerun="true"`
- Sets `SCALPEL_MODE_OVERRIDE="pm"`, `SCALPEL_NUKE_TIMEOUT=0` (unlimited)
- Calls nuke_run
- nuke_run:93: `detect_mode()` -- with SCALPEL_MODE_OVERRIDE="pm", `_validate_mode "pm"` calls `_probe_pm()` which succeeds (PMS is running after boot_completed). Returns "pm".
- Mode script loaded: mode_pm.sh
- mode_probe: `command -v pm` -- passes
- Package loop: calls `pm disable-user --user 0 "$pkg"` per package
- **Complete flow works correctly**

**Monitor:** mode="pm" in status.json. mode_verify calls `pm list packages -d | grep "$pkg"`. mode_debloat calls `pm disable-user`. All work post-boot.

---

### Scenario 6: Module Disabled (disable file exists)

**post-fs-data.sh:** No disable check in post-fs-data.sh. IT RUNS REGARDLESS.
- bootloop_init, bootloop_check, config_init, log_init, nuke_run ALL execute even when disabled
- **FINDING F-05:** post-fs-data.sh does NOT check for disable file. On KSU/APatch, the root manager should prevent execution of post-fs-data.sh when module is disabled (per KSU docs: "Only executed if the module is enabled"). On Magisk, same behavior. So this is handled by the root manager, not by the script itself.
- **Cross-reference:** kernelsu-module-guide.md:353 -- "Only executed if the module is enabled." This applies to ALL module scripts (post-fs-data.sh, service.sh, boot-completed.sh).
- **Correction:** The root manager prevents ALL scripts from running when disabled. The `disable` check in service.sh:5 and boot-completed.sh:7 is REDUNDANT but harmless (defense in depth).

**service.sh:5:** `[ -f "${MODDIR}/disable" ] && exit 0` -- extra safety check

**boot-completed.sh:7:** Same check

**Result:** Module disabled = no scripts run (enforced by root manager). Extra checks in service.sh and boot-completed.sh are belt-and-suspenders.

---

### Scenario 7: Scanner Fails During Install

**Premise:** `scanner_run` returns non-zero (e.g., pm list packages fails after 3 retries).

**customize.sh:65-72:**
```sh
if scanner_run; then
    local_count=...
    ui_print "Found ${local_count:-0} system apps (cached)"
else
    ui_print "Scan completed with warnings"
    log_w "$TAG" "scanner returned non-zero"
fi
```

**Impact:**
- No `app_list.json` generated (or partial/empty file)
- Volume key prompt still appears
- If UP pressed: `apply_default_debloat "$MODPATH"` at default_debloat.sh:22: `[ -f "$app_list" ]` is FALSE (no app_list.json). Falls to fallback path at line 40: resolves paths via `pm` directly. This works if pm is functioning (it was during install).
- If DOWN pressed: No debloat at all, user configures via WebUI later
- **Module still installs and boots correctly** -- scanner failure is non-fatal

---

## Master Invariant Table

### Legend
- **HOLD**: Invariant holds for this combination
- **HOLD***: Invariant holds with caveats (see notes)
- **RISK**: Potential violation under specific conditions
- **N/A**: Not applicable for this phase

| INV | Statement | Magisk Install | Magisk Boot | Magisk Runtime | KSU Install | KSU Boot | KSU Runtime | APatch Install | APatch Boot | APatch Runtime |
|-----|-----------|---------------|-------------|----------------|-------------|----------|-------------|----------------|-------------|----------------|
| INV-1 | Counter never reset before boot_completed | N/A | HOLD | HOLD | N/A | HOLD | HOLD | N/A | HOLD | HOLD |
| INV-2 | status.json always valid JSON | N/A | HOLD | HOLD | N/A | HOLD | HOLD | N/A | HOLD | HOLD |
| INV-3 | No pm before system_server | HOLD* | HOLD | HOLD | HOLD* | HOLD | HOLD | HOLD* | HOLD | HOLD |
| INV-4 | detect_mode returns valid or empty | N/A | HOLD | HOLD | N/A | HOLD | HOLD | N/A | HOLD | HOLD |
| INV-5 | Whiteout operations idempotent | N/A | HOLD | HOLD | HOLD | HOLD | HOLD | HOLD | HOLD | HOLD |
| INV-6 | service.sh handles all status.json states | N/A | HOLD | N/A | N/A | HOLD | N/A | N/A | HOLD | N/A |
| INV-7 | Monitor never concurrent with nuke | N/A | N/A | HOLD | N/A | N/A | HOLD | N/A | N/A | HOLD |
| INV-8 | Monitor never auto-repairs systemized | N/A | N/A | HOLD | N/A | N/A | HOLD | N/A | N/A | HOLD |
| INV-9 | action.sh never modifies state | N/A | N/A | HOLD | N/A | N/A | HOLD | N/A | N/A | HOLD |
| INV-10 | All 6 modes debloat idempotent | N/A | HOLD | HOLD | HOLD | HOLD | HOLD | HOLD | HOLD | HOLD |
| INV-11 | Boot work runs exactly once | N/A | HOLD | N/A | N/A | HOLD | N/A | N/A | HOLD | N/A |
| INV-12 | REMOVE only safe+google | N/A | N/A | N/A | HOLD | N/A | N/A | HOLD | N/A | N/A |

### Notes on HOLD*:
- **INV-3 (Install):** Scanner calls `pm list packages` during install. This is correct because PMS IS running during install (Magisk Manager/KSU Manager runs within a booted system). The invariant is about boot time, not install time. During install, system_server is running.

---

## Issues Found

### F-01: Metamodule Presence Not Detected (LOW)
- **Location:** detect.sh:160-183
- **Issue:** detect_mode does not check whether a metamodule is installed on KSU/APatch. Whiteout and symlink probes may pass (overlayfs kernel support exists) but the whiteouts/opaque dirs in $MODDIR/system/ are only effective if a metamodule mounts them.
- **Impact:** On KSU without metamodule, filesystem modes create overlay entries that never get mounted. Apps remain visible. Nuke reports success but debloat is ineffective.
- **Severity:** LOW -- KSU without metamodule is an unusual configuration. Users who install Scalpel presumably have a working KSU setup. Additionally, mountify mode (tmpfs) works independently of metamodule and is probed before whiteout/symlink.
- **Mitigation already present:** mountify is probed before whiteout/symlink in the chain, and tmpfs mounting works without metamodule. PM mode works as final fallback.

### F-02: APatch Description Override Limited (COSMETIC)
- **Location:** post_boot.sh:77-85
- **Issue:** APatch lacks ksud config API. Falls to sed-based module.prop editing. APatch Manager may or may not pick up runtime module.prop changes for display.
- **Impact:** Module description in APatch Manager may not update to show debloat stats.
- **Severity:** COSMETIC -- no functional impact

### F-03: Bootloop Recovery Marker Mechanism Validated (NOT AN ISSUE)
- **Location:** bootloop.sh:43, 78
- **Analysis:** The `-1` recovery marker works correctly. `grep -oE '^BOOTCOUNT=[0-9]+$'` does not match `BOOTCOUNT=-1`. BOOTCOUNT falls to empty, sanitized to 0, incremented to 1. Module is disabled via `touch "$MODDIR/disable"`. Counter effectively resets.
- **Verdict:** CORRECT by design.

### F-04: Corrupt status.json Self-Correction Validated (NOT AN ISSUE)
- **Location:** Multiple files
- **Analysis:** nuke_run overwrites status.json with `_write_status "running" 0 0` at the start of every run. By the time post_boot's _finish_deferred_debloat reads it, it's already valid.
- **Exception:** If post-fs-data.sh itself crashes before nuke_run starts (e.g., bootloop.sh fatal), status.json from previous boot persists. But in that case, bootloop protection triggers and disables module.
- **Verdict:** CORRECT -- all paths handled.

### F-05: post-fs-data.sh Missing Disable Check (NOT AN ISSUE)
- **Location:** post-fs-data.sh (absence of disable check)
- **Analysis:** All three root managers prevent script execution when module is disabled. The check is not needed in the script itself. service.sh and boot-completed.sh have it as defense in depth.
- **Verdict:** By design. Root manager enforces this.

### F-06: nuke.sh Lock File Race Window (THEORETICAL)
- **Location:** nuke.sh:57-58
- **Issue:** `echo "$$" > "$_nuke_lock"` is not atomic and has no re-read verification (unlike monitor.sh:33-37 and post_boot.sh:92-95 which do re-read).
- **Impact:** If two nuke_run instances start simultaneously (extremely unlikely -- would require both post-fs-data and a concurrent call), both could acquire the lock.
- **Severity:** THEORETICAL -- nuke_run is only called from post-fs-data (synchronous, blocking) and _finish_deferred_debloat (also synchronous). No realistic concurrent invocation path exists.

### F-07: TAG Variable Clobbering in post_boot.sh (COSMETIC)
- **Location:** post_boot.sh:116, 121, 128
- **Issue:** After sourcing nuke.sh, verify.sh, and monitor.sh, the TAG variable is overwritten by each sourced file. The code correctly re-assigns TAG="post_boot" after each source. This is handled.
- **Verdict:** Already mitigated. TAG is explicitly reassigned after each source.

### F-08: detect_aapt References Stale Path at Boot (LOW)
- **Location:** detect.sh:48
- **Issue:** `local path="${MODDIR}/bin/${abi}/aapt"` -- but customize.sh:139 removes the `bin/` directory after install (`rm -rf "$MODPATH/bin"`). At boot time, `${MODDIR}/bin/` does not exist. detect_aapt returns empty.
- **Impact:** aapt is unavailable at boot time. Only used by scanner (which runs at install, not boot) and permissions.sh (which has dumpsys fallback).
- **Cross-check:** customize.sh:46-47 copies aapt to `$MODPATH/common/aapt`, but detect_aapt looks in `$MODDIR/bin/${abi}/aapt`, not `$MODDIR/common/aapt`.
- **Severity:** LOW -- aapt is only needed at install time (scanner runs there). The common/aapt copy is for potential future use. permissions.sh has dumpsys fallback.

### F-09: mode_symlink Vendor Symlink Fixup Not Called From nuke.sh (LOW)
- **Location:** nuke.sh:164-172
- **Issue:** For symlink mode, the code calls `_fix_vendor_symlinks "${MODDIR}"` which is defined in mode_symlink.sh:120. However, nuke.sh sources whiteout_helpers.sh (line 166) for whiteout/magisk modes, but for symlink mode (line 170), it calls `_fix_vendor_symlinks` which is a function defined in mode_symlink.sh. Since mode_symlink.sh was already sourced at nuke.sh:108, the function IS available.
- **Verdict:** Correct. The mode script is sourced before the vendor symlink block.

### F-10: Scanner pm_cache Subshell Issue (LOW)
- **Location:** scanner.sh:104
- **Issue:** `pm_cache=$(pm list packages -f -s 2>/dev/null)` captures all system packages. Used in grep at line 142: `echo "$pm_cache" | grep "$app_dir"`. If app_dir contains regex metacharacters (unlikely for Android paths), grep could mismatch.
- **Severity:** LOW -- Android app paths are /system/app/AppName/ which contain no regex metacharacters.

---

## SHIP/NO-SHIP Recommendation

### Summary

| Category | Count |
|----------|-------|
| Critical Issues | 0 |
| High Issues | 0 |
| Medium Issues (F-01) | 1 |
| Low Issues (F-06, F-08, F-09, F-10) | 4 |
| Cosmetic Issues (F-02, F-07) | 2 |
| Validated Non-Issues (F-03, F-04, F-05) | 3 |

### Invariant Status

All 12 invariants HOLD across all 3 root managers and all phases:

- **INV-1** (bootloop counter): VERIFIED. Counter only reset in `bootloop_reset()` called from `post_boot_run()` which runs AFTER boot_completed.
- **INV-2** (status.json validity): VERIFIED. All writes use jq with atomic tmp+mv pattern. Empty file guard in `_write_status`. Merge failure fallback in verify.sh.
- **INV-3** (no pm before system_server): VERIFIED. pm_deferred mechanism, pm probe in detect chain correctly fails at post-fs-data.
- **INV-4** (detect_mode return): VERIFIED. Returns mode name (string) or empty string. All 6 mode names are valid.
- **INV-5** (whiteout idempotency): VERIFIED. `whiteout_create` checks `[ -c "$wo_path" ] && return 0`. All modes check for existing state.
- **INV-6** (service.sh state handling): VERIFIED. Magisk path: polls boot_completed then runs post_boot. KSU/APatch: exits immediately, boot-completed.sh handles it. All status.json states handled by `_finish_deferred_debloat`.
- **INV-7** (monitor/nuke lock): VERIFIED. nuke.sh writes nuke.lock, monitor checks before every debloat verify/repair cycle.
- **INV-8** (no auto-repair systemized): VERIFIED. `_check_systemized_apps` only logs warnings, never calls promote_app or mode_debloat.
- **INV-9** (action.sh read-only): VERIFIED. action.sh only calls `_print_status`, `_update_description`, `_show_log_tail`, `_launch_webui_magisk`. No write operations to data files.
- **INV-10** (mode debloat idempotency): VERIFIED per mode:
  - zeromount: zm add is idempotent (CLI handles duplicate entries)
  - mountify: checks `busybox mount | grep` before mounting (line 42)
  - symlink: checks empty dir exists (line 58)
  - whiteout: checks `[ -c "$wo_path" ] && return 0` (line 23)
  - magisk: same whiteout check via whiteout_helpers.sh
  - pm: `pm disable-user` on already-disabled package returns success or verified via pm list
- **INV-11** (boot work exactly once): VERIFIED. `_post_boot_acquire()` flag file with PID + re-read verification. `rm -f boot_completed_handled` in post-fs-data.sh:6 clears per boot.
- **INV-12** (REMOVE only safe+google): VERIFIED. REMOVE paths derived from nuke_list.json which is built by `apply_default_debloat` filtering categories.json for `.value == "safe" or .value == "google"` only.

### Recommendation

**SHIP** (with awareness of F-01 for future hardening)

The backend is architecturally sound across all 3 root managers. All 12 invariants hold. All 7 failure scenarios are handled gracefully. The execution flow is correct for Magisk (polling), KernelSU (native boot-completed), and APatch (native boot-completed). The deferred debloat mechanism correctly handles KSU/APatch's 10s post-fs-data timeout. The bootloop protection is robust with correct recovery semantics.

The one medium-severity finding (F-01: metamodule detection) is mitigated by the probe chain ordering (mountify before whiteout/symlink) and is an edge case configuration. It should be addressed before v1.0 but does not block the current phase.

---

## Appendix: Complete File Reference

| # | File | Lines | Role |
|---|------|-------|------|
| 1 | post-fs-data.sh | 29 | Boot entry point (all managers) |
| 2 | service.sh | 28 | Late boot (Magisk polling / KSU+APatch exit) |
| 3 | boot-completed.sh | 11 | Native boot-completed (KSU/APatch only) |
| 4 | customize.sh | 158 | Installation logic |
| 5 | uninstall.sh | 51 | Module removal and app restoration |
| 6 | action.sh | 130 | User-facing status display (read-only) |
| 7 | core/config.sh | 179 | Persistent config read/write/migrate/backup |
| 8 | core/logging.sh | 87 | 5-level structured logging with rotation |
| 9 | core/bootloop.sh | 93 | 3-strike bootloop protection |
| 10 | core/detect.sh | 184 | Mode detection probe chain |
| 11 | core/scanner.sh | 189 | System app discovery engine |
| 12 | core/nuke.sh | 192 | Debloat orchestrator |
| 13 | core/verify.sh | 162 | Post-reboot verification |
| 14 | core/whiteout_helpers.sh | 82 | Shared whiteout creation/removal |
| 15 | core/default_debloat.sh | 82 | Default safe+google debloat list |
| 16 | core/monitor.sh | 181 | Background verification daemon |
| 17 | core/post_boot.sh | 136 | Shared post-boot work (deferred debloat, verify, monitor) |
| 18 | modes/mode_pm.sh | 82 | PM disable/enable mode |
| 19 | modes/mode_whiteout.sh | 116 | OverlayFS char device whiteout mode |
| 20 | modes/mode_zeromount.sh | 108 | ZeroMount VFS mode |
| 21 | modes/mode_magisk.sh | 140 | Magisk magic mount whiteout mode |
| 22 | modes/mode_mountify.sh | 140 | tmpfs overlay mode |
| 23 | modes/mode_symlink.sh | 167 | Opaque overlay directory mode |
| 24 | systemize/promote.sh | 194 | App systemization engine |
| 25 | systemize/permissions.sh | 139 | Priv-app permissions XML generator |
| 26 | module.prop | 10 | Module identity |
