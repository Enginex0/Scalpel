# Scalpel -- Project Context

> **Purpose:** Session handoff document. Read this first to understand where we are.
> **Last updated:** 2026-02-01 (end of Session 3, after polish round)
> **Polish Round:** All 36 MEDIUM/LOW/TAG findings resolved. Backend validated at 100/100 score. Ship-ready.

---

## Current State

**Features:** 21/26 done (81%)
**Backend:** 100% complete. All 6 modes, all boot scripts, scanner, installer, uninstaller, monitor, action.sh.
**Validation:** Phase C comprehensive audit passed. 3 CRITICAL + 3 HIGH bugs found and fixed.
**Frontend:** Not started. 5 WebUI features remaining (scaffold, debloat, systemize, status, settings).
**Next:** Phase D -- WebUI Frontend (fork ZeroMount webroot-beta).

---

## Session 3 Summary (2026-02-01)

### What was done

1. **Documentation-first approach:** Fetched KernelSU/APatch/Android shell documentation (5 reference docs, ~5,300 lines total). Used these to validate existing code and inform new features.

2. **Phase A.1 -- Validation Fix Round:** Fixed 5 bugs identified in Wave 1 audit of existing code from Sessions 1-2.

3. **Phase B -- Backend Completion:** Built 4 remaining backend files:
   - `mode_mountify.sh` -- tmpfs+overlayfs standalone mount per partition
   - `mode_symlink.sh` -- empty opaque directory technique for overlayfs-native managers
   - `monitor.sh` -- inotifywait/logcat/poll fallback chain, 5s polling interval
   - `action.sh` -- KSUWebUIStandalone/MMRL detection + download + launch

4. **Phase B5 -- KSU Feature Integration:** Leveraged KernelSU-specific APIs:
   - `boot-completed.sh` -- native KSU/APatch boot-completed hook (eliminates getprop polling)
   - `post_boot.sh` -- shared post-boot helper (used by both service.sh and boot-completed.sh)
   - `REMOVE variable` -- install-time whiteout via KSU/APatch (instant debloat before first boot)
   - `override.description` -- KSU API for dynamic module description (cleaner than sed on module.prop)

5. **Phase C -- Comprehensive Backend Validation:** 2 auditors, 7 fix rounds. All CRITICAL/HIGH resolved:
   - **C-01:** pm at post-fs-data -- changed PMS readiness check from pidof to `pm path android`
   - **C-02:** scanner retry logic -- fixed retry mechanism for scanner failures
   - **C-03:** setprop deadlock -- replaced setprop with file-based flags at post-fs-data on KSU
   - **C-01b:** jq deletion -- customize.sh cleanup no longer removes bundled binaries
   - **C-02b:** config override clobbering -- save/restore overrides around config_init()
   - **C-03b:** negative BOOTCOUNT -- clamp to >= 0, preserve -1 recovery marker
   - **H-01:** nuke timeout guard -- timing guard for KSU's ~10s post-fs-data limit
   - **H-04:** setfattr non-fatal -- whiteout creation succeeds even without setfattr

### New files created

| File | Purpose |
|------|---------|
| `module/mode_mountify.sh` | Mode: standalone tmpfs+overlayfs per partition |
| `module/mode_symlink.sh` | Mode: symlink + overlayfs with opaque directories |
| `module/monitor.sh` | Background monitor daemon with fallback chain |
| `module/action.sh` | Magisk WebUI launcher (KSUWebUIStandalone/MMRL) |
| `module/boot-completed.sh` | KSU/APatch native boot-completed hook |
| `module/post_boot.sh` | Shared post-boot helper (verify, monitor, description) |
| `docs/reference/kernelsu-module-config.md` | KSU module configuration reference |
| `docs/reference/kernelsu-module-webui.md` | KSU WebUI API reference |
| `docs/reference/kernelsu-module-guide.md` | KSU module development guide |
| `docs/reference/kernelsu-additional-docs.md` | KSU additional docs (boot stages, etc.) |
| `docs/reference/android-shell-reference.md` | Android shell command reference |
| `docs/reference/INDEX.md` | Reference document index |
| `docs/COMPLIANCE.md` | KSU/APatch compliance checklist |
| `docs/validation/AUDIT-BACKEND-VS-DOCS.md` | Backend vs documentation audit |
| `docs/validation/VALIDATION-WAVE1-REX.md` | Wave 1 Red Team Rex report |
| `docs/validation/VALIDATION-WAVE1-RIGOR.md` | Wave 1 Prof. Rigor report |
| `docs/validation/VALIDATION-WAVE3-REX.md` | Wave 3 Red Team Rex report |
| `docs/validation/VALIDATION-WAVE3-RIGOR.md` | Wave 3 Prof. Rigor report |
| `docs/validation/PHASE-C-AUDIT-COMPREHENSIVE.md` | Phase C comprehensive audit |
| `docs/validation/PHASE-C-CROSS-MANAGER-E2E.md` | Phase C cross-manager E2E test plan |

### Files modified

| File | Changes |
|------|---------|
| `module/detect.sh` | Added mountify + symlink probe functions |
| `module/nuke.sh` | Timing guard, nuke.lock lifecycle, mountify/symlink dispatch |
| `module/service.sh` | Config override save/restore, post_boot.sh integration |
| `module/post-fs-data.sh` | File-based signaling (no setprop), timing guard |
| `module/customize.sh` | REMOVE variable for KSU, cleanup preserves bin/, scanner fixes |
| `module/bootloop.sh` | Negative BOOTCOUNT clamping, sysrq-trigger fallback reboot |
| `module/whiteout_helpers.sh` | setfattr non-fatal, improved error handling |
| `module/scanner.sh` | Retry logic fix |
| `module/uninstall.sh` | Cleanup improvements |
| `module/config.sh` | Regex hardening, config_init override preservation |
| `module/module.prop` | Updated for KSU override.description support |
| `docs/DESIGN.md` | Updated with new modes and KSU features |
| `docs/ARCHITECTURE.md` | Updated boot sequence with KSU-specific paths |

### Key architectural changes

1. **boot-completed.sh + post_boot.sh:** KSU/APatch get a native boot-completed hook. Both service.sh (Magisk path) and boot-completed.sh (KSU path) call the shared post_boot.sh helper, avoiding code duplication.

2. **REMOVE variable:** On KSU/APatch, default debloat packages are written to the REMOVE variable during customize.sh. This creates whiteouts at install time -- apps are hidden before the first boot, no post-fs-data processing needed.

3. **override.description:** On KSU, the module description is updated via override.description file instead of sed on module.prop. Falls back to sed for Magisk.

4. **File-based signaling:** Replaced setprop at post-fs-data with touch-file flags to avoid deadlocks on KSU.

5. **Timing guard:** nuke.sh monitors elapsed time and defers remaining operations to service.sh if approaching KSU's ~10s post-fs-data timeout.

---

## What's Next: Phase D -- WebUI Frontend

### Before Starting
Read these reference docs first to understand KSU WebUI API and ZeroMount patterns:
- `docs/reference/kernelsu-module-webui.md` -- KSU WebUI JavaScript API (exec, toast, fullScreen)
- `/home/claudetest/zero-mount/nomount/webui-v2-beta/` -- ZeroMount reference implementation (fork this)

### Approach
Fork ZeroMount's webroot-beta (`/home/claudetest/zero-mount/nomount/webui-v2-beta/`) as the starting point. Reuse:
- bridge.ts (shell command execution bridge)
- Theme system (dark/light + accent colors)
- Component library (cards, dialogs, buttons, icons)
- Vite + Solid.js + TypeScript build config
- Icon loading system

### Features to build (5 remaining)
1. **webui-scaffold** -- Fork, strip ZeroMount tabs, add Scalpel tabs (Debloat, Systemize, Status, Settings), floating reboot FAB
2. **webui-debloat** -- App list with lazy loading, category badges, fuzzy search, multi-select, confirmation + risk warnings, nuke button
3. **webui-systemize** -- User app list, target selection (app/priv-app), promote button, post-reboot verification
4. **webui-status** -- Active mode, debloated/systemized counts, bootloop counter, module health, last operation log
5. **webui-settings** -- Mode override, theme, accent colors, logging toggle, clear all, export/import config

### Reference doc index

| Document | Path | What it covers |
|----------|------|----------------|
| KSU Module Config | `docs/reference/kernelsu-module-config.md` | module.prop fields, REMOVE, REPLACE, skip_mount, webroot |
| KSU WebUI API | `docs/reference/kernelsu-module-webui.md` | exec(), toast(), fullScreen() JS APIs for KSU WebUI |
| KSU Module Guide | `docs/reference/kernelsu-module-guide.md` | Module structure, lifecycle, customize.sh, boot scripts |
| KSU Additional | `docs/reference/kernelsu-additional-docs.md` | Boot stages, SELinux, overlay details |
| Android Shell | `docs/reference/android-shell-reference.md` | toybox/toolbox commands, pm, am, getprop, mount |
| Reference Index | `docs/reference/INDEX.md` | Master index of all reference documents |
| Compliance | `docs/COMPLIANCE.md` | KSU/APatch API compliance checklist |

---

## File inventory (all module scripts)

### Core (Phase 1-2)
- `module/config.sh` -- Config system with migration and safe sourcing
- `module/logging.sh` -- 5-level logging with rotation and kmsg mirror
- `module/bootloop.sh` -- 3-strike bootloop protection with counter clamping
- `module/detect.sh` -- 6-mode probe chain with config override

### Modes (Phase 3-4, B)
- `module/mode_pm.sh` -- pm disable/enable fallback (universal)
- `module/mode_whiteout.sh` -- overlayfs whiteout creation (primary)
- `module/mode_zeromount.sh` -- ZeroMount VFS interception (stealth)
- `module/mode_magisk.sh` -- Magisk magic mount (for systemizer)
- `module/mode_mountify.sh` -- tmpfs+overlayfs standalone mount
- `module/mode_symlink.sh` -- symlink + opaque directory overlay
- `module/whiteout_helpers.sh` -- Shared whiteout creation utilities

### Orchestrators (Phase 5, 7)
- `module/nuke.sh` -- Debloat orchestrator (dispatches to active mode)
- `module/verify.sh` -- Post-debloat verification
- `module/post-fs-data.sh` -- Early boot entry point
- `module/service.sh` -- Late boot orchestration (Magisk path)
- `module/boot-completed.sh` -- Boot-completed hook (KSU/APatch path)
- `module/post_boot.sh` -- Shared post-boot helper

### Systemizer (Phase 6)
- `module/promote.sh` -- 9-step clinical systemization engine
- `module/permissions.sh` -- Priv-app permissions XML generator

### Scanner + Installer (Phase 7)
- `module/scanner.sh` -- System app scanner (runs at install)
- `module/customize.sh` -- Installation logic + config migration + REMOVE
- `module/default_debloat.sh` -- Volume key default debloat prompt
- `module/uninstall.sh` -- Cleanup and restoration

### Infrastructure (Phase B)
- `module/monitor.sh` -- Background monitor daemon
- `module/action.sh` -- Magisk WebUI launcher

### Data files
- `module/categories.json` -- 692 apps classified across 5 risk tiers, 8 OEMs
