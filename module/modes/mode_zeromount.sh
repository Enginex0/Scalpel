#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Mode: ZeroMount VFS — delegates to ZeroMount module via whiteouts + sync.sh

SCALPEL_NUKE_LIST="${SCALPEL_DATA:-/data/adb/scalpel}/nuke_list.json"
_ZM_SYNC="/data/adb/modules/zeromount/sync.sh"
_ZM_TRACKING="/data/adb/zeromount/module_paths/scalpel"

. "${MODDIR:-/data/adb/modules/scalpel}/core/whiteout_helpers.sh"

mode_probe() {
    local _tag="mode_zeromount"
    if [ ! -d "/data/adb/modules/zeromount" ]; then
        log_d "$_tag" "probe: zeromount module not installed"
        return 1
    fi
    if [ ! -f "$_ZM_SYNC" ]; then
        log_d "$_tag" "probe: sync.sh not found"
        return 1
    fi
    log_d "$_tag" "probe: zeromount available (sync.sh)"
    return 0
}

mode_debloat() {
    local _tag="mode_zeromount"
    local pkg="$1" app_path="$2"
    [ -z "$pkg" ] && { log_e "$_tag" "debloat called without package name"; return 1; }
    [ -z "$app_path" ] && { log_e "$_tag" "debloat called without app path"; return 1; }

    local moddir="${MODDIR:-/data/adb/modules/scalpel}"

    # Tracking file required for sync.sh to process our module
    mkdir -p "$(dirname "$_ZM_TRACKING")" 2>/dev/null
    touch "$_ZM_TRACKING" 2>/dev/null

    if ! whiteout_create "$moddir" "$app_path"; then
        log_e "$_tag" "whiteout creation failed: $pkg"
        return 1
    fi

    whiteout_fix_vendor_symlinks "$moddir"

    if sh "$_ZM_SYNC" scalpel >/dev/null 2>&1; then
        log_i "$_tag" "hidden $pkg (via zeromount sync)"
        return 0
    fi

    log_e "$_tag" "sync.sh failed for $pkg"
    return 1
}

mode_restore() {
    local _tag="mode_zeromount"
    local pkg="$1" app_path="$2" skip_sync="${3:-}"
    [ -z "$pkg" ] && { log_e "$_tag" "restore: missing package name"; return 1; }
    [ -z "$app_path" ] && { log_e "$_tag" "restore called without app path"; return 1; }

    local moddir="${MODDIR:-/data/adb/modules/scalpel}"

    whiteout_remove "$moddir" "$app_path"

    # skip_sync=1 used by mode_cleanup for batch efficiency
    [ "$skip_sync" = "1" ] && { log_d "$_tag" "restored $pkg (sync deferred)"; return 0; }

    if sh "$_ZM_SYNC" scalpel >/dev/null 2>&1; then
        log_i "$_tag" "restored $pkg (via zeromount sync)"
        return 0
    fi

    log_w "$_tag" "sync.sh failed after restore: $pkg"
    return 0
}

mode_verify() {
    local app_path="$2"
    [ -z "$app_path" ] && return 1

    local moddir="${MODDIR:-/data/adb/modules/scalpel}"
    whiteout_verify "$moddir" "$app_path"
}

mode_cleanup() {
    local _tag="mode_zeromount"
    local jq_bin="${MODDIR:-/data/adb/modules/scalpel}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    if [ ! -f "$SCALPEL_NUKE_LIST" ]; then
        log_d "$_tag" "no nuke list, nothing to clean"
        return 0
    fi

    local tmp="/data/local/tmp/.scalpel_zm_cleanup_$$"
    "$jq_bin" -r '.[] | "\(.package_name)\t\(.app_path)"' "$SCALPEL_NUKE_LIST" > "$tmp" 2>/dev/null
    if [ ! -s "$tmp" ]; then
        rm -f "$tmp" 2>/dev/null
        log_d "$_tag" "nuke list empty, nothing to clean"
        return 0
    fi

    local failed=0 count=0
    while IFS='	' read -r pkg app_path; do
        [ -z "$pkg" ] && continue
        mode_restore "$pkg" "$app_path" 1 || failed=1
        count=$((count + 1))
    done < "$tmp"
    rm -f "$tmp" 2>/dev/null

    # Single sync after all whiteouts removed
    if [ "$count" -gt 0 ]; then
        sh "$_ZM_SYNC" scalpel >/dev/null 2>&1 || log_w "$_tag" "final sync failed"
    fi

    return "$failed"
}
