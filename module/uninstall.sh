#!/system/bin/sh
MODDIR="${0%/*}"

. "$MODDIR/common.sh"

_log() { echo "scalpel: $1" > /dev/kmsg 2>/dev/null; }

_data="/data/adb/scalpel"
_pid="$_data/monitor.pid"
if [ -f "$_pid" ]; then
    _mpid="$(cat "$_pid" 2>/dev/null)"
    [ -n "$_mpid" ] && kill "$_mpid" 2>/dev/null
fi

if [ -n "$ABI" ] && [ -x "$BIN" ]; then
    "$BIN" uninstall 2>&1 | while IFS= read -r line; do _log "$line"; done
else
    _log "binary missing, manual cleanup"
    _nuke="$_data/nuke_list.json"
    if [ -f "$_nuke" ]; then
        for pkg in $(cat "$_nuke" 2>/dev/null | grep '"package_name"' | sed 's/.*: *"\(.*\)".*/\1/'); do
            pm install-existing "$pkg" >/dev/null 2>&1 || pm enable "$pkg" >/dev/null 2>&1
        done
    fi
fi

# KSU deletes the module dir on reboot — wipe our data dir too
rm -rf "$_data"

_log "module removal complete"
