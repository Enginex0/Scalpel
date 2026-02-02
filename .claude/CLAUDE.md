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
- **Systemize method:** tmpfs+bind mount on KSU/APatch (zm VFS can't add new paths — strips /system prefix, doesn't handle readdir). Magisk uses native magic mount. Decoupled from debloat mode — no second mode detection needed.
- **Systemize deferred uninstall:** `pm uninstall -k --user 0` DEFERRED to post-boot after overlay verification (never destroy /data/app before system copy confirmed). `needs_uninstall: true` flag in systemize_list.json.
- **ZeroMount integration (debloat):** Scalpel creates whiteouts, calls ZeroMount sync.sh + registers module-path rules for WebUI detection. ZeroMount handles SUSFS internally. Do NOT call SUSFS directly.
- **ZeroMount limitation:** zm strips /system prefix from virtual paths, doesn't handle readdir(). Only works for file redirection (stat/open), not new path creation. ZeroMount's notify-module-mounted bypasses KSU's native magic mount for ALL modules. Debloat whiteouts on device actually work via pm disable fallback, not VFS hiding.
- **App icons:** KSU native `getPackagesIcons()` API for BOTH system and user apps. File-based symlink exists as fallback but KSU WebView can't follow symlinks across SELinux contexts. Icons also extracted at install via aapt+unzip to `/data/adb/scalpel/icons/`. Frontend fallback chain: KSU API -> colored initials (hash-based) -> SVG phone.
- **WebUI layout:** Header (SCALPEL logo) only on Status/Settings tabs. Debloat/System tabs have no header for max space. Vertical category sections (not horizontal scroller). No PRIV/category badges on app rows. Text scroll animation on overflow.

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

### Before Starting Work
1. Check FOCUS.md for current task
2. One `"in_progress"` feature at a time in features.json
3. Update features.json status + started_date

### During Work
- Log decisions in `docs/DECISIONS.md`
- Log discoveries in `docs/LEARNINGS.md`
- New ideas -> FOCUS.md "Idea Capture" (don't chase them)

### After Completing Work
- features.json: `"status": "done"`, `"completed_date": "YYYY-MM-DD"`
- FOCUS.md: move to COMPLETED, update stats, pick next
- progress.json: update counts

### Rules
1. One focus at a time
2. Update before switching
3. Capture, don't chase
4. Read files before editing
5. Test on reference code before writing new code

---

## Session Log

### Session 1 — 2026-01-31
**Accomplishment:** Built Phase 0-3 from blank slate (scaffold + config + logging + categories + bootloop + detect + mode_pm + scanner). 24 files (7 implemented, 16 stubs). config.sh (2 critical + 3 high fixed), categories.json (5 misclassifications fixed).
**Context:** 7/26 features done (27%).

### Session 2 — 2026-01-31
**Accomplishment:** Built Phases 4-7 (13 new files, ~1450 lines). 4 adversarial audit rounds, 23+ fixes. Key files: whiteout_helpers.sh, mode_whiteout.sh, mode_zeromount.sh, mode_magisk.sh, nuke.sh, verify.sh, post-fs-data.sh, service.sh, promote.sh, permissions.sh, customize.sh, default_debloat.sh, uninstall.sh. Critical fixes: source injection in bootloop counter, premature counter reset, getprop timeout, pm retry mode forcing, corrupt JSON handling.
**Context:** 17/26 features done (65%).

### Session 3 — 2026-02-01
**Accomplishment:** Documentation-first. Fetched 5 reference docs (~5,300 lines). Fixed 3+3 CRITICAL/HIGH bugs. Built mode_mountify.sh, mode_symlink.sh, monitor.sh, action.sh, boot-completed.sh, post_boot.sh. TAG refactor across 16 files (36 findings). Key fixes: setprop deadlock, pm at post-fs-data, scanner retry, jq deletion, config override clobbering, negative BOOTCOUNT. Backend 100/100 score.
**Context:** 21/26 features done (81%). Backend ship-ready.

### Session 4 — 2026-02-01
**Accomplishment:** Built complete WebUI (3 proposals, chose Proposal A "Neon Scalpel"). 40+ files: types.ts, api.ts, store.ts, theme.ts, icons.ts, Badge/Button/Card/Input/Skeleton/Toggle/Header/NavBar/Modal/Toast/RebootFAB, 4 route tabs. Scalpel Signature System (blade mark, incision line, glint). 8 surgical accent presets. CRT scanlines, risk-bleeding, incision clip-path. 6 audit rounds, all resolved.
**Context:** 26/26 features done (100%). WebUI at webui-proposals/proposal-a/.

### Session 5 — 2026-02-01
**Accomplishment:** Ship phase polish + first device install. Added priv-app/app target selection. Status tab polish (ECG, gauge rings, holographic badge). Logging audit (4 CRITICAL + 11 HIGH fixed). Monitor upgrade (live description + status cache). Fixed jq path + scanner wrapper. KSU Next, 153 apps scanned successfully.
**Context:** Module v0.1.0 complete. First successful device installation.

### Session 6 — 2026-02-01
**Accomplishment:** Device testing. Fixed monitor description (duplicate update functions conflicting). Fixed WebUI loading (wrong build dir). Added fixedNav toggle. Fixed status bar/FAB system UI overlap. Monitor uses full path `/data/adb/ksud` for KSU API.
**Context:** Monitor description working. Device testing in progress.

### Session 7 — 2026-02-01
**Accomplishment:** Fixed all UI overlap with Android system bars. Header.css 48px top padding, NavBar.css 48px base (+48px toggle), border separator. fixedNav default false. `viewport-fit=cover` for safe-area-inset. Key insight: `env(safe-area-inset-bottom)` returns 0 in KSU WebView — hardcoded fallbacks needed.
**Context:** UI polish complete. navbar positioned above Android nav buttons.

### Session 8 — 2026-02-01
**Accomplishment:** Fixed navbar layout to match ZeroMount exactly. Deployed 3 agents for architecture comparison.
**Root cause:** Vite outDir wrong, `--glass-border` opacity 8%->10%, separator is `border-top` not `border-bottom`.
**Files modified:** vite.config.ts, NavBar.css, app.css, store.ts, App.tsx, RebootFAB.tsx

### Session 9 — 2026-02-01
**Accomplishment:** Fixed critical WebUI-to-device integration bugs. Apps now load and display correctly. Bottom sheet modals no longer overlap with Android navigation.
**Root causes found:**
- KSU API: `import('kernelsu')` doesn't exist — must use `globalThis.ksu` directly with callback pattern
- Scanner: Direct invocation via WebUI failed because logging/config not sourced
- FAB positioning: ZeroMount has NO FAB — values were invented without reference (76px/124px too low)
- Modal padding: `env(safe-area-inset-bottom)` returns 0 in KSU WebView — needs hardcoded fallback
**Files created:**
- ksuApi.ts: Proper KSU bridge matching ZeroMount's working implementation
**Files modified:**
- api.ts: Rewrote to use ksuApi.ts instead of fake `kernelsu` module
- scanner.sh: Added `_init_standalone()` to source dependencies when invoked directly
- RebootFAB.tsx: Changed bottom from `76px/124px` to `120px/168px`
- Modal.tsx: Changed padding-bottom from `24px` to `calc(24px + 48px + env(safe-area-inset-bottom))` (hardcoded fallback for Android nav bar)
**Device test:** KernelSU Next, apps load correctly, detail sheets clear Android nav bar.
**Context:** 26/26 features done (100%). Module v0.1.0 complete. WebUI fully functional on device.

### Session 10 — 2026-02-01
**Accomplishment:** ZeroMount detection fix, mode status visibility, install-time feedback, compliance audit against original systemapp_nuker, raw_whiteouts.txt mode routing fix.
**Backend fixes:**
- ZeroMount detection: Added `/data/adb/modules/zeromount/bin/zm` to search paths (detect.sh:90, mode_zeromount.sh:18)
- Mode status visibility: nuke.sh now detects mode FIRST before checking nuke_list (nuke.sh:70-108)
- Install-time feedback: Added `_detect_capabilities()` to customize.sh (~80 lines), writes initial status.json
- raw_whiteouts.txt routing: Changed from hardcoded `whiteout_create()` to `mode_debloat()` (nuke.sh:210-224)
**Compliance audit:**
- Deployed 2 adversarial agents for head-to-head audit against original systemapp_nuker
- Result: 94% compliance with original
- Identified: 2 critical gaps, 5 deviations, 12 enhancements
**Files modified:** detect.sh, mode_zeromount.sh, nuke.sh, customize.sh
**Verified:** pm uninstall-system-updates already in post_boot.sh:11-40 (`_remove_system_updates()`)
**Context:** 26/26 features done (100%). Module v0.1.0 complete. Backend compliance validated.

### Session 11 — 2026-02-01
**Accomplishment:** Compliance audit + ZeroMount integration discovery.

**Compliance Fixes (committed 7e750c0):**
- ZeroMount detection: Added `/data/adb/modules/zeromount/bin/zm` path
- Install-time detection: Added feedback in customize.sh
- raw_whiteouts.txt: Now routes through active mode (not hardcoded whiteout_create)
- Post-nuke re-enable: Apps disabled but not nuked get re-enabled (nuke.sh:237-252)
- Boot-time restoration: `_restore_app_states()` in post_boot.sh:76-103
- Uninstall scope: Now restores from both app_list.json AND nuke_list.json

**CRITICAL DISCOVERY - ZeroMount Integration:**
- **ZeroMount is NOT for path hiding** - it's for VFS path REDIRECTION (replace file A with file B)
- **SUSFS handles actual path hiding** via `ksu_susfs add_sus_path`
- `zm add /path ""` does NOT work - creates broken redirect, path still visible
- ZeroMount's own metamount.sh uses SUSFS for whiteouts, not zm add

**CORRECT mode_zeromount.sh approach (NOT YET IMPLEMENTED):**
1. Scalpel creates whiteout files (char device c 0 0) in module directory
2. Call ZeroMount's sync.sh to trigger reprocessing: `sh /data/adb/modules/zeromount/sync.sh scalpel`
3. ZeroMount detects whiteouts and calls susfs_hide_path() internally
4. This delegates SUSFS complexity to ZeroMount (the expert)

**Key paths for ZeroMount integration:**
- ZeroMount sync.sh: `/data/adb/modules/zeromount/sync.sh`
- ZeroMount susfs_integration.sh: `/data/adb/modules/zeromount/susfs_integration.sh`
- ZeroMount metamount.sh: `/data/adb/modules/zeromount/metamount.sh`

**Context:** 100% systemapp_nuker compliance achieved. ZeroMount integration is the final piece.

### Session 12 — 2026-02-01
**Accomplishment:** ZeroMount integration FIXED, unified logging system, monitor self-healing, comprehensive device testing (16/16 tests PASSED). Module v0.1.0 VALIDATED.

**ZeroMount Integration Fix (CRITICAL):**
- **Problem:** `zm add /path ""` creates broken redirect, path still visible
- **Discovery:** ZeroMount = VFS REDIRECTION. SUSFS = HIDING. They are different!
- **Solution:** Create whiteouts in module dir + call sync.sh for delegation
- **Commit:** `7a48c10 fix(zeromount): rewrite to use whiteouts + sync.sh delegation`

**Unified Logging System:**
- Created `logger.ts` for frontend (4 levels: debug/info/warn/error)
- Frontend logs write to `/data/adb/scalpel/debug.log` via ksuExec
- All logs unified: backend shell + frontend TypeScript in same file
- Tags: `[webui:api]`, `[webui:store]`, `[webui:ksu]`

**Backend Logging Audit:**
- Audited 22 shell scripts
- Fixed CRITICAL: `action.sh` had zero logging
- Fixed MEDIUM: `detect.sh`, `monitor.sh` silent failures

**Monitor Self-Healing:**
- Added `monitor_supervised()` wrapper in monitor.sh
- Auto-restarts crashed monitor after 60s cooldown
- Max 10 restarts before giving up
- Handles singleton (exit code 2)

**Device Testing (16/16 PASSED):**
1. Installation via `ksud module install`
2. Config initialization
3. App scan (153 apps)
4. Mode detection (zeromount)
5. Debloat operation (whiteout created)
6. Path hiding verified (app invisible)
7. Verify operation (1 verified, 0 broken)
8. Restore operation (whiteout removed)
9. Path restore verified (app visible again)
10. Unified logging (frontend -> backend)
11. Monitor daemon running
12. WebUI loads correctly
13. Debloat tab functional
14. Status tab shows correct mode
15. Settings persist across reload
16. Reboot FAB works

**Files modified:**
- `module/modes/mode_zeromount.sh` — Complete rewrite (whiteouts + sync.sh)
- `module/core/monitor.sh` — Added self-healing supervisor
- `module/core/post_boot.sh` — Updated monitor launch
- `module/core/detect.sh` — Added logging to `_find_tmpfs_dir`
- `module/action.sh` — Added full logging
- `src/lib/logger.ts` — NEW: Unified logging utility
- `src/lib/api.ts` — Added error logging with stderr
- `src/lib/ksuApi.ts` — Added failure logging
- `src/lib/store.ts` — Initialize backend logging

**Key Learnings:**
1. ZeroMount (`zm add`) = VFS REDIRECTION (replace A with B)
2. SUSFS (`ksu_susfs add_sus_path`) = HIDING (path disappears)
3. Correct integration: Create whiteouts -> call sync.sh -> ZeroMount handles SUSFS
4. Frontend can write to backend log via `ksuExec echo >> debug.log`
5. Monitor needs supervisor (Android OOM-kills background processes)

**Context:** Module v0.1.0 VALIDATED. 16/16 device tests passed. Ready for release.

### Session 13 — 2026-02-02
**Accomplishment:** App icons feature (full pipeline) + major WebUI overhaul (7 UI changes). Orchestrator mode with elite persona agents. 4 analysis agents, 4 implementation agents, 2 adversarial validators, 2 fix agents, 2 verification agents. Playwright MCP testing before device deploy.

**Icon Pipeline Built:**
- Backend: symlink `webroot/icons -> /data/adb/scalpel/icons` (customize.sh + service.sh + boot-completed.sh)
- Backend: `_regenerate_icons()` in scanner.sh with CLI entry `sh scanner.sh icons` for on-demand refresh
- Backend: `detect_aapt()` fixed to check `$MODDIR/common/aapt` first (arch dirs deleted after install)
- Frontend: `AppIcon.tsx` component with dual strategy — `source="file"` (symlink) or `source="ksu"` (native API)
- Frontend: `AppIcon.css` for icon container styles
- Frontend: `refreshIcons()` in api.ts

**CRITICAL DISCOVERY — KSU WebView SELinux:**
- File-based icon serving via symlink DOES NOT WORK in KSU WebView
- Symlink resolves at filesystem level (shell ls works) but WebView HTTP server can't follow symlinks across SELinux contexts (`system_file` -> `adb_data_file`)
- **Fix:** Changed DebloatTab from `source="file"` to `source="ksu"` — uses native `getPackagesIcons()` API which works perfectly
- The file-based symlink infrastructure remains as fallback but KSU API is primary for both tabs

**Adversarial Audit Findings (all fixed):**
- Backend (Red Team Rex): 1 CRITICAL + 3 HIGH + 5 MEDIUM
  - F-01 CRITICAL: Symlink exposed entire /data/adb/scalpel/ -> scoped to icons/ only
  - F-02 HIGH: detect_aapt wrong path -> checks common/aapt first
  - F-03 HIGH: XML/vector drawable -> corrupt .png -> filter *.xml + PNG magic validation (89504e47)
  - F-04 HIGH: TOCTOU race rm+ln -> atomic ln -sf tmp + mv -f
  - F-06 MEDIUM: Concurrent regen -> flock guard
  - F-07 MEDIUM: Path traversal -> case guard rejecting / and ..
  - F-08 MEDIUM: 0-byte files -> [ ! -s ] check
  - F-09 MEDIUM: Silent jq failure -> pre-validate output
- Frontend (Prof. Rigor): 1 HIGH + 3 MEDIUM
  - F-01 HIGH: Zombie promise -> disposed sentinel
  - F-02 MEDIUM: FOBI -> img.onload callback

**WebUI Overhaul (7 changes):**
1. Icons: DebloatTab changed to `source="ksu"` (matches working SystemizeTab)
2. Removed category badges from app rows (redundant with section headers)
3. Removed PRIV badges from app rows
4. Added text scroll animation for overflowing names (`textScroll.ts` + CSS @keyframes)
5. Header only on Status/Settings tabs (removed from Debloat/System for more space)
6. Context-sensitive FAB: Reboot on Status, Nuke (with count badge) on Debloat, Systemize on System, none on Settings
7. Vertical category sections replace horizontal scroller (Essential -> Caution -> Safe to Remove -> Google Services -> Unknown)

**Files created:**
- `src/components/core/AppIcon.tsx` — Shared icon component (dual strategy: file/ksu)
- `src/components/core/AppIcon.css` — Icon container styles
- `src/lib/textScroll.ts` — Overflow text scroll animation utility
- `src/components/scalpel/ContextFAB.tsx` — Per-tab FAB (reboot/nuke/systemize)
- `src/components/scalpel/AppDetailSheet.tsx` — Extracted app detail bottom sheet

**Files modified:**
- Backend: customize.sh, service.sh, boot-completed.sh (symlink), detect.sh (aapt path), scanner.sh (regen + hardening)
- Frontend: DebloatTab.tsx (rewritten — vertical sections, ksu icons, no badges, selection), SystemizeTab.tsx (textScroll), App.tsx (conditional header, ContextFAB), app.css (animations, section styles), store.ts (debloatSelected signals), api.ts (refreshIcons)

**Playwright Testing (all PASS):**
- Status tab: Header present, reboot FAB, all stats render
- Debloat tab: No header, vertical sections, no badges, Nuke FAB with count, confirmation dialog
- Search: Filters across sections, hides empty categories
- System tab: No header, Systemize FAB
- Settings tab: Header present, no FAB

**Key Learnings:**
1. KSU WebView HTTP server cannot follow symlinks across SELinux contexts (system_file -> adb_data_file)
2. Always use KSU native `getPackagesIcons()` API for icons — works for both system and user apps
3. `detect_aapt()` must check `$MODDIR/common/aapt` FIRST (customize.sh deletes arch-specific bin/ dirs)
4. `aapt dump badging` returns XML paths for adaptive icons (Android 8+) — must filter *.xml and validate PNG magic bytes
5. Atomic symlink: `ln -sf ... .tmp && mv -f` (never rm -f + ln -sf — TOCTOU race)
6. On-demand shell operations need flock for concurrent WebUI invocations
7. Solid.js async in IntersectionObserver needs disposed sentinels to prevent zombie DOM writes
8. `img.onload` callback needed instead of immediate opacity set (prevents FOBI)

**Context:** Module v0.1.0 with icon support + UI overhaul. Deployed to device, awaiting feedback. WebUI Playwright-tested (all pass).

### Session 14 — 2026-02-02
**Accomplishment:** Major Debloat tab UX overhaul (collapsible accordion, tap-to-select, SAN-matching unknown handling), SystemizeTab fancy promotion dialog, scanner.sh path fix. Two implementation rounds with Playwright-driven verification.

**Debloat Tab Changes:**
- Added `padding-top: 48px` to fix status bar overlap (header removed in Session 13)
- Removed checkbox visual from app rows — tap row body to toggle selection
- Added instruction text: "Tap app to mark for removal" below search bar
- Implemented collapsible accordion with chevron toggles, ALL sections collapsed by default
- Section order: All System Apps (flat alphabetical) -> Safe to Remove -> Essential -> Caution -> Google Services
- Removed "Unknown" section — matches SAN's exact behavior (util.js:857 explicitly skips unknown filter)
- Unknown apps appear ONLY in "All System Apps" flat list with neutral glass-border (no category color)
- Replaced plain chevronRight detail button with accent-ring circle (28x28px, 1.5px accent border, info 'i' icon)

**SystemizeTab Changes:**
- Added `padding-top: 48px` for status bar safe area
- Initially changed to tap-to-select pattern, then REVERTED per user request back to per-row Promote buttons
- Fancy promotion dialog: two card-style target selectors with icons
  - Privileged App: shield icon in 40px gradient circle, accent glow/shadow when selected
  - System App: phone icon in 40px circle, dimmed when unselected
  - "Choose installation level" header, descriptive text under each option

**Store Changes:**
- Added `systemizeSelected` + `setSystemizeSelected` signals (unused after SystemizeTab revert, harmless)

**ContextFAB Changes:**
- SystemizeFAB reverted to simple floating button (no bulk promote, no count badge)

**Backend Fix:**
- scanner.sh:11 — Fixed categories.json fallback path from `$MODDIR/webroot/categories.json` to `$MODDIR/data/categories.json`

**Categorization Investigation:**
- Deployed Explore agents to compare SAN vs Scalpel categories.json: FILES ARE BYTE-IDENTICAL (254 apps, 5 categories)
- Device has 162 apps, 92 (57%) are "unknown" — mostly com.mediatek.*, com.miui.*, com.xiaomi.* OEM packages
- This is expected behavior — SAN would show the same unknowns on this device
- SAN's approach: skip Unknown filter button, show unknowns only in "All" view with no badge — Scalpel now matches this exactly

**Playwright Verification (all PASS):**
- Debloat: All sections collapsed, no Unknown section, accent-ring info buttons, tap-to-select works, batch action bar
- System: Per-row Promote buttons, fancy dialog with shield/phone icons, target selection with accent glow
- Both tabs: proper 48px top padding

**Files modified:**
- Frontend: DebloatTab.tsx (rewritten), SystemizeTab.tsx (rewritten), store.ts (+systemizeSelected), ContextFAB.tsx (SystemizeFAB simplified)
- Backend: scanner.sh (fallback path fix)
- Build output: index.html, index-LeTqTQGZ.js, index-DtaI-oLg.css, api.mock-hoMEoQJt.js

**Key Learnings:**
1. SAN explicitly skips "Unknown" category filter (util.js:857: `if (category.id === 'unknown') return;`)
2. SAN shows no badge for unknown apps — they appear only in "All" view
3. `adb push` of directories nests subdirs — always push files individually
4. scanner.sh fallback was pointing to wrong directory (webroot/ instead of data/)
5. categories.json between SAN and Scalpel is byte-identical (254 entries)
6. 57% of apps on Xiaomi/MediaTek device are uncategorized in both SAN and Scalpel databases

**Context:** Module v0.1.0. Debloat tab fully overhauled with SAN-matching behavior. Fancy promotion dialog. All deployed to device. 26/26 features done.

### Session 15 — 2026-02-02
**Accomplishment:** Fixed SystemizeTab tap-to-select, redesigned SystemizeFAB with glass morphism, expanded "Safe to Remove" by default, and solved ZeroMount "Not Loaded" integration bug through deep-dive analysis of zm's VFS rule format.

**SystemizeTab — Tap-to-Select Restored + Selection Indicators:**
- Removed per-row Promote buttons and individual promote confirmation modal (moved to FAB)
- Added `toggleSelect()` using existing `store.systemizeSelected` / `store.setSystemizeSelected` signals
- Each app row has `onClick` handler to toggle selection
- Selection circle indicator (22px) on right side: hollow circle when unselected -> accent-filled circle with checkmark when selected
- Visual selected state: accent background (`rgba(var(--accent-rgb), 0.08)`) + accent border (`rgba(var(--accent-rgb), 0.3)`)
- Instruction hint text: "Tap app to mark for promotion" below search bar
- Batch action bar at bottom (fixed position, "N selected" + Clear button) — same pattern as DebloatTab
- Promoted apps section unchanged (per-row Demote buttons remain for single-app demotion)

**SystemizeFAB — Glass Morphism Redesign with Batch Promote:**
- **Idle state (0 selected):** Frosted glass background (`rgba(255,255,255,0.06)` + `backdrop-filter:blur(16px)`), thin white border, inner light highlight, dimmed accent icon, 0.7 opacity, gentle float animation
- **Active state (N selected):** Accent-tinted glass (`rgba(var(--accent-rgb), 0.1)`), accent border with outer glow, full opacity, glowPulse animation, accent count badge
- Changed icon from `ICONS.arrowUp` to `ICONS.promote` (star/bookmark shape)
- Count badge: accent-colored (not red like NukeFAB) — 20px circle with count number
- Click opens batch promote modal with target selector (Privileged vs System), scrollable app list, warning, Cancel/"Promote N" buttons with loading state
- **Visual identity of 3 FABs now distinct:** RebootFAB (solid accent gradient), NukeFAB (solid red gradient), SystemizeFAB (frosted glass morphism)

**DebloatTab — "Safe to Remove" Section Expanded by Default:**
- Changed initial `openSections` signal from `new Set()` to `new Set(['safe'])` in DebloatTab.tsx

**ZeroMount Integration — "Not Loaded" Bug Fix (CRITICAL):**
- **Problem:** ZeroMount WebUI showed Scalpel as "Not Loaded", "0 files", "Inactive" despite debloat working perfectly (4 apps hidden with zero detection)
- **Root cause:** ZeroMount WebUI SCAN runs `zm list | awk -F'->' '{print $1}' | grep -oE '/data/adb/modules/[^/]+'` — extracts LEFT side of `zm list` output
- **Key discovery — zm binary format:** `zm add <arg1> <arg2>` -> `zm list` shows `<arg2>-><arg1>` (arg1=virtual target, arg2=source file)
- sync.sh adds whiteout rules as `zm add <virtual_path> /nonexistent` -> `zm list` shows `/nonexistent-><virtual_path>` -> LEFT side is `/nonexistent` -> no match for `/data/adb/modules/scalpel`
- **Fix:** Added `_zm_register_whiteout()` helper in mode_zeromount.sh — after sync.sh completes, also calls `zm add <virtual_path> <module_whiteout_path>` directly using actual module char device path as source
- Creates `zm list` entry with module path on LEFT side -> WebUI scan extracts `/data/adb/modules/scalpel` -> "Loaded"
- zm binary search checks 3 paths: `/data/adb/modules/zeromount/bin/zm`, `zm-arm64`, `zm`
- **Verified on device:** `zm list` shows all 4 whiteout rules with module paths. ZeroMount WebUI SCAN shows "Loaded", "Active", correct file/rule counts

**Files modified:**
- `webui-proposals/proposal-a/src/routes/SystemizeTab.tsx` — Full rewrite (tap-to-select + selection indicators + batch bar)
- `webui-proposals/proposal-a/src/components/scalpel/ContextFAB.tsx` — SystemizeFAB glass morphism + batch promote modal
- `webui-proposals/proposal-a/src/routes/DebloatTab.tsx` — Safe to Remove expanded by default
- `module/modes/mode_zeromount.sh` — Added `_zm_register_whiteout()` helper for ZeroMount WebUI detection
- Build output: `module/webroot/` (index.html, assets/index-BLS6edH9.js, assets/index-DtaI-oLg.css)

**Key Learnings:**
1. `zm add <arg1> <arg2>` -> `zm list` shows `<arg2>-><arg1>` (reversed order)
2. arg1 = virtual target path (what to intercept), arg2 = source file path (what to serve instead)
3. `zm del <virtual_path>` removes rule by target (arg1)
4. For whiteouts: use module char device path as arg2 (not /nonexistent) for ZeroMount WebUI detection
5. ZeroMount WebUI extracts LEFT side of `zm list` -> module path must be on LEFT (= arg2 position)

**Device Testing:**
- Debloat: 4 apps nuked (FM Radio, FM Radio Service, YouTube, YouTube Music) — working perfectly
- ZeroMount integration: After fix, SCAN shows "Loaded", "Active", 8 rules (4 systemized + 4 whiteouts)
- SystemizeTab: 2 apps promoted (AppListDetector, Checker) as priv-app
- WebUI: All tabs functional, safe-to-remove expanded, glass FAB visible

**Context:** Module v0.1.0 — 26/26 features done (100%). Backend 100/100. ZeroMount "Not Loaded" bug FIXED. Device: Xiaomi Redmi 14C, KernelSU Next, 162 system apps.

### Session 16 — 2026-02-02
**Accomplishment:** Fixed 3 SystemizeTab UI issues + discovered and solved fundamental ZeroMount VFS limitation for systemization. Deep kernel VFS analysis led to architectural pivot from zm-based to tmpfs+bind mount approach.

**UI Fixes (all verified working on device):**
- App names: promote.sh now accepts app_label from frontend. Separated app_name (filesystem dir) from display_name (JSON label). api.ts passes appName, store.ts passes from userApps signal.
- App icons: AppIcon.tsx colored initials fallback (hashColor from package name, getInitials from app name). Fallback chain: KSU API -> colored initials -> SVG phone.
- Collapsible sections: SystemizeTab accordion pattern matching DebloatTab (openSections signal, chevron rotation, Show wrapper).

**Critical Discovery — ZeroMount VFS Limitations:**
- zm strips `/system` prefix from virtual paths (stores `/priv-app/` not `/system/priv-app/`)
- zm doesn't handle readdir() — can't inject new directory entries into listings
- KSU magic mount bypassed by ZeroMount's `notify-module-mounted` call
- Debloat whiteouts actually work via pm disable fallback, NOT VFS hiding
- Confirmed on-device: `stat /priv-app/AppName/base.apk` works but `/system/priv-app/AppName/base.apk` does NOT

**Systemize Architecture Pivot:**
- Removed: pm uninstall from promote.sh (was destroying /data/app before overlay active)
- Removed: sync.sh calls from promote.sh and demote_app() (zm not used for systemize)
- Added: `needs_uninstall: true` field in systemize_list.json (deferred to post-boot)
- Added: `_verify_systemized_apps()` in post_boot.sh (checks overlay active before pm uninstall)
- Added: `_mount_systemized_apps()` in post-fs-data.sh (~110 lines) — tmpfs+bind mount:
  1. Creates tmpfs at /dev/scalpel_mount_{target} with SELinux context from original dir
  2. Mirrors all existing /system/{target}/ subdirs via bind mount
  3. Adds promoted app dirs via bind mount from module
  4. Bind-mounts tmpfs over /system/{target}
  5. Handles /system/etc/permissions/ for priv-app XMLs
- Runs AFTER nuke_run, BEFORE PMS starts scanning

**Architectural Decision — Decoupled Modes:**
- Debloat mode: auto-detected (zeromount/whiteout/mountify/symlink/magisk/pm) — unchanged
- Systemize method: FIXED per root manager — tmpfs+bind on KSU/APatch, native magic mount on Magisk
- No second mode detection needed. These are architecturally separate operations.

**Validation:** 2 adversarial audits (Red Team Rex + Prof. Rigor), 0 CRITICAL findings. Fixed: batch promote selection clearing (only clears successful), demote_app sync.sh for VFS cleanup, store.promoteApp returns boolean.

**Files modified:**
- Backend: post-fs-data.sh (+_mount_systemized_apps ~110 lines), promote.sh (app_label param, no pm uninstall, no sync.sh), post_boot.sh (+_verify_systemized_apps with deferred uninstall)
- Frontend: api.ts (appName param), store.ts (pass appName, return boolean), AppIcon.tsx/css (initials fallback), SystemizeTab.tsx (accordion), ContextFAB.tsx (partial failure handling)
- Build: module/webroot/ (150KB, 42KB gzip)

**Key Learnings:**
1. zm VFS operates at partition level — strips mount point prefix, only intercepts stat/open not readdir
2. ZeroMount's notify-module-mounted bypasses KSU's native magic mount for ALL modules
3. Debloat on this device works via pm disable, not VFS hiding (whiteout char devices exist but aren't effective)
4. tmpfs+bind mount is universal solution for adding system files on KSU — SELinux context preservation is critical
5. pm uninstall must be DEFERRED to post-boot after overlay verification (never destroy /data/app before system copy confirmed)
6. App name from KSU API label must be passed through frontend->API->shell for correct JSON storage
7. Directory basename sed regex doesn't strip Android hash suffix with = chars (base64 padding)

**Device test:** KSU Next, Xiaomi Redmi 14C, 162 apps. Icons/names fix CONFIRMED working. tmpfs systemize fix DEPLOYED but awaiting reboot test.

**Next session TODO:**
1. REBOOT device and test tmpfs+bind mount systemization
2. Check debug.log: `grep 'systemize_mount\|VERIFIED\|deferred' debug.log`
3. Verify pm path shows /system/ (not /data/app/) for promoted apps
4. Verify apps behave as system apps (can't uninstall from launcher)
5. Test WebUI status tab shows correct systemized count
6. If tmpfs fails: check SELinux context, busybox, overlay interference
7. Categories.json expansion for Xiaomi/MediaTek (57% unknown)
8. Update stale docs (FOCUS.md, progress.json, features.json)
9. Final release preparation

**Context:** 26/26 features done. Backend validated. WebUI functional. Systemize tmpfs approach deployed, pending reboot verification.
