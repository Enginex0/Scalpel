# App Nuker WebUI -- Forensic Analysis

> **Source Project:** systemapp_nuker v1.1.9 by ChiseWaguri & Contributors
> **Source Path:** `/home/claudetest/zero-mount/systemapp_nuker/module/`
> **Total WebUI Files:** 17 (3 HTML, 5 JS, 7 CSS, 1 JSON, 1 PNG asset)
> **Total Lines Processed:** ~3,813

---

## File Structure

```
webroot/
  index.html                  # 197 lines  - Home/debloat page
  restore.html                # 122 lines  - Restore nuked apps page
  raw_whiteout.html           # 108 lines  - Raw whiteout path manager (dev mode)
  default.png                 # 37 lines   - Fallback app icon (base64 PNG)
  categories.json             # 294 lines  - App risk classification database
  scripts/
    index.js                  # 181 lines  - Home page controller
    restore.js                # 54 lines   - Restore page controller
    raw_whiteout.js           # 362 lines  - Whiteout page controller
    file_selector.js          # 221 lines  - File browser modal component
    util.js                   # 1114 lines - Shared utilities (THE monolith)
  styles/
    base.css                  # 73 lines   - CSS variables, body, content wrapper
    layout.css                # 200 lines  - Header, search, filters, footer, FAB
    components.css             # 396 lines  - App cards, categories, loading, menu
    modals.css                # 171 lines  - Modal dialogs (import, confirm, info)
    animations.css            # 39 lines   - Ripple effect, text scroll keyframes
    file_selector.css         # 83 lines   - File browser styles
    raw_whiteout.css          # 161 lines  - Whiteout page styles
```

**Architecture:** Multi-page application (MPA). Each HTML page is a standalone document that loads shared CSS and imports JS via ES modules (`type="module"`). No build system, no bundler, no framework. Raw vanilla JS served directly from the module's `webroot/` directory.

**Key observation:** `util.js` is 1,114 lines -- a monolith containing app list management, search, filtering, lazy loading, ripple effects, modals, scroll handling, categories, and the bridge wrapper. Every page imports from it. This is the single largest file and the single biggest maintenance risk.

(`index.html:8`, `restore.html:7`, `raw_whiteout.html:7` -- each page loads its own script module)

---

## Bridge API Usage

The WebUI communicates with the Android system through the KernelSU/MMRL WebUI bridge. The bridge object is a global `ksu` injected into the WebView.

### Bridge Wrapper

```javascript
// util.js:97-112
export async function ksuExec(command) {
    return new Promise((resolve) => {
        let callbackName = `exec_callback_${Date.now()}`;
        window[callbackName] = (errno, stdout, stderr) => {
            resolve({ errno, stdout, stderr });
            delete window[callbackName];
        };
        ksu.exec(command, "{}", callbackName);
    });
}
```

Pattern: Creates a unique callback name using `Date.now()`, registers it on `window`, calls `ksu.exec(command, options, callbackName)`. The callback resolves a Promise with `{errno, stdout, stderr}`. (`util.js:97-112`)

### Toast Helper

```javascript
// util.js:114-120
export function toast(message) {
    ksu.toast(message);
}
```

Direct pass-through to `ksu.toast()`. (`util.js:114-120`)

### MMRL Detection

```javascript
// util.js:645-654
export async function checkMMRL() {
    if (typeof ksu !== 'undefined' && ksu.mmrl) {
        $system_app_nuker.setLightStatusBars(!window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
}
```

Checks for MMRL-specific global `$system_app_nuker` for status bar theming. (`util.js:645-654`)

### All Shell Commands Executed via Bridge

| Location | Command | Purpose |
|----------|---------|---------|
| `util.js:147` | `rm -rf ".../webroot/link" && ln -s /data/adb/system_app_nuker .../webroot/link` | Symlink data dir into webroot for fetch access |
| `util.js:494` | `echo '${JSON.stringify(...)}' > /data/adb/system_app_nuker/${targetFrom}` | Write app list JSON |
| `util.js:500` | `echo '${JSON.stringify(...)}' > /data/adb/system_app_nuker/${targetTo}` | Write nuke list JSON |
| `util.js:516-519` | `busybox nsenter -t1 -m /data/adb/modules/system_app_nuker/nuke.sh` | Execute nuke script in init namespace |
| `util.js:777` | `dumpsys package ${app.package_name} \| grep versionName \| head -1 \| cut -d= -f2` | Get app version |
| `raw_whiteout.js:95` | `echo '${content}' > /data/adb/system_app_nuker/raw_whiteouts.txt` | Save whiteout paths |
| `raw_whiteout.js:98-101` | `busybox nsenter -t1 -m .../nuke.sh` | Execute nuke after whiteout change |
| `restore.js:20` | `echo '${packageList}' > "${filePath}"` | Export package list to file |
| `file_selector.js:34` | `find "${path}" -maxdepth 1 \( -type f -name "*.txt" -o -type f -name "*.json" \) -o -type d ! -name ".*" \| sort` | List directory contents |
| `file_selector.js:102` | `cat "${filePath}"` | Read imported file |
| `util.js:1072` | `sed -i "s\|#whiteout-btn...\|..." .../layout.css` | Dynamically toggle whiteout button visibility in CSS file (!!) |

**CRITICAL PATTERN:** Data is transferred between WebUI and backend via JSON files on disk. The WebUI writes JSON to `/data/adb/system_app_nuker/`, then invokes `nuke.sh` which reads those files. There is no direct IPC -- it is file-based message passing.

**SECURITY NOTE:** Multiple shell injection vectors exist. `util.js:494` passes `JSON.stringify()` output directly into a shell `echo` command with single quotes. If any app name or package name contains a single quote, the command breaks. (`util.js:494-500`)

---

## UI Components

### 1. Header (all pages)

Fixed position at top. Contains title text centered, and a three-dot overflow menu button positioned absolute right. (`index.html:20-36`, `layout.css:1-22`)

- Menu button: 40x40px circle with vertical dots SVG icon (`components.css:89-98`)
- Dropdown menu: absolute positioned, scale animation from top-right origin (`components.css:100-113`)
- Menu items: flex row with SVG icon + text (`components.css:115-125`)

### 2. Search Bar (all pages)

Fixed below header at `top: calc(var(--top-inset) + 80px)`. Full-width input with clear button. (`index.html:38-44`, `layout.css:24-70`)

- Input: rounded 10px border, boxed shadow, themed background/border/text colors
- Clear button: "X" character, absolutely positioned right, hidden by default, shown when text entered (`util.js:131-132`)

### 3. Category Filter Bar (Home + Restore)

Horizontal scrollable row of pill buttons below search. Fixed position. (`index.html:47`, `layout.css:72-91`)

- "All" button always first, with `.active` class
- Per-category buttons: colored background from `categories.json`, white text
- Active state: scale(1.08) + bold + shadow (`components.css:127-145`)
- Inactive state: opacity 0.7

### 4. App Cards (Home + Restore)

Primary list items. Flex row layout. (`components.css:147-267`)

- Left: 48x48 app icon with loading placeholder (`components.css:179-211`)
- Center: app name (16px bold), package name (13px gray), app path (12px lighter gray), optional category dot+label (`components.css:220-292`)
- Right: hidden checkbox (visible via `:has(:checked)` border highlight) (`components.css:162-170`)
- Selection: checked cards get colored border + background change (`components.css:166-170`)
- Text overflow: horizontal scroll animation for names that exceed container width (`animations.css:1-14`, `util.js:334-349`)

### 5. App Info Modal

Full-screen overlay triggered by long press (300ms). (`index.html:115-152`, `util.js:715-799`)

- 64x64 app icon at top
- Detail rows: Package Name, Path, Version (async-loaded), Category (with colored dot)
- Tap-to-copy on detail values (`util.js:787-798`)
- Close via X button, "Close" button, or backdrop click

### 6. Confirmation Modal

Shown before nuking apps. (`index.html:93-113`, `util.js:406-486`)

- Lists selected apps with name + package + category badge
- Critical app warning: red text when essential/caution apps selected (`util.js:417-433`)
- Cancel/Nuke buttons

### 7. Import Modal (Home only)

Paste package list or import from file. (`index.html:69-91`, `index.js:12-129`)

- Textarea with monospace font for package list input
- Supports plain text (one per line) and Canta JSON format (`index.js:70-94`)
- "Import From File" button opens file selector
- Keyboard-aware: modal shifts up 20vh on focus (`index.js:36-40`)

### 8. File Selector Modal (Home only)

Full file browser overlay, 80vh height. (`index.html:154-166`, `file_selector.js`, `file_selector.css`)

- Breadcrumb path with clickable segments (`file_selector.js:8-23`)
- Back button + close button in header
- Directory listing with folder/file icons
- Filters to `.txt` and `.json` files only (`file_selector.js:34`)
- Directory switch animation: scale(0.95) + fade (`file_selector.css:55-58`)

### 9. Floating Action Button (all pages)

Fixed bottom-right, above footer. (`index.html:168-173`, `layout.css:109-139`)

- 58x58 (15px padding + 28px icon) rounded square
- Primary color background with white SVG icon
- Hides on scroll down, shows on scroll up (`util.js:657-664`)
- Animated entry via translateY with cubic-bezier easing (`layout.css:118`)

**Home page FAB:** "Nuke" icon (list with X) -- triggers `updateAppList()` (`index.js:157-161`)
**Restore page FAB:** Clock/restore icon -- triggers `updateAppList(true)` (`restore.js:38-41`)
**Whiteout page FAB:** Plus icon -- opens add path modal (`raw_whiteout.js:304-305`)

### 10. Footer Navigation Bar (all pages)

Fixed bottom bar, 80px + bottom inset. Three tabs: Home, Restore, Whiteout. (`index.html:175-195`, `layout.css:141-199`)

- Icon pill with label below
- Active tab: `.focus-btn` class with colored background, animated transition (`layout.css:190-199`)
- Navigation via `<a href>` (full page reload)
- Whiteout tab hidden by default (`layout.css:201`) -- shown dynamically if raw_whiteouts.txt has content (`util.js:1057-1080`)

### 11. Loading Screen (Home only)

Spinner + progress bar + rotating status text. (`index.html:51-64`, `components.css:1-77`)

- Circular border spinner animation (`components.css:17-30`)
- Indeterminate progress bar with pulse animation (`components.css:59-71`)
- Status text rotates through messages every 1 second (`util.js:76-84`)
- Checks for app_list.json availability via polling (`util.js:60-88`)

### 12. Empty State (Restore page)

Shown when nuke list is empty. (`util.js:220-231`)

- Rocket emoji icon
- "You didn't nuke anything, yet..." heading
- "Go nuuuuuke ><" subtext
- "Start Nuking Apps" button linking to index.html

### 13. Path Items (Whiteout page)

List items for raw whiteout paths. (`raw_whiteout.css:40-106`)

- File icon (SVG) + monospace path text
- Delete button (trash icon) on right
- Confirmation modal before deletion

---

## Styling & Theme

### Methodology

Custom CSS with no framework. Seven separate CSS files split by concern (base, layout, components, modals, animations, file_selector, raw_whiteout). CSS custom properties for theming. (`base.css:1-73`)

### KSU Theme Integration

Imports two external CSS files from KernelSU's CDN:
```css
/* base.css:1-2 */
@import url('https://mui.kernelsu.org/internal/insets.css');
@import url('https://mui.kernelsu.org/internal/colors.css');
```

These provide:
- `--window-inset-top` / `--window-inset-bottom` -- safe area insets for notch/nav bar
- Color variables: `--background`, `--tonalSurface`, `--surfaceBright`, `--onSurface`, `--onSurfaceVariant`, `--primary`, `--onPrimary`, `--error`, `--outlineVariant`, `--filledTonalButtonContentColor`, `--filledTonalButtonContainerColor`

### CSS Variable System

All variables defined in `:root` with KSU variable as primary, hardcoded fallback:

| Variable | Light Fallback | Dark Fallback | Used For |
|----------|---------------|---------------|----------|
| `--bg-primary` | `#F5F5F5` | `#151515` | Page background |
| `--bg-secondary` | `#fff` | `#292929` | Cards, footer, modals |
| `--bg-input` | `#F5F5F5` | `#1b1b1b` | Input fields |
| `--text-primary` | `#000` | `#fff` | Primary text |
| `--text-secondary` | `#757575` | `#C2C2C2` | Secondary text |
| `--btn-primary` | `#007bff` | (inherits) | Primary buttons, FAB |
| `--btn-primary-text` | `#fff` | (inherits) | Button text |
| `--btn-warning` | `#f44336` | `#ff6b6b` | Warning/error elements |
| `--border-color` | `#ccc` | `#636363` | Borders, dividers |

(`base.css:4-43`)

### Dark Mode

Implemented via `@media (prefers-color-scheme: dark)` in two files:
- `base.css:26-43` -- variable overrides
- `components.css:368-396` -- component-specific color overrides

Several hardcoded color values bypass the variable system in dark mode:
- `components.css:249-256` -- `.app-package` uses hardcoded `#666` (light) / `#aaa` (dark)
- `components.css:260-265` -- `.app-path` uses hardcoded `#777`
- `components.css:349-351` -- `.category-name` uses hardcoded `#555` / `#bbb`
- `components.css:354-356` -- `.category-description` uses hardcoded `#666` / `#aaa`

### Typography

No font family specified (uses system default). Key sizes:
- Header title: 24px (`layout.css:22`)
- App name: 16px bold (`components.css:239-247`)
- Package name: 13px (`components.css:249-257`)
- App path: 12px (`components.css:259-266`)
- Category label: 11px, weight 500 (`components.css:284-292`)
- Footer label: 12px (`layout.css:171`)
- Modal title: 18px (`modals.css:39-43`)
- Modal button: 18px bold (`modals.css:76-89`)

### Spacing System

No systematic spacing scale. Ad-hoc pixel values throughout. Common patterns:
- Card padding: 8px (`components.css:150`)
- Card gap: 10px (`layout.css:104`)
- Modal padding: 20px (`modals.css:50-53`)
- Category filter gap: 6px loaded, 20px initial (`layout.css:79, 90`)
- App list margin-top: ~150px + 1em (to clear fixed header/search/filters) (`layout.css:98`)
- Max content width: 900px (`layout.css:97`)

### Border Radius System

No systematic scale. Used values: 4px (category badge), 5px (info detail), 8px (modal button, file items), 10px (search input, app cards), 12px (modal, app icon), 15px (footer corners, FAB, file selector), 50px (footer icon pill).

---

## User Flows

### Flow 1: Browse and Nuke Apps (Primary)

1. User opens WebUI (via KSU manager, MMRL, or KsuWebUIStandalone) (`action.sh:83-93`)
2. Loading screen appears with spinner + progress bar + rotating status (`util.js:16-36`, `index.js:166`)
3. App list symlink created: `ln -s /data/adb/system_app_nuker .../webroot/link` (`util.js:145-152`)
4. `link/app_list.json` fetched and parsed (`util.js:155-205`)
5. Apps displayed sorted alphabetically, lazy-loaded in batches of 20 (`util.js:213-312`)
6. User can search (fuzzy match on name/package/filename) (`util.js:122-142`, `util.js:973-1001`)
7. User can filter by category (Essential/Caution/Safe/Google) (`util.js:832-884`)
8. User taps app cards to select (checkbox toggles, checked apps float to top after 1s) (`util.js:316-331`, `util.js:1032-1054`)
9. User long-presses for app info modal (300ms hold) (`util.js:353-370`)
10. User taps FAB "Nuke" button (`index.js:157-161`)
11. Confirmation modal shows selected apps with category warnings (`util.js:406-486`)
12. On confirm: JSON files written to disk, `nuke.sh` invoked via `nsenter` (`util.js:488-525`)
13. Toast: "Done! Reboot your device!" (`util.js:521`)

### Flow 2: Restore Nuked Apps

1. User navigates to Restore tab via footer (`restore.html`)
2. `link/nuke_list.json` loaded and displayed (`restore.js:43-48`)
3. If empty, shows empty state with "Go nuuuuuke" message (`util.js:220-231`)
4. User selects apps and taps Restore FAB (`restore.js:38-41`)
5. No confirmation modal for restore (skipped) (`util.js:408` -- confirmation only when `!isNuke`)
6. Apps moved from nuke_list back to app_list, nuke.sh re-invoked (`util.js:488-525`)

### Flow 3: Import Package List

1. User taps three-dot menu > "Import Package List" (`index.js:12-129`)
2. Modal opens with textarea + file import button
3. Option A: Paste package names (one per line) or Canta JSON
4. Option B: Tap "Import From File" to open file browser (`file_selector.js:150-161`)
5. File browser starts at `/storage/emulated/0/Download`, shows `.txt`/`.json` files
6. Selected file contents loaded into textarea (`file_selector.js:99-147`)
7. On confirm: matches packages against app_list, auto-selects found apps (`index.js:102-127`)

### Flow 4: Export Package List

1. User navigates to Restore tab
2. Taps three-dot menu > "Export Package List" (`restore.js:4-31`)
3. Package names written to `/storage/emulated/0/Download/app_nuker_packages_YYYY-MM-DD.txt`
4. Toast confirms export location

### Flow 5: Raw Whiteout Management (Dev Mode)

1. User triple-clicks header title on Home page to navigate to whiteout page (`index.js:132-151`)
2. OR navigates via footer Whiteout tab (if visible)
3. Existing whiteout paths loaded from `link/raw_whiteouts.txt` (`raw_whiteout.js:9-26`)
4. User taps FAB "+" to add path (`raw_whiteout.js:165-192`)
5. Path auto-prefixed with `/system` if missing (`raw_whiteout.js:120-122`)
6. Path saved to file, nuke.sh invoked immediately (`raw_whiteout.js:84-110`)
7. Delete: tap trash icon > confirmation modal > remove + nuke.sh (`raw_whiteout.js:147-162`)

---

## Data Display Patterns

### App List Data Format

Apps loaded from JSON files with this structure (inferred from `util.js:173, 253-289`):
```json
[
  {
    "app_name": "Chrome",
    "package_name": "com.android.chrome",
    "app_path": "/system/app/Chrome/Chrome.apk"
  }
]
```

### Sorting

- Primary sort: alphabetical by `app_name` (`util.js:173`)
- Checked apps float to top after 1-second delay (`util.js:1032-1054`)

### Lazy Loading

- Initial batch: 20 apps (`util.js:210` -- `APPS_PER_BATCH = 20`)
- Scroll trigger: when bottom of list is within 100px of viewport (`util.js:1019-1030`)
- Additional apps loaded in batches of 20 via `displayAppList(null, false)`
- When filtering shows < 10 results and more apps exist, auto-loads more (`util.js:955-961`)

### Search

- **Fuzzy match** on app name, package name, and APK filename (`util.js:973-1001`)
- Fuzzy algorithm: all search characters must appear in order (skipping characters between) (`util.js:984-1001`)
- Exact substring matches highlighted with `<mark>` tags (`util.js:1005-1016`)
- Path highlighting: only filename portion highlighted, not full path (`util.js:938-945`)
- Clear button appears when text entered (`util.js:131-132`)
- Scrolls to top on search input (`util.js:127`)

### Category Filtering

- Categories from `categories.json`: Essential (red #ff6b6b), Caution (orange #ff5722), Safe (green #4caf50), Google (blue #4285f4), Unknown (gray #9e9e9e) (`categories.json:2-34`)
- 258 apps pre-classified in `categories.json:36-293`
- Filter buttons: horizontal scroll, only categories with apps shown (`util.js:854-870`)
- Combined with search: both filters applied simultaneously (`util.js:887-969`)
- Unknown category hidden from filter bar (`util.js:858`) and card display (`util.js:259-263`)

### Category Display on Cards

- Known categories: small colored dot (8px) + category name text (`util.js:260-263`, `components.css:269-292`)
- Unknown category: no badge shown (`util.js:259`)

### App Icons

- Loaded from `link/icons/${package_name}.png` (`util.js:276`)
- Fallback: `default.png` on error (`util.js:278`)
- Loading state: gray placeholder with "Loading..." text (`util.js:273-274`, `components.css:197-211`)
- Fade-in on load via inline `onload` handler setting opacity (`util.js:277`)

---

## Action Patterns

### Selection

- Tap anywhere on app card to toggle checkbox (`util.js:318-330`)
- Checkbox is visually hidden (`components.css:162-164`)
- Selected state: card border changes to primary color, background to border-color (`components.css:166-170`)
- Selected apps move to top of list after 1-second debounce (`util.js:324-329`)

### Nuke Execution

1. Collect selected packages from checked checkboxes (`util.js:391-399`)
2. No-selection guard with toast (`util.js:402-405`)
3. Confirmation modal with critical app warning (`util.js:406-486`)
4. Write updated JSON files via shell echo (`util.js:494-500`)
5. Invoke nuke.sh via `busybox nsenter -t1 -m` for init mount namespace (`util.js:516-519`)
6. Guard: `isShellRunning` prevents concurrent execution (`util.js:377, 515, 520`)
7. Success toast: "Done! Reboot your device!" (`util.js:521`)
8. Error toast: "Error updating removed apps list" (`util.js:523`)

### Confirmation Dialog

- Modal with backdrop blur (5px) (`modals.css:13`)
- Scale animation from 0.8 to 1.0 (`modals.css:26-27`)
- Lists each selected app with name, package, category badge (`util.js:436-446`)
- Critical warning: red text + bold when essential/caution apps selected (`util.js:424-433`)
- Close: X button, Cancel button, backdrop click (`util.js:467-481`)
- Promise-based: returns boolean for caller to branch on (`util.js:410-482`)

### Progress/Feedback

- No progress tracking during nuke execution. UI simply blocks until done.
- Single toast on completion. No per-app progress.
- `isShellRunning` flag prevents double-execution but provides no visual indicator.

---

## Animations & Transitions

### Ripple Effect (MD3 Inspired)

Custom implementation spanning `util.js:584-641` and `animations.css:16-40`.

- Applied to any element with `.ripple-element` class
- Creates a circular `<span class="ripple">` on pointerdown
- Size: max(width, height) of element
- Position: centered on click point
- Duration: 0.2s-0.8s based on element width (`util.js:615-616`)
- Color: adaptive -- white (0.2 opacity) on dark backgrounds, default on light (`util.js:626-634`)
- Fade out on pointerup via `.ripple.end` class (`util.js:589-597`)
- 80ms delay before creating ripple (to detect scroll vs tap) (`util.js:602`)

### Modal Transitions

- Open: `display: flex`, then after 10ms: `opacity: 0 -> 1`, `transform: scale(0.8) -> scale(1)` (`util.js:451-454`)
- Close: `opacity: 1 -> 0`, `transform: scale(1) -> scale(0.8)`, then after 300ms: `display: none` (`util.js:456-463`)
- Backdrop: `background-color: rgba(0,0,0,0.5)` with `backdrop-filter: blur(5px)` (`modals.css:12-13`)
- Body scroll lock: `.no-scroll { overflow: hidden }` (`base.css:53-55`)

### Text Scroll Animation

For app names/packages that overflow their container. (`animations.css:1-14`, `util.js:334-349`)

- Detects overflow: `el.scrollWidth - parent.clientWidth > 0`
- Sets CSS custom properties: `--scroll-distance` (px) and `--scroll-time` (s)
- Keyframe: `translateX(0)` to `translateX(var(--scroll-distance))`
- Timing: `cubic-bezier(0.4, 0, 0.2, 1)` infinite alternate
- Speed: based on text length, minimum 3s (`util.js:345`)

### Scroll-Aware Header

Header shrinks on scroll. (`util.js:667-712`)

- Opacity: 1 -> 0 over first 65px of scroll (`util.js:685`)
- Scale: 1.0 -> 0.5 over same range (`util.js:686`)
- TranslateY: shifts up by half scroll distance (`util.js:687`)
- Search bar: fixed translateY matching scroll (`util.js:696-698`)
- Category filters: similar but with extended range (`util.js:700-705`)

### Loading Screen

- Spinner: 60px circle, border animation `spin 1s linear infinite` (`components.css:17-30`)
- Progress bar: indeterminate pulse `0% -> 70% -> 0%` over 2s (`components.css:59-71`)
- Status text: randomly rotates through 4 messages every 1s (`util.js:76-84`)

### Page Transitions

- Content list: `opacity: 0, translateY(10px)` -> `opacity: 1, translateY(0)` on `.loaded` (`base.css:65-73`)
- FAB: slides up from below on page load (`util.js:1091`)
- Focus button: background color transition on `.loaded` (`layout.css:190-199`)
- Page exit: reverse animation, then 100ms delay before navigation (`util.js:1097-1113`)

### File Selector Directory Switch

- `.switching` class: `transform: scale(0.95); opacity: 0` with 150ms wait (`file_selector.css:55-58`, `file_selector.js:28-31`)

### Dropdown Menu

- Open: `display: flex`, then `opacity: 0 -> 1`, `transform: scale(0) -> scale(1)` from top-right origin (`components.css:110-112`, `util.js:547-551`)
- Close: reverse, 300ms delay (`util.js:555-561`)

---

## Icons & Assets

### Icon Source

All icons are inline SVGs from Google Material Symbols. No icon font, no external icon library. Each icon is a `<svg>` element with a `<path>` directly in the HTML.

### Icon Inventory

| Icon | Context | Location |
|------|---------|----------|
| Vertical dots (three-dot menu) | Header menu button | `index.html:26`, `restore.html:24` |
| Plus in square | Import menu item, Add whiteout FAB | `index.html:30`, `raw_whiteout.html:81` |
| Floppy disk (save) | Export menu item | `restore.html:28` |
| List with X | Nuke FAB, Whiteout footer icon | `index.html:171`, `index.html:191` |
| House (filled) | Home footer (active) | `index.html:179` |
| House (outline) | Home footer (inactive) | `restore.html:104` |
| Clock with trash | Restore footer (active) | `restore.html:110` |
| Clock with trash (alt) | Restore footer (inactive) | `index.html:185` |
| Refresh/undo | Restore FAB | `restore.html:96` |
| Back arrow | File selector back | `index.html:159` |
| Folder | File selector directory | `file_selector.js:49, 66` |
| Document | File selector file | `file_selector.js:67` |
| Document (large) | Whiteout path icon | `raw_whiteout.js:52-54` |
| Trash can | Whiteout delete button | `raw_whiteout.js:60-62` |

### Fallback App Icon

`default.png` -- a base64-encoded PNG file used when app icon loading fails. Referenced via `onerror="this.src='default.png'"` on every app icon `<img>` element. (`index.html:126`, `restore.html:64`, `util.js:278`)

---

## Responsive Design

### Viewport Configuration

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```
(`index.html:6`, `restore.html:4`, `raw_whiteout.html:4`)

### Safe Area Handling

Uses KSU-provided CSS variables for device-specific insets:
```css
--top-inset: var(--window-inset-top, 0px);
--bottom-inset: var(--window-inset-bottom, 0px);
```
(`base.css:5-6`)

Applied to:
- `body` padding top/bottom (`base.css:48-49`)
- Header top position (`layout.css:7`)
- Search container top calc (`layout.css:31`)
- Footer padding-bottom (`layout.css:148`)
- FAB bottom position (`layout.css:112`)

### Width Constraints

- Content max-width: 900px (`layout.css:97`)
- Search input: `calc(100vw - 30px)` (`layout.css:39`)
- App list: `calc(100vw - 30px)` max 900px (`layout.css:96-97`)
- Footer button max-width: 200px (`layout.css:163`)
- Modal: 90% width, max 500px (`modals.css:22-23`)
- File selector: 90% width, max 600px, 80vh height (`file_selector.css:2-4`)

### Responsive Breakpoints

**None.** No media queries for width. The only media queries are for color scheme (dark mode). The layout relies entirely on percentage widths and max-widths.

### Keyboard Handling

Modal content shifts up `translateY(-20vh)` when text input is focused, to prevent the on-screen keyboard from covering the input. (`index.js:36-39`, `raw_whiteout.js:182-190`)

---

## Performance Patterns

### Lazy Loading

App list loads in batches of 20. Scroll event triggers next batch when within 100px of bottom. (`util.js:209-210, 1019-1030`)

When search/filter is active and fewer than 10 visible results remain, additional batches are auto-loaded. (`util.js:955-961`)

### Data Fetching Strategy

JSON files served via HTTP from symlinked directory:
```
/data/adb/modules/system_app_nuker/webroot/link -> /data/adb/system_app_nuker
```
(`util.js:147`)

Files fetched:
- `link/app_list.json` -- all system apps
- `link/nuke_list.json` -- removed apps
- `link/icons/${package_name}.png` -- per-app icons
- `link/raw_whiteouts.txt` -- whiteout paths
- `categories.json` -- bundled with module

### Polling for Data

When app_list.json is not immediately available (scanner still running), the UI polls every 1 second until it appears. (`util.js:59-88`)

### DOM Batching

New app items are created as HTML string, inserted into a temp div, then children moved individually. Not using DocumentFragment. (`util.js:293-297`)

### Event Delegation

Not used. Each app card gets its own click, pointerdown, pointerup, and pointercancel listeners. (`util.js:315-371`) For a list of 200+ apps, this creates 800+ event listeners.

### Icon Loading

All visible icons load simultaneously (no intersection observer). Loading state shown per-icon. (`util.js:273-279`) On a device with 200+ apps displayed, this means 200+ simultaneous image requests.

### No Virtualization

All rendered apps exist in the DOM. After scrolling through the entire list, all items remain. For large app lists (200+), this means 200+ DOM nodes in the app list container.

---

## Strengths (Replicate)

1. **KSU Theme Integration** -- Importing KSU's CSS variables (`base.css:1-2`) ensures the WebUI matches the system theme set by the root manager. This is the right approach for a module WebUI. Scalpel should maintain this integration. (`base.css:1-24`)

2. **Ripple Effect** -- The custom MD3-style ripple (`util.js:584-641`) provides tactile feedback. Adaptive color (white on dark, default on light) is a thoughtful detail. The 80ms scroll detection delay prevents false ripples during scrolling. (`util.js:602-603`)

3. **Fuzzy Search** -- Sequential character matching (`util.js:973-1001`) plus exact substring highlighting (`util.js:1005-1016`) provides a good search experience. Combined filtering (search + category simultaneously) is correct. (`util.js:887-969`)

4. **Category System** -- Color-coded risk classification (Essential=red, Caution=orange, Safe=green, Google=blue) provides clear visual safety signals. The pre-populated database of 258 apps (`categories.json`) is valuable baseline data. Critical app warnings in the confirmation dialog (`util.js:417-433`) are a genuine safety feature.

5. **Lazy Loading** -- Loading 20 apps at a time (`util.js:210`) with scroll-triggered batches is a reasonable performance optimization for a mobile WebView. Auto-loading more when filtering yields few results (`util.js:955-961`) is smart.

6. **Keyboard Awareness** -- Shifting modals up on keyboard appearance (`index.js:36-39`) prevents input occlusion on mobile devices.

7. **Safe Area Handling** -- Proper use of KSU inset variables for notch/navigation bar clearance (`base.css:5-6`) ensures content is not obscured by hardware features.

8. **Empty State** -- The restore page empty state (`util.js:220-231`) provides direction rather than a blank screen.

9. **Scroll-Aware UI** -- FAB hiding on scroll down and header shrinking (`util.js:667-712`) maximizes content area while scrolling.

10. **Dev Mode Access** -- Triple-click header to access raw whiteout page (`index.js:132-151`) is a clean hidden feature pattern.

---

## Weaknesses (Surpass)

1. **Monolithic util.js** -- 1,114 lines containing everything: bridge wrapper, search, filtering, lazy loading, ripple effects, scroll handling, modal management, category system, app list rendering, and more. This makes it impossible to reason about, test, or maintain. (`util.js:1-1114`)

2. **No Framework** -- Vanilla JS with DOM manipulation means:
   - No reactivity -- manual `displayAppList()` calls to refresh
   - No component isolation -- modals inline in HTML, managed by ID selectors
   - No state management -- global mutable variables (`appList`, `nukeList`, `isShellRunning`, etc. at `util.js:4-10`)
   - Duplicated setup code across pages

3. **Multi-Page Architecture** -- Each page is a full HTML document with its own `<head>`, shared CSS imports, and duplicated structural elements (header, search, footer). Navigation causes full page reloads with visible transition gaps. Footer HTML duplicated verbatim across 3 files. (`index.html:176-195`, `restore.html:100-120`, `raw_whiteout.html:85-107`)

4. **Shell Injection Risk** -- `ksuExec` passes user-influenceable data into shell commands via string interpolation with single quotes:
   ```javascript
   await ksuExec(`echo '${JSON.stringify(listFrom)}' > ...`);
   ```
   A malicious app name containing `'` would break the command. (`util.js:494, 500`)

5. **No Error Boundaries** -- Shell command failures silently resolve with `errno: 1`. The UI shows a generic toast but continues as if nothing happened. No retry logic, no error state, no rollback. (`util.js:107-111, 522-525`)

6. **Hardcoded Colors** -- Despite having CSS variables, many components use hardcoded hex values:
   - `.app-package { color: #666 }` (`components.css:252`)
   - `.app-path { color: #777 }` (`components.css:261`)
   - `.category-name { color: #555 }` (`components.css:349`)
   - `.warning-text { color: #d84315 }` (`raw_whiteout.css:140`)
   - `mark { background-color: #ffffa0 }` (`components.css:360`)
   These break when KSU provides a non-standard theme.

7. **No Progress Indication During Nuke** -- After confirmation, the UI provides no feedback during the nuke.sh execution. The user sees nothing until the completion toast. For long operations (many apps), this creates anxiety. (`util.js:515-521`)

8. **No Reboot Action** -- Toast says "Reboot your device!" but provides no reboot button. The user must exit the WebUI and use their root manager to reboot. (`util.js:521`)

9. **Event Listener Accumulation** -- Each `showAppInfoModal` call adds new click listeners for close/copy without removing old ones. Only a `dataset.listenerAdded` guard on copy prevents full duplication, but close listeners accumulate. (`util.js:770-798`)

10. **No Accessibility** -- No ARIA labels, roles, or keyboard navigation. Checkboxes are hidden. Modal focus trapping absent. Screen reader users would be completely lost. (`components.css:162-164` hides checkboxes, no `aria-*` attributes anywhere)

11. **CSS Writes at Runtime** -- The whiteout button visibility is persisted by writing to the CSS file on disk via sed:
    ```javascript
    await ksuExec(`sed -i "s|#whiteout-btn...|..." .../layout.css`);
    ```
    This modifies the module's own source files at runtime. (`util.js:1072`)

12. **No TypeScript** -- All JS is untyped. The `ksu` global is accessed without type checking. Data structures are implicit. Refactoring is risky without type safety.

13. **No Offline/Error Recovery** -- If `app_list.json` never appears (scanner fails), the loading screen polls forever with rotating "Almost ready..." messages. No timeout, no error state, no manual retry. (`util.js:59-88`)

14. **Typo in CSS Class** -- `.seach-input-wrapper` (missing 'r') used in both HTML and CSS. Not a bug, but indicates lack of review. (`index.html:40`, `layout.css:37`)

15. **No Virtualization for Large Lists** -- All rendered apps exist in the DOM simultaneously. A device with 300+ system apps would create 300+ DOM nodes, each with multiple children and event listeners. (`util.js:213-312`)

---

## Key Takeaways for Scalpel Builders

### What App Nuker Got Right (Keep These)

1. **KSU theme variable integration** -- The `var(--ksuVar, fallback)` pattern is correct. Keep it.
2. **Category-based risk signaling** -- Color-coded safety indicators are valuable. Expand the database.
3. **Fuzzy search + category filters** -- Combined filtering is expected UX. Make it faster.
4. **Ripple feedback** -- Tactile touch response matters on mobile. The implementation is solid.
5. **Safe area insets** -- Critical for real-device rendering. Non-negotiable.
6. **Lazy loading** -- Batch rendering is necessary for 200+ app lists on mobile.
7. **Scroll-aware chrome** -- Hiding FAB and shrinking header on scroll maximizes content.

### What Scalpel Must Fix

1. **SPA architecture** -- Eliminate full page reloads. Single-page app with client-side routing.
2. **Framework** -- Solid.js + TypeScript eliminates all the manual DOM manipulation, state management, and type safety issues.
3. **Component model** -- Each UI element (AppCard, Modal, SearchBar, FilterBar, etc.) as an isolated component.
4. **State management** -- Reactive store instead of global mutable variables.
5. **Virtual scrolling** -- For app lists exceeding 100 items.
6. **Error states** -- Every async operation needs loading/error/success states.
7. **Reboot FAB** -- After any operation that requires reboot, show a floating reboot button.
8. **Progress tracking** -- Per-app progress during nuke/restore operations.
9. **Bridge safety** -- Parameterized commands or JSON-based bridge protocol, never string interpolation.
10. **Accessibility basics** -- Semantic HTML, ARIA attributes, keyboard navigation, focus management.
11. **Consistent theming** -- Zero hardcoded colors. Everything through CSS custom properties.
12. **Modular CSS** -- Component-scoped styles (CSS modules or scoped styles) instead of global CSS files.

### Data Architecture to Preserve

The file-based IPC pattern (WebUI writes JSON, shell reads JSON, shell executes, WebUI reads result) is dictated by the KSU bridge constraints. Scalpel should:
- Keep JSON as the interchange format
- Add a proper status.json that the shell writes and WebUI polls for operation progress
- Never write to the module's own source files at runtime
- Validate all JSON before shell execution

### Bridge Commands Scalpel Will Need

Based on App Nuker's usage plus Scalpel's expanded scope:
- `exec(command, options, callback)` -- shell execution (same as App Nuker)
- `toast(message)` -- user notification (same)
- Status bar theming for MMRL (same pattern as `util.js:645-654`)
- File read/write via shell exec for config, status, and app lists
- `nsenter -t1 -m` wrapper for operations needing init mount namespace

---

*Analysis generated from complete read of all 17 WebUI files (3,813 total lines) in `/home/claudetest/zero-mount/systemapp_nuker/module/webroot/` plus shell bridge files `action.sh` and `nuke.sh`. Every citation verified against source files read in this session.*
