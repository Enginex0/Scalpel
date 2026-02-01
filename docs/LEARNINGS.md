# Learnings

> **Purpose:** Institutional memory. Future you learning from past you.
> **Update:** Every time you discover something non-obvious.
> **Target:** Half page per entry. Quality over quantity.

---

## Template

```markdown
## YYYY-MM-DD: [Short Title]

**What happened:**
[Describe the situation - what were you trying to do?]

**What went wrong / What surprised you:**
[The unexpected part]

**Root cause:**
[Why did this happen? Get to the real reason.]

**Lesson:**
[What will you do differently? Be specific.]

**Action taken:**
[What did you change as a result?]
```

---

## Learnings Log

<!-- Newest first -->

### 2026-02-01: Module overlay with empty opaque directory hides app contents

**What happened:**
Implementing symlink mode for overlayfs-native root managers.

**What went wrong / surprised:**
An empty directory with the opaque xattr (trusted.overlay.opaque="y") in the
module overlay completely hides the original directory contents. This is
distinct from whiteout files (which hide individual entries) -- an opaque
directory hides everything inside in one operation.

**Root cause:**
overlayfs treats opaque directories as "this directory replaces the lower one
entirely." If the upper directory is empty and opaque, the merged view shows
an empty directory, effectively hiding all apps inside.

**Lesson:**
For symlink mode, create an empty opaque directory at the app path in the
module overlay. Simpler than per-file whiteouts and covers split APKs.

**Action taken:**
mode_symlink.sh uses empty opaque directories for app hiding.

---

### 2026-02-01: tmpfs mounts are ephemeral -- perfect for mountify mode

**What happened:**
Implementing mountify mode with tmpfs+overlayfs per partition.

**What went wrong / surprised:**
tmpfs mounts vanish completely on reboot. This is actually a feature, not a
bug -- it means mountify mode is inherently safe. If something goes wrong,
a reboot clears all changes. But it also means nuke.sh must re-apply all
mountify operations at every boot.

**Root cause:**
tmpfs lives in RAM only. When the device reboots, RAM is cleared, and all
tmpfs mounts disappear. The mount table returns to the stock state.

**Lesson:**
Design mountify mode assuming ephemeral state. Persist the configuration
(which apps to hide) but expect to re-mount at every boot. This is the
opposite of whiteout mode, which persists on disk.

**Action taken:**
mode_mountify.sh re-applies all tmpfs+overlayfs mounts via nuke.sh at every
post-fs-data. The nuke list (what to hide) persists in config.

---

### 2026-02-01: Negative BOOTCOUNT from corrupt file disables protection

**What happened:**
Auditing bootloop protection against edge cases during Phase C validation.

**What went wrong / surprised:**
If the bootloop counter file is corrupted to contain a negative number (e.g.,
BOOTCOUNT=-999), the 3-strike check (`[ "$count" -ge 3 ]`) never triggers
because -999 < 3. The device could bootloop indefinitely with "valid" counter
values that never reach the threshold.

**Root cause:**
The counter value was parsed but not clamped. A negative value passes integer
validation (it is a valid number) but defeats the >= 3 comparison.

**Lesson:**
Clamp counter values to >= 0. Preserve -1 as a special recovery marker if
needed, but any other negative value should be treated as corruption and
reset to 0.

**Action taken:**
bootloop.sh clamps BOOTCOUNT to >= 0 after reading (preserving -1 recovery
marker). Any value < -1 is reset to 0.

---

### 2026-02-01: config_init() resets all config variables -- save/restore overrides

**What happened:**
Scripts that set SCALPEL_MODE_OVERRIDE before calling config_init() lost
the override because config_init() re-reads all values from disk.

**What went wrong / surprised:**
config_init() sources the config file, which sets all variables to their
persisted values. Any in-memory override set before config_init() is
silently clobbered by the disk value.

**Root cause:**
Shell has no concept of "override vs default" -- all variables are equal.
config_init() unconditionally sets all variables from the config file.

**Lesson:**
If you need to override a config variable, do it AFTER config_init(), not
before. Or save the override, call config_init(), then restore it.

**Action taken:**
service.sh saves SCALPEL_MODE_OVERRIDE before config_init() and restores
it after if it was set as a runtime override.

---

### 2026-02-01: customize.sh cleanup must preserve bundled binaries (jq)

**What happened:**
customize.sh's cleanup phase was deleting the module's bin/ directory as
part of installation tidying.

**What went wrong / surprised:**
The bin/ directory contains bundled binaries (jq, aapt) that are needed at
runtime. Deleting them during install means all jq operations at boot fail.

**Root cause:**
Overly aggressive cleanup pattern (rm -rf on build artifacts) caught the
bin/ directory, which serves double duty as both a build artifact location
and a runtime dependency.

**Lesson:**
Never rm -rf directories that contain runtime dependencies. Use explicit
file lists for cleanup, or protect known-good directories.

**Action taken:**
customize.sh cleanup excludes bin/ from removal. Only removes install-time
temporary files.

---

### 2026-02-01: KSU/APatch REMOVE variable handles whiteouts at install time

**What happened:**
Discovering KernelSU module configuration options during documentation fetch.

**What went wrong / surprised:**
KSU and APatch support a REMOVE variable in module config that specifies
directories to remove (whiteout) at module install time. This means debloat
can take effect before the first boot -- the module system creates the
whiteouts during installation, not at post-fs-data.

**Root cause:**
KSU/APatch module system processes REMOVE during module installation/update,
creating overlay whiteouts that are applied when the module is loaded.

**Lesson:**
For KSU/APatch, populate the REMOVE variable during customize.sh for instant
debloat. This is faster and more reliable than waiting for post-fs-data.

**Action taken:**
customize.sh writes REMOVE entries for default debloat packages when running
on KSU/APatch.

---

### 2026-02-01: KSU override.description API replaces sed on module.prop

**What happened:**
Updating module description dynamically to show active mode and stats.

**What went wrong / surprised:**
KernelSU provides an override.description API that sets the module's
displayed description without modifying module.prop. This avoids sed
operations on module.prop, which are fragile (delimiter issues, encoding
problems, field reordering).

**Root cause:**
KSU module system reads override files for dynamic properties. The
module.prop file is the static default; override files take precedence
in the UI.

**Lesson:**
On KSU, use override.description for dynamic status display. On Magisk,
fall back to sed on module.prop (no alternative).

**Action taken:**
service.sh uses override.description on KSU, sed on module.prop for Magisk.

---

### 2026-02-01: KSU/APatch boot-completed.sh fires natively

**What happened:**
Discovering KSU module lifecycle hooks during documentation research.

**What went wrong / surprised:**
KSU and APatch provide a native boot-completed.sh hook that fires when
sys.boot_completed=1. This eliminates the need for getprop polling loops
in service.sh on these root managers.

**Root cause:**
KSU module system monitors boot properties and triggers boot-completed.sh
automatically. Magisk does not provide this hook.

**Lesson:**
Use boot-completed.sh on KSU/APatch for cleaner boot-completed handling.
Keep the getprop polling loop in service.sh for Magisk compatibility.

**Action taken:**
Created boot-completed.sh that calls the shared post_boot.sh helper.
service.sh still has polling loop for Magisk fallback.

---

### 2026-02-01: KernelSU enforces ~10s timeout on post-fs-data

**What happened:**
Testing long-running operations during the post-fs-data boot stage on KSU.

**What went wrong / surprised:**
KernelSU enforces an approximately 10-second timeout on post-fs-data.sh
execution. Scripts that take longer are killed, leaving operations incomplete
with no cleanup.

**Root cause:**
KSU's design philosophy is that post-fs-data should be fast (filesystem
mounts only). Long-running operations belong in service.sh or later.

**Lesson:**
Keep post-fs-data.sh operations under 10 seconds. Move any potentially
long operations (large nuke lists, network operations) to service.sh.
Add timing guards to detect and abort gracefully before timeout.

**Action taken:**
nuke.sh includes a timing guard that measures elapsed time and defers
remaining operations to service.sh if approaching the timeout threshold.

---

### 2026-02-01: pidof system_server has 5-30s false positive window

**What happened:**
Using `pidof system_server` to check if PackageManagerService is ready
before running pm commands.

**What went wrong / surprised:**
system_server starts early in the boot process, but PMS initialization
takes 5-30 seconds after system_server's PID appears. During this window,
`pidof system_server` returns a PID but pm commands fail because PMS hasn't
finished initialization.

**Root cause:**
system_server is a complex process that initializes many services
sequentially. PMS is one of the later services to become ready. The PID
exists as soon as the process is forked, long before all services are
initialized.

**Lesson:**
Use `pm path android` (which queries PMS directly) instead of `pidof
system_server` to check PMS readiness. pm path android succeeds only
when PMS is fully initialized and responding to commands.

**Action taken:**
Changed PMS readiness check from pidof to `pm path android` in service.sh.

---

### 2026-02-01: mknod c 0 0 alone is valid overlayfs whiteout -- setfattr is hardening

**What happened:**
Validating whiteout creation during Phase C audit.

**What went wrong / surprised:**
A character device node (mknod c 0 0) is sufficient for overlayfs to
recognize a whiteout on Linux 5.x+. The trusted.overlay.whiteout xattr
(set via setfattr) is best-effort hardening for kernels that check it,
but not required for basic whiteout functionality.

**Root cause:**
The overlayfs whiteout detection has evolved across kernel versions. Modern
kernels (5.x+) recognize c 0 0 as a whiteout by convention. The xattr is
an additional signal that some kernels check for extra validation.

**Lesson:**
Create c 0 0 device node as the primary whiteout mechanism. Apply setfattr
as best-effort hardening (non-fatal on failure). Do not fail the whiteout
operation if setfattr is missing or fails.

**Action taken:**
whiteout_helpers.sh treats setfattr failure as non-fatal. Logs a warning
but continues, since the c 0 0 device node alone is sufficient.

---

### 2026-02-01: setprop deadlocks at post-fs-data on KernelSU

**What happened:**
Attempting to use setprop to signal state during post-fs-data.sh on KSU.

**What went wrong / surprised:**
setprop at post-fs-data can deadlock on KernelSU because the property
service is not fully initialized. The setprop call blocks indefinitely,
causing the post-fs-data script to hang and eventually get killed by
KSU's timeout.

**Root cause:**
Android's property service (init) handles setprop requests. During early
boot (post-fs-data), the property service may not be processing requests
yet on some KSU configurations, causing setprop to block on the socket.

**Lesson:**
Avoid setprop at post-fs-data on KSU. Use file-based signaling (touch a
flag file) or reboot command chain instead. For emergency reboot, use
sysrq-trigger (/proc/sysrq-trigger) which bypasses init entirely.

**Action taken:**
Replaced setprop-based signaling with file-based flags in post-fs-data.sh.
Bootloop emergency reboot uses /proc/sysrq-trigger as fallback.

---

### 2026-01-31: Split APKs must all be copied during systemization

**What happened:**
Implementing systemization for apps that use Android App Bundles (split APKs).

**What went wrong / surprised:**
Split APKs store base.apk and split_config_*.apk files in the same directory.
Copying only base.apk leaves the splits behind, causing PMS to reject the
system copy or crash the app at launch due to missing resources/native code.

**Root cause:**
Android App Bundles split APKs by ABI, density, and locale. All splits must
be present for the app to function. PMS validates split consistency at boot.

**Lesson:**
Glob *.apk from the source directory to capture base.apk and all split_config
files. Never copy just the base APK.

**Action taken:**
promote.sh uses `*.apk` glob from the source directory to copy all splits.

---

### 2026-01-31: Terminal Systemizer's fatal flaw — no pm uninstall -k

**What happened:**
Analyzing why Terminal Systemizer fails to make apps appear as true system apps.

**What went wrong / surprised:**
Terminal Systemizer copies the APK to /system/priv-app/ but never calls
`pm uninstall -k --user 0`. Without this, PMS still sees the /data/app copy
and treats the system copy as an "updated system app" with sourceDir pointing
to /data/app instead of /system.

**Root cause:**
PMS boot scan reads packages.xml first (cached state). If it sees the app in
both /data/app and /system, it treats /data as the "update" and keeps
sourceDir = /data/app. Apps that check sourceDir think they are user apps.

**Lesson:**
Systemization requires `pm uninstall -k --user 0` after copying to /system
and before reboot. The -k flag preserves app data. Without this step, the
system copy is effectively invisible to the app itself.

**Action taken:**
promote.sh includes pm uninstall -k --user 0 as step 7 of the 9-step protocol.

---

### 2026-01-31: TAG variables are global and get clobbered by sourced scripts

**What happened:**
Running orchestrator scripts (service.sh) that source nuke.sh and verify.sh,
each of which defines their own TAG variable for logging.

**What went wrong / surprised:**
After calling nuke_run() or verify_run(), the TAG variable in service.sh was
overwritten by the sourced script's TAG. All subsequent log lines in service.sh
used the wrong TAG (e.g., "verify" instead of "service").

**Root cause:**
Shell doesn't have namespaces. All variables from sourced scripts share the
same global scope. TAG="verify" in verify.sh clobbers TAG="service" set by
the caller.

**Lesson:**
After calling functions from sourced scripts, re-assign TAG to the caller's
value. Alternatively, use unique variable names per script.

**Action taken:**
service.sh re-assigns TAG="service" after every sourced function call.

---

### 2026-01-31: getprop wait loops need a timeout

**What happened:**
Implementing boot_completed wait in service.sh using a getprop polling loop.

**What went wrong / surprised:**
A simple `while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done`
loop hangs forever if the device never reaches boot_completed (e.g., stuck
in setup wizard, boot animation crash).

**Root cause:**
getprop returns empty string when the property doesn't exist. Without a
timeout, the script blocks indefinitely, consuming a shell process slot.

**Lesson:**
Always add a timeout to getprop wait loops. 300 seconds (5 minutes) is
reasonable for boot_completed. Break out and log a warning on timeout.

**Action taken:**
service.sh uses a counter-based 300s timeout for the boot_completed wait loop.

---

### 2026-01-31: pm mode retry must force SCALPEL_MODE_OVERRIDE

**What happened:**
service.sh detects that pm mode failed at post-fs-data and re-runs nuke.

**What went wrong / surprised:**
Without forcing SCALPEL_MODE_OVERRIDE=pm, the retry calls detect_mode() which
may select a different mode (e.g., whiteout) based on current device state.
This means the retry doesn't actually use pm mode.

**Root cause:**
detect_mode() probes device capabilities at runtime. Between post-fs-data and
service.sh, conditions may have changed. The retry must use the same mode
that was intended, not whatever detect_mode() returns now.

**Lesson:**
When retrying a specific mode, export the mode override environment variable
to force the orchestrator to use exactly that mode.

**Action taken:**
service.sh sets SCALPEL_MODE_OVERRIDE=pm before calling nuke_run() on retry.

---

### 2026-01-31: bootloop_reset must run AFTER boot_completed

**What happened:**
Implementing boot counter reset in service.sh.

**What went wrong / surprised:**
Initially placed bootloop_reset() at the start of service.sh (before
boot_completed wait). This means the counter resets even if the device
never fully boots, defeating the 3-strike protection.

**Root cause:**
service.sh executes when the root manager starts late services, which can
happen before boot_completed. A device that reaches service.sh but crashes
before boot_completed would reset the counter and never trigger protection.

**Lesson:**
bootloop_reset must run AFTER boot_completed confirmation. The counter should
only reset when we are confident the boot succeeded.

**Action taken:**
Moved bootloop_reset() to after the boot_completed wait loop in service.sh.

---

### 2026-01-31: Bootloop counter files must NEVER be sourced

**What happened:**
Reading the bootloop counter from a persistent file at early boot.

**What went wrong / surprised:**
The original pattern (inherited from SAN) used `. "$PERSIST_DIR/count.sh"` to
read the counter. This sources the file as shell code, meaning any content
in the file gets executed. A corrupted or maliciously modified counter file
could execute arbitrary commands at early boot with root privileges.

**Root cause:**
Shell sourcing (`. file`) treats the entire file as executable code. A counter
file containing `BOOTCOUNT=1; rm -rf /` would execute the rm command. At early
boot, this runs as root with no sandbox.

**Lesson:**
Never source untrusted files to read values. Use grep to extract the value
and validate it as a number before use. This is especially critical at early
boot where the file lives on /data (survives module updates).

**Action taken:**
bootloop.sh uses `grep '^BOOTCOUNT=' | cut -d= -f2` to extract the value,
then validates it as a positive integer before arithmetic use.

---

### 2026-01-31: pm list packages needs fixed-string grep with prefix

**What happened:**
Verifying whether a package is disabled via `pm list packages -d`.

**What went wrong / surprised:**
Using `grep -q "$pkg"` caused substring collisions. A package name like
`com.android.stk` would match `com.android.stk.something` and vice versa.

**Root cause:**
`pm list packages -d` outputs lines like `package:com.example.app`. Without
fixed-string matching and the `package:` prefix, any substring match is a
false positive.

**Lesson:**
Always use `grep -qF "package:${pkg}"` (fixed-string with exact prefix) when
checking pm output. Never use plain grep on package names.

**Action taken:**
Used `grep -qF "package:${pkg}"` in mode_pm.sh verify function.

---

### 2026-01-31: Heredocs without quotes expand variables (code injection vector)

**What happened:**
Writing config files from shell scripts using heredocs.

**What went wrong / surprised:**
`<<EOF` (unquoted) expands variables and executes command substitutions inside
the heredoc. A malicious config value could inject shell commands during write.

**Root cause:**
Shell heredoc behavior: `<<EOF` = expand, `<<'EOF'` = literal. When writing
config files that contain shell variable syntax, unquoted heredocs silently
execute embedded commands.

**Lesson:**
Always use `<<'EOF'` (single-quoted delimiter) when writing config files or any
content that should be treated as literal text. Use unquoted `<<EOF` only when
you intentionally need variable expansion.

**Action taken:**
Used safe printf/echo writes in config.sh instead of heredocs with expansion.

---

### 2026-01-31: mksh case pattern glob * matches shell metacharacters

**What happened:**
Validating config mode_override values using shell case patterns in config.sh.

**What went wrong / surprised:**
A `case` pattern with `*` as a catch-all matches ANY characters, including
shell metacharacters. Nested case statements are needed for strict validation.

**Root cause:**
Shell case patterns use glob matching, not regex. The `*` pattern matches
everything including special characters that could cause issues downstream.

**Lesson:**
For strict validation of user input in shell, use nested case patterns or
explicit character class checks rather than relying on a single catch-all.

**Action taken:**
Implemented strict validation in config.sh using nested case with explicit
allowed values.

---

### 2026-01-31: Android toybox wc -c may have leading whitespace

**What happened:**
Checking file size for log rotation in logging.sh using `wc -c < file`.

**What went wrong / surprised:**
Android toybox `wc -c` with input redirection outputs only the number (no
filename), but may include leading whitespace. Arithmetic comparison fails
if the whitespace is not stripped.

**Root cause:**
Different `wc` implementations have different output formatting. Toybox is
minimal and its whitespace handling differs from GNU coreutils.

**Lesson:**
When using `wc -c` output in arithmetic contexts, strip whitespace first
or use a variable assignment that naturally trims it.

**Action taken:**
Used unquoted variable expansion in arithmetic context to handle whitespace.

---

### 2026-01-31: SAN categories.json has misclassifications

**What happened:**
Building categories.json by extending systemapp_nuker's 292-app database.

**What went wrong / surprised:**
Prof. Rigor validation found 5 issues: 1 duplicate key (rkpdapp appeared
twice), and 4 apps miscategorized (stk, skms.agent, osp.signin were
marked safe but are caution/essential).

**Root cause:**
Inherited incorrect classifications from the reference project. Automated
copy without manual review.

**Lesson:**
Never trust reference data blindly. Always validate classifications against
actual Android behavior. Essential apps that cause bootloops must be in the
essential tier regardless of what the reference says.

**Action taken:**
Fixed all 5 misclassifications. rkpdapp deduplicated, stk moved to caution,
skms.agent to caution, osp.signin to caution.

---

### 2026-01-31: eval in shell config is a security footgun

**What happened:**
Initial config.sh implementation used `eval` to read config variables, following
a pattern seen in many Magisk modules.

**What went wrong / surprised:**
Red Team Rex flagged this as CRITICAL. `eval` on user-controlled config files
allows arbitrary command execution. A malicious config value like
`MODE_OVERRIDE="; rm -rf /"` would execute during config load.

**Root cause:**
`eval` treats its argument as shell code. Any string from an untrusted source
(config file on /data, which survives module updates) becomes executable code.

**Lesson:**
Never use `eval` on user-controlled data. Use case/dispatch for known keys,
`read` with IFS for parsing, and validate every value before use.

**Action taken:**
Removed all eval from config.sh. Implemented safe key-value reading with
case dispatch, line-by-line parsing, and strict validation for every field.

---

### 2026-01-31: Whiteout creation requires directory-level targeting for split APKs

**What happened:**
Implementing overlayfs whiteout creation for system app debloating.

**What went wrong / surprised:**
Whiteout creation requires directory-level targeting (dirname of app_path) to
handle split APKs. Individual APK whiteouts miss split_config_*.apk files.

**Root cause:**
Split APKs store the base.apk and split_config_*.apk files in a directory.
Creating a whiteout on just the base APK leaves the splits visible, which can
cause PMS errors or partial app loading.

**Lesson:**
Always target the app directory (dirname of app_path), not individual APK files,
when creating whiteouts. This covers base APK, all splits, and any other
directory contents in a single operation.

**Action taken:**
mode_whiteout.sh creates whiteouts at the directory level to cover all split APK
variants.

---

### 2026-01-31: SELinux chcon --reference must use the original parent directory

**What happened:**
Setting SELinux contexts on whiteout files to match the original system app.

**What went wrong / surprised:**
SELinux chcon --reference must use the original parent directory (e.g.,
/system/app) not a hardcoded /system. Different partitions have different
SELinux contexts.

**Root cause:**
/system/app, /system/priv-app, /vendor/app, and /product/app all have distinct
SELinux contexts. Hardcoding /system as the reference source produces incorrect
labels for non-system partitions.

**Lesson:**
Use the actual parent directory of the app being whiteout'd as the chcon
--reference source. Never hardcode a partition path for SELinux context copying.

**Action taken:**
Whiteout helpers use dirname of the original app path as the chcon --reference
source.

---

### 2026-01-31: Vendor symlink fixup should run once post-batch, not per-app

**What happened:**
Implementing vendor partition symlink fixup for devices with non-standard
symlinks (mi_ext, my_bigball, etc.).

**What went wrong / surprised:**
Vendor symlink fixup (mi_ext, my_bigball, etc.) should run ONCE post-batch in
nuke.sh, not per-app in mode_debloat(). It's idempotent but O(N) redundant.

**Root cause:**
Running fixup per-app means N redundant traversals of the same symlink
resolution logic. Since the fixup is idempotent, running it once after all apps
are processed produces the same result with 1/N the cost.

**Lesson:**
Batch idempotent operations. If an operation produces the same result regardless
of how many times it runs, do it once after the batch completes.

**Action taken:**
nuke.sh calls vendor symlink fixup once after processing all apps, not per-app.

---

### 2026-01-31: verify.sh must read mode from status.json, not re-detect

**What happened:**
Implementing post-debloat verification in verify.sh.

**What went wrong / surprised:**
verify.sh must read the mode from status.json (written by nuke.sh) rather than
re-detecting, because mode availability can change between post-fs-data and
service.sh.

**Root cause:**
Mode detection probes device capabilities at runtime. Between post-fs-data
(when nuke runs) and service.sh (when verify runs), conditions may have changed
(e.g., a mount was undone, a device node appeared/disappeared). Re-detecting
could return a different mode than what was actually used to debloat.

**Lesson:**
Record which mode was used at debloat time and verify against that recorded
mode. Never re-detect mode during verification.

**Action taken:**
nuke.sh writes the active mode to status.json. verify.sh reads it from there.

---

### 2026-01-31: pm mode cannot execute at post-fs-data

**What happened:**
Testing pm disable mode during the post-fs-data boot stage.

**What went wrong / surprised:**
pm mode cannot execute at post-fs-data because system_server hasn't started.
Only filesystem-based modes (whiteout, zeromount, magisk, mountify, symlink)
work at early boot.

**Root cause:**
post-fs-data runs before system_server and PackageManagerService are
initialized. pm commands require PMS to be running, so any pm-based operation
(disable, enable, uninstall) will fail at this boot stage.

**Lesson:**
Filesystem-based modes work at any boot stage. PMS-dependent modes (pm) only
work after system_server is running (service.sh / boot_completed).

**Action taken:**
pm mode failure at post-fs-data is expected. service.sh detects this via
status.json (debloat_failed > 0) and re-runs nuke.

---

### 2026-01-31: Always call config_init() and log_init() in orchestrator scripts

**What happened:**
Running orchestrator scripts (nuke.sh, verify.sh) that depend on config and
logging subsystems.

**What went wrong / surprised:**
Without config_init(), SCALPEL_MODE_OVERRIDE is never loaded. Without
log_init(), file logging is silently disabled. Scripts appeared to work but
used defaults and lost log output.

**Root cause:**
Shell scripts don't have constructors. Each script must explicitly initialize
the subsystems it depends on. Forgetting to call init functions means the
subsystem uses uninitialized defaults silently.

**Lesson:**
Every orchestrator script must call config_init() and log_init() before any
other operations. Make this the first thing after sourcing the library files.

**Action taken:**
Added config_init() and log_init() calls at the top of nuke.sh and verify.sh.
