#!/system/bin/sh
# shellcheck shell=bash disable=SC3043
# Mode: pm disable/enable — universal fallback, always available on Android 7+

SCALPEL_NUKE_LIST="${SCALPEL_DATA:-/data/adb/scalpel}/nuke_list.json"

mode_probe() {
    local _tag="mode_pm"
    if ! command -v pm >/dev/null 2>&1; then
        log_d "$_tag" "probe: pm command not found"
        return 1
    fi
    log_d "$_tag" "probe: pm available"
    return 0
}

mode_debloat() {
    local _tag="mode_pm"
    local pkg="$1"
    [ -z "$pkg" ] && { log_e "$_tag" "debloat called without package name"; return 1; }

    if pm disable-user --user 0 "$pkg" 2>/dev/null | grep -q "disabled"; then
        log_i "$_tag" "disabled $pkg"
        return 0
    fi

    # Some ROMs omit "disabled" from output — verify state directly
    if pm list packages -d 2>/dev/null | grep -qF "package:${pkg}"; then
        log_i "$_tag" "disabled $pkg (verified)"
        return 0
    fi

    log_e "$_tag" "failed to disable $pkg"
    return 1
}

mode_restore() {
    local _tag="mode_pm"
    local pkg="$1"
    [ -z "$pkg" ] && { log_e "$_tag" "restore called without package name"; return 1; }

    if pm enable "$pkg" 2>/dev/null | grep -q "enabled"; then
        log_i "$_tag" "enabled $pkg"
        return 0
    fi

    if pm list packages -e 2>/dev/null | grep -qF "package:${pkg}"; then
        log_i "$_tag" "enabled $pkg (verified)"
        return 0
    fi

    log_e "$_tag" "failed to enable $pkg"
    return 1
}

mode_verify() {
    local pkg="$1"
    pm list packages -d 2>/dev/null | grep -qF "package:${pkg}"
}

mode_cleanup() {
    local _tag="mode_pm"
    local jq_bin="${MODDIR:-/data/adb/modules/scalpel}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    if [ ! -f "$SCALPEL_NUKE_LIST" ]; then
        log_d "$_tag" "no nuke list, nothing to clean"
        return 0
    fi

    # Dump to temp file to avoid subshell from pipe (variable mutations lost in pipe)
    local tmp="/data/local/tmp/.scalpel_cleanup_$$"
    "$jq_bin" -r '.[].package_name' "$SCALPEL_NUKE_LIST" > "$tmp" 2>/dev/null
    if [ ! -s "$tmp" ]; then
        rm -f "$tmp" 2>/dev/null
        log_d "$_tag" "nuke list empty, nothing to clean"
        return 0
    fi

    local failed=0
    while read -r pkg; do
        [ -z "$pkg" ] && continue
        mode_verify "$pkg" || continue
        mode_restore "$pkg" || failed=1
    done < "$tmp"
    rm -f "$tmp" 2>/dev/null

    return "$failed"
}
