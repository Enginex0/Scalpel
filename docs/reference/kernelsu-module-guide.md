# KernelSU Module Guide — Complete Reference

> **Source:** https://kernelsu.org/guide/module.html
> **Related pages also included:**
> - https://kernelsu.org/guide/difference-with-magisk.html
> - https://kernelsu.org/guide/module-webui.html
> - https://kernelsu.org/guide/metamodule.html
> - https://kernelsu.org/guide/module-config.html
> **Fetched:** 2026-02-01

---

## Table of Contents

1. [Module Guide](#module-guide)
2. [WebUI](#webui)
3. [Module Configuration](#module-configuration)
4. [BusyBox](#busybox)
5. [KernelSU Modules — Directory Structure](#kernelsu-modules)
6. [module.prop](#moduleprop)
7. [Shell Scripts](#shell-scripts)
8. [system Directory](#system-directory)
9. [system.prop](#systemprop)
10. [sepolicy.rule](#sepolicyrule)
11. [Module Installer](#module-installer)
12. [Customization (customize.sh)](#customization)
13. [Variables Available in customize.sh](#variables)
14. [Functions Available in customize.sh](#functions)
15. [Boot Scripts](#boot-scripts)
16. [Boot Scripts Process Explanation](#boot-scripts-process-explanation)
17. [Difference with Magisk](#difference-with-magisk)
18. [Module WebUI](#module-webui-detailed)
19. [Metamodule Guide](#metamodule-guide)
20. [Module Configuration System](#module-configuration-system)

---

## Module Guide

KernelSU provides a module mechanism that achieves the effect of modifying the system directory while maintaining the integrity of the system partition. This mechanism is commonly known as "systemless".

The module mechanism of KernelSU is almost the same as that of Magisk. If you're familiar with Magisk module development, developing KernelSU modules is very similar. You can skip the introduction of modules below and just read [Difference with Magisk](#difference-with-magisk).

> **METAMODULE ONLY NEEDED FOR SYSTEM FILE MODIFICATION**
>
> KernelSU uses a metamodule architecture for mounting the `system` directory. **Only if your module needs to modify `/system` files** (via the `system` directory) do you need to install a metamodule (such as [meta-overlayfs](https://github.com/tiann/KernelSU/releases)). Other module features like scripts, sepolicy rules, and system.prop work without a metamodule.

---

## WebUI

KernelSU's modules support displaying interfaces and interacting with users. For more details, refer to the [Module WebUI section](#module-webui-detailed).

---

## Module Configuration

KernelSU provides a built-in configuration system that allows modules to store persistent or temporary key-value settings. For more details, refer to the [Module Configuration System section](#module-configuration-system).

---

## BusyBox

KernelSU ships with a feature-complete BusyBox binary (including full SELinux support). The executable is located at `/data/adb/ksu/bin/busybox`. KernelSU's BusyBox supports runtime toggle-able "ASH Standalone Shell Mode". What this Standalone Mode means is that when running in the `ash` shell of BusyBox, every single command will directly use the applet within BusyBox, regardless of what is set as `PATH`. For example, commands like `ls`, `rm`, `chmod` will **NOT** use what is in `PATH` (in the case of Android by default it will be `/system/bin/ls`, `/system/bin/rm`, and `/system/bin/chmod` respectively), but will instead directly call internal BusyBox applets. This makes sure that scripts always run in a predictable environment and always have the full suite of commands no matter which Android version it is running on. To force a command *not* to use BusyBox, you have to call the executable with full paths.

Every single shell script running in the context of KernelSU will be executed in BusyBox's `ash` shell with Standalone Mode enabled. For what is relevant to 3rd party developers, this includes all boot scripts and module installation scripts.

For those who want to use this Standalone Mode feature outside of KernelSU, there are 2 ways to enable it:

1. Set environment variable `ASH_STANDALONE` to `1`
   Example: `ASH_STANDALONE=1 /data/adb/ksu/bin/busybox sh <script>`
2. Toggle with command-line options:
   `/data/adb/ksu/bin/busybox sh -o standalone <script>`

To make sure all subsequent `sh` shell executed also runs in Standalone Mode, option 1 is the preferred method (and this is what KernelSU and the KernelSU manager use internally) as environment variables are inherited down to child processes.

> **DIFFERENCE WITH MAGISK**
>
> KernelSU's BusyBox is now using the binary file compiled directly from the Magisk project. **Thanks to Magisk!** Therefore, you don't need to worry about compatibility issues between BusyBox scripts in Magisk and KernelSU, as they're exactly the same!

---

## KernelSU Modules

A KernelSU module is a folder placed in `/data/adb/modules` with the structure below:

```
/data/adb/modules
├── .
├── .
|
├── $MODID                  <--- The folder is named with the ID of the module
│   │
│   │      *** Module Identity ***
│   │
│   ├── module.prop         <--- This file stores the metadata of the module
│   │
│   │      *** Main Contents ***
│   │
│   ├── system              <--- This folder will be mounted if skip_mount does not exist
│   │   ├── ...
│   │   ├── ...
│   │   └── ...
│   │
│   │      *** Status Flags ***
│   │
│   ├── skip_mount          <--- If exists, KernelSU will NOT mount your system folder
│   ├── disable             <--- If exists, the module will be disabled
│   ├── remove              <--- If exists, the module will be removed next reboot
│   │
│   │      *** Optional Files ***
│   │
│   ├── post-fs-data.sh     <--- This script will be executed in post-fs-data
│   ├── post-mount.sh       <--- This script will be executed in post-mount
│   ├── service.sh          <--- This script will be executed in late_start service
│   ├── boot-completed.sh   <--- This script will be executed on boot completed
│   ├── uninstall.sh        <--- This script will be executed when KernelSU removes your module
│   ├── action.sh           <--- This script will be executed when user click the Action button in KernelSU app
│   ├── system.prop         <--- Properties in this file will be loaded as system properties by resetprop
│   ├── sepolicy.rule       <--- Additional custom sepolicy rules
│   │
│   │      *** Auto Generated, DO NOT MANUALLY CREATE OR MODIFY ***
│   │
│   ├── vendor              <--- A symlink to $MODID/system/vendor
│   ├── product             <--- A symlink to $MODID/system/product
│   ├── system_ext          <--- A symlink to $MODID/system/system_ext
│   │
│   │      *** Any additional files / folders are allowed ***
│   │
│   ├── ...
│   └── ...
|
├── another_module
│   ├── .
│   └── .
├── .
├── .
```

> **DIFFERENCE WITH MAGISK**
>
> KernelSU doesn't have built-in support for Zygisk, so there is no content related to Zygisk in the module. However, you can use [ZygiskNext](https://github.com/Dr-TSNG/ZygiskNext) to support Zygisk modules. In this case, the content of the Zygisk module is identical to that supported by Magisk.

---

## module.prop

`module.prop` is a configuration file for a module. In KernelSU, if a module doesn't contain this file, it won't be recognized as a module. The format of this file is as follows:

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

- `id` has to match this regular expression: `^[a-zA-Z][a-zA-Z0-9._-]+$`
  Example: `a_module` (valid), `a.module` (valid), `module-101` (valid), `a module` (invalid), `1_module` (invalid), `-a-module` (invalid)
  This is the **unique identifier** of your module. You should not change it once published.
- `versionCode` has to be an **integer**. This is used to compare versions.
- Others that were not mentioned above can be any **single line** string.
- Make sure to use the `UNIX (LF)` line break type and not the `Windows (CR+LF)` or `Macintosh (CR)`.
- `actionIcon` and `webuiIcon` are optional icon paths used as the default icons for the module action shortcut and WebUI shortcut in the Manager. These paths must be relative to the module root directory. For example, `actionIcon=icon/icon.png` will be resolved as `<MODDIR>/icon/icon.png`.

> **DYNAMIC DESCRIPTION**
>
> The `description` field can be dynamically overridden at runtime using the module configuration system. See [Overriding Module Description](#overriding-module-description) for details.

---

## Shell Scripts

Please read the [Boot Scripts](#boot-scripts) section to understand the difference between `post-fs-data.sh` and `service.sh`. For most module developers, `service.sh` should be good enough if you just need to run a boot script, if you need to run the script after boot completed, please use `boot-completed.sh`. If you want to do something after mounting OverlayFS, please use `post-mount.sh`.

In all scripts of your module, please use `MODDIR=${0%/*}` to get your module's base directory path; do **NOT** hardcode your module path in scripts.

> **DIFFERENCE WITH MAGISK**
>
> You can use the environment variable `KSU` to determine if a script is running in KernelSU or Magisk. If running in KernelSU, this value will be set to `true`.

---

## system Directory

The contents of this directory will be overlaid on top of the system's `/system` partition after the system is booted. This means that:

> **METAMODULE REQUIREMENT**
>
> The `system` directory is only mounted if you have a metamodule installed that provides mounting functionality (such as `meta-overlayfs`). The metamodule handles how modules are mounted. See the [Metamodule Guide](#metamodule-guide) for more information.

1. Files with the same name as those in the corresponding directory in the system will be overwritten by the files in this directory.
2. Folders with the same name as those in the corresponding directory in the system will be merged with the folders in this directory.

### Deleting Files/Folders

If you want to delete a file or folder in the original system directory, you need to create a file with the same name as the file/folder in the module directory using `mknod filename c 0 0`. This way, the OverlayFS system will automatically "whiteout" this file as if it has been deleted (the /system partition isn't actually changed).

You can also declare a variable named `REMOVE` containing a list of directories in `customize.sh` to execute removal operations, and KernelSU will automatically execute `mknod <TARGET> c 0 0` in the corresponding directories of the module. For example:

```sh
REMOVE="
/system/app/YouTube
/system/app/Bloatware
"
```

The above list will execute `mknod $MODPATH/system/app/YouTube c 0 0` and `mknod $MODPATH/system/app/Bloatware c 0 0`, `/system/app/YouTube` and `/system/app/Bloatware` will be removed after the module takes effect.

### Replacing Directories

If you want to replace a directory in the system, you need to create a directory with the same path in your module directory, and then set the attribute `setfattr -n trusted.overlay.opaque -v y <TARGET>` for this directory. This way, the OverlayFS system will automatically replace the corresponding directory in the system (without changing the /system partition).

You can declare a variable named `REPLACE` in your `customize.sh` file, which includes a list of directories to be replaced, and KernelSU will automatically perform the corresponding operations in your module directory. For example:

```sh
REPLACE="
/system/app/YouTube
/system/app/Bloatware
"
```

This list will automatically create the directories `$MODPATH/system/app/YouTube` and `$MODPATH/system/app/Bloatware`, and then execute `setfattr -n trusted.overlay.opaque -v y $MODPATH/system/app/YouTube` and `setfattr -n trusted.overlay.opaque -v y $MODPATH/system/app/Bloatware`. After the module takes effect, `/system/app/YouTube` and `/system/app/Bloatware` will be replaced with empty directories.

> **DIFFERENCE WITH MAGISK**
>
> KernelSU uses a metamodule architecture where mounting is delegated to pluggable metamodules. The official `meta-overlayfs` metamodule uses the kernel's OverlayFS for systemless modifications, while Magisk uses magic mount (bind mount) built directly into its core. Both achieve the same goal: modifying `/system` files without physically modifying the `/system` partition. KernelSU's approach provides more flexibility and reduces detection surface.
>
> If you're interested in OverlayFS, it's recommended to read the Linux Kernel's [documentation on OverlayFS](https://docs.kernel.org/filesystems/overlayfs.html). For details on KernelSU's metamodule system, see the [Metamodule Guide](#metamodule-guide).

---

## system.prop

This file follows the same format as `build.prop`. Each line comprises of `[key]=[value]`.

---

## sepolicy.rule

If your module requires some additional sepolicy patches, please add those rules into this file. Each line in this file will be treated as a policy statement.

---

## Module Installer

A KernelSU module installer is a KernelSU module packaged in a ZIP file that can be flashed in the KernelSU manager. The simplest KernelSU module installer is just a KernelSU module packed as a ZIP file.

```
module.zip
│
├── customize.sh                       <--- (Optional, more details later)
│                                           This script will be sourced by update-binary
├── ...
├── ...  /* The rest of module's files */
│
```

> **WARNING**
>
> KernelSU module is **NOT** compatible for installation in a custom Recovery!

---

## Customization

If you need to customize the module installation process, optionally you can create a script in the installer named `customize.sh`. This script will be **sourced** (not executed) by the module installer script after all files are extracted and default permissions and secontext are applied. This is very useful if your module requires additional setup based on the device ABI, or you need to set special permissions/secontext for some of your module files.

If you would like to fully control and customize the installation process, declare `SKIPUNZIP=1` in `customize.sh` to skip all default installation steps. By doing so, your `customize.sh` will be responsible to install everything by itself.

The `customize.sh` script runs in KernelSU's BusyBox `ash` shell with Standalone Mode enabled. The following variables and functions are available:

### Variables

- `KSU` (bool): a variable to mark that the script is running in the KernelSU environment, and the value of this variable will always be true. You can use it to distinguish between KernelSU and Magisk.
- `KSU_VER` (string): the version string of currently installed KernelSU (e.g. `v0.4.0`).
- `KSU_VER_CODE` (int): the version code of currently installed KernelSU in userspace (e.g. `10672`).
- `KSU_KERNEL_VER_CODE` (int): the version code of currently installed KernelSU in kernel space (e.g. `10672`).
- `BOOTMODE` (bool): always be `true` in KernelSU.
- `MODPATH` (path): the path where your module files should be installed.
- `TMPDIR` (path): a place where you can temporarily store files.
- `ZIPFILE` (path): your module's installation ZIP.
- `ARCH` (string): the CPU architecture of the device. Value is either `arm`, `arm64`, `x86`, or `x64`.
- `IS64BIT` (bool): `true` if `$ARCH` is either `arm64` or `x64`.
- `API` (int): the API level (Android version) of the device (e.g., `23` for Android 6.0).

> **WARNING**
>
> In KernelSU, `MAGISK_VER_CODE` is always `25200`, and `MAGISK_VER` is always `v25.2`. Please don't use these two variables to determine whether KernelSU is running or not.

### Functions

```
ui_print <msg>
    print <msg> to console
    Avoid using 'echo' as it will not display in custom recovery's console

abort <msg>
    print error message <msg> to console and terminate the installation
    Avoid using 'exit' as it will skip the termination cleanup steps

set_perm <target> <owner> <group> <permission> [context]
    if [context] is not set, the default is "u:object_r:system_file:s0"
    this function is a shorthand for the following commands:
       chown owner.group target
       chmod permission target
       chcon context target

set_perm_recursive <directory> <owner> <group> <dirpermission> <filepermission> [context]
    if [context] is not set, the default is "u:object_r:system_file:s0"
    for all files in <directory>, it will call:
       set_perm file owner group filepermission context
    for all directories in <directory> (including itself), it will call:
       set_perm dir owner group dirpermission context
```

---

## Boot Scripts

In KernelSU, scripts are divided into two types based on their running mode: post-fs-data mode and late_start service mode.

### post-fs-data mode

- This stage is **BLOCKING**. The boot process is paused before execution is done or after 10 seconds.
- Scripts run before any modules are mounted. This allows a module developer to dynamically adjust their modules before it gets mounted.
- This stage happens before Zygote is started, which pretty much means everything in Android.
- **WARNING:** Using `setprop` will deadlock the boot process! Please use `resetprop -n <prop_name> <prop_value>` instead.
- **Only run scripts in this mode if necessary**.

### late_start service mode

- This stage is **NON-BLOCKING**. Your script runs in parallel with the rest of the booting process.
- **This is the recommended stage to run most scripts**.

### General Scripts vs Module Scripts

In KernelSU, startup scripts are divided into two types based on their storage location: general scripts and module scripts.

**General scripts:**
- Placed in `/data/adb/post-fs-data.d`, `/data/adb/service.d`, `/data/adb/post-mount.d` or `/data/adb/boot-completed.d`.
- Only executed if the script is set as executable (`chmod +x script.sh`).
- Scripts in `post-fs-data.d` runs in post-fs-data mode, and scripts in `service.d` runs in late_start service mode.
- Modules should **NOT** add general scripts during installation.

**Module scripts:**
- Placed in the module's own folder.
- Only executed if the module is enabled.
- `post-fs-data.sh` runs in post-fs-data mode, `service.sh` runs in late_start service mode, `boot-completed.sh` runs on boot completed, `post-mount.sh` runs on OverlayFS mounted.

All boot scripts will run in KernelSU's BusyBox `ash` shell with Standalone Mode enabled.

---

## Boot Scripts Process Explanation

The following is the relevant boot process for Android (some parts are omitted), which includes the operation of KernelSU (with leading asterisks), and can help you better understand the purpose of these module scripts:

```
0. Bootloader (nothing on screen)
load patched boot.img
load kernel:
    - GKI mode: GKI kernel with KernelSU integrated
    - LKM mode: stock kernel
...

1. kernel exec init (OEM logo on screen):
    - GKI mode: stock init
    - LKM mode: exec ksuinit, insmod kernelsu.ko, exec stock init
mount /dev, /dev/pts, /proc, /sys, etc.
property-init -> read default props
read init.rc
...
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
  *execute resetprop (actual set props for resetprop with -n option)
... -> boot
  class_start core
    start-service logd, console, vold, etc.
  class_start main
    start-service adb, netd (iptables), zygote, etc.

2. kernel2user init (ROM animation on screen, start by service bootanim)
*execute general scripts in service.d/
*execute metamodule's service.sh (if exists)
*execute module scripts service.sh
*set props for resetprop without -p option
  **(Zygisk) hook zygote (start zygiskd)
  **(Zygisk) mount zygisksu/module.prop
start system apps (autostart)
...
boot complete (broadcast ACTION_BOOT_COMPLETED event)
*execute general scripts in boot-completed.d/
*execute metamodule's boot-completed.sh (if exists)
*execute module scripts boot-completed.sh

3. User operable (lock screen)
input password to decrypt /data/data
*actual set props for resetprop with -p option
start user apps (autostart)
```

If you're interested in Android Init Language, it's recommended to read its [documentation](https://android.googlesource.com/platform/system/core/+/master/init/README.md).

---

# Difference with Magisk

> **Source:** https://kernelsu.org/guide/difference-with-magisk.html

Although KernelSU and Magisk modules have many similarities, there are inevitably some differences due to their completely different implementation mechanisms. If you want your module to work on both Magisk and KernelSU, it's essential to understand these differences.

## Similarities

- Module file format: Both use the ZIP format to organize modules, and the module format is practically the same.
- Module installation directory: Both are located at `/data/adb/modules`.
- Systemless: Both support modifying `/system` in a systemless way through modules.
- post-fs-data.sh: Execution time and semantics are exactly the same.
- service.sh: Execution time and semantics are exactly the same.
- system.prop: Completely the same.
- sepolicy.rule: Completely the same.
- BusyBox: Scripts are run in BusyBox with "Standalone Mode" enabled in both cases.

## Differences

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

# Module WebUI

> **Source:** https://kernelsu.org/guide/module-webui.html

In addition to executing boot scripts and modifying system files, KernelSU modules can display user interfaces and interact directly with users.

Modules can define HTML + CSS + JavaScript pages with any web technology. KernelSU's manager displays these pages via WebView and exposes APIs for interacting with the system, such as executing shell commands.

## `webroot` Directory

Web resource files should be placed in the `webroot` subdirectory of the module root directory, and there **MUST** be a file named `index.html`, which is the module page entry. The simplest module structure containing a web interface is as follows:

```
.
|-- module.prop
`-- webroot
    `-- index.html
```

> **WARNING**
>
> When installing the module, KernelSU will automatically set the permissions and SELinux context for this directory. If you don't know what you're doing, do not set the permissions for this directory yourself!

If your page contains CSS and JavaScript, you need to place it in this directory as well.

## JavaScript API

If it's just a display page, it will function like a regular web page. However, the most important thing is that KernelSU provides a series of system APIs, allowing the implementation of module-specific functions.

KernelSU provides a JavaScript library, which is published on [npm](https://www.npmjs.com/package/kernelsu) and can be used in the JavaScript code of your web pages.

For example, you can execute a shell command to obtain a specific configuration or modify a property:

```javascript
import { exec } from 'kernelsu';

const { errno, stdout } = exec("getprop ro.product.model");
```

You can also make the page full screen or display a toast.

[API documentation](https://www.npmjs.com/package/kernelsu)

If you find that the existing API doesn't meet your needs or is inconvenient to use, you're welcome to give suggestions [here](https://github.com/tiann/KernelSU/issues).

## Some Tips

1. You can use `localStorage` as usual to store some data, but keep in mind that it will be lost if the manager app is uninstalled. If you need persistent storage, you will need to manually save the data in a specific directory.
2. For simple pages, it is recommended to use [parceljs](https://parceljs.org/) for packaging. It requires no initial configuration and is extremely easy to use. However, if you're a front-end expert or have your own preferences, feel free to use the tool of your choice!

---

# Metamodule Guide

> **Source:** https://kernelsu.org/guide/metamodule.html

Metamodules are a revolutionary feature in KernelSU that transfers critical module system capabilities from the core to pluggable modules. This architectural shift maintains KernelSU's stability and security while unleashing greater innovation potential for the module ecosystem.

## What is a Metamodule?

A metamodule is a special type of KernelSU module that provides core infrastructure functionality for the module system. Unlike regular modules that modify system files, metamodules control *how* regular modules are installed and mounted.

Metamodules are a plugin-based extension mechanism that allows complete customization of KernelSU's module management infrastructure. By delegating mounting and installation logic to metamodules, KernelSU avoids being a fragile detection point while enabling diverse implementation strategies.

**Key characteristics:**

- **Infrastructure role**: Metamodules provide services that regular modules depend on
- **Single instance**: Only one metamodule can be installed at a time
- **Priority execution**: Metamodule scripts run before regular module scripts
- **Special hooks**: Provides three hook scripts for installation, mounting, and cleanup

## Why Metamodules?

Traditional root solutions bake mounting logic into their core, making them easier to detect and harder to evolve. KernelSU's metamodule architecture solves these problems through separation of concerns.

**Strategic advantages:**

- **Reduced detection surface**: KernelSU itself doesn't perform mounts, reducing detection vectors
- **Stability**: Core remains stable while mounting implementations can evolve
- **Innovation**: Community can develop alternative mounting strategies without forking KernelSU
- **Choice**: Users can select the implementation that best fits their needs

**Mounting flexibility:**

- **No mounting**: For users with mountless-only modules, avoid mounting overhead entirely
- **OverlayFS mounting**: Traditional approach with read-write layer support (via `meta-overlayfs`)
- **Magic mount**: Magisk-compatible mounting for better app compatibility
- **Custom implementations**: FUSE-based overlays, custom VFS mounts, or entirely new approaches

**Beyond mounting:**

- **Extensibility**: Add features like kernel module support without modifying core KernelSU
- **Modularity**: Update implementations independently of KernelSU releases
- **Customization**: Create specialized solutions for specific devices or use cases

> **IMPORTANT**
>
> Without a metamodule installed, modules will **NOT** be mounted. Fresh KernelSU installations require installing a metamodule (such as `meta-overlayfs`) for modules to function.

## For Users

### Installing a Metamodule

Install a metamodule the same way as regular modules:

1. Download the metamodule ZIP file (e.g., `meta-overlayfs.zip`)
2. Open KernelSU Manager app
3. Tap the floating action button
4. Select the metamodule ZIP file
5. Reboot your device

The `meta-overlayfs` metamodule is the official reference implementation that provides traditional overlayfs-based module mounting with ext4 image support.

### Checking Active Metamodule

You can check which metamodule is currently active in the KernelSU Manager app's Module page. The active metamodule will be displayed in your module list with its special designation.

### Uninstalling a Metamodule

> **WARNING**
>
> Uninstalling a metamodule will affect **ALL** modules. After removal, modules will no longer be mounted until you install another metamodule.

To uninstall:

1. Open KernelSU Manager
2. Find the metamodule in your module list
3. Tap uninstall (you'll see a special warning)
4. Confirm the action
5. Reboot your device

After uninstalling, you should install another metamodule if you want modules to continue working.

### Single Metamodule Constraint

Only one metamodule can be installed at a time. If you try to install a second metamodule, KernelSU will prevent the installation to avoid conflicts.

To switch metamodules:

1. Uninstall all regular modules
2. Uninstall the current metamodule
3. Reboot
4. Install the new metamodule
5. Reinstall your regular modules
6. Reboot again

## For Module Developers

If you're developing regular KernelSU modules, you don't need to worry much about metamodules. Your modules will work as long as users have a compatible metamodule installed (like `meta-overlayfs`).

**What you need to know:**

- **Mounting requires a metamodule**: The `system` directory in your module will only be mounted if the user has a metamodule installed that provides mounting functionality
- **No code changes needed**: Existing modules continue to work without modification

> **TIP**
>
> If you're familiar with Magisk module development, your modules will work the same way in KernelSU when metamodule is installed, as it provides Magisk-compatible mounting.

## For Metamodule Developers

Creating a metamodule allows you to customize how KernelSU handles module installation, mounting, and uninstallation.

### Basic Requirements

A metamodule is identified by a special property in its `module.prop`:

```
id=meta-example
name=My Custom Metamodule
version=1.0
versionCode=1
author=Your Name
description=Custom module mounting implementation
metamodule=1
```

**Key requirements:**

- The `metamodule=1` (or `metamodule=true`) property marks this as a metamodule. Without this property, the module will be treated as a regular module.
- **Naming convention**: It is strongly recommended to name your metamodule ID starting with `meta-` (e.g., `meta-overlayfs`, `meta-magicmount`, `meta-custom`). This helps users easily identify metamodules and prevents naming conflicts with regular modules.

### File Structure

A metamodule structure:

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
├── customize.sh             (installation customization)
├── post-fs-data.sh          (post-fs-data stage script)
├── service.sh               (late_start service script)
├── boot-completed.sh        (boot completed script)
├── uninstall.sh             (metamodule's own uninstallation script)
└── [any additional files]
```

Metamodules can use all standard module features (lifecycle scripts, etc.) in addition to their special metamodule hooks.

### Hook Scripts

Metamodules can provide up to three special hook scripts:

#### 1. metamount.sh — Mount Handler

**Purpose**: Controls how modules are mounted during boot.

**When executed**: See [Execution Order](#execution-order) below.

**Environment variables:**

- `MODDIR`: The metamodule's directory path (e.g., `/data/adb/modules/meta-example`)
- All standard KernelSU environment variables

**Responsibilities:**

- Mount all enabled modules systemlessly
- Check for `skip_mount` flags
- Handle module-specific mounting requirements

> **CRITICAL REQUIREMENT**
>
> When performing mount operations, you **MUST** set the source/device name to `"KSU"`. This identifies mounts as belonging to KernelSU.

**Example (correct):**

```sh
mount -t overlay -o lowerdir=/lower,upperdir=/upper,workdir=/work KSU /target
```

**For modern mount APIs**, set the source string:

```rust
fsconfig_set_string(fs, "source", "KSU")?;
```

This is essential for KernelSU to identify and manage its mounts properly.

**Example script:**

```sh
#!/system/bin/sh
MODDIR="${0%/*}"

# Example: Simple bind mount implementation
for module in /data/adb/modules/*; do
    if [ -f "$module/disable" ] || [ -f "$module/skip_mount" ]; then
        continue
    fi

    if [ -d "$module/system" ]; then
        # Mount with source=KSU (REQUIRED!)
        mount -o bind,dev=KSU "$module/system" /system
    fi
done
```

#### 2. metainstall.sh — Installation Hook

**Purpose**: Customize how regular modules are installed.

**When executed**: During module installation, after files are extracted but before installation completes. This script is **sourced** (not executed) by the built-in installer, similar to how `customize.sh` works.

**Environment variables and functions:**

This script inherits all variables and functions from the built-in `install.sh`:

- **Variables**: `MODPATH`, `TMPDIR`, `ZIPFILE`, `ARCH`, `API`, `IS64BIT`, `KSU`, `KSU_VER`, `KSU_VER_CODE`, `BOOTMODE`, etc.
- **Functions**:
  - `ui_print <msg>` — Print message to console
  - `abort <msg>` — Print error and terminate installation
  - `set_perm <target> <owner> <group> <permission> [context]` — Set file permissions
  - `set_perm_recursive <directory> <owner> <group> <dirpermission> <filepermission> [context]` — Set permissions recursively
  - `install_module` — Call the built-in module installation process

**Use cases:**

- Process module files before or after built-in installation (call `install_module` when ready)
- Move module files
- Validate module compatibility
- Set up special directory structures
- Initialize module-specific resources

**Note**: This script is **NOT** called when installing the metamodule itself.

#### 3. metauninstall.sh — Cleanup Hook

**Purpose**: Clean up resources when regular modules are uninstalled.

**When executed**: During module uninstallation, before the module directory is removed.

**Environment variables:**

- `MODULE_ID`: The ID of the module being uninstalled

**Use cases:**

- Process files
- Clean up symlinks
- Free allocated resources
- Update internal tracking

**Example script:**

```sh
#!/system/bin/sh
# Called when uninstalling regular modules
MODULE_ID="$1"
IMG_MNT="/data/adb/metamodule/mnt"

# Remove module files from image
if [ -d "$IMG_MNT/$MODULE_ID" ]; then
    rm -rf "$IMG_MNT/$MODULE_ID"
fi
```

### Execution Order

Understanding the boot execution order is crucial for metamodule development:

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

**Key points:**

- `metamount.sh` runs **AFTER** all post-fs-data scripts (both metamodule and regular modules)
- Metamodule lifecycle scripts (`post-fs-data.sh`, `service.sh`, `boot-completed.sh`) always run before regular module scripts
- Common scripts in `.d` directories run before metamodule scripts
- The `post-mount` stage runs after mounting is complete

### Symlink Mechanism

When a metamodule is installed, KernelSU creates a symlink:

```sh
/data/adb/metamodule -> /data/adb/modules/<metamodule_id>
```

This provides a stable path for accessing the active metamodule, regardless of its ID.

**Benefits:**

- Consistent access path
- Easy detection of active metamodule
- Simplifies configuration

### Real-World Example: meta-overlayfs

The `meta-overlayfs` metamodule is the official reference implementation. It demonstrates best practices for metamodule development.

#### Architecture

`meta-overlayfs` uses a **dual-directory architecture**:

1. **Metadata directory**: `/data/adb/modules/`
   - Contains `module.prop`, `disable`, `skip_mount` markers
   - Fast to scan during boot
   - Small storage footprint

2. **Content directory**: `/data/adb/metamodule/mnt/`
   - Contains actual module files (system, vendor, product, etc.)
   - Stored in an ext4 image (`modules.img`)
   - Space-optimized with ext4 features

#### metamount.sh Implementation

Here's how `meta-overlayfs` implements the mount handler:

```sh
#!/system/bin/sh
MODDIR="${0%/*}"
IMG_FILE="$MODDIR/modules.img"
MNT_DIR="$MODDIR/mnt"

# Mount ext4 image if not already mounted
if ! mountpoint -q "$MNT_DIR"; then
    mkdir -p "$MNT_DIR"
    mount -t ext4 -o loop,rw,noatime "$IMG_FILE" "$MNT_DIR"
fi

# Set environment variables for dual-directory support
export MODULE_METADATA_DIR="/data/adb/modules"
export MODULE_CONTENT_DIR="$MNT_DIR"

# Execute the mount binary
# (The actual mounting logic is in a Rust binary)
"$MODDIR/meta-overlayfs"
```

#### Key Features

**Overlayfs mounting:**

- Uses kernel overlayfs for true systemless modifications
- Supports multiple partitions (system, vendor, product, system_ext, odm, oem)
- Read-write layer support via `/data/adb/modules/.rw/`

**Source identification:**

```rust
// From meta-overlayfs/src/mount.rs
fsconfig_set_string(fs, "source", "KSU")?;  // REQUIRED!
```

This sets `dev=KSU` for all overlay mounts, enabling proper identification.

### Best Practices

When developing metamodules:

1. **Always set source to "KSU"** for mount operations — kernel umount and zygisksu umount need this to umount correctly
2. **Handle errors gracefully** — boot processes are time-sensitive
3. **Respect standard flags** — support `skip_mount` and `disable`
4. **Log operations** — use `echo` or logging for debugging
5. **Test thoroughly** — mounting errors can cause boot loops
6. **Document behavior** — clearly explain what your metamodule does
7. **Provide migration paths** — help users switch from other solutions

### Testing Your Metamodule

Before releasing:

1. **Test installation** on a clean KernelSU setup
2. **Verify mounting** with various module types
3. **Check compatibility** with common modules
4. **Test uninstallation** and cleanup
5. **Validate boot performance** (metamount.sh is blocking!)
6. **Ensure proper error handling** to avoid boot loops

## Frequently Asked Questions

### Do I need a metamodule?

**For users**: Only if you want to use modules that require mounting. If you only use modules that run scripts without modifying system files, you don't need a metamodule.

**For module developers**: No, you develop modules normally. Users need a metamodule only if your module requires mounting.

**For advanced users**: Only if you want to customize mounting behavior or create alternative mounting implementations.

### Can I have multiple metamodules?

No. Only one metamodule can be installed at a time. This prevents conflicts and ensures predictable behavior.

### What happens if I uninstall my only metamodule?

Modules will no longer be mounted. Your device will boot normally, but module modifications won't apply until you install another metamodule.

### Is meta-overlayfs required?

No. It provides standard overlayfs mounting compatible with most modules. You can create your own metamodule if you need different behavior.

---

# Module Configuration System

> **Source:** https://kernelsu.org/guide/module-config.html

KernelSU provides a built-in configuration system that allows modules to store persistent or temporary key-value settings. Configurations are stored in a binary format at `/data/adb/ksu/module_configs/<module_id>/` with the following characteristics:

## Configuration Types

- **Persist Config** (`persist.config`): Survives reboots and persists until explicitly deleted or the module is uninstalled
- **Temp Config** (`tmp.config`): Automatically cleared during the post-fs-data stage on every boot

When reading configurations, temporary values take priority over persistent values for the same key.

## Using Configuration in Module Scripts

All module scripts (`post-fs-data.sh`, `service.sh`, `boot-completed.sh`, etc.) run with the `KSU_MODULE` environment variable set to the module ID. You can use the `ksud module config` commands to manage your module's configuration:

```bash
# Get a configuration value
value=$(ksud module config get my_setting)

# Set a persistent configuration value
ksud module config set my_setting "some value"

# Set a temporary configuration value (cleared on reboot)
ksud module config set --temp runtime_state "active"

# Set value from stdin (useful for multiline or complex data)
ksud module config set my_key <<EOF
multiline
text value
EOF

# Or pipe from command
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

## Validation Limits

The configuration system enforces the following limits:

- **Maximum key length**: 256 bytes
- **Maximum value length**: 1MB (1048576 bytes)
- **Maximum config entries**: 32 per module
- **Key format**: Must match `^[a-zA-Z][a-zA-Z0-9._-]+$` (same as module ID)
  - Must start with a letter (a-zA-Z)
  - Can contain letters, numbers, dots (`.`), underscores (`_`), or hyphens (`-`)
  - Minimum length: 2 characters
- **Value format**: No restrictions — can contain any UTF-8 characters including newlines, control characters, etc.
  - Stored in binary format with length prefix, ensuring safe handling of all data

## Lifecycle

- **On boot**: All temporary configurations are cleared during the post-fs-data stage
- **On module uninstall**: All configurations (both persist and temp) are removed automatically
- Configurations are stored in a binary format with magic number `0x4b53554d` ("KSUM") and version validation

## Use Cases

The configuration system is ideal for:

- **User preferences**: Store module settings that users configure through WebUI or action scripts
- **Feature flags**: Enable/disable module features without reinstalling
- **Runtime state**: Track temporary state that should reset on reboot (use temp config)
- **Installation settings**: Remember choices made during module installation
- **Complex data**: Store JSON, multiline text, Base64 encoded data, or any structured content (up to 1MB)

> **BEST PRACTICES**
>
> - Use persistent configs for user preferences that should survive reboots
> - Use temporary configs for runtime state or feature toggles that should reset on boot
> - Validate configuration values in your scripts before using them
> - Use the `ksud module config list` command to debug configuration issues

## Advanced Features

The module configuration system provides special configuration keys for advanced use cases:

### Overriding Module Description

You can dynamically override the `description` field from `module.prop` by setting the `override.description` configuration key:

```bash
# Override module description
ksud module config set override.description "Custom description shown in the manager"
```

When the module list is retrieved, if the `override.description` config exists, it will replace the original description from `module.prop`. This is useful for:

- Displaying dynamic status information in the module description
- Showing runtime configuration details to users
- Updating description based on module state without reinstalling

### Declaring Managed Features

Modules can declare which KernelSU features they manage using the `manage.<feature>` configuration pattern. The supported features correspond to KernelSU's internal `FeatureId` enum:

**Supported Features:**

- `su_compat` — SU compatibility mode
- `kernel_umount` — Kernel automatic unmount

```bash
# Declare that this module manages SU compatibility and enables it
ksud module config set manage.su_compat true

# Declare that this module manages kernel unmount and disables it
ksud module config set manage.kernel_umount false

# Remove feature management (module no longer controls this feature)
ksud module config delete manage.su_compat
```

**How it works:**

- The presence of a `manage.<feature>` key indicates the module is managing that feature
- The value indicates the desired state: `true`/`1` for enabled, `false`/`0` (or any other value) for disabled
- To stop managing a feature, delete the configuration key entirely

Managed features are exposed through the module list API as a `managedFeatures` field (comma-separated string). This allows:

- KernelSU manager to detect which modules manage which KernelSU features
- Prevention of conflicts when multiple modules try to manage the same feature
- Better coordination between modules and core KernelSU functionality

> **SUPPORTED FEATURES ONLY**
>
> Only use the predefined feature names listed above (`su_compat`, `kernel_umount`). These correspond to actual KernelSU internal features. Using other feature names will not cause errors but serves no functional purpose.

---

# Quick Reference Tables

## Boot Stage Summary

| Stage | Script | Blocking? | When | Notes |
|-------|--------|-----------|------|-------|
| post-fs-data | `post-fs-data.sh` | YES (10s timeout) | Before modules mounted, before Zygote | Use `resetprop -n`, NOT `setprop` |
| post-mount | `post-mount.sh` | YES | After metamount.sh mounts modules | OverlayFS is ready |
| late_start service | `service.sh` | NO | During boot animation | Recommended for most scripts |
| boot-completed | `boot-completed.sh` | NO | After ACTION_BOOT_COMPLETED | Everything is up |

## Environment Variables Summary

| Variable | Type | Available In | Description |
|----------|------|-------------|-------------|
| `KSU` | bool | All scripts | `true` when running in KernelSU |
| `KSU_VER` | string | customize.sh | KernelSU version string (e.g. `v0.4.0`) |
| `KSU_VER_CODE` | int | customize.sh | KernelSU userspace version code |
| `KSU_KERNEL_VER_CODE` | int | customize.sh | KernelSU kernel version code |
| `BOOTMODE` | bool | customize.sh | Always `true` in KernelSU |
| `MODPATH` | path | customize.sh | Module installation path |
| `TMPDIR` | path | customize.sh | Temporary directory |
| `ZIPFILE` | path | customize.sh | Module ZIP path |
| `ARCH` | string | customize.sh | CPU arch: `arm`, `arm64`, `x86`, `x64` |
| `IS64BIT` | bool | customize.sh | `true` if arm64 or x64 |
| `API` | int | customize.sh | Android API level |
| `MAGISK_VER` | string | customize.sh | Always `v25.2` (compatibility shim) |
| `MAGISK_VER_CODE` | int | customize.sh | Always `25200` (compatibility shim) |
| `KSU_MODULE` | string | Module scripts | Module ID (for config system) |

## File Deletion/Replacement Methods

| Action | KernelSU Method | Magisk Method |
|--------|----------------|---------------|
| Delete file/folder | `mknod filename c 0 0` | `.replace` file in directory |
| Delete via customize.sh | `REMOVE` variable | N/A |
| Replace directory | `setfattr -n trusted.overlay.opaque -v y <dir>` | `.replace` file in directory |
| Replace via customize.sh | `REPLACE` variable | N/A |

## Key Path Differences

| Resource | KernelSU | Magisk |
|----------|----------|--------|
| BusyBox | `/data/adb/ksu/bin/busybox` | `/data/adb/magisk/busybox` |
| Modules dir | `/data/adb/modules` | `/data/adb/modules` |
| Config storage | `/data/adb/ksu/module_configs/<id>/` | N/A |
| Metamodule symlink | `/data/adb/metamodule` | N/A |
| General scripts | `/data/adb/{post-fs-data,service,post-mount,boot-completed}.d/` | `/data/adb/{post-fs-data,service}.d/` |
