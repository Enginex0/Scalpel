# ZeroMount WebUI -- Forensic Analysis (Fork Base)

**Analysis Date:** 2026-02-01
**Source:** `/home/claudetest/zero-mount/nomount/webui-v2-beta/`
**Total Source Files:** 38
**Total Lines Processed:** ~4,200+ (all source files read in full)
**Purpose:** Complete forensic extraction of the ZeroMount WebUI codebase for Scalpel fork builders

---

## Project Overview

ZeroMount WebUI v2-beta is a Solid.js + TypeScript + Vite single-page application that runs inside a KernelSU/Magisk WebView. It manages a VFS (Virtual Filesystem) redirection engine: users configure path redirection rules, exclude app UIDs from interception, toggle the engine on/off, load/unload KSU modules, and view system info. The app communicates with the shell backend via `ksu.exec()` callback-based bridge calls.

**Key facts:**
- Framework: Solid.js 1.9.10 (`package.json:15`)
- Build tool: Vite 7.2.4 with vite-plugin-solid (`package.json:20-21`)
- Language: TypeScript 5.9.3 strict mode (`tsconfig.app.json:21`)
- Package manager: pnpm (lockfile present, `pnpm-lock.yaml`)
- Build output: `../module/webroot-beta` (`vite.config.ts:9`)
- No routing library -- tab switching via Solid.js signals
- No CSS preprocessor -- vanilla CSS with CSS custom properties
- No animation library -- all CSS keyframes + inline JS animations
- External fonts: Google Fonts (Space Grotesk, Inter, JetBrains Mono)

---

## File Structure (Complete Tree)

```
webui-v2-beta/
  .gitignore                          # Standard Node ignores
  README.md                           # Boilerplate Solid.js readme
  index.html                          # App shell HTML entry point
  package.json                        # Dependencies and scripts
  pnpm-lock.yaml                      # pnpm lockfile (~41KB)
  tsconfig.json                       # Root TS config (references)
  tsconfig.app.json                   # App TS config (Solid.js JSX)
  tsconfig.node.json                  # Node TS config (Vite config)
  vite.config.ts                      # Vite build configuration
  public/
    vite.svg                          # Default Vite favicon
  src/
    index.tsx                         # App entry point (render)
    App.tsx                           # Root component (shell + routing)
    app.css                           # Global CSS (variables, resets, keyframes)
    assets/
      solid.svg                       # Solid.js logo (unused)
    lib/
      types.ts                        # All TypeScript interfaces
      store.ts                        # Reactive state (createRoot store)
      api.ts                          # Bridge API (KSU exec calls)
      api.mock.ts                     # Mock API for browser dev
      constants.ts                    # Paths, version, GitHub URL
      theme.ts                        # Theme objects + accent presets
      icons.ts                        # SVG path data constants
      ksu.d.ts                        # KSU native API type declarations
      ksuApi.ts                       # KSU package listing API wrapper
    components/
      core/
        Badge.tsx + Badge.css         # Status badge component
        Button.tsx + Button.css       # Multi-variant button component
        Card.tsx + Card.css           # Glass/elevated/gradient-border card
        Input.tsx + Input.css         # Text input with label/error
        Skeleton.tsx + Skeleton.css   # Loading skeleton placeholder
        Toggle.tsx                    # Toggle switch (inline styles)
      layout/
        Header.tsx + Header.css       # App header with title
        NavBar.tsx + NavBar.css       # Bottom tab navigation
        Modal.tsx                     # Bottom sheet modal (inline styles)
        Toast.tsx                     # Toast notification (inline styles)
    routes/
      StatusTab.tsx + StatusTab.css   # Engine status dashboard
      ModulesTab.tsx + ModulesTab.css # KSU module manager
      ConfigTab.tsx + ConfigTab.css   # App exclusion config
      SettingsTab.tsx + SettingsTab.css # Theme, engine, about settings
```

---

## Build System & Dependencies

### package.json (`package.json:1-23`)

**Runtime Dependencies:**
| Package | Version | Purpose |
|---------|---------|---------|
| `solid-js` | `^1.9.10` | UI framework (reactive, compiled) |
| `@material/material-color-utilities` | `^0.4.0` | Material You color generation (imported but not directly used in source) |
| `@material/web` | `^2.4.1` | Material Design web components (imported but not directly used in source) |
| `kernelsu` | `^3.0.0` | KSU WebView bridge types (externalized in build) |

**Dev Dependencies:**
| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | `~5.9.3` | TypeScript compiler |
| `vite` | `^7.2.4` | Build tool and dev server |
| `vite-plugin-solid` | `^2.11.10` | Solid.js JSX transform for Vite |
| `@types/node` | `^24.10.1` | Node.js type definitions |

**Scripts (`package.json:6-9`):**
- `dev`: `vite` -- starts dev server on port 5173
- `build`: `tsc -b && vite build` -- type-check then bundle
- `preview`: `vite preview` -- preview production build

### Vite Configuration (`vite.config.ts:1-23`)

```typescript
base: './',                           // Relative paths (WebView requirement)
plugins: [solid()],                   // Solid.js JSX transform
build: {
  target: 'esnext',                   // Modern JS output
  outDir: '../module/webroot-beta',   // Build output to module directory
  emptyOutDir: true,                  // Clean output before build
  minify: 'esbuild',                  // Fast minification
  rollupOptions: {
    external: ['kernelsu'],           // KSU provided by WebView runtime
  },
},
optimizeDeps: {
  exclude: ['kernelsu'],              // Don't bundle KSU
},
server: {
  port: 5173,                         // Dev server port
  host: true,                         // Expose to network
},
```

**Critical for fork:** `base: './'` is required for KSU/Magisk WebView. The `kernelsu` package is externalized because the WebView provides `globalThis.ksu` at runtime. The `outDir` points to the parent module's webroot directory.

### TypeScript Configuration

**App config (`tsconfig.app.json:1-29`):**
- Target: ES2022
- Module: ESNext with bundler resolution
- JSX: preserve with `jsxImportSource: "solid-js"` (line 18)
- Strict mode enabled (line 21)
- `noUnusedLocals: false` / `noUnusedParameters: false` (relaxed for dev)
- `erasableSyntaxOnly: true` (line 24)

**Node config (`tsconfig.node.json:1-26`):**
- Target: ES2023
- Strict mode with `noUnusedLocals: true` / `noUnusedParameters: true`
- Includes only `vite.config.ts`

---

## Entry Point & App Shell

### index.html (`index.html:1-16`)

The HTML shell provides:
- Viewport meta with `maximum-scale=1.0, user-scalable=no` (line 6) -- prevents pinch zoom in WebView
- Google Fonts preconnect + stylesheet loading (lines 8-10): Space Grotesk (display), Inter (body), JetBrains Mono (code)
- Single `#root` div (line 12)
- Module script pointing to `/src/index.tsx` (line 13)
- Title: "ZeroMount v2" (line 7)

### index.tsx (`src/index.tsx:1-14`)

Minimal entry point:
- Imports `render` from `solid-js/web` (line 2)
- Imports `App` component and `app.css` (lines 3-4)
- DEV mode guard: throws if `#root` missing (lines 8-12)
- Renders `<App />` into `root!` (line 14)
- `/* @refresh reload */` directive (line 1) -- forces full HMR reload

### App.tsx (`src/App.tsx:1-89`)

Root application component. Structure:

**Imports (lines 1-9):** `createSignal`, `onMount`, `Show`, `Switch`, `Match` from Solid.js; Header, NavBar, Toast, all 4 tab components, store.

**State:**
- `isReady` signal (line 12) -- gates rendering until `store.loadInitialData()` completes

**Loading Fallback (lines 23-37):**
- Full-viewport centered "Loading..." text
- Uses theme values for bg, color, font (inline styles)
- `min-height: 100dvh` with 100vh fallback

**Main Layout (lines 39-87):**
```
<div> (full viewport, themed bg)
  <Header />
  <main> (padding-bottom accounts for NavBar + safe area)
    <Switch>
      <Match when={activeTab === 'status'}> <StatusTab /> </Match>
      <Match when={activeTab === 'modules'}> <ModulesTab /> </Match>
      <Match when={activeTab === 'config'}> <ConfigTab /> </Match>
      <Match when={activeTab === 'settings'}> <SettingsTab /> </Match>
    </Switch>
  </main>
  <NavBar activeTab={store.activeTab()} onTabChange={store.setActiveTab} />
  <Show when={store.toast()}>
    <Toast message={...} type={...} visible={true} />
  </Show>
</div>
```

**Key pattern:** Tab routing uses `Switch`/`Match` on `store.activeTab()` signal. No URL routing. Main padding-bottom dynamically accounts for `fixedNav` setting (line 53).

---

## Routing System

There is no routing library. Tab switching is signal-based:

1. `store.activeTab()` is a `createSignal<Tab>` initialized to `'status'` (`store.ts:10`)
2. `store.setActiveTab` is the signal setter
3. `NavBar` receives `activeTab` and `onTabChange` as props (`App.tsx:72-75`)
4. `App.tsx` uses `Switch`/`Match` to conditionally render the active tab component (lines 56-69)

**Tab type (`types.ts:75`):**
```typescript
export type Tab = 'status' | 'modules' | 'config' | 'settings';
```

**Tab definitions in NavBar (`NavBar.tsx:11-16`):**
```typescript
const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'status', label: 'Status', icon: 'power_settings_new' },
  { id: 'modules', label: 'Modules', icon: 'folder' },
  { id: 'config', label: 'Config', icon: 'tune' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
```

**For Scalpel fork:** Replace tab IDs and labels. Scalpel needs: `'debloat' | 'systemize' | 'status' | 'settings'`.

---

## Component Inventory (Every Component)

### Core Components

#### Badge (`components/core/Badge.tsx:1-24`, `Badge.css:1-45`)

**Props interface (line 6-9):**
```typescript
interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  size?: 'small' | 'medium';
  children?: JSXElement;
}
```

**Behavior:** Pure presentational. Uses `splitProps` to extract local props. Generates BEM class string `badge badge--{size} badge--{variant}`.

**CSS:** Inline-flex centered, `font-weight: 600`, `border-radius: 8px`. Default variant uses `gradient-primary` background with glow shadow. Success/warning/error/info use semantic colors with matching glow shadows. Small: `2px 8px` padding, `10px` font. Medium: `4px 12px` padding, `12px` font.

**Used by:** ModulesTab (module load status), ConfigTab (excluded count, app count)

---

#### Button (`components/core/Button.tsx:1-57`, `Button.css:1-100`)

**Props interface (line 7-18):**
```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
  onClick?: (e: MouseEvent) => void;
  style?: string;
  type?: 'button' | 'submit' | 'reset';
  class?: string;
  children?: JSXElement;
}
```

**Behavior:**
- Uses `needsDarkText()` from theme to dynamically set text color for primary variant (line 34-37)
- Shows spinner when `loading` is true (lines 49-54)
- Disables when loading OR disabled

**CSS animations:**
- Hover: `transform: scale(1.02) translateY(-2px)` with `0.2s cubic-bezier(0.34, 1.56, 0.64, 1)` (line 67-68)
- Active: `transform: scale(0.98)` (line 71)
- Spinner: `button-spin` keyframe, `0.8s linear infinite` (lines 93-99)

**Variant styles:**
- Primary: `gradient-primary` background, accent glow shadow (line 39-43)
- Secondary: transparent with accent border (line 49-53)
- Danger: error color background with error glow (line 55-59)
- Ghost: transparent, secondary text color (line 61-64)

**Size styles:**
- Small: `8px 16px`, `12px` font, `8px` radius
- Medium: `14px 28px`, `14px` font, `16px` radius
- Large: `18px 36px`, `16px` font, `20px` radius

---

#### Card (`components/core/Card.tsx:1-37`, `Card.css:1-48`)

**Props interface (line 5-12):**
```typescript
interface CardProps {
  variant?: 'glass' | 'elevated' | 'gradient-border';
  padding?: 'none' | 'small' | 'medium' | 'large';
  hoverable?: boolean;
  style?: string;
  onClick?: (e: MouseEvent) => void;
  children?: JSXElement;
}
```

**CSS:**
- Base: `border-radius: 24px` (Card.css:2)
- Transition: `transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease-out` (Card.css:3)
- Glass variant: `backdrop-filter: blur(20px)`, glass bg + border (Card.css:7-11)
- Elevated variant: `bg-surface-elevated` + `shadow-medium` (Card.css:14-17)
- Gradient-border variant: gradient border trick using `padding-box` / `border-box` (Card.css:20-23)
- Hoverable: `translateY(-4px)` + `shadow-large` on hover (Card.css:42-44)
- Padding: none=0, small=12px, medium=16px, large=24px

---

#### Input (`components/core/Input.tsx:1-49`, `Input.css:1-70`)

**Props interface (line 4-13):**
```typescript
interface InputProps {
  label?: string;
  error?: string;
  fullWidth?: boolean;
  placeholder?: string;
  value?: string;
  onInput?: (e: InputEvent & { currentTarget: HTMLInputElement }) => void;
  type?: string;
  disabled?: boolean;
}
```

**Structure:** Wraps `<input>` in a container div with optional label and error message.

**CSS focus effect (Input.css:40-46):** On focus, border becomes transparent, background uses `padding-box`/`border-box` trick with `gradient-primary`, plus accent glow shadow. This is the same gradient-border pattern used in Card.

---

#### Skeleton (`components/core/Skeleton.tsx:1-18`, `Skeleton.css:1-18`)

**Props interface (line 4-8):**
```typescript
interface Props {
  width?: string;
  height?: string;
  borderRadius?: string;
  class?: string;
}
```

**Behavior:** Renders a div with CSS custom properties for width/height/radius. Uses shimmer animation.

**CSS animation (Skeleton.css:15-18):** `skeleton-shimmer`, `1.5s infinite linear`, background sweeps from 200% to -200%.

---

#### Toggle (`components/core/Toggle.tsx:1-84`)

**Props interface (line 4-8):**
```typescript
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}
```

**Behavior:** Fully inline-styled toggle switch. No CSS file. Uses three signals: `pressing`, `thumbPosition`, `thumbWidth`. Click triggers a stretch animation (width 24->28->24 over 100ms, line 23-27) before calling onChange.

**Dimensions:** 56x28px track, 24x24px thumb. Track uses `gradient-primary` when checked, `bgSurfaceElevated` when unchecked. Has a glow div behind when active (`accent-rgb` at 0.2 opacity, blur 8px).

**Transitions:**
- Track background: `0.3s ease` (line 48)
- Thumb left position: `0.2s cubic-bezier(0.34, 1.56, 0.64, 1)` (line 78)
- Thumb width: `0.1s ease` (line 78)
- Pressing state: scale 0.95 (line 79)

---

### Layout Components

#### Header (`components/layout/Header.tsx:1-10`, `Header.css:1-36`)

**Props:** None.

**Renders:**
```html
<header class="header">
  <h1 class="header__title">ZEROMOUNT</h1>
  <span class="header__subtitle">Enginex0</span>
</header>
```

**CSS:**
- Title: Space Grotesk 28px 700, gradient text via `gradient-primary`, letter-spacing -0.02em (Header.css:7-17)
- Subtitle: JetBrains Mono 12px, tertiary color, letter-spacing 0.1em (Header.css:19-24)
- Padding: 20px 16px 16px, centered (Header.css:2-4)
- Unused sun animation: `spin-slow 8s linear infinite` (Header.css:33-36)

---

#### NavBar (`components/layout/NavBar.tsx:1-93`, `NavBar.css:1-103`)

**Props interface (line 6-9):**
```typescript
interface NavBarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}
```

**State:** `indicatorLeft`, `indicatorWidth`, `isStretching` signals for animated indicator.

**Behavior:** Fixed bottom navigation with 4 tabs. Uses `ref` to measure tab button positions. `createEffect` watches `activeTab` and repositions the indicator with a stretch animation (scaleX 1.2 for 200ms, NavBar.css:43).

**Icon rendering (lines 62-81):** Inline SVG elements with conditionals for each icon name. Each icon is a 24x24 SVG. Active tab icons use `gradient-primary` with `drop-shadow` filter.

**CSS:**
- Container: `position: fixed`, `bottom: 0`, glass background, `blur(20px)`, `z-index: 100` (NavBar.css:2-14)
- Fixed nav mode: extra 48px bottom padding (NavBar.css:16-18)
- Safe area: `padding-bottom: calc(8px + env(safe-area-inset-bottom))` (NavBar.css:12)
- Tabs: flex row, max-width 400px, centered (NavBar.css:20-27)
- Indicator: gradient background, `border-radius: 12px`, `opacity: 0.15`, `transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)` (NavBar.css:30-40)
- Active tab: gradient text + icon with drop-shadow glow (NavBar.css:77-103)
- Tab press: `scale(0.95)` on active (NavBar.css:60-62)

---

#### Modal (`components/layout/Modal.tsx:1-108`)

**Props interface (line 7-11):**
```typescript
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: JSXElement;
}
```

**Behavior:** Bottom sheet modal with backdrop. Fully inline-styled (no CSS file). Uses signals for `visible`, `translateY`, `backdropOpacity`. Opening: slides up with `0.3s cubic-bezier(0.34, 1.56, 0.64, 1)`. Closing: slides down, then hides after 300ms delay. Escape key dismissal via `keydown` listener (lines 26-32).

**Structure:**
- Backdrop: fixed inset, `rgba(0,0,0,0.6)`, `backdrop-filter: blur(4px)`, z-index 200
- Content: fixed bottom, `gradientSecondary` background, `24px` top border radius, max-height 85vh, overflow-y auto, z-index 201
- Handle: 40x4px bar at top, tertiary color, 2px radius
- Title: Space Grotesk 24px 700, gradient text

---

#### Toast (`components/layout/Toast.tsx:1-96`)

**Props interface (line 5-9):**
```typescript
interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
}
```

**Behavior:** Fixed position at bottom center, slides up/down. Fully inline-styled. Shows icon + message. Auto-dismissed after 3000ms by store (store.ts:160).

**Position:** `bottom: 100px`, `left: 50%`, `translateX(-50%)`, z-index 1000.

**Type colors:** success=`colorSuccess`, error=`colorError`, info=`colorInfo`. Each with matching glow shadow.

**Transition:** `0.3s cubic-bezier(0.34, 1.56, 0.64, 1)`

---

### Route Components (Tabs)

#### StatusTab (`routes/StatusTab.tsx:1-459`, `StatusTab.css:1-343`)

**Largest component** (459 lines TSX + 343 lines CSS = 802 total).

**Sections rendered (in order):**
1. **Hero Section** -- Engine status with shield icon, active/inactive indicator, enable/disable button. When active: glowPulse animation, shield floats + heartbeats, dot pulses. Skeleton fallback during load.
2. **Quick Stats** -- 3-column grid: Active Rules (animated count), Excluded Apps (animated count), Uptime. Values use gradient text.
3. **Mode Statistics** -- Two rows: VFS Redirection count, SUSFS availability.
4. **Mount Info** -- Two cards (Modules active count, Source: KSU) + redirected path chips.
5. **System Health** -- Info/warning items with severity badges.
6. **Recent Activity** -- Expandable list with staggered `slideInRight` animation (0.1s delay per item).
7. **System Info** -- 2-column grid showing device, Android, SELinux, kernel, driver, SUSFS, misc.

**State (lines 10-14):**
- `pulseScale` -- shield pulse animation (every 3s when engine active)
- `animatedActiveRules`, `animatedExcludedUids`, `animatedHitsToday` -- number animation signals
- `showAllActivity` -- expand/collapse activity list

**Number animation (lines 26-47):** `requestAnimationFrame` loop with cubic ease-out (`1 - Math.pow(1 - progress, 3)`), 500ms duration.

**CSS utilities defined here (StatusTab.css:319-337):**
- `.color-text-secondary`, `.color-text-tertiary`, `.color-text-primary`, `.color-text-accent`
- `.bg-surface`
These are used across the tab's children.

---

#### ModulesTab (`routes/ModulesTab.tsx:1-244`, `ModulesTab.css:1-218`)

**Purpose:** KSU module management -- scan, search, load/unload modules.

**State (lines 14-16):**
- `searchQuery` -- search filter
- `expandedModule` -- which module's details are shown
- `loadingModules` -- Set of module paths currently loading

**Features:**
- Search bar with magnifying glass icon overlay
- SCAN button triggers `store.scanKsuModules()`
- Staggered `slideInRight` animation on module cards (0.05s delay per item, line 120)
- Expandable details: path, partition badges, file count, status, HOT LOAD/UNLOAD button
- Skeleton loading state with 3 placeholder cards
- Empty state with icon and contextual message

**Chevron animation (ModulesTab.css:210-218):** `transform: rotate(180deg)`, `0.2s ease`

---

#### ConfigTab (`routes/ConfigTab.tsx:1-331`, `ConfigTab.css:1-238`)

**Purpose:** App exclusion management -- exclude UIDs from VFS interception.

**Complex features:**

**Icon loading system (lines 15-100):**
- `iconCache` Map for memoization (line 15)
- `IntersectionObserver` for lazy loading icons (line 54-63): rootMargin 100px, threshold 0.1
- `loadIcon()` tries `ksu.getPackagesIcons()` first, falls back to SVG placeholder
- `AppIcon` component renders icon container with lazy observer ref
- Observer cleanup on component unmount (lines 121-126)

**State (lines 103-107):**
- `searchQuery` + `debouncedQuery` (300ms debounce, lines 113-119)
- `showSystemApps` toggle
- `excludedExpanded` -- collapsible excluded section

**Sections:**
1. **Search toolbar** with search input
2. **Excluded Apps** -- collapsible card with badge count, chevron rotation. Each excluded app has REMOVE button.
3. **Available Apps** -- filterable, sortable list. System apps toggle. Scrollable container (max-height 400px). Each app has EXCLUDE button.

---

#### SettingsTab (`routes/SettingsTab.tsx:1-334`, `SettingsTab.css:1-239`)

**Purpose:** Theme selection, accent color, engine settings, about section.

**Sections:**
1. **Appearance** -- Theme picker (4-column grid: Dark, Light, Auto, AMOLED), accent color picker (6 color dots), random accent toggle, animations toggle, fixed nav toggle
2. **Engine** -- Auto-start on boot toggle, verbose logging toggle, CLEAR ALL RULES danger button
3. **About** -- Rotating logo ring, ZeroMount title (gradient text), "GHOST" badge, GitHub repo button, Copy Debug Info button, Export Config button, footer text

**Accent colors defined (lines 11-18):**
```
Orange: #FF8E53, Emerald: #00D68F, Azure: #00B4D8,
Slate: #64748B, Indigo: #6366F1, Coral: #FF6B6B
```

**Modal usage:** Clear All Rules confirmation dialog uses `<Modal>` component.

**Config export (lines 277-292):** Creates JSON blob with rules, excluded UIDs, settings, export date. Downloads via temporary `<a>` element.

---

## Bridge API Integration

### Architecture

The WebUI communicates with the shell backend through KernelSU's WebView bridge. The bridge provides `globalThis.ksu` with an `exec()` method that runs shell commands as root.

### KSU Native API Type Declarations (`lib/ksu.d.ts:1-35`)

```typescript
interface KsuNativeApi {
  exec(cmd: string, options: string, callbackName: string): void;
  listAllPackages?(): string;       // Optional fast path
  listUserPackages?(): string;      // Optional fast path
  listSystemPackages?(): string;    // Optional fast path
  getPackagesInfo?(packageNamesJson: string): string;  // Optional fast path
  getPackagesIcons?(packageNamesJson: string, size: number): string;  // Optional fast path
}
```

`globalThis.ksu` is declared as `KsuNativeApi | undefined` (`ksu.d.ts:27`).

### exec Pattern (`api.ts:23-52`)

```typescript
async function execCommand(cmd: string, timeoutMs = 30000): Promise<KsuExecResult>
```

Pattern:
1. Check `globalThis.ksu?.exec` exists (line 25)
2. Create unique callback name: `exec_cb_{timestamp}_{counter}` (line 31)
3. Set timeout (default 30s) that rejects promise and cleans callback (lines 33-36)
4. Register callback on `window` that resolves promise with `{errno, stdout, stderr}` (lines 38-41)
5. Call `ksu.exec(cmd, '{}', callbackName)` (line 45)
6. On exec error, clean up and reject (lines 47-49)

### Mock Detection (`api.ts:19-21`)

```typescript
export function shouldUseMock(): boolean {
  return typeof globalThis.ksu === 'undefined';
}
```

When KSU is unavailable (browser dev mode), all API methods fall through to `MockAPI` which returns synthetic data with simulated delays.

### Shell Argument Escaping (`api.ts:12-14`)

```typescript
function escapeShellArg(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}
```

### Complete API Method Inventory (`api.ts:192-813`)

| Method | Shell Command | Parameters | Return Type | Purpose |
|--------|--------------|------------|-------------|---------|
| `getStatusCache()` | `cat STATUS_CACHE` | none | `StatusCache \| null` | Fast-path cache read |
| `getVersion()` | `BINARY ver` | none | `string` | Driver version |
| `getSystemInfo()` | 7 parallel commands | none | `SystemInfo` | System details |
| `getRules()` | `BINARY list` | none | `VfsRule[]` | List VFS rules |
| `addRule()` | `BINARY add SOURCE TARGET` | name, source, target | `VfsRule` | Add VFS rule |
| `deleteRule()` | `BINARY del SOURCE` | sourcePath | `void` | Delete VFS rule |
| `clearAllRules()` | `BINARY clear` | none | `void` | Clear all rules |
| `getExcludedUids()` | reads exclusion files | none | `ExcludedUid[]` | List excluded UIDs |
| `excludeUid()` | `BINARY blk UID` | uid, packageName, appName | `ExcludedUid` | Exclude UID |
| `includeUid()` | `BINARY unb UID` | uid | `void` | Include UID |
| `getActivity()` | `tail -50 ACTIVITY_LOG` | none | `ActivityItem[]` | Recent activity |
| `getStats()` | derived from rules+uids | none | `EngineStats` | Summary stats |
| `toggleEngine()` | `BINARY enable/disable` | enable | `void` | Toggle engine |
| `setVerboseLogging()` | `touch/rm VERBOSE_FLAG` | enabled | `void` | Toggle verbose |
| `getModules()` | `ls MODULE_PATHS` | none | `MountedModule[]` | List loaded modules |
| `isEngineActive()` | `[ -e DEVICE ]` | none | `boolean` | Engine status |
| `getInstalledApps()` | `fetch('link/installed_apps.json')` | none | `InstalledApp[]` | App list |
| `scanKsuModules()` | inline bash script | none | `KsuModule[]` | Scan all modules |
| `loadKsuModule()` | multiple `BINARY add` calls | name, path | `number` | Load module rules |
| `unloadKsuModule()` | multiple `BINARY del` calls | name, path | `number` | Unload module rules |
| `fetchSystemColor()` | `settings get secure theme_customization_overlay_packages` | none | `string \| null` | System accent |
| `getRefreshTrigger()` | `fetch('link/.refresh_trigger')` | none | `number \| null` | Poll daemon |

### KSU Package API (`lib/ksuApi.ts:1-161`)

Wraps KSU's native package APIs with shell fallbacks:

| Function | Native Method | Shell Fallback |
|----------|--------------|----------------|
| `listPackages(type)` | `ksu.listUserPackages()` etc. | `pm list packages` |
| `getPackagesInfo(names)` | `ksu.getPackagesInfo(json)` | `pm path + aapt dump badging` per app |
| `getAppLabelViaAapt(name)` | none | `pm path + aapt dump badging` |
| `getPackagesIcons(names, size)` | `ksu.getPackagesIcons(json, size)` | Returns empty (no fallback) |

### File Paths (`lib/constants.ts:1-15`)

```typescript
export const PATHS = {
  BINARY: '/data/adb/modules/zeromount/bin/zm',
  DEVICE: '/dev/zeromount',
  DATA_DIR: '/data/adb/zeromount/',
  MODULE_PATHS: '/data/adb/zeromount/module_paths',
  EXCLUSION_FILE: '/data/adb/zeromount/.exclusion_list',
  EXCLUSION_META: '/data/adb/zeromount/.exclusion_meta.json',
  ACTIVITY_LOG: '/data/adb/zeromount/activity.log',
  VERBOSE_FLAG: '/data/adb/zeromount/.verbose',
  STATUS_CACHE: '/data/adb/zeromount/.status_cache.json',
};
export const GITHUB_URL = 'https://github.com/backslashxx/zeromount';
export const APP_VERSION = '3.0.0';
```

**For Scalpel fork:** Replace all paths with `/data/adb/scalpel/` equivalents and update the binary path and API methods to match Scalpel's shell backend interface.

---

## Theme System & CSS Architecture

### Architecture Overview

The theme system uses a **dual-layer approach**:

1. **JavaScript theme objects** (`theme.ts`) -- used for inline styles in components (especially Toggle, Modal, Toast)
2. **CSS custom properties** (`app.css`) -- used for CSS file styling, updated at runtime by `applyTheme()`

When the theme changes, `applyTheme()` writes JS theme object values into CSS custom properties on `:root`, keeping both systems in sync.

### Theme Objects (`theme.ts:61-143`)

Three theme variants defined as TypeScript objects:

**darkTheme (`theme.ts:61-103`):**
```typescript
{
  bgPrimary: 'linear-gradient(180deg, #0F0F1A 0%, #1A1A2E 100%)',
  bgSurface: 'rgba(255, 255, 255, 0.05)',
  bgSurfaceElevated: 'rgba(255, 255, 255, 0.08)',
  bgSurfaceHover: 'rgba(255, 255, 255, 0.12)',
  glassBg: 'rgba(255, 255, 255, 0.06)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  glassBlur: 'blur(20px)',
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.7)',
  textTertiary: 'rgba(255, 255, 255, 0.5)',
  textAccent: '#FF8E53',
  fontDisplay: "'Space Grotesk', system-ui, sans-serif",
  fontBody: "'Inter', system-ui, sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', monospace",
  radiusSmall: '8px',
  radiusMedium: '12px',
  radiusLarge: '16px',
  radiusXLarge: '24px',
  shadowSmall: '0 2px 8px rgba(0, 0, 0, 0.2)',
  shadowMedium: '0 8px 24px rgba(0, 0, 0, 0.3)',
  shadowLarge: '0 20px 40px rgba(0, 0, 0, 0.4)',
  shadowGlow: '0 0 20px rgba(255, 107, 107, 0.3)',
  accentRgb: '255, 107, 107',
  gradientPrimary: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 50%, #E85D04 100%)',
  gradientSecondary: 'linear-gradient(180deg, #1A1A2E 0%, #0F0F1A 100%)',
  colorSuccess: '#00D68F',
  colorSuccessGlow: 'rgba(0, 214, 143, 0.4)',
  colorWarning: '#FFB800',
  colorWarningGlow: 'rgba(255, 184, 0, 0.4)',
  colorError: '#FF3D71',
  colorErrorGlow: 'rgba(255, 61, 113, 0.4)',
  colorInfo: '#00B4D8',
  colorInfoGlow: 'rgba(0, 180, 216, 0.4)',
}
```

**lightTheme (`theme.ts:105-126`):** Spreads darkTheme, overrides bg values (white-based), glass values (black-based), text colors (dark), shadows (lighter).

**amoledTheme (`theme.ts:128-143`):** Spreads darkTheme, overrides bgPrimary to pure `#000000`, reduces glass/surface opacity, increases shadow intensity.

### Accent Color System (`theme.ts:11-48`)

Six preset accent colors, each with:
- `gradient`: 3-stop linear gradient at 135deg
- `textAccent`: solid color for text
- `rgb`: comma-separated RGB for `rgba()` usage
- `textOnAccent`: contrast text color (dark or white)

| Key | Name | Gradient | Text | RGB |
|-----|------|----------|------|-----|
| `#FF8E53` | Orange | #FF8E53 -> #FF7B3D -> #E85D04 | #FF8E53 | 255, 142, 83 |
| `#00D68F` | Emerald | #00D68F -> #00E5A0 -> #69F0AE | #00D68F | 0, 214, 143 |
| `#00B4D8` | Azure | #00B4D8 -> #48CAE4 -> #90E0EF | #00B4D8 | 0, 180, 216 |
| `#64748B` | Slate | #64748B -> #94A3B8 -> #CBD5E1 | #94A3B8 | 100, 116, 139 |
| `#6366F1` | Indigo | #6366F1 -> #818CF8 -> #A5B4FC | #818CF8 | 99, 102, 241 |
| `#FF6B6B` | Coral | #FF6B6B -> #FF8A80 -> #FFAB91 | #FF6B6B | 255, 107, 107 |

### Theme Application

**`applyTheme()` (`theme.ts:147-178`):** Sets 18 CSS custom properties on `document.documentElement`. Also applies accent styles.

**`applyAccent()` (`theme.ts:181-189`):** Sets only accent-related CSS custom properties (5 properties): `--gradient-primary`, `--text-accent`, `--accent-rgb`, `--text-on-accent`, `--shadow-glow`.

**Store integration (`store.ts:89-115`):** `currentTheme()` is a `createMemo` that combines the base theme with accent overrides. Two `createEffect`s watch for changes and call `applyTheme`/`applyAccent`. Theme preference persisted to `localStorage` under keys `zeromount-theme`, `zeromount-accent`, `zeromount-fixedNav`, `zeromount-autoAccent`.

**Auto accent randomization (`store.ts:144-152`):** On `visibilitychange` event (when WebView becomes visible again), randomizes accent color if `autoAccentColor` is enabled.

### Spring Configs (Unused) (`theme.ts:191-196`)

```typescript
export const springConfigs = {
  snappy: { mass: 1, stiffness: 300, damping: 20 },
  bouncy: { mass: 1, stiffness: 200, damping: 10 },
  smooth: { mass: 1, stiffness: 100, damping: 20 },
  elastic: { mass: 1, stiffness: 400, damping: 8 },
};
```

Defined but not used anywhere. Could be intended for a spring animation library.

---

## Color Palette (Every Variable)

### CSS Custom Properties (`app.css:2-35`)

| Variable | Value | Description |
|----------|-------|-------------|
| `--bg-primary` | `linear-gradient(180deg, #0F0F1A 0%, #1A1A2E 100%)` | Page background |
| `--bg-surface` | `rgba(255, 255, 255, 0.05)` | Card/surface bg |
| `--bg-surface-elevated` | `rgba(255, 255, 255, 0.08)` | Elevated surface bg |
| `--bg-surface-hover` | `rgba(255, 255, 255, 0.12)` | Hover surface bg |
| `--glass-bg` | `rgba(255, 255, 255, 0.06)` | Glass morphism bg |
| `--glass-border` | `rgba(255, 255, 255, 0.1)` | Glass morphism border |
| `--text-primary` | `#FFFFFF` | Primary text |
| `--text-secondary` | `rgba(255, 255, 255, 0.7)` | Secondary text |
| `--text-tertiary` | `rgba(255, 255, 255, 0.5)` | Tertiary text |
| `--text-accent` | `#FF8E53` | Accent text |
| `--text-on-accent` | `#1A1A2E` | Text on accent backgrounds |
| `--gradient-primary` | `linear-gradient(135deg, #FF6B6B 0%, #FF8E53 50%, #FFC107 100%)` | Primary gradient |
| `--gradient-secondary` | `linear-gradient(180deg, #1A1A2E 0%, #0F0F1A 100%)` | Secondary gradient |
| `--color-success` | `#00D68F` | Success green |
| `--color-success-glow` | `rgba(0, 214, 143, 0.4)` | Success glow |
| `--color-warning` | `#FFB800` | Warning yellow |
| `--color-warning-glow` | `rgba(255, 184, 0, 0.4)` | Warning glow |
| `--color-error` | `#FF3D71` | Error red |
| `--color-error-glow` | `rgba(255, 61, 113, 0.4)` | Error glow |
| `--color-info` | `#00B4D8` | Info blue |
| `--color-info-glow` | `rgba(0, 180, 216, 0.4)` | Info glow |
| `--shadow-small` | `0 2px 8px rgba(0, 0, 0, 0.2)` | Small shadow |
| `--shadow-medium` | `0 8px 24px rgba(0, 0, 0, 0.3)` | Medium shadow |
| `--shadow-large` | `0 20px 40px rgba(0, 0, 0, 0.4)` | Large shadow |
| `--shadow-glow` | `0 0 20px rgba(255, 107, 107, 0.3)` | Accent glow shadow |
| `--accent-rgb` | `255, 107, 107` | Accent RGB for rgba() |

### Additional Hard-Coded Colors

| Location | Value | Context |
|----------|-------|---------|
| `app.css:72-82` | `rgba(255, 255, 255, 0.05/0.2/0.3)` | Scrollbar styling |
| `app.css:110-122` | `rgba(255, 107, 107, 0.6)` | Focus-visible outline |
| `app.css:126` | `rgba(255, 255, 255, 0.4)` | Placeholder text |
| `app.css:338-346` | conic-gradient with 5 colors | Logo ring animation |
| `Toast.tsx:84` | `#FFFFFF` | Toast text (always white) |
| `Button.tsx:35` | `#1A1A2E` | Primary button dark text |
| `Button.css:57` | `#FFFFFF` | Danger button text |

---

## Typography & Spacing

### Font Stack

| Usage | Font | Fallbacks | CSS Variable |
|-------|------|-----------|--------------|
| Display headings | Space Grotesk (400-700) | system-ui, sans-serif | `fontDisplay` |
| Body text | Inter (400-700) | system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif | `fontBody` |
| Code/monospace | JetBrains Mono (400-500) | Fira Code, monospace | `fontMono` |

All three loaded from Google Fonts (`index.html:8-10`).

### Font Sizes Used

| Size | Weight | Context |
|------|--------|---------|
| 9px | 600 | System app badge (`ConfigTab.css:186`) |
| 10px | - | Badge small (`Badge.css:18`), app package name small |
| 11px | 500-600 | NavBar labels, stat labels, module meta, partition badges |
| 12px | 500-600 | Header subtitle, badge medium, section headers, error text, setting descriptions |
| 13px | - | Mount empty text, system info grid, about badge, footer |
| 14px | 500-600 | Button medium, setting item labels, app names, activity messages, various body text |
| 15px | 500 | Repo button text |
| 16px | 600 | Input field, button large, module item name, empty state titles |
| 20px | 700 | Mount card value, stats value small |
| 24px | 700 | Modal title |
| 28px | 700 | Header title, about title |
| 32px | 800 | Stats value large |

### Border Radius System

| Token | Value | CSS Variable |
|-------|-------|--------------|
| Small | 8px | `radiusSmall` / `--radius-small` |
| Medium | 12px | `radiusMedium` / `--radius-medium` |
| Large | 16px | `radiusLarge` / `--radius-large` |
| XLarge | 24px | `radiusXLarge` / `--radius-xlarge` |
| Card | 24px | (hardcoded in Card.css) |
| Toggle | 14px | (track border-radius) |
| NavBar indicator | 12px | |
| Badge | 8px | |
| Color swatch | 50% | (circle) |
| Scrollbar | 3px | |

### Spacing Patterns

| Pattern | Values Used |
|---------|-------------|
| Page padding | `0 16px` (all tabs) |
| Card gaps | `16px-20px` between cards |
| Card internal padding | 12px (small), 16px (medium), 24px (large) |
| Section header margin-bottom | `12px-16px` |
| Item gaps in lists | `6px-12px` |
| Icon-to-text gap | `8px-12px` |
| Button padding | 8x16 (S), 14x28 (M), 18x36 (L) |

---

## Animations & Transitions (Every One)

### CSS Keyframe Animations (`app.css:146-367`)

| Name | Duration | Easing | Use | Lines |
|------|----------|--------|-----|-------|
| `spin` | - | - | General rotation (0-360deg) | 146-153 |
| `heartbeat` | 1.5s | ease-in-out infinite | Shield + status dot pulse. Double-bump at 14%/42% to scale(1.05) | 156-162 |
| `glowPulse` | 3s | ease-in-out infinite | Hero card glow. Shadow intensity oscillates 0.3-0.5 | 165-168 |
| `float` | 3s | ease-in-out infinite | Shield floating. translateY 0 to -4px | 171-174 |
| `pulse` | - | - | Opacity pulse 1 to 0.5 | 176-183 |
| `slideInRight` | 0.3s | ease-out | List items enter from right. translateX(20px)->0, opacity 0->1 | 185-194 |
| `slideInUp` | - | - | Enter from bottom. translateY(20px)->0, opacity 0->1 | 196-205 |
| `fadeIn` | 0.2s | ease-out | Generic fade in. opacity 0->1 | 207-214 |
| `scaleIn` | - | - | Scale + fade. scale(0.9)->1, opacity 0->1 | 216-225 |
| `borderGlow` | - | - | Border opacity pulse 0.5->1 | 227-234 |
| `shimmer` | 1.5s | linear infinite | Skeleton loading. Background position -200% to 200% | 236-243 |
| `textGlow` | 2s | ease-in-out infinite | Text shadow pulse (accent glow). Used by `.glow-text` class | 246-255 |
| `rotateRing` | 8s | linear infinite | Logo ring rotation. 0-360deg | 322-325 |
| `skeleton-shimmer` | 1.5s | linear infinite | Skeleton component shimmer (Skeleton.css:15-18) | Skeleton.css |
| `button-spin` | 0.8s | linear infinite | Button spinner rotation | Button.css:93-99 |
| `spin-slow` | 8s | linear infinite | Header sun rotation (unused) | Header.css:33-36 |

### CSS Transitions (Every Component)

| Component | Property | Duration | Easing | Trigger |
|-----------|----------|----------|--------|---------|
| Card | transform, box-shadow | 0.2s | cubic-bezier(0.34, 1.56, 0.64, 1), ease-out | hover |
| Button | all | 0.2s | cubic-bezier(0.34, 1.56, 0.64, 1) | hover/active |
| Input field | all | 0.2s | ease | focus |
| Toggle track | background | 0.3s | ease | state change |
| Toggle thumb | left | 0.2s | cubic-bezier(0.34, 1.56, 0.64, 1) | state change |
| Toggle thumb | width | 0.1s | ease | click stretch |
| NavBar indicator | all | 0.3s | cubic-bezier(0.34, 1.56, 0.64, 1) | tab change |
| NavBar tab | transform | 0.2s | cubic-bezier(0.34, 1.56, 0.64, 1) | active |
| NavBar icon | all | 0.2s | ease | active |
| NavBar label | all | 0.2s | ease | active |
| Modal backdrop | opacity | 0.3s | ease | open/close |
| Modal content | transform | 0.3s | cubic-bezier(0.34, 1.56, 0.64, 1) | open/close |
| Toast | transform | 0.3s | cubic-bezier(0.34, 1.56, 0.64, 1) | show/hide |
| Chevron | transform | 0.2s | ease | expand/collapse |
| Module icon | all | 0.3s | ease | load state |
| Settings color | all | 0.2s | cubic-bezier(0.34, 1.56, 0.64, 1) | hover |
| Settings theme | all | 0.2s | ease | click |
| Config section header | background | 0.15s | ease | active |
| Hero shield | transform | 0.15s | ease | pulse |
| Hero glow | opacity | 0.5s | ease | engine state |

**Dominant easing curve:** `cubic-bezier(0.34, 1.56, 0.64, 1)` -- an overshoot/spring curve used for all interactive elements. This is the signature feel of the UI.

### JavaScript Animations

| Location | Type | Duration | Easing |
|----------|------|----------|--------|
| `StatusTab.tsx:26-47` | Number counter (requestAnimationFrame) | 500ms | Cubic ease-out `1 - Math.pow(1 - progress, 3)` |
| `StatusTab.tsx:16-23` | Shield pulse scale | 150ms per pulse, every 3s | setInterval + setTimeout |
| `Toggle.tsx:23-27` | Thumb stretch | 100ms | setTimeout |
| `NavBar.tsx:31-37` | Indicator stretch | 50ms delay + 200ms stretch | setTimeout |

### Reduced Motion Support (`app.css:279-288`)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## Icons & Assets Inventory

### Icon System

All icons are **inline SVG path data** stored in `lib/icons.ts` as a constant object. Components render icons via `<svg>` elements with `<path d={ICONS.name}>`. There is no icon font or icon component library.

### Complete Icon Registry (`icons.ts:1-35`)

| Key | Category | SVG Path (24x24 viewBox) | Used In |
|-----|----------|--------------------------|---------|
| `power` | Navigation | Power button (on/off circle) | NavBar (status tab) |
| `folder` | Navigation | Folder icon | NavBar (modules tab) |
| `tune` | Navigation | Sliders/equalizer | NavBar (config tab) |
| `settings` | Navigation | Gear icon | NavBar (settings tab) |
| `shield` | Status | Filled shield | StatusTab (when active) |
| `shieldHalf` | Status | Half-filled shield | StatusTab hero |
| `check` | Status | Checkmark | Toast success |
| `chevronDown` | Action | Down arrow | Expandable sections |
| `search` | Action | Magnifying glass | Search inputs |
| `checkboxChecked` | Action | Checked checkbox | Module icon |
| `smartphone` | Action | Phone outline | App icon fallback |
| `grid` | Action | Grid/apps icon | App list header |
| `palette` | Theme | Color palette | Settings appearance |
| `moon` | Theme | Crescent moon | Dark theme |
| `sun` | Theme | Sun with rays | Light theme |
| `autoMode` | Theme | Circular arrows | Auto theme |
| `amoled` | Theme | Filled circle | AMOLED theme |
| `info` | About | Info circle | About section |
| `github` | About | GitHub octocat | Repo link |
| `error` | Toast | Warning circle | Toast error |

### Additional Inline Icons

Many components render SVG icons directly without using the `ICONS` constant:
- NavBar tab icons (`NavBar.tsx:62-81`) -- full SVG elements inline
- StatusTab activity icons (`StatusTab.tsx:66-90`) -- dynamic color SVGs
- ConfigTab shield/grid icons (`ConfigTab.tsx:195-197, 257-258`)
- SettingsTab section icons (`SettingsTab.tsx:55-57, 189-191, 233-234`)
- Toast type icons (`Toast.tsx:46-67`)
- Module checkbox icon (`ModulesTab.tsx:127-134`)
- App icon fallback smartphone SVG (`ConfigTab.tsx:89-97`)

### Static Assets

| File | Type | Used |
|------|------|------|
| `public/vite.svg` | SVG | Favicon (via `index.html:5`) |
| `src/assets/solid.svg` | SVG | Solid.js logo (not imported anywhere) |

---

## State Management

### Architecture

State management uses Solid.js primitives wrapped in a `createRoot` singleton pattern (`store.ts:631-632`):

```typescript
export const store = createRoot(createAppStore);
```

`createAppStore()` (`store.ts:8-629`) returns an object with:
- **Signals** for atomic values: `activeTab`, `engineActive`, `rules`, `excludedUids`, `activity`, `modules`, `installedApps`, `ksuModules`, `toast`
- **Stores** (Solid.js `createStore`) for nested objects: `loading`, `stats`, `systemInfo`, `settings`
- **Memos** for derived values: `currentTheme`
- **Effects** for side effects: theme application, localStorage persistence, accent randomization
- **Actions** for async operations: `loadInitialData`, `toggleEngine`, `addRule`, `deleteRule`, etc.

### Loading States (`store.ts:15-22`)

Granular loading object with per-domain flags:
```typescript
loading: { status, modules, apps, rules, activity, engine }
```

### Data Flow

1. `App.tsx:onMount` calls `store.loadInitialData()` (line 14-16)
2. `loadInitialData()` (`store.ts:163-258`) tries fast path (daemon cache) first, then falls back to full parallel load
3. Fast path: single `cat STATUS_CACHE` call, fills stats+systemInfo, then background-refreshes full data
4. Slow path: 8 parallel `Promise.allSettled` calls
5. Tab-specific data loaded on mount: `ConfigTab` calls `loadInstalledApps()`, `ModulesTab` calls `scanKsuModules()`

### Polling System (`store.ts:460-511`)

Background polling for app list changes:
- `startTriggerPolling()` -- checks daemon trigger file every 2000ms
- Falls back to package count comparison if trigger file missing
- `stopTriggerPolling()` -- called on ConfigTab cleanup

### localStorage Keys

| Key | Default | Type |
|-----|---------|------|
| `zeromount-theme` | `'amoled'` | `'dark' \| 'light' \| 'auto' \| 'amoled'` |
| `zeromount-accent` | random preset | hex color string |
| `zeromount-fixedNav` | `'true'` | `'true' \| 'false'` |
| `zeromount-autoAccent` | `'true'` | `'true' \| 'false'` |

---

## Responsive Design

### Approach

Mobile-first design targeting Android WebView. No desktop breakpoints. No media queries for layout changes (only `prefers-reduced-motion` and `prefers-color-scheme`).

### WebView Constraints Handled

| Constraint | Solution | Location |
|------------|----------|----------|
| No pinch zoom | `maximum-scale=1.0, user-scalable=no` | `index.html:6` |
| iOS safe area | `env(safe-area-inset-bottom)` padding | `app.css:291-294`, `NavBar.css:12` |
| Overscroll bounce | `overscroll-behavior: none` on html+body | `app.css:298-304` |
| Tap highlight | `-webkit-tap-highlight-color: transparent` | `app.css:313` |
| Touch handling | `touch-action: manipulation` on all elements | `app.css:308` |
| 100vh iOS issue | `min-height: 100dvh` with `100vh` fallback | `app.css:61-63`, `App.tsx:26-27` |
| Font smoothing | `-webkit-font-smoothing: antialiased` | `app.css:48` |
| Stacking context | `isolation: isolate` on `#root` | `app.css:317-319` |

### Layout Constraints

- Max tab bar width: `400px` centered (`NavBar.css:25`)
- App list max height: `400px` with overflow scroll (`ConfigTab.css:128-130`)
- Modal max height: `85vh` (`Modal.tsx:70`)
- Content width: full width minus `16px` padding each side

---

## Reusable Patterns & Utilities

### Glass Morphism Pattern

Used throughout via CSS class and inline styles:
```css
.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
}
```
Applied to: NavBar, Card (glass variant), various containers.

### Gradient Text Pattern

```css
.gradient-text {
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```
Applied to: Header title, stats values, about title, active nav tab icon/label.

### Gradient Border Pattern

```css
background: linear-gradient(var(--bg-surface), var(--bg-surface)) padding-box,
            var(--gradient-primary) border-box;
border: 2px solid transparent;
```
Applied to: Card (gradient-border variant), Input focus state.

### BEM Naming Convention

All CSS follows BEM:
- Block: `.card`, `.button`, `.status`, `.modules`
- Element: `.card--glass`, `.button__spinner`, `.status-hero__shield`
- Modifier: `.card--hoverable`, `.button--primary`, `.navbar__tab--active`

### Common Component Patterns

| Pattern | Implementation |
|---------|----------------|
| Expandable sections | Signal-controlled `Show`, chevron rotation on toggle |
| Search + debounce | `searchQuery` signal with `debouncedQuery` (300ms setTimeout) |
| Loading skeletons | `Show when={!loading}` with Skeleton component fallback |
| List with stagger | `slideInRight` animation with `index() * delay` |
| Confirm dialog | Modal component with cancel/confirm buttons |
| Toast notification | Store action -> 3s auto-dismiss via setTimeout |
| Icon lazy loading | IntersectionObserver with icon cache Map |

### Utility Functions

| Function | File | Purpose |
|----------|------|---------|
| `escapeShellArg()` | `api.ts:12-14` | Shell argument escaping |
| `shouldUseMock()` | `api.ts:19-21` | Detect browser vs WebView |
| `getLuminance()` | `theme.ts:1-5` | WCAG luminance calculation |
| `getContrastText()` | `theme.ts:7-9` | Auto-contrast text color |
| `needsDarkText()` | `theme.ts:50-55` | Check if accent needs dark text |
| `getAccentStyles()` | `theme.ts:57-59` | Get accent preset by color key |
| `formatTimeAgo()` | `StatusTab.tsx:56-64` | Human-readable relative time |
| `isValidPackageName()` | `ksuApi.ts:33-35` | Package name validation regex |

---

## What to Keep (Fork-worthy)

These patterns and files should be preserved or adapted in the Scalpel fork:

1. **Build system** -- `package.json`, `vite.config.ts`, `tsconfig*.json` (change `outDir` and project name)
2. **Entry point** -- `index.html` (change title), `index.tsx` (no changes needed)
3. **App shell** -- `App.tsx` pattern of Show/Switch/Match for tab routing
4. **Global CSS** -- `app.css` resets, scrollbar, animation keyframes, utility classes, WebView fixes
5. **Theme system** -- `theme.ts` dual-layer approach (JS objects + CSS vars), `applyTheme`/`applyAccent`
6. **Store pattern** -- `store.ts` createRoot singleton with granular loading states
7. **Bridge architecture** -- `api.ts` exec callback pattern, mock detection, shell escaping
8. **Mock API pattern** -- `api.mock.ts` structure for browser development
9. **Core components** -- Badge, Button, Card, Input, Skeleton, Toggle (all reusable)
10. **Layout components** -- NavBar (change tabs), Modal, Toast, Header (change title)
11. **Icon system** -- `icons.ts` SVG path data approach
12. **KSU type declarations** -- `ksu.d.ts` bridge types
13. **CSS patterns** -- Glass morphism, gradient text, gradient border, BEM naming

---

## What to Replace (Scalpel-specific)

These elements are ZeroMount-specific and must be replaced for Scalpel:

1. **Types** (`types.ts`) -- Replace VfsRule, ExcludedUid, EngineStats, MountedModule, KsuModule with Scalpel domain types (DebloatApp, SystemizeApp, ScalpelStatus, etc.)
2. **Constants** (`constants.ts`) -- Replace all paths (`/data/adb/zeromount/` -> `/data/adb/scalpel/`), version, GitHub URL
3. **API methods** (`api.ts`) -- Replace all bridge calls with Scalpel's backend interface (debloat, systemize, config read/write, status)
4. **Mock data** (`api.mock.ts`) -- Replace with Scalpel mock data (system apps, categories, etc.)
5. **Store actions** -- Replace engine toggle/rules/exclusions with debloat/systemize/status actions
6. **Tab definitions** -- Replace `status|modules|config|settings` with `debloat|systemize|status|settings`
7. **Route components** -- Replace all 4 tab components entirely (StatusTab, ModulesTab, ConfigTab, SettingsTab)
8. **Header** -- Change "ZEROMOUNT" to "SCALPEL", subtitle
9. **App icon loading** -- Replace IntersectionObserver icon system with scanner-cached icons from Scalpel backend
10. **About section** -- Change branding, repo URL, debug info format
11. **ksuApi.ts** -- May not need package listing APIs; Scalpel scanner provides app data

---

## Key Patterns for Expressionist Builders

### Structural Patterns to Understand

1. **Solid.js reactivity** -- `createSignal` for atoms, `createStore` for objects, `createMemo` for derived, `createEffect` for side effects. No virtual DOM; compiled to fine-grained DOM updates.

2. **Props handling** -- Always use `splitProps()` to separate local props from rest props. Access reactive props via function calls: `local.variant` not `props.variant` (for correct tracking).

3. **Conditional rendering** -- `<Show when={condition}>` for presence/absence. `<Switch>/<Match>` for exclusive options. `<For each={array}>` for lists.

4. **Inline styles vs CSS** -- Components like Toggle, Modal, Toast use inline `style` strings with template literals and theme values. Core components (Card, Button, Badge) use CSS classes. This is a deliberate split: interactive/animated elements use inline styles for direct reactive binding.

5. **Theme access pattern** -- `const t = () => store.currentTheme()` shorthand used in ModulesTab and ConfigTab for inline style theme access.

### Visual Identity Elements

1. **Signature easing curve:** `cubic-bezier(0.34, 1.56, 0.64, 1)` -- overshoot spring used everywhere. This is the feel of the app.

2. **Glass morphism everywhere:** Cards, NavBar, modals all use backdrop-filter blur(20px) with semi-transparent backgrounds.

3. **Gradient-as-accent:** The primary gradient replaces single-color accents for buttons, text highlights, indicators, badges.

4. **Glow shadows:** Every semantic color has a matching glow shadow (e.g., success green has green glow). Buttons, badges, the engine hero card all glow.

5. **Staggered list animations:** Items enter from the right with incrementing delays (index * 0.05-0.1s).

6. **Number animation on load:** Stats count up from 0 with eased animation on mount.

7. **Three-font hierarchy:** Space Grotesk for impact (titles, stats), Inter for readability (body, labels), JetBrains Mono for technical (paths, packages, versions).

### What Builders Can Change Freely

- Color palette (replace accent presets, semantic colors, gradients)
- Animation timing and easing curves
- Font choices (but keep the 3-tier hierarchy pattern)
- Card variants and border radius scale
- Icon set (swap SVG paths)
- Loading skeleton styles
- Glass morphism intensity (blur amount, opacity)
- Shadow scale

### What Builders Should Preserve

- `createRoot` store singleton pattern
- Bridge API callback architecture
- Mock API fallback for development
- `applyTheme()` CSS custom property sync
- WebView constraint handling (safe areas, overscroll, tap highlight)
- BEM CSS naming convention
- `splitProps()` usage in components
- `Show`/`Switch`/`Match` conditional rendering pattern
- Reduced motion media query support
