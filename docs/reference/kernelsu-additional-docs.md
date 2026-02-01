# KernelSU & APatch Additional Documentation Reference

Compiled: 2026-02-01
Purpose: Complete reference for Scalpel module development across all three root managers (Magisk, KernelSU, APatch)

---

## Table of Contents

1. [KernelSU: Difference with Magisk](#1-kernelsu-difference-with-magisk)
2. [KernelSU: Installation Guide](#2-kernelsu-installation-guide)
3. [KernelSU: Metamodule System](#3-kernelsu-metamodule-system)
4. [KernelSU: Module Guide (Full)](#4-kernelsu-module-guide-full)
5. [KernelSU: Module Configuration System](#5-kernelsu-module-configuration-system)
6. [KernelSU: Module WebUI](#6-kernelsu-module-webui)
7. [KernelSU: App Profile (SELinux, Capabilities, Umount)](#7-kernelsu-app-profile)
8. [KernelSU: Hidden Features](#8-kernelsu-hidden-features)
9. [KernelSU: FAQ](#9-kernelsu-faq)
10. [KernelSU: Rescue from Bootloop](#10-kernelsu-rescue-from-bootloop)
11. [KernelSU: How to Build](#11-kernelsu-how-to-build)
12. [KernelSU: Non-GKI Integration](#12-kernelsu-non-gki-integration)
13. [APatch: What is APatch](#13-apatch-what-is-apatch)
14. [APatch: APModule Development Guide](#14-apatch-apmodule-development-guide)
15. [APatch: MetaModules](#15-apatch-metamodules)
16. [APatch: Installation](#16-apatch-installation)
17. [APatch: FAQ](#17-apatch-faq)
18. [APatch: Rescue from Bootloop](#18-apatch-rescue-from-bootloop)
19. [APatch: KernelPatch Module (KPM) Guide](#19-apatch-kpm-guide)
20. [Cross-Manager Comparison Table](#20-cross-manager-comparison-table)

---

## 1. KernelSU: Difference with Magisk

**Source:** https://kernelsu.org/guide/difference-with-magisk.html

Although KernelSU and Magisk modules have many similarities, there are inevitably some differences due to their completely different implementation mechanisms. If you want your module to work on both Magisk and KernelSU, it's essential to understand these differences.

### Similarities

- **Module file format:** Both use the ZIP format to organize modules, and the module format is practically the same.
- **Module installation directory:** Both are located at `/data/adb/modules`.
- **Systemless:** Both support modifying `/system` in a systemless way through modules.
- **post-fs-data.sh:** Execution time and semantics are exactly the same.
- **service.sh:** Execution time and semantics are exactly the same.
- **system.prop:** Completely the same.
- **sepolicy.rule:** Completely the same.
- **BusyBox:** Scripts are run in BusyBox with "Standalone Mode" enabled in both cases.

### Differences

Before understanding the differences, it's important to know how to identify whether your module is running in KernelSU or Magisk. You can use the environment variable `KSU` to differentiate it in all places where you can run module scripts (`customize.sh`, `post-fs-data.sh`, `service.sh`). In KernelSU, this environment variable will be set to `true`.

Here are some differences:

- KernelSU modules cannot be installed in Recovery mode.
- KernelSU modules don't have built-in support for Zygisk, but you can use Zygisk modules through [ZygiskNext](https://github.com/Dr-TSNG/ZygiskNext).
- **Module mounting architecture**: KernelSU uses a metamodule system where mounting is delegated to pluggable metamodules (e.g., `meta-overlayfs`), while Magisk has mounting built into its core. KernelSU requires installing a metamodule to enable module mounting.
- The method for replacing or deleting files in KernelSU modules is completely different from Magisk. KernelSU doesn't support the `.replace` method. Instead, you need to create a same-named file with `mknod filename c 0 0` to delete the corresponding file.
- The directories for BusyBox are different. The built-in BusyBox in KernelSU is located at `/data/adb/ksu/bin/busybox`, while in Magisk it is at `/data/adb/magisk/busybox`. **Note that this is an internal behavior of KernelSU and may change in the future!**
- KernelSU doesn't support `.replace` files, but it supports the `REMOVE` and `REPLACE` variables to remove or replace files and folders.
- KernelSU adds the `boot-completed` stage to run scripts after the boot process is finished.
- KernelSU adds the `post-mount` stage to run scripts after module mounting is complete.

---

## 2. KernelSU: Installation Guide

**Source:** https://kernelsu.org/guide/installation.html

### Running Modes (Since v0.9.0)

KernelSU supports two running modes on GKI devices:

1. **GKI mode**: Replace the original kernel with the Generic Kernel Image (GKI) provided by KernelSU.
   - Strong universality, suitable for most devices (e.g. Samsung KNOX devices)
   - Can be used without relying on official firmware
   - No need to wait for official firmware updates, as long as KMI is consistent

2. **LKM mode**: Load the Loadable Kernel Module (LKM) into the device kernel without replacing it.
   - Won't replace the original kernel
   - More convenient to upgrade and OTA
   - LKM can also be loaded with temporary root permissions
   - LKM can be temporarily uninstalled without rebooting

**Priority:** GKI mode is higher than LKM mode. If both are present, GKI mode is used.
**Recommendation:** Phones -> LKM mode. Emulators/WSA/Waydroid -> GKI mode.

### KMI (Kernel Module Interface)

Kernel versions with the same KMI are compatible. Format:

```
KernelRelease :=
Version.PatchLevel.SubLevel-AndroidRelease-KmiGeneration-suffix
w      .x         .y       -zzz           -k            -something
```

`w.x-zzz-k` is the KMI version. SubLevel is NOT part of KMI.
Example: `5.10.101-android12-9-g30979850fc20` -> KMI is `5.10-android12-9`

### Post-Installation: Module Support (CRITICAL FOR SCALPEL)

> If you want to use modules that modify `/system` files, you need to install a **metamodule** after installing KernelSU. Modules that only use scripts, sepolicy, or system.prop work without a metamodule.

---

## 3. KernelSU: Metamodule System

**Source:** https://kernelsu.org/guide/metamodule.html

### What is a Metamodule?

A metamodule is a special type of KernelSU module that provides core infrastructure functionality for the module system. Unlike regular modules that modify system files, metamodules control *how* regular modules are installed and mounted.

**Key characteristics:**
- **Infrastructure role**: Provides services that regular modules depend on
- **Single instance**: Only one metamodule can be installed at a time
- **Priority execution**: Metamodule scripts run before regular module scripts
- **Special hooks**: Provides three hook scripts for installation, mounting, and cleanup

### Why Metamodules?

- **Reduced detection surface**: KernelSU itself doesn't perform mounts
- **Stability**: Core remains stable while mounting implementations can evolve
- **Innovation**: Community can develop alternative mounting strategies
- **Choice**: Users can select the implementation that best fits their needs

**Mounting flexibility options:**
- **No mounting**: For mountless-only modules
- **OverlayFS mounting**: Traditional approach (via `meta-overlayfs`)
- **Magic mount**: Magisk-compatible mounting
- **Custom implementations**: FUSE-based overlays, custom VFS mounts, etc.

> **IMPORTANT**: Without a metamodule installed, modules will NOT be mounted. Fresh KernelSU installations require installing a metamodule.

### Metamodule module.prop

```
id=meta-example
name=My Custom Metamodule
version=1.0
versionCode=1
author=Your Name
description=Custom module mounting implementation
metamodule=1
```

The `metamodule=1` (or `metamodule=true`) property marks this as a metamodule. Naming convention: start with `meta-` prefix.

### Metamodule File Structure

```
meta-example/
├── module.prop              (must include metamodule=1)
│
│      *** Metamodule-specific hooks ***
├── metamount.sh             (optional: custom mount handler)
├── metainstall.sh           (optional: installation hook for regular modules)
├── metauninstall.sh         (optional: cleanup hook for regular modules)
│
│      *** Standard module files (all optional) ***
├── customize.sh
├── post-fs-data.sh
├── service.sh
├── boot-completed.sh
├── uninstall.sh
└── [any additional files]
```

### Hook Scripts

#### 1. metamount.sh - Mount Handler

Runs AFTER all post-fs-data scripts. Controls how modules are mounted during boot.

**CRITICAL REQUIREMENT:** When performing mount operations, you MUST set the source/device name to `"KSU"`:

```sh
mount -t overlay -o lowerdir=/lower,upperdir=/upper,workdir=/work KSU /target
```

For modern mount APIs:
```rust
fsconfig_set_string(fs, "source", "KSU")?;
```

#### 2. metainstall.sh - Installation Hook

Runs during module installation, after files are extracted. This script is **sourced** (not executed).

Available variables: `MODPATH`, `TMPDIR`, `ZIPFILE`, `ARCH`, `API`, `IS64BIT`, `KSU`, `KSU_VER`, `KSU_VER_CODE`, `BOOTMODE`, etc.

Available functions: `ui_print`, `abort`, `set_perm`, `set_perm_recursive`, `install_module`

#### 3. metauninstall.sh - Cleanup Hook

Runs during module uninstallation, before the module directory is removed. Receives `MODULE_ID` as environment variable.

### Boot Execution Order (CRITICAL REFERENCE)

```
post-fs-data stage:
  1. Common post-fs-data.d scripts execute
  2. Prune modules, restorecon, load sepolicy.rule
  3. Metamodule's post-fs-data.sh executes (if exists)
  4. Regular modules' post-fs-data.sh execute
  5. Load system.prop
  6. Metamodule's metamount.sh executes
     └─> Mounts all modules systemlessly
  7. post-mount.d stage runs
     - Common post-mount.d scripts
     - Metamodule's post-mount.sh (if exists)
     - Regular modules' post-mount.sh

service stage:
  1. Common service.d scripts execute
  2. Metamodule's service.sh executes (if exists)
  3. Regular modules' service.sh execute

boot-completed stage:
  1. Common boot-completed.d scripts execute
  2. Metamodule's boot-completed.sh executes (if exists)
  3. Regular modules' boot-completed.sh execute
```

### Symlink Mechanism

When a metamodule is installed, KernelSU creates:
```sh
/data/adb/metamodule -> /data/adb/modules/<metamodule_id>
```

### meta-overlayfs Reference Implementation

Uses dual-directory architecture:
1. **Metadata directory**: `/data/adb/modules/` - Contains module.prop, disable, skip_mount markers
2. **Content directory**: `/data/adb/metamodule/mnt/` - Contains actual module files in ext4 image (`modules.img`)

---

## 4. KernelSU: Module Guide (Full)

**Source:** https://kernelsu.org/guide/module.html

### Module Directory Structure

```
/data/adb/modules
├── $MODID                  <--- Named with the ID of the module
│   │
│   │      *** Module Identity ***
│   ├── module.prop         <--- Module metadata
│   │
│   │      *** Main Contents ***
│   ├── system              <--- Mounted if skip_mount does not exist
│   │
│   │      *** Status Flags ***
│   ├── skip_mount          <--- If exists, system folder NOT mounted
│   ├── disable             <--- If exists, module disabled
│   ├── remove              <--- If exists, module removed next reboot
│   │
│   │      *** Optional Files ***
│   ├── post-fs-data.sh     <--- Executed in post-fs-data
│   ├── post-mount.sh       <--- Executed in post-mount
│   ├── service.sh          <--- Executed in late_start service
│   ├── boot-completed.sh   <--- Executed on boot completed
│   ├── uninstall.sh        <--- Executed when KernelSU removes module
│   ├── action.sh           <--- Executed when user clicks Action button
│   ├── system.prop         <--- Loaded as system properties by resetprop
│   ├── sepolicy.rule       <--- Additional custom sepolicy rules
│   │
│   │      *** Auto Generated, DO NOT MANUALLY CREATE OR MODIFY ***
│   ├── vendor              <--- Symlink to $MODID/system/vendor
│   ├── product             <--- Symlink to $MODID/system/product
│   ├── system_ext          <--- Symlink to $MODID/system/system_ext
```

### module.prop Format

```
id=<string>
name=<string>
version=<string>
versionCode=<int>
author=<string>
description=<string>
updateJson=<url> (optional)
actionIcon=<path> (optional)
webuiIcon=<path> (optional)
```

- `id` must match: `^[a-zA-Z][a-zA-Z0-9._-]+$`
- `versionCode` must be an integer
- Use `UNIX (LF)` line break type
- `actionIcon` and `webuiIcon` are relative to module root (e.g., `actionIcon=icon/icon.png`)
- `description` can be dynamically overridden via module configuration system

### Shell Scripts

In all scripts, use `MODDIR=${0%/*}` to get module base directory path. Do NOT hardcode paths.

Use `KSU` environment variable to determine if running in KernelSU (set to `true`).

### System Directory - Deleting Files

Create a same-named file with `mknod filename c 0 0` to delete:

```sh
REMOVE="
/system/app/YouTube
/system/app/Bloatware
"
```

### System Directory - Replacing Directories

Use `setfattr -n trusted.overlay.opaque -v y <TARGET>`:

```sh
REPLACE="
/system/app/YouTube
/system/app/Bloatware
"
```

### Module Installer (customize.sh)

The `customize.sh` script is **sourced** (not executed) after files are extracted.

Declare `SKIPUNZIP=1` to skip all default installation steps.

#### Available Variables

| Variable | Description |
|----------|-------------|
| `KSU` | bool, always `true` in KernelSU |
| `KSU_VER` | string, version (e.g. `v0.4.0`) |
| `KSU_VER_CODE` | int, version code (e.g. `10672`) |
| `KSU_KERNEL_VER_CODE` | int, kernel space version code |
| `BOOTMODE` | bool, always `true` |
| `MODPATH` | path, module install directory |
| `TMPDIR` | path, temporary storage |
| `ZIPFILE` | path, installation ZIP |
| `ARCH` | string, `arm`, `arm64`, `x86`, or `x64` |
| `IS64BIT` | bool |
| `API` | int, Android API level |

**WARNING:** `MAGISK_VER_CODE` is always `25200`, `MAGISK_VER` is always `v25.2`. Don't use these to detect KernelSU.

#### Available Functions

```
ui_print <msg>        - Print to console (avoid 'echo')
abort <msg>           - Print error and terminate (avoid 'exit')
set_perm <target> <owner> <group> <permission> [context]
set_perm_recursive <directory> <owner> <group> <dirperm> <fileperm> [context]
```

Default context: `u:object_r:system_file:s0`

### Boot Scripts - Stages

| Stage | Mode | Blocking | When |
|-------|------|----------|------|
| post-fs-data.sh | post-fs-data | BLOCKING (10s timeout) | Before modules mounted, before Zygote |
| post-mount.sh | post-mount | - | After OverlayFS mounted |
| service.sh | late_start service | NON-BLOCKING | Parallel with boot |
| boot-completed.sh | boot-completed | - | After ACTION_BOOT_COMPLETED |

**WARNING:** Using `setprop` in post-fs-data will deadlock! Use `resetprop -n <prop_name> <prop_value>` instead.

### Full Boot Process Reference

```
0. Bootloader (nothing on screen)
   load patched boot.img

1. kernel exec init (OEM logo on screen):
   - GKI mode: stock init
   - LKM mode: exec ksuinit, insmod kernelsu.ko, exec stock init
   mount /dev, /dev/pts, /proc, /sys, etc.
   property-init -> read default props
   read init.rc
   early-init -> init -> late_init
   early-fs
     start vold
   fs
     mount /vendor, /system, /persist, etc.
   post-fs-data
     *safe mode check
     *execute general scripts in post-fs-data.d/
     *load sepolicy.rule
     *execute metamodule's post-fs-data.sh (if exists)
     *execute module scripts post-fs-data.sh
       **(Zygisk)./bin/zygisk-ptrace64 monitor
     *(pre)load system.prop (same as resetprop -n)
     *execute metamodule's metamount.sh (mounts all modules)
     *execute general scripts in post-mount.d/
     *execute metamodule's post-mount.sh (if exists)
     *execute module scripts post-mount.sh
   zygote-start
   load_all_props_action
     *execute resetprop (actual set props)
   ... -> boot
     class_start core (logd, console, vold, etc.)
     class_start main (adb, netd, zygote, etc.)

2. kernel2user init (ROM animation)
   *execute general scripts in service.d/
   *execute metamodule's service.sh (if exists)
   *execute module scripts service.sh
   *set props for resetprop without -p option
     **(Zygisk) hook zygote
     **(Zygisk) mount zygisksu/module.prop
   start system apps (autostart)
   ...
   boot complete (broadcast ACTION_BOOT_COMPLETED)
   *execute general scripts in boot-completed.d/
   *execute metamodule's boot-completed.sh (if exists)
   *execute module scripts boot-completed.sh

3. User operable (lock screen)
   input password to decrypt /data/data
   *actual set props for resetprop with -p option
   start user apps (autostart)
```

---

## 5. KernelSU: Module Configuration System

**Source:** https://kernelsu.org/guide/module-config.html

KernelSU provides a built-in configuration system storing persistent or temporary key-value settings at `/data/adb/ksu/module_configs/<module_id>/`.

### Configuration Types

- **Persist Config** (`persist.config`): Survives reboots, persists until deleted or module uninstalled
- **Temp Config** (`tmp.config`): Automatically cleared during post-fs-data stage on every boot

When reading, temporary values take priority over persistent values for the same key.

### CLI Usage

```bash
# Get a configuration value
value=$(ksud module config get my_setting)

# Set a persistent configuration value
ksud module config set my_setting "some value"

# Set a temporary configuration value (cleared on reboot)
ksud module config set --temp runtime_state "active"

# Set value from stdin (multiline/complex data)
ksud module config set my_key <<EOF
multiline
text value
EOF

# Pipe from command
echo "value" | ksud module config set my_key

# Explicit stdin flag
cat file.json | ksud module config set json_data --stdin

# List all configuration entries (merged persist + temp)
ksud module config list

# Delete a configuration entry
ksud module config delete my_setting

# Delete a temporary configuration entry
ksud module config delete --temp runtime_state

# Clear all persistent configurations
ksud module config clear

# Clear all temporary configurations
ksud module config clear --temp
```

### Validation Limits

| Limit | Value |
|-------|-------|
| Maximum key length | 256 bytes |
| Maximum value length | 1MB (1048576 bytes) |
| Maximum config entries | 32 per module |
| Key format | `^[a-zA-Z][a-zA-Z0-9._-]+$` (min 2 chars) |
| Value format | Any UTF-8 (binary format with length prefix) |

### Lifecycle

- **On boot**: All temporary configurations cleared during post-fs-data
- **On module uninstall**: All configurations removed automatically
- Stored in binary format with magic number `0x4b53554d` ("KSUM")

### Advanced: Override Module Description

```bash
ksud module config set override.description "Custom description shown in the manager"
```

### Advanced: Managed Features

```bash
# Declare module manages SU compatibility
ksud module config set manage.su_compat true

# Declare module manages kernel unmount
ksud module config set manage.kernel_umount false

# Remove feature management
ksud module config delete manage.su_compat
```

Supported features: `su_compat`, `kernel_umount`

---

## 6. KernelSU: Module WebUI

**Source:** https://kernelsu.org/guide/module-webui.html

### webroot Directory

Web resources go in `webroot/` subdirectory with mandatory `index.html`:

```
module/
├── module.prop
└── webroot/
    └── index.html
```

KernelSU automatically sets permissions and SELinux context for this directory. Do NOT set permissions yourself.

### JavaScript API

KernelSU provides a JavaScript library published on [npm](https://www.npmjs.com/package/kernelsu):

```javascript
import { exec } from 'kernelsu';
const { errno, stdout } = exec("getprop ro.product.model");
```

### Tips

1. `localStorage` works but is lost if manager app is uninstalled. For persistent storage, manually save to a specific directory.
2. For simple pages, [parceljs](https://parceljs.org/) is recommended for packaging (zero config).

---

## 7. KernelSU: App Profile

**Source:** https://kernelsu.org/guide/app-profile.html

### Root Profile

For apps granted root permissions, customizes `su` behavior:

- **UID, GID, Groups**: Customize process identity after `su`. Android UIDs: `0`=root, `1000`=system, `2000`=ADB shell, `10000-19999`=ordinary apps.
- **Capabilities**: Linux capabilities for privilege separation. Can restrict root to specific operations (e.g., `CAP_DAC_READ_SEARCH` for file reading).
- **SELinux**: Customize SELinux context of root process after `su`. Can switch from unrestricted `u:r:su:s0` to custom domain.

Root Profile is enforced in the kernel, not reliant on voluntary behavior of root apps.

### Escalation Warning

If Root Profile sets UID to `2000` (ADB shell) and ADB shell has root access, app can `su` twice to get full root. Use UID `1000` (system) instead.

### Non-Root Profile: Umount Modules

KernelSU can unload modules mounted in specific apps. Two approaches:
1. **Whitelist**: "Umount modules by default" ON, individually disable for apps needing modules
2. **Blacklist**: "Umount modules by default" OFF, individually enable for sensitive apps

On kernel 5.10+, kernel performs unmounting natively. Below 5.10, requires `path_umount` backport.

---

## 8. KernelSU: Hidden Features

**Source:** https://kernelsu.org/guide/hidden-features.html

### .ksurc

By default, `/system/bin/sh` loads `/system/etc/mkshrc`.

You can make `su` load a customized rc file by creating `/data/adb/ksu/.ksurc`.

---

## 9. KernelSU: FAQ

**Source:** https://kernelsu.org/guide/faq.html

### Key Points for Module Developers

- **Supported devices**: Android with unlocked bootloader, GKI Linux Kernels 5.10+ (Android 12+ out-of-box)
- **Module support**: Yes, most Magisk modules work. `/system` modification requires metamodule (e.g., `meta-overlayfs`).
- **Xposed**: Yes, via LSPosed + ZygiskNext
- **Zygisk**: No built-in support, use ZygiskNext module
- **Magisk compatibility**: Module system conflicts with Magisk's magic mount. If any KernelSU module enabled, Magisk stops working. But `su` only usage works alongside Magisk.
- **Non-GKI**: Possible but requires kernel source and self-compilation. KernelSU backported to kernel 4.14.
- **Modules not working**: Install a metamodule (meta-overlayfs) for `/system` modification support.
- **Make /system RW**: Not recommended. Use module guide for systemless modification. If insisted, use magisk_overlayfs.
- **Modify hosts**: Use systemless-hosts module.

---

## 10. KernelSU: Rescue from Bootloop

**Source:** https://kernelsu.org/guide/rescue-from-bootloop.html

### Boot Brick Recovery

Flash the stock boot image to recover. Always backup stock boot.img before flashing.

### Module Brick Recovery

#### AB Update Mechanism

KernelSU uses Android's AB update mechanism. Installing/updating modules creates a new update image. If boot fails, system rolls back automatically on forced reboot. Previously updated modules are automatically disabled.

**Simple fix:** Force a reboot (hold power 10+ seconds).

#### Safe Mode (Volume Down)

Press Volume down key continuously more than three times after first boot screen.

Two ways to enter:
1. **System built-in Safe Mode**: Long-press Volume down (some systems like HyperOS)
2. **KernelSU built-in Safe Mode**: Press Volume down key 3+ times after first screen

All modules disabled in Safe Mode. Can uninstall problematic modules from manager.

Safe Mode is implemented in the kernel (no interception possible).

---

## 11. KernelSU: How to Build

**Source:** https://kernelsu.org/guide/how-to-build.html

> WARNING: This document is for archival reference only and is no longer maintained. Since KernelSU v3.0, dropped official support for GKI image mode. Recommended to use `Ylarod/ddk` to build LKM.

### Adding KernelSU to Kernel

In kernel source root directory:

```sh
# Latest tag (stable)
curl -LSs "https://raw.githubusercontent.com/tiann/KernelSU/main/kernel/setup.sh" | bash -

# main branch (dev)
curl -LSs "https://raw.githubusercontent.com/tiann/KernelSU/main/kernel/setup.sh" | bash -s main

# Select tag
curl -LSs "https://raw.githubusercontent.com/tiann/KernelSU/main/kernel/setup.sh" | bash -s v0.5.2
```

---

## 12. KernelSU: Non-GKI Integration

**Source:** https://kernelsu.org/guide/how-to-integrate-for-non-gki.html

> WARNING: Archival reference only. Since KernelSU v1.0, dropped official support for non-GKI devices.

### Integration Methods

1. **kprobe** (preferred): Add KernelSU to source, enable `CONFIG_KPROBES=y`, `CONFIG_HAVE_KPROBES=y`, `CONFIG_KPROBE_EVENTS=y`
2. **Manual modification**: Patch four kernel functions: `do_faccessat`, `do_execveat_common`, `vfs_read`, `vfs_statx`

### Safe Mode Support

Modify `input_handle_event` in `drivers/input/input.c` to add KernelSU Safe Mode hook. Strongly recommended.

### path_umount Backport

For pre-5.9 kernels, backport `path_umount` to `fs/namespace.c` for "Umount module" feature.

---

## 13. APatch: What is APatch

**Source:** https://apatch.dev/what-is-apatch.html

APatch is a kernel-based root solution for Android devices that works in kernel mode and grants root privileges to userspace apps directly in kernel space.

### Features

- Compatible with most Android devices (not limited to GKI kernel)
- Supports APModule (APM) - similar to Magisk modules
- Supports KPModule (KPM) - inject code into kernel via `inline-hook` and `syscall-table-hook`
- APatch relies on KernelPatch
- UI and APModule source derived from KernelSU

---

## 14. APatch: APModule Development Guide

**Source:** https://apatch.dev/apm-guide.html

APatch module implementation is copied and modified from KernelSU. The mechanism is almost the same as Magisk.

### Key Differences from KernelSU/Magisk

| Feature | Magisk | KernelSU | APatch |
|---------|--------|----------|--------|
| BusyBox path | `/data/adb/magisk/busybox` | `/data/adb/ksu/bin/busybox` | `/data/adb/ap/bin/busybox` |
| Environment variable | `MAGISK` | `KSU=true` | `APATCH=true` |
| MAGISK_VER_CODE emulation | native | `25200` | `27000` |
| MAGISK_VER emulation | native | `v25.2` | `v27.0` |
| Mounting mechanism | Magic mount (bind mount) | Metamodule (pluggable) | OverlayFS (kernel) |
| Zygisk | Built-in | Not built-in (ZygiskNext) | Not built-in (ZygiskNext) |

### APM Module Structure

Identical to KernelSU module structure:

```
/data/adb/modules/$MODID/
├── module.prop
├── system/
├── skip_mount
├── disable
├── remove
├── post-fs-data.sh
├── post-mount.sh
├── service.sh
├── boot-completed.sh
├── uninstall.sh
├── action.sh
├── system.prop
├── sepolicy.rule
├── vendor -> $MODID/system/vendor
├── product -> $MODID/system/product
└── system_ext -> $MODID/system/system_ext
```

### module.prop Format (APatch)

```
id=<string>
name=<string>
version=<string>
versionCode=<int>
author=<string>
description=<string>
```

Note: APatch does NOT list `updateJson`, `actionIcon`, or `webuiIcon` in its module.prop spec (KernelSU-specific additions).

### customize.sh Variables (APatch-specific)

| Variable | Description |
|----------|-------------|
| `KERNELPATCH` | bool, always `true` |
| `KERNEL_VERSION` | hex, kernel version (e.g. `50a01` = 5.10.1) |
| `KERNELPATCH_VERSION` | hex, KernelPatch version (e.g. `a05` = 0.10.5) |
| `SUPERKEY` | string, for calling kpatch or supercall |
| `APATCH` | bool, always `true` |
| `APATCH_VER_CODE` | int, APatch version number |
| `APATCH_VER` | string, APatch version name |
| `BOOTMODE` | bool, always `true` |
| `MODPATH` | path, module installation directory |
| `TMPDIR` | path, temporary storage |
| `ZIPFILE` | path, module installation ZIP |
| `ARCH` | string, `arm64` only |
| `IS64BIT` | bool |
| `API` | int, Android API level |

### File Deletion (Same as KernelSU)

```sh
REMOVE="
/system/app/YouTube
/system/app/Bloatware
"
```

Uses `mknod $MODPATH/system/app/YouTube c 0 0` (OverlayFS whiteout).

### Directory Replacement (Same as KernelSU)

```sh
REPLACE="
/system/app/YouTube
/system/app/Bloatware
"
```

Uses `setfattr -n trusted.overlay.opaque -v y` on the target directory.

### Boot Scripts (APatch)

Same stages as KernelSU:
- `post-fs-data.sh` - BLOCKING (10s timeout), before modules mounted, before Zygote
- `post-mount.sh` - After OverlayFS mounted
- `service.sh` - NON-BLOCKING, parallel with boot
- `boot-completed.sh` - After boot completed

General scripts directories: `/data/adb/post-fs-data.d`, `/data/adb/service.d`, `/data/adb/post-mount.d`, `/data/adb/boot-completed.d`

### SELinux Handling

APatch directly uses `magiskpolicy` for SELinux support. KernelPatch bypasses SELinux via hook rather than modifying context.

---

## 15. APatch: MetaModules

**Source:** https://apatch.dev/meta-module.html

APatch has adopted the metamodule system from KernelSU. After installing a metamodule, reboot is required before installing other modules.

### Available Metamodules

| Metamodule | Repository |
|-----------|------------|
| overlayfs | https://github.com/KernelSU-Modules-Repo/meta-overlayfs |
| mountify | https://github.com/backslashxx/mountify |
| magic mount | https://github.com/7a72/meta-magic_mount |
| magic mount rs | https://github.com/Tools-cx-app/meta-magic_mount |
| hybrid mount | https://github.com/YuzakiKokuban/meta-hybrid_mount |

---

## 16. APatch: Installation

**Source:** https://apatch.dev/install.html

### Requirements

- Unlocked bootloader
- Kernel config: `CONFIG_KALLSYMS=y` (and ideally `CONFIG_KALLSYMS_ALL=y`)
- **ARM64 architecture only**
- **Android kernel versions 3.18 - 6.6**

### Patching Methods

1. **Automatic**: APatch Manager patches boot.img directly. Requires SuperKey (8-63 chars, numbers + letters only, no special characters).
2. **Manual**: Using kptools CLI + magiskboot

APatch always patches `boot.img` only (never `init_boot` or other partitions).

### Flashing

- **fastboot** (recommended): `fastboot flash boot boot.img`
- **Direct flash**: Rename APatch Manager `.apk` to `.zip`, flash via TWRP Recovery

### Uninstall

Flash stock `boot.img` via fastboot. Never use `init_boot`.

---

## 17. APatch: FAQ

**Source:** https://apatch.dev/faq.html

### Key Differences Summary

| Aspect | Magisk | KernelSU | APatch |
|--------|--------|----------|--------|
| Patching target | ramdisk | kernel | kernel |
| Kernel source needed | No | Yes (for building) | No (only boot.img) |
| SELinux | Modified | Modified | Bypassed via hook (optionally unmodified) |
| Rooting mechanism | Userspace | Kernel-space | Kernel-space |

### WebUI

APatch WebUI implementation is completely the same as KernelSU. WebUI designed for KernelSU modules runs perfectly in APatch. Introduced in APatch version 10568.

### Zygisk Support

APatch doesn't have built-in Zygisk. Use one of:
- [ZygiskNext](https://github.com/Dr-TSNG/ZygiskNext) (proprietary after v0.9.1.1, APatch support from v1.0.3)
- [ReZygisk](https://github.com/PerformanC/ReZygisk) (free, early development)
- [NeoZygisk](https://github.com/JingMatrix/NeoZygisk) (free, minimal API)

### Important: module.img Dropped

Since APatch commit b843480 (version 10977+), `module.img` support was dropped. All previously installed APModules are LOST after updating. Reinstall required.

---

## 18. APatch: Rescue from Bootloop

**Source:** https://apatch.dev/rescue-bootloop.html

### Safe Mode Activation

**Volume down method:** After holding power button until screen turns on, continuously press and release Volume down until first screen lights up. APatch will revert any post-fs changes if Safe Mode signal detected before `sys.boot_completed=1`.

**Recovery Safe Mode:** Some ROMs (MIUI/HyperOS) can trigger Safe Mode from Recovery, which also triggers APatch's Safe Mode.

All modules disabled in Safe Mode. Can uninstall problematic modules from APatch Manager.

### Known Issues

- Safe Mode may not fully revert post-fs modifications -- force reboot resolves this.
- Android's native Safe Mode disables all non-system apps including APatch Manager. Reboot again to exit Android Safe Mode while keeping APatch Safe Mode active.

---

## 19. APatch: KernelPatch Module (KPM) Guide

**Source:** https://apatch.dev/kpm-usage-guide.html

KPMs run code in kernel space, similar to Loadable Kernel Modules (LKM). They can perform operations APModules cannot (e.g., partition image protection).

### Usage Methods

1. **Embed**: Merged into patched kernel in boot.img, loaded at `pre-kernel-init`
2. **Load**: Loaded immediately into running kernel (lost after reboot)
3. **Install**: Not yet implemented (planned for `/data/adb/kpmodules`)

KPMs have `.kpm` file suffix.

---

## 20. Cross-Manager Comparison Table

### Module Format Compatibility

| Feature | Magisk | KernelSU | APatch |
|---------|--------|----------|--------|
| Module directory | `/data/adb/modules` | `/data/adb/modules` | `/data/adb/modules` |
| Module format | ZIP | ZIP | ZIP |
| module.prop | Yes | Yes (+ updateJson, actionIcon, webuiIcon) | Yes |
| system/ directory | Yes (magic mount) | Yes (metamodule required) | Yes (OverlayFS) |
| system.prop | Yes | Yes | Yes |
| sepolicy.rule | Yes | Yes | Yes (uses magiskpolicy) |
| post-fs-data.sh | Yes | Yes | Yes |
| service.sh | Yes | Yes | Yes |
| boot-completed.sh | No | Yes | Yes |
| post-mount.sh | No | Yes | Yes |
| uninstall.sh | Yes | Yes | Yes |
| action.sh | Yes | Yes | Yes |
| customize.sh | Yes | Yes | Yes |
| WebUI (webroot/) | No (uses native) | Yes | Yes (same as KernelSU) |
| skip_mount | Yes | Yes | Yes |
| disable | Yes | Yes | Yes |
| remove | Yes | Yes | Yes |

### File Deletion Methods

| Method | Magisk | KernelSU | APatch |
|--------|--------|----------|--------|
| `.replace` file | Yes | NO | NO |
| `mknod filename c 0 0` | No | Yes | Yes |
| `REMOVE` variable | No | Yes | Yes |
| `REPLACE` variable | No | Yes (setfattr opaque) | Yes (setfattr opaque) |

### Environment Variables Available in Scripts

| Variable | Magisk | KernelSU | APatch |
|----------|--------|----------|--------|
| `MAGISK` | Yes | No | No |
| `KSU` | No | `true` | No |
| `APATCH` | No | No | `true` |
| `KERNELPATCH` | No | No | `true` |
| `MAGISK_VER_CODE` | native | `25200` | `27000` |
| `MAGISK_VER` | native | `v25.2` | `v27.0` |
| `MODPATH` | Yes | Yes | Yes |
| `TMPDIR` | Yes | Yes | Yes |
| `ZIPFILE` | Yes | Yes | Yes |
| `ARCH` | Yes | Yes | `arm64` only |
| `API` | Yes | Yes | Yes |
| `IS64BIT` | Yes | Yes | Yes |
| `BOOTMODE` | Yes | `true` | `true` |
| `KSU_VER` | No | Yes | No |
| `KSU_VER_CODE` | No | Yes | No |
| `KSU_KERNEL_VER_CODE` | No | Yes | No |
| `APATCH_VER_CODE` | No | No | Yes |
| `APATCH_VER` | No | No | Yes |
| `SUPERKEY` | No | No | Yes |
| `KERNEL_VERSION` | No | No | Yes (hex) |
| `KERNELPATCH_VERSION` | No | No | Yes (hex) |

### BusyBox Locations

| Manager | BusyBox Path |
|---------|-------------|
| Magisk | `/data/adb/magisk/busybox` |
| KernelSU | `/data/adb/ksu/bin/busybox` |
| APatch | `/data/adb/ap/bin/busybox` |

### Boot Stages

| Stage | Magisk | KernelSU | APatch |
|-------|--------|----------|--------|
| post-fs-data | Yes (BLOCKING) | Yes (BLOCKING, 10s) | Yes (BLOCKING, 10s) |
| post-mount | No | Yes | Yes |
| late_start service | Yes | Yes | Yes |
| boot-completed | No | Yes | Yes |

### General Script Directories

| Directory | Magisk | KernelSU | APatch |
|-----------|--------|----------|--------|
| `/data/adb/post-fs-data.d/` | Yes | Yes | Yes |
| `/data/adb/service.d/` | Yes | Yes | Yes |
| `/data/adb/post-mount.d/` | No | Yes | Yes |
| `/data/adb/boot-completed.d/` | No | Yes | Yes |

### Safe Mode / Bootloop Recovery

| Feature | Magisk | KernelSU | APatch |
|---------|--------|----------|--------|
| Volume down Safe Mode | Yes | Yes (3+ presses) | Yes (continuous press) |
| AB update rollback | No | Yes (auto on boot fail) | No |
| Recovery Safe Mode | N/A | Yes (triggers KSU safe mode) | Yes (triggers APatch safe mode) |
| Built-in bootloop protection | Magisk safe mode | Kernel-level (3-strike) | Kernel-level |

### Root Manager Detection in Scripts

```sh
# Detect which root manager is active
detect_root_manager() {
    if [ "$KSU" = "true" ]; then
        echo "kernelsu"
    elif [ "$APATCH" = "true" ]; then
        echo "apatch"
    elif [ -n "$MAGISK_VER_CODE" ] && [ "$MAGISK_VER_CODE" != "25200" ] && [ "$MAGISK_VER_CODE" != "27000" ]; then
        echo "magisk"
    elif [ -d "/data/adb/magisk" ]; then
        echo "magisk"
    else
        echo "unknown"
    fi
}
```

### Mounting Architecture

```
Magisk:     core built-in magic mount (bind mounts)
KernelSU:   metamodule system (pluggable, default: meta-overlayfs)
APatch:     kernel OverlayFS (built-in since it patches kernel directly)
            + metamodule system (adopted from KernelSU)
```

### Key Scalpel Implications

1. **Module directory is universal**: `/data/adb/modules` across all three managers.
2. **File deletion**: Use `mknod c 0 0` for KernelSU/APatch; `.replace` for Magisk only. Scalpel's whiteout mode must handle both.
3. **Boot stages**: KernelSU/APatch have `boot-completed.sh` and `post-mount.sh` that Magisk lacks. Scalpel should use these where available.
4. **Metamodule dependency**: On KernelSU, `/system` modifications only work if user has a metamodule installed. Scalpel's `detect.sh` should check for this.
5. **Safe Mode**: All three have volume-down safe mode. KernelSU has AB rollback. Scalpel's bootloop protection is additional safety.
6. **SELinux**: Magisk and KernelSU modify SELinux; APatch bypasses via hook. `sepolicy.rule` works across all three.
7. **WebUI**: KernelSU and APatch share the same WebUI system (webroot/ + kernelsu npm package). Magisk uses native Android UI.
8. **MAGISK_VER_CODE spoofing**: KernelSU reports `25200`, APatch reports `27000`. Do NOT use this for detection.
9. **`ARCH` limitation**: APatch is ARM64 only. KernelSU/Magisk support arm, arm64, x86, x64.
10. **Module config**: KernelSU has `ksud module config` built-in key-value store. Magisk/APatch do not have this -- use file-based config.
