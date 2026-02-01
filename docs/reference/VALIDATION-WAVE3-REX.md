# VALIDATION WAVE 3 -- Red Team Rex Adversarial Audit

**Auditor:** Red Team Rex (Opus 4.5 exploit-hunter persona)
**Date:** 2026-02-01
**Scope:** 4 new files + 4 modified files from Phase B (Wave 3)
**Philosophy:** Assume all code is broken until proven otherwise.

---

## Table of Contents

1. [mode_mountify.sh](#1-modemountifysh--verdict-pass-with-concerns)
2. [mode_symlink.sh](#2-modesymlinksh--verdict-pass-with-concerns)
3. [monitor.sh](#3-monitorsh--verdict-pass-with-concerns)
4. [action.sh](#4-actionsh--verdict-pass)
5. [detect.sh (modified)](#5-detectsh-modified--verdict-pass)
6. [nuke.sh (modified)](#6-nukesh-modified--verdict-pass)
7. [service.sh (modified)](#7-servicesh-modified--verdict-pass-with-concerns)
8. [uninstall.sh (modified)](#8-uninstallsh-modified--verdict-pass)
9. [Summary Table](#summary-table)
10. [Overall Assessment](#overall-assessment)

---

## 1. mode_mountify.sh -- Verdict: PASS WITH CONCERNS

**File:** `/home/claudetest/zero-mount/Scalpel/module/modes/mode_mountify.sh`
**Lines:** 139
**Pattern compliance:** Follows mode interface (probe, debloat, restore, verify, cleanup). Clean, focused.

### Issue 1: Duplicate probe test directory naming collision

- **Severity:** LOW
- **File:Line:** mode_mountify.sh:19 vs detect.sh:99
- **Attack Vector:** `mode_probe()` at line 19 uses `/dev/.scalpel_mf_probe_$$` (PID-qualified), while `_probe_mountify()` in detect.sh:99 uses `/dev/.scalpel_mf_probe` (no PID suffix). If detect.sh probe leaves a stale directory (rmdir failure after umount failure), mode_mountify.sh probe will still pass since it uses a different path. This is actually fine -- no collision. However, the inconsistency means there are two different probe implementations for the same mode that could diverge in behavior.
- **Recommendation:** Accept. The duplication is harmless, and having detect.sh use a simpler path is actually fine since detect.sh runs once at boot. The PID suffix in mode_probe() is marginally safer for concurrent calls. Consider documenting that both probes exist.

### Issue 2: mount | grep false positive on substring matches

- **Severity:** MEDIUM
- **File:Line:** mode_mountify.sh:42, mode_mountify.sh:101, mode_mountify.sh:128
- **Attack Vector:** The `grep -qF " on ${app_dir} type tmpfs"` pattern does fixed-string matching. If `app_dir` is `/system/app/Foo`, the grep will correctly match ` on /system/app/Foo type tmpfs`. However, consider a directory named `/system/app/FooBar` -- a mount on `/system/app/FooBar` would contain ` on /system/app/FooBar type tmpfs` which does NOT contain ` on /system/app/Foo type tmpfs` (the `Bar` prevents the match). So this is actually safe for strict path matching.

  HOWEVER: The reverse is the concern. If somehow a mount exists on `/system/app/Foo` and we're checking for `/system/app/Foo2`, the grep for ` on /system/app/Foo2 type tmpfs` would NOT match ` on /system/app/Foo type tmpfs`. So this is safe too.

  The real edge case: `busybox mount` output format. If the mount output uses a different format on some kernels (e.g., the `type` field is absent or different), the grep would fail to match. This is unlikely on Android but worth noting.
- **Recommendation:** Accept. The grep pattern is correctly bounded by ` on ` prefix and ` type tmpfs` suffix. Robust enough for Android environments.

### Issue 3: SELinux context inheritance may fail on some ROMs

- **Severity:** LOW
- **File:Line:** mode_mountify.sh:49
- **Attack Vector:** `ls -Zd "$app_dir" 2>/dev/null | awk '{print $1}'` extracts the SELinux context. On some ROMs, `ls -Zd` output format may differ (some print the context as the 4th or 5th column instead of the 1st). BusyBox ash standalone mode overrides ls, so the format should be consistent across root managers. However, if the context is empty or `?`, the fallback at line 52 handles it correctly (`[ "$ctx" != "?" ]`).
- **Recommendation:** Accept. The fallback is in place. Worst case: tmpfs mounts without a context= option, which means PMS sees a generic context. This is non-fatal -- PMS does not check SELinux context of app directories during scanning.

### Issue 4: tmpfs mount with size=0 -- kernel behavior

- **Severity:** LOW
- **File:Line:** mode_mountify.sh:51
- **Attack Vector:** `size=0` on tmpfs means the filesystem gets default sizing (typically half of RAM). This is technically wasteful in terms of _possible_ memory reservation, but since tmpfs only uses memory for actual data stored and these directories are kept empty, the real memory usage is near zero (just inode overhead). No issue in practice.
- **Recommendation:** Accept. `size=0` is the standard default for tmpfs. Android kernel handles this correctly.

### Issue 5: Race between unmount (restore) and PMS re-scan

- **Severity:** LOW
- **File:Line:** mode_mountify.sh:88
- **Attack Vector:** After `busybox umount` at line 74 exposes the original directory, `pm install-existing` at line 88 triggers PMS re-discovery. There's a brief window where the directory is visible but PMS hasn't registered the package. In this window, if another system component scans the directory, it could see the APK before PMS indexes it. This is benign -- the APK is in its original location and PMS will pick it up within milliseconds.
- **Recommendation:** Accept. This is inherent to any unmount-based restore. The `pm install-existing` call is a best-effort accelerator.

### Issue 6: Tracking file not cleaned on boot

- **Severity:** LOW
- **File:Line:** mode_mountify.sh:8
- **Attack Vector:** `_MF_TRACKING="/data/adb/scalpel/mountify_mounts.txt"` persists across reboots. Since tmpfs mounts don't survive reboot, on a fresh boot this file contains stale paths from the previous session. The cleanup at line 124-134 handles this correctly -- it checks whether each path is actually mounted before attempting umount. On boot, none will be mounted, so the sweep is a no-op.

  However, the file grows across reboots if never cleaned. After 1000 boots with 200 apps each, the file could contain 200K lines of redundant paths (dedup at line 61 only deduplicates within a single session). In practice, each path is unique per app, so the file stays at ~200 lines. The real issue is that stale entries from removed apps accumulate.
- **Recommendation:** Accept with minor concern. The tracking file should ideally be truncated at boot start (before mode_debloat runs). This is a minor leak, not a functional bug.

### Issue 7: Nested sub-mounts not handled

- **Severity:** LOW
- **File:Line:** mode_mountify.sh:54
- **Attack Vector:** If `/system/app/SomeApp` has a sub-mount (e.g., an OEM mounts something inside it), the tmpfs overlay at `/system/app/SomeApp` will hide the sub-mount's mountpoint. When the tmpfs is unmounted (restore), the original directory AND its sub-mounts are re-exposed. No data loss occurs. The sub-mount itself is unaffected because tmpfs overlay creates a new filesystem _above_ the original mount tree -- it doesn't touch the underlying mounts. `umount` only removes the tmpfs layer.
- **Recommendation:** Accept. This is correct behavior. The tmpfs hides the entire directory tree including sub-mounts, and umount restores them.

### Praise

- Idempotent debloat (line 42-45): checks for existing mount before re-mounting. Solid.
- Tracking file with dedup (line 61): prevents duplicate entries. Clean pattern.
- PID-qualified temp file in cleanup (line 113): avoids race with concurrent cleanup.
- Atomic tracking update with `grep -v` + `mv` pattern (line 82-84): safe.
- Two-phase cleanup (nuke list + orphan sweep) is thorough.

---

## 2. mode_symlink.sh -- Verdict: PASS WITH CONCERNS

**File:** `/home/claudetest/zero-mount/Scalpel/module/modes/mode_symlink.sh`
**Lines:** 157
**Pattern compliance:** Follows mode interface. Clean structure.

### Issue 8: _make_opaque silent success when setfattr unavailable

- **Severity:** HIGH
- **File:Line:** mode_symlink.sh:21-34
- **Attack Vector:** This is the most significant issue in this file. `_make_opaque()` attempts `setfattr -n trusted.overlay.opaque -v y` on the overlay directory. If both `setfattr` and `busybox setfattr` fail (or are unavailable), the function falls through to the comment at line 32: "Magisk magic mount replaces dir contents without xattr" and **returns 0 (success)**.

  On Magisk with magic mount, this is correct -- Magisk's bind mount replaces the directory contents regardless of xattr. The empty overlay directory hides the original contents.

  On KernelSU with meta-overlayfs, this is a **critical failure path**. Without the opaque xattr, overlayfs will MERGE the overlay directory with the lower directory, meaning the original app contents SHOW THROUGH the empty overlay. The app is NOT hidden. The debloat silently fails.

  The mode_probe() at line 16-18 only checks `grep -qF "overlay" /proc/filesystems` -- it verifies the kernel supports overlayfs but does NOT verify that setfattr is available. So on a KSU device without busybox setfattr support, the symlink mode will be selected, debloat will "succeed" (return 0), but the app will still be visible.
- **Recommendation:** This is a real bug. `_make_opaque()` should return 1 when setfattr fails on overlayfs-based systems. The fallback "relying on magic mount" should only apply when the root manager is actually Magisk with magic mount active. The probe should verify setfattr availability, or `_make_opaque` should check the root manager and only accept the fallback for Magisk.

### Issue 9: mode_probe too permissive

- **Severity:** MEDIUM
- **File:Line:** mode_symlink.sh:16-18
- **Attack Vector:** `mode_probe()` only checks `/proc/filesystems` for the word "overlay". This means the symlink mode is available on ANY device with overlayfs kernel support, including KSU devices using meta-overlayfs where the opaque xattr is mandatory. Combined with Issue 8, this creates a path where the mode is selected but cannot actually work.

  In the priority chain (detect.sh:172), symlink comes AFTER mountify but BEFORE whiteout. On a KSU device where mountify works, this is fine (mountify is selected first). On a device where mountify fails but overlayfs is supported, symlink will be chosen -- and may silently fail to hide apps.
- **Recommendation:** mode_probe should verify that either (a) setfattr works for trusted.overlay.opaque, or (b) the root manager is Magisk with magic mount active. This would prevent silent failures.

### Issue 10: pm install-existing in mode_restore when package was never uninstalled

- **Severity:** LOW
- **File:Line:** mode_symlink.sh:93
- **Attack Vector:** The symlink/overlay mode hides apps at the filesystem level -- PMS never actually uninstalls or disables the package. When mode_restore removes the overlay directory, the original app dir becomes visible to PMS again. `pm install-existing` is a no-op if the package was never uninstalled. This is harmless.
- **Recommendation:** Accept. The call is a defensive no-op. No harm done.

### Issue 11: Parent directory pruning in mode_restore climbs too high

- **Severity:** LOW
- **File:Line:** mode_symlink.sh:85-91
- **Attack Vector:** The `while true` loop prunes empty parent directories after removing the overlay. The guard at line 88 (`[ "$parent" = "$target_dir" ] && break`) and line 89 (`[ "$parent" = "/" ] && break`) correctly prevent climbing above the module root. The `rmdir` at line 90 will fail on non-empty directories (which is correct behavior). No risk of deleting critical directories.
- **Recommendation:** Accept. The guards are correct.

### Issue 12: _fix_vendor_symlinks condition may miss real symlinks

- **Severity:** LOW
- **File:Line:** mode_symlink.sh:117
- **Attack Vector:** The condition `[ ! -L "/${part}" ]` checks if the vendor partition is NOT a symlink on the real filesystem. If it IS a symlink (e.g., `/mi_ext` -> `/system/mi_ext`), the fixup is skipped, which is correct -- the overlay path is already correct because the root manager handles symlink resolution. If it's NOT a symlink (meaning it's a real mount point), the mv+ln fixup ensures the overlay structure matches the real filesystem layout.

  The edge case: what if the OEM uses a bind mount instead of a symlink for these paths? `[ ! -L "/${part}" ]` would be true (not a symlink), so the fixup runs. But the fixup creates a symlink `../mi_ext` which may not resolve correctly for a bind-mounted path. This is the same pattern used in whiteout_helpers.sh and mode_magisk.sh, so the concern is shared.
- **Recommendation:** Accept. This matches the established pattern across all modes.

### Issue 13: Cleanup removes ALL overlay dirs unconditionally

- **Severity:** LOW
- **File:Line:** mode_symlink.sh:150-153
- **Attack Vector:** The cleanup wipes all `$_SYM_CLEANUP_DIRS` from the module directory. If another mode was previously active and left files in these dirs, they would also be removed. This is acceptable because mode_cleanup is a full teardown operation, and only one mode should be active at a time.
- **Recommendation:** Accept. Full cleanup is the correct behavior.

### Praise

- Idempotent debloat check (line 52-55): correctly handles re-runs.
- Stale entry cleanup before mkdir (line 58): prevents conflicts from previous modes.
- SELinux context set on both the overlay dir AND its parent (lines 62-65): thorough.
- Parent directory pruning on restore (lines 85-91): prevents empty directory accumulation.
- Vendor symlink fixup (lines 111-123): handles OEM partition layout correctly.

---

## 3. monitor.sh -- Verdict: PASS WITH CONCERNS

**File:** `/home/claudetest/zero-mount/Scalpel/module/core/monitor.sh`
**Lines:** 181
**Pattern compliance:** Well-structured daemon with singleton protection. Good separation of concerns.

### Issue 14: PID file race condition still possible

- **Severity:** MEDIUM
- **File:Line:** monitor.sh:24-38
- **Attack Vector:** `_acquire_singleton()` implements a check-then-act pattern with a re-read verification. The sequence is:
  1. Check if PID file exists (line 25)
  2. If exists, read old PID, check if alive (lines 26-31)
  3. If dead, remove PID file (line 31)
  4. Write own PID (line 33)
  5. Re-read to verify (lines 35-37)

  The race window: Two instances A and B both pass step 1 (no PID file). Both reach step 4. A writes its PID. B overwrites with its PID. A reads B's PID at step 5 and returns failure. B reads its own PID at step 5 and returns success. Result: only one monitor runs. This is correct!

  But there's a subtler race: B could write between A's write (step 4) and A's re-read (step 5), making A think it lost the race. Meanwhile, B hasn't reached step 5 yet. If B then reads its own PID at step 5, B wins. A exits. This is still correct behavior -- one winner.

  However, there's a filesystem-level race: if the `echo "$$" > "$PID_FILE"` and the `cat "$PID_FILE"` happen to interleave at the filesystem buffer level, the re-read could see a partial write. On ext4/f2fs, `echo "X" > file` is a single write syscall for small data, and `cat` is a single read, so this is atomic in practice on Android.
- **Recommendation:** Accept. The re-read verification is a good defense-in-depth. The race window is astronomically small and resolves correctly in all practical scenarios. For bulletproof locking, `flock` would be ideal, but it requires BusyBox or toybox support and adds complexity.

### Issue 15: SCALPEL_MONITOR_INTERVAL is not a registered config key

- **Severity:** HIGH
- **File:Line:** monitor.sh:154
- **Attack Vector:** `config_get SCALPEL_MONITOR_INTERVAL` calls into config.sh, which uses `_config_valid_key()` and `_config_dispatch_get()`. The dispatch table in config.sh:69-78 only recognizes 5 keys: `SCALPEL_VERSION`, `SCALPEL_MODE_OVERRIDE`, `SCALPEL_LOG_LEVEL`, `SCALPEL_REFRESH_APPLIST`, `SCALPEL_DISABLE_ONLY`. `SCALPEL_MONITOR_INTERVAL` is NOT in this list.

  `_config_valid_key("SCALPEL_MONITOR_INTERVAL")` will pass (it matches the `SCALPEL_[A-Z_]*` pattern). But `_config_dispatch_get` will hit the `*) return 1` case and return empty string with exit code 1. The `2>/dev/null` suppresses the error, and `interval` gets empty string. Then `interval="${interval:-300}"` at line 155 sets it to 300.

  Result: **The monitor interval is ALWAYS 300 seconds regardless of any config setting.** The config key is dead code. Users cannot change the monitor interval.
- **Recommendation:** This is a functional bug. Either add `SCALPEL_MONITOR_INTERVAL` to the config dispatch table in config.sh (and `_config_defaults`, `_config_write_file`), or document that the interval is fixed at 300s and remove the `config_get` call. The former is the correct fix.

### Issue 16: nuke.lock is referenced but never created

- **Severity:** MEDIUM
- **File:Line:** monitor.sh:13, monitor.sh:48, monitor.sh:75
- **Attack Vector:** The monitor checks for `${SCALPEL_DATA}/nuke.lock` at lines 48 and 75 to avoid interfering with an active nuke.sh run. However, searching the entire codebase reveals that **nuke.lock is never created by nuke.sh or any other file**. The lock check is defensive code against a lock that doesn't exist.

  This means: if nuke_run() (from service.sh deferred debloat) and the monitor's repair cycle run concurrently, they WILL interfere with each other. The monitor could call mode_debloat on a package while nuke.sh is already processing it. For tmpfs mounts (mountify), this would result in a double mount attempt -- which the idempotent check at mode_mountify.sh:42 handles correctly. For overlay modes, mkdir on an existing directory is also idempotent.

  So the lack of nuke.lock creates a theoretical race but no practical damage due to idempotent mode_debloat implementations.
- **Recommendation:** This is a design gap. nuke.sh should create nuke.lock at the start of nuke_run() and remove it at the end. The monitor's check infrastructure is already in place -- it just needs the other side implemented.

### Issue 17: SIGTERM only caught after sleep completes

- **Severity:** LOW
- **File:Line:** monitor.sh:151, monitor.sh:163
- **Attack Vector:** `trap '_cleanup' TERM` at line 151 registers the cleanup handler. The main loop at line 162-173 does `sleep "$interval"` (5 minutes by default). When SIGTERM is sent (e.g., from uninstall.sh), the `sleep` builtin in BusyBox ash receives the signal and is interrupted. The trap handler runs `_cleanup()` which removes the PID file. Then the script exits.

  In BusyBox ash, `sleep` is a builtin applet (when in standalone mode). BusyBox's ash correctly handles signals during sleep -- the sleep is interrupted and the trap handler runs immediately. This is different from some shells where `sleep` is an external process and the signal is deferred until `sleep` returns.

  However, `trap` only traps TERM. If the process receives SIGKILL (kill -9), the PID file is NOT cleaned up. On next boot, `_acquire_singleton` checks if the old PID is alive (it won't be), removes the stale PID file (line 31), and proceeds. So stale PID files self-heal.
- **Recommendation:** Accept. BusyBox ash handles SIGTERM during sleep correctly. SIGKILL cannot be trapped by any process. The stale PID self-healing is good defense-in-depth.

### Issue 18: Battery drain concern for large app lists

- **Severity:** LOW
- **File:Line:** monitor.sh:62-88
- **Attack Vector:** Every 5 minutes, the monitor iterates all packages in nuke_list.json. For each, it calls mode_verify() which (depending on mode) does a mount grep, directory listing, or file existence check. For 200 packages:
  - jq parse: ~50ms (one-shot, outputs to temp file)
  - Per-package verify: ~2ms each (stat/grep) = ~400ms total
  - Total per cycle: ~500ms of CPU time every 300 seconds

  This is 0.17% CPU utilization. Negligible battery impact. The interval floor of 60s (line 157) prevents abuse.
- **Recommendation:** Accept. The performance characteristics are well within acceptable limits.

### Issue 19: Trap does not cover EXIT

- **Severity:** LOW
- **File:Line:** monitor.sh:151
- **Attack Vector:** `trap '_cleanup' TERM` only traps SIGTERM. If the monitor exits via `break` at line 168, it falls through to `_cleanup` at line 175 -- correct. If it exits via an unhandled error (set -e is not active, so this is unlikely), the PID file would be left behind. Adding `EXIT` to the trap would be safer: `trap '_cleanup' EXIT TERM`.
- **Recommendation:** Change `trap '_cleanup' TERM` to `trap '_cleanup' EXIT TERM` for belt-and-suspenders safety. Low priority since the explicit `_cleanup` call at line 175 handles the normal exit path.

### Issue 20: Mode script re-sourced every cycle

- **Severity:** LOW
- **File:Line:** monitor.sh:60
- **Attack Vector:** Inside `_check_debloated_apps()`, the mode script is sourced with `. "$mode_script"` on every invocation. Since `_check_debloated_apps` is called every cycle (line 171), the mode script is re-sourced every 5 minutes. This re-defines all mode functions, which is wasteful but harmless. The real concern is variable namespace pollution -- each sourcing re-declares global variables like `TAG`, `_MF_TRACKING`, etc. The monitor's own `TAG` variable gets clobbered.

  After `_check_debloated_apps` returns, line 172 calls `_check_systemized_apps`. If the mode script set `TAG` to "mountify", any log calls in systemized check would use the wrong tag. However, `_check_systemized_apps` sources `promote.sh` which sets its own `TAG`.
- **Recommendation:** Accept with note. The TAG clobbering is harmless since each function sets its own. For performance, the mode script could be sourced once (outside the loop) with a mode-change check, but this is micro-optimization.

### Praise

- Singleton PID pattern with re-read verification (lines 24-38): excellent defense against race conditions.
- Stale PID self-healing via `_is_pid_alive` (line 20-22): prevents dead lock files from blocking.
- nuke.lock check for concurrent operation safety (lines 48, 75): good design pattern even though the other side is missing.
- Interval bounds enforcement (lines 157-158): 60s floor prevents battery drain, 3600s ceiling prevents stale detection.
- Module disable/remove check in main loop (lines 166-169): graceful shutdown.
- Systemize verification is log-only (line 113): correctly avoids dangerous auto-repair for systemized apps.
- `_update_repair_count` with atomic write pattern (lines 127-136): safe JSON update.

---

## 4. action.sh -- Verdict: PASS

**File:** `/home/claudetest/zero-mount/Scalpel/module/action.sh`
**Lines:** 129
**Pattern compliance:** Clean, focused, appropriate for its purpose.

### Issue 21: Multiple jq invocations for status display

- **Severity:** LOW
- **File:Line:** action.sh:36-42
- **Attack Vector:** Seven separate `_jq` calls to parse the same `status.json`. Each invocation spawns a new jq process, reads the file, parses JSON, extracts one field, and exits. For a small JSON file this takes ~50ms x 7 = ~350ms. This is noticeable as a slight delay when the user taps the action button but not a functional issue.

  A single jq call with multiple outputs would be more efficient:
  ```
  _jq -r '[.mode//"unknown",.debloated//0,...] | @tsv' "$STATUS_FILE"
  ```
  But the current approach is clearer and more maintainable.
- **Recommendation:** Accept. Clarity over performance for a user-interactive script that runs infrequently.

### Issue 22: KSU/APATCH environment variable detection

- **Severity:** LOW
- **File:Line:** action.sh:65, action.sh:120
- **Attack Vector:** `[ -z "$KSU" ]` checks if the KSU variable is set. Per the KernelSU documentation, KSU is set to `"true"` in all module scripts. The check `[ -n "$KSU" ]` at line 120 is correct -- it detects KernelSU regardless of the value. No custom ROM sets `$KSU` for other purposes.

  For APATCH, `[ -n "$APATCH" ]` follows the same pattern. APatch sets this to `"true"` in module scripts.

  The Magisk case (line 124-128) is the fallback -- if neither KSU nor APATCH is set, assume Magisk. This is correct per the detection hierarchy.
- **Recommendation:** Accept. The environment variable detection is reliable and well-documented.

### Issue 23: ksud module config set may fail silently

- **Severity:** LOW
- **File:Line:** action.sh:80
- **Attack Vector:** `ksud module config set override.description "$desc" 2>/dev/null` suppresses all errors. If ksud is not available (e.g., on very old KSU), the command fails silently. The `2>/dev/null` is appropriate because this is a cosmetic feature (updating the module description shown in the manager). Failure to update the description has no impact on module functionality.
- **Recommendation:** Accept. Silent failure is the correct behavior for a cosmetic operation.

### Issue 24: am start intent ambiguity

- **Severity:** LOW
- **File:Line:** action.sh:88, action.sh:94
- **Attack Vector:** The `am start -n` uses explicit component names (`io.github.a13e300.ksuwebui/.WebUIActivity` and `com.dergoogler.mmrl.wx/.ui.activity.webui.WebUIActivity`). The `-n` flag specifies the exact component, so there's no ambiguity even if multiple WebUI viewers are installed. The first one found (`pm path` check at lines 86, 92) is used.
- **Recommendation:** Accept. Explicit component names prevent intent ambiguity.

### Issue 25: MODDIR derivation differs from other scripts

- **Severity:** LOW
- **File:Line:** action.sh:3
- **Attack Vector:** `MODDIR="${0%/*}"` derives the module directory from the script path. This is the standard pattern recommended by KernelSU docs. It works correctly when the root manager executes action.sh from its original location. If someone symlinks or copies action.sh elsewhere, `$0` would point to the wrong path. But root managers always execute from the module directory.
- **Recommendation:** Accept. Standard pattern, works as designed.

### Praise

- Status file corruption check before parsing (lines 29-33): prevents jq errors from spewing to the terminal.
- Graceful fallback when no WebUI viewer is installed (lines 98-101): provides install URL.
- Log tail display (lines 104-113): immediately useful debugging info for users.
- Clean separation of KSU/APatch path vs Magisk path (lines 120-129).

---

## 5. detect.sh (modified) -- Verdict: PASS

**File:** `/home/claudetest/zero-mount/Scalpel/module/core/detect.sh`
**Modification:** Added `_probe_mountify()` function (lines 94-108) and inserted `mountify` in the probe chain (line 172).

### Issue 26: Probe chain ordering is correct

- **Severity:** N/A (positive finding)
- **File:Line:** detect.sh:172
- **Analysis:** The chain `zeromount > mountify > symlink > whiteout > magisk > pm` is the correct priority order. ZeroMount (kernel VFS) is strongest. Mountify (tmpfs) is next-strongest because it requires no overlay support and works universally. Symlink (overlay opaque dirs) follows. Whiteout (overlay char device) is more complex. Magisk (magic mount) is last filesystem mode. PM (package manager) is the software-only fallback.
- **Recommendation:** No issues.

### Issue 27: _probe_mountify test mount cleanup

- **Severity:** LOW
- **File:Line:** detect.sh:99-107
- **Attack Vector:** If `"$bb" mount` succeeds at line 101 but `"$bb" umount` fails at line 105, the test directory remains mounted. On subsequent calls, `mkdir -p "$test_dir"` at line 100 would succeed (the directory exists, even if mounted). The next mount attempt would create a stacked mount. This is unlikely to cause issues since the test directory is in `/dev/` (tmpfs), but stacked mounts are messy.
- **Recommendation:** Accept. The probability of umount failing on a just-mounted empty tmpfs is near zero. The `/dev/` location ensures it's cleaned on reboot regardless.

---

## 6. nuke.sh (modified) -- Verdict: PASS

**File:** `/home/claudetest/zero-mount/Scalpel/module/core/nuke.sh`
**Modification:** Added `symlink` case to the vendor symlink fixup block (lines 148-156).

### Issue 28: Vendor symlink fixup correctly dispatches by mode

- **Severity:** N/A (positive finding)
- **File:Line:** nuke.sh:148-156
- **Analysis:** The fixup block now handles three cases:
  - `whiteout|magisk`: Uses `whiteout_helpers.sh`'s `whiteout_fix_vendor_symlinks`
  - `symlink`: Uses `mode_symlink.sh`'s `_fix_vendor_symlinks`

  The `_fix_vendor_symlinks` function in mode_symlink.sh (line 111-123) and `whiteout_fix_vendor_symlinks` in whiteout_helpers.sh (line 69-81) have identical logic. The mode_symlink version is local to the symlink mode's overlay approach, while the whiteout_helpers version is shared between whiteout and magisk modes. Both operate on the same principle: if an OEM vendor dir exists under `/system/` in the module overlay AND is not a real symlink on the root filesystem, relocate it.
- **Recommendation:** No issues. The dispatch is correct.

### Issue 29: _fix_vendor_symlinks called from nuke.sh scope

- **Severity:** LOW
- **File:Line:** nuke.sh:154
- **Attack Vector:** `_fix_vendor_symlinks "${MODDIR}"` calls a function defined in mode_symlink.sh. This function is available because mode_symlink.sh was sourced at nuke.sh:94 (`. "$mode_script"`). The function name starts with `_` (conventionally "private"), but it's used as a public interface here. This works but violates the naming convention.
- **Recommendation:** Accept. Function visibility in shell scripts is purely conventional. The call is correct.

---

## 7. service.sh (modified) -- Verdict: PASS WITH CONCERNS

**File:** `/home/claudetest/zero-mount/Scalpel/module/service.sh`
**Modification:** Added `monitor.sh` sourcing and `monitor_start &` launch (lines 116-117).

### Issue 30: Monitor sourced but launched in background

- **Severity:** LOW
- **File:Line:** service.sh:116-117
- **Attack Vector:** `. "${MODDIR}/core/monitor.sh"` at line 116 sources the monitor into service.sh's namespace. Then `monitor_start &` at line 117 forks a background subshell. The subshell inherits all sourced functions and variables. The `&` is correct -- the monitor must not block service.sh.

  The concern: after the background fork, service.sh proceeds to log "scalpel late boot complete" (line 119) and exits. The backgrounded monitor continues running independently. If the parent (service.sh) exits, the monitor's parent PID becomes 1 (init). This is standard daemon behavior and is correct.
- **Recommendation:** Accept. The daemon launch pattern is correct for Android module service.sh scripts.

### Issue 31: TAG variable clobbered by monitor sourcing

- **Severity:** LOW
- **File:Line:** service.sh:116
- **Attack Vector:** Before line 116, `TAG="service"` (set at line 110). After sourcing monitor.sh, `TAG` is clobbered to `"monitor"` (monitor.sh:5). The `TAG="service"` assignment should be re-applied after sourcing, but looking at the code: line 110 already sets `TAG="service"` before the monitor source. Wait -- the monitor.sh file has `TAG="monitor"` at line 5 which is a top-level assignment. When sourced, this executes immediately and clobbers TAG.

  Then `monitor_start &` at line 117 runs the daemon in the background. The final `log_i "$TAG"...` at line 119 uses the current value of TAG, which is "monitor" (not "service"). The log message "scalpel late boot complete" would be attributed to tag "monitor" instead of "service".

  Looking more carefully: actually no. `TAG="service"` is NOT re-set after the source. Let me check the actual line numbers again...

  Line 108: `. "${MODDIR}/core/verify.sh"` -- this sets TAG to "verify" (verify.sh:6)
  Line 109: `verify_run || ...`
  Line 110: `TAG="service"` -- explicitly restores TAG
  Line 116: `. "${MODDIR}/core/monitor.sh"` -- this sets TAG to "monitor" (monitor.sh:5)
  Line 117: `monitor_start &` -- forks background
  Line 119: `log_i "$TAG" "scalpel late boot complete"` -- TAG is "monitor", not "service"

  The log message is incorrectly attributed.
- **Recommendation:** Add `TAG="service"` after line 117 (before line 119). This is a minor logging cosmetic issue but indicates inattention to variable scoping.

### Issue 32: sed -i on module.prop may have SELinux restrictions

- **Severity:** LOW
- **File:Line:** service.sh:101
- **Attack Vector:** `sed -i "s|^description=.*|description=${desc}|" "${MODDIR}/module.prop"` modifies the module's module.prop file. On KernelSU with meta-overlayfs, the module directory may be mounted read-only after metamount.sh runs. However, service.sh runs AFTER post-fs-data, and the module directory at `/data/adb/modules/scalpel/` is on the writable `/data` partition. The module.prop file itself is not overlayed onto `/system` -- it stays in the module dir.

  The `desc` variable is sanitized at line 100 by stripping `|/&\` characters. However, sed's `s` command uses `|` as delimiter here, so any `|` in `desc` would break the substitution. The sanitization at line 100 removes `|`, so this is safe. But backslashes could still cause issues if they weren't stripped -- and they ARE stripped by `tr -d '|/&\\'`.
- **Recommendation:** Accept. The sanitization is thorough enough for sed substitution.

### Praise

- Deferred debloat handling (lines 35-84): comprehensive logic for all failure modes (running, pm_deferred, pm failures, partial timeout).
- Environment variable save/restore around nuke_run (lines 72-73, 82-83): prevents side effects on the caller's config.
- Boot wait with 300s timeout (lines 9-17): prevents infinite hang.

---

## 8. uninstall.sh (modified) -- Verdict: PASS

**File:** `/home/claudetest/zero-mount/Scalpel/module/uninstall.sh`
**Modification:** Added monitor daemon kill logic (lines 20-25).

### Issue 33: Monitor kill is best-effort

- **Severity:** LOW
- **File:Line:** uninstall.sh:20-25
- **Attack Vector:** The uninstall reads the PID file and sends `kill` (default SIGTERM). If the monitor is sleeping, BusyBox ash will interrupt the sleep and the trap handler will clean up. If the PID file is stale (monitor already exited), `kill` will fail silently (no `2>/dev/null` needed since the error goes to stderr which is typically /dev/null in root manager context).

  The PID file is removed at line 24 regardless of whether kill succeeded. This is correct -- we don't want stale PID files lingering.

  One concern: if the monitor PID was recycled (very unlikely on Android where PID space is large), the kill could terminate an unrelated process. The PID file was written by the monitor which ran for potentially hours, so the original PID has been alive for the entire session. PID recycling would only happen if the monitor died and 32768+ processes were created since. Vanishingly unlikely.
- **Recommendation:** Accept. Best-effort kill with PID file cleanup is the standard daemon management pattern.

### Issue 34: Pipe subshell loses variable in while loop

- **Severity:** LOW
- **File:Line:** uninstall.sh:31
- **Attack Vector:** `"$_jq" -r '.[].package_name' "$NUKE_LIST" 2>/dev/null | while IFS= read -r pkg; do` -- the pipe creates a subshell for the `while` loop. Any variable modifications inside the loop (there are none here) would be lost. In this case, the loop only calls `pm install-existing` and `pm enable`, which don't need to propagate state. So the pipe-subshell is safe here.

  This is different from nuke.sh and monitor.sh which use the temp-file pattern (`> "$tmp" ... done < "$tmp"`) to avoid pipe subshells. The uninstall.sh doesn't need that pattern because it doesn't track state across iterations.
- **Recommendation:** Accept. The pipe-subshell pattern is fine when no state needs to escape the loop.

### Praise

- Monitor kill before data manipulation (lines 20-25): correct ordering prevents race conditions.
- Dual restore strategy: `pm install-existing || pm enable` (line 33): covers both filesystem-hidden and pm-disabled apps.
- JSON validity check before parsing (line 29): prevents jq errors.
- Clean data directory removal (line 48): full cleanup.

---

## Summary Table

| # | File | Issue | Severity | Status |
|---|------|-------|----------|--------|
| 1 | mode_mountify.sh | Duplicate probe test directory naming | LOW | Accept |
| 2 | mode_mountify.sh | mount\|grep false positive concern | MEDIUM | Accept (safe) |
| 3 | mode_mountify.sh | SELinux context extraction format | LOW | Accept |
| 4 | mode_mountify.sh | tmpfs size=0 semantics | LOW | Accept |
| 5 | mode_mountify.sh | Race on unmount/PMS re-scan | LOW | Accept |
| 6 | mode_mountify.sh | Tracking file grows across reboots | LOW | Accept |
| 7 | mode_mountify.sh | Nested sub-mounts | LOW | Accept |
| 8 | **mode_symlink.sh** | **_make_opaque returns 0 on setfattr failure** | **HIGH** | **Fix required** |
| 9 | **mode_symlink.sh** | **mode_probe too permissive (no setfattr check)** | **MEDIUM** | **Fix required** |
| 10 | mode_symlink.sh | pm install-existing on never-uninstalled pkg | LOW | Accept |
| 11 | mode_symlink.sh | Parent dir pruning bounds | LOW | Accept |
| 12 | mode_symlink.sh | _fix_vendor_symlinks bind mount edge case | LOW | Accept |
| 13 | mode_symlink.sh | Cleanup removes all overlay dirs | LOW | Accept |
| 14 | monitor.sh | PID file race condition | MEDIUM | Accept (mitigated) |
| 15 | **monitor.sh** | **SCALPEL_MONITOR_INTERVAL not in config dispatch** | **HIGH** | **Fix required** |
| 16 | **monitor.sh** | **nuke.lock never created by nuke.sh** | **MEDIUM** | **Fix required** |
| 17 | monitor.sh | SIGTERM during sleep | LOW | Accept |
| 18 | monitor.sh | Battery drain concern | LOW | Accept |
| 19 | monitor.sh | Trap covers TERM but not EXIT | LOW | Fix recommended |
| 20 | monitor.sh | Mode script re-sourced every cycle | LOW | Accept |
| 21 | action.sh | Multiple jq invocations | LOW | Accept |
| 22 | action.sh | KSU/APATCH env var detection | LOW | Accept |
| 23 | action.sh | ksud config set silent failure | LOW | Accept |
| 24 | action.sh | am start intent ambiguity | LOW | Accept |
| 25 | action.sh | MODDIR derivation | LOW | Accept |
| 26 | detect.sh | Probe chain ordering | N/A | Correct |
| 27 | detect.sh | Probe test mount cleanup | LOW | Accept |
| 28 | nuke.sh | Vendor symlink dispatch | N/A | Correct |
| 29 | nuke.sh | Private function called from nuke scope | LOW | Accept |
| 30 | service.sh | Monitor daemon launch pattern | LOW | Accept |
| 31 | service.sh | TAG clobbered by monitor.sh sourcing | LOW | Fix recommended |
| 32 | service.sh | sed -i on module.prop | LOW | Accept |
| 33 | uninstall.sh | Monitor kill best-effort | LOW | Accept |
| 34 | uninstall.sh | Pipe subshell in while loop | LOW | Accept |

---

## Fixes Required (4 items)

### FIX-W3-01: mode_symlink.sh -- _make_opaque must fail when xattr is required [HIGH]

**Problem:** `_make_opaque()` returns 0 when setfattr is unavailable, assuming Magisk magic mount. On KSU with overlayfs, the empty directory does NOT hide lower-layer contents without the opaque xattr. Silent debloat failure.

**Fix:** Detect whether the current root manager uses overlayfs or magic mount. Only accept the setfattr-unavailable fallback for magic mount.

```sh
_make_opaque() {
    local dir="$1"

    if command -v setfattr >/dev/null 2>&1; then
        setfattr -n trusted.overlay.opaque -v y "$dir" 2>/dev/null && return 0
    fi
    if command -v busybox >/dev/null 2>&1; then
        busybox setfattr -n trusted.overlay.opaque -v y "$dir" 2>/dev/null && return 0
    fi

    # Without xattr, only Magisk magic mount can hide lower-layer contents
    # On overlayfs-based systems (KSU meta-overlayfs), empty dirs don't suppress lower layer
    if [ -n "$KSU" ] || [ -n "$APATCH" ]; then
        log_e "$TAG" "setfattr unavailable and overlayfs requires it for $dir"
        return 1
    fi

    log_d "$TAG" "setfattr unavailable, relying on magic mount for $dir"
    return 0
}
```

### FIX-W3-02: monitor.sh -- Register SCALPEL_MONITOR_INTERVAL in config.sh [HIGH]

**Problem:** `config_get SCALPEL_MONITOR_INTERVAL` always returns empty because the key is not in the config dispatch table. Monitor interval is hardcoded to 300s.

**Fix:** Add `SCALPEL_MONITOR_INTERVAL` to `_config_defaults()`, `_config_write_file()`, `_config_dispatch_get()`, and `_config_dispatch_set()` in config.sh.

### FIX-W3-03: nuke.sh -- Create and remove nuke.lock [MEDIUM]

**Problem:** monitor.sh checks for nuke.lock to avoid concurrent operations, but nuke.sh never creates it.

**Fix:** In nuke_run(), create the lock at start and remove at end:
```sh
# At start of nuke_run():
local _nuke_lock="${SCALPEL_DATA}/nuke.lock"
echo "$$" > "$_nuke_lock" 2>/dev/null

# At end of nuke_run() (before return statements):
rm -f "$_nuke_lock" 2>/dev/null
```

Use trap to ensure cleanup on unexpected exit:
```sh
trap 'rm -f "$_nuke_lock" 2>/dev/null' EXIT
```

### FIX-W3-04: service.sh -- Restore TAG after sourcing monitor.sh [LOW]

**Problem:** Sourcing monitor.sh clobbers TAG from "service" to "monitor". The final log message is misattributed.

**Fix:** Add `TAG="service"` between lines 117 and 119.

---

## Fixes Recommended (1 item)

### REC-W3-01: monitor.sh -- Add EXIT to trap [LOW]

**Problem:** `trap '_cleanup' TERM` only covers SIGTERM. Adding EXIT ensures PID file cleanup on any exit path.

**Fix:** Change line 151 to:
```sh
trap '_cleanup' EXIT TERM
```

---

## Overall Assessment

**Quality: HIGH.** The Wave 3 code demonstrates strong engineering practices across the board.

**What's solid:**
- Idempotent operations throughout (all modes handle re-runs gracefully)
- Atomic write patterns (tmp file + mv) used consistently
- Defensive coding (null checks, fallback values, error logging)
- Proper daemon lifecycle management (PID file, singleton, signal handling)
- Good separation of concerns (each file has one responsibility)
- Consistent pattern across all mode scripts (probe/debloat/restore/verify/cleanup interface)
- Boot stage awareness (monitor waits for boot, checks disable/remove flags)

**What needs attention:**
- The mode_symlink.sh opaque xattr fallback (Issue 8) is the most significant finding -- it can cause silent debloat failures on KSU overlayfs systems
- The dead config key (Issue 15) means monitor interval is not configurable despite appearing to be
- The missing nuke.lock (Issue 16) leaves a theoretical concurrency gap

**File-level verdicts:**
| File | Verdict |
|------|---------|
| mode_mountify.sh | PASS WITH CONCERNS (minor, all acceptable) |
| mode_symlink.sh | PASS WITH CONCERNS (1 HIGH needs fix) |
| monitor.sh | PASS WITH CONCERNS (1 HIGH + 1 MEDIUM need fix) |
| action.sh | PASS |
| detect.sh (modified) | PASS |
| nuke.sh (modified) | PASS |
| service.sh (modified) | PASS WITH CONCERNS (1 LOW fix recommended) |
| uninstall.sh (modified) | PASS |

**Overall Wave 3 Verdict: PASS WITH CONCERNS -- 4 fixes required before the code is production-ready.**
