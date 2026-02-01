# Scalpel — Complete Project Context

> This document is the single source of truth for building Scalpel across multiple Claude sessions.
> Read this file at session start. It replaces the need to re-analyze reference projects.
> Last updated: 2026-01-31

---

## 1. Project Identity

| Field | Value |
|-------|-------|
| **Module name** | Scalpel |
| **module_id** | `scalpel` |
| **Working directory** | `/home/claudetest/zero-mount/Scalpel/` |
| **Purpose** | Debloats system apps + systemizes user apps with multi-mode auto-detection |
| **Root managers** | Magisk, KernelSU, APatch |
| **Architecture** | Regular module (NOT a metamodule) — consumes the mounting system |
| **Tech stack** | Shell + jq (backend), Solid.js + TypeScript + Vite (frontend) |
| **Dependencies** | busybox (required), aapt ARM32+ARM64 (bundled), jq (bundled) |

**What Scalpel does:**
- Auto-detects device capabilities and selects optimal mode (6 modes supported)
- Debloats system apps via whiteouts with zero false failures
- Systemizes user apps so PMS recognizes them as true system apps (FLAG_SYSTEM + correct sourceDir)
- Works on Magisk, KernelSU, and APatch without user configuration
- WebUI (Solid.js) provides app selection, category warnings, and status verification
- 3-strike bootloop protection with config backup/restore
- Post-reboot verification confirms operations succeeded

**What Scalpel does NOT do:**
- NOT a metamodule (ZeroMount is the user's metamodule)
- NOT reimplementing VFS hooks (leverages ZeroMount when available)
- NOT building a standalone SUSFS engine
- NOT supporting x86/x86_64 emulators in v1
- NOT providing app backup/restore (data migration)
- NOT re-signing APKs with platform keys

---

## 2. Architecture Overview

### System Diagram

```
+-------------------------------------------------------------+
|                    SCALPEL MODULE                             |
+----------+----------+----------+----------------------------+
|  WebUI   |  Boot    |  Monitor |  Mode Engine               |
| Solid.js |  Scripts |  Daemon  |                            |
|          |          |          |  +----------------------+  |
| Debloat  | post-fs  | Polls    |  | detect.sh            |  |
| tab      | -data.sh | for      |  | (probe chain)        |  |
|          |          | changes  |  +----------------------+  |
| System-  | service  |          |  | mode_zeromount.sh    |  |
| ize tab  | .sh      | Syncs    |  | mode_whiteout.sh     |  |
|          |          | rules    |  | mode_mountify.sh     |  |
| Status   | bootloop |          |  | mode_symlink.sh      |  |
| tab      | .sh      | Status   |  | mode_magisk.sh       |  |
|          |          | cache    |  | mode_pm.sh           |  |
| Settings | config   |          |  +----------------------+  |
| tab      | .sh      |          |                            |
+----------+----------+----------+----------------------------+
|  Core: scanner.sh | logging.sh | config.sh | verify.sh      |
+-------------------------------------------------------------+
|  Deps: aapt (ARM32/64) | jq | busybox                      |
+-------------------------------------------------------------+
         |                              |
         v                              v
+-----------------+          +-----------------+
| Root Manager    |          | ZeroMount       |
| Magisk/KSU/AP   |          | (if present)    |
| mount system    |          | VFS redirection |
+-----------------+          +-----------------+
```

### Component List

| Component | File Path | Responsibility |
|-----------|-----------|---------------|
| detect.sh | `core/detect.sh` | Probe device capabilities, select best mode |
| config.sh | `core/config.sh` | Read/write/migrate persistent config |
| bootloop.sh | `core/bootloop.sh` | 3-strike counter, backup/restore |
| logging.sh | `core/logging.sh` | 5-level logging with rotation |
| scanner.sh | `core/scanner.sh` | Scan partitions, extract app metadata |
| verify.sh | `core/verify.sh` | Post-reboot operation verification |
| nuke.sh | `core/nuke.sh` | Debloat orchestrator engine |
| mode_zeromount.sh | `modes/mode_zeromount.sh` | VFS interception via zm CLI |
| mode_whiteout.sh | `modes/mode_whiteout.sh` | Overlayfs char device whiteouts |
| mode_mountify.sh | `modes/mode_mountify.sh` | tmpfs + overlayfs standalone |
| mode_symlink.sh | `modes/mode_symlink.sh` | Symlink + overlayfs |
| mode_magisk.sh | `modes/mode_magisk.sh` | Magic mount file overlay |
| mode_pm.sh | `modes/mode_pm.sh` | pm disable/uninstall fallback |
| promote.sh | `systemize/promote.sh` | APK copy + user uninstall + verification |
| permissions.sh | `systemize/permissions.sh` | Priv-app XML generation |
| monitor.sh | `monitor.sh` | Background daemon, poll for changes |
| post-fs-data.sh | `post-fs-data.sh` | Boot entry point |
| service.sh | `service.sh` | Late boot orchestration |
| customize.sh | `customize.sh` | Installation logic |
| uninstall.sh | `uninstall.sh` | Cleanup + app restoration |
| action.sh | `action.sh` | Magisk WebUI bridge launcher |

### Debloat Data Flow

```
WebUI: user selects apps
  |
  v
ksu.exec() -> write nuke_list.json (jq)
  |
  v
nuke engine -> detect active mode
  |
  +-- ZeroMount? -> zm add <vpath> (whiteout path)
  +-- Whiteout?  -> mknod + setfattr + chcon
  +-- Mountify?  -> tmpfs + overlay mount
  +-- Symlink?   -> symlink + overlay mount
  +-- Magisk?    -> place whiteout in module dir
  +-- PM?        -> pm disable-user --user 0
  |
  v
User reboots -> mode executes at post-fs-data -> apps hidden
  |
  v
service.sh -> verify whiteouts/mounts active -> update status
```

### Systemize Data Flow

```
WebUI: user selects app + target (app/priv-app)
  |
  v
promote.sh -> copy APK + splits to module/system/{app|priv-app}/
           -> copy native libs (correct ABI)
           -> set permissions (0755/0644) + SELinux context
           -> generate priv-app permissions XML (if priv-app)
           -> pm uninstall -k --user 0 (remove /data/app copy)
  |
  v
User reboots -> PMS scans /system -> finds app -> sets FLAG_SYSTEM
            -> sourceDir = /system/{app|priv-app}/AppName/AppName.apk
  |
  v
service.sh -> verify FLAG_SYSTEM + sourceDir -> report to WebUI
```

---

## 3. Implementation Order (Dependency Chain)

```
PHASE 1: Foundation (no dependencies)                    [MVP]
  +-- core-config      -- config read/write/migrate/backup
  +-- core-logging     -- structured logging with rotation
  +-- categories-db    -- app risk classifications (data file)

PHASE 2: Detection + Safety                              [MVP]
  +-- core-bootloop    -- 3-strike protection (needs config)
  +-- core-detect      -- mode probe chain (needs config + logging)

PHASE 3: First Mode + Scanner                            [MVP]
  +-- mode-pm          -- pm disable fallback (proves mode interface)
  +-- core-scanner     -- app discovery (runs at INSTALL, not boot)

PHASE 4: Primary Modes                                   [MVP]
  +-- mode-whiteout    -- overlayfs whiteouts (primary debloat)
  +-- mode-zeromount   -- ZeroMount VFS (top-tier stealth)
  +-- mode-magisk      -- magic mount (needed for systemizer)
  +-- core-nuke        -- debloat orchestrator engine
  +-- core-verify      -- post-reboot operation verification

PHASE 5: Boot Integration                                [MVP]
  +-- boot-postfs      -- post-fs-data.sh entry point
  +-- boot-service     -- service.sh (NO scanning, just verify + monitor)

PHASE 6: Systemizer                                      [MVP]
  +-- systemize-promote    -- clinical systemization engine
  +-- systemize-permissions -- priv-app XML generation

PHASE 7: Installation                                    [MVP]
  +-- install-customize     -- customize.sh (config + scan + binaries)
  +-- install-default-debloat -- volume key debloat prompt (LAST backend task)
  +-- uninstall-cleanup     -- uninstall.sh restoration

PHASE 8: WebUI                                           [MVP]
  +-- webui-scaffold   -- fork ZeroMount, adapt tabs, add reboot FAB
  +-- webui-debloat    -- app selection + nuke + refresh scan button
  +-- webui-systemize  -- app promotion interface
  +-- webui-status     -- mode/health/operation display

PHASE 9: Polish                                          [Phase 2]
  +-- mode-mountify    -- standalone tmpfs+overlayfs
  +-- mode-symlink     -- symlink+overlayfs
  +-- monitor-daemon   -- background polling
  +-- webui-settings   -- config UI
  +-- action-webui-launcher -- Magisk WebUI bridge
```

### Feature Dependencies (features.json)

| Feature ID | Blocked By | Priority |
|-----------|------------|----------|
| core-config | (none) | mvp |
| core-logging | (none) | mvp |
| categories-db | (none) | mvp |
| core-bootloop | core-config | mvp |
| core-detect | core-config, core-logging | mvp |
| mode-pm | core-detect | mvp |
| core-scanner | core-logging | mvp |
| mode-whiteout | core-detect | mvp |
| mode-zeromount | core-detect | mvp |
| mode-magisk | core-detect | mvp |
| mode-mountify | core-detect | phase2 |
| mode-symlink | core-detect | phase2 |
| systemize-promote | mode-magisk, core-scanner | mvp |
| systemize-permissions | systemize-promote | mvp |
| boot-postfs | core-bootloop, core-detect, mode-pm | mvp |
| boot-service | boot-postfs | mvp |
| install-customize | core-config, core-detect, core-scanner | mvp |
| install-default-debloat | install-customize | mvp |
| uninstall-cleanup | core-config | mvp |
| webui-scaffold | (none) | mvp |
| webui-debloat | webui-scaffold, core-scanner | mvp |
| webui-systemize | webui-scaffold, systemize-promote | mvp |
| webui-status | webui-scaffold | mvp |
| webui-settings | webui-scaffold | phase2 |
| monitor-daemon | boot-service | phase2 |
| action-webui-launcher | webui-scaffold | phase2 |

---

## 4. Key Design Decisions (Quick Reference)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Scope | Debloater + Systemizer | No existing module combines both; TS is deprecated; debloater first |
| 2 | ZeroMount integration | Top-tier optional mode | Detect /dev/zeromount, use zm CLI. Zero extra kernel code. Falls back gracefully |
| 3 | Mode count | All 6 modes | VFS, whiteout, mountify, symlink, magisk, pm. Maximum device coverage |
| 4 | Mode selection | Re-evaluate every boot | SAN locks at install. Scalpel probes best-to-worst at every boot. Config override supported |
| 5 | Root managers | All 3 | Magisk + KSU + APatch via $KSU, $APATCH env vars, Magisk as default |
| 6 | Frontend | Solid.js + TypeScript | Fork ZeroMount WebUI. Type safety. Reactive signals. No terminal TUI |
| 7 | Infrastructure | 3-strike bootloop, monitor, categories, priv-app XML, icon extraction | Full safety + UX |
| 8 | Backend tech | Shell + jq | No custom C binary. Stock kernel only. <200 lines per file |
| 9 | Project name | Scalpel | Clinical precision. Works for both cutting (debloat) and incisions (systemize) |
| 10 | Systemization | Clinical protocol with pm uninstall -k | THE fix Terminal Systemizer never did |
| 11 | App scanning | Once at install, cached | SAN re-scans every boot (30-60s waste). WebUI loads instantly from cache |
| 12 | WebUI base | Fork ZeroMount webroot-beta | Proven bridge, theme, components. Adapt tabs, don't rebuild |
| 13 | Reboot UX | Floating Action Button | Fixed bottom-right, confirmation dialog. `svc power reboot` |
| 14 | Default debloat | Volume key at install | UP=apply, DOWN=skip, 7s timeout=SKIP (safe default) |

---

## 5. Android Domain Knowledge

### How PMS Determines "System App"

```
PMS boot scan:
  1. Read packages.xml (cached state from last boot)
  2. Scan /system/app, /system/priv-app, /vendor/app, /product/app, etc.
  3. For each APK found in system partitions:
     +-- New package? -> Set FLAG_SYSTEM, codePath=/system/...
     +-- Already in packages.xml from /data/app?
        +-- Treat /data copy as "updated system app"
        +-- sourceDir remains /data/app (THIS IS THE BUG)
  4. Scan /data/app for user apps
```

**FLAG_SYSTEM:** `ApplicationInfo.flags & 0x1` -- set when PMS scans app from system partition. Apps use this to detect system app status.

**PRIVATE_FLAG_PRIVILEGED:** Set for apps in /system/priv-app. Grants `signatureOrSystem` permissions. Required for apps needing elevated privileges.

**sourceDir:** `ApplicationInfo.sourceDir` -- path where PMS thinks APK lives. Many apps check this instead of flags. Must point to /system for true systemization.

**packages.xml:** `/data/system/packages.xml` -- PMS persistent database. Contains codePath, flags, permissions for every package.

**privapp-permissions:** XML in `/system/etc/permissions/` whitelisting dangerous permissions for priv-apps. Android 9+ crashes priv-apps without this XML.

### Boot Lifecycle (Scalpel's Execution Points)

```
post-fs-data stage:
  1. KernelSU prunes modules, loads sepolicy
  2. Metamodule's post-fs-data.sh (if KSU)
  3. >>> SCALPEL post-fs-data.sh <<<
  |    +-- Bootloop check (3-strike counter)
  |    +-- Mode detection (probe device capabilities)
  |    +-- Execute debloat mode (whiteouts/mounts)
  4. Other modules' post-fs-data.sh
  5. Metamodule's metamount.sh (mounts all modules)

service stage:
  1. Metamodule service.sh
  2. >>> SCALPEL service.sh <<<
  |    +-- Wait boot_completed
  |    +-- Reset boot counter (boot succeeded)
  |    +-- Verify debloat/systemize operations
  |    +-- Start background monitor
  |    +-- Update module.prop description
  3. Other modules' service.sh
```

### Whiteout Mechanism

```sh
# Create overlayfs whiteout -- kernel interprets as "file deleted"
mkdir -p "$MODULE_UPDATE_DIR${path%/*}"
chmod 755 "$MODULE_UPDATE_DIR${path%/*}"
busybox mknod "$MODULE_UPDATE_DIR$path" c 0 0
busybox chcon --reference="/system" "$MODULE_UPDATE_DIR$path"
busybox setfattr -n trusted.overlay.whiteout -v y "$MODULE_UPDATE_DIR$path"
chmod 644 "$MODULE_UPDATE_DIR$path"
```

**Source:** `/home/claudetest/zero-mount/systemapp_nuker/module/nuke.sh:44-54`

The char device `c 0 0` combined with the `trusted.overlay.whiteout` xattr tells the overlayfs kernel driver to treat the path as deleted. The SELinux context must be copied from `/system` or the original file to avoid context violations.

### Variable Availability at Boot

| Variable | Available in customize.sh | Available at boot |
|----------|--------------------------|-------------------|
| `$MODPATH` | YES | NO (undefined) |
| `$MODDIR` | NO | YES (set by root manager) |
| `$KSU` | YES | YES (env var) |
| `$APATCH` | YES | YES (env var) |
| `$KSU_MAGIC_MOUNT` | YES | YES |
| `$APATCH_BIND_MOUNT` | YES | YES |

Using `$MODPATH` at boot is a **known bug in SAN** (`post-fs-data.sh:58-59`). Always use `$MODDIR` at boot.

---

## 6. Reference: Whiteout Creation (from systemapp_nuker)

**Source:** `/home/claudetest/zero-mount/systemapp_nuker/module/nuke.sh:44-54`

### Exact Whiteout Creation Sequence

```sh
whiteout_create() {
    path="$1"
    # Normalize path to start with /system/
    echo "$path" | grep -q "^/system/" || path="/system$1"
    # Create parent directory structure in module update dir
    mkdir -p "$MODULE_UPDATE_DIR${path%/*}"
    chmod 755 "$MODULE_UPDATE_DIR${path%/*}"
    # Create char device 0:0 (overlayfs deletion marker)
    busybox mknod "$MODULE_UPDATE_DIR$path" c 0 0
    # Copy SELinux context from /system to avoid violations
    busybox chcon --reference="/system" "$MODULE_UPDATE_DIR$path"
    # Set whiteout xattr (tells kernel this is an overlay deletion)
    busybox setfattr -n trusted.overlay.whiteout -v y "$MODULE_UPDATE_DIR$path"
    # Set standard file permissions
    chmod 644 "$MODULE_UPDATE_DIR$path"
}
```

### Vendor Partition Handling

**Source:** `/home/claudetest/zero-mount/systemapp_nuker/module/nuke.sh:164-170`

OEM vendor partitions (Xiaomi `mi_ext`, OnePlus `my_bigball`, etc.) are sometimes symlinked under `/system/`. SAN handles this by:

```sh
# Known vendor partitions that live under /system/ as symlinks
targets="mi_ext my_bigball my_carrier my_company my_engineering
my_heytap my_manifest my_preload my_product my_region my_reserve my_stock"

for part in $targets; do
    if [ -d "$MODULE_UPDATE_DIR/system/$part" ] && [ ! -L "/$part" ]; then
        mv -f "$MODULE_UPDATE_DIR/system/$part" "$MODULE_UPDATE_DIR/$part"
        ln -sf "../$part" "$MODULE_UPDATE_DIR/system/$part"
    fi
done
```

**What Scalpel improves:** SAN always copies SELinux context from `/system`. Scalpel should copy from the original file's parent directory to get the correct per-partition context (e.g., `/vendor/app` has a different context than `/system/app`).

---

## 7. Reference: Mode Detection (from systemapp_nuker)

**Source:** `/home/claudetest/zero-mount/systemapp_nuker/module/customize.sh:74-144`

### SAN's Detection Sequence

```sh
# Step 1: Check overlayfs support
grep -q "overlay" /proc/filesystems && overlay_supported=true

# Step 2: Check tmpfs xattr support (needed for mountify)
MNT_FOLDER=""
[ -w /mnt ] && MNT_FOLDER=/mnt
[ -w /mnt/vendor ] && MNT_FOLDER=/mnt/vendor
testfile="$MNT_FOLDER/tmpfs_xattr_testfile"
busybox mknod "$testfile" c 0 0
busybox setfattr -n trusted.overlay.whiteout -v y "$testfile" && tmpfs_xattr_supported=true

# Step 3: Detect mount system (magic mount vs overlayfs)
if { [ "$KSU" = true ] && [ ! "$KSU_MAGIC_MOUNT" = true ] && [ "$KSU_VER_CODE" -lt 22098 ]; } ||
   { [ "$APATCH" = true ] && [ ! "$APATCH_BIND_MOUNT" = true ]; }; then
    magic_mount=false
else
    magic_mount=true
fi

# Step 4: Check mountify module
mountify_active=false
if [ -f "/data/adb/modules/mountify/module.prop" ] &&
   [ ! -f "/data/adb/modules/mountify/disable" ] &&
   [ ! -f "/data/adb/modules/mountify/remove" ]; then
    mountify_active=true
    # BUG: Path typo -- /data/adb/mountify/ should be /data/adb/modules/mountify/
fi

# Step 5: Select mode (2=delegated, 1=standalone, 0=default)
```

### Scalpel's Improved Probe Order (Best to Worst)

```
1. ZeroMount VFS   -> Check /dev/zeromount exists, zm binary accessible
2. Mountify/tmpfs   -> Check overlayfs + tmpfs_xattr (standalone mount)
3. Symlink overlay  -> Check overlayfs root manager (no tmpfs needed)
4. Overlayfs whiteout -> Check overlayfs support in /proc/filesystems
5. Magisk mount     -> Default if Magisk detected (always available)
6. pm disable       -> Universal fallback (always works)
```

**Key difference from SAN:** Scalpel re-evaluates at EVERY boot (SAN locks at install). This means if ZeroMount is installed after Scalpel, Scalpel automatically upgrades to VFS mode.

### Root Manager Detection

| Root Manager | Detection | Magic Mount Check |
|-------------|-----------|-------------------|
| Magisk | Default (no env vars set) | Always true |
| KSU < 22098 | `$KSU=true` | No magic mount (overlayfs) |
| KSU 22098+ | `$KSU=true` + `$KSU_MAGIC_MOUNT` | Conditional |
| KSU Next 12144+ | `$KSU_NEXT=true` | Conditional |
| APatch | `$APATCH=true` | Conditional (`$APATCH_BIND_MOUNT`) |

**Source:** `/home/claudetest/zero-mount/systemapp_nuker/module/customize.sh:98-105`

---

## 8. Reference: Nuke Flow (from systemapp_nuker)

### SAN's Two-Call Pattern

**Source:** `/home/claudetest/zero-mount/systemapp_nuker/module/nuke.sh:92-120`

SAN uses a "dummy.zip" indirection to ensure whiteouts are created within the root manager's module update cycle:

```
1. WebUI calls nuke.sh via ksu.exec()
2. nuke.sh calls install_dummy() -> installs dummy_zip/
3. Root manager processes dummy.zip -> dummy customize.sh calls nuke.sh with DUMMYZIP=true
4. nuke.sh (DUMMYZIP mode) does the actual work:
   a. Copies module files to /data/adb/modules_update/system_app_nuker/
   b. Cleans old whiteouts (rm -rf system/ system_ext/ vendor/ product/)
   c. For each app in nuke_list.json: creates whiteout for app_path directory
   d. Handles vendor partition symlinks
```

**Scalpel eliminates this:** The dummy.zip pattern exists because SAN needs the root manager to process a module update for the whiteouts to take effect at next boot. Scalpel handles this differently per mode -- ZeroMount mode applies immediately, whiteout mode writes to modules_update directly, pm mode applies immediately.

### JSON Schemas

**nuke_list.json** (apps marked for removal):
```json
[
  {
    "app_name": "Facebook",
    "package_name": "com.facebook.katana",
    "app_path": "/system/app/Facebook/Facebook.apk"
  },
  {
    "app_name": "Spotify",
    "package_name": "com.spotify.music",
    "app_path": "/product/app/Spotify/Spotify.apk"
  }
]
```

**app_list.json** (all discoverable system apps):
```json
[
  {
    "app_name": "Settings",
    "package_name": "com.android.settings",
    "app_path": "/system/priv-app/Settings/Settings.apk"
  }
]
```

**Source:** `/home/claudetest/zero-mount/systemapp_nuker/module/service.sh:112-177` (generation), `/home/claudetest/zero-mount/systemapp_nuker/module/nuke.sh:57-88` (consumption)

### App List Generation

**Source:** `/home/claudetest/zero-mount/systemapp_nuker/module/service.sh:112-177`

SAN scans these directories:
```
/system/app  /system/priv-app  /vendor/app  /product/app
/product/priv-app  /system_ext/app  /system_ext/priv-app
```

In mountify modes (1/2), additional OEM partitions:
```
my_bigball  mi_ext  my_carrier  my_company  my_engineering
my_heytap  my_manifest  my_preload  my_product  my_region
my_reserve  my_stock
```

Per APK: package name (via `pm list packages -f` or `aapt`), app name (via `aapt`), icon (via `unzip`).

**Scalpel improvement:** Scan dynamically from `/proc/mounts` instead of hardcoded partition list. Scan ONCE at install (not every boot).

---

## 9. Reference: Systemization Protocol (from Terminal Systemizer)

### What Terminal Systemizer Does

**Source:** `/home/claudetest/zero-mount/terminal_systemizer/system/xbin/systemize:166-233`

```
Step 1: chk_apk_size() -- verify space available
Step 2: Conflict check -- abort if already systemized
Step 3: mkdir -p ${MODDIR}/system/{app|priv-app}/{AppName}/
Step 4: cp APK -> ${MODDIR}/system/{app|priv-app}/{AppName}/{AppName}.apk
Step 5: cp lib/ -> (if native libraries exist)
Step 6: set_perm_recursive -> root:root, 0755 dirs, 0644 files, system_file context
Step 7: If priv-app -> generate privapp-permissions XML via aapt
Step 8: DONE -- user must reboot, Magisk auto-mounts at boot
```

### THE CRITICAL BUG: No `pm uninstall -k`

Terminal Systemizer copies the APK to `/system/priv-app/` but NEVER removes the `/data/app` user copy. At next boot:

```
PMS boot scan:
  1. Reads packages.xml -- sees app installed in /data/app
  2. Scans /system/priv-app/ -- finds same app
  3. PMS treats /data/app copy as "updated system app"
  4. sourceDir REMAINS /data/app (not /system)
  5. App checks sourceDir -- thinks it's still a user app
  6. FLAG_SYSTEM may be set but sourceDir test FAILS
```

### Scalpel's Clinical Protocol (Fixes Everything)

```
Step 1:  Copy APK + split APKs to module/system/{app|priv-app}/${AppName}/
Step 2:  Copy native libs to correct ABI subdirectory
Step 3:  Set permissions: 0755 dirs, 0644 files
Step 4:  Set SELinux context: u:object_r:system_file:s0
Step 5:  Generate priv-app permissions XML (if priv-app target)
Step 6:  pm uninstall -k --user 0 ${package_name}   <-- THE MISSING STEP
         (-k preserves data, --user 0 removes user copy only)
Step 7:  Reboot
Step 8:  PMS scans /system -> finds app -> sets FLAG_SYSTEM
         sourceDir = /system/{app|priv-app}/AppName/AppName.apk
Step 9:  service.sh verifies FLAG_SYSTEM + sourceDir match
```

The `-k` flag preserves app data (settings, databases). The `--user 0` ensures only the primary user's /data/app copy is removed. PMS then has no choice but to use the /system copy as the canonical install location.

### Priv-App Permissions XML

**Source:** `/home/claudetest/zero-mount/terminal_systemizer/system/xbin/systemize:201-223`

```xml
<?xml version="1.0" encoding="utf-8"?>
<permissions>
    <privapp-permissions package="com.example.app">
        <permission name="android.permission.WRITE_SECURE_SETTINGS"/>
        <permission name="android.permission.MODIFY_PHONE_STATE"/>
    </privapp-permissions>
</permissions>
```

Generated by parsing APK with `aapt d permissions <apk>`. Each output line after `package:` is a permission declaration. Extract permission names, deduplicate, write to `system/etc/permissions/privapp-permissions-${name}.xml`.

**TS bug:** No validation of aapt output before XML generation -- malformed XML if aapt fails.
**Scalpel fix:** Validate aapt output, check XML well-formedness before writing.

---

## 10. Reference: Shell Patterns (from ZeroMount)

### Logging Pattern (5-level with rotation)

**Source:** `/home/claudetest/zero-mount/nomount/module/logging.sh:1-394`

```sh
# Initialize logging for a component
. "$MODDIR/logging.sh"
log_init "service"      # Creates log file, writes session header

# Log levels: 0=OFF, 1=ERROR, 2=WARN, 3=INFO, 4=DEBUG, 5=TRACE
log_err   "Critical failure"     # Level 1 -- always logged
log_warn  "Non-fatal issue"      # Level 2
log_info  "Normal operation"     # Level 3 (default)
log_debug "Diagnostic detail"    # Level 4
log_trace "Verbose trace"        # Level 5

# Structured helpers
log_section "Section Name"           # ========== Section Name ==========
log_func_enter "func_name" "$arg1"   # >>> ENTER: func_name(arg1='val')
log_func_exit "func_name" "$result"  # <<< EXIT: func_name (result=0)
log_cmd "command" "description"      # CMD: description
log_cmd_result "$?" "$output" "name" # CMD_OK: name (rc=0)

# Log format: [HH:MM:SS.NNN] [LEVEL] message
# Rotation: 1MB max per file, 5 archived copies
# Directories:
#   /data/adb/zeromount/logs/frontend/  -- service.log, monitor.log, etc.
#   /data/adb/zeromount/logs/archive/   -- rotated old logs
```

**Key internal function:**
```sh
_log_write() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%H:%M:%S.%3N' 2>/dev/null || date '+%H:%M:%S')
    local entry="[$timestamp] [$level] $message"
    [ -n "$LOG_FILE" ] && echo "$entry" >> "$LOG_FILE" 2>/dev/null
}
```

### Scalpel Logging Adaptation

For Scalpel, simplify the directory structure:
```
/data/adb/scalpel/
+-- debug.log       # 1MB max, 3 archives
```

Also mirror critical messages to kmsg for boot-time visibility:
```sh
log_err() {
    _log_write "ERROR" "$*"
    echo "scalpel: ERROR: $*" >> /dev/kmsg
}
```

### Bootloop Protection Pattern

**Source:** `/home/claudetest/zero-mount/systemapp_nuker/module/post-fs-data.sh:10-51`

SAN uses 2-strike (counter >1 triggers). ZeroMount uses 3-strike with config backup.

**SAN's implementation:**
```sh
BOOTCOUNT=0
[ -f "$PERSIST_DIR/count.sh" ] && . "$PERSIST_DIR/count.sh"
BOOTCOUNT=$((BOOTCOUNT + 1))

if [ $BOOTCOUNT -gt 1 ]; then
    touch $MODDIR/disable           # Disable module
    for dir in system system_ext vendor product; do
        rm -rf "$MODDIR/$dir"       # Delete whiteouts
    done
    sed -i "s/^description=.*/description=bootloop protection triggered/" $MODDIR/module.prop
    echo "BOOTCOUNT=-1" > "$PERSIST_DIR/count.sh"
    stop; reboot                    # Force reboot
else
    echo "BOOTCOUNT=1" > "$PERSIST_DIR/count.sh"
fi
```

**Scalpel's 3-strike improvement:**
```sh
# post-fs-data.sh:
BOOTCOUNT=0
[ -f "$PERSIST_DIR/count.sh" ] && . "$PERSIST_DIR/count.sh"
BOOTCOUNT=$((BOOTCOUNT + 1))
echo "BOOTCOUNT=$BOOTCOUNT" > "$PERSIST_DIR/count.sh"

if [ "$BOOTCOUNT" -ge 3 ]; then
    # Restore config backup
    [ -f "$PERSIST_DIR/config.sh.bak" ] && cp "$PERSIST_DIR/config.sh.bak" "$PERSIST_DIR/config.sh"
    # Delete all whiteouts
    for dir in system system_ext vendor product; do
        rm -rf "$MODDIR/$dir"
    done
    # Disable module
    touch "$MODDIR/disable"
    # Update description
    sed -i "s/^description=.*/description=Bootloop protection triggered. Module disabled. Re-enable manually./" "$MODDIR/module.prop"
    # Reset counter and reboot
    echo "BOOTCOUNT=0" > "$PERSIST_DIR/count.sh"
    reboot
fi

# service.sh (runs after successful boot):
echo "BOOTCOUNT=0" > "$PERSIST_DIR/count.sh"
```

**CRITICAL:** Bootloop protection must work WITHOUT busybox. Use only POSIX shell builtins and `/system/bin` tools. No jq, no busybox applets.

### Root Manager Detection Pattern

```sh
# At install time (customize.sh):
if [ -n "$KSU" ]; then
    ROOT_MANAGER="ksu"
elif [ -n "$APATCH" ]; then
    ROOT_MANAGER="apatch"
else
    ROOT_MANAGER="magisk"
fi

# At boot time (post-fs-data.sh / service.sh):
PATH=/data/adb/ap/bin:/data/adb/ksu/bin:/data/adb/magisk:$PATH
```

### Monitor Daemon Pattern

**Source:** `/home/claudetest/zero-mount/nomount/module/monitor.sh:1-328`

```sh
# Single instance check
echo $$ > "$PID_FILE.$$"
if [ -f "$PID_FILE" ]; then
    old_pid=$(cat "$PID_FILE" 2>/dev/null)
    [ -n "$old_pid" ] && [ "$old_pid" != "$$" ] && kill -0 "$old_pid" 2>/dev/null && exit 0
fi
mv "$PID_FILE.$$" "$PID_FILE"

# Process camouflage -- hide as kernel worker thread
camouflage_process() {
    local rnd=$(($(date +%s) % 8))
    echo "kworker/u${rnd}:zm" > /proc/self/comm 2>/dev/null || true
}

# App install detection: 3-tier fallback
# 1. inotifywait (instant, needs busybox applet)
# 2. logcat (near-instant, listens for onPackageAdded/Removed)
# 3. poll (5s interval, counts pm list packages)

# Status cache generation for WebUI (JSON written to file)
generate_status_cache() {
    cat > "$STATUS_CACHE" <<EOF
{"engineActive":$engine,"rulesCount":$rules_count,...,"timestamp":$timestamp}
EOF
}

# Main polling loop
while true; do
    sleep 5
    [ -f "$MODDIR/disable" ] || [ -f "$MODDIR/remove" ] && break
    # Check each module for changes
    # Update status cache
done
```

---

## 11. Reference: WebUI Patterns (from ZeroMount)

### KSU Bridge (execCommand)

**Source:** `/home/claudetest/zero-mount/nomount/webui-v2-beta/src/lib/api.ts:17-52`

```typescript
let execCounter = 0;

async function execCommand(cmd: string, timeoutMs = 30000): Promise<KsuExecResult> {
  const ksu = globalThis.ksu;
  if (!ksu?.exec) {
    throw new Error('KSU not available');
  }

  return new Promise((resolve, reject) => {
    const callbackName = `exec_cb_${Date.now()}_${execCounter++}`;

    const timeoutId = setTimeout(() => {
      delete (window as any)[callbackName];
      reject(new Error(`Command timed out: ${cmd.substring(0, 50)}...`));
    }, timeoutMs);

    (window as any)[callbackName] = (errno: number, stdout: string, stderr: string) => {
      clearTimeout(timeoutId);
      delete (window as any)[callbackName];
      resolve({ errno, stdout, stderr });
    };

    try {
      ksu.exec(cmd, '{}', callbackName);
    } catch (e) {
      clearTimeout(timeoutId);
      delete (window as any)[callbackName];
      reject(e);
    }
  });
}
```

### Mock Detection (for browser development)

**Source:** `/home/claudetest/zero-mount/nomount/webui-v2-beta/src/lib/api.ts:19-21`

```typescript
export function shouldUseMock(): boolean {
  return typeof globalThis.ksu === 'undefined';
}
```

When running in a browser (development), `ksu` is undefined, so all API calls return mock data. On device, KSU/Magisk injects the `ksu` global.

### KSU Native API Types

**Source:** `/home/claudetest/zero-mount/nomount/webui-v2-beta/src/lib/ksu.d.ts:1-36`

```typescript
interface KsuNativeApi {
  exec(cmd: string, options: string, callbackName: string): void;
  listAllPackages?(): string;
  listUserPackages?(): string;
  listSystemPackages?(): string;
  getPackagesInfo?(packageNamesJson: string): string;
  getPackagesIcons?(packageNamesJson: string, size: number): string;
}

declare global {
  var ksu: KsuNativeApi | undefined;
}
```

### Theme System

**Source:** `/home/claudetest/zero-mount/nomount/webui-v2-beta/src/lib/theme.ts:1-197`

3 base themes: `darkTheme`, `lightTheme`, `amoledTheme`
6 accent presets: Orange (`#FF8E53`), Emerald (`#00D68F`), Azure (`#00B4D8`), Slate (`#64748B`), Indigo (`#6366F1`), Coral (`#FF6B6B`)

Each theme defines CSS variables applied via `applyTheme()`:
```typescript
export function applyTheme(themeObj: typeof darkTheme, accentColor?: string) {
  const root = document.documentElement;
  root.style.setProperty('--bg-primary', themeObj.bgPrimary);
  root.style.setProperty('--bg-surface', themeObj.bgSurface);
  root.style.setProperty('--text-primary', themeObj.textPrimary);
  root.style.setProperty('--text-secondary', themeObj.textSecondary);
  // ... (20+ CSS variables)
  const accentStyles = getAccentStyles(accentColor || '#FF6B6B');
  root.style.setProperty('--gradient-primary', accentStyles.gradient);
  root.style.setProperty('--text-accent', accentStyles.textAccent);
  root.style.setProperty('--accent-rgb', accentStyles.rgb);
}
```

Fonts: Space Grotesk (headings), Inter (body), JetBrains Mono (code)
Glass morphism: `glassBg`, `glassBorder`, `glassBlur` variables

### State Management (Solid.js Store)

**Source:** `/home/claudetest/zero-mount/nomount/webui-v2-beta/src/lib/store.ts:1-634`

```typescript
import { createSignal, createRoot, createMemo, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';

function createAppStore() {
  const [activeTab, setActiveTab] = createSignal<Tab>('status');
  const [engineActive, setEngineActive] = createSignal(true);

  // Granular loading states
  const [loading, setLoading] = createStore({
    status: false,
    modules: false,
    apps: false,
    rules: false,
    activity: false,
    engine: false,
  });

  // Settings with localStorage persistence
  const [settings, setSettings] = createStore<Settings>({ ... });

  // Theme computed from settings
  const currentTheme = createMemo(() => {
    const pref = settings.theme;
    const baseTheme = pref === 'light' ? lightTheme
      : pref === 'amoled' ? amoledTheme
      : pref === 'auto' ? (systemPrefersDark() ? darkTheme : lightTheme)
      : darkTheme;
    return { ...baseTheme, /* accent overrides */ };
  });

  // Auto-apply theme when settings change
  createEffect(() => { applyTheme(currentTheme(), settings.accentColor); });

  // Toast notification system
  const [toast, setToast] = createSignal<{message: string; type: string} | null>(null);
  const showToast = (message: string, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  return { activeTab, setActiveTab, loading, settings, currentTheme, toast, showToast, /* ... */ };
}

export const store = createRoot(createAppStore);
```

### App Component Structure

**Source:** `/home/claudetest/zero-mount/nomount/webui-v2-beta/src/App.tsx:1-90`

```tsx
export function App() {
  const [isReady, setIsReady] = createSignal(false);
  onMount(async () => {
    await store.loadInitialData();
    setIsReady(true);
  });

  return (
    <Show when={isReady()} fallback={<LoadingScreen />}>
      <Header />
      <main>
        <Switch>
          <Match when={store.activeTab() === 'status'}><StatusTab /></Match>
          <Match when={store.activeTab() === 'modules'}><ModulesTab /></Match>
          <!-- etc -->
        </Switch>
      </main>
      <NavBar activeTab={store.activeTab()} onTabChange={store.setActiveTab} />
      <Toast />
    </Show>
  );
}
```

### Build Pipeline

**Source:** `/home/claudetest/zero-mount/nomount/webui-v2-beta/vite.config.ts:1-24`

```typescript
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  base: './',                           // Relative paths (runs from webroot/)
  plugins: [solid()],
  build: {
    target: 'esnext',
    outDir: '../module/webroot-beta',    // Build directly into module
    emptyOutDir: true,
    minify: 'esbuild',
    rollupOptions: {
      external: ['kernelsu'],           // KSU bridge is injected at runtime
    },
  },
})
```

**Dependencies:**
```json
{
  "dependencies": {
    "solid-js": "^1.9.10",
    "@material/material-color-utilities": "^0.4.0",
    "@material/web": "^2.4.1",
    "kernelsu": "^3.0.0"
  },
  "devDependencies": {
    "typescript": "~5.9.3",
    "vite": "^7.2.4",
    "vite-plugin-solid": "^2.11.10"
  }
}
```

### What to Keep vs Replace vs Create New

| Component | Action | Notes |
|-----------|--------|-------|
| Bridge (execCommand + mock) | **KEEP** | Proven, no changes needed |
| Theme system (dark/light/amoled + accents) | **KEEP** | Apply as-is |
| KSU type declarations (ksu.d.ts) | **KEEP** | Exact same interface |
| Store pattern (signals + createStore) | **KEEP structure, REPLACE content** | Same reactive approach, different data types |
| Vite config | **KEEP** | Change outDir to `../module/webroot` |
| StatusTab | **REPLACE** | New: mode display, debloat/systemize counts, bootloop counter |
| ModulesTab | **REPLACE with DebloatTab** | App list + category badges + nuke button |
| ConfigTab | **REPLACE with SystemizeTab** | User app list + promote button |
| SettingsTab | **KEEP structure** | Add mode override, theme, logging |
| NavBar | **MODIFY** | 4 tabs: Debloat, Systemize, Status, Settings |
| Header | **MODIFY** | Scalpel branding |
| NEW: Reboot FAB | **CREATE** | Fixed bottom-right floating button |

---

## 12. Reference: categories.json Schema

**Source:** `/home/claudetest/zero-mount/systemapp_nuker/module/webroot/categories.json:1-294`

### Exact JSON Structure

```json
{
  "categories": [
    {
      "id": "essential",
      "name": "Essential",
      "description": "Critical system components. Removing these may break core functionality.",
      "color": "#ff6b6b"
    },
    {
      "id": "caution",
      "name": "Caution",
      "description": "This might be used by other system components.",
      "color": "#ff5722"
    },
    {
      "id": "safe",
      "name": "Safe",
      "description": "Non-essential apps that can be removed without affecting system stability.",
      "color": "#4caf50"
    },
    {
      "id": "google",
      "name": "Google",
      "description": "Google apps and services that may be required for the Play Store ecosystem.",
      "color": "#4285f4"
    },
    {
      "id": "unknown",
      "name": "Unknown",
      "description": "Apps with unknown classification.",
      "color": "#9e9e9e",
      "icon": "help"
    }
  ],
  "apps": {
    "com.android.settings": "essential",
    "com.android.systemui": "essential",
    "com.miui.home": "essential",
    "com.android.bluetooth": "caution",
    "com.google.android.gms": "google",
    "com.google.android.gsf": "google",
    "com.facebook.katana": "safe",
    "com.google.android.youtube": "safe"
  }
}
```

### 5 Risk Tiers

| Category | Color | Count (SAN) | Risk Level |
|----------|-------|-------------|------------|
| essential | `#ff6b6b` (red) | 11 | BRICK/BOOTLOOP if removed |
| caution | `#ff5722` (orange) | ~81 | Used by other system apps |
| safe | `#4caf50` (green) | 180+ | Non-essential, safe to remove |
| google | `#4285f4` (blue) | 2 (GMS+GSF) | Required for Play Store |
| unknown | `#9e9e9e` (gray) | - | Uncategorized (default) |

**Unknown handling:** Any package not in the `apps` map gets the `unknown` category. The WebUI should display these with a gray badge and a warning that the app is unclassified.

**Scalpel improvement:** Extend from SAN's 292 apps. Add more Samsung, OnePlus, OPPO, Vivo packages.

---

## 13. Bugs to Avoid (Lessons from Reference Projects)

| # | Bug | Source | Severity | Cause | Scalpel's Fix |
|---|-----|--------|----------|-------|---------------|
| 1 | Mode 2 detection path typo | SAN `customize.sh:118` | HIGH | `/data/adb/mountify/config.sh` should be `/data/adb/modules/mountify/config.sh` | Dynamic mode detection, no hardcoded paths |
| 2 | `single_depth()` undefined $2 | SAN `mountify.sh:68` | MEDIUM | References `$2` which is never passed | Scalpel mode scripts receive explicit arguments |
| 3 | `$MODPATH` used at boot | SAN `post-fs-data.sh:58-59` | MEDIUM | `$MODPATH` only defined during customize.sh | Always use `$MODDIR` at boot |
| 4 | Shell injection in JSON write | SAN `util.js:494` | LOW-MED | `echo '${JSON.stringify()}' > file` breaks on single quotes | Use `escapeShellArg()` from ZeroMount api.ts |
| 5 | No pm uninstall -k | TS `systemize:166-233` | HIGH | APK copied to /system but /data copy remains; PMS uses /data copy | Always `pm uninstall -k --user 0` before reboot |
| 6 | Unquoted glob | TS `systemize:126-127` | MEDIUM | `dir_app[c]=/data/app/$app-*/base.apk` -- multiple matches cause breakage | Quote all variables, use jq for paths |
| 7 | No aapt validation | TS `systemize:206-220` | LOW | XML generation proceeds even if aapt fails | Validate aapt output, check for empty |
| 8 | Silent mount failures | All 3 projects | HIGH | Mount operations fail without logging or user notification | Log ALL errors to kmsg + persistent file, verify after mount |
| 9 | grep/sed JSON parsing | SAN everywhere | MEDIUM | Breaks on special chars, quotes, nested objects | Use bundled jq binary exclusively |
| 10 | No health check | SAN + TS | MEDIUM | No verification that whiteouts/systemization actually worked | service.sh runs verify.sh after boot |
| 11 | Mode locked at install | SAN | MEDIUM | Kernel updates or metamodule changes not detected | Re-evaluate at every boot |
| 12 | Busybox alias pollution | TS `mod-util.sh:34-44` | LOW | Global aliases may conflict with system binaries | Use full `busybox <applet>` calls, never alias |
| 13 | No persistent debug log | All 3 projects | MEDIUM | Only kmsg output, hard for users to diagnose | Write to /data/adb/scalpel/debug.log with rotation |
| 14 | Hardcoded vendor partitions | SAN `service.sh:119-124` | LOW | OEMs add custom partitions not in the list | Scan /proc/mounts dynamically |
| 15 | App list generated every boot | SAN `service.sh:207` | LOW | 30-60s wasted scanning when system apps don't change | Scan once at install, cache, manual refresh |

---

## 14. Shell Conventions

### Variable Quoting
```sh
# ALWAYS quote variables (shellcheck compliant)
if [ -f "$PERSIST_DIR/config.sh" ]; then
    . "$PERSIST_DIR/config.sh"
fi

# NEVER unquoted
for dir in $system_dirs; do    # BAD -- word splitting
for dir in "$system_dirs"; do  # GOOD if single value
```

### Error Handling
```sh
# Always check return codes for critical operations
if ! busybox mknod "$path" c 0 0; then
    log_err "Failed to create whiteout: $path"
    return 1
fi

# Safe sourcing
[ -f "$file" ] && . "$file"
```

### Busybox Usage
```sh
# Always prefix with busybox -- never rely on PATH or aliases
busybox mknod "$path" c 0 0
busybox chcon --reference="/system" "$path"
busybox setfattr -n trusted.overlay.whiteout -v y "$path"
busybox mount -t overlay ...
busybox umount -l ...
```

### jq Patterns
```sh
# Read a field from JSON
package_name=$(jq -r '.package_name' "$json_file")

# Add entry to JSON array
jq --arg name "$name" --arg pkg "$pkg" --arg path "$path" \
    '. += [{"app_name": $name, "package_name": $pkg, "app_path": $path}]' \
    "$APP_LIST" > "$APP_LIST.tmp" && mv "$APP_LIST.tmp" "$APP_LIST"

# Check if array is empty
if [ "$(jq 'length' "$NUKE_LIST")" -eq 0 ]; then
    log_info "Nuke list empty, nothing to do"
fi

# Iterate JSON array
jq -r '.[] | .package_name' "$NUKE_LIST" | while read -r pkg; do
    mode_debloat "$pkg"
done
```

### Logging Calls
```sh
# Scalpel logging pattern (adapted from ZeroMount)
. "$MODDIR/core/logging.sh"
log_init "service"

log_err   "Critical: $message"       # + kmsg mirror
log_warn  "Warning: $message"
log_info  "Info: $message"
log_debug "Debug: $message"
```

### Function Naming
```sh
# Mode scripts: mode_ prefix
mode_probe()     # Returns 0 if mode available
mode_debloat()   # Execute debloat for one app
mode_restore()   # Reverse one debloat operation
mode_verify()    # Check if debloat is working
mode_cleanup()   # Remove all state for this mode

# Core scripts: descriptive verb_noun
config_read()
config_write()
config_migrate()
config_backup()
scanner_scan_partitions()
bootloop_check()
bootloop_reset()
```

### Script Size Limits
- Each `.sh` file: <200 lines (HARD LIMIT)
- If approaching 200 lines, split into separate files
- Exception: generated/data files (categories.json)

### SELinux Context Handling
```sh
# Copy context from reference file/directory
busybox chcon --reference="/system" "$whiteout_path"

# Or set explicitly for systemized apps
chcon 'u:object_r:system_file:s0' "$apk_path"

# For vendor paths, use the vendor reference
busybox chcon --reference="/vendor" "$vendor_whiteout_path"
```

---

## 15. File Structure (Target)

```
module/
+-- module.prop
+-- customize.sh                    # Installation logic
+-- post-fs-data.sh                 # Early boot entry point
+-- service.sh                      # Late boot orchestration
+-- action.sh                       # Magisk WebUI launcher (Phase 2)
+-- uninstall.sh                    # Cleanup + restoration
+-- core/
|   +-- detect.sh                   # Mode detection probe chain
|   +-- config.sh                   # Config read/write/migrate/backup
|   +-- bootloop.sh                 # 3-strike counter + recovery
|   +-- logging.sh                  # 5-level logging with rotation
|   +-- scanner.sh                  # System app discovery engine
|   +-- verify.sh                   # Post-reboot verification
|   +-- nuke.sh                     # Debloat orchestrator engine
+-- modes/
|   +-- mode_zeromount.sh           # VFS interception via zm CLI
|   +-- mode_whiteout.sh            # Overlayfs char device whiteouts
|   +-- mode_mountify.sh            # tmpfs + overlayfs standalone (Phase 2)
|   +-- mode_symlink.sh             # Symlink + overlayfs (Phase 2)
|   +-- mode_magisk.sh              # Magic mount file overlay
|   +-- mode_pm.sh                  # pm disable/uninstall fallback
+-- systemize/
|   +-- promote.sh                  # APK copy + user uninstall + verify
|   +-- permissions.sh              # Priv-app XML generation
+-- monitor.sh                      # Background daemon (Phase 2)
+-- bin/
|   +-- arm64-v8a/aapt              # APK metadata extractor (64-bit)
|   +-- armeabi-v7a/aapt            # APK metadata extractor (32-bit)
|   +-- jq                          # JSON processor
+-- webroot/
|   +-- index.html                  # Vite build output
|   +-- assets/                     # JS/CSS bundles
|   +-- categories.json             # App risk classifications
+-- dummy_zip/                      # Indirect nuke trigger (whiteout mode)
    +-- module.prop
    +-- customize.sh
```

---

## 16. Persistent State Layout

```
/data/adb/scalpel/
+-- config.sh                       # Shell variables: mode override, options
|                                   # Format: key=value (one per line)
|                                   # Read by: every script (sourced)
|                                   # Written by: config.sh functions, customize.sh
|
+-- config.sh.bak                   # Backup for bootloop recovery
|                                   # Created by: config_backup() before boot
|                                   # Restored by: bootloop.sh on strike 3
|
+-- nuke_list.json                  # Apps marked for removal
|                                   # Format: JSON array (see Section 8)
|                                   # Read by: nuke.sh, WebUI, post-fs-data
|                                   # Written by: WebUI via ksu.exec()
|
+-- systemize_list.json             # Apps marked for systemization
|                                   # Format: JSON array [{package_name, target}]
|                                   # Read by: promote.sh, WebUI
|                                   # Written by: WebUI via ksu.exec()
|
+-- app_list.json                   # All discoverable system apps
|                                   # Format: JSON array (see Section 8)
|                                   # Read by: WebUI (cached, loaded instantly)
|                                   # Written by: scanner.sh (once at install)
|
+-- categories.json                 # App risk classifications
|                                   # Format: see Section 12
|                                   # Read by: WebUI, scanner.sh
|                                   # Written by: bundled with module
|
+-- status.json                     # Current module status for WebUI
|                                   # Format: {"mode":"whiteout","debloated":5,"systemized":2,...}
|                                   # Read by: WebUI
|                                   # Written by: verify.sh, monitor.sh
|
+-- count.sh                        # Boot counter for bootloop detection
|                                   # Format: BOOTCOUNT=N
|                                   # Read by: bootloop.sh
|                                   # Written by: bootloop.sh (increment), service.sh (reset)
|
+-- debug.log                       # Persistent log (1MB max, 3 archives)
|                                   # Read by: user/developer for debugging
|                                   # Written by: logging.sh
|
+-- icons/                          # Cached PNG app icons
                                    # Format: {package_name}.png
                                    # Read by: WebUI (via symlink)
                                    # Written by: scanner.sh (unzip from APK)
```

### config.sh Format

```sh
# User-configurable options
mode_override=""                    # Force specific mode (empty=auto-detect)
disable_only_mode=false             # Skip whiteouts, only pm disable
refresh_applist=false               # Regenerate app list every boot (default: false)

# Auto-detected (DO NOT EDIT)
detected_mode=""                    # Last detected mode
magic_mount=true                    # true=magic mount manager, false=overlayfs
root_manager=""                     # magisk|ksu|apatch
```

---

## 17. Mode Interface Contract

Every `modes/mode_*.sh` file MUST implement these 5 functions:

### mode_probe()

```sh
# Returns 0 if this mode is available on this device, 1 otherwise.
# MUST have zero side effects (no writes, no mounts, no state changes).
# MUST complete in <100ms.
#
# Arguments: none
# Returns: 0=available, 1=unavailable
# Output: none (log via log_debug)
mode_probe() {
    # Example: mode_zeromount
    [ -e "/dev/zeromount" ] && return 0
    return 1
}
```

### mode_debloat()

```sh
# Hide/remove one app at the given path.
# Called once per app in the nuke list.
#
# Arguments:
#   $1 = package_name (e.g., "com.facebook.katana")
#   $2 = app_path (e.g., "/system/app/Facebook/Facebook.apk")
# Returns: 0=success, 1=failure
# Side effects: creates whiteout/rule/disables package
mode_debloat() {
    local pkg="$1"
    local app_path="$2"
    # Implementation varies per mode
}
```

### mode_restore()

```sh
# Reverse a previous debloat operation for one app.
#
# Arguments:
#   $1 = package_name
#   $2 = app_path
# Returns: 0=success, 1=failure
mode_restore() {
    local pkg="$1"
    local app_path="$2"
    # Remove whiteout/rule/re-enable package
}
```

### mode_verify()

```sh
# Check if a debloat operation is actually working.
# Called by verify.sh after boot to confirm operations succeeded.
#
# Arguments:
#   $1 = package_name
#   $2 = app_path
# Returns: 0=verified working, 1=not working
mode_verify() {
    local pkg="$1"
    local app_path="$2"
    # Check: is the app actually hidden/disabled?
}
```

### mode_cleanup()

```sh
# Remove ALL state for this mode (whiteouts, rules, etc.).
# Called during bootloop recovery and uninstall.
#
# Arguments: none
# Returns: 0=success, 1=failure
mode_cleanup() {
    # Remove all whiteouts/rules/disabled states
}
```

---

## 18. WebUI <-> Shell Bridge Contract

All shell commands the WebUI calls via `ksu.exec()`:

| Operation | Shell Command | Expected Output | Error Handling |
|-----------|--------------|-----------------|----------------|
| Read app list | `cat /data/adb/scalpel/app_list.json` | JSON array | errno!=0 -> show "Run scan first" |
| Read nuke list | `cat /data/adb/scalpel/nuke_list.json` | JSON array | errno!=0 -> empty array |
| Save nuke list | `echo '<json>' > /data/adb/scalpel/nuke_list.json` | (none) | errno!=0 -> toast error |
| Execute debloat | `busybox nsenter -t1 -m /data/adb/modules/scalpel/core/nuke.sh` | Progress text | errno!=0 -> toast error |
| Execute systemize | `busybox nsenter -t1 -m /data/adb/modules/scalpel/systemize/promote.sh <pkg> <target>` | Status text | errno!=0 -> toast error, abort |
| Get status | `cat /data/adb/scalpel/status.json` | JSON object | errno!=0 -> show defaults |
| Read config | `cat /data/adb/scalpel/config.sh` | key=value lines | errno!=0 -> use defaults |
| Write config | `echo 'key=value' > /data/adb/scalpel/config.sh` | (none) | errno!=0 -> toast error |
| Verify app | `dumpsys package <pkg> \| grep -E 'flags=\|sourceDir='` | flags + sourceDir lines | errno!=0 -> "unknown" |
| Trigger scan | `busybox nsenter -t1 -m /data/adb/modules/scalpel/core/scanner.sh` | (none) | errno!=0 -> toast error |
| Reboot | `svc power reboot` | (none) | Show confirmation dialog first |
| Read categories | Fetch `categories.json` from webroot (not exec) | JSON object | fetch error -> empty categories |

### Shell Argument Escaping

**CRITICAL:** Use the same escaping function from ZeroMount:

```typescript
function escapeShellArg(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}
```

This prevents shell injection when writing JSON or handling app names with special characters.

---

## 19. Boot Sequence (Scalpel-Specific)

### Installation (customize.sh)

```
Environment: $MODPATH available, $MODDIR NOT available
Root: running as root within root manager's installer context
Timing: user-initiated (during module install)

1. Validate $MODPATH is set
2. Create persistent directory: mkdir -p /data/adb/scalpel/
3. Detect root manager ($KSU, $APATCH, default=Magisk)
4. Detect device capabilities:
   a. Check overlayfs: grep "overlay" /proc/filesystems
   b. Check tmpfs xattr: mknod + setfattr test
   c. Check magic mount vs overlayfs manager
   d. Check ZeroMount: [ -e /dev/zeromount ]
5. Write initial config.sh (or migrate existing)
6. Place binaries by arch:
   a. CPU_ABI=$(getprop ro.product.cpu.abi)
   b. Copy correct aapt binary to common/aapt
   c. Set permissions (0755)
7. Run scanner.sh -> generates app_list.json (ONE TIME)
8. Display default debloat list (package names)
9. Volume key prompt: UP=apply, DOWN=skip, 7s timeout=SKIP
10. If applied: write nuke_list.json with defaults
11. Clean up bin/ directory (remove unused architectures)
```

### Early Boot (post-fs-data.sh)

```
Environment: $MODDIR available, $MODPATH NOT available
Root: running as root
Timing: early boot, before boot_completed
Constraint: must complete within Android watchdog timeout

1. Set PATH for root manager binaries
2. MODDIR="${0%/*}"
3. Source core/bootloop.sh -> check counter
   - If counter >= 3: restore backup, delete whiteouts, disable, reboot
   - Else: increment counter, continue
4. Source core/config.sh -> load persistent config
5. Source core/detect.sh -> probe chain, get mode
   - If mode_override set in config: use that
   - Else: probe best-to-worst
6. Source modes/mode_${detected_mode}.sh
7. Read nuke_list.json via jq
8. For each app: mode_debloat "$pkg" "$app_path"
9. Log results to debug.log + kmsg
```

### Late Boot (service.sh)

```
Environment: $MODDIR available
Root: running as root
Timing: after boot_completed signal

1. Wait for boot_completed:
   until [ "$(getprop sys.boot_completed)" = "1" ]; do sleep 1; done
2. Source core/config.sh
3. Reset boot counter: echo "BOOTCOUNT=0" > count.sh
4. Source core/verify.sh -> check all debloat/systemize operations
   - For each nuked app: mode_verify "$pkg" "$app_path"
   - For each systemized app: check FLAG_SYSTEM + sourceDir
5. Write status.json for WebUI
6. Update module.prop description with stats
7. Create WebUI symlink: ln -sf /data/adb/scalpel $MODDIR/webroot/link
8. (Phase 2) Start monitor.sh in background
```

---

## 20. Integration Points

### Root Manager Detection

```sh
# At install time (customize.sh has env vars):
if [ -n "$KSU" ]; then
    ROOT_MANAGER="ksu"
    [ -n "$KSU_MAGIC_MOUNT" ] && MAGIC_MOUNT=true || MAGIC_MOUNT=false
    [ -n "$KSU_NEXT" ] && ROOT_MANAGER="ksu_next"
elif [ -n "$APATCH" ]; then
    ROOT_MANAGER="apatch"
    [ -n "$APATCH_BIND_MOUNT" ] && MAGIC_MOUNT=true || MAGIC_MOUNT=false
else
    ROOT_MANAGER="magisk"
    MAGIC_MOUNT=true
fi

# At boot time (set PATH for all root manager binaries):
PATH=/data/adb/ap/bin:/data/adb/ksu/bin:/data/adb/magisk:$PATH
```

### ZeroMount Integration

```sh
# Detection
mode_probe() {
    [ -e "/dev/zeromount" ] || return 1
    # Verify zm binary is accessible
    command -v zm >/dev/null 2>&1 || return 1
    return 0
}

# Debloat: register path as whiteout with zm
mode_debloat() {
    local pkg="$1"
    local app_path="$2"
    local app_dir=$(dirname "$app_path")
    zm add "$app_dir" "" # Empty rpath = whiteout (deletion marker)
}

# Restore: remove zm rule
mode_restore() {
    local app_dir=$(dirname "$2")
    zm del "$app_dir"
}
```

### Magisk WebUI Bridge (action.sh)

**Source:** `/home/claudetest/zero-mount/systemapp_nuker/module/action.sh` (99 lines)

```sh
# Check for WebUI standalone apps
if pm list packages | grep -q "com.anthropic.ksu.webui"; then
    am start -n "com.anthropic.ksu.webui/.WebUIActivity" \
        --es module_id "scalpel" \
        --es module_path "$MODDIR"
elif pm list packages | grep -q "com.rifsxd.ksunext.webui.standalone"; then
    # KSUWebUIStandalone
    am start ...
elif pm list packages | grep -q "com.dergoogler.mmrl"; then
    # MMRL
    am start ...
else
    # Download KSUWebUIStandalone
    echo "Downloading WebUI app..."
fi
```

### Android PMS Interaction

```sh
# Disable package (pm mode debloat)
pm disable-user --user 0 "$package_name"

# Enable package (restore)
pm enable "$package_name"

# Reinstall existing package (restore after whiteout removal)
pm install-existing "$package_name"

# Remove user copy (systemization -- THE critical step)
pm uninstall -k --user 0 "$package_name"

# Verify system app status
dumpsys package "$package_name" | grep -E 'flags=|sourceDir='
# Expected for systemized app:
#   flags=[ SYSTEM HAS_CODE ALLOW_CLEAR_USER_DATA ALLOW_BACKUP ]
#   sourceDir=/system/priv-app/AppName/AppName.apk

# List disabled packages
pm list packages -d

# Check if package exists
pm path "$package_name"

# List system packages
pm list packages -s

# Uninstall system updates (before nuking updated system app)
pm uninstall-system-updates "$package_name"
```

### Volume Key Detection at Install

**Source:** `/home/claudetest/zero-mount/Scalpel/reference/volume_key_reference.sh:50-81`

```sh
checkkey() {
    while true; do
        key_code=$(getevent -qlc 1 | grep "KEY_" | awk '{print $3}')
        if [ -n "$key_code" ]; then
            echo "$key_code"
            sleep 1
            break
        fi
        sleep 0.1
    done
}

opt() {
    while true; do
        key=$(checkkey)
        case $key in
            KEY_VOLUMEUP)   return 0 ;;
            KEY_VOLUMEDOWN) return 1 ;;
            KEY_POWER)      return 2 ;;
        esac
    done
}

# Usage in customize.sh:
echo "Apply default debloat list?"
echo "  VOL UP = Apply | VOL DOWN = Skip"
echo "  (7 second timeout = Skip)"

# Timeout implementation:
timeout_result=1  # default: skip
( sleep 7; kill -USR1 $$ 2>/dev/null ) &
timeout_pid=$!
trap 'timeout_result=1' USR1
key_result=$(opt)
kill $timeout_pid 2>/dev/null
```

---

## Self-Audit Results

**Gate 1 (Completeness):** Covers all 20 required sections. Architecture, decisions, all reference project patterns with exact code, bugs, conventions, WebUI patterns, Android domain knowledge, boot sequence, integration points, JSON schemas, mode interface, file structure, and state layout are all documented.

**Gate 2 (Precision):** Every pattern cited with source file path and line numbers where available. Command sequences are exact (not paraphrased). JSON schemas match actual source files. Shell code patterns are copy-paste ready.

**Gate 3 (Usability):** A new Claude session reading only this file has: (1) the complete architecture with component responsibilities, (2) exact code patterns for every subsystem, (3) all data schemas, (4) all bugs to avoid with causes and fixes, (5) the complete implementation order with dependencies, and (6) the exact WebUI bridge contract. No reference project analysis needed.

---

## Session 2 Addendum (2026-01-31)

### New Files Built This Session

| File | Lines | Purpose |
|------|-------|---------|
| core/whiteout_helpers.sh | 85 | Shared whiteout creation/removal/verify/vendor-symlink-fix |
| modes/mode_whiteout.sh | 115 | Overlayfs whiteout debloat mode |
| modes/mode_zeromount.sh | 104 | ZeroMount VFS interception mode |
| modes/mode_magisk.sh | 139 | Magisk magic mount mode |
| core/nuke.sh | 144 | Debloat orchestrator (detect->source->iterate->status) |
| core/verify.sh | 161 | Post-boot verification (reads mode from status.json) |
| post-fs-data.sh | 24 | Early boot: bootloop check -> config -> log -> nuke |
| service.sh | ~85 | Late boot: wait boot_completed -> reset counter -> pm retry -> verify |
| systemize/promote.sh | 193 | 9-step clinical systemization with pm uninstall -k |
| systemize/permissions.sh | 138 | privapp-permissions XML generator (aapt + dumpsys fallback) |
| customize.sh | 125 | Module install: scanner + volume key default debloat |
| core/default_debloat.sh | 81 | Extract safe+google apps -> nuke_list.json |
| uninstall.sh | 42 | Clean removal: restore apps + delete data |

### Key Architectural Patterns Established

1. **Mode interface contract**: 5 functions (probe/debloat/restore/verify/cleanup) implemented by 4 modes
2. **Whiteout sharing**: whiteout_helpers.sh sourced by both mode_whiteout and mode_magisk
3. **Orchestrator pattern**: nuke.sh sources detect->mode->iterate, writes status.json
4. **Status pipeline**: nuke.sh writes -> verify.sh merges -> WebUI reads
5. **Boot sequence**: post-fs-data (bootloop->nuke) -> service.sh (wait->reset->retry->verify)
6. **pm mode deferral**: Fails gracefully at post-fs-data, retried with forced override at service.sh
7. **Clinical systemization**: 9-step protocol fixing Terminal Systemizer's pm uninstall -k gap
8. **Install flow**: scanner -> volume key -> default debloat -> permissions -> reboot

### Bugs Discovered and Fixed (14 unique findings)

| Bug | Severity | Fix |
|-----|----------|-----|
| bootloop counter source injection | CRITICAL | grep-parse instead of `. file` |
| Premature bootloop_reset | HIGH | Moved after boot_completed |
| getprop hang (no timeout) | HIGH | 300s timeout with break |
| pm retry mode switch | HIGH | SCALPEL_MODE_OVERRIDE=pm |
| Missing config_init/log_init | HIGH | Added to both orchestrators |
| Vendor symlink O(N) redundancy | HIGH | Moved to nuke.sh post-batch |
| Corrupt JSON silent failure | MEDIUM | jq validity check before length |
| Status merge data loss | MEDIUM | Fallback to fresh creation |
| Stale zm binary cache | MEDIUM | Validate executability |
| Cleanup dir lists inconsistent | MEDIUM | Unified with odm/oem |
| Missing guard clauses | MEDIUM | Added to mode_zeromount |
| TAG variable collision | MEDIUM | Re-assign after sourced calls |
| sed delimiter collision | MEDIUM | Changed to pipe delimiter |
| MODDIR fallback inconsistency | MEDIUM | Standardized ${MODDIR:-fallback} |

### Remaining Work (9 features, Phases 8-9)

Phase 8 (WebUI -- MVP):
- webui-scaffold: Fork ZeroMount webroot-beta, adapt bridge
- webui-debloat: App selection + nuke interface
- webui-systemize: App promotion interface
- webui-status: Health and operation display

Phase 9 (Extended):
- mode-mountify: Standalone tmpfs+overlayfs mode
- mode-symlink: Symlink+overlayfs mode
- monitor: Background monitoring daemon
- webui-settings: Configuration interface
- action.sh: Magisk WebUI launcher bridge
