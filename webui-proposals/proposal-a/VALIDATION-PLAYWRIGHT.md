# Proposal A -- Playwright Validation Report

**Auditor:** Red Team Rex (adversarial QA)
**Date:** 2026-02-01
**Method:** Systematic Playwright MCP testing with browser_navigate, browser_screenshot, browser_click, browser_evaluate
**Server:** http://localhost:3001/ (Vite dev server)
**Screenshots:** `validation-screenshots/` directory (19 screenshots)

---

## Executive Summary

Proposal A is **functionally solid** with one **critical bug** (category filter logic inversion) and several medium/low findings. The AMOLED theme, accent color system, and theme switching all work correctly. Data quality is clean -- zero instances of `undefined`, `NaN`, `null`, or `[object Object]` across all tabs. The Reboot FAB is visible on every tab. The UI renders correctly and all interactive elements respond.

| Severity | Count | Summary |
|----------|-------|---------|
| CRITICAL | 1 | Category filter is inverted (exclusion instead of inclusion) |
| HIGH | 0 | -- |
| MEDIUM | 3 | Debloated section not filtered by search; missing detail fields; --bg-page CSS empty |
| LOW | 3 | Category pill counts not filtered; debug log clipped by NavBar; console error for KSU insets |
| INFO | 1 | Bottom sheet dismiss works via backdrop + Escape (not a bug) |

**Overall Score: 82/100** -- Ship-ready after the CRITICAL filter fix.

---

## Test 1: Initial Load and AMOLED Black

**Screenshot:** `validation-screenshots/01-initial-load.png`

| Check | Result |
|-------|--------|
| Page loads without errors | PASS (1 non-blocking error: KSU insets.css) |
| Background is AMOLED black (#000000) | PASS -- `rgb(0, 0, 0)` confirmed via JS |
| No flash of wrong color | PASS -- page renders immediately dark |
| Title "SCALPEL" with subtitle "SURGICAL DEBLOAT" | PASS |
| NavBar with 4 tabs visible | PASS -- Debloat, System, Status, Settings |

**Console Error (LOW-01):**
```
[ERROR] Failed to load resource: net::ERR_NAME_NOT_RESOLVED @ https://mui.kernelsu.org/internal/insets.css
```
Expected in browser dev environment -- this CSS is only available inside KernelSU WebUI runtime. Non-blocking.

---

## Test 2: Debloat Tab

**Screenshots:** `validation-screenshots/01-initial-load.png`, `02-search-google.png`, `03-category-filter-google.png`, `04-detail-sheet-gms.png`

### 2.1 App List
| Check | Result |
|-------|--------|
| "27 apps available" count displayed | PASS |
| Apps sorted and displayed with name + package | PASS |
| PRIV badge on privileged apps | PASS -- Google Play Services, GSF, Play Store, Phone, SystemUI, Settings, Contacts Storage, Telephony Provider, Galaxy Store |
| Category badge on each row | PASS -- Essential/Caution/Safe/Google/Unknown |
| Checkboxes for multi-select | PASS |
| Detail chevron (>) on each row | PASS |

### 2.2 Category Pills
| Check | Result |
|-------|--------|
| Essential (6) | PASS |
| Caution (4) | PASS |
| Safe (10) | PASS |
| Google (5) | PASS |
| Unknown (2) | PASS |
| Total = 27 | PASS (6+4+10+5+2 = 27) |

### 2.3 Debloated Section
| Check | Result |
|-------|--------|
| "Debloated (3)" expandable header | PASS |
| 3 debloated apps listed | PASS -- Xiaomi Analytics, Facebook Services, Facebook Installer |
| RESTORE button on each | PASS |

### 2.4 Search

**Screenshot:** `validation-screenshots/02-search-google.png`

| Check | Result |
|-------|--------|
| Search box accepts input | PASS |
| Typing "google" filters available list | PASS -- 8 results |
| Filtered apps match query | PASS -- all have "google" in name or package |

**FINDING MEDIUM-01: Debloated section not filtered by search**
When searching "google", the debloated section still shows all 3 debloated apps (Xiaomi Analytics, Facebook Services, Facebook Installer) -- none match "google". The debloated section should be filtered by the search term to avoid confusion.

**FINDING LOW-01: Category pill counts not updated during search**
When filtering by search term "google" (8 results), the category pills still show global counts (Essential 6, Caution 4, etc.) rather than filtered counts. This is a UX nit -- users may think the counts represent current filtered results.

### 2.5 Category Filter

**Screenshot:** `validation-screenshots/03-category-filter-google.png`

**FINDING CRITICAL-01: Category filter logic is INVERTED**

Clicking the "Google" filter pill shows **22 apps** instead of the expected **5 Google apps**. The filter works as an **exclusion toggle** (removing Google from the visible set) rather than an **inclusion filter** (showing only Google apps).

**Root cause** (confirmed in source `DebloatTab.tsx` lines 14, 39-43):
- `activeCategories` is initialized with ALL categories in the set
- `toggleCategory` removes the clicked category from the set
- `filteredApps` shows apps whose category IS in the active set
- Clicking "Google" removes Google from active set, hiding Google apps

**Expected behavior:** Clicking "Google" should show only the 5 Google apps.

**Impact:** Users will debloat the wrong apps. This is a usability disaster for the primary workflow.

### 2.6 App Detail Sheet

**Screenshot:** `validation-screenshots/04-detail-sheet-gms.png`

| Check | Result |
|-------|--------|
| Sheet opens on detail button click | PASS |
| App name "Google Play Services" in title | PASS |
| Category "Essential" with colored dot | PASS |
| "Privileged" badge | PASS |
| "Split APK" badge | PASS |
| Package: com.google.android.gms | PASS |
| Path: /system/priv-app/GmsCore/GmsCore.apk | PASS |
| Partition: system | PASS |
| "NUKE THIS APP" button | PASS |
| Sheet dismissable via Escape | PASS |
| Sheet dismissable via backdrop click | PASS (confirmed in Modal.tsx line 43) |

**FINDING MEDIUM-02: Detail sheet missing some backend fields**
The detail sheet shows Package, Path, and Partition but is missing:
- `app_dir` (directory path, distinct from APK path)
- Size information (if available from scanner)

The `is_priv_app` and `has_splits`/`is_split` fields are represented as visual badges ("Privileged", "Split APK") which is acceptable but differs from raw field display.

---

## Test 3: Systemize Tab

**Screenshots:** `validation-screenshots/05-systemize-tab.png`, `06-promote-confirm.png`

### 3.1 Stats Header
| Check | Result |
|-------|--------|
| "2 PROMOTED" stat | PASS |
| "6 AVAILABLE" stat | PASS |

### 3.2 Promoted Section
| Check | Result |
|-------|--------|
| "PROMOTED TO SYSTEM" section header | PASS |
| F-Droid with "Promoted" badge | PASS |
| F-Droid package: org.fdroid.fdroid | PASS |
| F-Droid date: "Promoted: 2026-01-28" | PASS |
| Termux with "Promoted" badge | PASS |
| Termux date: "Promoted: 2026-01-29" | PASS |
| DEMOTE buttons visible | PASS |

### 3.3 Available Section
| Check | Result |
|-------|--------|
| "AVAILABLE USER APPS" section header | PASS |
| Search box present | PASS |
| 6 user apps listed | PASS -- Brave, Telegram, Aurora Store, Magisk, APatch, Spotify |
| PROMOTE buttons with up-arrow icon | PASS |

### 3.4 Promote Confirmation

**Screenshot:** `validation-screenshots/06-promote-confirm.png`

| Check | Result |
|-------|--------|
| Modal opens on Promote click | PASS |
| Title: "Confirm Promotion" | PASS |
| Body: "Promote **Brave Browser** to system?" | PASS (bold app name) |
| Warning: "This survives factory reset. A reboot is required." | PASS |
| CANCEL button | PASS |
| PROMOTE button | PASS |
| Cancel dismisses modal | PASS |

---

## Test 4: Status Tab

**Screenshots:** `validation-screenshots/07-status-tab.png`, `08-status-debug-log.png`

### 4.1 Mode Display
| Check | Result |
|-------|--------|
| Mode name: "OverlayFS Whiteout" | PASS |
| Mode description: "Character device nodes treated as deleted by overlayfs" | PASS |
| Large styled heading | PASS |

### 4.2 Stats Grid
| Check | Result |
|-------|--------|
| Debloated: 3 | PASS |
| Failed: 0 | PASS |
| Verified: 3 | PASS |
| Broken: 0 | PASS |
| Systemized: 2 | PASS |
| Repairs: 1 | PASS |
| All values numeric (no NaN/undefined) | PASS |
| Values are realistic | PASS |

### 4.3 Bootloop Protection
| Check | Result |
|-------|--------|
| Counter: "0/3" | PASS |
| Status: "Healthy" | PASS |
| Visual indicator (3 dots) | PASS |

### 4.4 Monitor Daemon
| Check | Result |
|-------|--------|
| Status: "Running" with green dot | PASS |
| Interval: "300s" | PASS |

### 4.5 Last Operation
| Check | Result |
|-------|--------|
| Last nuke: 1/31/2026, 9:00:00 AM | PASS |
| Last verify: 1/31/2026, 9:01:00 AM | PASS |
| Last monitor: 1/31/2026, 9:10:09 AM | PASS |
| Dates formatted correctly | PASS |
| Times are realistic (sequential) | PASS |

### 4.6 Debug Log

**Screenshot:** `validation-screenshots/08-status-debug-log.png`

| Check | Result |
|-------|--------|
| Expandable section | PASS |
| 18 log entries visible | PASS |
| Timestamps: [2026-01-31 08:00:01] format | PASS |
| TAG names match backend: service, config, detect, nuke, verify, bootloop, monitor | PASS |
| Log levels: INFO and WARN present | PASS |
| Content is realistic boot sequence | PASS |
| Repair event logged (WARN) | PASS |

**FINDING LOW-02: Debug log partially clipped by NavBar**
The bottom of the debug log area overlaps with the NavBar/Reboot FAB. The last few log lines are obscured. Needs additional bottom padding (e.g., `padding-bottom: calc(80px + env(safe-area-inset-bottom))`) on the scrollable content area.

---

## Test 5: Settings Tab

**Screenshots:** `validation-screenshots/09-settings-tab.png`, `10-settings-scrolled.png`, `11-accent-orange.png`, `12-accent-green.png`, `13-accent-red.png`, `14-theme-light.png`, `15-theme-dark.png`

### 5.1 Debloat Engine Section
| Check | Result |
|-------|--------|
| Mode Override dropdown | PASS -- Auto-detect selected |
| All 7 mode options present | PASS -- Auto-detect, ZeroMount VFS, Standalone Mount, Symlink Overlay, OverlayFS Whiteout, Magic Mount, Package Manager |
| Description text below dropdown | PASS |
| Disable Only toggle | PASS (off state) |
| Refresh on Boot toggle | PASS (off state) |

### 5.2 Monitor Section
| Check | Result |
|-------|--------|
| Enable Monitor toggle (on) | PASS |
| Interval slider showing 300s | PASS |
| Range labels: 1m to 1h | PASS |

### 5.3 Appearance Section
| Check | Result |
|-------|--------|
| Theme buttons: AMOLED / DARK / LIGHT | PASS |
| AMOLED active by default | PASS |
| 6 accent color circles | PASS |
| Auto Accent toggle | PASS |

### 5.4 Logging Section
| Check | Result |
|-------|--------|
| Log Level dropdown | PASS |
| Options: DEBUG, INFO, WARN, ERROR, FATAL | PASS |
| INFO selected by default | PASS |

### 5.5 About Section
| Check | Result |
|-------|--------|
| Version: 0.1.0 | PASS |
| Module ID: scalpel | PASS |
| Active Mode: whiteout (in accent color) | PASS |

### 5.6 Accent Color Tests

| Color | Hex | Applied | Screenshot |
|-------|-----|---------|------------|
| Orange | #FF8E53 | PASS -- toggles, slider value, NavBar, FAB all changed | `11-accent-orange.png` |
| Green | #00D68F | PASS -- all accent elements changed | `12-accent-green.png` |
| Red/Pink | #FF6B6B | PASS -- all accent elements changed | `13-accent-red.png` |
| Indigo | #6366F1 | PASS -- default accent restored | (verified in subsequent screenshots) |
| Cyan | #00B4D8 | Not tested (3 colors sufficient to verify mechanism) | -- |
| Slate | #64748B | Not tested | -- |

All tested accent colors applied globally to: toggle controls, slider thumb, interval value text, Active Mode text, section headers, NavBar active label, and Reboot FAB.

### 5.7 Theme Tests

| Theme | Background | Cards | Text | Screenshot |
|-------|-----------|-------|------|------------|
| AMOLED | Pure black `rgb(0,0,0)` | Dark glass surfaces | White/gray | `09-settings-tab.png` |
| Light | Light gray/white | White cards | Dark text | `14-theme-light.png` |
| Dark | Dark gray (non-black) | Slightly lighter surfaces | Light text | `15-theme-dark.png` |

All three themes render correctly with appropriate contrast.

**FINDING MEDIUM-03: --bg-page CSS variable empty in Dark theme**
When evaluating CSS custom properties in Dark theme, `--bg-page` is empty. The background color is applied through inline styles on the app shell component rather than CSS variables. This is an architectural inconsistency -- functionally correct but makes theming harder to maintain.

---

## Test 6: Reboot FAB Visibility

| Tab | FAB Visible | Screenshot |
|-----|-------------|------------|
| Debloat | PASS | `16-fab-debloat.png` |
| System | PASS | `17-fab-system.png` |
| Status | PASS | `18-fab-status.png` |
| Settings | PASS | `19-fab-settings.png` |

The Reboot FAB (circular button, bottom right, with reboot/refresh icon) is **visible on all 4 tabs**. It maintains its position (fixed, above NavBar) across tab navigation.

---

## Test 7: Data Quality Sweep

### 7.1 Text Content Scan
| Check | Debloat | System | Status | Settings |
|-------|---------|--------|--------|----------|
| No "undefined" | PASS | PASS | PASS | PASS |
| No "NaN" | PASS | PASS | PASS | PASS |
| No "null" | PASS | PASS | PASS | PASS |
| No "[object Object]" | PASS | PASS | PASS | PASS |

### 7.2 Console Errors
| Error | Severity | Expected |
|-------|----------|----------|
| `ERR_NAME_NOT_RESOLVED` for `mui.kernelsu.org/internal/insets.css` | LOW | Yes -- KSU CSS unavailable in browser |

Only 1 console error across the entire session, and it is expected behavior for development outside KernelSU WebUI runtime.

### 7.3 Broken Images
No `<img>` elements found (icons use inline SVG). No broken image indicators.

### 7.4 Empty Sections
Only `navbar__indicator` (a decorative element) detected as "empty large element". All content sections populated correctly.

### 7.5 Layout Issues
No broken layouts observed. All tabs render within viewport width. Scrolling works correctly on all tabs. NavBar is fixed at bottom. Header is fixed at top.

---

## Findings Summary

### CRITICAL-01: Category Filter Logic Inverted
**Location:** `src/routes/DebloatTab.tsx` lines 14, 29-37, 39-43
**Impact:** Users will select wrong apps for debloat. Primary workflow broken.
**Fix:** Change filter from "toggle off to exclude" to "click to include only". When a category pill is clicked, show only that category (or toggle between "show all" and "show only this").
**Evidence:** Screenshot `03-category-filter-google.png` shows 22 apps when "Google" (5 apps) is selected.

### MEDIUM-01: Debloated Section Not Filtered by Search
**Location:** `src/routes/DebloatTab.tsx` -- debloated section rendering
**Impact:** Search results are inconsistent -- available apps filter but debloated apps do not.
**Fix:** Apply the same search query filter to the debloated apps list.
**Evidence:** Screenshot `02-search-google.png` shows debloated section with non-matching apps.

### MEDIUM-02: Detail Sheet Missing Backend Fields
**Location:** `src/routes/DebloatTab.tsx` lines 369-384
**Impact:** Incomplete information for power users making debloat decisions.
**Fix:** Add `app_dir` field display to the detail sheet.

### MEDIUM-03: --bg-page CSS Variable Empty in Dark Theme
**Location:** Theme system (store.ts or theme definitions)
**Impact:** Theme maintenance difficulty. Not a visual bug.
**Fix:** Populate `--bg-page` CSS variable for all themes on `<html>` or `<body>`.

### LOW-01: Category Pill Counts Not Updated During Search
**Location:** Category pill rendering in DebloatTab.tsx
**Impact:** Minor confusion about what counts represent.

### LOW-02: Debug Log Clipped by NavBar
**Location:** Status tab scroll area
**Impact:** Last few log lines obscured.
**Fix:** Add bottom padding to account for NavBar + FAB height.

### LOW-03: KSU Insets CSS Console Error
**Location:** `index.html` referencing `https://mui.kernelsu.org/internal/insets.css`
**Impact:** Non-blocking. Expected in dev. Will resolve when running inside KSU WebUI.

---

## Verdict

| Category | Score |
|----------|-------|
| AMOLED Theme | 10/10 |
| Debloat Tab | 6/10 (filter inversion is critical) |
| Systemize Tab | 10/10 |
| Status Tab | 9/10 (minor log clipping) |
| Settings Tab | 9/10 (all controls work, themes + accents verified) |
| Reboot FAB | 10/10 (visible all tabs) |
| Data Quality | 10/10 (zero undefined/NaN/null) |
| Console Health | 9/10 (1 expected error) |

**Overall: 82/100**

The CRITICAL-01 filter inversion must be fixed before ship. With that fix, the score would rise to ~92/100. The remaining MEDIUM/LOW findings are polish items.
