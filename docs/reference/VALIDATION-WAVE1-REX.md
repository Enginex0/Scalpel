# Scalpel Wave 1 Fix Validation Report

**Validator:** Red Team Rex
**Date:** 2026-02-01
**Scope:** 5 fixes applied to bootloop.sh, whiteout_helpers.sh, detect.sh, nuke.sh, service.sh, scanner.sh
**Cross-referenced against:** AUDIT-BACKEND-VS-DOCS.md findings C-03, H-04, C-01, H-01, C-02
**Method:** Line-by-line adversarial code review with boot-stage simulation, cross-manager edge cases, and race condition analysis
**Files read:** 19 (all modified files + context files + all 3 reference docs)

---

## FIX C-03 -- bootloop.sh Reboot Chain (setprop removal)

**Verdict:** PASS WITH CONCERNS
**Issues Found:** 3

### Issue 1: `sync` Can Hang Indefinitely Under Blocked I/O

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/bootloop.sh:24`
- **Attack Vector:** The `sync` call on line 24 is unbounded. At post-fs-data, if any filesystem (especially `/data` on an encrypted f2fs device) has a blocked I/O operation (e.g., dm-verity failure, hung loop device from meta-overlayfs), `sync` blocks indefinitely. Since this is the bootloop RECOVERY path (counter >= 3), the device is already in trouble. A hanging `sync` prevents the reboot from ever executing, turning a recoverable bootloop into a permanent hang.
- **Evidence:**
  ```sh
  # bootloop.sh:23-29
  _bl_reboot() {
      sync                              # <-- can hang if I/O is blocked
      reboot 2>/dev/null
      /system/bin/reboot 2>/dev/null
      busybox reboot 2>/dev/null
      echo b > /proc/sysrq-trigger 2>/dev/null
  }
  ```
  There is no timeout wrapper around `sync`. The BusyBox `timeout` applet could wrap it: `timeout 3 sync 2>/dev/null`.
- **Recommendation:** Wrap `sync` in a timeout: `busybox timeout 3 sync 2>/dev/null; sync &` or simply make `sync` best-effort by backgrounding it: `sync &` followed by `sleep 1` to give it a chance. The sysrq-trigger fallback at the end will force an immediate reboot regardless.

### Issue 2: `reboot` May Not Be in PATH at Early post-fs-data on All Root Managers

- **Severity:** LOW
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/bootloop.sh:25`
- **Attack Vector:** On KernelSU, module scripts run in BusyBox ash with Standalone Mode. The `reboot` applet IS a BusyBox applet (confirmed in android-shell-reference.md line 265: BusyBox provides `reboot`). On Magisk, same situation -- BusyBox standalone mode is active. On APatch, same. The bare `reboot` call on line 25 will resolve to BusyBox's internal `reboot` applet in all three root managers. The `/system/bin/reboot` fallback on line 26 covers the edge case where BusyBox standalone mode is not active (which shouldn't happen for module scripts but is a reasonable belt-and-suspenders approach). The `busybox reboot` on line 27 covers the case where `busybox` is in PATH but standalone mode isn't active.
- **Evidence:** KernelSU module guide (line 64): "every single command will directly use the applet within BusyBox." The `reboot` applet is listed in the BusyBox applet inventory.
- **Recommendation:** This chain is solid for all three root managers. Accept as-is. The only theoretical gap is a stripped BusyBox build that lacks `reboot`, which would be extremely unusual. The `echo b > /proc/sysrq-trigger` fallback covers this.

### Issue 3: `/proc/sysrq-trigger` May Be Disabled via `kernel.sysrq=0`

- **Severity:** LOW
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/bootloop.sh:28`
- **Attack Vector:** Some OEMs (notably Samsung, Huawei, Xiaomi MIUI) ship with `kernel.sysrq=0` which disables all sysrq functions including the `b` (immediate reboot) trigger. However, this is the LAST fallback in the chain. By this point, `reboot`, `/system/bin/reboot`, and `busybox reboot` have all failed. If all three reboot methods fail AND sysrq is disabled, the module has no way to force a reboot. But this is an extremely unlikely compound failure -- all three `reboot` commands failing simultaneously would require a deeply broken system where the kernel itself may be hung.
- **Evidence:** The sysrq trigger file at `/proc/sysrq-trigger` is writable by root on most Android kernels, but `kernel.sysrq=0` makes writes to it no-ops. Samsung KNOX devices may additionally restrict `/proc/sysrq-trigger` access.
- **Recommendation:** Accept as-is. This is already the last-resort fallback. Adding `echo 1 > /proc/sys/kernel/sysrq 2>/dev/null` before the trigger write would enable it, but that is a one-line improvement, not a blocking issue. The removal of `setprop` (the original finding) is the correct fix and eliminates the KSU deadlock risk.

### Fix Quality Assessment

The core fix (removing `setprop sys.powerctl reboot` and replacing the chain) is correct. The `setprop` deadlock at post-fs-data on KernelSU was a documented, confirmed issue. The new chain (`reboot` -> `/system/bin/reboot` -> `busybox reboot` -> sysrq-trigger) covers all root managers correctly. The only real concern is the unbounded `sync` which is a pre-existing issue from the original code, not introduced by this fix.

---

## FIX H-04 -- whiteout_helpers.sh Non-Fatal setfattr

**Verdict:** PASS WITH CONCERNS
**Issues Found:** 4

### Issue 1: Whiteout Without SELinux Context May Be Rejected by KNOX

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/whiteout_helpers.sh:37-38`
- **Attack Vector:** When `chcon --reference` fails (line 37-38), the whiteout node has no explicit SELinux context set. It inherits the context of the process that created it (typically `u:r:magisk:s0` or `u:r:su:s0`). On Samsung KNOX-enabled devices, the KNOX RKP (Real-time Kernel Protection) and DM-Verity enforcement may reject overlay entries that do not carry `u:object_r:system_file:s0` context. The whiteout would exist on disk but be ignored by the kernel's overlayfs implementation when the overlay is mounted, because the SELinux label mismatch causes an access denial.
- **Evidence:**
  ```sh
  # whiteout_helpers.sh:37-38
  busybox chcon --reference="$parent_dir" "$wo_path" 2>/dev/null \
      || log_w "$TAG" "chcon failed for $wo_path, mknod whiteout still active"
  ```
  The log message says "mknod whiteout still active" which is technically true -- the node exists. But "active" implies "functional," which may not be the case if the overlay rejects it due to context mismatch.
- **Recommendation:** Change the log message to "mknod whiteout created but may not be effective without proper SELinux context on strict-KNOX devices." Accept as-is for the non-Samsung majority. Alternatively, fall back to `chcon u:object_r:system_file:s0 "$wo_path"` as a secondary attempt if `--reference` fails.

### Issue 2: `whiteout_verify` Only Checks `[ -c ... ]`, Not Functional Effectiveness

- **Severity:** HIGH
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/whiteout_helpers.sh:59-65`
- **Attack Vector:** The verification function checks ONLY that a character device node exists at the expected path:
  ```sh
  whiteout_verify() {
      ...
      [ -c "${target_dir}$(dirname "$app_path")" ]
  }
  ```
  This passes even if:
  1. The chcon failed (SELinux context is wrong for the overlay)
  2. The setfattr failed (no `trusted.overlay.whiteout` xattr)
  3. The mknod created a node with incorrect permissions
  4. The overlay is not actually mounted (meta-overlayfs not installed on KSU)

  The verify function confirms the node EXISTS, not that the app is HIDDEN. After reboot, when service.sh calls `verify_run()`, the `mode_whiteout.sh:mode_verify()` function delegates to `whiteout_verify()` which does the same `[ -c ... ]` check. The app could still be visible to PMS if the overlay mount doesn't honor the whiteout.
- **Evidence:**
  ```sh
  # whiteout_helpers.sh:63-64
  whiteout_verify() {
      ...
      [ -c "${target_dir}$(dirname "$app_path")" ]
  }
  ```
  A more robust verification would additionally check: `[ ! -d "$(dirname "$app_path")" ]` (the original directory should be invisible if the whiteout is effective).
- **Recommendation:** Add a secondary check in `mode_whiteout.sh:mode_verify()` (not in whiteout_helpers.sh, since helpers is mode-agnostic): after confirming the whiteout node exists, also verify the original directory is no longer visible. This catches the case where the whiteout exists but is not being honored by the overlay.

### Issue 3: The `busybox chcon --reference` Pattern Requires BusyBox to Support `--reference`

- **Severity:** LOW
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/whiteout_helpers.sh:37`
- **Attack Vector:** The `--reference` flag for `chcon` is a GNU coreutils extension. BusyBox's `chcon` implementation varies by build. Magisk's BusyBox (compiled from Magisk project) DOES support `--reference` as of recent builds. KernelSU ships the same BusyBox binary (confirmed in kernelsu-module-guide.md line 79: "KernelSU's BusyBox is now using the binary file compiled directly from the Magisk project"). However, very old Magisk builds (<24.x) or custom BusyBox compilations might not support it.
- **Evidence:** The fix correctly makes this non-fatal (log warning only), so even if `--reference` is unsupported, execution continues. This is correct behavior.
- **Recommendation:** Accept as-is. The non-fatal nature of the fix handles this correctly.

### Issue 4: False Sense of Success -- Both chcon AND setfattr Fail but whiteout_create Returns 0

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/whiteout_helpers.sh:31-45`
- **Attack Vector:** After the fix, the code flow is:
  ```
  mknod succeeds -> return 0 path guaranteed
  chcon fails    -> log warning, continue
  setfattr fails -> log warning, continue
  chmod 644      -> (may also fail silently)
  return 0       -> success reported
  ```
  The function returns success even when BOTH hardening steps fail. The caller (`mode_whiteout.sh:mode_debloat()`) then calls `whiteout_verify()` which only checks `[ -c ... ]`. So the entire pipeline reports "debloated: com.example.app" to the user/WebUI when the whiteout may not be effective.

  On kernels where `mknod c 0 0` alone is sufficient for overlayfs whiteouts (Linux 5.x+ with standard overlayfs), this is fine -- the mknod IS the whiteout and the xattr/context are truly optional. On older kernels (4.x) or non-standard overlayfs implementations (some vendor forks), the xattr may be required.
- **Evidence:** The KernelSU documentation (kernelsu-module-guide.md:199-201) says: "you need to create a file with the same name as the file/folder in the module directory using `mknod filename c 0 0`. This way, the OverlayFS system will automatically whiteout this file." No mention of xattr being required. This confirms that on KernelSU's meta-overlayfs, `mknod c 0 0` alone is sufficient.
- **Recommendation:** The fix is correct for the documented behavior. The xattr and chcon are genuinely best-effort hardening for edge-case compatibility. Accept the fix, but add a note in LEARNINGS.md that the whiteout's effectiveness on non-KSU overlayfs (e.g., Magisk's magic mount which is NOT overlayfs) depends on how the mount system processes character device nodes.

### Fix Quality Assessment

The fix correctly makes `setfattr` and `chcon` non-fatal. The original audit finding (H-04) identified that a failed `setfattr` would remove a perfectly valid mknod whiteout. The fix preserves the mknod and logs warnings. The main residual risk is that `whiteout_verify()` does not test functional effectiveness, only node existence. This is a pre-existing design limitation, not introduced by the fix.

---

## FIX C-01 -- detect.sh PM Probe via `pidof`

**Verdict:** PASS WITH CONCERNS
**Issues Found:** 5

### Issue 1: `pidof system_server` Returns 0 But PMS May Not Be Initialized

- **Severity:** HIGH
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/detect.sh:138-140`
- **Attack Vector:** The `_probe_pm()` function checks:
  ```sh
  pidof system_server >/dev/null 2>&1
  ```
  `system_server` is the process that hosts PMS (PackageManagerService), but PMS initialization happens AFTER system_server starts. During early system_server startup, the process exists but PMS is not yet registered as a binder service. The `pm` command communicates with PMS via binder IPC. If `pidof system_server` succeeds but PMS hasn't finished initializing, `pm` commands will fail with "Error: Could not access the Package Manager."

  The boot timeline (from kernelsu-module-guide.md:395-413):
  ```
  class_start main
    start-service zygote (starts system_server)
    ... system_server initializes services including PMS ...
  boot complete
  ```
  Between zygote start and PMS initialization, there's a window of 5-30 seconds where `pidof system_server` returns true but `pm` commands fail.
- **Evidence:**
  ```sh
  # detect.sh:138-140
  _probe_pm() {
      pidof system_server >/dev/null 2>&1
  }
  ```
  The android-shell-reference.md:791-797 confirms: at early service.sh stage, pm commands are "Unreliable."
- **Recommendation:** Replace `pidof system_server` with an actual `pm` command probe: `pm path android >/dev/null 2>&1`. The `pm path android` command queries the framework package and returns quickly. If PMS is ready, it succeeds. If not, it fails. This is the standard pattern documented in android-shell-reference.md:802-813. Note: this changes the probe from instant (pidof) to potentially slow (~1s timeout), which is acceptable since pm mode is the last in the probe chain.

### Issue 2: `pidof` Availability Across Root Managers

- **Severity:** LOW
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/detect.sh:139`
- **Attack Vector:** `pidof` is available in both toybox (Android 6+, see android-shell-reference.md:230) and BusyBox (all root manager builds). Since module scripts run in BusyBox ash standalone mode, BusyBox's `pidof` takes precedence. This is universal across all three root managers.
- **Evidence:** android-shell-reference.md:230 lists `pidof` under System/Process toybox applets. BusyBox also includes it (line 265).
- **Recommendation:** No issue. `pidof` is universally available.

### Issue 3: Empty Mode Fallback -- What Happens When nuke_run Gets Empty Mode

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/nuke.sh:78-83`
- **Attack Vector:** When `detect_mode()` returns empty string (all probes failed), nuke.sh handles it:
  ```sh
  mode="$(detect_mode)"
  if [ -z "$mode" ]; then
      log_i "$TAG" "no filesystem mode available, deferring to service.sh for pm"
      _write_status "pm_deferred" 0 "$count"
      return 0
  fi
  ```
  This writes `"pm_deferred"` to status.json and returns 0 (success). The `$count` variable represents the total nuke list count, which is written as `debloat_failed`. This is semantically wrong: these packages haven't FAILED -- they've been DEFERRED. The WebUI reads `debloat_failed` and may display "N failed" to the user, which is misleading.
- **Evidence:**
  ```sh
  # nuke.sh:81
  _write_status "pm_deferred" 0 "$count"
  ```
  The `_write_status` signature is: `_write_status mode success failed [partial]`. Writing `$count` as the `failed` parameter means the WebUI will show all packages as "failed" when they are actually "pending."
- **Recommendation:** Either: (a) introduce a `deferred` count in the status JSON, or (b) write 0 for both success and failed, and rely on the `mode=pm_deferred` field to indicate the state. The current code conflates "deferred" with "failed."

### Issue 4: `pm_deferred` Status and the WebUI

- **Severity:** LOW
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/nuke.sh:81`
- **Attack Vector:** The `pm_deferred` value written to `status.json` is a non-standard mode name. The WebUI (not yet built, Phase 8) will need to handle this as a special case. Standard modes are: zeromount, mountify, symlink, whiteout, magisk, pm. The `pm_deferred` status is an intermediate state that exists only between post-fs-data and service.sh.

  In service.sh:51, the deferred handler correctly checks for this:
  ```sh
  if [ "$mode" = "pm_deferred" ]; then
      need_rerun="true"
      override_mode="pm"
  fi
  ```
  After service.sh runs, the status file is overwritten with the actual mode (`pm`) and real success/failed counts. So `pm_deferred` is transient.
- **Evidence:** The WebUI reads status.json for live display. If the WebUI loads between post-fs-data and service.sh completing, it will see `pm_deferred` as the mode. This is a very narrow window but should be handled.
- **Recommendation:** Document `pm_deferred` as a valid transient status in the WebUI spec. The WebUI should display "Debloat pending -- waiting for system services" when it sees this status.

### Issue 5: Service.sh Deferred Handler Always Forces PM Mode, Never Re-evaluates Better Modes

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/service.sh:51-53`
- **Attack Vector:** When `pm_deferred` is detected, the handler forces pm mode:
  ```sh
  if [ "$mode" = "pm_deferred" ]; then
      need_rerun="true"
      override_mode="pm"
  fi
  ```
  By the time service.sh runs, the system is fully booted. It's possible that a better mode is now available (e.g., zeromount's `/dev/zeromount` might exist now, or overlayfs might be ready). Forcing pm mode misses the opportunity to use a more robust mode.

  However, there's a good counter-argument: if filesystem modes (zeromount, whiteout, magisk) weren't available at post-fs-data, they're unlikely to suddenly appear at service.sh time. These modes depend on kernel features and module infrastructure that is set up at or before post-fs-data. PM mode IS the correct fallback when filesystem modes are unavailable.

  The one exception: if post-fs-data was killed by KernelSU's 10-second timeout BEFORE the probe chain completed, the detection may not have finished. In this case, re-detection at service.sh time might find a working filesystem mode. But `pm_deferred` specifically means "all probes failed" (empty mode in detect_mode()), not "timeout before probing."
- **Evidence:**
  ```sh
  # nuke.sh:78-83 (the path that sets pm_deferred)
  mode="$(detect_mode)"
  if [ -z "$mode" ]; then  # ALL probes failed
      _write_status "pm_deferred" 0 "$count"
      return 0
  fi
  ```
  All probes were attempted and failed. At service.sh time, filesystem probes would likely fail again (same kernel, same features). The pm probe would now succeed because PMS is available. So forcing pm mode is correct.
- **Recommendation:** The current behavior is correct for the `pm_deferred` case. Accept as-is. The `partial=true` case (line 58-61) correctly does NOT force a mode override, allowing re-detection, which is also correct.

### Fix Quality Assessment

The fix correctly changes pm detection from `command -v pm` (which only checks if the binary exists in PATH, always true) to `pidof system_server` (which checks if the PMS host process is running). This prevents pm mode from being selected at post-fs-data when PMS is not available, which was the core C-01 finding. The `pm_deferred` status correctly defers the work to service.sh.

The main remaining weakness is that `pidof system_server` can return true before PMS is fully initialized. However, since `_probe_pm()` is the LAST in the probe chain (detect.sh:166), it only triggers when all filesystem modes have failed. And even if pm mode is selected and pm commands fail, the deferred handler in service.sh catches pm failures (line 55) and retries.

---

## FIX H-01 -- nuke.sh Timeout Guard

**Verdict:** PASS WITH CONCERNS
**Issues Found:** 4

### Issue 1: `date +%s` Reliability on Android

- **Severity:** LOW
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/nuke.sh:109`
- **Attack Vector:** `date +%s` (epoch seconds) is used for timeout calculation. In BusyBox ash standalone mode, `date` resolves to BusyBox's `date` applet, which DOES support `+%s`. Toybox's `date` also supports `+%s` (listed in android-shell-reference.md:223). The fallback `|| echo 0` handles the impossible case where `date` fails entirely. If `_start_time` is 0 and `_now` is a real timestamp, the difference will be enormous and immediately trigger the timeout -- this is a safe failure mode (defer rather than hang).
- **Evidence:**
  ```sh
  _start_time=$(date +%s 2>/dev/null || echo 0)
  ```
  Both BusyBox and toybox support `date +%s`. Safe across all Android versions 6+.
- **Recommendation:** Accept as-is. This is solid.

### Issue 2: Partial Whiteout State on Timeout During mknod

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/nuke.sh:123-131`
- **Attack Vector:** The timeout check happens at the TOP of each loop iteration, BEFORE calling `mode_debloat()`:
  ```sh
  while IFS='	' read -r pkg app_path; do
      ...
      if [ $((_now - _start_time)) -ge "$_timeout" ]; then
          _timed_out="true"
          break
      fi
      if mode_debloat "$pkg" "$app_path"; then
          ...
  ```
  This means the timeout fires BETWEEN package operations, not DURING one. If the previous `mode_debloat()` call completed successfully, the state is consistent. If it took a long time and we're over budget, the timeout fires cleanly before the NEXT package. There is NO risk of a half-created whiteout from the timeout mechanism itself.

  However: if `mode_debloat()` itself is slow (e.g., zeromount mode where `zm add` might block waiting for the kernel), a single package could push total time past the KernelSU 10-second hard kill. The timeout check before each iteration cannot prevent KernelSU from killing the script mid-`mode_debloat()`. This would leave a partially-debloated state.
- **Evidence:** The timeout is implemented as a cooperative check, not a signal-based hard cut. KernelSU's 10-second kill is process-level (SIGKILL or similar), which cannot be caught or handled. The cooperative timeout at 7 seconds gives a 3-second buffer, but a single slow `mode_debloat()` call could consume that buffer.
- **Recommendation:** The 7-second default with 3-second buffer is reasonable for filesystem operations (mknod is typically < 1ms). For zeromount mode, `zm add` should also be fast (kernel IPC). Accept as-is for now, but add a per-operation timestamp check INSIDE `mode_debloat()` for future robustness.

### Issue 3: Partial Status Does Not Track Which Packages Were Processed

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/nuke.sh:152`
- **Attack Vector:** When timeout fires, the status is written:
  ```sh
  _write_status "$mode" "$success" "$failed" "$_timed_out"
  ```
  This records the mode, success count, failed count, and `partial=true`. But it does NOT record WHICH packages were processed and which were skipped. When service.sh reruns nuke_run with `SCALPEL_NUKE_TIMEOUT=0`:
  ```sh
  SCALPEL_NUKE_TIMEOUT=0
  . "${MODDIR}/core/nuke.sh"
  nuke_run
  ```
  The rerun processes the ENTIRE nuke_list.json again. For already-debloated packages, `mode_debloat()` will attempt to debloat them again. Let's trace what happens for each mode:
  - **whiteout:** `whiteout_create()` checks `[ -c "$wo_path" ] && return 0` (line 23 of whiteout_helpers.sh). Already-debloated packages are a no-op. SAFE.
  - **magisk:** Same path through whiteout_create. SAFE.
  - **zeromount:** `zm add` on an already-hidden path -- depends on zm binary behavior. If `zm add` is idempotent, safe. If not, could cause an error.
  - **pm:** `pm disable-user` on an already-disabled package prints "disabled" and succeeds. SAFE.
- **Evidence:** The whiteout_create idempotency check:
  ```sh
  # whiteout_helpers.sh:23
  [ -c "$wo_path" ] && return 0
  ```
  This makes reruns safe for whiteout and magisk modes.
- **Recommendation:** The rerun is safe for all current modes. However, it is wasteful -- re-iterating 50+ packages to process only the last 10 that were skipped. For future optimization, consider recording a "last_processed_index" in status.json so the rerun can skip already-processed packages. Not blocking, but an efficiency concern for large nuke lists.

### Issue 4: `SCALPEL_NUKE_TIMEOUT=0` Disables the Guard Entirely in service.sh

- **Severity:** LOW
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/service.sh:72`
- **Attack Vector:** When service.sh sets `SCALPEL_NUKE_TIMEOUT=0`, the timeout guard is completely disabled:
  ```sh
  if [ "$_timeout" -gt 0 ] 2>/dev/null; then
  ```
  `0 -gt 0` is false, so the entire timeout block is skipped. This is CORRECT for service.sh because service.sh is non-blocking (late_start service mode, per kernelsu-module-guide.md:336). There is no external timeout to worry about. The script can run as long as needed.
- **Evidence:** KernelSU module guide confirms service.sh is "NON-BLOCKING" (line 336). No timeout risk.
- **Recommendation:** Accept as-is. This is correct design.

### Fix Quality Assessment

The timeout guard correctly implements a cooperative 7-second budget with a 3-second buffer before KernelSU's 10-second hard kill. The partial status is properly written and the deferred handler in service.sh correctly picks up the work. The main residual concern is that reprocessing already-debloated packages is wasteful (but safe due to idempotency in whiteout_create). The `date +%s` approach is universally supported.

---

## FIX C-02 -- scanner.sh PM Retry

**Verdict:** PASS WITH CONCERNS
**Issues Found:** 4

### Issue 1: Retry Can Produce Duplicate Entries if PM Returns Partial Output

- **Severity:** LOW
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/scanner.sh:102-109`
- **Attack Vector:** The retry loop:
  ```sh
  local pm_cache="" _pm_try=0
  while [ "$_pm_try" -lt 3 ]; do
      pm_cache=$(pm list packages -f -s 2>/dev/null)
      [ -n "$pm_cache" ] && break
      _pm_try=$((_pm_try + 1))
      log_w "$TAG" "pm list packages empty (attempt $_pm_try/3)"
      sleep 1
  done
  ```
  On each retry, `pm_cache` is OVERWRITTEN (not appended). The `$()` command substitution captures the full output and assigns it to the variable, replacing any previous value. So if attempt 1 returns partial output but is non-empty, the loop breaks with partial data. If attempt 1 returns empty and attempt 2 returns full data, the full data is used. There is NO duplicate entry risk from the retry mechanism itself.

  However, there IS a risk from partial output: if PMS returns 50 out of 200 packages on the first attempt (non-empty string), the loop breaks. The scanner then processes only those 50 packages, missing 150. The `[ -n "$pm_cache" ]` check only verifies non-empty, not completeness.
- **Evidence:**
  ```sh
  pm_cache=$(pm list packages -f -s 2>/dev/null)
  [ -n "$pm_cache" ] && break  # breaks on ANY non-empty output
  ```
  PMS can return partial output if system_server is restarting or under memory pressure. A partial `pm list packages` output would have truncated lines or missing packages.
- **Recommendation:** Add a sanity check: verify the output contains at least N lines (e.g., `[ $(echo "$pm_cache" | wc -l) -ge 5 ]`). Most devices have at least 50 system packages; if pm returns fewer than 5 lines, something is wrong. This prevents the "partial output accepted as complete" scenario.

### Issue 2: `sleep 1` Safety in customize.sh Context

- **Severity:** LOW
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/scanner.sh:108`
- **Attack Vector:** `scanner_run()` is called from `customize.sh` during module installation. The installation process runs in the root manager's installer context. There is no strict timeout on customize.sh execution (unlike post-fs-data's 10-second limit). Magisk, KernelSU, and APatch all wait for customize.sh to complete. The worst case is 3 retries * 1 second = 3 seconds of delay, which is negligible during a user-initiated installation.
- **Evidence:** The KernelSU module guide (kernelsu-module-guide.md:271-275) describes customize.sh as being "sourced by the module installer script after all files are extracted." There is no timeout mentioned for the installer context.
- **Recommendation:** Accept as-is. 3 seconds is fine during installation.

### Issue 3: Garbage/Corrupt PM Output Not Detected

- **Severity:** LOW
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/scanner.sh:104-105`
- **Attack Vector:** If PMS returns corrupted output (e.g., binary garbage mixed with text), the `[ -n "$pm_cache" ]` check passes (non-empty). The scanner then tries to grep this garbage for package paths:
  ```sh
  pkg=$(echo "$pm_cache" | grep "$app_dir" | sed 's/^package://;s/.*=//' | head -1)
  ```
  Grep on corrupt data would return no matches (the grep pattern matches specific path strings). So `$pkg` would be empty, and the fallback to aapt would be tried:
  ```sh
  [ -z "$pkg" ] && [ -n "$aapt" ] && \
      pkg=$("$aapt" dump badging "$apk" 2>/dev/null | ...)
  ```
  If aapt is available, it resolves the package name independently. If not, the package is skipped with `log_w`. This is a graceful degradation.
- **Evidence:** The scanner has TWO independent package name resolution paths (pm cache + aapt). Corrupt pm output degrades to the aapt path, not a crash.
- **Recommendation:** Accept as-is. The dual-resolution strategy handles this well.

### Issue 4: Variable `_pm_try` Scope Collision Risk

- **Severity:** NEGLIGIBLE
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/scanner.sh:102`
- **Attack Vector:** `_pm_try` is declared in `scanner_run()` as a `local`-equivalent (scanner.sh functions use `local`). However, I need to check: is `scanner_run()` declared with `local`?

  Looking at the function:
  ```sh
  scanner_run() {
      ...
      local pm_cache="" _pm_try=0
      ...
  ```
  Yes, `_pm_try` is declared `local` inside `scanner_run()`. It is scoped to this function and cannot collide with any outer scope. The underscore prefix is a convention for private variables, further reducing collision risk.
- **Evidence:**
  ```sh
  # scanner.sh:102
  local pm_cache="" _pm_try=0
  ```
  Properly scoped.
- **Recommendation:** No issue. Clean variable scoping.

### Fix Quality Assessment

The retry mechanism is correctly implemented. The variable is overwritten (not appended) on each retry, preventing duplicates. The sleep duration is acceptable in the installation context. The main residual concern is that partial (non-empty but incomplete) PM output can be accepted as valid, but the scanner's dual-resolution strategy (pm cache + aapt fallback) mitigates this. The fix directly addresses the original C-02 finding.

---

## CROSS-CUT ANALYSIS: Interaction Between Fixes

### Interaction 1: C-01 (pm deferral) + H-01 (timeout) + service.sh deferred handler

**Scenario:** Large nuke list (60 packages), whiteout mode, KernelSU.

1. post-fs-data.sh starts, bootloop_init increments counter to 1
2. nuke_run starts at t=0, mode=whiteout (pm probe returns false via pidof -- correct C-01 fix)
3. Processes 40 packages in 7 seconds, timeout fires (H-01 fix)
4. Status written: `{mode:"whiteout", debloated:40, debloat_failed:0, partial:true}`
5. KernelSU kills post-fs-data.sh at t=10 (3-second buffer was sufficient)
6. Boot continues, service.sh waits for boot_completed
7. service.sh reads status, sees `partial=true`, sets `SCALPEL_NUKE_TIMEOUT=0`
8. nuke_run reruns, processes all 60 packages (first 40 are no-ops due to whiteout idempotency)
9. Status overwritten: `{mode:"whiteout", debloated:60, debloat_failed:0, partial:false}`

**Assessment:** This interaction works correctly. The C-01 fix prevents pm mode selection at post-fs-data. The H-01 fix prevents KernelSU from killing the script mid-operation. The deferred handler completes the work. PASS.

### Interaction 2: C-01 (pm deferral) + all filesystem modes fail

**Scenario:** Device with no overlayfs, no zeromount, no magic mount. PM is the only option.

1. post-fs-data.sh starts
2. nuke_run calls detect_mode(), all filesystem probes fail, `_probe_pm()` returns false (pidof system_server fails -- system_server hasn't started yet)
3. detect_mode returns empty string
4. nuke_run writes `{mode:"pm_deferred", debloated:0, debloat_failed:60}`
5. service.sh sees `pm_deferred`, forces pm mode, reruns nuke_run
6. nuke_run re-sources detect.sh, but `SCALPEL_MODE_OVERRIDE` is now "pm"
7. detect_mode returns "pm" (override), `_validate_mode("pm")` calls `_probe_pm()` which now calls `pidof system_server` -- system_server IS running at service.sh time, returns true
8. mode_pm.sh is sourced, mode_probe() runs (line 9: `command -v pm`), succeeds
9. All packages are disabled via pm commands

**Assessment:** This interaction works correctly. One concern: step 4 writes `debloat_failed:60` which is misleading (see Issue 3 in FIX C-01 section above). PASS WITH CONCERN.

### Interaction 3: Bootloop recovery + timeout

**Scenario:** Bad whiteout causes bootloop. Counter reaches 3.

1. Boot 1: bootloop_init sets BOOTCOUNT=1, nuke_run processes packages, reboot (bad whiteout causes issue)
2. Boot 2: bootloop_init sets BOOTCOUNT=2, same failure, spontaneous reboot
3. Boot 3: bootloop_init sets BOOTCOUNT=3, bootloop_check triggers
4. config_restore called, wipe dirs, touch disable, module.prop updated, _bl_write_count -1
5. _bl_reboot called: sync -> reboot (succeeds)
6. Boot 4: bootloop_init reads BOOTCOUNT=-1, grep fails (pattern is `[0-9]+`, doesn't match `-1`), sanitization sets to 0, increments to 1
7. Module is disabled (disable file exists), post-fs-data.sh would need a `[ -f disable ]` check...

**Wait.** Let me re-read post-fs-data.sh:
```sh
MODDIR="${0%/*}"

# 3-strike bootloop protection -- must run before anything else
. "${MODDIR}/core/bootloop.sh"
bootloop_init
bootloop_check || exit 0
```

There is NO `[ -f "${MODDIR}/disable" ]` check in post-fs-data.sh. On KernelSU and Magisk, the root manager itself checks for the `disable` file and skips executing module scripts. From kernelsu-module-guide.md:108: "If exists, the module will be disabled" and module scripts are "Only executed if the module is enabled" (line 354). So the root manager prevents execution of post-fs-data.sh when `disable` exists.

service.sh DOES have the check (line 6): `[ -f "${MODDIR}/disable" ] && exit 0`

**Assessment:** The bootloop recovery works correctly. The root manager handles the `disable` file for post-fs-data.sh. The -1 recovery marker mechanism works through grep failure (as documented in AUDIT-BACKEND-VS-DOCS.md L-02). PASS.

---

## SUMMARY TABLE

| Fix | ID | Title | Verdict | Issues | Critical | High | Medium | Low |
|-----|-----|-------|---------|--------|----------|------|--------|-----|
| 1 | C-03 | bootloop.sh reboot chain | PASS WITH CONCERNS | 3 | 0 | 0 | 1 | 2 |
| 2 | H-04 | whiteout_helpers.sh non-fatal setfattr | PASS WITH CONCERNS | 4 | 0 | 1 | 2 | 1 |
| 3 | C-01 | detect.sh pm probe via pidof | PASS WITH CONCERNS | 5 | 0 | 1 | 2 | 2 |
| 4 | H-01 | nuke.sh timeout guard | PASS WITH CONCERNS | 4 | 0 | 0 | 2 | 2 |
| 5 | C-02 | scanner.sh pm retry | PASS WITH CONCERNS | 4 | 0 | 0 | 0 | 4 |
| -- | -- | Cross-cut interactions | PASS | 3 scenarios | 0 | 0 | 0 | 0 |
| **TOTAL** | | | | **20** | **0** | **2** | **7** | **11** |

---

## OVERALL VERDICT: PASS

All 5 fixes correctly address their respective audit findings. No CRITICAL issues were introduced. The 2 HIGH issues are:

1. **whiteout_verify only checks node existence, not functional effectiveness** (H-04 residual) -- Pre-existing design limitation, not introduced by the fix. The fix correctly makes setfattr non-fatal. The verify function should be enhanced separately.

2. **pidof system_server can return true before PMS is initialized** (C-01 residual) -- The fix improves the situation dramatically (from `command -v pm` which always returns true, to `pidof` which at least checks process existence). A further improvement would use `pm path android` as the probe. However, since pm is the LAST in the probe chain and service.sh catches pm failures, the real-world impact is minimal.

### Priority Improvements (Post-Wave-1)

1. **MEDIUM:** Wrap `sync` in timeout in `_bl_reboot()` (prevents hang on blocked I/O during bootloop recovery)
2. **MEDIUM:** Change `_probe_pm()` from `pidof system_server` to `pm path android` (more accurate PMS readiness check)
3. **MEDIUM:** Add functional effectiveness check to mode_whiteout verify (check original directory is invisible, not just whiteout node exists)
4. **MEDIUM:** Fix `pm_deferred` status writing `$count` as `debloat_failed` (misleading to WebUI)
5. **LOW:** Add partial output sanity check in scanner.sh (minimum line count for pm output)

---

*Report generated by Red Team Rex -- "Every fix I couldn't break makes the module stronger. These 5 earned their place."*
