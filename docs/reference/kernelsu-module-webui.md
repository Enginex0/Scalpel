# KernelSU Module WebUI — Complete Reference

> **Source:** https://kernelsu.org/guide/module-webui.html
> **npm package:** https://www.npmjs.com/package/kernelsu (v3.0.0)
> **Module guide:** https://kernelsu.org/guide/module.html
> **Module config:** https://kernelsu.org/guide/module-config.html
> **Differences with Magisk:** https://kernelsu.org/guide/difference-with-magisk.html
> **Fetched:** 2026-02-01
> **Package version at time of fetch:** kernelsu@3.0.0

---

## Table of Contents

1. [Module WebUI Overview](#1-module-webui-overview)
2. [The `webroot` Directory](#2-the-webroot-directory)
3. [JavaScript API Overview](#3-javascript-api-overview)
4. [Complete API Reference (npm `kernelsu` package)](#4-complete-api-reference)
   - [exec](#exec)
   - [spawn](#spawn)
   - [fullScreen](#fullscreen)
   - [enableInsets](#enableinsets)
   - [toast](#toast)
   - [moduleInfo](#moduleinfo)
   - [listPackages](#listpackages)
   - [getPackagesInfo](#getpackagesinfo)
5. [TypeScript Definitions](#5-typescript-definitions)
6. [Full JavaScript Source (index.js)](#6-full-javascript-source)
7. [Internal Bridge Mechanism](#7-internal-bridge-mechanism)
8. [Module Configuration System](#8-module-configuration-system)
9. [Module Directory Structure](#9-module-directory-structure)
10. [Boot Scripts and Lifecycle](#10-boot-scripts-and-lifecycle)
11. [Shell Script Environment](#11-shell-script-environment)
12. [Differences with Magisk](#12-differences-with-magisk)
13. [Tips and Best Practices](#13-tips-and-best-practices)

---

## 1. Module WebUI Overview

In addition to executing boot scripts and modifying system files, KernelSU modules can display user interfaces and interact directly with users.

Modules can define HTML + CSS + JavaScript pages with any web technology. KernelSU's manager displays these pages via WebView and exposes APIs for interacting with the system, such as executing shell commands.

---

## 2. The `webroot` Directory

Web resource files should be placed in the `webroot` subdirectory of the module root directory, and there **MUST** be a file named `index.html`, which is the module page entry. The simplest module structure containing a web interface is as follows:

```txt
$ tree .
.
|-- module.prop
`-- webroot
    `-- index.html
```

> **WARNING:** When installing the module, KernelSU will automatically set the permissions and SELinux context for this directory. If you don't know what you're doing, do not set the permissions for this directory yourself!

If your page contains CSS and JavaScript, you need to place it in this directory as well.

### Key Points

- The directory MUST be named `webroot` (at module root level)
- The entry point MUST be named `index.html`
- KernelSU automatically handles permissions and SELinux context on install
- All web assets (CSS, JS, images, fonts) go inside `webroot/`
- The path on device is: `/data/adb/modules/{module_id}/webroot/`

---

## 3. JavaScript API Overview

If it's just a display page, it will function like a regular web page. However, the most important thing is that KernelSU provides a series of system APIs, allowing the implementation of module-specific functions.

KernelSU provides a JavaScript library, which is published on [npm](https://www.npmjs.com/package/kernelsu) and can be used in the JavaScript code of your web pages.

For example, you can execute a shell command to obtain a specific configuration or modify a property:

```javascript
import { exec } from 'kernelsu';

const { errno, stdout } = exec("getprop ro.product.model");
```

You can also make the page full screen or display a toast.

### Installation

```sh
yarn add kernelsu
# or
npm install kernelsu
```

---

## 4. Complete API Reference

### `exec`

Spawns a **root** shell and runs a command within that shell, returning a Promise that resolves with the `stdout` and `stderr` outputs upon completion.

**Parameters:**

- `command` `<string>` The command to run, with space-separated arguments.
- `options` `<Object>` *(optional)*
  - `cwd` `<string>` Current working directory of the child process.
  - `env` `<Object>` Environment key-value pairs.

**Returns:** `Promise<ExecResults>`

- `errno` `<number>` The exit code of the command. `0` means success.
- `stdout` `<string>` Standard output of the command.
- `stderr` `<string>` Standard error output of the command.

**Example:**

```javascript
import { exec } from 'kernelsu';

const { errno, stdout, stderr } = await exec('ls -l', { cwd: '/tmp' });
if (errno === 0) {
    // success
    console.log(stdout);
}
```

**Note:** The exec function is asynchronous and returns a Promise. The command runs as **root**.

---

### `spawn`

Spawns a new process using the given `command` in **root** shell, with command-line arguments in `args`. If omitted, `args` defaults to an empty array.

Returns a `ChildProcess` instance. Instances of `ChildProcess` represent spawned child processes.

**Parameters:**

- `command` `<string>` The command to run.
- `args` `<string[]>` *(optional)* List of string arguments.
- `options` `<Object>` *(optional)*:
  - `cwd` `<string>` Current working directory of the child process.
  - `env` `<Object>` Environment key-value pairs.

**Returns:** `ChildProcess`

**Example:** Running `ls -lh /data`, capturing `stdout`, `stderr`, and the exit code:

```javascript
import { spawn } from 'kernelsu';

const ls = spawn('ls', ['-lh', '/data']);

ls.stdout.on('data', (data) => {
  console.log(`stdout: ${data}`);
});

ls.stderr.on('data', (data) => {
  console.log(`stderr: ${data}`);
});

ls.on('exit', (code) => {
  console.log(`child process exited with code ${code}`);
});
```

#### ChildProcess

##### Event `'exit'`

- `code` `<number>` The exit code if the child process exited on its own.

The `'exit'` event is emitted when the child process ends. If the process exits, `code` contains the final exit code; otherwise, it is null.

##### Event `'error'`

- `err` `<Error>` The error.

The `'error'` event is emitted whenever:

- The process could not be spawned.
- The process could not be killed.

##### `stdout`

A `Readable Stream` that represents the child process's `stdout`.

```javascript
const subprocess = spawn('ls');

subprocess.stdout.on('data', (data) => {
  console.log(`Received chunk ${data}`);
});
```

##### `stderr`

A `Readable Stream` that represents the child process's `stderr`.

---

### `fullScreen`

Request the WebView enter/exit full screen.

**Parameters:**

- `isFullScreen` `<boolean>` `true` to enter full screen, `false` to exit.

**Returns:** `void`

```javascript
import { fullScreen } from 'kernelsu';
fullScreen(true);
```

---

### `enableInsets`

Request the WebView to set padding to 0 or system bar insets.

**Parameters:**

- `enable` `<boolean>` `true` to enable system bar insets padding, `false` to set padding to 0.

**Returns:** `void`

**Tips:**

- This is disabled by default but if you request resource from `internal/insets.css`, this will be enabled automatically.
- To get insets value and enable this automatically, you can:
  - add `@import "https://mui.kernelsu.org/internal/insets.css";` in CSS, **OR**
  - add `<link rel="stylesheet" type="text/css" href="/internal/insets.css" />` in HTML.

```javascript
import { enableInsets } from 'kernelsu';
enableInsets(true);
```

---

### `toast`

Show a toast message.

**Parameters:**

- `message` `<string>` The message to display.

**Returns:** `void`

```javascript
import { toast } from 'kernelsu';
toast('Hello, world!');
```

---

### `moduleInfo`

Get module info.

**Parameters:** None

**Returns:** `<string>` The module ID.

```javascript
import { moduleInfo } from 'kernelsu';
// print moduleId in console
console.log(moduleInfo());
```

---

### `listPackages`

List installed packages.

**Parameters:**

- `type` `<string>` The type of packages to list: `"user"`, `"system"`, or `"all"`.

**Returns:** `<string[]>` An array of package names.

```javascript
import { listPackages } from 'kernelsu';
// list user packages
const packages = listPackages("user");
```

**Tip:** When `listPackages` API is available, you can use `ksu://icon/{packageName}` to get app icon:

```javascript
img.src = "ksu://icon/" + packageName;
```

---

### `getPackagesInfo`

Get information for a list of packages.

**Parameters:**

- `packages` `<string[]>` The list of package names.

**Returns:** `<PackagesInfo[]>` An array of `PackagesInfo` objects.

```javascript
import { getPackagesInfo } from 'kernelsu';
const packages = getPackagesInfo(['com.android.settings', 'com.android.shell']);
```

#### PackagesInfo Object

| Property | Type | Description |
|----------|------|-------------|
| `packageName` | `<string>` | Package name of the application |
| `versionName` | `<string>` | Version of the application |
| `versionCode` | `<number>` | Version code of the application |
| `appLabel` | `<string>` | Display name of the application |
| `isSystem` | `<boolean>` | Whether the application is a system app |
| `uid` | `<number>` | UID of the application |

---

## 5. TypeScript Definitions

The complete TypeScript type definitions from `kernelsu@3.0.0` (`index.d.ts`):

```typescript
interface ExecOptions {
    cwd?: string,
    env?: { [key: string]: string }
}

interface ExecResults {
    errno: number,
    stdout: string,
    stderr: string
}

declare function exec(command: string): Promise<ExecResults>;
declare function exec(command: string, options: ExecOptions): Promise<ExecResults>;

interface SpawnOptions {
    cwd?: string,
    env?: { [key: string]: string }
}

interface Stdio {
    on(event: 'data', callback: (data: string) => void)
}

interface ChildProcess {
    stdout: Stdio,
    stderr: Stdio,
    on(event: 'exit', callback: (code: number) => void)
    on(event: 'error', callback: (err: any) => void)
}

declare function spawn(command: string): ChildProcess;
declare function spawn(command: string, args: string[]): ChildProcess;
declare function spawn(command: string, options: SpawnOptions): ChildProcess;
declare function spawn(command: string, args: string[], options: SpawnOptions): ChildProcess;

declare function fullScreen(isFullScreen: boolean);

declare function enableInsets(enable: boolean);

declare function toast(message: string);

declare function moduleInfo(): string;

interface PackagesInfo {
    packageName: string;
    versionName: string;
    versionCode: number;
    appLabel: string;
    isSystem: boolean;
    uid: number;
}

declare function listPackages(type: string): string[];

declare function getPackagesInfo(packages: string[]): PackagesInfo[];

export {
    exec,
    spawn,
    fullScreen,
    enableInsets,
    toast,
    moduleInfo,
    listPackages,
    getPackagesInfo,
}
```

---

## 6. Full JavaScript Source

The complete implementation from `kernelsu@3.0.0` (`index.js`):

```javascript
let callbackCounter = 0;
function getUniqueCallbackName(prefix) {
  return `${prefix}_callback_${Date.now()}_${callbackCounter++}`;
}

export function exec(command, options) {
  if (typeof options === "undefined") {
    options = {};
  }

  return new Promise((resolve, reject) => {
    // Generate a unique callback function name
    const callbackFuncName = getUniqueCallbackName("exec");

    // Define the success callback function
    window[callbackFuncName] = (errno, stdout, stderr) => {
      resolve({ errno, stdout, stderr });
      cleanup(callbackFuncName);
    };

    function cleanup(successName) {
      delete window[successName];
    }

    try {
      ksu.exec(command, JSON.stringify(options), callbackFuncName);
    } catch (error) {
      reject(error);
      cleanup(callbackFuncName);
    }
  });
}

function Stdio() {
    this.listeners = {};
  }

  Stdio.prototype.on = function (event, listener) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  };

  Stdio.prototype.emit = function (event, ...args) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((listener) => listener(...args));
    }
  };

  function ChildProcess() {
    this.listeners = {};
    this.stdin = new Stdio();
    this.stdout = new Stdio();
    this.stderr = new Stdio();
  }

  ChildProcess.prototype.on = function (event, listener) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  };

  ChildProcess.prototype.emit = function (event, ...args) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((listener) => listener(...args));
    }
  };

  export function spawn(command, args, options) {
    if (typeof args === "undefined") {
      args = [];
    } else if (!(args instanceof Array)) {
        // allow for (command, options) signature
        options = args;
    }

    if (typeof options === "undefined") {
      options = {};
    }

    const child = new ChildProcess();
    const childCallbackName = getUniqueCallbackName("spawn");
    window[childCallbackName] = child;

    function cleanup(name) {
      delete window[name];
    }

    child.on("exit", code => {
        cleanup(childCallbackName);
    });

    try {
      ksu.spawn(
        command,
        JSON.stringify(args),
        JSON.stringify(options),
        childCallbackName
      );
    } catch (error) {
      child.emit("error", error);
      cleanup(childCallbackName);
    }
    return child;
  }

export function fullScreen(isFullScreen) {
  ksu.fullScreen(isFullScreen);
}

export function enableInsets(enable) {
  ksu.enableInsets(enable);
}

export function toast(message) {
  ksu.toast(message);
}

export function moduleInfo() {
  return ksu.moduleInfo();
}

export function listPackages(type) {
  try {
    return JSON.parse(ksu.listPackages(type));
  } catch (error) {
    return [];
  }
}

export function getPackagesInfo(packages) {
  try {
    if (typeof packages !== "string") {
      packages = JSON.stringify(packages);
    }
    return JSON.parse(ksu.getPackagesInfo(packages));
  } catch (error) {
    return [];
  }
}
```

---

## 7. Internal Bridge Mechanism

Understanding how the WebUI communicates with KernelSU internals is critical for building reliable modules.

### How It Works

1. **WebView injection:** KernelSU's manager app opens the module's `webroot/index.html` in an Android WebView.

2. **`ksu` global object:** The KernelSU manager injects a native JavaScript interface object named `ksu` into the WebView's `window` scope. This is the bridge between JavaScript and the Android native layer.

3. **Callback pattern (exec):**
   - The JS library generates a unique callback function name (e.g., `exec_callback_1706123456789_0`)
   - It registers this function on `window` as a property
   - It calls `ksu.exec(command, optionsJson, callbackName)` which is a native Android method
   - The native side runs the command as root, then calls `window[callbackName](errno, stdout, stderr)`
   - The JS callback resolves the Promise and cleans itself up

4. **Callback pattern (spawn):**
   - A `ChildProcess` object is created and registered on `window` under a unique name
   - `ksu.spawn(command, argsJson, optionsJson, childCallbackName)` is called natively
   - The native side calls `window[childCallbackName].stdout.emit('data', chunk)` for streaming output
   - On process exit, `window[childCallbackName].emit('exit', code)` is called
   - The exit handler cleans up the window reference

5. **Synchronous APIs:** `fullScreen()`, `enableInsets()`, `toast()`, `moduleInfo()`, `listPackages()`, `getPackagesInfo()` call directly into the `ksu` native object and return synchronously (no callback pattern).

### The `ksu` Native Object Methods

These are the native methods injected into the WebView by the KernelSU manager:

| Native Method | JS Wrapper | Async | Description |
|---------------|-----------|-------|-------------|
| `ksu.exec(cmd, optionsJson, callbackName)` | `exec()` | Yes (Promise) | Run shell command as root |
| `ksu.spawn(cmd, argsJson, optionsJson, callbackName)` | `spawn()` | Yes (streaming) | Spawn process as root |
| `ksu.fullScreen(bool)` | `fullScreen()` | No | Toggle fullscreen |
| `ksu.enableInsets(bool)` | `enableInsets()` | No | Toggle system bar insets |
| `ksu.toast(msg)` | `toast()` | No | Show Android toast |
| `ksu.moduleInfo()` | `moduleInfo()` | No | Get module ID string |
| `ksu.listPackages(type)` | `listPackages()` | No | List packages (returns JSON string) |
| `ksu.getPackagesInfo(packagesJson)` | `getPackagesInfo()` | No | Get package details (returns JSON string) |

### Security Model

- **All commands run as root.** There is no permission escalation needed -- the WebView already runs in the KernelSU manager context with root access.
- The WebUI is only accessible from the KernelSU manager app, not from external browsers.
- KernelSU sets permissions and SELinux context on the `webroot` directory automatically during install.

---

## 8. Module Configuration System

KernelSU provides a built-in configuration system that allows modules to store persistent or temporary key-value settings. Configurations are stored in binary format at `/data/adb/ksu/module_configs/<module_id>/`.

### Configuration Types

| Type | File | Behavior |
|------|------|----------|
| **Persist Config** | `persist.config` | Survives reboots, persists until explicitly deleted or module uninstalled |
| **Temp Config** | `tmp.config` | Automatically cleared during post-fs-data stage on every boot |

When reading configurations, temporary values take priority over persistent values for the same key.

### Using Configuration in Module Scripts

All module scripts (`post-fs-data.sh`, `service.sh`, `boot-completed.sh`, etc.) run with the `KSU_MODULE` environment variable set to the module ID. Use the `ksud module config` commands:

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

### Validation Limits

| Limit | Value |
|-------|-------|
| Maximum key length | 256 bytes |
| Maximum value length | 1 MB (1,048,576 bytes) |
| Maximum config entries | 32 per module |
| Key format | `^[a-zA-Z][a-zA-Z0-9._-]+$` (must start with letter, min 2 chars) |
| Value format | No restrictions -- any UTF-8 characters including newlines, control chars |

### Lifecycle

- **On boot:** All temporary configurations are cleared during the post-fs-data stage.
- **On module uninstall:** All configurations (both persist and temp) are removed automatically.
- Stored in binary format with magic number `0x4b53554d` ("KSUM") and version validation.

### Advanced: Overriding Module Description

You can dynamically override the `description` field from `module.prop`:

```bash
ksud module config set override.description "Custom description shown in the manager"
```

When the module list is retrieved, if the `override.description` config exists, it will replace the original description from `module.prop`.

### Advanced: Declaring Managed Features

Modules can declare which KernelSU features they manage using the `manage.<feature>` configuration pattern.

**Supported features:**

| Feature | Description |
|---------|-------------|
| `su_compat` | SU compatibility mode |
| `kernel_umount` | Kernel automatic unmount |

```bash
# Declare that this module manages SU compatibility and enables it
ksud module config set manage.su_compat true

# Declare that this module manages kernel unmount and disables it
ksud module config set manage.kernel_umount false

# Remove feature management (module no longer controls this feature)
ksud module config delete manage.su_compat
```

**How it works:**

- The presence of a `manage.<feature>` key indicates the module is managing that feature.
- The value indicates the desired state: `true`/`1` for enabled, `false`/`0` (or any other value) for disabled.
- To stop managing a feature, delete the configuration key entirely.
- Managed features are exposed through the module list API as a `managedFeatures` field (comma-separated string).

> **WARNING:** Only use the predefined feature names listed above (`su_compat`, `kernel_umount`). These correspond to actual KernelSU internal features. Using other feature names will not cause errors but serves no functional purpose.

---

## 9. Module Directory Structure

A KernelSU module is a folder placed in `/data/adb/modules` with the following structure:

```txt
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
│   ├── action.sh           <--- This script will be executed when user clicks Action button in KernelSU app
│   ├── system.prop         <--- Properties in this file will be loaded as system properties by resetprop
│   ├── sepolicy.rule       <--- Additional custom sepolicy rules
│   │
│   │      *** WebUI ***
│   │
│   ├── webroot/            <--- WebUI directory
│   │   └── index.html      <--- WebUI entry point (MUST exist for WebUI to work)
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

### module.prop Format

```txt
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
  - Examples: `a_module` (valid), `a.module` (valid), `module-101` (valid), `a module` (invalid), `1_module` (invalid), `-a-module` (invalid)
  - This is the **unique identifier** of your module. Do not change it once published.
- `versionCode` must be an **integer**. Used to compare versions.
- `actionIcon` and `webuiIcon` are optional icon paths used as the default icons for the module action shortcut and WebUI shortcut in the Manager. These paths must be relative to the module root directory. Example: `actionIcon=icon/icon.png` resolves to `<MODDIR>/icon/icon.png`.
- The `description` field can be dynamically overridden at runtime using the module configuration system (see [Overriding Module Description](#advanced-overriding-module-description)).
- Use `UNIX (LF)` line break type, not `Windows (CR+LF)` or `Macintosh (CR)`.

---

## 10. Boot Scripts and Lifecycle

### Script Modes

| Mode | Blocking | When | Notes |
|------|----------|------|-------|
| **post-fs-data** | BLOCKING (10s timeout) | Before modules are mounted, before Zygote | Use `resetprop -n` instead of `setprop` (deadlock!). Only run here if necessary. |
| **post-mount** | - | After OverlayFS mounted | Use for things that need mounted modules |
| **late_start service** | NON-BLOCKING | During boot, parallel with other services | **Recommended for most scripts** |
| **boot-completed** | NON-BLOCKING | After ACTION_BOOT_COMPLETED broadcast | Use for things that need full system ready |

### Script Types

**General scripts** (placed in shared directories):

| Directory | Mode |
|-----------|------|
| `/data/adb/post-fs-data.d/` | post-fs-data |
| `/data/adb/post-mount.d/` | post-mount |
| `/data/adb/service.d/` | late_start service |
| `/data/adb/boot-completed.d/` | boot-completed |

- Must be set as executable (`chmod +x script.sh`)
- Modules should **NOT** add general scripts during installation

**Module scripts** (placed in module folder):

| File | Mode |
|------|------|
| `post-fs-data.sh` | post-fs-data |
| `post-mount.sh` | post-mount |
| `service.sh` | late_start service |
| `boot-completed.sh` | boot-completed |

- Only executed if the module is enabled

### Full Boot Process

```txt
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

---

## 11. Shell Script Environment

### BusyBox

KernelSU ships with a feature-complete BusyBox binary (including full SELinux support). The executable is located at `/data/adb/ksu/bin/busybox`.

KernelSU's BusyBox supports runtime toggle-able "ASH Standalone Shell Mode". When running in the `ash` shell of BusyBox, every single command will directly use the applet within BusyBox, regardless of what is set as `PATH`.

**Every single shell script running in the context of KernelSU will be executed in BusyBox's `ash` shell with Standalone Mode enabled.** This includes all boot scripts and module installation scripts.

To enable Standalone Mode outside of KernelSU:

1. Set environment variable: `ASH_STANDALONE=1 /data/adb/ksu/bin/busybox sh <script>`
2. Command-line option: `/data/adb/ksu/bin/busybox sh -o standalone <script>`

### Script Variables

In all scripts of your module, use `MODDIR=${0%/*}` to get your module's base directory path. Do **NOT** hardcode your module path in scripts.

Use the environment variable `KSU` to determine if a script is running in KernelSU or Magisk. If running in KernelSU, this value will be set to `true`.

### customize.sh Variables

| Variable | Type | Description |
|----------|------|-------------|
| `KSU` | bool | Always `true` in KernelSU |
| `KSU_VER` | string | Version string (e.g., `v0.4.0`) |
| `KSU_VER_CODE` | int | Version code in userspace (e.g., `10672`) |
| `KSU_KERNEL_VER_CODE` | int | Version code in kernel space (e.g., `10672`) |
| `BOOTMODE` | bool | Always `true` in KernelSU |
| `MODPATH` | path | Path where module files should be installed |
| `TMPDIR` | path | Temporary file storage |
| `ZIPFILE` | path | Module installation ZIP path |
| `ARCH` | string | CPU architecture: `arm`, `arm64`, `x86`, or `x64` |
| `IS64BIT` | bool | `true` if `$ARCH` is `arm64` or `x64` |
| `API` | int | API level (e.g., `23` for Android 6.0) |

> **WARNING:** `MAGISK_VER_CODE` is always `25200` and `MAGISK_VER` is always `v25.2` in KernelSU. Do not use these to detect KernelSU.

### customize.sh Functions

```txt
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

### REMOVE and REPLACE Variables

In `customize.sh`, you can declare:

```sh
# Delete files/folders (creates whiteout via mknod)
REMOVE="
/system/app/YouTube
/system/app/Bloatware
"

# Replace directories (creates opaque overlayfs dirs)
REPLACE="
/system/app/YouTube
/system/app/Bloatware
"
```

---

## 12. Differences with Magisk

### Similarities

| Feature | Same? |
|---------|-------|
| Module file format (ZIP) | Yes |
| Installation directory (`/data/adb/modules`) | Yes |
| Systemless modifications | Yes |
| `post-fs-data.sh` timing/semantics | Yes |
| `service.sh` timing/semantics | Yes |
| `system.prop` format | Yes |
| `sepolicy.rule` format | Yes |
| BusyBox Standalone Mode | Yes |

### Differences

| Feature | KernelSU | Magisk |
|---------|----------|--------|
| Recovery installation | NOT supported | Supported |
| Zygisk | Via ZygiskNext (third-party) | Built-in |
| Module mounting | Metamodule system (pluggable, e.g., `meta-overlayfs`) | Built-in magic mount (bind mount) |
| File deletion | `mknod filename c 0 0` | `.replace` file |
| BusyBox location | `/data/adb/ksu/bin/busybox` | `/data/adb/magisk/busybox` |
| `.replace` files | NOT supported (use `REMOVE`/`REPLACE` variables) | Supported |
| `boot-completed` stage | Supported | Not available |
| `post-mount` stage | Supported | Not available |
| KSU detection | `KSU=true` environment variable | N/A |

---

## 13. Tips and Best Practices

### Storage

- You can use `localStorage` as usual to store some data, but keep in mind that **it will be lost if the manager app is uninstalled**.
- If you need persistent storage, manually save data to a specific directory (e.g., `/data/adb/modules/{module_id}/` or use the module config system).
- For KernelSU-specific persistent config, use `ksud module config set/get` (see Section 8).

### Build Tools

- For simple pages, [Parcel](https://parceljs.org/) is recommended -- zero config, very easy to use.
- For complex UIs, any framework works: Solid.js, React, Vue, Svelte, etc.
- The `kernelsu` npm package works with any bundler.

### WebUI Architecture for Scalpel (Implementation Notes)

Based on the above documentation, the Scalpel WebUI communication layer should:

1. **Use `exec()` for all shell commands** -- it runs as root, returns stdout/stderr/errno via Promise.
2. **Use `spawn()` for long-running operations** -- streaming output for progress feedback (e.g., scanning, nuking).
3. **Use `moduleInfo()`** to get the module ID dynamically (don't hardcode paths).
4. **Use `listPackages()` and `getPackagesInfo()`** for package enumeration instead of shell commands -- native API is faster.
5. **Use `ksu://icon/{packageName}`** for app icons in the debloat/systemize tabs.
6. **Use `toast()`** for user feedback on actions.
7. **Store persistent state** via `ksud module config` commands (called through `exec()`), or via direct file I/O through `exec()` to the module data directory.
8. **The bridge pattern** is: JS calls `ksu.*` native methods -> Android runs shell as root -> callback delivers results. All async for `exec`/`spawn`, sync for everything else.

### Compatibility Note

The `ksu` global object is only available inside KernelSU's manager WebView. For development/testing outside the WebView, you would need to mock it. For Magisk compatibility (via `action.sh`), the WebUI would need to be opened differently (e.g., via `am start` to a browser with a local HTTP server, which is the pattern ZeroMount uses).

---

## Appendix A: Package Metadata

```json
{
  "name": "kernelsu",
  "version": "3.0.0",
  "description": "Library for KernelSU's module WebUI",
  "main": "index.js",
  "types": "index.d.ts",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/tiann/KernelSU.git"
  },
  "keywords": ["su", "kernelsu", "module", "webui"],
  "author": "weishu",
  "license": "Apache-2.0",
  "homepage": "https://github.com/tiann/KernelSU#readme"
}
```

### Version History

| Version | Date | Notes |
|---------|------|-------|
| 1.0.0 | 2024-02-22 | Initial release (GPL-3.0) |
| 1.0.1 | 2024-02-22 | Minor fix |
| 1.0.2 | 2024-02-22 | Added TypeScript definitions |
| 1.0.4 | 2024-02-22 | API expansion |
| 1.0.5 | 2024-02-23 | Refinements |
| 1.0.6 | 2024-02-23 | License changed to Apache-2.0 |
| 2.1.1 | 2025-11-14 | Major update with spawn, enableInsets, listPackages, getPackagesInfo |
| 3.0.0 | 2025-12-23 | Current latest -- full API with TypeScript types |
