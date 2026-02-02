# Theme System Comparison: ZeroMount WebUI vs Proposal A

**Date:** 2026-02-01
**Scope:** theme.ts, app.css, store.ts (theme-related parts)
**Verdict per file:** COPIED INTACT / COPIED + MODIFIED / REWRITTEN

---

## File 1: `src/lib/theme.ts`

**Verdict: COPIED + MODIFIED (3 surgical additions, everything else byte-identical)**

### What was KEPT (identical)

| Section | ZeroMount Lines | Proposal A Lines | Status |
|---------|----------------|------------------|--------|
| `getLuminance()` | 1-5 | 1-5 | Identical |
| `getContrastText()` | 7-9 | 7-9 | Identical |
| `accentPresets` (all 6 presets) | 11-48 | 11-48 | Identical (every hex value, every gradient stop, every rgb string) |
| `needsDarkText()` | 50-55 | 50-55 | Identical |
| `getAccentStyles()` | 57-59 | 57-59 | Identical |
| `darkTheme` (all 27 properties) | 61-103 | 61-103 | Identical |
| `lightTheme` (all overrides) | 105-126 | 105-126 | Identical |
| `amoledTheme` (all overrides) | 128-143 | 128-143 | Identical |
| `theme = darkTheme` | 145 | 145 | Identical |
| `applyAccent()` | 181-189 | 186-194 | Identical |
| `springConfigs` (4 configs) | 191-196 | 196-201 | Identical |

### What was CHANGED (3 additions to `applyTheme()`)

ZeroMount `applyTheme()` (lines 147-178):
```ts
export function applyTheme(themeObj: typeof darkTheme, accentColor?: string) {
  const root = document.documentElement;
  root.style.setProperty('--bg-primary', themeObj.bgPrimary);
  root.style.setProperty('--bg-surface', themeObj.bgSurface);
  // ... 15 more setProperty calls ...
  root.style.setProperty('--shadow-glow', `0 0 20px rgba(${accentStyles.rgb}, 0.3)`);
}
```

Proposal A `applyTheme()` (lines 147-183) adds 3 new `setProperty` calls:
```ts
  // LINE 150 - NEW: Theme type detection
  const isLight = themeObj === lightTheme;
  const isAmoled = themeObj === amoledTheme;

  // LINE 152 - NEW: --bg-page flat color for body backgrounds (gradient won't work everywhere)
  root.style.setProperty('--bg-page', isAmoled ? '#000000' : isLight ? '#F5F5F5' : '#0F0F1A');

  // LINE 174 - NEW: --toggle-off-track for light-mode toggle contrast
  root.style.setProperty('--toggle-off-track', isLight ? 'rgba(0, 0, 0, 0.15)' : themeObj.bgSurfaceElevated);
```

**Why:** `--bg-page` provides a flat color fallback for contexts where CSS gradients don't render (e.g., Android WebView background). `--toggle-off-track` fixes low-contrast toggle switches in light mode, where the surface-elevated color was nearly invisible against a white background.

### What was NOT lost

Nothing. Every function, every theme object, every accent preset, every spring config from ZeroMount is present verbatim.

### Accent Presets: Hex-by-hex comparison

| Preset | Key | gradient | textAccent | rgb | textOnAccent | Match? |
|--------|-----|----------|------------|-----|-------------|--------|
| Orange | `#FF8E53` | `#FF8E53 -> #FF7B3D -> #E85D04` | `#FF8E53` | `255, 142, 83` | `#1A1A2E` | IDENTICAL |
| Emerald | `#00D68F` | `#00D68F -> #00E5A0 -> #69F0AE` | `#00D68F` | `0, 214, 143` | `#1A1A2E` | IDENTICAL |
| Azure | `#00B4D8` | `#00B4D8 -> #48CAE4 -> #90E0EF` | `#00B4D8` | `0, 180, 216` | `#1A1A2E` | IDENTICAL |
| Slate | `#64748B` | `#64748B -> #94A3B8 -> #CBD5E1` | `#94A3B8` | `100, 116, 139` | `#1A1A2E` | IDENTICAL |
| Indigo | `#6366F1` | `#6366F1 -> #818CF8 -> #A5B4FC` | `#818CF8` | `99, 102, 241` | `#FFFFFF` | IDENTICAL |
| Coral | `#FF6B6B` | `#FF6B6B -> #FF8A80 -> #FFAB91` | `#FF6B6B` | `255, 107, 107` | `#1A1A2E` | IDENTICAL |

All 6 presets preserved with identical hex values, gradients, rgb tuples, and contrast text colors.

### AMOLED Theme: Value-by-value comparison

| Property | ZeroMount | Proposal A | Match? |
|----------|-----------|------------|--------|
| `gradientSecondary` | `linear-gradient(180deg, #000000 0%, #050505 100%)` | same | IDENTICAL |
| `bgPrimary` | `#000000` | `#000000` | IDENTICAL |
| `bgSurface` | `rgba(255, 255, 255, 0.03)` | same | IDENTICAL |
| `bgSurfaceElevated` | `rgba(255, 255, 255, 0.05)` | same | IDENTICAL |
| `bgSurfaceHover` | `rgba(255, 255, 255, 0.08)` | same | IDENTICAL |
| `glassBg` | `rgba(255, 255, 255, 0.02)` | same | IDENTICAL |
| `glassBorder` | `rgba(255, 255, 255, 0.08)` | same | IDENTICAL |
| `shadowSmall` | `0 2px 8px rgba(0, 0, 0, 0.5)` | same | IDENTICAL |
| `shadowMedium` | `0 8px 24px rgba(0, 0, 0, 0.6)` | same | IDENTICAL |
| `shadowLarge` | `0 20px 40px rgba(0, 0, 0, 0.7)` | same | IDENTICAL |

All AMOLED overrides identical. Inherits dark theme for remaining properties (also identical).

---

## File 2: `src/app.css`

**Verdict: REWRITTEN (same spirit, different approach -- significant additions and removals)**

### Structural Comparison

| Aspect | ZeroMount | Proposal A |
|--------|-----------|------------|
| Total lines | 368 | 122 |
| Format | Multi-line, spacious | Single-line compressed |
| `:root` variables | 22 | 34 |
| `@keyframes` animations | 13 | 14 (13 kept + 1 added) |
| Utility classes | 4 (.glow-text, .gradient-text, .glass, .logo-*) | 2 (.gradient-text, .glass) |
| External imports | 0 | 1 (`@import "https://mui.kernelsu.org/internal/insets.css"`) |

### CSS Custom Properties: What changed

#### KEPT from ZeroMount `:root` (identical or equivalent)

| Variable | ZeroMount | Proposal A | Notes |
|----------|-----------|------------|-------|
| `--bg-surface` | `rgba(255,255,255,0.05)` | `rgba(255,255,255,0.03)` | CHANGED: darker default (AMOLED-first) |
| `--bg-surface-elevated` | `rgba(255,255,255,0.08)` | `rgba(255,255,255,0.06)` | CHANGED: darker default |
| `--bg-surface-hover` | `rgba(255,255,255,0.12)` | `rgba(255,255,255,0.09)` | CHANGED: darker default |
| `--glass-bg` | `rgba(255,255,255,0.06)` | `rgba(255,255,255,0.02)` | CHANGED: match AMOLED |
| `--glass-border` | `rgba(255,255,255,0.1)` | `rgba(255,255,255,0.08)` | CHANGED: match AMOLED |
| `--text-primary` | `#FFFFFF` | `#FFFFFF` | Identical |
| `--text-secondary` | `rgba(255,255,255,0.7)` | `rgba(255,255,255,0.6)` | CHANGED: slightly dimmer |
| `--text-tertiary` | `rgba(255,255,255,0.5)` | `rgba(255,255,255,0.35)` | CHANGED: noticeably dimmer |
| `--text-accent` | `#FF8E53` | `#FF8E53` | Identical |
| `--text-on-accent` | `#1A1A2E` | `#1A1A2E` | Identical |
| `--gradient-secondary` | `..#1A1A2E..#0F0F1A..` | `..#000000..#050505..` | CHANGED: AMOLED-first |
| `--accent-rgb` | `255, 107, 107` | `255, 142, 83` | CHANGED: Orange default instead of Coral |
| `--shadow-small/medium/large` | dark theme values | AMOLED theme values | CHANGED: AMOLED-first |
| `--shadow-glow` | `rgba(255, 107, 107, 0.3)` | `rgba(255, 142, 83, 0.3)` | CHANGED: matches Orange default |

#### Why the defaults shifted
ZeroMount's `:root` defaulted to dark theme (the mid-dark navy). Proposal A defaults to AMOLED (pure black) because Scalpel uses `'amoled'` as its default theme in the store. This is intentional -- the `:root` values serve as the flash-of-unstyled-content (FOUC) fallback, so they should match the most common initial state.

#### ADDED in Proposal A (not in ZeroMount `:root`)

| Variable | Value | Purpose |
|----------|-------|---------|
| `--bg-surface-input` | `rgba(255,255,255,0.04)` | Dedicated input field background |
| `--text-disabled` | `rgba(255,255,255,0.2)` | Disabled state text color |
| `--cat-essential` | `#FF3B3B` | Category color: essential apps |
| `--cat-essential-glow` | `rgba(255,59,59,0.4)` | Category glow: essential |
| `--cat-caution` | `#FF8F00` | Category color: caution apps |
| `--cat-caution-glow` | `rgba(255,143,0,0.4)` | Category glow: caution |
| `--cat-safe` | `#00E676` | Category color: safe to remove |
| `--cat-safe-glow` | `rgba(0,230,118,0.4)` | Category glow: safe |
| `--cat-google` | `#448AFF` | Category color: Google apps |
| `--cat-google-glow` | `rgba(68,138,255,0.4)` | Category glow: Google |
| `--cat-unknown` | `#78909C` | Category color: unknown |
| `--cat-unknown-glow` | `rgba(120,144,156,0.4)` | Category glow: unknown |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Spring curve as CSS variable |
| `--ease-out` | `cubic-bezier(0.0, 0.0, 0.2, 1)` | Material ease-out |
| `--ease-standard` | `cubic-bezier(0.4, 0.0, 0.2, 1)` | Material standard curve |

Category colors are Scalpel-specific (debloater needs risk categories). Easing variables are an improvement -- ZeroMount hardcoded the spring curve inline in each component file.

#### Semantic color CHANGES (not just defaults)

| Color | ZeroMount | Proposal A | Delta |
|-------|-----------|------------|-------|
| `--color-success` | `#00D68F` | `#00E676` | Brighter green (Material A200) |
| `--color-warning` | `#FFB800` | `#FF8F00` | Deeper amber (Material 800) |
| `--color-error` | `#FF3D71` | `#FF3B3B` | More pure red |
| `--color-info` | `#00B4D8` | `#448AFF` | Blue instead of cyan |
| `--gradient-primary` | `#FF6B6B -> #FF8E53 -> #FFC107` | `#FF8E53 -> #FF7B3D -> #E85D04` | Orange-only gradient (matches Orange preset) |

**Analysis:** The gradient-primary change is cosmetic-only at initial paint -- it gets overwritten immediately by `applyTheme()` with whatever accent color the user has. The semantic color changes (success/warning/error/info) are more impactful and represent a deliberate choice for higher-contrast colors against pure black backgrounds.

### Animations: Line-by-line comparison

| Animation | ZeroMount | Proposal A | Status |
|-----------|-----------|------------|--------|
| `spin` | `rotate(0deg) -> rotate(360deg)` | Same | KEPT |
| `heartbeat` | `scale(1) -> 1.05 -> 1 -> 1.05 -> 1` | `scale(1) -> 1.06 -> 1 -> 1.06 -> 1` | TWEAKED (1.05 -> 1.06) |
| `glowPulse` | `0 0 20px -> 0 0 30px` | `0 0 16px -> 0 0 28px` | TWEAKED (slightly tighter range) |
| `float` | `translateY(0) -> translateY(-4px)` | `translateY(0) -> translateY(-3px)` | TWEAKED (-4px -> -3px) |
| `pulse` | `opacity: 1 -> 0.5` | Same | KEPT |
| `slideInRight` | `translateX(20px)` | `translateX(16px)` | TWEAKED (20 -> 16) |
| `slideInUp` | `translateY(20px)` | `translateY(16px)` | TWEAKED (20 -> 16) |
| `fadeIn` | `opacity: 0 -> 1` | Same | KEPT |
| `scaleIn` | `scale(0.9) -> scale(1)` | Same | KEPT |
| `borderGlow` | `opacity: 0.5 -> 1` | Same | KEPT |
| `shimmer` | `-200% 0 -> 200% 0` | Same | KEPT |
| `textGlow` | `0 0 10px/20px -> 0 0 20px/40px` | `0 0 8px -> 0 0 16px` | TWEAKED (subtler glow) |
| `rotateRing` | `rotate(0deg) -> rotate(360deg)` | Same | KEPT |
| `breathe` | NOT PRESENT | `opacity: 0.6 -> 1` | ADDED |

**Summary:** All 13 ZeroMount animations preserved. 5 were tweaked with slightly tighter motion values (smaller translateX/Y, more subtle glow). 1 new animation added (`breathe`). **Nothing lost.**

### Glass Morphism

| Property | ZeroMount | Proposal A |
|----------|-----------|------------|
| `backdrop-filter` | `blur(20px)` | `blur(16px)` |
| `-webkit-backdrop-filter` | `blur(20px)` | `blur(16px)` |
| `border` | `1px solid var(--glass-border)` | `1px solid var(--glass-border)` |

**Changed:** Blur reduced from 20px to 16px. Slightly sharper glass effect on AMOLED. The difference is subtle.

### WebView Constraint Fixes

ZeroMount has 8 WebView-related fixes. Here is the per-fix comparison:

| # | Fix | ZeroMount | Proposal A | Status |
|---|-----|-----------|------------|--------|
| 1 | `overscroll-behavior: none` on `html` | Line 299 | Line 54 | KEPT |
| 2 | `overscroll-behavior: none` on `body` | Line 303 | Line 65 | KEPT |
| 3 | `min-height: 100dvh` fallback | Line 62 | Line 64 | KEPT |
| 4 | `touch-action: manipulation` on `*` | Line 308 | Line 79 | KEPT |
| 5 | `-webkit-tap-highlight-color: transparent` | Line 313 | Line 79 | KEPT |
| 6 | `#root { isolation: isolate }` | Line 318 | Line 80 | KEPT |
| 7 | `safe-area-inset-bottom` padding | Lines 291-295 | Lines 119-121 | KEPT |
| 8 | `-webkit-text-size-adjust: 100%` | Line 50 | Line 53 | KEPT |

All 8 WebView fixes preserved.

### What was REMOVED from ZeroMount app.css

| Section | ZeroMount Lines | Status |
|---------|----------------|--------|
| `.glow-text` utility class | 257-260 | REMOVED (moved to component-level CSS) |
| `.logo-container`, `.logo-ring`, `.logo-inner` | 327-367 | REMOVED (ZeroMount-specific branding) |
| `a:hover { text-decoration: underline }` | 141-143 | REMOVED (links don't underline on hover) |
| `::-webkit-scrollbar-thumb:hover` | 80-82 | REMOVED (no hover state for scrollbar) |
| `scroll-behavior: auto !important` in reduced-motion | 286 | REMOVED |
| `@supports not selector(:focus-visible)` fallback | 114-122 | REMOVED (ancient browser fallback unnecessary for Android WebView) |

### What was ADDED (KernelSU-specific)

```css
@import "https://mui.kernelsu.org/internal/insets.css";
```
This import provides KernelSU Module WebUI safe area insets. ZeroMount did not use it; Proposal A adds it for proper KSU WebView integration.

### Spring Curve

| Context | ZeroMount | Proposal A |
|---------|-----------|------------|
| CSS variable | NOT defined | `--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)` |
| Inline usage (Button.css) | `cubic-bezier(0.34, 1.56, 0.64, 1)` | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| Inline usage (Card.css) | `cubic-bezier(0.34, 1.56, 0.64, 1)` | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| Inline usage (Toggle.tsx) | `cubic-bezier(0.34, 1.56, 0.64, 1)` | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| Inline usage (Toast.tsx) | `cubic-bezier(0.34, 1.56, 0.64, 1)` | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| Inline usage (Modal.tsx) | `cubic-bezier(0.34, 1.56, 0.64, 1)` | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| Inline usage (NavBar.css) | `cubic-bezier(0.34, 1.56, 0.64, 1)` | `cubic-bezier(0.34, 1.56, 0.64, 1)` |

**Preserved everywhere.** Proposal A additionally defines it as a CSS variable (`--ease-spring`) for future use, but the inline values remain identical in all component files.

---

## File 3: `src/lib/store.ts` (theme-related parts only)

**Verdict: REWRITTEN (same architecture, different domain data -- theme system faithfully ported)**

### Theme System Comparison

The store.ts files are structurally very different because they manage different apps (ZeroMount manages VFS rules, excluded UIDs, and KSU modules; Scalpel manages debloated apps, systemized apps, and scanner results). However, the theme management portion follows an identical pattern.

#### Theme Initialization

| Aspect | ZeroMount | Proposal A | Match? |
|--------|-----------|------------|--------|
| localStorage key prefix | `zeromount-` | `scalpel-` | Renamed (expected) |
| Default theme | `'amoled'` | `'amoled'` | IDENTICAL |
| Saved theme types | `'dark' \| 'light' \| 'auto' \| 'amoled'` | `'dark' \| 'light' \| 'amoled'` | **CHANGED: 'auto' removed** |
| Auto accent logic | Random from `accentPresets` keys | Random from `accentPresets` keys | IDENTICAL |
| Default accent fallback | `'#FF8E53'` | `'#FF8E53'` | IDENTICAL |
| `savedAutoAccent` null -> true | Yes | Yes | IDENTICAL |

**Missing: `'auto'` theme option.** ZeroMount supports `'auto'` (follows system dark/light preference via `matchMedia`). Proposal A drops this entirely:
- No `systemPrefersDark` signal
- No `matchMedia('(prefers-color-scheme: dark)')` listener
- No `'auto'` branch in `currentTheme` memo
- Settings type doesn't include `'auto'`

This is a **functional loss** -- users cannot have the theme follow their system dark/light preference.

#### `currentTheme` memo

ZeroMount:
```ts
const currentTheme = createMemo(() => {
  const pref = settings.theme;
  const baseTheme = pref === 'light' ? lightTheme
    : pref === 'amoled' ? amoledTheme
    : pref === 'auto' ? (systemPrefersDark() ? darkTheme : lightTheme)
    : darkTheme;
  const accentStyles = getAccentStyles(settings.accentColor);
  return { ...baseTheme, gradientPrimary: ..., textAccent: ..., ... };
});
```

Proposal A:
```ts
const currentTheme = createMemo(() => {
  const pref = settings.theme;
  const base = pref === 'light' ? lightTheme
    : pref === 'amoled' ? amoledTheme
    : darkTheme;
  const accent = getAccentStyles(settings.accentColor);
  return { ...base, gradientPrimary: ..., textAccent: ..., ... };
});
```

Same structure minus `auto` branch.

#### Theme Reactive Effects

| Effect | ZeroMount | Proposal A | Match? |
|--------|-----------|------------|--------|
| `applyTheme(currentTheme(), accentColor)` | Yes | Yes | IDENTICAL |
| `applyAccent(settings.accentColor)` | Yes | Yes | IDENTICAL |
| Save theme to localStorage | Yes | Yes | IDENTICAL (different key) |
| Save accent to localStorage | Yes | Yes | IDENTICAL (different key) |
| Save autoAccent to localStorage | Yes | Yes | IDENTICAL (different key) |
| Save fixedNav to localStorage | Yes | **MISSING** | LOST (no fixedNav setting) |
| Randomize on visibilitychange | Yes | Yes | IDENTICAL |

#### Missing from Proposal A store

| Feature | ZeroMount | Proposal A | Impact |
|---------|-----------|------------|--------|
| `fixedNav` setting | Yes (persisted) | Not present | NavBar always in default position |
| `systemPrefersDark` signal | Yes | Not present | No auto theme |
| `matchMedia` listener | Yes | Not present | No system theme tracking |
| Granular loading states | `createStore` with 6 fields | Single `createSignal(true)` | Less precise loading UI |

---

## Summary Table

| Check Item | Status | Details |
|------------|--------|---------|
| AMOLED color values | IDENTICAL in theme.ts; CSS defaults shifted to AMOLED-first | No loss |
| 6 accent presets | ALL IDENTICAL (every hex, gradient, rgb) | No loss |
| `applyTheme()` mechanism | PRESERVED + 2 additions (`--bg-page`, `--toggle-off-track`) | Improvement |
| `applyAccent()` mechanism | IDENTICAL | No loss |
| CSS custom properties | 22 ZeroMount vars -> 34 Proposal A vars | 12 added, 0 removed. Several opacity values shifted for AMOLED-first defaults |
| Glass morphism | `blur(20px)` -> `blur(16px)` | Slightly tighter blur |
| 13 keyframe animations | All 13 preserved (5 with tighter motion values) | 1 added (`breathe`), 0 lost |
| Spring curve | `cubic-bezier(0.34, 1.56, 0.64, 1)` preserved everywhere | Also elevated to CSS variable |
| 8 WebView fixes | All 8 preserved | No loss |
| `'auto'` theme mode | PRESENT in ZeroMount | **MISSING in Proposal A** | Functional loss |
| `fixedNav` setting | PRESENT in ZeroMount | **MISSING in Proposal A** | Feature loss |
| `systemPrefersDark` tracking | PRESENT in ZeroMount | **MISSING in Proposal A** | Required for auto theme |
| KSU insets.css import | Not present | Added | Improvement |
| Category color variables | Not present | 10 new `--cat-*` variables | Scalpel-specific addition |
| Easing CSS variables | Not present | 3 new `--ease-*` variables | Improvement |
| Semantic colors (success/warning/error/info) | ZeroMount palette | Different, higher-contrast palette | Intentional change |

---

## Losses Requiring Attention

### 1. `'auto'` theme mode (MEDIUM)
ZeroMount lets users pick "Auto" which follows the system dark/light preference. Proposal A dropped this, offering only dark/light/amoled. Fix: add `systemPrefersDark` signal and `'auto'` branch back to `currentTheme` memo.

### 2. `fixedNav` setting (LOW)
ZeroMount persists a "fixed navigation" preference. Proposal A does not have this. May or may not be needed depending on Scalpel's navigation design.

### 3. Semantic color divergence (INFO)
The success/warning/error/info colors were changed. This is likely intentional for AMOLED contrast but means Proposal A's error states will look different from ZeroMount. Not a "loss" per se, but worth documenting.

### 4. `.glow-text` utility removed (LOW)
Moved to component-level CSS rather than global. Not a loss if components define their own glow styles.

### 5. `.logo-*` classes removed (EXPECTED)
These are ZeroMount branding. Scalpel has its own identity. Correct to remove.
