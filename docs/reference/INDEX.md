# Master Reference Index

> Quick-lookup guide for Scalpel developers. Find answers in <10 seconds.
> Cross-references point to the 5 reference docs for deep reading.

---

## 1. Boot Lifecycle Quick Reference

```
STAGE               MAGISK                  KERNELSU                    APATCH
====================================================================================
Bootloader          patched boot.img        patched boot (GKI/LKM)     patched boot.img

kernel init         magiskinit              GKI: stock init             KernelPatch hooks
                                            LKM: ksuinit -> ko load

mount partitions    /system /vendor etc     /system /vendor etc         /system /vendor etc

post-fs-data        BLOCKING                BLOCKING (10s timeout)      BLOCKING (10s timeout)
  safe mode check   Volume down             Volume down (3+ presses)    Volume down (continuous)
  sepolicy.rule     Loaded                  Loaded                      Loaded (magiskpolicy)
  scripts run:      post-fs-data.sh         metamodule pfd.sh           post-fs-data.sh
                    post-fs-data.sh         module pfd.sh               (same as KSU)
  system.prop       Loaded (resetprop -n)   Loaded (resetprop -n)       Loaded (resetprop -n)
  module mount      magic mount (built-in)  metamount.sh                kernel OverlayFS
  post-mount        N/A                     post-mount.sh               post-mount.sh

zygote-start        Zygote launches         Zygote launches             Zygote launches
resetprop actual    Props committed          Props committed             Props committed

late_start svc      NON-BLOCKING            NON-BLOCKING                NON-BLOCKING
  scripts run:      service.sh              metamodule service.sh       service.sh
                    service.sh              module service.sh           (same as KSU)
  PMS available     Yes (after sys_server)  Yes (after sys_server)      Yes (after sys_server)

boot-completed      N/A                     NON-BLOCKING                NON-BLOCKING
  scripts run:      (poll in service.sh)    boot-completed.sh           boot-completed.sh
  sys.boot_completed = "1"

user operable       Lock screen             Lock screen                 Lock screen
```

**Key timing constraints:**
- `setprop` in post-fs-data = DEADLOCK. Use `resetprop -n` instead.
- PMS (`pm` commands) unavailable until after Zygote/system_server start.
- `boot-completed.sh` not available on Magisk -- poll `sys.boot_completed` in `service.sh`.

> **Deep reading:** kernelsu-module-guide.md (lines 361-422), kernelsu-additional-docs.md (lines 200-227), android-shell-reference.md (lines 51-127)

---

## 2. Root Manager Compatibility Matrix

| Feature | Magisk | KernelSU | APatch |
|---------|--------|----------|--------|
| **Module directory** | `/data/adb/modules` | `/data/adb/modules` | `/data/adb/modules` |
| **Module format** | ZIP | ZIP | ZIP |
| **BusyBox path** | `/data/adb/magisk/busybox` | `/data/adb/ksu/bin/busybox` | `/data/adb/ap/bin/busybox` |
| **Core binary dir** | `/data/adb/magisk/` | `/data/adb/ksu/` | `/data/adb/ap/` |
| **Config storage** | N/A (file-based) | `/data/adb/ksu/module_configs/<id>/` | N/A (file-based) |
| **Detection env var** | `$MAGISK` set | `$KSU=true` | `$APATCH=true` |
| **MAGISK_VER_CODE** | native | `25200` (faked) | `27000` (faked) |
| **Mounting** | Magic mount (bind) | Metamodule (pluggable) | Kernel OverlayFS + metamodule |
| **File deletion** | `.replace` file | `mknod c 0 0` / `REMOVE` var | `mknod c 0 0` / `REMOVE` var |
| **Dir replacement** | `.replace` file | `setfattr opaque` / `REPLACE` var | `setfattr opaque` / `REPLACE` var |
| **SELinux** | Modified (magiskpolicy) | Modified | Bypassed via hook (optionally) |
| **Boot stages** | pfd + service | pfd + post-mount + service + boot-completed | pfd + post-mount + service + boot-completed |
| **WebUI** | No native (use MMRL) | Yes (`webroot/`) | Yes (same as KSU) |
| **Safe mode** | Volume down | Volume down (3+ presses) + AB rollback | Volume down (continuous) |
| **Zygisk** | Built-in | ZygiskNext (3rd party) | ZygiskNext (3rd party) |
| **Arch support** | arm, arm64, x86, x64 | arm, arm64, x86, x64 | **arm64 only** |
| **Recovery install** | Yes | **No** | **No** |

> **Deep reading:** kernelsu-additional-docs.md (lines 927-1061), kernelsu-module-guide.md (lines 428-459)

---

## 3. Shell Command Availability Matrix

| Command | Stock Toybox | Minimum Android | BusyBox | Notes |
|---------|-------------|-----------------|---------|-------|
| `sed` | Yes | 6.0 | Yes | Both support `-i`, `-E`. No GNU `\U`/`\L` |
| `awk` | Yes | **9.0** | Yes | **Not on Android 8.x stock.** No gawk features |
| `grep` | Yes | 6.0 | Yes | No `-P` (Perl regex). Use `-E` for extended |
| `find` | Yes | 6.0 | Yes | `-maxdepth` works on both |
| `stat` | Yes | 6.0 | Yes | Fewer format specifiers than GNU |
| `mknod` | Yes | 6.0 | Yes | Both create char device nodes |
| `setfattr` | Yes | **15.0** | Yes | Older Android: BusyBox only |
| `getfattr` | Yes | **15.0** | Yes | Older Android: BusyBox only |
| `wget` | **No** | -- | Yes | BusyBox only |
| `free` | **No** | -- | Yes | Use `/proc/meminfo` |
| `ip` | Varies | -- | Yes | OEM dependent |
| `bc` | Yes | **10.0** | Yes | Not on Android 9 stock |
| `jq` | **No** | -- | **No** | Must be bundled |
| `aapt` | **No** | -- | **No** | Must be bundled |
| `unzip` | Yes | 6.0 | Yes | Both work |
| `tar` | Yes | 6.0 | Yes | Both work |
| `flock` | Yes | 6.0 | Yes | File locking |
| `inotifyd` | Yes | 6.0 | Yes | File monitoring |
| `nohup` | Yes | 6.0 | Yes | Both work |

**Module scripts always run in BusyBox ash Standalone Mode.** All BusyBox applets override PATH. To use toybox explicitly: `/system/bin/<command>`.

> **Deep reading:** android-shell-reference.md (lines 210-486)

---

## 4. PM Command Reference

| Command | Purpose | Boot Stage Availability | Reversibility |
|---------|---------|------------------------|---------------|
| `pm list packages` | List installed packages | service.sh (after PMS) | N/A |
| `pm list packages -s` | System packages only | service.sh (after PMS) | N/A |
| `pm list packages -3` | Third-party only | service.sh (after PMS) | N/A |
| `pm list packages -d` | Disabled packages | service.sh (after PMS) | N/A |
| `pm list packages -f` | Show APK paths | service.sh (after PMS) | N/A |
| `pm list packages -u` | Include user-uninstalled | service.sh (after PMS) | N/A |
| `pm path <pkg>` | Get APK file path | service.sh (after PMS) | N/A |
| `pm disable-user --user 0 <pkg>` | Soft disable | service.sh (after PMS) | `pm enable` or Settings |
| `pm enable <pkg>` | Re-enable disabled | service.sh (after PMS) | N/A |
| `pm uninstall -k --user 0 <pkg>` | Hard disable, keep data | service.sh (after PMS) | `pm install-existing` only |
| `pm uninstall --user 0 <pkg>` | Hard disable, wipe data | service.sh (after PMS) | `pm install-existing` (no data) |
| `pm install-existing --user 0 <pkg>` | Restore uninstalled | service.sh (after PMS) | N/A |

**Wait pattern for PMS:**
```sh
while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done
# Or test directly: pm path android >/dev/null 2>&1
```

**ALL pm commands FAIL during post-fs-data.** PMS requires system_server/Zygote.

> **Deep reading:** android-shell-reference.md (lines 784-953)

---

## 5. Key Paths Quick Reference

### System Partitions

| Path | Contents | Writable |
|------|----------|----------|
| `/system/app/` | Regular system apps | No (overlay) |
| `/system/priv-app/` | Privileged system apps | No (overlay) |
| `/system/etc/permissions/` | Priv-app permission XMLs | No (overlay) |
| `/vendor/app/` | Vendor apps | No (overlay) |
| `/product/app/` | OEM/carrier apps (9+) | No (overlay) |
| `/system_ext/app/` | System extensions (11+) | No (overlay) |

### Module Paths

| Path | Purpose |
|------|---------|
| `/data/adb/modules/<id>/` | Module root directory |
| `/data/adb/modules/<id>/module.prop` | Module metadata (required) |
| `/data/adb/modules/<id>/system/` | Overlay on `/system` |
| `/data/adb/modules/<id>/webroot/` | WebUI directory |
| `/data/adb/modules/<id>/webroot/index.html` | WebUI entry point (required for WebUI) |
| `/data/adb/modules/<id>/disable` | Flag: module disabled |
| `/data/adb/modules/<id>/remove` | Flag: remove on next boot |
| `/data/adb/modules/<id>/skip_mount` | Flag: don't mount system/ |

### Root Manager Paths

| Path | Manager | Purpose |
|------|---------|---------|
| `/data/adb/magisk/` | Magisk | Core binaries |
| `/data/adb/magisk/busybox` | Magisk | BusyBox binary |
| `/data/adb/ksu/` | KernelSU | Core binaries |
| `/data/adb/ksu/bin/busybox` | KernelSU | BusyBox binary |
| `/data/adb/ksu/module_configs/<id>/` | KernelSU | Module config storage |
| `/data/adb/ap/` | APatch | Core binaries |
| `/data/adb/ap/bin/busybox` | APatch | BusyBox binary |
| `/data/adb/metamodule` | KernelSU/APatch | Symlink to active metamodule |

### Scalpel Data Paths

| Path | Purpose |
|------|---------|
| `/data/adb/scalpel/config.sh` | Persistent config (shell vars) |
| `/data/adb/scalpel/config.sh.bak` | Bootloop recovery backup |
| `/data/adb/scalpel/nuke_list.json` | Apps marked for debloat |
| `/data/adb/scalpel/systemize_list.json` | Apps marked for systemize |
| `/data/adb/scalpel/app_list.json` | Cached system app scan |
| `/data/adb/scalpel/categories.json` | App risk classifications |
| `/data/adb/scalpel/status.json` | Current operation status |
| `/data/adb/scalpel/count.sh` | Bootloop counter |
| `/data/adb/scalpel/debug.log` | Debug log (1MB max) |

### Android Data Paths

| Path | Purpose |
|------|---------|
| `/data/system/packages.xml` | Master PMS database |
| `/data/system/packages.list` | Package-to-UID mapping |
| `/data/system/users/0/package-restrictions.xml` | Per-user package states |
| `/data/data/<pkg>/` | App private data (credential-encrypted) |
| `/data/app/~~hash/<pkg>-hash/` | User-installed APKs |

> **Deep reading:** android-shell-reference.md (lines 1087-1196), kernelsu-module-guide.md (lines 83-138)

---

## 6. WebUI Bridge API

### JavaScript API (`kernelsu` npm package v3.0.0)

| Function | Async | Returns | Purpose |
|----------|-------|---------|---------|
| `exec(cmd, opts?)` | Yes (Promise) | `{errno, stdout, stderr}` | Run shell command as root |
| `spawn(cmd, args?, opts?)` | Yes (streaming) | `ChildProcess` | Spawn process as root |
| `fullScreen(bool)` | No | void | Toggle fullscreen |
| `enableInsets(bool)` | No | void | Toggle system bar insets |
| `toast(msg)` | No | void | Show Android toast |
| `moduleInfo()` | No | string | Get module ID |
| `listPackages(type)` | No | string[] | List packages: `"user"`, `"system"`, `"all"` |
| `getPackagesInfo(pkgs)` | No | PackagesInfo[] | Get package details |

### ExecOptions

```typescript
{ cwd?: string, env?: { [key: string]: string } }
```

### PackagesInfo Object

```typescript
{ packageName: string, versionName: string, versionCode: number,
  appLabel: string, isSystem: boolean, uid: number }
```

### App Icon URL Pattern

```
ksu://icon/{packageName}
```

### Internal Bridge Mechanism

1. KSU manager injects `ksu` global object into WebView
2. `exec()`: registers callback on `window`, calls `ksu.exec(cmd, optionsJson, callbackName)`, native side calls callback with results
3. `spawn()`: registers `ChildProcess` on `window`, native side streams via `.stdout.emit('data', chunk)`, fires `.emit('exit', code)` on completion
4. Sync APIs (`toast`, `fullScreen`, etc.) call `ksu.*` directly and return immediately

### Security Model

- All commands run as root
- WebUI only accessible from KSU/APatch manager app
- Permissions and SELinux set automatically on `webroot/`

> **Deep reading:** kernelsu-module-webui.md (lines 99-602)

---

## 7. Module Configuration API (KernelSU only)

### CLI Commands

```sh
ksud module config get <key>                    # Read value
ksud module config set <key> <value>            # Write persistent
ksud module config set --temp <key> <value>     # Write temporary (cleared on boot)
ksud module config set <key> --stdin            # Write from stdin
ksud module config list                         # List all entries
ksud module config delete <key>                 # Delete persistent entry
ksud module config delete --temp <key>          # Delete temporary entry
ksud module config clear                        # Clear all persistent
ksud module config clear --temp                 # Clear all temporary
```

### Limits

| Constraint | Value |
|------------|-------|
| Max key length | 256 bytes |
| Max value size | 1 MB |
| Max entries per module | 32 |
| Key format | `^[a-zA-Z][a-zA-Z0-9._-]+$` (min 2 chars) |
| Value format | Any UTF-8 |

### Special Keys

| Key | Purpose |
|-----|---------|
| `override.description` | Replace `module.prop` description in manager UI |
| `manage.su_compat` | Declare module manages SU compatibility (`true`/`false`) |
| `manage.kernel_umount` | Declare module manages kernel unmount (`true`/`false`) |

### Lifecycle

- Temp configs cleared at post-fs-data on every boot
- All configs removed on module uninstall
- Stored at `/data/adb/ksu/module_configs/<module_id>/`
- `KSU_MODULE` env var set to module ID in all module scripts

> **Deep reading:** kernelsu-module-config.md (lines 10-148), kernelsu-module-guide.md (lines 944-1090)

---

## 8. Cross-References

| Section | Primary Reference | Lines |
|---------|-------------------|-------|
| Boot lifecycle | kernelsu-module-guide.md | 359-422 |
| Boot lifecycle (all managers) | kernelsu-additional-docs.md | 200-227 |
| Boot lifecycle (shell context) | android-shell-reference.md | 51-127 |
| Root manager matrix | kernelsu-additional-docs.md | 927-1061 |
| Magisk differences | kernelsu-module-guide.md | 428-459 |
| APatch module guide | kernelsu-additional-docs.md | 704-813 |
| Shell command availability | android-shell-reference.md | 210-486 |
| PM commands | android-shell-reference.md | 784-953 |
| Property system | android-shell-reference.md | 956-1083 |
| Key Android paths | android-shell-reference.md | 1087-1240 |
| WebUI API | kernelsu-module-webui.md | 99-553 |
| WebUI bridge mechanism | kernelsu-module-webui.md | 557-602 |
| Module config API | kernelsu-module-config.md | 10-148 |
| Module config (full) | kernelsu-module-guide.md | 944-1090 |
| Module directory structure | kernelsu-module-guide.md | 83-138 |
| module.prop format | kernelsu-module-guide.md | 146-173 |
| customize.sh variables | kernelsu-module-guide.md | 277-319 |
| Metamodule system | kernelsu-module-guide.md | 514-941 |
| jq on Android | android-shell-reference.md | 489-595 |
| aapt on Android | android-shell-reference.md | 1244-1393 |
| SELinux handling | android-shell-reference.md | 679-748 |
| File permissions (DAC+MAC) | android-shell-reference.md | 752-780 |
| Atomic file writes | android-shell-reference.md | 600-633 |
| Priv-app permissions XML | android-shell-reference.md | 1199-1240 |
| Safe mode / bootloop rescue | kernelsu-additional-docs.md | 614-641, 892-908 |
| Root manager detection | kernelsu-additional-docs.md | 1021-1038 |
