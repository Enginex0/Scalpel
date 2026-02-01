#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Shared whiteout creation/removal/verification -- sourced by mode_whiteout and mode_magisk

# OEM vendor partitions that may be symlinked under /system/
_WH_VENDOR_PARTS="mi_ext my_bigball my_carrier my_company my_engineering \
my_heytap my_manifest my_preload my_product my_region my_reserve my_stock"

whiteout_create() {
    local _tag="whiteout_helpers"
    local target_dir="$1"
    local app_path="$2"
    [ -z "$target_dir" ] || [ -z "$app_path" ] && return 1

    local app_dir parent_dir
    app_dir="$(dirname "$app_path")"
    parent_dir="$(dirname "$app_dir")"

    local wo_path="${target_dir}${app_dir}"

    # Already a valid whiteout -- no-op
    [ -c "$wo_path" ] && return 0

    # Cannot mknod over an existing directory entry
    [ -e "$wo_path" ] && rm -rf "$wo_path"

    mkdir -p "${target_dir}${parent_dir}" || { log_e "$_tag" "mkdir failed: ${target_dir}${parent_dir}"; return 1; }
    chmod 755 "${target_dir}${parent_dir}"

    # busybox mknod preferred; toybox mknod (stock since Android 6) as fallback
    if ! busybox mknod "$wo_path" c 0 0 2>/dev/null && ! mknod "$wo_path" c 0 0 2>/dev/null; then
        log_e "$_tag" "mknod failed: $wo_path"
        return 1
    fi

    # mknod c 0 0 alone is a valid whiteout -- chcon and setfattr are best-effort hardening
    busybox chcon --reference="$parent_dir" "$wo_path" 2>/dev/null \
        || log_w "$_tag" "chcon failed for $wo_path, mknod whiteout still active"

    busybox setfattr -n trusted.overlay.whiteout -v y "$wo_path" 2>/dev/null \
        || log_w "$_tag" "setfattr failed for $wo_path, mknod whiteout still active"

    chmod 644 "$wo_path"
    log_d "$_tag" "created whiteout: $wo_path"
    return 0
}

whiteout_remove() {
    local _tag="whiteout_helpers"
    local target_dir="$1"
    local app_path="$2"
    [ -z "$target_dir" ] || [ -z "$app_path" ] && return 1

    local wo_path="${target_dir}$(dirname "$app_path")"
    if [ -c "$wo_path" ]; then
        rm -f "$wo_path" 2>/dev/null
    elif [ -e "$wo_path" ]; then
        rm -rf "$wo_path" 2>/dev/null
    fi
    log_d "$_tag" "removed whiteout: $wo_path"
    return 0
}

whiteout_verify() {
    local target_dir="$1"
    local app_path="$2"
    [ -z "$target_dir" ] || [ -z "$app_path" ] && return 1

    [ -c "${target_dir}$(dirname "$app_path")" ]
}

# Relocate OEM vendor dirs that exist as real directories on the device
# but appear under /system/ in the overlay -- must become symlinks
whiteout_fix_vendor_symlinks() {
    local _tag="whiteout_helpers"
    local target_dir="$1"
    [ -z "$target_dir" ] && return 0

    local part
    for part in $_WH_VENDOR_PARTS; do
        if [ -d "${target_dir}/system/${part}" ] && [ ! -L "/${part}" ]; then
            mv -f "${target_dir}/system/${part}" "${target_dir}/${part}" 2>/dev/null
            ln -sf "../${part}" "${target_dir}/system/${part}" 2>/dev/null
            log_d "$_tag" "fixed vendor symlink: ${part}"
        fi
    done
}
