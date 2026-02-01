#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Mode: ZeroMount VFS — kernel-level path interception via zm CLI

SCALPEL_NUKE_LIST="${SCALPEL_DATA:-/data/adb/scalpel}/nuke_list.json"

_ZM_BIN=""

_find_zm() {
    if [ -n "$_ZM_BIN" ]; then
        [ -x "$_ZM_BIN" ] && return 0
        _ZM_BIN=""
    fi
    if command -v zm >/dev/null 2>&1; then
        _ZM_BIN="zm"
    else
        local p
        for p in /data/adb/modules/zeromount/bin/zm /data/adb/ksu/bin/zm /data/adb/magisk/zm /data/adb/ap/bin/zm; do
            [ -x "$p" ] && { _ZM_BIN="$p"; return 0; }
        done
        return 1
    fi
    return 0
}

mode_probe() {
    local _tag="mode_zeromount"
    if [ ! -e "/dev/zeromount" ]; then
        log_d "$_tag" "probe: /dev/zeromount not present"
        return 1
    fi
    if ! _find_zm; then
        log_d "$_tag" "probe: zm binary not found"
        return 1
    fi
    log_d "$_tag" "probe: zeromount available (zm=$_ZM_BIN)"
    return 0
}

mode_debloat() {
    local _tag="mode_zeromount"
    local pkg="$1" app_path="$2"
    [ -z "$pkg" ] && { log_e "$_tag" "debloat called without package name"; return 1; }
    [ -z "$app_path" ] && { log_e "$_tag" "debloat called without app path"; return 1; }

    _find_zm || { log_e "$_tag" "zm binary not found"; return 1; }

    local app_dir
    app_dir=$(dirname "$app_path")

    # Empty rpath = deletion marker at VFS level
    if "$_ZM_BIN" add "$app_dir" ""; then
        log_i "$_tag" "hidden $pkg ($app_dir)"
        return 0
    fi

    log_e "$_tag" "failed to hide $pkg ($app_dir)"
    return 1
}

mode_restore() {
    local _tag="mode_zeromount"
    local pkg="$1" app_path="$2"
    [ -z "$pkg" ] && { log_e "$_tag" "restore: missing package name"; return 1; }
    [ -z "$app_path" ] && { log_e "$_tag" "restore called without app path"; return 1; }

    _find_zm || { log_e "$_tag" "zm binary not found"; return 1; }

    local app_dir
    app_dir=$(dirname "$app_path")

    if "$_ZM_BIN" del "$app_dir"; then
        log_i "$_tag" "restored $pkg ($app_dir)"
        return 0
    fi

    log_e "$_tag" "failed to restore $pkg ($app_dir)"
    return 1
}

mode_verify() {
    local pkg="$1" app_path="$2"
    [ -z "$app_path" ] && return 1
    local app_dir
    app_dir=$(dirname "$app_path")

    # VFS interception makes the directory invisible to userspace
    [ ! -d "$app_dir" ]
}

mode_cleanup() {
    local _tag="mode_zeromount"
    local jq_bin="${MODDIR:-/data/adb/modules/scalpel}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    if [ ! -f "$SCALPEL_NUKE_LIST" ]; then
        log_d "$_tag" "no nuke list, nothing to clean"
        return 0
    fi

    # Temp file avoids subshell from pipe (variable mutations lost in pipe)
    local tmp="/data/local/tmp/.scalpel_zm_cleanup_$$"
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

    return "$failed"
}
