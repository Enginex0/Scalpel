#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Mode: ZeroMount — standard whiteouts for VFS-level interception (no direct ZeroMount tool calls)

. "${MODDIR:-/data/adb/modules/scalpel}/core/whiteout_helpers.sh"

mode_probe() {
    [ -e "/dev/zeromount" ] || return 1
    return 0
}

mode_debloat() {
    local _tag="mode_zeromount"
    local pkg="$1" app_path="$2"
    [ -z "$pkg" ] && { log_e "$_tag" "debloat called without package name"; return 1; }
    [ -z "$app_path" ] && { log_e "$_tag" "debloat called without app path"; return 1; }

    local moddir="${MODDIR:-/data/adb/modules/scalpel}"

    if ! whiteout_create "$moddir" "$app_path"; then
        log_e "$_tag" "whiteout creation failed: $pkg"
        return 1
    fi

    whiteout_fix_vendor_symlinks "$moddir"
    log_i "$_tag" "hidden $pkg (whiteout created for VFS interception)"
    return 0
}

mode_restore() {
    local _tag="mode_zeromount"
    local pkg="$1" app_path="$2"
    [ -z "$pkg" ] && { log_e "$_tag" "restore: missing package name"; return 1; }
    [ -z "$app_path" ] && { log_e "$_tag" "restore called without app path"; return 1; }

    local moddir="${MODDIR:-/data/adb/modules/scalpel}"
    whiteout_remove "$moddir" "$app_path"
    log_i "$_tag" "restored $pkg"
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
    local nuke_list="${SCALPEL_DATA:-/data/adb/scalpel}/nuke_list.json"

    if [ ! -f "$nuke_list" ]; then
        log_d "$_tag" "no nuke list, nothing to clean"
        return 0
    fi

    local tmp="/data/local/tmp/.scalpel_zm_cleanup_$$"
    "$jq_bin" -r '.[] | "\(.package_name)\t\(.app_path)"' "$nuke_list" > "$tmp" 2>/dev/null
    if [ ! -s "$tmp" ]; then
        rm -f "$tmp" 2>/dev/null
        log_d "$_tag" "nuke list empty, nothing to clean"
        return 0
    fi

    local failed=0
    while IFS='	' read -r pkg app_path; do
        [ -z "$pkg" ] && continue
        mode_restore "$pkg" "$app_path" || failed=1
    done < "$tmp"
    rm -f "$tmp" 2>/dev/null

    return "$failed"
}
