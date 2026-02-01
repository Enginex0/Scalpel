#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Mode: overlayfs char device whiteouts — hides app directories via mknod c 0 0 + xattr

SCALPEL_NUKE_LIST="${SCALPEL_DATA:-/data/adb/scalpel}/nuke_list.json"

# Overlay partition dirs to wipe on cleanup (mirrors bootloop.sh)
_WO_CLEANUP_DIRS="system system_ext vendor product odm oem \
mi_ext my_bigball my_carrier my_company my_engineering \
my_heytap my_manifest my_preload my_product my_region \
my_reserve my_stock"

_whiteout_helpers_loaded=""

_ensure_helpers() {
    local _tag="mode_whiteout"
    [ -n "$_whiteout_helpers_loaded" ] && return 0
    local helpers="${MODDIR:-/data/adb/modules/scalpel}/core/whiteout_helpers.sh"
    if [ ! -f "$helpers" ]; then
        log_e "$_tag" "whiteout_helpers.sh not found: $helpers"
        return 1
    fi
    . "$helpers"
    _whiteout_helpers_loaded=1
}

mode_probe() {
    grep -qF "overlay" /proc/filesystems 2>/dev/null || return 1
    command -v busybox >/dev/null 2>&1 || return 1
    busybox --list 2>&1 | grep -qF "mknod" || return 1
    busybox --list 2>&1 | grep -qF "setfattr" || return 1
    return 0
}

mode_debloat() {
    local _tag="mode_whiteout"
    local pkg="$1" app_path="$2"
    [ -z "$pkg" ] || [ -z "$app_path" ] && { log_e "$_tag" "debloat: missing args"; return 1; }

    _ensure_helpers || return 1

    local target_dir="${MODDIR:-/data/adb/modules/scalpel}"

    if ! whiteout_create "$target_dir" "$app_path"; then
        log_e "$_tag" "failed to whiteout $pkg ($app_path)"
        return 1
    fi

    if ! whiteout_verify "$target_dir" "$app_path"; then
        log_e "$_tag" "whiteout verification failed: $pkg"
        return 1
    fi

    log_i "$_tag" "whiteout $pkg"
    return 0
}

mode_restore() {
    local _tag="mode_whiteout"
    local pkg="$1" app_path="$2"
    [ -z "$pkg" ] || [ -z "$app_path" ] && { log_e "$_tag" "restore: missing args"; return 1; }

    _ensure_helpers || return 1

    whiteout_remove "${MODDIR:-/data/adb/modules/scalpel}" "$app_path"

    # Attempt to make PMS re-discover the package
    pm install-existing "$pkg" 2>/dev/null

    log_i "$_tag" "restored $pkg"
    return 0
}

mode_verify() {
    local pkg="$1" app_path="$2"
    [ -z "$app_path" ] && return 1

    _ensure_helpers || return 1

    whiteout_verify "${MODDIR:-/data/adb/modules/scalpel}" "$app_path"
}

mode_cleanup() {
    local _tag="mode_whiteout"
    local jq_bin="${MODDIR:-/data/adb/modules/scalpel}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    if [ ! -f "$SCALPEL_NUKE_LIST" ]; then
        log_d "$_tag" "no nuke list, nothing to clean"
        return 0
    fi

    _ensure_helpers || return 1

    local tmp="/data/local/tmp/.scalpel_wo_cleanup_$$"
    "$jq_bin" -r '.[] | "\(.package_name)\t\(.app_path)"' "$SCALPEL_NUKE_LIST" > "$tmp" 2>/dev/null
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

    # Remove all overlay directories from module dir
    local dir
    for dir in $_WO_CLEANUP_DIRS; do
        rm -rf "${MODDIR:?}/${dir}" 2>/dev/null
    done

    log_i "$_tag" "cleanup complete (failed=$failed)"
    return "$failed"
}
