# Android Shell Environment Reference

> Comprehensive reference for Android module developers working with shell scripts
> across Magisk, KernelSU, and APatch root managers.
>
> Last updated: 2026-02-01

---

## Table of Contents

1. [Android Shell Environment](#1-android-shell-environment)
2. [Toybox vs BusyBox vs GNU Coreutils](#2-toybox-vs-busybox-vs-gnu-coreutils)
3. [jq on Android](#3-jq-on-android)
4. [File Operations](#4-file-operations)
5. [Package Manager (pm) Commands](#5-package-manager-pm-commands)
6. [Property System](#6-property-system)
7. [Key Android Paths](#7-key-android-paths)
8. [aapt on Android](#8-aapt-on-android)

---

## 1. Android Shell Environment

### 1.1 Which Shell Does Android Use?

Android has used **mksh** (MirBSD Korn Shell) as its default shell since **Android 4.0 (Ice Cream Sandwich)**. Before ICS, Android used **ash**. The shell binary lives at `/system/bin/sh` and is a symlink to mksh.

```sh
# Verify on a device
ls -la /system/bin/sh
# lrwxr-xr-x 1 root root ... /system/bin/sh -> mksh
```

**Key mksh characteristics for module developers:**
- POSIX-compatible with Korn shell extensions
- Supports arrays: `set -A myarr val1 val2 val3`
- Supports `$(( ))` arithmetic
- Supports `[[ ]]` extended test (pattern matching, regex via `=~`)
- Does NOT support `declare -A` (associative arrays) -- use `jq` for key-value data
- Does NOT support process substitution `<()` -- use temp files instead
- `local` keyword works for function-scoped variables

**However, module scripts do NOT run in mksh.** All three root managers (Magisk, KernelSU, APatch) execute module scripts in **BusyBox's ash shell** with Standalone Mode enabled. This means:
- The effective shell is `ash`, not `mksh`
- All BusyBox applets override system PATH commands
- Behavior is consistent across Android versions

Source: https://android.googlesource.com/platform/system/core/+/master/shell_and_utilities/README.md

### 1.2 Boot Stages and Script Execution

Modules have access to different system capabilities depending on which boot stage their scripts run in. All three root managers follow the same basic model:

| Stage | Script | Blocking? | Timeout | PMS Available? | Data Mounted? | Zygote Running? |
|-------|--------|-----------|---------|----------------|---------------|-----------------|
| post-fs-data | `post-fs-data.sh` | Yes (blocks boot) | ~10-40s | **No** | Yes | **No** |
| late_start service | `service.sh` | No (parallel) | None | **Yes** (eventually) | Yes | Yes (starting) |
| boot-completed | `boot-completed.sh` | No (parallel) | None | **Yes** | Yes | Yes |

#### post-fs-data.sh

Runs **before** module mounting, **before** Zygote starts. This is the earliest stage.

```sh
#!/system/bin/sh
# post-fs-data.sh -- runs BLOCKING, pauses boot

MODDIR="${0%/*}"

# CRITICAL: Do NOT use setprop here -- it deadlocks the boot process
# Use resetprop -n instead:
resetprop -n my.custom.prop value

# PMS (Package Manager Service) is NOT available here
# These commands WILL FAIL at this stage:
#   pm list packages        -- FAILS
#   pm disable-user         -- FAILS
#   pm uninstall             -- FAILS
#   cmd package              -- FAILS

# What IS available:
#   File operations (cp, mv, rm, mkdir, chmod, chown, chcon)
#   Mount operations (mount, umount)
#   Property reads (getprop -- reads cached values)
#   Kernel module loading (insmod, modprobe)
#   /proc and /sys access
```

**Use cases:** Mount manipulation, file system prep, early property injection. Keep work minimal -- this blocks boot.

#### service.sh

Runs in **late_start service** mode, non-blocking. This is the **recommended stage** for most module scripts.

```sh
#!/system/bin/sh
# service.sh -- runs NON-BLOCKING, parallel with boot

MODDIR="${0%/*}"

# PMS becomes available after system_server starts.
# Wait for it if needed:
while [ "$(getprop sys.boot_completed)" != "1" ]; do
    sleep 1
done

# Now all pm commands work:
pm list packages -s    # list system packages
pm disable-user --user 0 com.example.bloat
```

**Use cases:** Package operations, daemon launching, property monitoring, anything that needs PMS.

#### boot-completed.sh (KernelSU / APatch only)

Runs after `sys.boot_completed=1` broadcasts. Not available in stock Magisk (emulate by polling in service.sh).

```sh
#!/system/bin/sh
# boot-completed.sh -- runs after full boot

MODDIR="${0%/*}"

# Everything is available: PMS, network, all services
pm list packages -3    # list third-party packages
```

### 1.3 Environment Variables Available to Module Scripts

#### During Installation (customize.sh)

| Variable | Magisk | KernelSU | APatch | Description |
|----------|--------|----------|--------|-------------|
| `MODPATH` | Yes | Yes | Yes | Module installation directory |
| `TMPDIR` | Yes | Yes | Yes | Temp directory for installation |
| `ZIPFILE` | Yes | Yes | Yes | Path to the module ZIP being installed |
| `ARCH` | Yes | Yes | Yes | CPU architecture (`arm`, `arm64`, `x86`, `x86_64`) |
| `IS64BIT` | Yes | Yes | Yes | `true` if 64-bit |
| `API` | Yes | Yes | Yes | Android API level (e.g., `34` for Android 14) |
| `MAGISK_VER` | Yes | -- | -- | Magisk version string |
| `MAGISK_VER_CODE` | Yes | 25200* | 27000* | Magisk version code (*faked on KSU/APatch) |
| `KSU` | -- | `true` | -- | Indicates KernelSU environment |
| `KSU_VER` | -- | Yes | -- | KernelSU version string |
| `KSU_VER_CODE` | -- | Yes | -- | KernelSU version code |
| `KSU_KERNEL_VER_CODE` | -- | Yes | -- | KernelSU kernel module version |
| `APATCH` | -- | -- | `true` | Indicates APatch environment |
| `APATCH_VER` | -- | -- | Yes | APatch version string |
| `APATCH_VER_CODE` | -- | -- | Yes | APatch version code |

**Detecting the root manager at runtime:**
```sh
detect_root_manager() {
    if [ -n "$KSU" ] && [ "$KSU" = "true" ]; then
        echo "kernelsu"
    elif [ -n "$APATCH" ] && [ "$APATCH" = "true" ]; then
        echo "apatch"
    elif [ -n "$MAGISK_VER_CODE" ]; then
        echo "magisk"
    else
        echo "unknown"
    fi
}
```

#### During Boot Scripts (post-fs-data.sh, service.sh)

Boot scripts do NOT receive the installation variables above. You must derive paths:

```sh
MODDIR="${0%/*}"    # Always use this -- never hardcode paths
```

### 1.4 PATH Differences

#### Root Shell (via su / root manager)

```
/sbin/.magisk/busybox   (Magisk -- BusyBox applets)
/data/adb/magisk        (Magisk core binaries)
/data/adb/ksu/bin       (KernelSU core binaries + BusyBox)
/data/adb/ap/bin        (APatch core binaries + BusyBox)
/system/bin
/system/xbin            (legacy, often empty on modern Android)
/vendor/bin
/product/bin            (Android 9+)
```

#### Module Script Shell (BusyBox ash Standalone Mode)

When scripts run in BusyBox ash Standalone Mode, PATH is effectively **irrelevant** for BusyBox applets. Every command resolves to the internal BusyBox applet first, regardless of PATH. This means:

```sh
# In a module script, "ls" ALWAYS runs BusyBox's ls,
# even if /system/bin/ls exists and is in PATH.

# To explicitly use system binaries, use full paths:
/system/bin/ls -Z /data    # System toybox ls with SELinux contexts
```

#### BusyBox Binary Locations

| Root Manager | BusyBox Path | Applet Symlinks |
|--------------|--------------|-----------------|
| Magisk | `/data/adb/magisk/busybox` | `/sbin/.magisk/busybox/` |
| KernelSU | `/data/adb/ksu/bin/busybox` | Internal (standalone mode) |
| APatch | `/data/adb/ap/bin/busybox` | Internal (standalone mode) |

---

## 2. Toybox vs BusyBox vs GNU Coreutils

### 2.1 Toybox -- Stock Android Commands

Since **Android 6.0 (Marshmallow)**, toybox is the primary command-line provider on Android. It replaced the older "toolbox" binary. Toybox is BSD-licensed and provides ~200+ commands.

**Current toybox version on Android 15:** 0.8.11 (approximately)

Source: https://landley.net/toybox/about.html

#### Complete Toybox Applet List (Android 15)

**File Operations:**
`basename`, `cat`, `chgrp`, `chmod`, `chown`, `cksum`, `cmp`, `comm`, `cp`, `cpio`, `cut`, `dd`, `diff`, `dirname`, `du`, `expand`, `file`, `find`, `fmt`, `fold`, `head`, `install`, `link`, `ln`, `ls`, `md5sum`, `mkdir`, `mkfifo`, `mknod`, `mktemp`, `mv`, `nl`, `od`, `paste`, `patch`, `readlink`, `realpath`, `rm`, `rmdir`, `sha1sum`, `sha224sum`, `sha256sum`, `sha384sum`, `sha512sum`, `sort`, `split`, `stat`, `strings`, `tail`, `tar`, `tee`, `touch`, `truncate`, `uniq`, `unlink`, `unzip`, `wc`, `xargs`, `xxd`, `yes`, `zcat`

**Text Processing:**
`awk`, `echo`, `egrep`, `expr`, `fgrep`, `grep`, `iconv`, `printf`, `rev`, `sed`, `seq`, `stty`, `tac`, `tr`, `uudecode`, `uuencode`

**System/Process:**
`chcon`, `chroot`, `chrt`, `date`, `dmesg`, `env`, `false`, `getconf`, `getenforce`, `groups`, `hostname`, `id`, `ionice`, `kill`, `killall`, `logname`, `mount`, `nice`, `nohup`, `nsenter`, `pidof`, `printenv`, `ps`, `pwd`, `renice`, `restorecon`, `runcon`, `setenforce`, `sleep`, `sync`, `sysctl`, `test`, `time`, `timeout`, `top`, `true`, `tty`, `ulimit`, `umount`, `uname`, `unshare`, `uptime`, `usleep`, `vmstat`, `watch`, `which`, `who`, `whoami`

**Networking:**
`ifconfig`, `netcat`/`nc`, `netstat`, `ping`, `ping6`, `traceroute`, `traceroute6`

**Hardware/Device:**
`acpi`, `blkdiscard`, `blkid`, `blockdev`, `devmem`, `flock`, `fsfreeze`, `fsync`, `getfattr`, `hwclock`, `i2cdetect`, `i2cdump`, `i2cget`, `i2cset`, `i2ctransfer`, `insmod`, `inotifyd`, `losetup`, `lsattr`, `lsmod`, `lsof`, `lspci`, `lsusb`, `modinfo`, `modprobe`, `mountpoint`, `nbd-client`, `partprobe`, `pmap`, `rfkill`, `sendevent`, `setfattr`, `setsid`, `swapoff`, `swapon`, `taskset`, `tunctl`, `uclampset`, `vconfig`

**Android-Specific (removed from modern toybox, now in AOSP directly):**
`getevent`, `getprop`, `setprop`, `start`, `stop`

#### Key Commands Added by Android Version

| Android Version | Notable Additions |
|-----------------|-------------------|
| 6.0 Marshmallow | toybox replaces toolbox as primary utility |
| 9.0 Pie | `awk` (one true awk) |
| 10 Q | `bc` (Gavin Howard's bc) |
| 11+ | Expanded hardware utilities (i2c, gpio, etc.) |

### 2.2 BusyBox -- Root Manager Supplied

BusyBox is **not** included in stock Android. It is bundled by root managers (Magisk, KernelSU, APatch) and provides a much larger set of commands. Module scripts run in BusyBox's ash shell.

#### BusyBox Applets Available in Root Manager Builds

The following applets are typically available in the BusyBox builds shipped by root managers (varies slightly by build configuration):

**File operations not in toybox:**
`bunzip2`, `bzcat`, `bzip2`, `cpio` (extended), `dos2unix`, `gunzip`, `gzip`, `lzcat`, `lzma`, `lzop`, `shred`, `tree`, `unix2dos`, `unlzma`, `unlzop`, `unxz`, `xzcat`

**Text/data processing not in toybox:**
`awk` (BusyBox awk, different from toybox), `bc`, `dc`, `less`, `more` (enhanced), `vi` (enhanced)

**System administration not in toybox:**
`addgroup`, `adduser`, `ash`, `chpasswd`, `crond`, `crontab`, `cryptpw`, `delgroup`, `deluser`, `depmod`, `fdisk`, `free`, `getty`, `halt`, `init`, `klogd`, `logger`, `login`, `mkpasswd`, `mkswap`, `modprobe` (enhanced), `nologin`, `nproc`, `passwd`, `poweroff`, `reboot`, `rmmod`, `route`, `run-parts`, `su`, `switch_root`, `syslogd`

**Networking not in toybox:**
`arping`, `ether-wake`, `ftpd`, `httpd`, `ifdown`, `ifenslave`, `ifup`, `ip`, `ipaddr`, `ipcalc`, `iplink`, `ipneigh`, `iproute`, `iprule`, `iptunnel`, `nslookup`, `ntpd`, `telnet`, `wget`, `whois`

**Critical applets only in BusyBox (not in stock toybox):**
- `mknod` -- toybox HAS this too, but BusyBox version may differ
- `setfattr` -- toybox HAS getfattr/setfattr on Android 15+
- `mkswap` -- toybox HAS this on Android 15+
- `wget` -- **BusyBox only** (not in stock Android)
- `free` -- **BusyBox only**
- `ash` -- **BusyBox only** (the shell itself)
- `su` -- provided by root manager, not BusyBox
- `ip` -- **BusyBox only** on some Android versions

### 2.3 Command Behavior Differences

This section documents the critical behavioral differences between toybox, BusyBox, and GNU implementations.

#### sed

**Toybox sed (stock Android 6+):**

```sh
# Basic substitution -- WORKS
echo "hello world" | sed 's/hello/goodbye/'

# In-place editing with -i -- WORKS (Android 6+)
sed -i 's/old/new/g' file.txt

# Extended regex with -E -- WORKS (toybox supports -E)
echo "abc123" | sed -E 's/[0-9]+/NUM/'

# Address ranges -- WORKS
sed '2,5d' file.txt

# Multiple expressions with -e -- WORKS
sed -e 's/foo/bar/' -e 's/baz/qux/' file.txt

# Append/insert -- WORKS
sed '/pattern/a\new line' file.txt

# LIMITATION: No \U \L (uppercase/lowercase transforms)
# This does NOT work on toybox or BusyBox:
echo "hello" | sed 's/hello/\U&/'    # GNU-only feature

# LIMITATION: No --posix flag
# LIMITATION: Hex escapes \xNN behavior varies
```

**BusyBox sed:**
```sh
# Supports -E for extended regex
# Supports -i for in-place editing
# Supports most POSIX features
# Does NOT support GNU extensions (\U, \L, \u, \l)
# Hex escape \xNN may not work reliably
```

**Recommendation for modules:** Use toybox sed (via `/system/bin/sed`) or BusyBox sed (default in module scripts). Avoid GNU-specific extensions.

#### awk

**Toybox awk (stock Android 9+, "one true awk"):**

```sh
# Basic field processing -- WORKS
echo "a b c" | awk '{print $2}'

# Field separator -- WORKS
echo "a:b:c" | awk -F: '{print $2}'

# Pattern matching -- WORKS
awk '/pattern/ {print}' file.txt

# Variables -- WORKS
awk -v name="value" '{print name, $0}' file.txt

# Built-in functions -- WORKS
echo "hello" | awk '{print length($0)}'

# Multiple rules -- WORKS
awk 'BEGIN {print "start"} {print} END {print "end"}' file.txt

# LIMITATION: No gawk extensions (no gensub, no strftime, no @include)
# LIMITATION: No -i inplace (use temp file + mv)
```

**BusyBox awk:**
```sh
# Similar to toybox awk but fewer features than gawk
# Supports basic POSIX awk features
# Does NOT support gawk extensions
```

**Important:** awk is **not available** on Android versions before Android 9 (API 28). If you must support Android 8.x or earlier, use `sed`, `cut`, `tr`, and `grep` combinations instead, or rely on BusyBox awk (available through root manager).

#### grep

**Toybox grep (stock Android 6+):**

```sh
# Basic grep -- WORKS
grep "pattern" file.txt

# Extended regex with -E -- WORKS
grep -E "foo|bar" file.txt

# Also available as egrep and fgrep applets

# Case insensitive -- WORKS
grep -i "pattern" file.txt

# Recursive -- WORKS
grep -r "pattern" /dir/

# Count matches -- WORKS
grep -c "pattern" file.txt

# Show line numbers -- WORKS
grep -n "pattern" file.txt

# Invert match -- WORKS
grep -v "pattern" file.txt

# Quiet mode -- WORKS
grep -q "pattern" file.txt

# LIMITATION: No --include/--exclude (use find | xargs grep)
# LIMITATION: No -P (Perl regex) -- use -E for extended regex
```

#### find

**Toybox find (stock Android 6+):**

```sh
# Basic find -- WORKS
find /system/app -name "*.apk"

# Type filter -- WORKS
find /data -type f -name "*.json"

# Execute -- WORKS
find /dir -name "*.tmp" -exec rm {} \;

# Size filter -- WORKS
find /data -size +10M

# Newer than -- WORKS
find /dir -newer reference_file

# Permission filter -- WORKS
find /dir -perm 755

# LIMITATION: No -printf (use -exec stat or ls instead)
# LIMITATION: No -maxdepth on very old Android toybox (works on 9+)
```

#### stat

**Toybox stat (stock Android 6+):**

```sh
# Basic file info -- WORKS
stat /system/build.prop

# Format string -- WORKS
stat -c '%s' file.txt          # file size
stat -c '%a' file.txt          # permissions (octal)
stat -c '%U:%G' file.txt       # owner:group
stat -c '%Y' file.txt          # modification time (epoch)

# LIMITATION: Fewer format specifiers than GNU stat
```

#### xattr Operations

```sh
# Toybox getfattr/setfattr (Android 15+)
# For older Android, use BusyBox or toolbox

# Read extended attributes
getfattr -n user.myattr file.txt

# Set extended attributes (needed for overlayfs whiteouts)
setfattr -n trusted.overlay.opaque -v y directory/

# List all xattrs
getfattr -d file.txt

# For overlayfs whiteout creation:
mknod whiteout_file c 0 0
setfattr -n trusted.overlay.whiteout -v y whiteout_file
```

### 2.4 Quick Reference: Stock vs BusyBox Required

| Command | Stock Toybox | BusyBox | Notes |
|---------|-------------|---------|-------|
| `sed` | Android 6+ | Yes | Both support `-i`, `-E`. No GNU `\U`/`\L` |
| `awk` | Android 9+ | Yes | Not on Android 8.x stock. No gawk features |
| `grep` | Android 6+ | Yes | Both lack `-P` (Perl regex) |
| `find` | Android 6+ | Yes | `-maxdepth` works on both |
| `stat` | Android 6+ | Yes | Fewer format specifiers than GNU |
| `xattr` (getfattr/setfattr) | Android 15+ | Yes | Older Android: use BusyBox |
| `mknod` | Android 6+ | Yes | Both work for device nodes |
| `wget` | **No** | Yes | Not in stock Android |
| `free` | **No** | Yes | Use `/proc/meminfo` as alternative |
| `ip` | Varies | Yes | Stock on some OEMs |
| `less` | **No** | Yes | Not in stock Android |
| `tree` | **No** | Yes | Not in stock Android |
| `bc` | Android 10+ | Yes | Not on Android 9 stock |
| `jq` | **No** | **No** | Must be bundled separately |
| `unzip` | Android 6+ | Yes | Stock toybox has it |
| `tar` | Android 6+ | Yes | Stock toybox has it |
| `mkswap` | Android 15+ | Yes | Older Android: BusyBox only |
| `vi` | Android 6+ | Yes | Both have basic vi |
| `nohup` | Android 6+ | Yes | Both work |
| `flock` | Android 6+ | Yes | File locking |
| `inotifyd` | Android 6+ | Yes | File monitoring |

---

## 3. jq on Android

### 3.1 Availability

**jq is NOT available on stock Android.** It is not part of toybox or the AOSP command set. Modules that need JSON processing must bundle their own jq binary.

### 3.2 Bundling jq in a Module

The standard approach is to include a statically-linked jq binary for each supported architecture:

```
module/
  common/
    jq/
      jq-arm64-v8a       # ARM64 (most modern devices)
      jq-armeabi-v7a      # ARM 32-bit (legacy)
      jq-x86_64           # x86_64 (emulators, ChromeOS)
      jq-x86              # x86 32-bit (rare)
```

**Installation logic in customize.sh:**

```sh
# Detect architecture and install correct jq binary
case "$ARCH" in
    arm64) JQ_ARCH="arm64-v8a" ;;
    arm)   JQ_ARCH="armeabi-v7a" ;;
    x64)   JQ_ARCH="x86_64" ;;
    x86)   JQ_ARCH="x86" ;;
esac

cp "$MODPATH/common/jq/jq-${JQ_ARCH}" "$MODPATH/jq"
chmod 755 "$MODPATH/jq"

# Verify it works
if ! "$MODPATH/jq" --version >/dev/null 2>&1; then
    abort "jq binary failed to execute on this device"
fi
```

**Where to get jq binaries:**

1. **Official releases:** https://jqlang.org/download/ -- provides ARM64 and AMD64 Linux binaries (statically linked, work on Android)
2. **Cross-compiled collections:** https://github.com/Zackptg5/Cross-Compiled-Binaries-Android (archived but still useful)
3. **Build from source:** Cross-compile with Android NDK using `--host=aarch64-linux-android`

Source: https://jqlang.org/download/

### 3.3 Usage in Module Scripts

```sh
# Define jq path relative to module directory
MODDIR="${0%/*}"
JQ="$MODDIR/jq"

# Read a value from JSON config
mode=$("$JQ" -r '.mode' "$CONFIG_FILE")

# Write/update a value (atomic pattern)
"$JQ" '.mode = "whiteout"' "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" \
    && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

# Read an array
"$JQ" -r '.packages[]' "$CONFIG_FILE" | while IFS= read -r pkg; do
    echo "Processing: $pkg"
done

# Conditional update
"$JQ" --arg pkg "$PACKAGE" \
    'if .debloated | index($pkg) then . else .debloated += [$pkg] end' \
    "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" \
    && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

# Check if JSON is valid before processing
if ! "$JQ" empty "$CONFIG_FILE" 2>/dev/null; then
    echo "ERROR: Corrupt JSON in $CONFIG_FILE"
    # Fall back to backup
fi
```

### 3.4 Known Issues with jq on Android

1. **Binary compatibility:** Statically-linked binaries work best. Dynamically-linked jq will fail if libc versions mismatch. Always use static builds.

2. **Performance:** jq is fast for typical module configs (< 1MB). For larger files, consider:
   ```sh
   # Stream processing for large arrays
   "$JQ" -c '.packages[]' large_file.json | while IFS= read -r item; do
       # Process one item at a time
   done
   ```

3. **Temp file on same filesystem:** Always write tmp files on the same filesystem as the target to ensure `mv` is atomic:
   ```sh
   # GOOD: tmp file next to target (same filesystem = atomic mv)
   "$JQ" '.key = "val"' /data/adb/scalpel/config.json > /data/adb/scalpel/config.json.tmp
   mv /data/adb/scalpel/config.json.tmp /data/adb/scalpel/config.json

   # BAD: tmp in /tmp might be different filesystem (mv = copy+delete, not atomic)
   "$JQ" '.key = "val"' /data/adb/scalpel/config.json > /tmp/config.json.tmp
   ```

4. **SELinux contexts:** After writing files in `/data/adb/`, you may need to restore SELinux context:
   ```sh
   chcon u:object_r:adb_data_file:s0 /data/adb/scalpel/config.json
   ```

---

## 4. File Operations

### 4.1 Atomic File Writes

On Android (ext4/f2fs), `mv` (rename) within the same filesystem is **atomic** per POSIX. This is the standard pattern for safe file updates:

```sh
# Atomic write pattern: write to temp, then rename
write_json_atomic() {
    local target="$1"
    local content="$2"
    local tmp="${target}.tmp.$$"

    printf '%s\n' "$content" > "$tmp"
    sync  # Flush to disk (optional but safer)
    mv "$tmp" "$target"
}

# With jq:
update_config() {
    local config="$1"
    local filter="$2"
    local tmp="${config}.tmp.$$"

    "$JQ" "$filter" "$config" > "$tmp" || {
        rm -f "$tmp"
        return 1
    }
    mv "$tmp" "$config"
}
```

**Why this matters:** If the device loses power during a write, only the tmp file is corrupted. The original file remains intact. Without this pattern, a half-written file can corrupt your config.

**Important filesystem note:** `mv` across filesystems is NOT atomic (it copies then deletes). Always keep tmp files on the same partition as the target.

### 4.2 /proc and /sys Filesystem Access

Module scripts have full access to `/proc` and `/sys` when running as root:

```sh
# Read kernel version
cat /proc/version

# Read memory info (alternative to 'free' command)
cat /proc/meminfo

# Read mount information
cat /proc/mounts
# Or more detailed:
cat /proc/self/mountinfo

# Check if a process exists
[ -d "/proc/$pid" ] && echo "Process $pid is running"

# Read process cmdline
cat /proc/$pid/cmdline | tr '\0' ' '

# Check SELinux mode
cat /proc/self/attr/current
# Or:
cat /sys/fs/selinux/enforce    # 1 = enforcing, 0 = permissive

# Read CPU information
cat /proc/cpuinfo

# Kernel module parameters
cat /sys/module/MODULE_NAME/parameters/PARAM_NAME

# Block device info
cat /proc/partitions
ls /sys/block/

# Overlayfs check (critical for debloat modules)
cat /proc/filesystems | grep overlay
# If present, overlayfs is supported

# Check if a filesystem is mounted
grep -q "^overlay /system" /proc/mounts && echo "overlayfs on /system"
```

### 4.3 SELinux Context Handling

Android uses SELinux (Security-Enhanced Linux) as a Mandatory Access Control (MAC) layer on top of standard UNIX DAC permissions. Module developers must handle SELinux contexts correctly.

#### Viewing SELinux Contexts

```sh
# List files with SELinux contexts
ls -Z /data/adb/modules/
# Example output:
# u:object_r:adb_data_file:s0  scalpel

# View context of a specific file
ls -Z /system/app/Calculator/Calculator.apk
# u:object_r:system_file:s0

# View current process context
id -Z
# u:r:magisk:s0  (when running via Magisk)

# Check if SELinux is enforcing
getenforce
# Returns: Enforcing or Permissive
```

#### Setting SELinux Contexts

```sh
# Set a specific context (change context)
chcon u:object_r:system_file:s0 /path/to/file

# Restore default context (from file_contexts)
restorecon /path/to/file
restorecon -R /path/to/directory    # Recursive

# Run a command in a specific SELinux context
runcon u:r:magisk:s0 /path/to/script

# Common contexts for module files:
# u:object_r:system_file:s0        -- system partition files
# u:object_r:adb_data_file:s0      -- /data/adb/ files
# u:object_r:app_data_file:s0      -- /data/data/ app files
# u:object_r:priv_app:s0           -- privileged app APKs
# u:object_r:system_app:s0         -- system app processes
```

#### Practical SELinux Patterns for Modules

```sh
# After creating files that should look like system files:
set_system_context() {
    local path="$1"
    chcon -R u:object_r:system_file:s0 "$path" 2>/dev/null
}

# After writing to /data/adb/:
set_module_context() {
    local path="$1"
    chcon u:object_r:adb_data_file:s0 "$path" 2>/dev/null
}

# Fix permissions for a systemized app:
fix_app_perms() {
    local app_dir="$1"
    chmod 755 "$app_dir"
    chmod 644 "$app_dir"/*.apk
    chown 0:0 "$app_dir" "$app_dir"/*.apk
    chcon -R u:object_r:system_file:s0 "$app_dir"
}
```

### 4.4 File Permission Model (DAC + MAC)

Android uses a **dual-layer** permission model:

1. **DAC (Discretionary Access Control)** -- Standard UNIX permissions (owner/group/other, rwx bits)
2. **MAC (Mandatory Access Control)** -- SELinux policies that override DAC

**Both must allow access** for an operation to succeed. Even root (UID 0) is constrained by SELinux in enforcing mode.

```sh
# Standard permission operations (DAC)
chmod 755 /path/to/dir         # rwxr-xr-x
chmod 644 /path/to/file        # rw-r--r--
chown root:root /path/to/file  # owner:group
chown 0:0 /path/to/file        # same (numeric)
chown 1000:1000 /path/to/file  # system user

# Common Android UID/GID mappings:
# 0:0       root:root
# 1000:1000 system:system
# 2000:2000 shell:shell
# 10000+    app UIDs (10000 + app_id)

# Standard permissions for system directories and files:
# /system/app/AppName/           755 root:root
# /system/app/AppName/App.apk    644 root:root
# /system/priv-app/AppName/      755 root:root
# /system/priv-app/AppName/A.apk 644 root:root
# /system/etc/permissions/*.xml   644 root:root
# /data/adb/modules/modid/       755 root:root
```

---

## 5. Package Manager (pm) Commands

### 5.1 Availability by Boot Stage

The `pm` command communicates with Android's PackageManagerService (PMS) via binder. PMS runs inside `system_server`, which starts **after** post-fs-data.

| Command | post-fs-data | service.sh (early) | service.sh (after boot_completed) | Full boot |
|---------|-------------|-------------------|-----------------------------------|-----------|
| `pm list packages` | **FAILS** | Unreliable | **YES** | **YES** |
| `pm path` | **FAILS** | Unreliable | **YES** | **YES** |
| `pm disable-user` | **FAILS** | Unreliable | **YES** | **YES** |
| `pm enable` | **FAILS** | Unreliable | **YES** | **YES** |
| `pm uninstall -k --user 0` | **FAILS** | Unreliable | **YES** | **YES** |
| `pm install-existing` | **FAILS** | Unreliable | **YES** | **YES** |

**Waiting for PMS in service.sh:**

```sh
wait_for_pms() {
    local timeout="${1:-60}"
    local count=0
    while [ "$count" -lt "$timeout" ]; do
        if pm path android >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done
    return 1  # PMS never became available
}

# Usage:
if wait_for_pms 60; then
    # PMS is ready, safe to run pm commands
    pm list packages -s
else
    echo "ERROR: PMS did not start within 60 seconds"
fi
```

### 5.2 Command Reference

#### pm list packages -- List Installed Packages

```sh
# List all packages
pm list packages

# List system packages only
pm list packages -s

# List third-party packages only
pm list packages -3

# List disabled packages
pm list packages -d

# List enabled packages
pm list packages -e

# Show APK file path alongside package name
pm list packages -f

# Filter by name
pm list packages -f "com.google"

# List uninstalled packages (including --user 0 uninstalled)
pm list packages -u

# Output format:
# package:com.android.calculator2
# With -f:
# package:/system/app/Calculator/Calculator.apk=com.android.calculator2
```

**What it does at PMS level:** Queries PackageManagerService.getInstalledPackages() with appropriate flags. The `-s` flag filters for FLAG_SYSTEM, `-3` excludes FLAG_SYSTEM.

#### pm path -- Get APK Path for Package

```sh
# Get the APK path for a package
pm path com.android.calculator2
# Output: package:/system/app/Calculator/Calculator.apk

# For split APKs (common on modern Android):
pm path com.google.android.gms
# package:/system/priv-app/PrebuiltGmsCorePi/PrebuiltGmsCorePi.apk
# package:/data/app/~~hash/com.google.android.gms-hash/split_config.arm64_v8a.apk
# package:/data/app/~~hash/com.google.android.gms-hash/split_config.en.apk
```

**What it does at PMS level:** Calls ApplicationPackageManager.getPackageInfo() and returns the sourceDir path from ApplicationInfo.

#### pm disable-user --user 0 -- Disable Package for User

```sh
# Disable a package for the primary user (user 0)
pm disable-user --user 0 com.example.bloatware
# Output: Package com.example.bloatware new state: disabled-user

# Check state after disabling
pm list packages -d | grep com.example.bloatware
```

**What it does at PMS level:** Calls PackageManager.setComponentEnabledSetting() with COMPONENT_ENABLED_STATE_DISABLED_USER. The APK **remains on disk**. The app:
- Disappears from launcher
- Stops running services
- Is excluded from intents
- Can be re-enabled through Settings UI or `pm enable`
- Data is preserved

**Reversibility:** Fully reversible. Users can re-enable from Settings > Apps.

#### pm enable -- Re-enable a Disabled Package

```sh
# Re-enable a previously disabled package
pm enable com.example.bloatware
# Output: Package com.example.bloatware new state: enabled

# Enable for specific user
pm enable --user 0 com.example.bloatware
```

**What it does at PMS level:** Calls setComponentEnabledSetting() with COMPONENT_ENABLED_STATE_ENABLED. Restores the app to its original state.

#### pm uninstall -k --user 0 -- Uninstall for User (Keep Data)

```sh
# Uninstall for primary user, keeping data
pm uninstall -k --user 0 com.example.bloatware
# Output: Success

# Without -k (also removes data):
pm uninstall --user 0 com.example.bloatware
```

**What it does at PMS level:** Calls PackageManager.deletePackageAsUser() for user 0 only. The APK **remains on disk** (it is a system app). The effect:
- App completely removed from user 0's view
- Not in launcher, not in Settings > Apps for that user
- With `-k`: `/data/data/com.example.bloatware/` is **preserved**
- Without `-k`: app data is deleted
- **Cannot be re-enabled from Settings** -- must use `pm install-existing`
- Survives reboots (the PMS state persists in `/data/system/users/0/package-restrictions.xml`)

**This is the strongest "soft disable" available.** It is more persistent than `pm disable-user` because users cannot accidentally re-enable it from Settings.

**Critical for systemization:** When promoting an app to system, you must `pm uninstall -k --user 0` the user-space copy first, then reboot so PMS picks up the system copy. This is what Terminal Systemizer gets wrong -- it reboots without the uninstall step, causing the user copy to shadow the system copy.

#### pm install-existing -- Restore Uninstalled System App

```sh
# Restore a previously uninstalled-for-user system app
pm install-existing --user 0 com.example.bloatware
# Output: Package com.example.bloatware installed for user: 0
```

**What it does at PMS level:** Calls installExistingPackageAsUser(). Only works for system apps where the APK is still on disk. Re-registers the package for the specified user.

**This is the undo for `pm uninstall --user 0`.** If the APK was physically removed (whiteout, overlayfs), this will fail.

### 5.3 pm Command Decision Matrix for Debloating

| Goal | Command | Data Preserved | Reversible via Settings | Reversible via pm | Survives Reboot |
|------|---------|---------------|------------------------|-------------------|-----------------|
| Soft disable (user can undo) | `pm disable-user --user 0` | Yes | **Yes** | `pm enable` | Yes |
| Hard disable (user cannot undo) | `pm uninstall -k --user 0` | Yes | **No** | `pm install-existing` | Yes |
| Hard disable + wipe data | `pm uninstall --user 0` | **No** | **No** | `pm install-existing` | Yes |
| Physical removal (strongest) | Whiteout/OverlayFS + above | -- | No | Module removal + reboot | Yes (module) |

---

## 6. Property System

### 6.1 getprop / setprop

Android's property system is a shared key-value store accessible from both Java and native code. Properties are stored in shared memory and are extremely fast to read.

```sh
# Read a property
getprop ro.build.version.sdk         # API level (e.g., "34")
getprop ro.build.version.release     # Android version (e.g., "14")
getprop ro.product.model             # Device model
getprop ro.product.manufacturer      # Device manufacturer

# Read with default value (if property is empty/unset)
getprop ro.custom.prop "default_value"

# Set a property (requires root)
setprop my.custom.property "value"

# CRITICAL: Do NOT use setprop in post-fs-data.sh
# It will DEADLOCK the boot process. Use instead:
resetprop -n my.custom.property "value"
# The -n flag means "don't trigger property_service notification"
```

### 6.2 sys.boot_completed

The most important property for module developers. Set to `"1"` when Android finishes booting.

```sh
# Check if boot is completed
if [ "$(getprop sys.boot_completed)" = "1" ]; then
    echo "Boot is complete, all services running"
fi

# Wait for boot to complete (common pattern in service.sh)
wait_boot_complete() {
    local timeout="${1:-120}"
    local count=0
    while [ "$(getprop sys.boot_completed)" != "1" ]; do
        if [ "$count" -ge "$timeout" ]; then
            return 1
        fi
        sleep 1
        count=$((count + 1))
    done
    return 0
}
```

**Timeline:** `sys.boot_completed` is set by ActivityManagerService after the boot animation finishes and the launcher is displayed. This is typically 30-90 seconds after power on.

### 6.3 Common Properties Modules Check

#### Boot State Properties

```sh
# Boot stages (set progressively during boot)
getprop sys.boot_completed           # "1" when boot is done
getprop dev.bootcomplete             # "1" -- older property, same purpose
getprop init.svc.bootanim            # "running" or "stopped"
getprop init.svc.zygote              # "running" when zygote is up
getprop sys.oem_unlock_allowed       # "0" or "1"
```

#### Device Identity

```sh
getprop ro.build.version.sdk         # API level: "34"
getprop ro.build.version.release     # Android version: "14"
getprop ro.build.version.security_patch  # Security patch date
getprop ro.build.display.id          # Build ID string
getprop ro.product.model             # Device model name
getprop ro.product.brand             # Brand name
getprop ro.product.name              # Product name
getprop ro.product.device            # Device codename
getprop ro.product.cpu.abi           # Primary ABI: "arm64-v8a"
getprop ro.product.cpu.abilist       # All supported ABIs
getprop ro.hardware                  # Hardware platform
getprop ro.board.platform            # Board platform
```

#### Security / SELinux

```sh
getprop ro.build.selinux             # "1" if SELinux enabled
getprop ro.boot.verifiedbootstate    # "green", "yellow", "orange"
getprop ro.debuggable                # "0" or "1"
getprop ro.secure                    # "1" on production builds
```

#### Root Manager Detection via Properties

```sh
# Magisk properties (may be hidden by MagiskHide/DenyList)
getprop init.svc.magiskd              # Magisk daemon status
getprop magisk.version                # Magisk version if visible

# Custom properties set by modules via system.prop:
# Any property in $MODDIR/system.prop is loaded at boot
```

#### Filesystem / Encryption

```sh
getprop ro.crypto.state              # "encrypted" or "unencrypted"
getprop ro.crypto.type               # "file" (FBE) or "block" (FDE)
getprop vold.decrypt                 # Encryption state during boot
```

### 6.4 Properties in Module system.prop

Modules can define properties to be loaded at boot by creating a `system.prop` file in the module root:

```properties
# module/system.prop
# These properties are loaded during boot

# Custom properties
persist.my.module.enabled=1
my.module.version=1.0.0

# Properties starting with "persist." survive reboots
# Properties without "persist." are lost on reboot
# Properties starting with "ro." are read-only (set once at boot)
```

**Important:** `system.prop` properties are loaded between post-fs-data and late_start service. They are not available during post-fs-data.sh.

---

## 7. Key Android Paths

### 7.1 System Partitions

Modern Android uses multiple partitions for system files:

| Partition | Mount Point | Contents | Writable? |
|-----------|-------------|----------|-----------|
| system | `/system` | Core Android OS, apps, framework | **No** (read-only) |
| vendor | `/vendor` | SoC-specific HALs, firmware, drivers | **No** (read-only) |
| product | `/product` | OEM customizations, carrier apps | **No** (Android 9+) |
| system_ext | `/system_ext` | System extensions | **No** (Android 11+) |
| odm | `/odm` | ODM-specific customizations | **No** (Android 10+) |
| oem | `/oem` | OEM overlay | **No** (legacy, rare) |

**Note:** On many devices, `/vendor`, `/product`, and `/system_ext` are actually sub-directories of `/system` mounted as overlays, not separate physical partitions.

#### System App Directories

```
/system/app/                    # Regular system apps
/system/app/Calculator/
  Calculator.apk
/system/priv-app/               # Privileged system apps (more permissions)
/system/priv-app/Settings/
  Settings.apk

/vendor/app/                    # Vendor apps
/vendor/priv-app/               # Vendor privileged apps (rare)

/product/app/                   # OEM/carrier apps (Android 9+)
/product/priv-app/              # OEM privileged apps

/system_ext/app/                # System extension apps (Android 11+)
/system_ext/priv-app/           # System extension privileged apps
```

**Regular system apps** (`/system/app/`) run with standard permissions. **Privileged apps** (`/system/priv-app/`) can request `signatureOrSystem` permissions that regular apps cannot.

### 7.2 Module Directory Structure

All three root managers use `/data/adb/modules/` for module storage:

```
/data/adb/modules/
  module_id/
    module.prop          # Required: metadata (id, name, version, etc.)
    post-fs-data.sh      # Optional: runs at post-fs-data stage
    service.sh           # Optional: runs at late_start service stage
    system.prop          # Optional: properties loaded at boot
    sepolicy.rule        # Optional: SELinux policy additions
    system/              # Optional: files to overlay on /system
      app/
        AppName/
          App.apk
      priv-app/
        AppName/
          App.apk
      etc/
        permissions/
          privapp-permissions-myapp.xml
    vendor/              # Optional: files to overlay on /vendor
    product/             # Optional: files to overlay on /product
    remove               # Marker: if present, module is removed at next boot
    disable              # Marker: if present, module is disabled
    update               # Marker: set during module update
    skip_mount           # Marker: if present, system/ files are not mounted
    uninstall.sh         # Optional: cleanup script run on module removal
```

**Root manager data directories:**

| Root Manager | Base Directory | Core Binaries | BusyBox |
|--------------|---------------|---------------|---------|
| Magisk | `/data/adb/magisk/` | `magisk`, `magiskboot`, `magiskinit` | `busybox` |
| KernelSU | `/data/adb/ksu/` | `ksud` | `bin/busybox` |
| APatch | `/data/adb/ap/` | `apd` | `bin/busybox` |

### 7.3 User App and Data Directories

```sh
# User-installed apps (APK storage)
/data/app/
  ~~random_hash/
    com.example.app-random_hash/
      base.apk                    # Main APK
      split_config.arm64_v8a.apk   # ABI split (if exists)
      split_config.xxhdpi.apk      # Density split (if exists)
      lib/                         # Native libraries (extracted)

# App private data directories
/data/data/com.example.app/        # Credential-encrypted storage
  shared_prefs/                    # SharedPreferences XMLs
  databases/                       # SQLite databases
  files/                           # Internal files
  cache/                           # Cache directory

# Device-encrypted storage (available before user unlock)
/data/user_de/0/com.example.app/

# External storage
/data/media/0/                     # Emulated /sdcard for user 0
/storage/emulated/0/               # Accessible path to above

# Package Manager state files
/data/system/packages.xml          # Master package database
/data/system/packages.list         # Quick package -> UID mapping
/data/system/users/0/
  package-restrictions.xml         # Per-user package states (disabled, etc.)
```

### 7.4 Privileged App Permission XML Locations

When systemizing an app into `/system/priv-app/`, it needs a permissions allowlist XML to be granted privileged permissions.

**XML file locations by partition:**

| Partition | XML Directory |
|-----------|---------------|
| `/system` | `/system/etc/permissions/` |
| `/product` | `/product/etc/permissions/` |
| `/vendor` | `/vendor/etc/permissions/` |
| `/system_ext` | `/system_ext/etc/permissions/` |

**For modules (overlayed via root manager):**

```
module/system/etc/permissions/privapp-permissions-com.example.app.xml
```

**XML format:**

```xml
<?xml version="1.0" encoding="utf-8"?>
<permissions>
    <privapp-permissions package="com.example.app">
        <!-- Grant specific privileged permissions -->
        <permission name="android.permission.INSTALL_PACKAGES"/>
        <permission name="android.permission.DELETE_PACKAGES"/>
        <permission name="android.permission.READ_PRIVILEGED_PHONE_STATE"/>

        <!-- Explicitly deny permissions you don't want granted -->
        <deny-permission name="android.permission.READ_CONTACTS"/>
    </privapp-permissions>
</permissions>
```

**Naming convention:** `privapp-permissions-PACKAGE_NAME.xml` or `privapp-permissions-DEVICE_NAME.xml`

**Critical:** Only permissions that are defined as `signature|privileged` in the framework need to be allowlisted. Regular permissions are granted through the normal permission system.

**Enforcement:** On Android 9+, set `ro.control_privapp_permissions=enforce` to strictly enforce the allowlist. Missing permissions will cause app crashes.

Source: https://source.android.com/docs/core/permissions/perms-allowlist

---

## 8. aapt on Android

### 8.1 Where to Find aapt/aapt2

**aapt is NOT in the standard Android system image.** It is part of the Android SDK build tools on desktop, not a device binary.

However, some OEMs and custom ROMs include it, and modules can bundle it:

```sh
# Possible locations on device (not guaranteed):
/system/bin/aapt                   # Rare, some OEMs include it
/system/bin/aapt2                  # Even rarer

# Check if available
which aapt 2>/dev/null && echo "aapt found" || echo "aapt not found"

# If not available, modules must bundle their own binary
# Similar to jq, bundle architecture-specific static binaries
```

**Sourcing aapt binaries for modules:**
- Extract from Android SDK: `$ANDROID_SDK/build-tools/{version}/aapt`
- Cross-compile from AOSP source
- Use pre-compiled Android binaries from repos like Zackptg5/Cross-Compiled-Binaries-Android

### 8.2 Extracting Information from APKs

#### Get Package Name

```sh
# Method 1: Using aapt (if available)
aapt dump badging /path/to/app.apk | grep "^package:" | sed "s/.*name='\([^']*\)'.*/\1/"
# Output: com.example.app

# Method 2: Using aapt2 (if available)
aapt2 dump badging /path/to/app.apk | grep "^package:" | head -1

# Method 3: Using pm (no aapt needed -- requires running PMS)
pm list packages -f | grep "com.example"
# Output: package:/system/app/Example/Example.apk=com.example.app

# Method 4: Parse AndroidManifest.xml directly (no aapt needed)
# The manifest is binary XML, so this requires decoding
# Simpler alternative using dumpsys:
dumpsys package com.example.app | grep "versionName"
```

#### Get Application Label (Human-Readable Name)

```sh
# Using aapt
aapt dump badging /path/to/app.apk | grep "application-label:" | sed "s/application-label:'\(.*\)'/\1/"
# Output: My Application

# Using aapt with locale-specific label
aapt dump badging /path/to/app.apk | grep "application-label-en:"
```

#### Get Permissions

```sh
# List all permissions required by an APK
aapt dump permissions /path/to/app.apk
# Output:
# package: com.example.app
# uses-permission: name='android.permission.INTERNET'
# uses-permission: name='android.permission.READ_CONTACTS'

# Alternative: extract from badging
aapt dump badging /path/to/app.apk | grep "uses-permission"

# Without aapt, using dumpsys (requires PMS):
dumpsys package com.example.app | grep -A 100 "requested permissions:" | grep "android.permission"
```

#### Get Version Information

```sh
# Using aapt
aapt dump badging /path/to/app.apk | grep "versionCode" | head -1
# Output: package: name='com.example.app' versionCode='123' versionName='1.2.3' ...

# Extract specific fields
aapt dump badging /path/to/app.apk | sed -n "s/.*versionCode='\([^']*\)'.*/\1/p"
aapt dump badging /path/to/app.apk | sed -n "s/.*versionName='\([^']*\)'.*/\1/p"
```

#### Get Min/Target SDK

```sh
aapt dump badging /path/to/app.apk | grep "sdkVersion"
# Output: sdkVersion:'21'
aapt dump badging /path/to/app.apk | grep "targetSdkVersion"
# Output: targetSdkVersion:'34'
```

### 8.3 aapt Alternatives (No aapt Binary Needed)

For modules that cannot or prefer not to bundle aapt, these alternatives work:

```sh
# 1. Use pm + dumpsys (requires running PMS)
get_package_info() {
    local pkg="$1"
    dumpsys package "$pkg" | grep -E "versionName|versionCode|codePath|flags"
}

# 2. Use pm path to find APK, then parse filename
get_apk_path() {
    local pkg="$1"
    pm path "$pkg" | sed 's/^package://' | head -1
}

# 3. Scan directories directly (works at post-fs-data, no PMS)
scan_system_apps() {
    local dir="$1"  # e.g., /system/app or /system/priv-app
    for apk_dir in "$dir"/*/; do
        local apk_name
        apk_name=$(basename "$apk_dir")
        local apk_file
        apk_file=$(find "$apk_dir" -name "*.apk" -maxdepth 1 | head -1)
        if [ -n "$apk_file" ]; then
            echo "$apk_name: $apk_file"
        fi
    done
}

# 4. Read packages.xml (dangerous, large file, works without PMS)
# WARNING: This file can be very large (10+ MB)
# Parse carefully -- prefer pm commands when PMS is available
grep "package name=" /data/system/packages.xml | sed 's/.*name="\([^"]*\)".*/\1/'
```

### 8.4 Limitations by Android Version

| Feature | Android 7-8 | Android 9-10 | Android 11+ | Android 14+ |
|---------|------------|-------------|-------------|-------------|
| aapt on device | Rare | Rare | Very rare | Almost never |
| aapt2 on device | No | No | No | No |
| pm list packages | Works | Works | Works | Works |
| pm path | Works | Works | Works | Works |
| dumpsys package | Works | Works | Works | Works |
| packages.xml | Readable | Readable | Readable | Readable |
| Split APKs | Possible | Common | Standard | Standard |

**Key version considerations:**
- Android 10+ uses `dm-verity` / `AVB2` which prevents direct system modifications; modules must use overlays
- Android 11+ enforces scoped storage, affecting how modules access `/sdcard`
- Android 14+ may have additional SELinux restrictions on `/data/system/` file access

---

## Appendix A: Shell Scripting Best Practices for Android Modules

### A.1 Portable Shell Patterns

```sh
# Always quote variables to prevent word splitting
local pkg="$1"
[ -z "$pkg" ] && return 1

# Use command -v instead of which (more portable)
if command -v jq >/dev/null 2>&1; then
    echo "jq available"
fi

# Prefer [ ] over [[ ]] for POSIX compatibility in ash
# (Both work in BusyBox ash, but [ ] is more portable)
if [ "$var" = "value" ]; then
    echo "match"
fi

# Read files line by line safely
while IFS= read -r line; do
    process "$line"
done < "$file"

# Arithmetic
count=$((count + 1))    # POSIX arithmetic
# Do NOT use: let count++  (bash-ism)

# String operations without external commands
filename="${path##*/}"    # basename equivalent
dirname="${path%/*}"      # dirname equivalent
extension="${file##*.}"   # get extension
noext="${file%.*}"        # strip extension

# Default values
: "${VAR:=default}"       # Set VAR to "default" if unset or empty
```

### A.2 Error Handling

```sh
# Always check command success
if ! cp "$src" "$dst"; then
    log_error "Failed to copy $src to $dst"
    return 1
fi

# Trap for cleanup
cleanup() {
    rm -f "$tmpfile"
}
trap cleanup EXIT

# Check if running as root
if [ "$(id -u)" != "0" ]; then
    echo "ERROR: Must run as root"
    exit 1
fi
```

### A.3 Logging to kmsg and File

```sh
# Write to kernel log (visible in dmesg and /proc/kmsg)
echo "MyModule: message here" > /dev/kmsg

# Write to both kmsg and log file
log() {
    local msg="[$(date '+%H:%M:%S')] $1"
    echo "$msg" >> /data/adb/mymodule/debug.log
    echo "MyModule: $msg" > /dev/kmsg
}
```

---

## Appendix B: Source References

| Topic | Source |
|-------|--------|
| Android shell history | https://android.googlesource.com/platform/system/core/+/master/shell_and_utilities/README.md |
| Toybox project | https://landley.net/toybox/about.html |
| Toybox roadmap / command list | https://landley.net/toybox/roadmap.html |
| Magisk module guide | https://github.com/topjohnwu/Magisk/blob/master/docs/guides.md |
| KernelSU module guide | https://kernelsu.org/guide/module.html |
| APatch module guide | https://apatch.dev/apm-guide.html |
| jq downloads | https://jqlang.org/download/ |
| Cross-compiled Android binaries | https://github.com/Zackptg5/Cross-Compiled-Binaries-Android |
| SELinux on Android | https://source.android.com/docs/security/features/selinux/concepts |
| Android property system | https://source.android.com/docs/core/architecture/configuration/add-system-properties |
| Privileged permissions allowlist | https://source.android.com/docs/core/permissions/perms-allowlist |
| Android partitions | https://source.android.com/docs/core/architecture/partitions/product-partitions |
| AAPT2 documentation | https://developer.android.com/tools/aapt2 |
| BusyBox documentation | https://wiki.alpinelinux.org/wiki/BusyBox |
