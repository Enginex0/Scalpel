# Focus Protocol

> **Rule: ONE thing until DONE or explicitly ABANDONED with reason.**
> **Open this file every morning. Update it every session.**

---

## CURRENT FOCUS

> **You cannot start anything new until this is DONE or moved to ABANDONED.**

### Active Task

**Feature ID:** webui-scaffold
**Title:** Phase D: WebUI Frontend
**Started:** (next session)
**Backend Status:** 100% COMPLETE — 100/100 validation score, ship-ready

**Success Criteria:**
- [ ] Fork ZeroMount's webroot-beta/ as starting point
- [ ] Reuse bridge.ts, theme system, component library, Vite config, icon loading
- [ ] Strip ZeroMount-specific tabs
- [ ] Add tab navigation: Debloat, Systemize, Status, Settings
- [ ] Add floating reboot FAB button with confirmation dialog
- [ ] Debloat tab: app list + category badges + fuzzy search + multi-select + nuke
- [ ] Systemize tab: user app list + target selection + promote
- [ ] Status tab: active mode + counts + bootloop counter + health + logs
- [ ] Settings tab: mode override + theme + accent + logging + export/import

**Why this matters:**
Phase D is the WebUI -- the primary user interface for Scalpel. All backend work (Phases 0-9 + validation + polish) is complete and validated at 100/100. The WebUI makes it usable. 5 features remain, all WebUI. Start with reference docs at docs/reference/kernelsu-module-webui.md and ZeroMount webui-v2-beta.

**Days Active:** 0

**Today's Goal:**
Fork ZeroMount webroot-beta, adapt for Scalpel tabs, add reboot FAB.

---

## Implementation Order (MVP)

Build order follows dependency chain. Each feature unlocks the next.

```
PHASE 1: Foundation (no dependencies)                    [DONE]
  |- core-config      -- config read/write/migrate/backup
  |- core-logging     -- structured logging with rotation
  +- categories-db    -- app risk classifications (data file)

PHASE 2: Detection + Safety                              [DONE]
  |- core-bootloop    -- 3-strike protection (needs config)
  +- core-detect      -- mode probe chain (needs config + logging)

PHASE 3: First Mode + Scanner                            [DONE]
  |- mode-pm          -- pm disable fallback (proves mode interface)
  +- core-scanner     -- app discovery (runs at INSTALL, not boot)

PHASE 4: Primary Modes                                   [DONE]
  |- mode-whiteout    -- overlayfs whiteouts (primary debloat)
  |- mode-zeromount   -- ZeroMount VFS (top-tier stealth)
  +- mode-magisk      -- magic mount (needed for systemizer)

PHASE 5: Boot Integration                                [DONE]
  |- boot-postfs      -- post-fs-data.sh entry point
  +- boot-service     -- service.sh (NO scanning, just verify + monitor)

PHASE 6: Systemizer                                      [DONE]
  |- systemize-promote    -- clinical systemization engine
  +- systemize-permissions -- priv-app XML generation

PHASE 7: Installation (scanner + default debloat)        [DONE]
  |- install-customize     -- customize.sh (config + scan + binaries)
  |- install-default-debloat -- volume key debloat prompt
  +- uninstall-cleanup     -- uninstall.sh restoration

PHASE A.1: Validation Fix Round                          [DONE]
  +- 5 fixes from Wave 1 audit (config, bootloop, scanner, nuke, detect)

PHASE B: Backend Completion                              [DONE]
  |- mode-mountify    -- standalone tmpfs+overlayfs (mode_mountify.sh)
  |- mode-symlink     -- symlink+overlayfs (mode_symlink.sh)
  |- monitor-daemon   -- background polling (monitor.sh)
  +- action-webui-launcher -- Magisk WebUI bridge (action.sh)

PHASE B5: KSU Feature Integration                        [DONE]
  |- boot-completed.sh  -- KSU/APatch native boot-completed hook
  |- post_boot.sh       -- shared post-boot helper
  |- REMOVE variable    -- install-time whiteout via KSU/APatch
  +- override.description -- KSU API for dynamic module description

PHASE C: Comprehensive Backend Validation                [DONE]
  +- 2 auditors, 7 fix rounds, 3 CRITICAL + 3 HIGH resolved

PHASE D: WebUI Frontend                                  [CURRENT]
  |- webui-scaffold   -- fork ZeroMount, adapt tabs, add reboot FAB
  |- webui-debloat    -- app selection + nuke + refresh scan button
  |- webui-systemize  -- app promotion interface
  |- webui-status     -- mode/health/operation display
  +- webui-settings   -- config UI
```

---

## IDEA CAPTURE

| Date | Idea | After 7 Days? |
|------|------|---------------|
| | | |

---

## GRAVEYARD

*Empty -- nothing abandoned yet.*

---

## COMPLETED

| Feature | Started | Completed | Days |
|---------|---------|-----------|------|
| core-config | 2026-01-31 | 2026-01-31 | 1 |
| core-logging | 2026-01-31 | 2026-01-31 | 1 |
| categories-db | 2026-01-31 | 2026-01-31 | 1 |
| core-bootloop | 2026-01-31 | 2026-01-31 | 1 |
| core-detect | 2026-01-31 | 2026-01-31 | 1 |
| mode-pm | 2026-01-31 | 2026-01-31 | 1 |
| core-scanner | 2026-01-31 | 2026-01-31 | 1 |
| mode-whiteout | 2026-01-31 | 2026-01-31 | 1 |
| mode-zeromount | 2026-01-31 | 2026-01-31 | 1 |
| mode-magisk | 2026-01-31 | 2026-01-31 | 1 |
| boot-postfs | 2026-01-31 | 2026-01-31 | 1 |
| boot-service | 2026-01-31 | 2026-01-31 | 1 |
| systemize-promote | 2026-01-31 | 2026-01-31 | 1 |
| systemize-permissions | 2026-01-31 | 2026-01-31 | 1 |
| install-customize | 2026-01-31 | 2026-01-31 | 1 |
| install-default-debloat | 2026-01-31 | 2026-01-31 | 1 |
| uninstall-cleanup | 2026-01-31 | 2026-01-31 | 1 |
| mode-mountify | 2026-02-01 | 2026-02-01 | 1 |
| mode-symlink | 2026-02-01 | 2026-02-01 | 1 |
| monitor-daemon | 2026-02-01 | 2026-02-01 | 1 |
| action-webui-launcher | 2026-02-01 | 2026-02-01 | 1 |
| Phase A.1: Validation Fix Round | 2026-02-01 | 2026-02-01 | 1 |
| Phase B5: KSU Feature Integration | 2026-02-01 | 2026-02-01 | 1 |
| Phase C: Comprehensive Backend Validation | 2026-02-01 | 2026-02-01 | 1 |

---

## STATS

**Completed:** 21 features + 3 validation/integration phases + 1 polish round
**Abandoned:** 0
**Completion Rate:** 81% (21/26 features)
**Backend Validation Score:** 100/100 (Polish Round)

**Goal:** 80%+ completion rate -- ACHIEVED
**Backend Quality:** Ship-ready (all 36 MEDIUM/LOW/TAG findings resolved, 100/100 score)
