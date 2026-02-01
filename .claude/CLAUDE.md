# Scalpel — Project Protocol

**Module name:** Scalpel (module_id: `scalpel`)
**Working directory:** `/home/claudetest/zero-mount/App-Nuker/`
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
- **Modes:** All 6 — ZeroMount VFS, overlayfs whiteouts, mountify/tmpfs, symlink overlay, Magisk mount, pm disable
- **Auto-detect:** Re-evaluate at every boot, best-to-worst fallback, config override
- **Root managers:** Magisk + KernelSU + APatch
- **UI:** Solid.js + TypeScript WebUI (forked from ZeroMount). Floating reboot FAB. No terminal TUI.
- **Tech:** Shell + jq. No custom C binaries. Stock kernel only.
- **Safety:** 3-strike bootloop protection with config backup/restore
- **Scanner:** Runs ONCE at install (customize.sh), cached. WebUI loads instantly. Refresh button for rare cases.
- **Default debloat:** Volume key prompt during install (UP=apply, DOWN=skip, timeout=SKIP)
- **Systemization fix:** `pm uninstall -k --user 0` before reboot (what Terminal Systemizer missed)

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
- New ideas → FOCUS.md "Idea Capture" (don't chase them)

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
**Accomplishment:** Built Phase 0-3 from blank slate (scaffold + config + logging + categories + bootloop + detect + mode_pm + scanner)
**Files built:** 24 files (7 implemented, 16 stubs, 1 context.md)
**Validated:** config.sh (2 critical + 3 high fixed), categories.json (5 misclassifications fixed)
**Next:** Phase 4 (mode_whiteout, mode_zeromount, mode_magisk, nuke.sh, verify.sh)
**Context:** Read context.md for full project state

### Session 2 — 2026-01-31
**Accomplishment:** Built Phases 4-7 from scratch (13 new files, ~1450 lines total). 4 adversarial audit rounds (8 validators), 3 fix rounds (23+ fixes). All validated.
**Files built:** whiteout_helpers.sh, mode_whiteout.sh, mode_zeromount.sh, mode_magisk.sh, nuke.sh, verify.sh, post-fs-data.sh, service.sh, promote.sh, permissions.sh, customize.sh, default_debloat.sh, uninstall.sh
**Key decisions:** pm mode deferred to service.sh (Decision 15), shared whiteout helpers, secure bootloop counter reading, verify reads mode from status.json, bootloop_reset after boot_completed
**Critical fixes:** Source injection in bootloop counter, premature counter reset, getprop timeout, pm retry mode forcing, config/log init, vendor symlink dedup, corrupt JSON handling
**Next:** Phase 8 (WebUI scaffold, debloat tab, systemize tab, status tab)
**Context:** Read context.md for full project state. 17/26 features done (65%).

### Session 3 — 2026-02-01
**Accomplishment:** Documentation-first approach. Fetched KernelSU/APatch/Android shell docs (5 reference docs, ~5,300 lines). Restructured phases: backend -> validation -> frontend. Fixed 3+3 CRITICAL/HIGH bugs from Phase A audit. Built Phase B (4 new files: mode_mountify, mode_symlink, monitor, action.sh). Integrated KSU features (boot-completed.sh, post_boot.sh, REMOVE variable, override.description). Phase C comprehensive validation (2 auditors, 7 fix rounds). Polish round: TAG refactor across 16 files, resolved all 36 MEDIUM/LOW/TAG findings. Backend at 100/100 score, ship-ready.
**Files built:** mode_mountify.sh, mode_symlink.sh, monitor.sh, action.sh, boot-completed.sh, post_boot.sh
**Files modified:** 16 files refactored for TAG consistency (detect.sh, nuke.sh, service.sh, post-fs-data.sh, customize.sh, bootloop.sh, whiteout_helpers.sh, scanner.sh, uninstall.sh, config.sh, mode_whiteout.sh, mode_zeromount.sh, monitor.sh, promote.sh, permissions.sh, action.sh)
**Reference docs created:** kernelsu-module-config.md, kernelsu-module-webui.md, kernelsu-module-guide.md, kernelsu-additional-docs.md, android-shell-reference.md, INDEX.md, COMPLIANCE.md
**Validation reports:** AUDIT-BACKEND-VS-DOCS.md, VALIDATION-WAVE1-REX.md, VALIDATION-WAVE1-RIGOR.md, VALIDATION-WAVE3-REX.md, VALIDATION-WAVE3-RIGOR.md, PHASE-C-AUDIT-COMPREHENSIVE.md, PHASE-C-CROSS-MANAGER-E2E.md, PHASE-POLISH-TAG-REFACTOR.md
**Key fixes:** setprop deadlock (C-03), pm at post-fs-data (C-01), scanner retry (C-02), jq deletion (C-01b), config override clobbering (C-02b), negative BOOTCOUNT (C-03b), setfattr non-fatal (H-04), nuke timeout guard (H-01), nuke.lock lifecycle, config regex hardening. Polish: TAG syntax fixes (36 findings), variable shadowing, comment alignment.
**Next:** Phase D (WebUI scaffold, debloat tab, systemize tab, status tab, settings tab)
**Context:** 21/26 features done (81%). Backend 100% complete and 100/100 validated. Ship-ready.
