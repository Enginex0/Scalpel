# Scalpel Context — Session 15 Complete

## Quick Status
- **Phase:** Ship (VALIDATED)
- **Features:** 26/26 (100%)
- **Module Version:** v0.1.0
- **Device Tests:** 16/16 PASSED (Session 12) + UI verified via Playwright (Sessions 13-14) + device verified (Session 15)
- **Device:** Xiaomi Redmi 14C, KernelSU Next, 162 system apps, ZeroMount mode active
- **Backend:** 100/100 validation score
- **ZeroMount Integration:** FIXED — auto-detection + WebUI visibility working

## Session 15 Summary (Latest)

### 1. SystemizeTab — Tap-to-Select Restored + Selection Indicators
- **Problem:** Session 14 reverted SystemizeTab to per-row Promote buttons, killing the tap-to-select pattern
- **Fix:** Full rewrite of SystemizeTab.tsx:
  - Removed per-row Promote buttons and individual promote modal (moved to FAB)
  - Added `toggleSelect()` using existing `store.systemizeSelected` / `store.setSystemizeSelected` signals
  - Selection circle indicator (22px): hollow when unselected, accent-filled with checkmark when selected
  - Visual selected state: accent background + accent border
  - Instruction hint: "Tap app to mark for promotion" below search bar
  - Batch action bar at bottom (same pattern as DebloatTab)
  - Promoted apps section unchanged (per-row Demote buttons remain)

### 2. SystemizeFAB — Glass Morphism Redesign with Batch Promote
- **Idle state (0 selected):** Frosted glass background, thin white border, dimmed accent icon, 0.7 opacity, gentle float animation
- **Active state (N selected):** Accent-tinted glass, outer glow, full opacity, glowPulse animation, accent count badge (20px circle)
- Changed icon from `ICONS.arrowUp` to `ICONS.promote` (star/bookmark)
- Click opens batch promote modal: target selector (Privileged vs System), scrollable app list, warning, Cancel/"Promote N" buttons
- **Visual identity of 3 FABs now distinct:**
  - RebootFAB: Solid accent gradient (always vibrant)
  - NukeFAB: Solid red gradient when active, elevated surface when inactive
  - SystemizeFAB: Frosted glass morphism (unique)

### 3. DebloatTab — "Safe to Remove" Expanded by Default
- Changed initial `openSections` from `new Set()` to `new Set(['safe'])`
- Users no longer need to manually expand to see the most useful section

### 4. ZeroMount "Not Loaded" Bug Fix (CRITICAL)
- **Problem:** ZeroMount WebUI showed Scalpel as "Not Loaded", "0 files", "Inactive" despite debloat working (4 apps hidden)
- **Root cause discovery:**
  - ZeroMount WebUI SCAN: `zm list | awk -F'->' '{print $1}' | grep -oE '/data/adb/modules/[^/]+'`
  - `zm add <arg1> <arg2>` → `zm list` shows `<arg2>-><arg1>` (REVERSED order)
  - sync.sh whiteout rules: `zm add <vpath> /nonexistent` → LEFT side = `/nonexistent` → no module match
- **Fix:** Added `_zm_register_whiteout()` in mode_zeromount.sh:
  - After sync.sh, also calls `zm add <vpath> <module_chardev_path>` directly
  - Module char device path on LEFT side → WebUI detects "Loaded"
- **Verified on device:** `zm list` shows all rules with module paths, WebUI shows "Loaded", "Active"

### Key Discovery — zm Binary Format
- `zm add <arg1> <arg2>` → `zm list` shows `<arg2>-><arg1>` (arg2 on LEFT, arg1 on RIGHT)
- arg1 = virtual target path (what to intercept)
- arg2 = source file path (what to serve instead)
- `zm del <virtual_path>` removes rule by target (arg1)
- For whiteouts: use module char device path as arg2 (not /nonexistent) for WebUI detection

## Session 14 Summary

### Debloat Tab UX Overhaul
- Collapsible accordion with chevron toggles, all sections collapsed by default
- Tap-to-select (no checkboxes), instruction text below search bar
- Section order: All System Apps (flat) → Safe to Remove → Essential → Caution → Google Services
- No "Unknown" section (matching SAN exactly — util.js:857 skips unknown filter)
- Unknown apps appear only in "All System Apps" with neutral border
- Accent-ring circle detail button (28px, info 'i' icon)

### SystemizeTab Fancy Promotion Dialog
- Fancy target selector: Privileged (shield icon, accent glow) vs System (phone icon, dimmed)
- "Choose installation level" header with descriptive text

### Scanner Fallback Path Fix
- Fixed `scanner.sh:11` from `$MODDIR/webroot/categories.json` to `$MODDIR/data/categories.json`

## Session 13 Summary

### App Icon Pipeline + WebUI Overhaul
- Icon extraction via aapt+unzip, dual-strategy AppIcon component (file/ksu)
- KSU WebView can't follow symlinks across SELinux contexts → use native `getPackagesIcons()` API
- 7 UI changes: ksu icons, no badges, text scroll, conditional header, context-sensitive FAB, vertical sections
- Adversarial audit: 1 CRITICAL + 3 HIGH + 5 MEDIUM backend, 1 HIGH + 3 MEDIUM frontend — all fixed

## Session 12 Summary

### ZeroMount Integration + Logging + Device Testing
- ZeroMount = VFS redirection, SUSFS = hiding. Use whiteouts + sync.sh delegation.
- Unified logging (frontend → backend debug.log via ksuExec)
- Monitor self-healing supervisor (auto-restart, max 10 retries)
- 16/16 device tests passed

## Files Modified (Session 15)

### Frontend (webui-proposals/proposal-a/src/)
- `routes/SystemizeTab.tsx` — Full rewrite (tap-to-select + selection indicators + batch action bar)
- `components/scalpel/ContextFAB.tsx` — SystemizeFAB glass morphism + batch promote modal
- `routes/DebloatTab.tsx` — Safe to Remove expanded by default (1 line change)

### Backend (module/)
- `modes/mode_zeromount.sh` — Added `_zm_register_whiteout()` helper for ZeroMount WebUI detection

### Build Output (module/webroot/)
- `index.html`, `assets/index-BLS6edH9.js`, `assets/index-DtaI-oLg.css`

## Module Structure
```
module/
├── META-INF/           <- Magisk flasher
├── bin/arm64-v8a/      <- jq, aapt
├── bin/armeabi-v7a/    <- jq, aapt
├── core/               <- 11 scripts (config, logging, bootloop, detect, scanner, monitor, post_boot, etc.)
├── modes/              <- 6 mode scripts (pm, whiteout, zeromount, magisk, mountify, symlink)
├── systemize/          <- promote.sh, permissions.sh
├── data/               <- categories.json
├── webroot/            <- Built WebUI (Solid.js + TS)
├── module.prop
├── customize.sh
├── service.sh
├── post-fs-data.sh
├── boot-completed.sh
├── action.sh
└── uninstall.sh
```

## WebUI Structure (webui-proposals/proposal-a/src/)
```
src/
├── lib/                <- types.ts, api.ts, api.mock.ts, store.ts, theme.ts, icons.ts, constants.ts, ksuApi.ts, logger.ts, textScroll.ts, ksu.d.ts
├── components/
│   ├── core/           <- Badge, Button, Card, Input, Skeleton, Toggle, AppIcon (+CSS files)
│   ├── layout/         <- Header, NavBar, Modal, Toast (+CSS files)
│   └── scalpel/        <- ContextFAB, AppDetailSheet
├── routes/             <- DebloatTab, SystemizeTab, StatusTab, SettingsTab
├── App.tsx
├── app.css
└── index.tsx
```

## Device Testing Status (Cumulative)
| Test | Status | Session |
|------|--------|---------|
| Installation via `ksud module install` | PASS | 5 |
| Config initialization | PASS | 12 |
| App scan (162 apps) | PASS | 12 |
| Mode detection (zeromount) | PASS | 12 |
| Debloat operation (whiteout created) | PASS | 12 |
| Path hiding verified (app invisible) | PASS | 12 |
| Verify operation (1 verified, 0 broken) | PASS | 12 |
| Restore operation (whiteout removed) | PASS | 12 |
| Path restore verified (app visible again) | PASS | 12 |
| Unified logging (frontend → backend) | PASS | 12 |
| Monitor daemon running | PASS | 12 |
| WebUI loads correctly | PASS | 12 |
| Debloat tab functional | PASS | 12 |
| Status tab shows correct mode | PASS | 12 |
| Settings persist across reload | PASS | 12 |
| Reboot FAB works | PASS | 12 |
| App icons via KSU native API | PASS | 13 |
| ZeroMount WebUI shows Scalpel as "Loaded" | PASS | 15 |
| 4 apps nuked (FM Radio, YouTube, etc.) | PASS | 15 |
| 2 apps promoted (AppListDetector, Checker) | PASS | 15 |

## Key Learnings (Session 15)
1. `zm add <arg1> <arg2>` → `zm list` shows `<arg2>-><arg1>` (reversed order)
2. arg1 = virtual target path, arg2 = source file path
3. `zm del <virtual_path>` removes by target (arg1)
4. For whiteouts: use module char device path as arg2 (not /nonexistent) for WebUI detection
5. ZeroMount WebUI extracts LEFT side of `zm list` → module path must be on LEFT (= arg2 position)

## Key Architecture Decisions (Accumulated)
- **ZeroMount integration (updated Session 15):** Scalpel creates whiteouts + calls sync.sh for SUSFS delegation, THEN registers whiteout with `zm add <vpath> <module_chardev_path>` for WebUI visibility
- **App icons:** KSU native `getPackagesIcons()` API primary, file-based symlink fallback (SELinux blocks WebView symlink traversal)
- **WebUI layout:** Header only on Status/Settings. Vertical category sections. No PRIV/category badges. Text scroll on overflow. Context-sensitive FABs (Reboot/Nuke/Systemize). Glass morphism SystemizeFAB.
- **Debloat UX:** Collapsible accordion, "Safe to Remove" expanded by default, tap-to-select, SAN-matching unknown handling
- **Systemize UX:** Tap-to-select with selection indicators, batch promote via glass FAB, fancy target selector (Privileged vs System)

## Next Session Tasks
1. Test tap-to-select + batch promote flow end-to-end on device (select apps → tap glass FAB → choose target → promote)
2. Test restore flow: does `zm del` properly clean up both `/nonexistent` and module-path rules?
3. Reboot device and verify: (a) whiteouts persist, (b) ZeroMount metamount.sh processes at boot, (c) WebUI correct state
4. Consider expanding categories.json with Xiaomi/MediaTek package classifications (57% unknown)
5. End-to-end systemize test (promote → reboot → verify FLAG_SYSTEM)
6. Update stale docs (FOCUS.md, progress.json, features.json)
7. Final release preparation (ZIP, version tag, release notes)
