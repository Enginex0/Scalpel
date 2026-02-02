# Proposal A vs ZeroMount WebUI -- Component-by-Component Comparison

Date: 2026-02-01
ZeroMount source: `/home/claudetest/zero-mount/nomount/webui-v2-beta/src/`
Proposal A source: `/home/claudetest/zero-mount/Scalpel/webui-proposals/proposal-a/src/`

---

## Summary Verdict

| Category | Score |
|----------|-------|
| Core components preserved | 5/6 IDENTICAL, 1 MODIFIED |
| Layout components preserved | 0/5 IDENTICAL, 5 MODIFIED |
| Lib files preserved | 1/7 IDENTICAL, 3 MODIFIED, 3 REWRITTEN |
| Build config preserved | 1/3 IDENTICAL, 2 MODIFIED |
| ZeroMount patterns lost | See "Quality Patterns Lost" section |

**Overall: Good fork discipline. All reusable core components kept verbatim. Changes concentrated in domain-specific layers (which is correct for a fork). Some quality patterns dropped in the process.**

---

## 1. Core Components (`components/core/`)

| File | Status | Details |
|------|--------|---------|
| `Badge.tsx` | IDENTICAL | Byte-for-byte identical |
| `Badge.css` | IDENTICAL | Byte-for-byte identical |
| `Button.tsx` | IDENTICAL | Byte-for-byte identical |
| `Button.css` | IDENTICAL | Byte-for-byte identical |
| `Card.tsx` | IDENTICAL | Byte-for-byte identical |
| `Card.css` | IDENTICAL | Byte-for-byte identical |
| `Input.tsx` | IDENTICAL | Byte-for-byte identical |
| `Input.css` | IDENTICAL | Byte-for-byte identical |
| `Skeleton.tsx` | IDENTICAL | Byte-for-byte identical |
| `Skeleton.css` | IDENTICAL | Byte-for-byte identical |
| `Toggle.tsx` | **MODIFIED** | 2 changes (see below) |

### Toggle.tsx Changes

1. **Stretch animation width**: `setThumbWidth(28)` changed to `setThumbWidth(26)` -- slightly subtler stretch effect
2. **Off-track background**: Added CSS variable fallback for toggle off state:
   - ZeroMount: `background: ${props.checked ? t().gradientPrimary : t().bgSurfaceElevated}`
   - Proposal A: `background: ${props.checked ? t().gradientPrimary : 'var(--toggle-off-track, ' + t().bgSurfaceElevated + ')'}`

Both are intentional UI polish changes that improve toggle contrast (especially in light theme). Good modifications.

---

## 2. Layout Components (`components/layout/`)

| File | Status | Details |
|------|--------|---------|
| `Header.tsx` | **MODIFIED** | Branding swap only |
| `Header.css` | **MODIFIED** | Layout + style adjustments |
| `NavBar.tsx` | **MODIFIED** | Tab definitions + icon system overhaul |
| `NavBar.css` | **MODIFIED** | Active icon styling changed, `--fixed-nav` removed |
| `Modal.tsx` | **MODIFIED** | Import cleanup, radius/font sourcing changed |
| `Toast.tsx` | **MODIFIED** | Import cleanup, bottom positioning + safe-area |

### Header.tsx Changes
- **Title**: `ZEROMOUNT` -> `SCALPEL`
- **Subtitle**: `Enginex0` -> `surgical debloat`
- **Title class**: Added `gradient-text` CSS class (replaces inline gradient from CSS)
- **Import style**: Double-quotes `"./Header.css"` -> single-quotes `'./Header.css'`

### Header.css Changes
- **Padding**: `20px 16px 16px` -> `20px 16px 12px`
- **Text alignment**: `text-align: center` -> `text-align: left`
- **Title gradient**: Moved from CSS to HTML class `gradient-text`; CSS no longer has `background`/`-webkit-background-clip` on `.header__title`
- **Subtitle font**: Removed `'Fira Code'` fallback, added `text-transform: uppercase`
- **Subtitle size**: `12px` -> `11px`
- **Subtitle spacing**: `0.1em` -> `0.15em`
- **REMOVED**: `.header__sun` class and `@keyframes spin-slow` animation (ZeroMount-specific decorative element)

### NavBar.tsx Changes (Significant)
- **Imports**: Removed `store` import; added `ICONS` import from icons.ts
- **Tab definitions**: Completely replaced:
  - ZeroMount: `status/modules/config/settings` tabs with Material icon name strings
  - Proposal A: `debloat/systemize/status/settings` tabs with SVG path data from `ICONS`
- **Tab type**: `icon: string` -> `iconPath: string`
- **Icon rendering**: ZeroMount used per-icon conditional SVG blocks (4 separate `{tab.icon === '...' && (<svg>)}` blocks). Proposal A uses a single generic `<svg><path d={tab.iconPath} /></svg>` -- cleaner, more maintainable
- **SVG size**: `24x24` -> `22x22`
- **Signal name**: `isStretching` -> `stretching`
- **Variable type**: `{ [key: string]: ... }` -> `Record<string, ...>`
- **Fixed nav padding**: Removed `store.settings.fixedNav` and `navbar--fixed-nav` class (feature not applicable to Scalpel)

### NavBar.css Changes
- **REMOVED**: `.navbar--fixed-nav` rule (not needed for Scalpel)
- **Active icon styling**: ZeroMount used `background: var(--gradient-primary)` + `-webkit-background-clip: text` for gradient fill effect. Proposal A uses `color: var(--text-accent)` and `fill: var(--text-accent)` -- a simpler approach that works reliably on SVG `fill`
- **Active icon comment**: Added `/* Active icon: use accent color directly on SVG fill instead of background-clip:text */` explaining the design decision

### Modal.tsx Changes
- **Imports**: Removed `theme` import; only uses `store`
- **Border radius**: `theme.radiusXLarge` -> `store.currentTheme().radiusXLarge`
- **Font family**: `theme.fontDisplay` -> `store.currentTheme().fontDisplay`
- All other logic (animation, keyboard handling, backdrop) is identical

### Toast.tsx Changes
- **Imports**: Removed `theme` import; only uses `store`
- **Bottom position**: `100px` -> `calc(120px + env(safe-area-inset-bottom))` -- better safe-area handling
- **Border radius**: `theme.radiusLarge` -> `store.currentTheme().radiusLarge`
- **Font family**: `theme.fontBody` -> `store.currentTheme().fontBody`
- All other logic (animation, type styling, icons) is identical

---

## 3. Lib Files (`lib/`)

| File | Status | Details |
|------|--------|---------|
| `icons.ts` | **MODIFIED** | Shared icons preserved, Scalpel-specific added, ZM-specific removed |
| `ksu.d.ts` | **MODIFIED** | Original preserved + `kernelsu` module declaration added |
| `theme.ts` | **MODIFIED** | Core theme system preserved, `applyTheme()` enhanced |
| `types.ts` | **REWRITTEN** | Completely different domain types |
| `constants.ts` | **REWRITTEN** | Completely different paths and config |
| `store.ts` | **REWRITTEN** | Same architecture, completely different domain logic |
| `api.ts` | **REWRITTEN** | Different domain, different bridge approach |
| `api.mock.ts` | **MISSING** | ZeroMount has separate mock file; Proposal A inlines mocks in api.ts |
| `ksuApi.ts` | **MISSING** | ZeroMount has dedicated KSU API wrapper; Proposal A uses `import('kernelsu')` directly |

### icons.ts Changes
- **Preserved from ZeroMount** (exact same SVG paths):
  - `shield`, `settings`, `search`, `check`, `chevronDown`, `moon`, `sun`, `amoled`, `palette`, `info`, `error`
- **Removed** (ZeroMount-specific):
  - `power`, `folder`, `tune`, `shieldHalf`, `checkboxChecked`, `smartphone`, `grid`, `autoMode`, `github`
- **Added** (Scalpel-specific):
  - `scalpel`, `debloat` (trash icon), `systemize`, `pulse`, `close`, `reboot`, `chevronRight`, `arrowUp`, `warning`, `restore`, `refresh`, `log`, `monitor`, `promote`

### ksu.d.ts Changes
- **KsuPackageInfo**: Added `isSystem?: boolean` field (in addition to existing `isSystemApp`)
- **KsuNativeApi**: Removed blank line between `exec` and `listAllPackages`
- **NEW**: Added `declare module 'kernelsu'` block with typed exports for `exec`, `listPackages`, `getPackagesInfo`, `getPackagesIcons`, `spawn`. This is an important addition -- ZeroMount lacked this module declaration and had to use raw `globalThis.ksu` calls.

### theme.ts Changes
- **Lines 1-59**: IDENTICAL (getLuminance, getContrastText, accentPresets, needsDarkText, getAccentStyles)
- **Lines 61-145**: IDENTICAL (darkTheme, lightTheme, amoledTheme, `theme` export)
- **`applyTheme()` function**: Enhanced with 3 new properties:
  - Added `--bg-page` CSS variable (computed per theme for AMOLED/light/dark)
  - Added `--toggle-off-track` CSS variable (light theme gets `rgba(0,0,0,0.15)` instead of surface elevated)
  - Derives `isLight` and `isAmoled` booleans from theme object identity
- **`applyAccent()` function**: IDENTICAL
- **`springConfigs`**: IDENTICAL

### types.ts -- REWRITTEN
ZeroMount defines: `VfsRule`, `ExcludedUid`, `ActivityItem`, `EngineStats`, `MountedModule`, `KsuModule`, `InstalledApp`, `SystemInfo`, `Settings`, `Tab` (4 ZeroMount tabs)

Proposal A defines: `Tab` (4 Scalpel tabs), `Category`, `ModeOverride`, `ActiveMode`, `LogLevel`, `ThemeMode`, `ScannedApp`, `DebloatedApp`, `NukedAppDisplay`, `SystemizedApp`, `UserApp`, `StatusData`, `BootInfo`, `MonitorInfo`, `Settings`, `ModeInfo`

These are completely different domains. The only shared type is `Settings` (both have theme + accent fields). Proposal A adds Scalpel-specific fields: `modeOverride`, `logLevel`, `disableOnly`, `monitorEnabled`, `monitorInterval`, `refreshOnBoot`. Removes ZeroMount-specific: `animationsEnabled`, `autoStartOnBoot`, `verboseLogging`, `fixedNav`.

### constants.ts -- REWRITTEN
ZeroMount: paths to `/data/adb/zeromount/`, `zm` binary, version `3.0.0`
Proposal A: paths to `/data/adb/scalpel/`, no binary, version `0.1.0`, plus `MODES[]` array and `CATEGORY_COLORS` map

### store.ts -- REWRITTEN (Same Architecture)
Both use the same pattern: `createRoot(createAppStore)` with SolidJS signals/stores. Both have:
- Theme initialization from localStorage
- Auto-accent with random color on visibility change
- `applyTheme()`/`applyAccent()` effects
- `showToast()` system
- `loadInitialData()` async init

ZeroMount's store manages: VFS rules, excluded UIDs, activity log, KSU modules, engine state, installed apps, trigger polling
Proposal A's store manages: scanned apps, nuked apps, promoted apps, user apps, status, boot info, monitor info, log lines, needsReboot flag

### api.ts -- REWRITTEN
ZeroMount: Uses `globalThis.ksu.exec()` callback pattern, separate `api.mock.ts` file, manages VFS rules/exclusions/KSU modules
Proposal A: Uses `import('kernelsu')` Promise-based exec, inlines mock data directly, manages debloat/systemize/scanner/verify operations via shell script calls

Key bridge approach difference:
- ZeroMount: `globalThis.ksu.exec(cmd, '{}', callbackName)` with manual callback registration on `window`
- Proposal A: `const { exec } = await import('kernelsu'); exec(command)` -- cleaner, Promise-native, no callback plumbing

---

## 4. Build Configuration

| File | Status | Details |
|------|--------|---------|
| `tsconfig.json` | IDENTICAL | Both reference `tsconfig.app.json` + `tsconfig.node.json` |
| `vite.config.ts` | **MODIFIED** | Output dir + dev port changed |
| `package.json` | **MODIFIED** | Name, deps, devDeps changed |
| `index.html` | **MODIFIED** | Title + favicon line removed |

### vite.config.ts Changes
- **`outDir`**: `../module/webroot-beta` -> `../module/webroot` (production path)
- **`server.port`**: `5173` -> `3001`
- All other settings IDENTICAL (base, plugins, build target, kernelsu external/exclude)

### package.json Changes
- **`name`**: `webui-v2-beta` -> `scalpel-webui`
- **`version`**: `0.0.0` -> `0.1.0`
- **Dependencies removed**: `@material/material-color-utilities`, `@material/web` (Material Design not used by Scalpel)
- **Dependencies kept**: `kernelsu@^3.0.0`, `solid-js@^1.9.10`
- **DevDeps added**: `playwright@^1.58.1` (for visual testing)
- **DevDeps kept**: `@types/node`, `typescript`, `vite`, `vite-plugin-solid` (all same versions)

### index.html Changes
- **Title**: `ZeroMount v2` -> `Scalpel`
- **Removed**: `<link rel="icon" type="image/svg+xml" href="/vite.svg" />` favicon line
- **Preserved**: viewport meta, font preconnects, Google Fonts link (same 3 fonts), root div, module script

---

## 5. App Shell (`App.tsx`, `index.tsx`, `app.css`)

| File | Status | Details |
|------|--------|---------|
| `index.tsx` | IDENTICAL | Byte-for-byte identical |
| `App.tsx` | **MODIFIED** | Different tabs, RebootFAB added, loading screen styled |
| `app.css` | **REWRITTEN** | Same purpose, entirely different implementation |

### App.tsx Changes
- **Tabs**: `Status/Modules/Config/Settings` -> `Debloat/Systemize/Status/Settings`
- **Components**: Added `RebootFAB` between main and NavBar
- **Loading fallback**: ZeroMount shows "Loading..." with theme background. Proposal A shows "SCALPEL" gradient text on pure black.
- **Main padding**: ZeroMount has conditional fixedNav padding. Proposal A uses fixed `120px + safe-area-inset-bottom`.
- **Code style**: ZeroMount uses expanded multi-line JSX. Proposal A uses compact single-line styles.

### app.css Changes (Rewritten)
Same capabilities, different implementation approach:
- **Proposal A CSS variables**: AMOLED-first defaults (bg-primary `#000000`), adds category color variables (`--cat-essential`, `--cat-caution`, `--cat-safe`, `--cat-google`, `--cat-unknown`), adds easing variables (`--ease-spring`, `--ease-out`, `--ease-standard`), adds `--bg-surface-input`, `--text-disabled`
- **ZeroMount CSS variables**: Dark gradient defaults (bg-primary gradient), no category variables, no easing variables
- **Proposal A additions**: `@import "https://mui.kernelsu.org/internal/insets.css"` for KSU WebUI safe area insets, `breathe` and `rotateRing` animations, `heartbeat`/`textGlow` animations
- **ZeroMount extras**: `.logo-container`/`.logo-ring`/`.logo-inner` classes (rotating ring component), `::-webkit-scrollbar-thumb:hover`, `a:hover` underline, `@supports not selector(:focus-visible)` fallback, `.glow-text` utility
- **Formatting**: ZeroMount uses expanded multi-line CSS. Proposal A uses compressed single-line for resets and animations.

---

## 6. Route Components (`routes/`)

| ZeroMount File | Proposal A Equivalent | Status |
|----------------|----------------------|--------|
| `StatusTab.tsx` + `.css` | `StatusTab.tsx` | **REWRITTEN** (different domain) |
| `ModulesTab.tsx` + `.css` | -- | **MISSING** (no equivalent in Scalpel) |
| `ConfigTab.tsx` + `.css` | -- | **MISSING** (no equivalent in Scalpel) |
| `SettingsTab.tsx` + `.css` | `SettingsTab.tsx` | **REWRITTEN** (different settings) |
| -- | `DebloatTab.tsx` | **NEW** (Scalpel-only) |
| -- | `SystemizeTab.tsx` | **NEW** (Scalpel-only) |

All route components are Scalpel-specific. No CSS files for routes in Proposal A (styles are inline).

---

## 7. New Files in Proposal A (Not in ZeroMount)

| File | Purpose |
|------|---------|
| `components/scalpel/RebootFAB.tsx` | Floating action button with reboot confirm modal. Uses Modal + Button from core. Pulses when `needsReboot` is true. |

---

## 8. Files in ZeroMount Missing from Proposal A

| File | Impact |
|------|--------|
| `lib/api.mock.ts` | Mock data inlined into `api.ts` instead. Increases `api.ts` size but simplifies imports. |
| `lib/ksuApi.ts` | Dedicated KSU API helper (listPackages, getPackagesInfo, getAppLabelViaAapt). Proposal A uses `import('kernelsu')` directly in api.ts -- loses the `getAppLabelViaAapt` fallback and label-correction logic. |
| `routes/ConfigTab.tsx` + `.css` | ZeroMount VFS config UI. Not applicable to Scalpel. |
| `routes/ModulesTab.tsx` + `.css` | ZeroMount module management UI. Not applicable to Scalpel. |
| All route `.css` files | ZeroMount has separate CSS per route. Proposal A uses inline styles. |
| `assets/solid.svg` | Present in both (no content difference checked) |

---

## 9. Quality Patterns Assessment

### Preserved from ZeroMount

1. **SolidJS idioms**: `splitProps`, `createEffect`, `createMemo`, `createStore` used correctly throughout
2. **BEM CSS naming**: `badge--variant`, `button--size`, `card--padding-*`, `navbar__tab--active` convention maintained
3. **Theme system**: Full dark/light/amoled theme with CSS variable application preserved
4. **Accent preset system**: 6 preset colors with gradient/rgb/text-on-accent preserved
5. **Auto-accent randomization**: On page visibility change, random accent applied
6. **Spring animations**: Cubic-bezier easing curves preserved in CSS and Toggle
7. **Safe-area handling**: `env(safe-area-inset-bottom)` preserved and improved in some places
8. **LocalStorage persistence**: Theme, accent, auto-accent preferences saved
9. **Toast notification system**: Full show/auto-hide/type-styling system preserved
10. **Loading states**: `loadInitialData()` -> loading signal -> fallback UI pattern preserved
11. **Modal bottom sheet**: Slide-up animation with backdrop blur preserved

### Lost from ZeroMount

1. **Separate mock file**: ZeroMount's `api.mock.ts` was a clean separation. Proposal A inlines ~95 lines of mock data into `api.ts` (mild modularity violation but acceptable for proposal stage)
2. **KSU API wrapper**: ZeroMount's `ksuApi.ts` had `getAppLabelViaAapt()` fallback for apps with null labels. Proposal A lacks this robustness
3. **Trigger polling**: ZeroMount's store had `startTriggerPolling()` / `stopTriggerPolling()` for daemon-signaled refresh. Proposal A has no background polling
4. **Granular loading states**: ZeroMount had `loading.status`, `loading.modules`, `loading.apps`, `loading.rules`, `loading.activity`, `loading.engine`. Proposal A uses a single `loading` boolean
5. **Route-level CSS files**: ZeroMount separated route styles into dedicated CSS files. Proposal A uses inline styles (less maintainable at scale)
6. **Verbose console logging**: ZeroMount had extensive `console.log('[ZM-Store]...')` breadcrumbs. Proposal A has minimal logging
7. **System color extraction**: ZeroMount's `fetchSystemColor()` extracted Android system accent. Not present in Proposal A's store (the api has no equivalent)
8. **Fixed nav option**: ZeroMount had `fixedNav` toggle in settings for devices with navigation gestures. Dropped in Proposal A

### Improved over ZeroMount

1. **`kernelsu` module typing**: Proposal A adds `declare module 'kernelsu'` with full type signatures. ZeroMount had to use raw `globalThis.ksu` calls
2. **Bridge approach**: `import('kernelsu')` is Promise-native and cleaner than ZeroMount's callback-based `ksu.exec()`
3. **NavBar icon system**: Generic `<path d={tab.iconPath}>` is cleaner than ZeroMount's 4 conditional SVG blocks
4. **Active icon CSS**: `color: var(--text-accent)` on SVG fill is more reliable than `background-clip: text` on parent span
5. **Toast safe-area**: `calc(120px + env(safe-area-inset-bottom))` vs fixed `100px`
6. **Toggle off-track**: CSS variable `--toggle-off-track` allows theme-aware off-state contrast
7. **Category color system**: Scalpel-specific CSS variables for debloat categories
8. **KSU insets import**: `@import "https://mui.kernelsu.org/internal/insets.css"` for proper WebView insets
9. **Config persistence**: `updateSettings()` writes backend config.sh keys via shell bridge, not just localStorage
10. **RebootFAB**: Dedicated component with confirm modal and pulse animation -- proper fork addition

---

## 10. Conclusion

Proposal A is a **well-executed fork** of the ZeroMount WebUI. The fork discipline is strong:

- All 6 core UI components (Badge, Button, Card, Input, Skeleton, Toggle) are preserved verbatim or with minimal polish improvements
- The theme system, accent presets, and animation infrastructure are fully intact
- Layout components are modified only where necessary (branding, tab definitions, icon system)
- Domain-specific files (types, constants, api, store, routes) are properly rewritten for Scalpel's debloat/systemize functionality
- The build configuration is adapted correctly (output path, port, deps)

The main areas for improvement are:
1. Restore granular loading states (single boolean is a UX regression)
2. Consider extracting mock data back to a separate file for modularity
3. Add route-level CSS files instead of inline styles (will matter at scale)
4. Consider adding background polling for app list freshness
