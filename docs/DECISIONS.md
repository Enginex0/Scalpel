# Decisions Log

## Decisions

### Decision 1: Project Scope — Debloater + Systemizer

**Date:** 2026-01-31
**Status:** Accepted

**Context:**
Three reference projects analyzed: systemapp_nuker (debloat only), ZeroMount (module mounting), Terminal Systemizer (systemize only). No existing module combines both directions.

**Options Considered:**
1. **Debloater only** — Focused scope, faster to ship
2. **Both debloater + systemizer** — Comprehensive tool, fills market gap
3. **Debloater + lite systemizer** — Middle ground

**Decision:**
Both (Option 2). Terminal Systemizer is deprecated (9 years old), Magisk-only, and broken (doesn't remove user copy before reboot). Architecture supports both from day one, implementation phased — debloater first.

**Consequences:**
- We gain: First module to combine both directions with multi-mode support
- We lose: Larger scope, longer development
- We must now: Design mode engine interface that supports both debloat and systemize operations

---

### Decision 2: Detection-Resistant Hiding via ZeroMount

**Date:** 2026-01-31
**Status:** Accepted

**Context:**
ZeroMount (user's own project) provides VFS-level path interception invisible to /proc/mounts. Scalpel could leverage this when available.

**Decision:**
Yes, as top-tier optional mode. Scalpel detects ZeroMount presence (/dev/zeromount), uses `zm` CLI to register paths. Zero extra kernel code in Scalpel itself. Falls back to overlayfs when ZeroMount unavailable.

**Consequences:**
- We gain: Best possible detection resistance when ZeroMount is the active metamodule
- We lose: Nothing — graceful fallback means no compatibility cost
- We must now: Implement ZeroMount detection and `zm add`/`zm del` integration in mode_zeromount.sh

---

### Decision 3: All Six Mounting Modes

**Date:** 2026-01-31
**Status:** Accepted

**Context:**
Six possible modes identified across reference projects, ranging from best detection resistance to best compatibility.

**Decision:**
Support all six: VFS interception (B2), overlayfs whiteouts (B1), standalone mountify/tmpfs (B4), symlink overlay (B5), Magisk magic mount (B3), pm disable fallback (B6). Maximum device coverage.

**Consequences:**
- We gain: Works on virtually any rooted Android device
- We lose: Six code paths to maintain and test
- We must now: Isolate each mode in its own script file, define clean mode interface

---

### Decision 4: Auto-Detection with Boot Re-evaluation

**Date:** 2026-01-31
**Status:** Accepted

**Context:**
SAN locks mode at install time — can't adapt to kernel updates or metamodule changes.

**Decision:**
Re-evaluate at every boot. Probe from best to worst, stop at first capable mode. User can override via config file.

**Probe order:** ZeroMount → mountify/tmpfs → symlink overlay → overlayfs whiteouts → magic mount → pm disable

**Consequences:**
- We gain: Always uses best available mode, adapts to device changes
- We lose: Slightly longer boot (probe takes <1s)
- We must now: Make probe chain fast and deterministic

---

### Decision 5: All Three Root Managers

**Date:** 2026-01-31
**Status:** Accepted

**Decision:**
Magisk + KernelSU + APatch. Detection via environment variables ($KSU, $APATCH) with Magisk as default fallback.

---

### Decision 6: WebUI with Solid.js + TypeScript

**Date:** 2026-01-31
**Status:** Accepted

**Decision:**
Solid.js + TypeScript + Vite, reusing ZeroMount's proven patterns. No terminal TUI. KSU bridge API via `ksu.exec()`.

**Rationale:** User already knows Solid.js from ZeroMount. Type safety prevents the kind of bugs found in SAN's 1114-line util.js. Reactive signals provide clean state management.

---

### Decision 7: Infrastructure Features

**Date:** 2026-01-31
**Status:** Accepted

**Decision:**
- 3-strike bootloop protection with config backup/restore
- Background monitor daemon (included from v1)
- SUSFS through ZeroMount only (no standalone engine)
- App categorization database (extend SAN's 292-app categories)
- Priv-app permission XML generation
- App icon extraction and serving

---

### Decision 8: Shell + jq Architecture

**Date:** 2026-01-31
**Status:** Accepted

**Decision:**
Shell scripts with jq for JSON. No custom C binary. Stock-kernel-only (ZeroMount integration via CLI, not kernel patches). Modular file architecture (<200 lines per file). Dependencies: aapt (ARM32+ARM64), jq, busybox.

---

### Decision 9: Project Name — Scalpel

**Date:** 2026-01-31
**Status:** Accepted

**Context:**
"App-Nuker" only conveyed the debloat side. Needed a name reflecting dual capability, precision, and professionalism.

**Decision:**
Scalpel. One word, conveys clinical precision, works for both cutting away (debloat) and making incisions (systemize). module_id: `scalpel`.

---

### Decision 10: Clinical Systemization Protocol

**Date:** 2026-01-31
**Status:** Accepted

**Context:**
Terminal Systemizer's approach fails because it copies APK to /system but never removes the /data/app user copy. PMS keeps sourceDir pointing to /data/app, apps don't detect system status.

**Decision:**
Full clinical protocol: copy APK + splits → set permissions + SELinux → generate priv-app XML → `pm uninstall -k --user 0` → reboot → verify FLAG_SYSTEM + sourceDir. The missing step (pm uninstall -k) is what makes the difference.

**Consequences:**
- We gain: True system app recognition by any detection method
- We lose: Slightly more complex systemization flow
- We must now: Handle split APKs, native libs, dalvik cache cleanup, multi-user scenarios

---

### Decision 11: System App List — Scan Once at Install

**Date:** 2026-01-31
**Status:** Accepted

**Context:**
SAN regenerates the full system app list at every boot (service.sh) and every WebUI load. This takes 30-60s and is wasteful — system apps don't change between boots.

**Decision:**
Generate app_list.json once during customize.sh installation. Cache in /data/adb/scalpel/. WebUI loads cached JSON instantly. Manual refresh button in WebUI for rare cases (ROM update, manual system changes).

**Consequences:**
- We gain: Instant WebUI load, no boot-time scanning overhead
- We lose: Auto-detection of system app changes (mitigated by manual refresh)
- We must now: Run scanner in customize.sh context, add WebUI refresh trigger

---

### Decision 12: Reuse ZeroMount WebUI Components

**Date:** 2026-01-31
**Status:** Accepted

**Context:**
ZeroMount's Solid.js WebUI already has proven KSU bridge, icon loading, theme system, and component library. Building from scratch wastes effort.

**Decision:**
Fork ZeroMount's webroot-beta/ as the starting point. Reuse bridge.ts, theme system, component library, Vite config, icon loading patterns. Adapt tab contents for Scalpel (Debloat, Systemize, Status, Settings). User app list uses ZeroMount's method (pm list packages + KSU native API for icons).

**Consequences:**
- We gain: Proven, tested UI foundation. Faster development.
- We lose: Nothing — adaptation is strictly additive
- We must now: Locate ZeroMount webroot source, strip ZeroMount-specific tabs, add Scalpel tabs

---

### Decision 13: Floating Reboot Button (FAB)

**Date:** 2026-01-31
**Status:** Accepted

**Decision:**
Fixed-position Floating Action Button at bottom-right of WebUI (above tab bar). Confirmation dialog before executing reboot. Always visible. Uses `ksuExec('svc power reboot')`.

---

### Decision 14: Default Debloat List with Volume Key at Install

**Date:** 2026-01-31
**Status:** Accepted

**Context:**
Users often want a standard debloat applied immediately. Volume key selection during customize.sh provides a quick opt-in during installation.

**Decision:**
During customize.sh: display curated default nuke list (package names), prompt with volume keys. Vol UP = apply debloat list, Vol DOWN = skip. 7-second timeout = SKIP (safe default). If applied, write nuke_list.json. Post-fs-data.sh processes it on first reboot. Package names provided by user later — this is the last backend task before WebUI.

Volume key detection pattern: `getevent -qlc 1 | grep KEY_ | awk '{print $3}'` (from Simple-Flag-Secure reference).

**Consequences:**
- We gain: Quick-start debloat for power users, zero WebUI interaction needed
- We lose: Nothing — skip is the safe default
- We must now: Bundle default_nuke_list.json, implement volume key timeout logic

---

### Decision 15: pm mode deferred to service.sh

**Date:** 2026-01-31
**Status:** Accepted

**Context:**
pm disable-user requires PackageManagerService which isn't running during post-fs-data.

**Decision:**
post-fs-data.sh runs nuke for all modes. If mode is "pm", nuke.sh runs but pm commands fail (PMS unavailable). service.sh detects this via status.json (debloat_failed > 0) and re-runs nuke.

**Rationale:**
Keeps nuke.sh mode-agnostic. The pm mode failure is expected and handled by the retry in service.sh.

**Alternative considered:**
Skip nuke entirely in post-fs-data when mode=pm. Rejected because it adds boot-stage awareness to the orchestrator.
