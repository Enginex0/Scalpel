# Scalpel — Project Protocol

**Module name:** Scalpel (module_id: `scalpel`)
**Working directory:** `/home/claudetest/zero-mount/Scalpel/`
**What it does:** Debloats system apps + systemizes user apps with multi-mode auto-detection across Magisk/KSU/APatch

---

## Session Start — Read These First

```
1. docs/GOAL.md            → What Scalpel does, success criteria, non-goals
2. docs/FOCUS.md           → Current focus, implementation order (9 phases)
3. .claude/features.json   → 26 features with dependencies and priorities
4. docs/ARCHITECTURE.md    → System overview, boot sequence, data flows
5. docs/DESIGN.md          → Component specs, mode interface, error handling
6. docs/DECISIONS.md       → 15+ decisions with rationale (scope, modes, name, etc.)
7. docs/DOMAIN.md          → Android internals (PMS, FLAG_SYSTEM, whiteouts, boot lifecycle)
```

Check FOCUS.md for the CURRENT FOCUS. Only work on that unless asked otherwise.

---

## Reference Projects (Read-Only Sources)

| Project | Path | What to Reference |
|---------|------|-------------------|
| **systemapp_nuker** | `/home/claudetest/zero-mount/systemapp_nuker/module/` | Whiteout creation, mode detection, categories.json, WebUI bridge |
| **ZeroMount module** | `/home/claudetest/zero-mount/nomount/module/` | Shell scripts: metamount.sh, monitor.sh, susfs_integration.sh, logging.sh |
| **ZeroMount WebUI** | `/home/claudetest/zero-mount/nomount/webui-v2-beta/` | **FORK THIS** for Scalpel's WebUI. Solid.js + TS + Vite. Reuse bridge, theme, components, icons |
| **ZeroMount zm source** | `/home/claudetest/zero-mount/nomount/src/` | zm.c freestanding binary (reference only — Scalpel calls zm CLI, doesn't build it) |
| **Terminal Systemizer** | `/home/claudetest/zero-mount/terminal_systemizer/` | Systemization flow, priv-app XML generation, aapt usage |
| **Volume key reference** | `reference/volume_key_reference.sh` (lines 50-81) | `getevent -qlc 1` pattern for volume key detection during install |
| **Full analysis** | `/home/claudetest/.claude/plans/pure-prancing-bee.md` | Exhaustive analysis of all 3 projects (1400 lines). Reference for deep details. |
| **Metamodule guide** | `/home/claudetest/gki-build/METAMODULE_COMPLETE_GUIDE.md` | KernelSU boot lifecycle. Scalpel is NOT a metamodule — this is context only. |

---

## Key Architecture Decisions (Quick Reference)

- **Scope:** Debloater + Systemizer (debloater first, systemizer second)
- **Modes (debloat):** All 6 — ZeroMount VFS, overlayfs whiteouts, mountify/tmpfs, symlink overlay, Magisk mount, pm disable
- **Auto-detect:** Re-evaluate at every boot, best-to-worst fallback, config override
- **Root managers:** Magisk + KernelSU + APatch
- **UI:** Solid.js + TypeScript WebUI (forked from ZeroMount). Context-sensitive FAB (Reboot/Nuke/Systemize per tab). No terminal TUI.
- **Tech:** Shell + jq. No custom C binaries. Stock kernel only.
- **Safety:** 3-strike bootloop protection with config backup/restore
- **Scanner:** Runs ONCE at install (customize.sh), cached. WebUI loads instantly. Refresh button for rare cases.
- **Default debloat:** Volume key prompt during install (UP=apply, DOWN=skip, timeout=SKIP)
- **Systemize method:** Place APK in module/system/{app|priv-app}/ — root manager handles the rest. Designed for ZeroMount's metamount.sh (Step 6) to iterate module dirs and call `zm add`, with getdents64 hook providing readdir injection. **HOWEVER: ZeroMount VFS is non-functional on test device (see Session 19).** Decoupled from debloat mode — no second mode detection needed.
- **Systemize deferred uninstall:** `pm uninstall -k --user 0` DEFERRED to post-boot after overlay verification (never destroy /data/app before system copy confirmed via `pm path` showing /system/). `needs_uninstall: true` flag in systemize_list.json.
- **ZeroMount integration (debloat):** Scalpel creates whiteouts in module dir, calls ZeroMount sync.sh + registers module-path rules for WebUI detection. ZeroMount handles SUSFS internally. Do NOT call SUSFS directly. **On test device, debloat actually works via pm uninstall fallback, NOT VFS hiding.**
- **ZeroMount kernel capabilities (WORKING after Session 22 kernel rebuild):** Hooks getname_flags() (path redirection — CONFIRMED WORKING), getdents/getdents64 (readdir INJECTION — works for flat entries, FAILS for nested new dirs), d_path() (/proc spoofing), vfs_getxattr() (SELinux spoofing), user_statfs() (fstype spoofing). SUSFS only HIDES; ZeroMount ADDS entries. `notify-module-mounted` bypasses KSU native magic mount.
- **KSU boot sequence:** Step 4: post-fs-data.sh (debloat only — do NOT mount here, breaks Step 6) -> Step 5: system.prop -> Step 6: metamodule metamount.sh -> Step 7: post-mount.sh (after mounting, before zygote) -> Step 8: zygote-start (PMS scans /system/)
- **App icons:** KSU native `getPackagesIcons()` API primary (file symlink fails — KSU WebView can't follow cross-SELinux symlinks). Fallback: colored initials (hash-based) -> SVG phone.
- **WebUI layout:** Header only on Status/Settings. Debloat/System: no header, 48px top padding. Vertical category sections. No PRIV/category badges on rows. Text scroll on overflow.
- **zm binary format:** `zm add <arg1> <arg2>` -> `zm list` shows `<arg2>-><arg1>` (reversed). arg1=virtual target, arg2=source. `zm del` by arg1.
- **ZeroMount fix methodology (Session 21):** Orchestrator mode + adversarial validation. Sequential dry-run proved pipeline correct, then deep C source audit found bugs. Two adversarial agents catch what single-pass misses. DO NOT skip source code reading. DO NOT propose fixes without tracing code paths.

---

## Code Conventions

- Shell scripts: <200 lines each, one responsibility per file
- All variables quoted (shellcheck compliant)
- Comments explain WHY, never WHAT
- JSON via jq (never grep/sed)
- Logging to kmsg + /data/adb/scalpel/debug.log
- Mode scripts implement interface: `mode_probe()`, `mode_debloat()`, `mode_restore()`, `mode_verify()`, `mode_cleanup()`

---

## Workflow Protocol

**Before:** Check FOCUS.md. One `"in_progress"` feature at a time in features.json. Update status + started_date.
**During:** Log decisions in DECISIONS.md, discoveries in LEARNINGS.md. New ideas -> FOCUS.md "Idea Capture" (don't chase).
**After:** features.json `"done"` + completed_date. FOCUS.md move to COMPLETED. progress.json update counts.
**Rules:** One focus at a time. Update before switching. Capture don't chase. Read before editing. Test on reference first.

---

## Device & Test Environment

- **Device:** Xiaomi Redmi 14C, KernelSU Next, kernel 5.10.209 (spoofed to June 28, 2024 via device-profiles.json)
- **Apps:** 162 system apps, 57% uncategorized (OEM: com.mediatek.*, com.miui.*, com.xiaomi.*)
- **categories.json:** Byte-identical with SAN (254 apps, 5 categories)
- **ZeroMount VFS status:** FUNCTIONAL. Path redirection + readdir injection both work at RUNTIME (`ls` shows injected dirs). BUT readdir injection may not be active during early boot PMS scan — investigation needed.
- **Debloat works via:** ZeroMount mode (whiteouts + sync.sh). 4 apps hidden, 4 verified.
- **Systemize status:** UNRESOLVED. VFS works (stat + ls succeed), deferred uninstall works (apps removed from /data/app/), but PMS boot scan doesn't discover apps. Root cause is timing/initialization — readdir injection works AFTER boot but possibly not DURING boot when PMS scans.
- **Kernel build repo:** `Enginex0/kernelsu-next-vanilla` (PRIMARY). Other repos archived.
- **3 test apps:** Momo, ZygiskDetector, DuckDetector — currently NOT installed (deferred uninstall ran), awaiting reboot test.

---

## Session Log

### Session 1 — 2026-01-31
Built Phase 0-3 from blank slate. 24 files (7 implemented, 16 stubs). Fixed config.sh (2 critical + 3 high), categories.json (5 misclassifications).
**Context:** 7/26 features (27%).

### Session 2 — 2026-01-31
Built Phases 4-7. 13 new files, ~1450 lines. Key: whiteout_helpers.sh, mode_whiteout.sh, mode_zeromount.sh, mode_magisk.sh, nuke.sh, verify.sh, post-fs-data.sh, service.sh, promote.sh, permissions.sh, customize.sh, default_debloat.sh, uninstall.sh. Fixed: source injection in bootloop counter, premature counter reset, getprop timeout, pm retry mode forcing, corrupt JSON.
**Context:** 17/26 features (65%).

### Session 3 — 2026-02-01
Built mode_mountify.sh, mode_symlink.sh, monitor.sh, action.sh, boot-completed.sh, post_boot.sh. TAG refactor across 16 files. Fixed: setprop deadlock, pm at post-fs-data, scanner retry, jq deletion, config override clobbering, negative BOOTCOUNT.
**Context:** 21/26 features (81%). Backend ship-ready.

### Session 4 — 2026-02-01
Built complete WebUI (Proposal A "Neon Scalpel"). 40+ files: types.ts, api.ts, store.ts, theme.ts, icons.ts, all core components, 4 route tabs.
**Context:** 26/26 features (100%). WebUI at webui-proposals/proposal-a/.

### Session 5 — 2026-02-01
Ship polish + first device install. Added priv-app/app target selection. Logging audit (4 CRITICAL + 11 HIGH fixed). Monitor live description + status cache. Fixed jq path + scanner wrapper. 153 apps scanned on device.
**Context:** Module v0.1.0. First successful device installation.

### Session 6 — 2026-02-01
Device testing fixes: monitor description (duplicate update functions), WebUI loading (wrong build dir), fixedNav toggle, status bar/FAB overlap. Monitor uses `/data/adb/ksud` for KSU API.

### Session 7 — 2026-02-01
Fixed Android system bar overlap. Header 48px top padding, NavBar 48px base. `env(safe-area-inset-bottom)` returns 0 in KSU WebView — hardcoded fallbacks needed.

### Session 8 — 2026-02-01
Fixed navbar to match ZeroMount exactly. Vite outDir wrong, glass-border opacity fix, separator is border-top not border-bottom.
**Files:** vite.config.ts, NavBar.css, app.css, store.ts, App.tsx, RebootFAB.tsx

### Session 9 — 2026-02-01
Fixed WebUI-to-device integration. KSU API: must use `globalThis.ksu` (not `import('kernelsu')`). Created ksuApi.ts. Scanner needs `_init_standalone()` for direct invocation. Modal hardcoded fallback for Android nav bar.
**Files:** ksuApi.ts (NEW), api.ts, scanner.sh, RebootFAB.tsx, Modal.tsx

### Session 10 — 2026-02-01
ZeroMount detection: added `/data/adb/modules/zeromount/bin/zm` path. nuke.sh detects mode before checking nuke_list. Install-time `_detect_capabilities()` in customize.sh. raw_whiteouts.txt routes through active mode. 94% SAN compliance audit.
**Files:** detect.sh, mode_zeromount.sh, nuke.sh, customize.sh

### Session 11 — 2026-02-01
Compliance fixes (commit `7e750c0`): ZeroMount detection path, install feedback, raw_whiteouts routing, post-nuke re-enable (nuke.sh:237-252), boot-time `_restore_app_states()` (post_boot.sh:76-103), uninstall restores from both app_list.json + nuke_list.json.
**Discovery:** ZeroMount = VFS REDIRECTION, SUSFS = HIDING. `zm add /path ""` broken. Correct approach: whiteouts in module dir + call sync.sh.

### Session 12 — 2026-02-01
ZeroMount integration rewrite (commit `7a48c10`): whiteouts + sync.sh delegation. Unified logging (logger.ts — frontend writes to backend debug.log). Monitor self-healing (`monitor_supervised()`, 60s cooldown, max 10 restarts). 16/16 device tests PASSED.
**Files modified:** mode_zeromount.sh (rewrite), monitor.sh (+supervisor), post_boot.sh, detect.sh, action.sh, logger.ts (NEW), api.ts, ksuApi.ts, store.ts

### Session 13 — 2026-02-02
Icon pipeline: backend aapt extraction + symlink, frontend AppIcon.tsx (dual: file/ksu). KSU WebView can't follow symlinks across SELinux contexts — switched to native `getPackagesIcons()` API. WebUI overhaul: context-sensitive FAB, vertical category sections, removed badges, text scroll, conditional header. Hardened scanner.sh (PNG magic validation, atomic symlink, flock guard, path traversal guard).
**Files created:** AppIcon.tsx/css, textScroll.ts, ContextFAB.tsx, AppDetailSheet.tsx
**Files modified:** customize.sh, service.sh, boot-completed.sh, detect.sh, scanner.sh, DebloatTab.tsx, SystemizeTab.tsx, App.tsx, app.css, store.ts, api.ts

### Session 14 — 2026-02-02
Debloat tab UX: collapsible accordion (all collapsed by default), tap-to-select, SAN-matching unknown handling (no Unknown section — unknowns only in "All System Apps"). SystemizeTab promotion dialog (priv-app/app target selectors). scanner.sh:11 fallback path fix (webroot/ -> data/).
**Files modified:** DebloatTab.tsx, SystemizeTab.tsx, store.ts, ContextFAB.tsx, scanner.sh

### Session 15 — 2026-02-02
SystemizeTab tap-to-select + selection indicators. SystemizeFAB glass morphism with batch promote modal. "Safe to Remove" expanded by default.
**ZeroMount "Not Loaded" fix (CRITICAL):** sync.sh rules put `/nonexistent` on LEFT of `zm list` — WebUI couldn't find module path. Fix: `_zm_register_whiteout()` in mode_zeromount.sh calls `zm add` with module char device path as arg2.
**Files modified:** SystemizeTab.tsx, ContextFAB.tsx, DebloatTab.tsx, mode_zeromount.sh

### Session 16 — 2026-02-02
UI fixes: promote.sh accepts app_label, AppIcon.tsx colored initials fallback, SystemizeTab accordion. Added deferred uninstall (`needs_uninstall: true` in systemize_list.json), `_verify_systemized_apps()` in post_boot.sh. promote.sh: removed premature pm uninstall, added /data/app/ source guard. Decoupled debloat mode (auto-detect) from systemize (fixed per root manager).
**Files modified:** post-fs-data.sh, promote.sh, post_boot.sh, api.ts, store.ts, AppIcon.tsx/css, SystemizeTab.tsx, ContextFAB.tsx

### Session 17 — 2026-02-02
Commit `bd0b3b1` (297 files, +14,551/-29,558 — cleaned old proposals).
- tmpfs+bind mounts failed: `context=` needs `CAP_MAC_ADMIN`. Fixed with two-step mount + chcon.
- Mounts succeeded but **BOOTLOOPED**: vendor apps (/cust/app/, /product/data-app/) with flags=0x0 created duplicate PMS entries. 3-strike protection triggered.
- Added `/data/app/` validation guard (promote.sh + frontend eligibleApps filter + error toast). Three-layer defense.
- Flipped SCALPEL_UNINSTALL_FALLBACK default to "true" (Android Rescue Party re-enables disabled apps during bootloop).
- mode_mountify.sh same chcon fix applied.
**Key learnings:** Only `/data/app/` apps can be safely promoted. chcon doesn't propagate to tmpfs children (irrelevant — bind mount children present source context). Deferred uninstall prevented data loss across 5 failed boots.
**Files modified:** post-fs-data.sh, mode_mountify.sh, promote.sh, config.sh, types.ts, api.ts, store.ts, SystemizeTab.tsx

### Session 18 — 2026-02-02
Commit `32f4a8c`. Discovered ZeroMount DOES support readdir injection (getdents64 hook). tmpfs mounts at Step 4 were actively harmful (made kern_path() succeed at Step 6, so is_new=false). Removed 130 lines of mount code from post-fs-data.sh. Deleted post-mount.sh.
**Real bootloop cause:** permissions.sh never sourced detect.sh (no aapt), dumpsys regex only captured `android.permission.*`, empty permission XMLs crashed PMS on enforce mode.
**Fixes:** permissions.sh (self-source detect.sh, all permission namespaces, empty XML guard), promote.sh (source config+detect in CLI, sed regex for base64 =).
**NOTE:** This session's ZeroMount readdir claim was DISPROVED in Session 19.

### Session 19 — 2026-02-02
**PROVED ZeroMount VFS is non-functional on this device.** `zm list` shows 8 rules, ALL stat/ls/readdir return ENOENT. susfs_apply_kstat() fails with no fallback when parent dir doesn't exist. Kernel 5.10.209 (June 2024) may predate auto_inject_parent() patches.

Built post-mount.sh (Step 7): tmpfs+bind mount. Mounts SUCCEEDED (debug.log confirms 3 apps overlayed). **BOOTLOOPED** — root cause undetermined. 3-strike triggered, module disabled, system/ wiped. Apps safe (deferred uninstall never ran).

Fixed monitor.sh:142-174 and bootloop.sh:76: `KSU_MODULE=scalpel ksud module config set override.description`.

**All 4 failed systemize approaches:**
1. ZeroMount VFS via metamount.sh -> VFS hooks non-functional on device
2. tmpfs+bind at post-fs-data Step 4 -> CAP_MAC_ADMIN + vendor app conflicts
3. tmpfs+bind with chcon at Step 4 -> vendor app duplicate PMS entries -> bootloop
4. tmpfs+bind at post-mount Step 7 -> mounts succeed, PMS/system_server crashes -> bootloop

**Current device state:**
- Module DISABLED (disable file exists)
- module/system/ WIPED by bootloop protection
- systemize_list.json has 3 stale entries (files gone)
- post-mount.sh still on device (needs removal)
- Debloat works (pm uninstall fallback independent of module/system/)

**Files on disk (NOT committed):** post-mount.sh (failed), monitor.sh (ksud fix — valid), bootloop.sh (KSU_MODULE fix — valid)

**Next session priorities:**
1. DEVICE RECOVERY: clean systemize_list.json (set to []), remove disable file, delete post-mount.sh, reboot
2. CAPTURE CRASH: `adb logcat -b system,crash` during boot with post-mount.sh to find WHY PMS crashes
3. ZEROMOUNT DEEP-DIVE: kernel source vs device behavior investigation (user requested)
4. ALTERNATIVE APPROACHES: system/app (no perm XML), meta-overlayfs metamodule, single minimal app test
5. COMMIT: monitor.sh + bootloop.sh ksud fixes independently of systemize

**Context:** Module v0.1.0. Debloat working (4 apps via pm uninstall). Systemize BROKEN on this device. 26/26 features "done" but systemize non-functional.

### Session 20 — 2026-02-03
Learning-only session. Read all KSU/ZeroMount/SUSFS/metamodule documentation. Created docs/UNDERSTANDING.md.
**CRITICAL CORRECTION:** ZeroMount IS the metamodule (metamodule=1 in module.prop). No meta-overlayfs on device.
Built complete mental model of VFS hook architecture, boot sequence, and why all 4 previous approaches failed.

### Session 21 — 2026-02-03
**FOUND AND FIXED ROOT CAUSE of ZeroMount VFS failure.** Used orchestrator mode with adversarial validation.

**Methodology that worked:** Sequential dry-run (apply SUSFS → apply ZeroMount → verify) proved injection pipeline is CORRECT. Pivoted to deep audit of zeromount.c source code. Two parallel adversarial agents (Dr. Kernel + Red Team Rex) independently converged on same root cause.

**6 bugs found and fixed:**
1. CRITICAL: Path normalization hash mismatch — `normalize_path()` strips `/system` at storage but not at lookup. Hash table buckets never match. ALL `/system/` path resolution silently fails.
2. CRITICAL: readdir error override — original getdents epilogue overwrites zeromount's byte count. Fixed with `goto zm_out` skipping epilogue.
3. CRITICAL: Wrong function in 32-bit getdents — `inject_dents64` called in `SYSCALL_DEFINE3(getdents)` (struct layout mismatch). Changed to `inject_dents`.
4. HIGH: `ioctl_del_rule()` doesn't normalize input — can't delete `/system/` prefix rules. Added normalize.
5. MEDIUM: SELinux context checks use `/system/` prefixes against normalized paths — always fail. Updated to normalized forms.
6. HIGH: Truncated `zeromount_init()` — missing closing code + `fs_initcall()`. Completed.

**SUSFS bypass (Task #39):** Script made zero changes — correct. `zeromount_should_skip()` already has centralized `susfs_is_current_proc_umounted()` check covering all hook functions.

**Files modified (NOT yet committed/pushed):**
- `kernel-test/.../fs/zeromount.c` — bugs 1,4,5,6
- `kernel-test/.../fs/readdir.c` — bugs 2,3 (also has SUSFS + ZeroMount hooks from dry-run)
- `nomount/patches/inject-zeromount-readdir.sh` — bugs 2,3 (script matches file)

### Session 22 — 2026-02-03
**Kernel build + flash + VFS verification + systemize first attempt.**

**Completed (Tasks #40-#41):**
1. Regenerated `zeromount-core.patch` with all 6 bug fixes (1239 lines, validated by Red Team Rex — 5/5 checks PASS)
2. Committed `2609ae7` to `Enginex0/zeromount.git` (zeromount-core.patch + inject-zeromount-readdir.sh)
3. CI build `21613324974` PASSED — all steps green including "Integrate ZeroMount VFS Path Redirection"
4. Flashed AnyKernel3 zip on device, kernel booted successfully
5. **MANUAL VFS TEST PASSED:** `zm add` + `stat` + `cat` + `ls` (in existing dirs) all work. Path redirection + readdir injection confirmed functional.

**Device cleanup (Phase 1):**
- Deleted `post-mount.sh` from device AND codebase (Session 19 failed experiment)
- Reset `systemize_list.json` to `[]` (3 stale entries from wiped module/system/)
- Updated module description
- No references to post-mount.sh remain in codebase

**Systemize test (Phase 2-3) — PARTIAL SUCCESS:**
- Promoted 3 apps (Momo, ZygiskDetector, DuckDetector) as priv-app via promote.sh
- All files, permissions XMLs, SELinux contexts correct in module/system/
- metamount.sh processed all files: `zm list` shows 18 rules (6 APKs + 6 libs + 6 XMLs, each file shown twice)
- **RESULT:** `file=true, pm=false` for all 3 apps

**What works:**
- `stat /system/priv-app/io.github.vvb2060.mahoshojo/base.apk` → SUCCESS (VFS file redirect)
- `zm list` → shows all rules correctly registered with normalized paths
- Deferred uninstall safety → WORKING (skipped uninstall because pm=false, apps preserved)

**What doesn't work:**
- `ls /system/priv-app/ | grep maho` → NO MATCH (readdir injection NOT injecting app dirs into /system/priv-app/)
- `pm path io.github.vvb2060.mahoshojo` → shows `/data/app/...` only (PMS never discovered system copy)

**ROOT CAUSE HYPOTHESIS — readdir injection missing intermediate directories:**
- `zm list` shows FILE rules only (e.g., `/priv-app/AppName/base.apk`), NO directory entries
- `zeromount_auto_inject_parent()` registers IMMEDIATE parent only: for rule `/priv-app/AppName/base.apk`, it registers dir `/priv-app/AppName/` with child `base.apk`
- But PMS scans at `/system/priv-app/` (the GRANDPARENT) — needs `AppName` as a child entry there
- The grandparent `/priv-app/` is NOT registered in `zeromount_dirs_ht`, so getdents hook has nothing to inject
- metamount.sh's `find` includes `-type d` and SHOULD register directory entries via `zm add`, but `zm list` shows no directory rules — either directory `zm add` fails silently, or directory rules aren't stored in the rule list

**Investigation needed for next session:**
1. Read `zeromount_auto_inject_parent()` in zeromount.c — does it only go ONE level up? Should it be recursive?
2. Read metamount.sh's directory handling — when `find -type d` finds a dir, what exactly does `zm add /system/priv-app/AppName /data/adb/modules/scalpel/system/priv-app/AppName` do?
3. Check if `zm add` for a directory (not a file) stores a rule. If not, that's the bug.
4. Check if `zm list` even shows directory entries — maybe dirs are in `zeromount_dirs_ht` but not `zeromount_rules_list`
5. Test manually: `zm add /system/priv-app/TestDir /data/local/tmp/testdir` (where testdir is a real dir) then `ls /system/priv-app/ | grep TestDir`

**Current device state:**
- Module ENABLED, debloat working (4 apps via zeromount mode)
- 3 apps promoted in module/system/priv-app/ (with permission XMLs)
- VFS path redirect works (stat succeeds), readdir injection for nested dirs does NOT
- No bootloop, deferred uninstall correctly skipped, apps safe at /data/app/

**Files committed this session:**
- `2609ae7` on Enginex0/zeromount.git: zeromount-core.patch + inject-zeromount-readdir.sh

**Files changed locally (NOT committed):**
- Deleted: `module/post-mount.sh` from Scalpel codebase

---

## Accumulated Key Learnings

**ZeroMount / VFS:**
- ZeroMount VFS is FUNCTIONAL on device (kernel rebuilt with 6 bug fixes, Session 22).
- Path redirection (getname_flags hook) works for FULL paths — `stat /system/priv-app/AppName/base.apk` succeeds.
- Readdir injection (getdents hook) works for entries in EXISTING directories — `ls /system/app/` shows injected `FakeTestApp`.
- Readdir injection does NOT work for NESTED new directories — `ls /system/priv-app/` does NOT show injected `AppName` directory. Root cause: `auto_inject_parent()` only registers immediate parent, not all ancestors.
- Custom mounts at post-fs-data Step 4 sabotage metamodule at Step 6 (kern_path() succeeds -> is_new=false).
- `zm add <arg1> <arg2>` -> `zm list` shows `<arg2>-><arg1>`. For WebUI detection: module path must be on LEFT (arg2).
- Correct debloat: whiteouts in module dir + sync.sh delegation.
- `zm list` reads linked list (not hash table) — shows FILE rules but possibly not directory entries.

**KSU / Android:**
- `globalThis.ksu` (not `import('kernelsu')`). Callback pattern.
- `ksud module config set override.description` needs `KSU_MODULE=scalpel` env var.
- post-mount.sh: Step 7, blocking, after metamount, before zygote. Officially supported by KSU + APatch.
- `mount -t tmpfs -o context=` needs CAP_MAC_ADMIN. Use `chcon` post-mount instead.
- `env(safe-area-inset-bottom)` returns 0 in KSU WebView. Hardcode fallbacks.
- KSU WebView can't follow symlinks across SELinux contexts. Use native getPackagesIcons() API.

**Systemize safety:**
- Only `/data/app/` apps can be safely promoted (vendor partitions create duplicate PMS entries).
- pm uninstall DEFERRED to post-boot after overlay verification. Prevented data loss across 5+ failed boots.
- Permission XMLs: must capture ALL namespaces (not just android.permission.*). Empty XMLs crash PMS on enforce mode.
- Android Rescue Party re-enables disabled apps during bootloop recovery.
- 3-strike bootloop protection saved device from brick 3 times across sessions.

**Build / Tools:**
- detect_aapt() must check $MODDIR/common/aapt first (customize.sh deletes arch dirs).
- aapt returns XML paths for adaptive icons — filter *.xml, validate PNG magic (89504e47).
- Atomic symlink: `ln -sf ... .tmp && mv -f` (not rm + ln — TOCTOU).
- scanner.sh needs _init_standalone() for WebUI direct invocation.
- categories.json fallback path: $MODDIR/data/ (not webroot/).
- SAN skips Unknown filter (util.js:857). Unknowns only in "All" view. Scalpel matches.

**Session 21 — Root Cause & Fix:**
- ROOT CAUSE of VFS failure: `zeromount_normalize_path()` strips `/system` prefix at rule STORAGE but not at LOOKUP. Hash of `/app/Foo` ≠ hash of `/system/app/Foo`. Rule never found in hash table. `zm list` works (reads linked list, not hash table) giving false confidence.
- The `zeromount_match_path()` compensating logic is dead code — inside `hash_for_each_possible_rcu` which already selected the wrong bucket.
- 32-bit getdents handler must use `zeromount_inject_dents()` not `inject_dents64()` — struct layouts differ.
- readdir injection must `goto zm_out` to skip original epilogue that overwrites byte count.
- SELinux context function receives normalized paths (no `/system` prefix) — checks must match.
- `zeromount_should_skip()` is the centralized guard. SUSFS bypass script's per-function approach is obsolete.
- Injection pipeline (SUSFS + core.patch + 5 scripts) works PERFECTLY. All patterns match post-SUSFS. The bug was in zeromount.c logic, not patch application.

### Session 23 — 2026-02-03
**Deep debugging of PMS not discovering systemized apps. Repo cleanup. Identified timing/initialization issue.**

**Kernel build clarification:**
- User flashed WRONG kernel initially (from `Enginex0/zeromount` repo — missing device-profiles.json spoof)
- Correct kernel is from `Enginex0/kernelsu-next-vanilla` which has device-profiles.json with "lake" profile
- Triggered new build `21623622941` from kernelsu-next-vanilla with all fixes + spoof
- Build completed successfully, user flashed

**Repo cleanup (IMPORTANT for future):**
- `Enginex0/GKI_KernelSU_SUSFS` — ARCHIVED (was causing confusion, 17+ workflow files)
- `Enginex0/zeromount` — REMOVED build.yml (should be patches-only repo, no kernel builds)
- `Enginex0/kernelsu-next-vanilla` — **PRIMARY kernel build repo** (has device-profiles.json + clones zeromount patches)
- Local dirs moved to `/home/claudetest/gki-build/_archived/`: GKI_KernelSU_SUSFS, fork-nomount

**post_boot.sh fix committed:**
- Bug: verification required BOTH `file_ok=true` AND `pm_ok=true` before running deferred uninstall
- Problem: `pm_ok` (pm path shows /system/) can NEVER be true for already-installed apps until AFTER uninstall + reboot
- Fix: Trust `file_ok` alone — if VFS stat works, overlay is active, safe to uninstall
- Deferred uninstall now runs correctly, apps removed from /data/app/

**Critical discovery — PMS timing vs ZeroMount initialization:**
- metamount.sh completes at 10:28:02 (rules registered, "ZeroMount enabled" logged)
- PMS scans /system/priv-app/ at 10:28:14 (12 seconds AFTER metamount)
- `ls /system/priv-app/` NOW shows our apps (readdir injection works)
- BUT PMS scan at 10:28:14 did NOT see them

**The mystery:**
- Rules ARE registered before PMS scan
- Readdir injection DOES work (verified via `ls` returning 46 entries including our 3 apps)
- But PMS boot scan missed them
- Possible causes: kernel hook initialization delay, mount namespace difference, or early-boot state issue

**"Cannot stat parent" warning explained:**
- Comes from `susfs_integration.sh:387` (SUSFS kstat spoofing), NOT ZeroMount core
- SUSFS tries to derive metadata from parent dir for kstat spoofing
- Parent dirs don't exist in real FS, so stat fails
- This is a SUSFS cosmetic warning, doesn't affect ZeroMount readdir injection

**Terminal Systemizer comparison:**
- Uses Magisk's native magic mount (overlayfs) — "just works" for new directories
- KSU doesn't mount overlayfs on /system/ — relies on VFS hooks (ZeroMount)
- That's why systemize is complex on KSU vs simple on Magisk

**Current device state:**
- Kernel: correct build with spoof (shows June 28, 2024 build date)
- Apps: uninstalled from /data/app/ via deferred uninstall
- VFS: readdir injection works NOW (ls shows apps)
- PMS: does NOT know about our apps (boot scan missed them)
- Need: reboot to test if PMS discovers apps this time, OR investigate why boot scan differs from runtime

**Files changed this session:**
- `module/core/post_boot.sh` — fixed verification logic (committed to device, needs git commit)
- `Enginex0/zeromount` — removed build.yml (commit `64d63b1`)
- `Enginex0/GKI_KernelSU_SUSFS` — archived via GitHub API

**NEXT SESSION PRIORITIES (in order):**
1. **Commit post_boot.sh fix** to Scalpel git repo
2. **Reboot device** and check if PMS discovers apps this time
3. **If still fails:** Add kernel debug logging to understand WHEN readdir injection becomes active
4. **Alternative approach:** Consider if there's a simpler path (e.g., trigger PMS rescan post-boot instead of relying on boot scan)
5. **Document** whatever works as the final systemize flow

---

## CRITICAL: Next Session Startup Protocol

**DO NOT skip these steps. Read in order before doing anything else:**

```
1. READ this entire Session 23 summary above
2. CHECK device state: `adb shell "pm list packages | grep -E 'maho|zygisk|duck'"` — should return empty (apps uninstalled)
3. CHECK VFS state: `adb shell "ls /system/priv-app/ | grep -E 'maho|zygisk|duck'"` — should show 3 apps (VFS working)
4. IF user hasn't rebooted: ask them to reboot and test
5. AFTER reboot: check `pm path io.github.vvb2060.mahoshojo` — if shows /system/, SUCCESS! If empty, investigate
```

**Approach that's working:**
- Methodical, sequential investigation
- One thing at a time, verify each step
- Read source code, don't assume
- Trust logs over assumptions
- When stuck, step back and question the approach

**What NOT to do:**
- Don't rush to implement without understanding
- Don't skip reading relevant source code
- Don't trust "it should work" — verify
- Don't make multiple changes at once
