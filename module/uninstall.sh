#!/system/bin/sh
# shellcheck shell=bash disable=SC3043
# Called by root manager when user removes the module.
# Root manager handles $MODPATH deletion and overlay cleanup.
# We handle: PMS restoration (debloated + systemized apps) and $SCALPEL_DATA removal.

MODPATH="${MODPATH:-${0%/*}}"
SCALPEL_DATA="/data/adb/scalpel"
NUKE_LIST="${SCALPEL_DATA}/nuke_list.json"
SYSTEMIZE_LIST="${SCALPEL_DATA}/systemize_list.json"

_jq="${MODPATH}/bin/jq"
[ ! -x "$_jq" ] && _jq="jq"

_log() { echo "scalpel-uninstall: $1" >> /dev/kmsg 2>/dev/null; }

_log "starting module removal"

# Stop the monitor daemon before touching data files
_pid_file="${SCALPEL_DATA}/monitor.pid"
if [ -f "$_pid_file" ]; then
    _mpid="$(cat "$_pid_file" 2>/dev/null)"
    [ -n "$_mpid" ] && kill "$_mpid" 2>/dev/null
    rm -f "$_pid_file"
fi

# Restore debloated apps — pm install-existing makes PMS re-discover the package;
# pm enable covers pm-mode disabled apps that were never overlay-hidden
_tmp_pkgs="/data/local/tmp/scalpel_uninstall.$$"
if [ -f "$NUKE_LIST" ] && "$_jq" -e '.' "$NUKE_LIST" >/dev/null 2>&1; then
    _log "restoring debloated apps"
    "$_jq" -r '.[].package_name' "$NUKE_LIST" > "$_tmp_pkgs" 2>/dev/null
    _restore_fail=0
    while IFS= read -r pkg; do
        [ -z "$pkg" ] && continue
        if ! pm install-existing "$pkg" >/dev/null 2>&1; then
            pm enable "$pkg" >/dev/null 2>&1 || { _restore_fail=$((_restore_fail + 1)); _log "failed to restore: $pkg"; }
        fi
    done < "$_tmp_pkgs"
    [ "$_restore_fail" -gt 0 ] && _log "WARNING: ${_restore_fail} packages failed to restore"
    rm -f "$_tmp_pkgs"
fi

# Restore systemized apps — root manager removes the /system/priv-app overlay;
# pm install-existing re-registers the preserved /data/app copy with PMS
if [ -f "$SYSTEMIZE_LIST" ] && "$_jq" -e '.' "$SYSTEMIZE_LIST" >/dev/null 2>&1; then
    _log "restoring systemized apps"
    "$_jq" -r '.[].package_name' "$SYSTEMIZE_LIST" > "$_tmp_pkgs" 2>/dev/null
    while IFS= read -r pkg; do
        [ -z "$pkg" ] && continue
        pm install-existing "$pkg" >/dev/null 2>&1 || _log "failed to restore systemized: $pkg"
    done < "$_tmp_pkgs"
    rm -f "$_tmp_pkgs"
fi

# Clean persistent data — root manager handles $MODPATH, we handle $SCALPEL_DATA
[ -d "$SCALPEL_DATA" ] && rm -rf "$SCALPEL_DATA"

_log "module removal complete"
