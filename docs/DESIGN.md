# Design

## Approach

Scalpel uses a plugin-style mode engine where each mounting strategy implements a common interface. The detect.sh probe chain selects the best available mode at boot, and mode scripts execute debloat/systemize operations without knowing about each other. This keeps the 6 mode code paths isolated and testable.

---

## Components

### Mode Engine: detect.sh

- **Purpose:** Probe device capabilities, return best mode identifier
- **Inputs:** /proc/filesystems, /dev/zeromount, root manager env vars, kernel features
- **Outputs:** Mode string (zeromount|mountify|symlink|whiteout|magisk|pm)
- **Dependencies:** None (pure detection, no side effects)

### Mode Interface (each mode_*.sh implements)

Every mode script exports these functions:
```
mode_probe()     → returns 0 if this mode is available on this device
mode_debloat()   → hide/remove app at given path
mode_restore()   → reverse a previous debloat operation
mode_verify()    → check if debloat is actually working
mode_cleanup()   → remove all state for this mode
```

### Debloat Engine: nuke.sh

- **Purpose:** Orchestrate app removal using the active mode
- **Inputs:** nuke_list.json (apps to remove), detected mode
- **Outputs:** Whiteouts/rules/PM state changes, updated status
- **Dependencies:** Active mode script, jq, busybox

### Systemize Engine: promote.sh

- **Purpose:** Clinical systemization with full PMS compatibility
- **Inputs:** Package name, target (app/priv-app)
- **Outputs:** APK in module/system/, priv-app XML, user copy removed
- **Dependencies:** aapt (for permissions XML), pm, jq

### Scanner: scanner.sh

- **Purpose:** Discover all system apps across all partitions
- **Inputs:** /proc/mounts (dynamic partition list)
- **Outputs:** app_list.json with package name, label, icon path, partition, category
- **Dependencies:** aapt (metadata), pm (package names), jq (JSON output)

### Bootloop Protection: bootloop.sh

- **Purpose:** Prevent infinite boot loops from bad debloat operations
- **Inputs:** count.sh (persistent counter)
- **Outputs:** Module disabled + whiteouts deleted if counter ≥ 3
- **Dependencies:** None (must work even if busybox is broken)

### Background Monitor: monitor.sh

- **Purpose:** Detect module/app state changes, sync rules, update WebUI cache
- **Inputs:** Module directory watches, app install events
- **Outputs:** Status cache JSON for WebUI, rule sync operations
- **Dependencies:** None (pure polling via sleep)

### Config System: config.sh

- **Purpose:** Read/write/migrate persistent configuration
- **Inputs:** /data/adb/scalpel/config.sh
- **Outputs:** Shell variables for all scripts to source
- **Dependencies:** None

### Logging: logging.sh

- **Purpose:** Structured logging with rotation
- **Inputs:** Log level + message from any script
- **Outputs:** /data/adb/scalpel/debug.log (1MB max, 3 archives)
- **Dependencies:** None

---

## Error Handling

| Failure Scenario | Behavior | Recovery |
|------------------|----------|----------|
| Boot counter ≥ 3 | Disable module, delete whiteouts | Auto-reboot, user re-enables manually |
| Mode probe finds nothing at post-fs-data | Status set to `pm_deferred` | service.sh runs pm disable after boot_completed |
| Nuke interrupted (KSU timeout) | Status set to `running` or `partial` | service.sh reruns full debloat after boot_completed |
| Whiteout creation fails | Log error, skip app, continue | User sees partial debloat in status |
| Systemize APK copy fails | Abort, don't uninstall user copy | App remains as user app, no damage |
| pm uninstall -k fails | Log warning, proceed anyway | App may not get FLAG_SYSTEM (degraded) |
| aapt binary missing | Use pm for package names, skip icons | Functional but reduced UX |
| jq binary missing | Hard fail at install time | customize.sh aborts with error message |
| ZeroMount disappears after boot | Detect at next boot, fall back to next mode | Seamless mode switch |
| busybox missing | Hard fail at boot | Module logs error to kmsg, does nothing |

---

## File Structure

```
module/
├── module.prop
├── customize.sh
├── post-fs-data.sh
├── service.sh
├── action.sh
├── uninstall.sh
├── core/
│   ├── detect.sh
│   ├── config.sh
│   ├── bootloop.sh
│   ├── logging.sh
│   ├── scanner.sh
│   ├── nuke.sh
│   ├── verify.sh
│   ├── monitor.sh
│   ├── post_boot.sh
│   ├── default_debloat.sh
│   └── whiteout_helpers.sh
├── modes/
│   ├── mode_zeromount.sh
│   ├── mode_whiteout.sh
│   ├── mode_mountify.sh
│   ├── mode_symlink.sh
│   ├── mode_magisk.sh
│   └── mode_pm.sh
├── systemize/
│   ├── promote.sh
│   └── permissions.sh
├── boot-completed.sh
├── bin/
│   ├── arm64-v8a/aapt
│   ├── armeabi-v7a/aapt
│   └── jq
├── webroot/
│   ├── index.html
│   ├── assets/          (Vite build output)
│   └── categories.json
```

---

## WebUI ↔ Shell Bridge

```
ksuExec(command: string): Promise<{errno: number, stdout: string, stderr: string}>

Key operations:
  Read app list    → cat /data/adb/scalpel/app_list.json
  Save nuke list   → jq write to nuke_list.json
  Execute debloat  → busybox nsenter -t1 -m /path/to/nuke.sh
  Execute systemize→ busybox nsenter -t1 -m /path/to/promote.sh <pkg> <target>
  Get status       → cat /data/adb/scalpel/status.json
  Read config      → cat /data/adb/scalpel/config.sh
  Write config     → echo 'key=value' > config.sh
  Verify app       → dumpsys package <pkg> | grep -E 'flags=|sourceDir='
```
