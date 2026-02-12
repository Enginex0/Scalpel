#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Mode: opaque overlay directories — hides app dirs via empty overlay entries with opaque xattr

SCALPEL_NUKE_LIST="${SCALPEL_DATA:-/data/adb/scalpel}/nuke_list.json"

# Keep in sync with core/whiteout_helpers.sh _WH_ALL_PARTITIONS / _WH_VENDOR_PARTS
_SYM_CLEANUP_DIRS="system system_ext vendor product odm oem \
mi_ext my_bigball my_carrier my_company my_engineering \
my_heytap my_manifest my_preload my_product my_region \
my_reserve my_stock"

_SYM_VENDOR_PARTS="mi_ext my_bigball my_carrier my_company my_engineering \
my_heytap my_manifest my_preload my_product my_region my_reserve my_stock"

mode_probe() {
    local _tag="symlink"
    if ! grep -qF "overlay" /proc/filesystems 2>/dev/null; then
        log_d "$_tag" "probe: overlayfs not in /proc/filesystems"
        return 1
    fi
    log_d "$_tag" "probe: overlayfs available"
    return 0
}

# Overlayfs needs the opaque xattr to suppress lower layer contents
_make_opaque() {
    local _tag="symlink"
    local dir="$1"

    if command -v setfattr >/dev/null 2>&1; then
        setfattr -n trusted.overlay.opaque -v y "$dir" 2>/dev/null && return 0
    fi
    if command -v busybox >/dev/null 2>&1; then
        busybox setfattr -n trusted.overlay.opaque -v y "$dir" 2>/dev/null && return 0
    fi

    # Without xattr, only Magisk magic mount hides lower-layer contents
    # KSU/APatch use overlayfs where empty dirs don't suppress the lower layer
    if [ -n "$KSU" ] || [ -n "$APATCH" ]; then
        log_e "$_tag" "setfattr unavailable on overlayfs system: $dir"
        return 1
    fi

    log_d "$_tag" "setfattr unavailable, relying on magic mount for $dir"
    return 0
}

_set_system_context() {
    chcon u:object_r:system_file:s0 "$1" 2>/dev/null
}

mode_debloat() {
    local _tag="symlink"
    local pkg="$1" app_path="$2"
    [ -z "$pkg" ] || [ -z "$app_path" ] && { log_e "$_tag" "debloat: missing args"; return 1; }

    local app_dir parent_dir
    app_dir="$(dirname "$app_path")"
    parent_dir="$(dirname "$app_dir")"

    local target_dir="${MODDIR:-/data/adb/modules/scalpel}"
    local overlay_dir="${target_dir}${app_dir}"

    # Idempotent — already an opaque empty directory
    if [ -d "$overlay_dir" ] && [ -z "$(ls -A "$overlay_dir" 2>/dev/null)" ]; then
        log_d "$_tag" "already debloated: $pkg"
        return 0
    fi

    # Clear stale entries from a previous mode or partial run
    [ -e "$overlay_dir" ] && rm -rf "$overlay_dir"

    mkdir -p "$overlay_dir" || { log_e "$_tag" "mkdir failed: $overlay_dir"; return 1; }
    chmod 755 "$overlay_dir"
    _set_system_context "$overlay_dir"

    chmod 755 "${target_dir}${parent_dir}" 2>/dev/null
    _set_system_context "${target_dir}${parent_dir}" 2>/dev/null

    if ! _make_opaque "$overlay_dir"; then
        rm -rf "$overlay_dir"
        return 1
    fi

    log_i "$_tag" "debloated $pkg ($app_dir)"
    return 0
}

mode_restore() {
    local _tag="symlink"
    local pkg="$1" app_path="$2"
    [ -z "$pkg" ] || [ -z "$app_path" ] && { log_e "$_tag" "restore: missing args"; return 1; }

    local app_dir
    app_dir="$(dirname "$app_path")"
    local target_dir="${MODDIR:-/data/adb/modules/scalpel}"
    local overlay_dir="${target_dir}${app_dir}"

    rm -rf "$overlay_dir" 2>/dev/null

    # Prune empty parent dirs up to module root
    local parent="$overlay_dir"
    while true; do
        parent="$(dirname "$parent")"
        [ "$parent" = "$target_dir" ] && break
        [ "$parent" = "/" ] && break
        rmdir "$parent" 2>/dev/null || break
    done

    pm install-existing "$pkg" 2>/dev/null

    log_i "$_tag" "restored $pkg"
    return 0
}

mode_verify() {
    local pkg="$1" app_path="$2"
    [ -z "$app_path" ] && return 1

    local app_dir
    app_dir="$(dirname "$app_path")"
    local overlay_dir="${MODDIR:-/data/adb/modules/scalpel}${app_dir}"

    [ -d "$overlay_dir" ] && [ -z "$(ls -A "$overlay_dir" 2>/dev/null)" ]
}

# OEM vendor dirs under /system/ in the overlay need to be symlinks
_fix_vendor_symlinks() {
    local _tag="symlink"
    local target_dir="$1"
    [ -z "$target_dir" ] && return 0

    local part
    for part in $_SYM_VENDOR_PARTS; do
        if [ -d "${target_dir}/system/${part}" ] && [ ! -L "/${part}" ]; then
            mv -f "${target_dir}/system/${part}" "${target_dir}/${part}" 2>/dev/null
            ln -sf "../${part}" "${target_dir}/system/${part}" 2>/dev/null
            log_d "$_tag" "fixed vendor symlink: ${part}"
        fi
    done
}

mode_cleanup() {
    local _tag="symlink"
    local jq_bin="${MODDIR:-/data/adb/modules/scalpel}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    if [ ! -f "$SCALPEL_NUKE_LIST" ]; then
        log_d "$_tag" "no nuke list, nothing to clean"
        return 0
    fi

    local tmp="/data/local/tmp/.scalpel_sym_cleanup_$$"
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

    local target_dir="${MODDIR:-/data/adb/modules/scalpel}"
    local dir
    for dir in $_SYM_CLEANUP_DIRS; do
        [ -e "${target_dir}/${dir}" ] && rm -rf "${target_dir}/${dir}" 2>/dev/null
    done

    log_i "$_tag" "cleanup complete (failed=$failed)"
    return "$failed"
}
