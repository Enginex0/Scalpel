# Scalpel Backend -- Comprehensive Audit Report

**Auditor:** Red Team Rex (Claude Opus 4.5)
**Date:** 2026-02-01
**Scope:** All 27 shell scripts, 2 JSON/prop data files, full documentation cross-check
**Methodology:** Line-by-line adversarial review across 6 audit dimensions

---

## Executive Summary

**Overall Health Score: 82/100 -- SOLID with targeted fixes needed**

The Scalpel backend is well-architected with consistent patterns, proper atomic writes, good error handling, and thoughtful cross-manager awareness. The codebase shows evidence of multiple prior audit rounds with fixes applied. However, this final comprehensive audit uncovered **4 CRITICAL**, **8 HIGH**, **11 MEDIUM**, and **9 LOW/INFO** findings that must be addressed before shipping to production.

**Critical count:** 4 (must fix before ship)
**High count:** 8 (fix strongly recommended)
**Medium count:** 11 (should fix)
**Low/Info count:** 9 (nice to have)

---

## Critical Findings (Must Fix Before Ship)

### C-01: customize.sh deletes bin/ directory before KSU/APatch REMOVE processing can use jq

- **Severity:** CRITICAL
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/customize.sh:139`
- **Category:** Error / Boot Stage
- **Issue:** Line 139 runs `rm -rf "$MODPATH/bin" 2>/dev/null` to clean unused arch binaries. However, the REMOVE variable processing at lines 101-128 uses `_jq` which resolves to `"$MODPATH/bin/jq"`. The `rm -rf` happens AFTER the REMOVE block in the current flow, so this specific ordering is actually safe. BUT: when KSU/APatch process the `REMOVE` variable after customize.sh returns, they execute `mknod` on the paths. The jq binary is already used and done. **However**, the real issue is that `$MODPATH/bin/jq` is the bundled jq binary that nuke.sh, verify.sh, monitor.sh, and every boot script uses via `"${MODDIR}/bin/jq"`. By deleting `$MODPATH/bin/` at install time, ALL boot-time jq resolution falls back to PATH `jq` which may not exist on the device.
- **Evidence:**
```sh
# customize.sh:139
rm -rf "$MODPATH/bin" 2>/dev/null

# nuke.sh:70
local jq_bin="${MODDIR}/bin/jq"
[ ! -x "$jq_bin" ] && jq_bin="jq"
```
- **Impact:** On devices without system `jq` (which is ALL stock Android devices -- jq is never in stock), every jq call at boot fails silently due to the fallback. nuke.sh cannot parse nuke_list.json. verify.sh cannot parse status.json. monitor.sh cannot parse anything. The module becomes completely non-functional after the first reboot. Only `aapt` was selected per-arch; `jq` should be preserved.
- **Fix:** Only delete the architecture-specific aapt directories, not the entire bin/ directory. Or copy jq to `$MODPATH/common/jq` alongside aapt. The bin/ cleanup should only remove `$MODPATH/bin/arm64-v8a/` and `$MODPATH/bin/armeabi-v7a/` (the unused aapt arch dirs), not `$MODPATH/bin/jq`.

---

### C-02: nuke.sh re-sources logging/config/detect inside nuke_run() -- clobbers caller's state

- **Severity:** CRITICAL
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/nuke.sh:49-53`
- **Category:** Cross-Mode / Error
- **Issue:** `nuke_run()` unconditionally sources `logging.sh`, `config.sh`, and `detect.sh` at lines 49-53. When nuke.sh is sourced (not executed) from `post-fs-data.sh`, these re-source operations re-initialize `_config_defaults()` and `log_init()`, which is technically safe (idempotent). BUT when `_finish_deferred_debloat()` in post_boot.sh calls `nuke_run()`, it has already set `SCALPEL_MODE_OVERRIDE` and `SCALPEL_NUKE_TIMEOUT` environment variables. Inside `nuke_run()`, `config_init()` at line 52 calls `_config_defaults()` which resets `SCALPEL_MODE_OVERRIDE=""`, potentially overwriting the forced pm override that `_finish_deferred_debloat()` set at post_boot.sh:53. The config_init then loads from disk which may or may not have the override.
- **Evidence:**
```sh
# post_boot.sh:52-53
SCALPEL_NUKE_TIMEOUT=0
[ -n "$override_mode" ] && SCALPEL_MODE_OVERRIDE="$override_mode"

# nuke.sh:52
config_init 2>/dev/null  # calls _config_defaults() which sets SCALPEL_MODE_OVERRIDE=""
                          # then loads config from disk (which has the user's persistent value)
```
- **Impact:** When post-fs-data gets killed by KSU 10s timeout (status=`running`), the deferred rerun in post_boot.sh sets `SCALPEL_MODE_OVERRIDE` to force the correct mode, but `nuke_run()` resets it via `config_init()`. The deferred debloat may auto-detect a different mode or fail to force pm mode when needed.
- **Fix:** In `nuke_run()`, guard the config_init call: only call it if logging is not already initialized (or pass the override as a function parameter rather than environment variable). Alternatively, save/restore `SCALPEL_MODE_OVERRIDE` inside `nuke_run()` before/after `config_init`, or move the override assignment to after the `config_init` call.

---

### C-03: bootloop.sh sanitization regex accepts negative numbers then increments them

- **Severity:** CRITICAL
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/bootloop.sh:42-43`
- **Category:** Shell Correctness / Data Integrity
- **Issue:** The BOOTCOUNT sanitization at line 42-43 uses `case "$BOOTCOUNT" in ''|*[!0-9-]*)` which accepts negative numbers (the `-` is intentionally included for the recovery marker -1). However, the pattern `*[!0-9-]*` allows strings like `--5`, `1-2-3`, or `-` alone. The recovery mechanism writes `BOOTCOUNT=-1` (line 78), which on next boot reads as `-1`, passes the case check, then increments to `0`. This flow is correct. But if the file is corrupt and contains something like `BOOTCOUNT=-99` (manually edited), the counter becomes `-98`, then `-97`, etc. -- it takes 101 boot cycles to reach the threshold of 3. This is a defense-in-depth concern.
- **Evidence:**
```sh
# bootloop.sh:42-43
case "$BOOTCOUNT" in
    ''|*[!0-9-]*) BOOTCOUNT=0 ;;
esac
```
- **Impact:** If the count file is corrupt with a large negative number, bootloop protection is effectively disabled for many cycles. The intended recovery marker is specifically `-1` but the regex allows any negative value.
- **Fix:** After the sanitization case, add a bounds check: `[ "$BOOTCOUNT" -lt -1 ] 2>/dev/null && BOOTCOUNT=0`. This ensures only the intentional `-1` recovery marker is accepted, and any other negative value resets to 0.

---

### C-04: post-fs-data.sh sources nuke.sh at top level but nuke_run() re-sources detect.sh, creating function name collisions

- **Severity:** CRITICAL
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/post-fs-data.sh:24` and `/home/claudetest/zero-mount/Scalpel/module/core/nuke.sh:51`
- **Category:** Shell Correctness
- **Issue:** `post-fs-data.sh` sources `nuke.sh` at line 24. Then `nuke_run()` inside nuke.sh re-sources `detect.sh` at line 51. But `detect.sh` defines the global variable `TAG="detect"` at its top level (line 7). After nuke_run() sources detect.sh, TAG is now "detect" -- but the caller (post-fs-data.sh) expects TAG to be "post-fs-data" for subsequent log calls. Line 26 of post-fs-data.sh reassigns TAG after the nuke_run call, but this is only safe because the developer was aware of the clobbering. The same TAG clobbering pattern exists in post_boot.sh (lines 116, 121, 128) where TAG is manually restored after each source. This is fragile -- any new source call that forgets to restore TAG will silently misattribute log messages.
- **Evidence:**
```sh
# post-fs-data.sh:24-26
. "${MODDIR}/core/nuke.sh"
nuke_run || log_w "post-fs-data" "nuke completed with failures"
TAG="post-fs-data"  # manual restore after TAG clobbering
```
- **Impact:** Not a runtime crash but a systemic fragility. Log messages may be attributed to wrong components if any future code change forgets the TAG reassignment. Combined with the re-sourcing pattern, this creates a maintenance nightmare.
- **Fix:** Each script's functions should use local TAG variables or pass TAG as a parameter. This is a design issue that should be documented as tech debt if not fixed now.

---

## High Findings (Fix Recommended)

### H-01: scanner.sh background icon extraction processes never error-checked

- **Severity:** HIGH
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/scanner.sh:163`
- **Category:** Error Handling
- **Issue:** `_extract_icon` is spawned as a background process with `&` for every scanned app. The `wait` at line 168 waits for all children but does NOT check exit codes. If the system runs out of file descriptors or memory from spawning hundreds of concurrent `unzip` processes, the failures are silent.
- **Evidence:**
```sh
_extract_icon "$apk" "$pkg" "$aapt" &
scanned=$((scanned + 1))
...
wait
```
- **Impact:** On devices with 400+ system apps, spawning 400 concurrent `unzip -p` and `aapt dump` processes may cause OOM kills during install. Icons are cosmetic, but the subprocess storm could crash the install.
- **Fix:** Add a concurrency limiter. For example, wait every N background processes: `[ $((scanned % 20)) -eq 0 ] && wait`. Or remove the `&` entirely since icon extraction is fast per-file.

---

### H-02: mode_mountify tmpfs mounts do not survive reboot -- no re-mount mechanism

- **Severity:** HIGH
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/modes/mode_mountify.sh:10`
- **Category:** Cross-Mode Consistency
- **Issue:** mode_mountify uses tmpfs mounts to hide app directories. tmpfs mounts are volatile -- they are lost on reboot. The tracking file `mountify_mounts.txt` records what was mounted, but there is no mechanism in post-fs-data.sh or nuke.sh to re-apply mountify debloats on reboot. When nuke.sh runs at boot, it calls detect_mode() which may return "mountify" again, then iterates nuke_list.json calling mode_debloat() for each package. So the re-mount DOES happen via the normal nuke.sh flow. This is actually fine -- but the verify at boot-completed may race with the nuke if post-fs-data was killed.
- **Evidence:**
```sh
# mode_mountify.sh:10 comment says:
# tmpfs doesn't survive reboot -- tracking file only needs to be valid within a boot cycle
```
- **Impact:** If mountify is selected but nuke.sh is killed at post-fs-data (KSU 10s timeout), the deferred rerun in post_boot.sh uses `SCALPEL_NUKE_TIMEOUT=0` (no timeout) and re-detects the mode. If the mode changes between post-fs-data and boot-completed (unlikely but possible if ZeroMount loads later), the verify will check the wrong mode. DOWNGRADED from CRITICAL because the re-mount flow via nuke.sh is actually correct for the normal case.
- **Fix:** Document this behavioral dependency clearly. The mountify tracking file should be cleared at the start of each boot cycle (add `rm -f "$_MF_TRACKING"` in mode_probe or at the top of post-fs-data.sh).

---

### H-03: uninstall.sh runs pm commands in a pipe subshell -- failure tracking is lost

- **Severity:** HIGH
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/uninstall.sh:31-34`
- **Category:** Error Handling
- **Issue:** The jq output is piped into `while read`, creating a subshell. Any variable mutations inside the while loop (tracking failures) would be lost. More importantly, `pm install-existing` and `pm enable` can fail silently in the subshell, and uninstall.sh does not track or report these failures. If PMS is not fully up when uninstall runs, apps may not be restored.
- **Evidence:**
```sh
"$_jq" -r '.[].package_name' "$NUKE_LIST" 2>/dev/null | while IFS= read -r pkg; do
    [ -z "$pkg" ] && continue
    pm install-existing "$pkg" >/dev/null 2>&1 || pm enable "$pkg" >/dev/null 2>&1
done
```
- **Impact:** Users who uninstall the module may not have their debloated apps restored. The pipe subshell means even if failure tracking was added, it wouldn't propagate. The `_log` function works (writes to kmsg) but individual package restoration failures are completely silent.
- **Fix:** Use the temp-file-then-read pattern (already used elsewhere in the codebase) instead of pipe. Write jq output to a temp file, then read it with `while read ... done < "$tmp"`. Add per-package failure logging.

---

### H-04: _config_source_safe regex can be bypassed with SCALPEL_ prefix followed by crafted payload

- **Severity:** HIGH
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/config.sh:39`
- **Category:** Security
- **Issue:** The safety regex is `'^(SCALPEL_[A-Z_]+="[^"]*"|[[:space:]]*$|#.*)$'`. This correctly rejects lines that don't match the pattern. However, the regex allows ANY content between double quotes as long as it doesn't contain a literal double quote. Values like `SCALPEL_FOO="$(cmd)"` would be rejected because `$` is just a character inside the value (no shell expansion happens in the value itself since printf writes it). BUT: the file is sourced with `. "$cfg"`, so the shell DOES expand `$()` inside double quotes during sourcing. The regex prevents `$(cmd)` because the `$` and `(` characters are allowed by `[^"]*`, but shell expansion happens when the file is sourced.

  Wait -- re-analyzing: the regex `[^"]*` matches everything except double-quote. So `SCALPEL_FOO="$(whoami)"` would match the regex (the content `$(whoami)` contains no double quotes). Then `. "$cfg"` sources it, and the shell expands `$(whoami)`.
- **Evidence:**
```sh
# This line passes the regex validation:
SCALPEL_FOO="$(id)"
# And when sourced, executes the `id` command

# config.sh:39
if grep -qvE '^(SCALPEL_[A-Z_]+="[^"]*"|[[:space:]]*$|#.*)$' "$cfg" 2>/dev/null; then
```
- **Impact:** If an attacker can write to `/data/adb/scalpel/config.sh`, they can inject arbitrary command execution via `$(...)` or backtick expansion inside the quoted value. The attacker already needs root to write to `/data/adb/`, so this is a privilege escalation within the module context rather than an external attack vector. Still a defense-in-depth concern.
- **Fix:** The regex should also reject `$`, backtick, and backslash characters inside the value: change `[^"]*` to `[^"$\x60\\]*` (where `\x60` is backtick). Or better: don't source the file at all -- parse it with `grep` and `cut` to extract key=value pairs, then use the dispatch functions. The `config_set()` function already sanitizes values via `tr -d`, but that doesn't help if the file is manually edited.

---

### H-05: whiteout_create uses bare `busybox` without fallback detection

- **Severity:** HIGH
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/whiteout_helpers.sh:31`
- **Category:** Error Handling / Cross-Mode
- **Issue:** `whiteout_create()` calls `busybox mknod` directly without first checking if busybox is available or resolving its path via `detect_busybox()`. The detect.sh module has a `detect_busybox()` function that searches multiple paths, but whiteout_helpers.sh assumes `busybox` is in PATH. On KSU/APatch, busybox is in `/data/adb/ksu/bin/busybox` which is in PATH during module scripts (due to BusyBox ash standalone mode). On Magisk, it's at `/data/adb/magisk/busybox`. Since all three managers run scripts in BusyBox ash standalone mode, `busybox` as a command should work. BUT: if standalone mode is somehow not active (e.g., direct invocation from WebUI bridge via `nsenter`), the bare `busybox` call could fail.
- **Evidence:**
```sh
if ! busybox mknod "$wo_path" c 0 0; then
    log_e "$TAG" "mknod failed: $wo_path"
    return 1
fi
```
- **Impact:** If the script is invoked outside BusyBox standalone mode (WebUI bridge, manual execution), mknod fails and all whiteout-based debloat fails. This affects mode_whiteout and mode_magisk.
- **Fix:** Either cache the busybox path from `detect_busybox()` and use it explicitly, or add a fallback: `busybox mknod ... 2>/dev/null || mknod ...` (stock toybox has mknod since Android 6).

---

### H-06: mode_mountify mode_verify checks emptiness with ls -A which races with PMS

- **Severity:** HIGH
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/modes/mode_mountify.sh:102`
- **Category:** Data Integrity / Race
- **Issue:** `mode_verify()` checks `[ -z "$(ls -A "$app_dir" 2>/dev/null)" ]` to confirm the tmpfs mount is empty. However, PMS or other system services could briefly create cache files or OAT directories inside the mounted tmpfs between the mount and the verify call, causing false negatives (verification says debloat is broken when it's actually working).
- **Evidence:**
```sh
mode_verify() {
    ...
    busybox mount | grep -qF " on ${app_dir} type tmpfs" || return 1
    [ -z "$(ls -A "$app_dir" 2>/dev/null)" ]
}
```
- **Impact:** Monitor daemon sees "broken" debloat, re-applies it (umount+remount), which could crash apps that were using files from the original mount. False positive verification failures trigger unnecessary repair cycles.
- **Fix:** Only check the mount presence, not directory emptiness. If tmpfs is mounted, the debloat IS working regardless of what's in the tmpfs. Change to: `busybox mount | grep -qF " on ${app_dir} type tmpfs"` as the sole check.

---

### H-07: detect.sh _probe_pm always runs `pm path android` at boot -- TOCTOU with mode selection

- **Severity:** HIGH
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/detect.sh:144-146`
- **Category:** Boot Stage
- **Issue:** `_probe_pm()` runs `pm path android` to test PMS availability. At post-fs-data, PMS is guaranteed to be unavailable, so pm mode correctly fails the probe and is not selected. However, the probe chain in `detect_mode()` calls `_probe_pm()` for every mode detection, even at post-fs-data. This is wasted work (pm will always fail there) and adds latency to the critical boot path. More importantly, if ALL other probes fail at post-fs-data and pm also fails, the mode is correctly set to empty and nuke.sh defers. But if this runs during the deferred rerun in post_boot.sh, the mode may have changed.
- **Evidence:**
```sh
_probe_pm() {
    pm path android >/dev/null 2>&1
}
```
- **Impact:** Minor performance impact at post-fs-data (pm command hangs briefly waiting for PMS). Not a correctness bug but a latency concern on the critical blocking boot path. KSU has a 10s timeout for post-fs-data -- wasting time on a pm probe that will always fail reduces the time available for actual debloat work.
- **Fix:** In detect_mode(), skip the pm probe if `getprop sys.boot_completed` is not "1". Or document that pm is intentionally last in the probe chain so this wasted call only happens if all 5 other modes fail.

---

### H-08: promote.sh _record_promotion does not deduplicate -- re-promoting an app creates duplicate entries

- **Severity:** HIGH
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/systemize/promote.sh:97-125`
- **Category:** Data Integrity
- **Issue:** `_record_promotion()` appends a new JSON object to the systemize_list.json array using jq `. + [...]`. If `promote_app()` is called twice for the same package (e.g., user clicks "promote" twice in WebUI), two entries for the same package are added to the list. `demote_app()` uses `select(.package_name != $pkg)` which removes ALL entries for the package, so demote handles duplicates correctly. But `is_promoted()` and the monitor check could behave unexpectedly with duplicates.
- **Evidence:**
```sh
_jq --arg pkg "$pkg" --arg name "$app_name" \
    --arg orig "$orig_path" --arg sys "$sys_path" \
    --arg date "$iso_date" \
    '. + [{...}]' \
    "$SYSTEMIZE_LIST" > "$tmp" 2>/dev/null
```
- **Impact:** Duplicate entries inflate the systemize_list, and the action.sh status display will show incorrect systemize counts. The monitor will also verify the same package multiple times per cycle.
- **Fix:** Before appending, check if the package already exists: `[. | del(.[] | select(.package_name==$pkg))] + [{...}]` or add a guard in `promote_app()` that checks `is_promoted` first.

---

## Medium Findings (Should Fix)

### M-01: customize.sh uses `local_count` variable without `local` declaration in global scope

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/customize.sh:66`
- **Category:** Shell Correctness
- **Issue:** `local_count` is used outside a function context. The `local` keyword only works inside functions. Here it's in the top-level script scope where `local` is a no-op or error depending on the shell.
- **Evidence:**
```sh
local_count=$(jq 'length' "$SCALPEL_DATA/app_list.json" 2>/dev/null)
```
- **Impact:** The variable name `local_count` looks like it was intended to be `local count` inside a function. It works because it's just a variable assignment (the name just happens to start with "local"), but it's confusing and suggests a copy-paste error.
- **Fix:** Rename to `_count` or `app_count` for clarity.

---

### M-02: customize.sh REMOVE variable construction may include leading newline

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/customize.sh:115-116`
- **Category:** Shell Correctness
- **Issue:** The REMOVE entries are built with a leading newline: `_remove_entries="${_remove_entries}\n${_d}"`. When REMOVE is first assigned, `_remove_entries` is empty, so the first entry has a leading newline. This produces `REMOVE="\n/system/app/YouTube\n/system/app/Bloatware"`. KSU/APatch process REMOVE by iterating lines, and an empty first line may cause `mknod "" c 0 0` which fails but is harmless.
- **Evidence:**
```sh
_remove_entries=""
for _d in $_candidates; do
    [ -d "$_d" ] || continue
    _remove_entries="${_remove_entries}
${_d}"
done
```
- **Impact:** Leading empty line in REMOVE could cause a benign error during KSU/APatch's REMOVE processing. The actual mknod on empty path fails silently. Minor cosmetic issue.
- **Fix:** Strip leading newline: `REMOVE="$(echo "$_remove_entries" | sed '/^$/d')"` or build without leading newline by checking if `_remove_entries` is empty before adding the separator.

---

### M-03: scanner.sh grep for package resolution is vulnerable to partial matches

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/scanner.sh:142`
- **Category:** Data Integrity
- **Issue:** `grep "$app_dir"` does a substring match against the cached pm output. If two apps share a path prefix (e.g., `/system/app/Chrome/` and `/system/app/ChromeCustomizations/`), the grep may match the wrong package.
- **Evidence:**
```sh
pkg=$(echo "$pm_cache" | grep "$app_dir" | sed 's/^package://;s/.*=//' | head -1)
```
- **Impact:** Wrong package name associated with an app directory. This could cause the wrong package to be debloated or the scanner to report incorrect metadata.
- **Fix:** Use `grep -F "${app_dir}"` with a trailing delimiter to ensure exact directory matches. Since pm output format is `package:/path/to/app.apk=com.package.name`, match `grep -F "${app_dir}"` is sufficient if `app_dir` ends with `/`, which it does from the glob pattern. Add `-F` for fixed string matching to avoid regex interpretation of dots in paths.

---

### M-04: log_f writes to kmsg twice (once via _log and once directly)

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/logging.sh:83-86`
- **Category:** Shell Correctness
- **Issue:** `log_f()` calls `_log 4 "FATAL" ...` which writes to kmsg, then also writes to kmsg directly on line 85. This produces two kmsg entries for every FATAL log.
- **Evidence:**
```sh
log_f() {
    _log 4 "FATAL" "$1" "$2"
    echo "${SCALPEL_LOG_TAG}: FATAL [${1}] ${2}" >> /dev/kmsg 2>/dev/null
}
```
- **Impact:** Duplicate FATAL entries in kernel log. Confusing when debugging. Not a correctness issue.
- **Fix:** Remove the second `echo` line -- `_log` already handles kmsg output.

---

### M-05: config_set() sanitization strips characters but does not validate value semantics

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/config.sh:138`
- **Category:** Security / Data Integrity
- **Issue:** `config_set()` strips shell metacharacters with `tr -d`, but does not validate that the value makes semantic sense for the key. For example, `config_set SCALPEL_LOG_LEVEL "not_a_level"` would succeed and write an invalid log level. `config_set SCALPEL_MONITOR_INTERVAL "abc"` would write a non-numeric interval.
- **Evidence:**
```sh
safe_value=$(printf '%s' "$value" | tr -d '`$"\\'"'" | tr -d '\n\r')
_config_dispatch_set "$key" "$safe_value" || ...
```
- **Impact:** Invalid config values could cause downstream failures: non-numeric interval causes `sleep "abc"` which fails immediately (monitor spins at 100% CPU), invalid log level defaults to "info" (harmless).
- **Fix:** Add per-key validation in `_config_dispatch_set()`: validate SCALPEL_LOG_LEVEL against known values, validate SCALPEL_MONITOR_INTERVAL is numeric and within bounds, validate SCALPEL_MODE_OVERRIDE against known mode names.

---

### M-06: detect.sh probe chain order differs from documented order

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/detect.sh:172`
- **Category:** Cross-Mode / Documentation
- **Issue:** The comment at detect.sh:4 says order is "zeromount > mountify > symlink > whiteout > magisk > pm". The actual probe loop at line 172 matches: `zeromount mountify symlink whiteout magisk pm`. This matches. BUT: DESIGN.md says the mode engine detects "zeromount|whiteout|mountify|symlink|magisk|pm" -- a different order (whiteout before mountify). The ARCHITECTURE.md says "ZeroMount? > ovl+tmpfs? > ovl? > magic? > pm?" which is yet another order.
- **Evidence:**
```sh
# detect.sh:172
for mode in zeromount mountify symlink whiteout magisk pm; do
```
- **Impact:** Documentation mismatch causes confusion for future developers. The actual code order is authoritative: zeromount > mountify > symlink > whiteout > magisk > pm.
- **Fix:** Update DESIGN.md and ARCHITECTURE.md to match the actual probe order in code.

---

### M-07: mode_whiteout mode_cleanup IFS tab handling uses printf subshell

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/modes/mode_whiteout.sh:101`
- **Category:** Shell Correctness
- **Issue:** Several mode scripts use `IFS="$(printf '\t')"` in the while-read construct. This spawns a subshell on every iteration (BusyBox ash). The nuke.sh and verify.sh files correctly use a literal tab character. The mode cleanup functions should use the same literal tab pattern for consistency and performance.
- **Evidence:**
```sh
# mode_whiteout.sh:101, mode_zeromount.sh:100, mode_mountify.sh:116, mode_symlink.sh:152
while IFS="$(printf '\t')" read -r pkg app_path; do
```
vs
```sh
# nuke.sh:138 (correct -- literal tab)
while IFS='	' read -r pkg app_path; do
```
- **Impact:** Minor performance overhead from printf subshell on each read iteration. Functionally correct.
- **Fix:** Replace `IFS="$(printf '\t')"` with a literal tab `IFS='	'` in all mode cleanup functions for consistency.

---

### M-08: post_boot.sh _post_boot_acquire race guard is not atomic

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/post_boot.sh:89-96`
- **Category:** Race Condition
- **Issue:** The exactly-once gate uses write-then-verify: write PID to flag file, then re-read and check if it's our PID. This has a TOCTOU (Time of Check, Time of Use) race: two processes could both write their PID, then both read the last writer's PID, causing one to win and one to lose. On Android, service.sh and boot-completed.sh should never run simultaneously for the same module (different root managers), and `post-fs-data.sh` clears the flag (line 6). The same pattern is used in monitor.sh's `_acquire_singleton()`.
- **Evidence:**
```sh
_post_boot_acquire() {
    [ -f "$_POST_BOOT_FLAG" ] && return 1
    echo "$$" > "$_POST_BOOT_FLAG" 2>/dev/null
    local written
    written="$(cat "$_POST_BOOT_FLAG" 2>/dev/null)"
    [ "$written" = "$$" ]
}
```
- **Impact:** In theory, if both service.sh (Magisk) and boot-completed.sh (KSU) somehow ran simultaneously, both might try to acquire the gate. In practice, service.sh on KSU/APatch exits at line 13 (`exit 0`), and boot-completed.sh on Magisk never fires. So the race window should not exist in practice.
- **Fix:** Accept as low risk. Could use `flock` for truly atomic locking, but that adds a busybox dependency to the boot path. The current pattern is sufficient for the actual execution model.

---

### M-09: nuke.sh calls _fix_vendor_symlinks for symlink mode but function is local to mode_symlink.sh

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/nuke.sh:170-171`
- **Category:** Error Handling
- **Issue:** After the debloat loop, nuke.sh has a case statement that calls `_fix_vendor_symlinks "${MODDIR}"` for the `symlink` case. But `_fix_vendor_symlinks` is defined in `mode_symlink.sh`, and nuke.sh already sourced `mode_script` (which is mode_symlink.sh for symlink mode). So the function IS available. However, for whiteout and magisk modes, nuke.sh sources `whiteout_helpers.sh` and calls `whiteout_fix_vendor_symlinks`. The asymmetry is confusing but functionally correct.
- **Evidence:**
```sh
case "$mode" in
    whiteout|magisk)
        . "${MODDIR}/core/whiteout_helpers.sh"
        whiteout_fix_vendor_symlinks "${MODDIR}"
        ;;
    symlink)
        _fix_vendor_symlinks "${MODDIR}"
        ;;
esac
```
- **Impact:** If mode_symlink.sh is refactored and `_fix_vendor_symlinks` is renamed or removed, nuke.sh would silently fail the vendor symlink fixup.
- **Fix:** Either move the vendor symlink fixup to a shared helper (whiteout_helpers.sh already has one) and use it for all three modes, or add a `type _fix_vendor_symlinks >/dev/null 2>&1 ||` guard.

---

### M-10: categories.json has com.android.vending as "essential" -- debatable classification

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/webroot/categories.json:72`
- **Category:** Data Integrity
- **Issue:** `com.android.vending` (Google Play Store) is classified as "essential". While many users depend on it, it is NOT essential for system stability -- devices without Google Play work fine. This is a Google app and should be classified as "google" to match the other Google ecosystem apps.
- **Evidence:**
```json
"com.android.vending": "essential",
```
- **Impact:** Users who want to remove the Play Store are prevented from doing so by the "essential" safety classification. The Play Store is debatable but not system-critical.
- **Fix:** Reclassify `com.android.vending` as "google" (consistent with other Google ecosystem apps).

---

### M-11: categories.json has com.android.stk as "caution" -- misplaced between safe entries

- **Severity:** MEDIUM
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/webroot/categories.json:345`
- **Category:** Data Integrity
- **Issue:** `com.android.stk` (SIM Toolkit) is classified as "caution" but is placed in the middle of the "safe" section in the JSON file. While the classification is correct (SIM Toolkit is needed for some carrier operations), its placement between safe entries may confuse maintainers reviewing the file.
- **Evidence:**
```json
"com.android.providers.userdictionary": "safe",
"com.android.stk": "caution",
"com.android.wallpaper.livepicker": "safe",
```
- **Impact:** Maintainability concern only. The JSON structure doesn't require ordering, but visual organization matters for human review.
- **Fix:** Move to the caution section or add a comment.

---

## Low/Info Findings (Nice to Have)

### L-01: action.sh _jq function spawns a new process for every jq call

- **Severity:** LOW
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/action.sh:11-15`
- **Category:** Performance
- **Issue:** The `_jq()` wrapper resolves the jq binary path on every call. In `_print_status()`, it's called 7 times, each time checking if `$jq_bin` exists. Should cache the path.
- **Fix:** Resolve once at script start and cache in a variable.

---

### L-02: module.prop has actionIcon and webuiIcon commented out with different paths

- **Severity:** LOW
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/module.prop:8-9`
- **Category:** Documentation
- **Issue:** The commented-out icon paths reference `webroot/assets/icon.png` which does not exist yet. When WebUI is built, these need to be uncommented and the icon created.
- **Fix:** Ensure the icon file is created during WebUI development, then uncomment the properties.

---

### L-03: DESIGN.md file structure shows monitor.sh at module root, but it's in core/

- **Severity:** LOW
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/docs/DESIGN.md:124`
- **Category:** Documentation
- **Issue:** DESIGN.md shows `monitor.sh` at the module root level. The actual file is at `core/monitor.sh`.
- **Fix:** Update DESIGN.md file structure to show `core/monitor.sh`.

---

### L-04: DESIGN.md file structure missing several files (boot-completed.sh, post_boot.sh, default_debloat.sh)

- **Severity:** LOW
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/docs/DESIGN.md:99-136`
- **Category:** Documentation
- **Issue:** DESIGN.md file structure is outdated. Missing: `boot-completed.sh`, `core/post_boot.sh`, `core/nuke.sh`, `core/default_debloat.sh`, `core/whiteout_helpers.sh`, `core/monitor.sh`. Also missing `action.sh`.
- **Fix:** Update the file structure diagram to reflect all actual files.

---

### L-05: DESIGN.md shows dummy_zip/ directory which does not exist

- **Severity:** LOW
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/docs/DESIGN.md:133-135`
- **Category:** Documentation
- **Issue:** The file structure lists `dummy_zip/` with `module.prop` and `customize.sh` for "indirect nuke trigger for Magisk". This directory was never implemented.
- **Fix:** Remove from DESIGN.md or implement if still needed.

---

### L-06: ARCHITECTURE.md does not mention boot-completed.sh stage

- **Severity:** LOW
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/docs/ARCHITECTURE.md:62`
- **Category:** Documentation
- **Issue:** The boot sequence in ARCHITECTURE.md only shows "BOOT (service, after boot_completed)" but does not mention the boot-completed.sh stage for KSU/APatch or the post_boot.sh shared helper.
- **Fix:** Update the boot sequence to show the KSU/APatch boot-completed.sh path and the shared post_boot.sh.

---

### L-07: detect.sh _find_tmpfs_dir checks /mnt/vendor, /mnt, /dev but not /dev/.scalpel

- **Severity:** INFO
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/detect.sh:63-68`
- **Category:** Cross-Mode
- **Issue:** The tmpfs directory finder checks `/mnt/vendor`, `/mnt`, `/dev` for writability. On some Samsung devices, these directories may not be writable at post-fs-data. Using `/dev/.scalpel_test` (which mode_mountify.sh already does at line 19) might be more reliable.
- **Fix:** Minor robustness improvement. Current code handles the failure case (returns 1).

---

### L-08: whiteout_helpers.sh whiteout_remove should verify the file is actually a char device before rm

- **Severity:** INFO
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/module/core/whiteout_helpers.sh:48-57`
- **Category:** Data Integrity
- **Issue:** `whiteout_remove()` calls `rm -f` on the whiteout path without verifying it's a char device (`-c`). If something else exists at that path (directory, regular file), `rm -f` would fail silently on a directory or remove a legitimate file.
- **Fix:** Add `[ -c "$wo_path" ] && rm -f "$wo_path" || rm -rf "$wo_path"` or guard with a type check.

---

### L-09: ARCHITECTURE.md constraint says "busybox missing = Hard fail" but bootloop.sh has zero busybox dependencies

- **Severity:** INFO
- **File:Line:** `/home/claudetest/zero-mount/Scalpel/docs/ARCHITECTURE.md:188`
- **Category:** Documentation
- **Issue:** The constraint says "busybox (required)" but bootloop.sh explicitly has "ZERO external dependencies: no busybox, no jq, no logging.sh" (bootloop.sh:3). And mode_pm requires no busybox either. The module CAN partially function without busybox (bootloop protection + pm mode fallback).
- **Fix:** Clarify that busybox is required for filesystem-based modes but not for core safety or pm fallback.

---

## Cross-Cutting Observations

### Shell Correctness Assessment
- **POSIX compliance:** Good. No `[[ ]]`, no bash arrays, no process substitution. All arithmetic uses `$(( ))`. All variables quoted.
- **local keyword:** Used consistently inside functions. ash supports it.
- **String operations:** All use POSIX `${var%%pattern}`, `${var##pattern}`.
- **One issue:** printf subshell in IFS assignment in 4 mode scripts (M-07).

### Boot Stage Compliance Assessment
- **post-fs-data.sh:** No `setprop`, no `pm` commands. Correct.
- **service.sh:** Polls `sys.boot_completed` before proceeding. Correct.
- **boot-completed.sh:** Only fires on KSU/APatch. Correct.
- **KSU 10s timeout:** Handled via SCALPEL_NUKE_TIMEOUT. Correct.
- **One concern:** pm probe in detect_mode adds latency at post-fs-data (H-07).

### Security Assessment
- **No eval anywhere.** Good.
- **Config sourcing:** _config_source_safe has a bypass via `$(...)` expansion (H-04).
- **Temp files:** All use PID-unique names (`$$`). No predictable temp filenames.
- **Atomic writes:** Consistently used tmp+mv pattern throughout.

### Data Integrity Assessment
- **status.json:** Always written atomically via tmp+mv. Validated before reading.
- **nuke_list.json:** Validated via jq before processing. Good.
- **config.sh:** Atomic writes, backup/restore. Good.
- **One concern:** promote.sh duplicate entries (H-08).

### Error Handling Assessment
- **Every source call:** Most have fallback (`|| log_w`). Good.
- **Every jq call:** Fallback to PATH jq. Good (assuming jq exists -- see C-01).
- **Exit codes:** Consistent 0/1 everywhere. Good.
- **Lock files:** nuke.lock present, monitor singleton present. Good.

### Cross-Mode Consistency Assessment
- All 6 modes implement: `mode_probe()`, `mode_debloat()`, `mode_restore()`, `mode_verify()`, `mode_cleanup()`. **Consistent.**
- All modes handle idempotent calls (check-before-act). Good.
- All modes with overlay state clean up overlay dirs in `mode_cleanup()`. Good.
- Vendor symlink fixup runs for whiteout, magisk, and symlink modes. Good.
- mountify and zeromount have no overlay dirs to clean. Correct.
- pm mode cleanup re-enables disabled packages. Correct.

---

## SHIP/NO-SHIP Recommendation

### Verdict: **NO-SHIP** (conditional -- 4 critical fixes required)

### Required Fixes for Ship-Readiness:

| Priority | ID | Title | Estimated Effort |
|----------|-----|-------|-----------------|
| BLOCKER | C-01 | Fix bin/ deletion destroying jq binary for boot | 5 minutes |
| BLOCKER | C-02 | Prevent config_init from clobbering forced mode override in deferred debloat | 15 minutes |
| BLOCKER | C-03 | Bound-check negative BOOTCOUNT values | 2 minutes |
| RECOMMENDED | H-04 | Harden config source safety regex against $() expansion | 10 minutes |
| RECOMMENDED | H-01 | Add concurrency limiter to scanner icon extraction | 5 minutes |
| RECOMMENDED | H-03 | Fix uninstall.sh pipe subshell pattern | 10 minutes |
| RECOMMENDED | H-05 | Add busybox fallback to whiteout_helpers mknod | 5 minutes |
| RECOMMENDED | H-06 | Fix mode_mountify verify to only check mount presence | 2 minutes |
| RECOMMENDED | H-08 | Add dedup guard to promote.sh _record_promotion | 5 minutes |

**After C-01 through C-03 are fixed, the module is ship-ready** for beta testing. The HIGH items should be fixed before general availability. C-04 (TAG clobbering) is documented tech debt that should be addressed in a future refactor.

**Total estimated fix time: ~60 minutes for all blockers + recommended.**

---

## Appendix: Files Audited

| # | File | Lines | Verdict |
|---|------|-------|---------|
| 1 | post-fs-data.sh | 29 | PASS (with C-04 noted) |
| 2 | service.sh | 28 | PASS |
| 3 | boot-completed.sh | 11 | PASS |
| 4 | customize.sh | 158 | FAIL (C-01) |
| 5 | uninstall.sh | 51 | WARN (H-03) |
| 6 | action.sh | 130 | PASS |
| 7 | core/config.sh | 179 | WARN (H-04, M-05) |
| 8 | core/logging.sh | 87 | WARN (M-04) |
| 9 | core/bootloop.sh | 93 | FAIL (C-03) |
| 10 | core/detect.sh | 184 | WARN (H-07) |
| 11 | core/scanner.sh | 189 | WARN (H-01, M-03) |
| 12 | core/nuke.sh | 192 | FAIL (C-02) |
| 13 | core/verify.sh | 162 | PASS |
| 14 | core/whiteout_helpers.sh | 82 | WARN (H-05) |
| 15 | core/default_debloat.sh | 82 | PASS |
| 16 | core/monitor.sh | 181 | PASS |
| 17 | core/post_boot.sh | 136 | WARN (C-04, M-08) |
| 18 | modes/mode_pm.sh | 82 | PASS |
| 19 | modes/mode_whiteout.sh | 116 | WARN (M-07) |
| 20 | modes/mode_zeromount.sh | 108 | PASS |
| 21 | modes/mode_magisk.sh | 140 | PASS |
| 22 | modes/mode_mountify.sh | 140 | WARN (H-02, H-06) |
| 23 | modes/mode_symlink.sh | 167 | WARN (M-07) |
| 24 | systemize/promote.sh | 194 | WARN (H-08) |
| 25 | systemize/permissions.sh | 139 | PASS |
| 26 | module.prop | 10 | PASS |
| 27 | webroot/categories.json | 786 | WARN (M-10, M-11) |

**Total lines audited: ~3,485 lines of shell + 786 lines of JSON + ~1,500 lines of documentation**
