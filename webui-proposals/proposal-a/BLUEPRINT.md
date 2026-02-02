# SCALPEL WebUI -- Proposal A Blueprint

## 1. Design Philosophy

Scalpel's interface is a **clinical theatre rendered in light**. The metaphor is an operating room at 2 AM -- pure black void, a single cone of white overhead, and the sharp glint of steel instruments laid out with obsessive precision. Every surface is dark glass. Every accent is a thin line of laser-bright color cutting through the void. There is nothing decorative. There is nothing accidental. The design communicates one thing: *this tool does not make mistakes*.

The emotional arc is deliberate. On first open, the user sees darkness and a single pulsing scalpel glyph. Then the interface carves itself into existence -- panels slide in from precise angles, numbers tick up like vital signs on a monitor, category badges glow like isotope markers. The experience is not warm or friendly. It is *controlled*. It is the feeling of holding a scalpel: lightweight, impossibly sharp, and entirely your responsibility.

This is expressionism through restraint. The drama comes from contrast -- razor-thin accent lines against infinite black, oversized typography for critical numbers against whisper-small labels, sudden color flares for danger states against the monochrome calm. Every animation has surgical intent: it shows what happened, what changed, what you need to know next. Nothing moves for decoration. Everything moves with purpose.

## 2. Visual Language

### Color Palette

**Backgrounds:**
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-void` | `#000000` | Primary AMOLED black. The infinite dark. |
| `--bg-surface` | `rgba(255, 255, 255, 0.03)` | Card backgrounds, panels |
| `--bg-surface-elevated` | `rgba(255, 255, 255, 0.06)` | Active cards, hover states |
| `--bg-surface-hover` | `rgba(255, 255, 255, 0.09)` | Pressed states |
| `--bg-surface-input` | `rgba(255, 255, 255, 0.04)` | Input fields |

**Text:**
| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#FFFFFF` | Headings, app names |
| `--text-secondary` | `rgba(255, 255, 255, 0.6)` | Body text, descriptions |
| `--text-tertiary` | `rgba(255, 255, 255, 0.35)` | Labels, hints, timestamps |
| `--text-disabled` | `rgba(255, 255, 255, 0.2)` | Disabled states |

**Category Colors (the isotope markers):**
| Category | Hex | Glow | Usage |
|----------|-----|------|-------|
| Essential | `#FF3B3B` | `rgba(255, 59, 59, 0.4)` | Danger. Do not touch. |
| Caution | `#FF8F00` | `rgba(255, 143, 0, 0.4)` | Proceed carefully. |
| Safe | `#00E676` | `rgba(0, 230, 118, 0.4)` | Clear to remove. |
| Google | `#448AFF` | `rgba(68, 138, 255, 0.4)` | Google ecosystem. |
| Unknown | `#78909C` | `rgba(120, 144, 156, 0.4)` | Research first. |

**Semantic:**
| Token | Hex | Glow |
|-------|-----|------|
| `--color-success` | `#00E676` | `rgba(0, 230, 118, 0.4)` |
| `--color-warning` | `#FF8F00` | `rgba(255, 143, 0, 0.4)` |
| `--color-error` | `#FF3B3B` | `rgba(255, 59, 59, 0.4)` |
| `--color-info` | `#448AFF` | `rgba(68, 138, 255, 0.4)` |

**Accent Presets (6 scalpel edges):**
| Name | Primary | Gradient | RGB |
|------|---------|----------|-----|
| Titanium | `#B0BEC5` | `linear-gradient(135deg, #B0BEC5, #78909C, #546E7A)` | `176, 190, 197` |
| Plasma | `#E040FB` | `linear-gradient(135deg, #E040FB, #AA00FF, #6200EA)` | `224, 64, 251` |
| Emerald | `#00E676` | `linear-gradient(135deg, #00E676, #00C853, #009624)` | `0, 230, 118` |
| Azure | `#448AFF` | `linear-gradient(135deg, #448AFF, #2962FF, #0D47A1)` | `68, 138, 255` |
| Crimson | `#FF1744` | `linear-gradient(135deg, #FF1744, #D50000, #B71C1C)` | `255, 23, 68` |
| Amber | `#FFAB00` | `linear-gradient(135deg, #FFAB00, #FF8F00, #E65100)` | `255, 171, 0` |

### Typography

**Font Stack:**
- Display: `'Space Grotesk', system-ui, sans-serif` -- weights 500, 600, 700
- Body: `'Inter', system-ui, sans-serif` -- weights 400, 500, 600
- Mono: `'JetBrains Mono', monospace` -- weights 400, 500

**Size Scale (modular, ratio 1.25):**
| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `--text-hero` | `40px` | 700 | Tab hero numbers (debloated count, etc.) |
| `--text-title` | `28px` | 700 | Section headers |
| `--text-heading` | `20px` | 600 | Card headers, modal titles |
| `--text-subheading` | `16px` | 600 | Group labels |
| `--text-body` | `14px` | 400 | Body text, descriptions |
| `--text-caption` | `12px` | 500 | Labels, badges, timestamps |
| `--text-micro` | `10px` | 600 | Overline labels, pill text |

### Spacing System

Base unit: `4px`. Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

| Token | Value |
|-------|-------|
| `--space-xs` | `4px` |
| `--space-sm` | `8px` |
| `--space-md` | `12px` |
| `--space-base` | `16px` |
| `--space-lg` | `20px` |
| `--space-xl` | `24px` |
| `--space-2xl` | `32px` |
| `--space-3xl` | `40px` |
| `--space-4xl` | `48px` |

### Border Radius

Clinical precision -- sharp where possible, rounded only for interactive touchpoints.

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-none` | `0px` | Section headers, badges that feel stamped |
| `--radius-sm` | `4px` | Inline tags, micro badges |
| `--radius-md` | `8px` | Input fields, small cards |
| `--radius-lg` | `12px` | Primary cards, buttons |
| `--radius-xl` | `16px` | Modal, bottom sheets |
| `--radius-pill` | `100px` | Category pills, search bar |

### Elevation & Depth

No heavy shadows on AMOLED. Depth through border luminosity and subtle backdrop blur.

| Level | Implementation |
|-------|---------------|
| Surface | `border: 1px solid rgba(255,255,255,0.06)` |
| Elevated | `border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(16px)` |
| Floating | `border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 8px 32px rgba(0,0,0,0.6)` |
| Modal | `backdrop-filter: blur(24px); border-top: 1px solid rgba(255,255,255,0.15)` |

### Surface Treatments

- **Glass panels**: `background: rgba(255,255,255,0.03); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.06)`
- **Active glass**: Border brightens to `rgba(255,255,255,0.12)` with `0 0 0 1px rgba(accent,0.2)` inner glow
- **Accent line**: `1px` horizontal line using gradient, placed at card tops as a scalpel-edge accent
- **Category glow**: When a category badge is present, the card has a faint `box-shadow: inset 0 1px 0 0 rgba(category-color, 0.15)` top edge

## 3. Animation Language

### Page Transitions

Tab switches use a **crossfade + directional slide**:
- Outgoing tab: `opacity 0`, `translateY(8px)`, duration `150ms`, `ease-out`
- Incoming tab: `opacity 1`, `translateY(0)` from `translateY(-8px)`, duration `250ms`, `ease-out`
- Total perceived transition: ~250ms

### Component Entrances

| Component Type | Animation | Duration | Delay Pattern |
|----------------|-----------|----------|---------------|
| Hero number | Count-up from 0 with cubic ease-out | `600ms` | Immediate |
| Section header | `fadeIn` + `translateY(-4px)` to 0 | `200ms` | `50ms` after hero |
| Card | `fadeIn` + `translateY(12px)` to 0 | `250ms` | Staggered `60ms * index` |
| App list item | `fadeIn` + `translateX(16px)` to 0 | `200ms` | Staggered `40ms * index`, max 8 |
| Badge | `scaleIn` from `0.8` + fade | `150ms` | With parent card |
| FAB | `scaleIn` from `0` + spring overshoot | `400ms` | `300ms` after page ready |

### Micro-interactions

| Interaction | Animation |
|-------------|-----------|
| Button press | `scale(0.97)` for `100ms`, spring back |
| Card tap | Border brightens, `scale(0.99)` spring |
| Toggle | Track color slides with `200ms` ease. Thumb has spring overshoot |
| Checkbox/select | `scaleIn` on check icon, `150ms` |
| Search focus | Input border glows with accent, `200ms` |
| Category pill tap | `scale(0.95)` snap, content filters with `fadeIn` |
| Delete/nuke action | Item `translateX(-100%)` + `opacity 0`, `300ms`, ease-in |

### Loading States

- **Skeleton**: Shimmer sweep on `rgba(255,255,255,0.03)` rectangles. Sweep highlight `rgba(255,255,255,0.06)`.
- **Operation in progress**: Pulsing accent border on the action card, with a thin progress line animation at the card top edge
- **Nuke progress**: Per-app line items tick from pending (dim) to processing (pulse) to done (accent check) or failed (red X)

### Reboot FAB

| State | Animation |
|-------|-----------|
| Idle | Subtle `float` (translateY -3px, 3s ease infinite). Gentle accent glow pulse on shadow. |
| Tap | `scale(1.1)` spring overshoot, then settle to `1.0`. Ripple effect from touch point. |
| Confirmation pending | Pulsing border glow, awaiting second tap or modal confirmation |
| Executing | Spin icon 360deg, shrink to dot, device reboots |

### Easing Curves

| Name | Value | Usage |
|------|-------|-------|
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Interactive elements, FAB, toggles |
| `--ease-out` | `cubic-bezier(0.0, 0.0, 0.2, 1)` | Entrances, reveals |
| `--ease-in` | `cubic-bezier(0.4, 0.0, 1, 1)` | Exits, dismissals |
| `--ease-standard` | `cubic-bezier(0.4, 0.0, 0.2, 1)` | General transitions |

### Stagger Timing

- List items: `40ms` per item, capped at 8 items (`320ms` max stagger)
- Cards: `60ms` per card
- Stats: `100ms` per stat counter

## 4. Component Plan

### Core Components (Preserved from fork, restyled)

| Component | Description | Restyling |
|-----------|-------------|-----------|
| `Badge` | Category/status badge | Add category color variants, micro size option |
| `Button` | Multi-variant button | Sharper radius (12px), accent gradient fills |
| `Card` | Glass surface container | Add `accent-line` variant with top gradient border |
| `Input` | Text input with label | Dark glass background, accent focus ring |
| `Skeleton` | Loading placeholder | Thinner, sharper shimmer |
| `Toggle` | Switch control | Accent track color, spring thumb |
| `Modal` | Bottom sheet | Sharper top corners, accent line at top |
| `Toast` | Notification | Thin accent left border instead of full background |

### New Components

| Component | Props | Animation | Location |
|-----------|-------|-----------|----------|
| `RebootFAB` | `needsReboot: boolean` | Float idle, spring tap, pulse when reboot needed | All tabs, bottom-right |
| `CategoryPill` | `category: string, active: boolean, count: number` | Scale tap, accent glow when active | Debloat tab filter bar |
| `AppRow` | `app: ScannedApp, nuked: boolean, selected: boolean` | SlideInRight entry, scale tap | Debloat/Systemize lists |
| `SearchBar` | `value, onInput, placeholder` | Expand on focus, accent border glow | Debloat tab |
| `StatCard` | `label, value, icon, variant` | Count-up number, fadeIn | Status tab |
| `ModeIndicator` | `mode: string` | Gradient text with glow | Status tab hero |
| `ProgressLine` | `progress: number` | Width transition, accent fill | Nuke operation progress |
| `ConfirmSheet` | `title, message, danger, onConfirm, onCancel` | Modal slide-up with danger accent | Nuke/restore/reboot confirms |
| `LogViewer` | `lines: string[]` | Mono font, auto-scroll, fade top edge | Status tab |
| `AccentPicker` | `selected, onSelect` | Glow ring on selected, scale tap | Settings tab |
| `RangeSlider` | `min, max, value, onChange, label` | Thumb follows accent, track fill | Settings (monitor interval) |
| `SelectDropdown` | `options, value, onChange, label` | Slide-down reveal, accent active | Settings (mode override) |
| `SectionHeader` | `title, subtitle?, action?` | FadeIn + translateY | All tabs |
| `EmptyState` | `icon, title, description` | FadeIn, centered | Lists with no items |

## 5. Tab-by-Tab Design

### Debloat Tab

**Hero area:** Large category pill strip across the top. Horizontal scrollable row of 5 category pills: Essential (red), Caution (orange), Safe (green), Google (blue), Unknown (gray). All active by default. Tapping one toggles it. Below: count of visible apps as oversized number.

**Search bar:** Full-width, pill-shaped, glass background. Magnifying glass icon left. Clear button right when text present. Accent glow on focus.

**App list:** Vertical scrollable list of `AppRow` components. Each row shows:
- Left: App icon (32x32, from `ksu://icon/{pkg}` with fallback placeholder)
- Center: App name (primary text), package name (tertiary text below), partition badge (micro)
- Right: Category badge (colored dot + label), chevron for detail

**App states:**
- **Available** (not nuked): Default card surface, category color dot
- **Selected** (multi-select active): Accent border glow, checkbox icon visible
- **Nuked** (in nuke_list): Dimmed text, strikethrough app name, "NUKED" badge, accent-colored restore button
- **Essential/Caution selected**: Row background gains a faint red/orange tint as warning

**Nuked section:** Separate collapsible section at top labeled "Debloated Apps" with count. Nuked apps shown with restore button.

**Interactions:**
- Tap app row: Opens detail bottom sheet (package info, path, partition, category explanation, nuke/restore button)
- Long-press or checkbox: Enters multi-select mode. Accent-filled selection count badge in header area. Batch "Nuke Selected" button slides up from bottom.
- Nuke flow: Select -> Tap nuke -> ConfirmSheet with risk warnings for essential/caution apps -> Execute -> Progress line per app -> Result toast -> Reboot FAB pulses if mode requires it
- Restore flow: Tap restore on nuked app -> ConfirmSheet -> Execute -> Result toast

**Batch operations:** When multi-select is active, a bottom action bar slides up with "Nuke {N} Apps" button. Danger variant if any essential/caution selected.

**Refresh:** Small refresh icon button in the section header area. Triggers scanner. Shows inline progress.

### Systemize Tab

**Hero area:** Two-segment layout.
- Left segment: "Promoted" count as hero number with "system apps" label
- Right segment: "Available" count with "user apps" label

**Promoted section:** Cards for each systemized app from `systemize_list.json`. Each card shows:
- App name, package name, promoted date
- Verification badge: green check (verified), red X (broken), gray ? (unverified)
- Demote button (danger ghost variant)

**Available section:** User apps from `listPackages("user")`. Similar layout to debloat app list but simpler. Each row:
- App icon, name, package name
- "Promote" button (primary variant)

**Promotion flow:** Tap promote -> ConfirmSheet ("This will copy the app to system partition. Reboot required.") -> Execute promote.sh -> Success toast -> Reboot FAB pulses

**Demote flow:** Tap demote -> ConfirmSheet -> Execute demote -> Reboot FAB pulses

**Search:** Shared SearchBar component for filtering available apps.

### Status Tab

**Hero area:** Current mode displayed as oversized gradient text. Below: a one-line description of what the mode does. Mode icon/glyph beside the text.

**Health grid:** 2x3 grid of StatCards:
1. **Debloated** -- count from status.json, success color
2. **Failed** -- debloat_failed, error color (0 = success color)
3. **Verified** -- debloat_verified, info color
4. **Broken** -- debloat_broken, error color
5. **Systemized** -- systemized count
6. **Repairs** -- monitor_repairs count

**Protection card:** Bootloop protection status.
- Boot counter display (0-2 = green, 3+ = red)
- Visual: three dots/pips that fill as counter increases
- If module was auto-disabled: red warning card with "Module was disabled by bootloop protection" and re-enable button

**Monitor card:** Daemon status.
- Running/stopped indicator with pulsing green/static gray dot
- Interval display
- Last check timestamp
- Start/stop toggle

**Last operation card:**
- Timestamp of last nuke
- Partial warning if `status.json.partial === true`
- Last verify timestamp

**Log viewer:** Expandable section. Loads tail of debug.log. Mono font, line-numbered, accent-highlighted keywords (ERROR in red, WARN in orange, INFO in blue).

### Settings Tab

**Grouped sections with SectionHeader dividers:**

**Debloat Engine:**
- Mode Override: SelectDropdown (Auto, zeromount, mountify, symlink, whiteout, magisk, pm). Description text for selected mode.
- Disable Only: Toggle. When on, uses pm disable instead of mode-based removal.
- Refresh App List: Toggle. Forces re-scan on next boot.

**Monitor:**
- Enable Monitor: Toggle with running status indicator
- Monitor Interval: RangeSlider (60-3600s) with current value display. Steps: 60, 120, 300, 600, 900, 1800, 3600.

**Appearance:**
- Theme: Three-option selector (Dark, Light, AMOLED). AMOLED is default.
- Accent Color: AccentPicker. 6 color circles. Selected has glow ring.
- Auto Accent: Toggle. When on, randomizes accent on each open.

**Logging:**
- Log Level: SelectDropdown (debug, info, warn, error, fatal)

**About:**
- Module version display
- Module ID
- Active mode (read-only)
- Data directory path

**Actions:**
- Export Debug Log button
- View Full Log button (opens log viewer modal)

## 6. Navigation & Layout

### Tab Bar (NavBar)

Position: Fixed bottom. Full-width glass panel.

4 tabs: Debloat (scalpel icon), Systemize (arrow-up icon), Status (pulse/heartbeat icon), Settings (gear icon).

**Indicator:** Gradient-filled pill that slides between tabs using the spring curve. The indicator is a thin 2px line at the TOP of the tab item (not a background highlight). This creates the "scalpel edge" effect -- a razor line that marks where you are.

**Active tab:** Icon and label use gradient text fill (accent). Inactive: tertiary text color.

**Spacing:** Each tab is equal-width. Labels are uppercase micro text below icons.

### Header

Minimal. Left-aligned "SCALPEL" in Space Grotesk 700, gradient text fill. Below: current tab name in caption text, tertiary color. No decorative elements.

Height: 64px including top safe area. Sticky but not glass (transparent bg, blends with void).

### Reboot FAB

Position: Fixed, bottom-right, 24px above NavBar top edge, 16px from right edge.

Size: 48px circle. Accent gradient background.

Icon: Power/reboot icon, white.

Z-index: 150 (above NavBar at 100, below Modal at 200).

States:
- Default: Floating animation, subtle glow
- Reboot needed: Pulsing accent glow, slightly larger shadow
- Tapped: Opens ConfirmSheet ("Reboot Device?" with warning about unsaved changes)

### Overall Page Structure

```
+------------------+
| Header (64px)    |
+------------------+
|                  |
| Tab Content      |
| (scrollable)     |
|                  |
|                  |
+------------------+
| [FAB]            |
+------------------+
| NavBar (56px)    |
+------------------+
```

Content area has bottom padding to clear NavBar + FAB. Scroll is per-tab, not global.

## 7. File Structure Plan

```
src/
  index.tsx                    -- Entry point, render App
  App.tsx                      -- Root shell: header, tab switch, navbar, FAB, toast
  app.css                      -- Global reset, CSS vars, keyframes, WebView fixes

  lib/
    types.ts                   -- All Scalpel domain interfaces
    constants.ts               -- Paths, version, mode descriptions
    store.ts                   -- Reactive state management singleton
    api.ts                     -- Bridge API wrapper (exec/spawn calls)
    api.mock.ts                -- Mock API for browser development
    theme.ts                   -- Theme objects, accent presets, apply functions
    icons.ts                   -- SVG path data for all icons
    ksu.d.ts                   -- KSU native type declarations (keep)

  components/
    core/
      Badge.tsx + Badge.css    -- Category/status badges
      Button.tsx + Button.css  -- Multi-variant buttons
      Card.tsx + Card.css      -- Glass surface cards
      Input.tsx + Input.css    -- Text inputs
      Skeleton.tsx + Skeleton.css -- Loading skeletons
      Toggle.tsx               -- Toggle switches

    layout/
      Header.tsx + Header.css  -- App header
      NavBar.tsx + NavBar.css  -- Bottom tab navigation
      Modal.tsx                -- Bottom sheet modal
      Toast.tsx                -- Toast notifications

    scalpel/
      RebootFAB.tsx + RebootFAB.css       -- Floating reboot button
      SearchBar.tsx + SearchBar.css        -- Search input with glass styling
      CategoryPills.tsx + CategoryPills.css -- Horizontal category filter strip
      AppRow.tsx + AppRow.css              -- App list item
      StatCard.tsx + StatCard.css          -- Stats display card
      ModeIndicator.tsx + ModeIndicator.css -- Active mode hero display
      ConfirmSheet.tsx                     -- Confirmation bottom sheet
      ProgressLine.tsx + ProgressLine.css  -- Operation progress bar
      LogViewer.tsx + LogViewer.css        -- Debug log viewer
      AccentPicker.tsx + AccentPicker.css  -- Color selection circles
      SectionHeader.tsx + SectionHeader.css -- Section title with divider
      EmptyState.tsx + EmptyState.css      -- Empty list placeholder
      SelectDropdown.tsx + SelectDropdown.css -- Styled select control
      RangeSlider.tsx + RangeSlider.css    -- Slider input

  routes/
    DebloatTab.tsx + DebloatTab.css        -- Debloat tab view
    SystemizeTab.tsx + SystemizeTab.css    -- Systemize tab view
    StatusTab.tsx + StatusTab.css          -- Status dashboard view
    SettingsTab.tsx + SettingsTab.css      -- Settings view
```
