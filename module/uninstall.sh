#!/system/bin/sh
# shellcheck shell=bash disable=SC3043
# Called by root manager when user removes the module.
# Root manager handles $MODPATH deletion and overlay cleanup.
# We handle: PMS restoration (debloated + systemized apps) and $SCALPEL_DATA removal.

MODPATH="${MODPATH:-${0%/*}}"
SCALPEL_DATA="/data/adb/scalpel"
APP_LIST="${SCALPEL_DATA}/app_list.json"
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

# Restore debloated apps from both app_list.json and nuke_list.json
_tmp_pkgs="/data/local/tmp/scalpel_uninstall.$$"
: > "$_tmp_pkgs"
for _list in "$APP_LIST" "$NUKE_LIST"; do
    [ -f "$_list" ] && "$_jq" -e '.' "$_list" >/dev/null 2>&1 && \
        "$_jq" -r '.[].package_name' "$_list" >> "$_tmp_pkgs" 2>/dev/null
done

if [ -s "$_tmp_pkgs" ]; then
    _log "restoring debloated apps"
    _restore_fail=0
    _sorted="/data/local/tmp/scalpel_uninstall_sorted.$$"
    sort -u "$_tmp_pkgs" > "$_sorted"
    while IFS= read -r pkg; do
        [ -z "$pkg" ] && continue
        if ! pm install-existing "$pkg" >/dev/null 2>&1; then
            pm enable "$pkg" >/dev/null 2>&1 || { _restore_fail=$((_restore_fail + 1)); _log "failed to restore: $pkg"; }
        fi
    done < "$_sorted"
    rm -f "$_sorted"
    [ "$_restore_fail" -gt 0 ] && _log "WARNING: ${_restore_fail} packages failed to restore"
fi
rm -f "$_tmp_pkgs"

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
