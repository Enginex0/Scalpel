# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    SCALPEL MODULE                        │
├──────────┬──────────┬──────────┬────────────────────────┤
│  WebUI   │  Boot    │  Monitor │  Mode Engine           │
│ Solid.js │ Scripts  │  Daemon  │                        │
│          │          │          │  ┌──────────────────┐  │
│ Debloat  │ post-fs  │ Polls    │  │ detect.sh        │  │
│ tab      │ -data.sh │ for      │  │ (probe chain)    │  │
│          │          │ changes  │  ├──────────────────┤  │
│ System-  │ service  │          │  │ mode_zeromount   │  │
│ ize tab  │ .sh      │ Syncs    │  │ mode_whiteout    │  │
│          │          │ rules    │  │ mode_mountify    │  │
│ Status   │ bootloop │          │  │ mode_symlink     │  │
│ tab      │ .sh      │ Status   │  │ mode_magisk      │  │
│          │          │ cache    │  │ mode_pm          │  │
│ Settings │ config   │          │  └──────────────────┘  │
│ tab      │ .sh      │          │                        │
├──────────┴──────────┴──────────┴────────────────────────┤
│  Core: scanner.sh | logging.sh | config.sh              │
├─────────────────────────────────────────────────────────┤
│  Deps: aapt (ARM32/64) | jq | busybox                  │
└─────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────┐          ┌─────────────────┐
│ Root Manager    │          │ ZeroMount       │
│ Magisk/KSU/AP   │          │ (if present)    │
│ mount system    │          │ VFS redirection │
└─────────────────┘          └─────────────────┘
```

---

## Boot/Execution Sequence

```
INSTALL (customize.sh):
  1. detect root manager → detect capabilities → write initial config
  2. migrate existing config (if updating)
  3. place binaries (aapt, jq) by arch
  4. scanner.sh → scan all partitions → write app_list.json (ONE TIME)
  5. display default debloat list (package names)
  6. volume key prompt: UP=apply, DOWN=skip, timeout(8s)=skip
  7. if applied: write nuke_list.json with defaults

BOOT (post-fs-data):
  bootloop.sh  → increment counter → if ≥3: restore backup, disable, reboot
  nuke.sh      → write "running" status → detect mode → debloat loop
    detect.sh  → probe chain: zeromount → mountify → symlink → whiteout → magisk → pm
    mode_*.sh  → execute detected mode (create whiteouts / register VFS rules)
    Possible outcomes:
      success     → status.json: mode=<detected>, partial=false
      pm_deferred → all probes failed (PMS unavailable at post-fs-data)
      partial     → KSU timeout approaching, remaining packages deferred
      running     → KSU killed the script before status write completed

BOOT (post-boot -- service.sh on Magisk, boot-completed.sh on KSU/APatch):
  post_boot.sh → shared exactly-once handler:
  bootloop.sh  → reset 3-strike counter (boot succeeded)
  _finish_deferred_debloat → handle incomplete post-fs-data work:
    running      → full rerun with auto-detect (post-fs-data was killed)
    pm_deferred  → rerun with pm mode forced (PMS now available)
    pm + failed  → rerun pm (PMS was sluggish earlier)
    partial      → rerun with auto-detect, no timeout (finish remaining)
  verify.sh    → confirm debloat operations survived reboot
  (NO scanning — app_list.json already generated at install)

RUNTIME (WebUI interaction):
  Load cached app_list.json instantly (no generation wait)
  User selects apps → JS writes nuke_list.json via ksu.exec()
                    → JS calls nuke engine → creates whiteouts/rules
                    → User taps FAB reboot button → confirmation → reboot
  Refresh button → triggers scanner.sh on demand (rare cases)
```

---

## Key Components

| Component | Responsibility | Location |
|-----------|---------------|----------|
| detect.sh | Probe device capabilities, select best mode | core/detect.sh |
| config.sh | Read/write/migrate persistent config | core/config.sh |
| bootloop.sh | 3-strike counter, backup/restore (uses busybox with fallbacks) | core/bootloop.sh |
| logging.sh | 5-level logging with rotation | core/logging.sh |
| scanner.sh | Scan partitions, extract app metadata | core/scanner.sh |
| mode_zeromount.sh | Creates whiteouts in module dir, calls sync.sh for delegation | modes/mode_zeromount.sh |
| mode_whiteout.sh | Overlayfs char device whiteouts | modes/mode_whiteout.sh |
| mode_mountify.sh | tmpfs + overlayfs standalone | modes/mode_mountify.sh |
| mode_symlink.sh | Symlink + overlayfs | modes/mode_symlink.sh |
| mode_magisk.sh | Magic mount file overlay | modes/mode_magisk.sh |
| mode_pm.sh | pm disable/uninstall fallback | modes/mode_pm.sh |
| promote.sh | APK copy + user uninstall + verification | systemize/promote.sh |
| permissions.sh | Priv-app XML generation | systemize/permissions.sh |
| monitor.sh | Background daemon, poll for changes (sources logging.sh, config.sh, detect.sh; uses jq) | core/monitor.sh |
| post-fs-data.sh | Boot entry point | post-fs-data.sh |
| service.sh | Late boot orchestration | service.sh |
| customize.sh | Installation logic | customize.sh |
| uninstall.sh | Cleanup + app restoration | uninstall.sh |

---

## Integration Points

- **Root manager:** Detected via env vars ($KSU, $APATCH, default=Magisk) at install and boot
- **ZeroMount:** Probe checks /dev/zeromount; mode_zeromount.sh verifies module dir + sync.sh. Creates whiteout files (char device c 0 0), then calls sync.sh for delegation. ZeroMount internally handles SUSFS path hiding.
- **WebUI:** KSU bridge via `ksu.exec()` for all shell operations
- **Magisk WebUI:** action.sh launches third-party WebUI app (KSUWebUIStandalone/MMRL)
- **Android PMS:** `pm` commands for disable/enable/uninstall, `dumpsys package` for verification

---

## Data Flow

### Debloat Flow
```
WebUI: user selects apps
  │
  ▼
ksu.exec() → write nuke_list.json (jq)
  │
  ▼
nuke engine → detect active mode
  │
  ├─ ZeroMount? → whiteout_create() + sh sync.sh scalpel
  ├─ Whiteout?  → mknod + setfattr + chcon
  ├─ Mountify?  → tmpfs + overlay mount
  ├─ Symlink?   → symlink + overlay mount
  ├─ Magisk?    → place whiteout in module dir
  └─ PM?        → pm disable-user --user 0
  │
  ▼
User reboots → mode executes at post-fs-data → apps hidden
  │
  ▼
service.sh → verify whiteouts/mounts active → update status
```

### Systemize Flow
```
WebUI: user selects app + target (app/priv-app)
  │
  ▼
promote.sh → copy APK + splits to module/system/{app|priv-app}/
           → copy native libs (correct ABI)
           → set permissions (0755/0644) + SELinux context
           → generate priv-app permissions XML (if priv-app)
           → pm uninstall -k --user 0 (remove /data/app copy)
  │
  ▼
User reboots → PMS scans /system → finds app → sets FLAG_SYSTEM
            → sourceDir = /system/{app|priv-app}/AppName/AppName.apk
  │
  ▼
service.sh → verify FLAG_SYSTEM + sourceDir → report to WebUI
```

---

## Persistent State

```
/data/adb/scalpel/
├── config.sh              # Shell variables: mode override, options
├── config.sh.bak          # Backup (for bootloop recovery)
├── nuke_list.json         # Apps marked for removal
├── systemize_list.json    # Apps marked for systemization
├── app_list.json          # All discoverable system apps
├── categories.json        # App risk classifications
├── count.sh               # BOOTCOUNT=N (bootloop detection)
├── debug.log              # Persistent log with rotation (1MB max)
└── icons/                 # Cached PNG app icons
```

---

## Constraints

- Must complete boot operations (post-fs-data) within Android's watchdog timeout
- Cannot use $MODPATH at boot (only available during customize.sh)
- Must handle SELinux enforcing — no sepolicy.rule, inherit contexts
- All shell variables must be quoted (shellcheck compliance)
- Each script file <200 lines (modular architecture mandate)
- Dependencies: busybox (required for filesystem modes; if missing, falls back to pm_deferred mode and boot continues gracefully), aapt ARM32+ARM64 (bundled), jq (bundled)
