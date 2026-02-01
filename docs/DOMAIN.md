# Domain Knowledge

## Required Reading

1. Plan file analysis — `/home/claudetest/.claude/plans/pure-prancing-bee.md` — Full analysis of 3 reference projects
2. KernelSU metamodule guide — `/home/claudetest/gki-build/METAMODULE_COMPLETE_GUIDE.md` — Boot lifecycle, mount system
3. Android PackageManagerService source — `frameworks/base/services/core/java/com/android/server/pm/` — How Android detects system apps

**Status:** [x] Completed

---

## Key Concepts

| Concept | Definition | Why It Matters |
|---------|------------|----------------|
| Overlayfs whiteout | Char device (c 0 0) with `trusted.overlay.whiteout` xattr — kernel treats as "file deleted" | Primary debloat mechanism for stock kernels |
| VFS path interception | Kernel hooks in `getname_flags()` rewrite paths before filesystem access | ZeroMount's approach — invisible to /proc/mounts |
| Magic mount | Root manager overlays module files onto /system at boot | Magisk's default module mounting strategy |
| FLAG_SYSTEM | `ApplicationInfo.flags & 0x1` — set when PMS scans app from system partition | Apps use this to detect system app status |
| PRIVATE_FLAG_PRIVILEGED | Set for apps in /system/priv-app — grants signatureOrSystem permissions | Required for apps needing elevated privileges |
| sourceDir | `ApplicationInfo.sourceDir` — path where PMS thinks the APK lives | Many apps check this instead of flags. Must point to /system for true systemization |
| packages.xml | `/data/system/packages.xml` — PMS persistent database of all installed packages | Contains codePath, flags, permissions for every package |
| Metamodule | Special KSU module (`metamodule=1`) that controls how ALL modules are mounted | Scalpel is NOT a metamodule — it's a regular module |
| privapp-permissions | XML in `/system/etc/permissions/` whitelisting dangerous permissions for priv-apps | Android 9+ crashes priv-apps without this XML |

---

## System Behavior

### Boot Lifecycle (Scalpel's execution points)

```
post-fs-data stage:
  1. KernelSU prunes modules, loads sepolicy
  2. Metamodule's post-fs-data.sh (if KSU)
  3. ──► SCALPEL post-fs-data.sh ◄──
  │    ├─ Bootloop check (3-strike counter)
  │    ├─ Mode detection (probe device capabilities)
  │    └─ Execute debloat mode (whiteouts/mounts)
  4. Other modules' post-fs-data.sh
  5. Metamodule's metamount.sh (mounts all modules)

service stage:
  1. Metamodule service.sh
  2. ──► SCALPEL service.sh ◄──
  │    ├─ Wait boot_completed
  │    ├─ Reset boot counter (boot succeeded)
  │    ├─ Scan partitions, build app list
  │    ├─ Restore disabled apps if needed
  │    ├─ Start background monitor
  │    └─ Update module.prop description
  3. Other modules' service.sh
```

### How Android Determines "System App"

```
PMS boot scan:
  1. Read packages.xml (cached state from last boot)
  2. Scan /system/app, /system/priv-app, /vendor/app, /product/app, etc.
  3. For each APK found in system partitions:
     ├─ New package? → Set FLAG_SYSTEM, codePath=/system/...
     └─ Already in packages.xml from /data/app?
        └─ Treat /data copy as "updated system app"
        └─ sourceDir remains /data/app (THIS IS THE BUG)
  4. Scan /data/app for user apps
```

### Whiteout Mechanism

```
Create:  mknod $path c 0 0
Context: chcon --reference=/system $path
Xattr:   setfattr -n trusted.overlay.whiteout -v y $path
Perms:   chmod 644 $path
Result:  overlayfs kernel interprets as "file deleted"
```

---

## Gotchas & Common Mistakes

| Mistake | Why It's Wrong | Correct Approach |
|---------|----------------|------------------|
| Copy APK to /system without removing /data copy | PMS keeps sourceDir=/data/app, app doesn't detect system status | `pm uninstall -k --user 0` before reboot |
| grep/sed for JSON parsing | Breaks on special chars, quotes, nested objects | Use bundled jq binary |
| Silent mount failures | User has no idea debloat didn't work | Log to kmsg + persistent file, verify after mount |
| Using $MODPATH outside installer context | Undefined variable — only set during customize.sh | Use $MODDIR (set at boot by root manager) |
| Hardcoded vendor partition paths | OEMs add custom partitions (mi_ext, my_bigball, etc.) | Scan /proc/mounts dynamically |
| No bootloop protection on debloat module | Whiteout of essential app = infinite boot loop | 3-strike counter in post-fs-data, reset in service.sh |
| Assuming overlayfs exists on all kernels | Some stock kernels disable it | Probe /proc/filesystems at install and boot |

---

## Questions Still Unanswered

- [x] Why does file-copy systemization sometimes fail? → Answered: PMS dual-copy precedence
- [ ] Android 14+ changes to system app validation (need testing)
- [ ] Split APK handling across all modes (need to verify whiteout behavior with splits)
