#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Mode: Magisk magic mount — whiteouts in $MODDIR overlaid onto /system at boot

SCALPEL_NUKE_LIST="${SCALPEL_DATA:-/data/adb/scalpel}/nuke_list.json"

_MAGISK_HELPERS_LOADED=0

_load_helpers() {
    local _tag="mode_magisk"
    [ "$_MAGISK_HELPERS_LOADED" = 1 ] && return 0
    local helpers_path="${MODDIR:-/data/adb/modules/scalpel}/core/whiteout_helpers.sh"
    [ ! -f "$helpers_path" ] && { log_e "$_tag" "whiteout_helpers.sh not found"; return 1; }
    . "$helpers_path" || {
        log_e "$_tag" "failed to source whiteout_helpers.sh"
        return 1
    }
    _MAGISK_HELPERS_LOADED=1
}

mode_probe() {
    local _tag="mode_magisk"
    local mgr=""
    if [ -n "$KSU" ]; then
        mgr="ksu"
    elif [ -n "$APATCH" ]; then
        mgr="apatch"
    elif [ -d "/data/adb/magisk" ]; then
        mgr="magisk"
    else
        log_d "$_tag" "probe: no root manager detected"
        return 1
    fi

    case "$mgr" in
        magisk)
            log_d "$_tag" "probe: Magisk magic mount available"
            return 0
            ;;
        ksu)
            if [ "$KSU_MAGIC_MOUNT" = "true" ]; then
                log_d "$_tag" "probe: KSU magic mount enabled"
                return 0
            fi
            if [ -n "$KSU_VER_CODE" ] && [ "$KSU_VER_CODE" -ge 22098 ] 2>/dev/null; then
                log_d "$_tag" "probe: KSU 22098+ defaults to magic mount"
                return 0
            fi
            log_d "$_tag" "probe: KSU magic mount not enabled (KSU_MAGIC_MOUNT=$KSU_MAGIC_MOUNT, VER=$KSU_VER_CODE)"
            return 1
            ;;
        apatch)
            if [ "$APATCH_BIND_MOUNT" = "true" ]; then
                log_d "$_tag" "probe: APatch bind mount enabled"
                return 0
            fi
            log_d "$_tag" "probe: APatch bind mount not enabled"
            return 1
            ;;
    esac
    return 1
}

mode_debloat() {
    local _tag="mode_magisk"
    local pkg="$1" app_path="$2"
    [ -z "$pkg" ] && { log_e "$_tag" "debloat called without package name"; return 1; }
    [ -z "$app_path" ] && { log_e "$_tag" "debloat called without app path for $pkg"; return 1; }

    _load_helpers || return 1

    local target_dir="${MODDIR:-/data/adb/modules/scalpel}"

    if ! whiteout_create "$target_dir" "$app_path"; then
        log_e "$_tag" "whiteout creation failed for $pkg ($app_path)"
        return 1
    fi

    if whiteout_verify "$target_dir" "$app_path"; then
        log_i "$_tag" "debloated $pkg via magic mount whiteout"
        return 0
    fi

    log_e "$_tag" "whiteout verify failed for $pkg after creation"
    return 1
}

mode_restore() {
    local _tag="mode_magisk"
    local pkg="$1" app_path="$2"
    [ -z "$pkg" ] && { log_e "$_tag" "restore called without package name"; return 1; }
    [ -z "$app_path" ] && { log_e "$_tag" "restore called without app path for $pkg"; return 1; }

    _load_helpers || return 1

    local target_dir="${MODDIR:-/data/adb/modules/scalpel}"

    whiteout_remove "$target_dir" "$app_path"

    # Re-register the package with PMS so it becomes visible again
    pm install-existing "$pkg" 2>/dev/null

    log_i "$_tag" "restored $pkg"
    return 0
}

mode_verify() {
    local pkg="$1" app_path="$2"
    [ -z "$app_path" ] && return 1

    _load_helpers || return 1

    whiteout_verify "${MODDIR:-/data/adb/modules/scalpel}" "$app_path"
}

mode_cleanup() {
    local _tag="mode_magisk"
    local jq_bin="${MODDIR:-/data/adb/modules/scalpel}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    if [ ! -f "$SCALPEL_NUKE_LIST" ]; then
        log_d "$_tag" "no nuke list, nothing to clean"
        return 0
    fi

    _load_helpers || return 1

    # Temp file avoids subshell from pipe (variable mutations lost in pipe)
    local tmp="/data/local/tmp/.scalpel_magisk_cleanup_$$"
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

    # Wipe all overlay partition dirs from the module directory
    local target_dir="${MODDIR:-/data/adb/modules/scalpel}"
    local dir
    for dir in $_WH_ALL_PARTITIONS; do
        [ -e "${target_dir}/${dir}" ] && rm -rf "${target_dir}/${dir}" 2>/dev/null
    done

    log_i "$_tag" "cleanup complete (failed=$failed)"
    return "$failed"
}
