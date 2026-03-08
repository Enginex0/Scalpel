#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Shared post-boot work called by EITHER service.sh (Magisk) or boot-completed.sh (KSU/APatch)
# Guarded by flag file to guarantee exactly-once execution per boot cycle

MODDIR="${MODDIR:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
SCALPEL_DATA="/data/adb/scalpel"
STATUS_FILE="${SCALPEL_DATA}/status.json"
_POST_BOOT_FLAG="${SCALPEL_DATA}/boot_completed_handled"

# Remove Play Store updates from debloated system apps
_remove_system_updates() {
    local _tag="post_boot"
    local nuke_list="${SCALPEL_DATA}/nuke_list.json"
    [ ! -f "$nuke_list" ] && return 0

    local jq_bin="${MODDIR}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    local pkg_list
    pkg_list="$("$jq_bin" -r '.[].package_name' "$nuke_list" 2>/dev/null)"
    [ -z "$pkg_list" ] && return 0

    log_d "$_tag" "checking for system app updates to remove"

    local pkg removed=0
    for pkg in $pkg_list; do
        [ -z "$pkg" ] && continue
        # System app with user updates has path in /data/app
        if pm list packages -s 2>/dev/null | grep -qx "package:$pkg" \
           && pm path "$pkg" 2>/dev/null | grep -q "/data/app"; then
            if pm uninstall-system-updates "$pkg" >/dev/null 2>&1; then
                log_i "$_tag" "removed updates: $pkg"
                removed=$((removed + 1))
            fi
        fi
    done

    [ "$removed" -gt 0 ] && log_i "$_tag" "removed $removed system app updates"
}

# Finish work deferred from post-fs-data: pm deferral, pm failures, timeout partials
_uninstall_fallback() {
    local _tag="post_boot"
    [ "$SCALPEL_UNINSTALL_FALLBACK" != "true" ] && return 0

    local nuke_list="${SCALPEL_DATA}/nuke_list.json"
    [ ! -f "$nuke_list" ] && return 0

    local jq_bin="${MODDIR}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    local pkg_list installed_list count=0
    pkg_list="$("$jq_bin" -r '.[].package_name' "$nuke_list" 2>/dev/null)" || return 0
    installed_list="$(pm list packages 2>/dev/null)" || return 0

    log_i "$_tag" "uninstall fallback: checking for surviving apps"

    local pkg
    for pkg in $pkg_list; do
        [ -z "$pkg" ] && continue
        if echo "$installed_list" | grep -qx "package:$pkg"; then
            if pm uninstall -k --user 0 "$pkg" >/dev/null 2>&1; then
                log_i "$_tag" "fallback uninstalled: $pkg"
                count=$((count + 1))
            else
                log_w "$_tag" "fallback failed: $pkg"
            fi
        fi
    done

    [ "$count" -gt 0 ] && log_i "$_tag" "uninstall fallback: removed $count surviving apps"
}

# Restore non-nuked apps that got uninstalled/disabled as collateral
_restore_app_states() {
    local _tag="post_boot"
    local app_list="${SCALPEL_DATA}/app_list.json"
    local nuke_list="${SCALPEL_DATA}/nuke_list.json"

    [ ! -f "$app_list" ] && return 0

    local jq_bin="${MODDIR}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    local disabled_list pkg
    disabled_list=$(pm list packages -d 2>/dev/null)

    while read -r pkg; do
        [ -z "$pkg" ] && continue
        if [ -f "$nuke_list" ]; then
            "$jq_bin" -e --arg p "$pkg" '.[] | select(.package_name == $p)' "$nuke_list" >/dev/null 2>&1 && continue
        fi
        if ! pm path "$pkg" >/dev/null 2>&1; then
            pm install-existing "$pkg" >/dev/null 2>&1 && log_d "$_tag" "restored: $pkg"
        fi
        if echo "$disabled_list" | grep -qx "package:$pkg"; then
            pm enable "$pkg" >/dev/null 2>&1 && log_d "$_tag" "enabled: $pkg"
        fi
    done <<EOF
$("$jq_bin" -r '.[].package_name' "$app_list" 2>/dev/null)
EOF
}

# KSU/Magisk overlay should make module's system/ visible at /system/ — verify it actually happened
# Also runs deferred pm uninstall for newly promoted apps (only after overlay is confirmed active)
_verify_systemized_apps() {
    local _tag="post_boot"
    local sys_list="${SCALPEL_DATA}/systemize_list.json"
    [ ! -f "$sys_list" ] && return 0

    local jq_bin="${MODDIR}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    local count
    count="$("$jq_bin" 'length' "$sys_list" 2>/dev/null)"
    count="${count:-0}"
    [ "$count" = "0" ] && return 0

    log_i "$_tag" "verifying $count systemized app(s)"

    local verified=0 failed=0 uninstalled=0
    local entry pkg needs_uninstall
    local sys_pkgs
    sys_pkgs="$(pm list packages -s 2>/dev/null)"

    while IFS='|' read -r pkg needs_uninstall; do
        [ -z "$pkg" ] && continue

        if echo "$sys_pkgs" | grep -qx "package:${pkg}"; then
            log_i "$_tag" "VERIFIED: $pkg has FLAG_SYSTEM"
            verified=$((verified + 1))
            if [ "$needs_uninstall" = "true" ]; then
                if pm uninstall -k --user 0 "$pkg" >/dev/null 2>&1; then
                    log_i "$_tag" "deferred uninstall: $pkg"
                    uninstalled=$((uninstalled + 1))
                fi
            fi
        else
            log_w "$_tag" "PENDING: $pkg not yet system (reboot may be needed)"
            failed=$((failed + 1))
        fi
    done <<EOF
$("$jq_bin" -r '.[] | "\(.package_name)|\(.needs_uninstall // false)"' "$sys_list" 2>/dev/null)
EOF

    if [ "$uninstalled" -gt 0 ]; then
        local tmp="${sys_list}.tmp.$$"
        "$jq_bin" '[.[] | .needs_uninstall = false]' "$sys_list" > "$tmp" 2>/dev/null \
            && mv "$tmp" "$sys_list" \
            || rm -f "$tmp"
        log_i "$_tag" "deferred uninstall: cleared $uninstalled flags"
    fi

    log_i "$_tag" "systemize verification: $verified OK, $failed pending, $uninstalled uninstalled"
}

_finish_deferred_debloat() {
    local _tag="post_boot"
    local jq_bin="${MODDIR}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    [ ! -f "$STATUS_FILE" ] && return 0

    local mode failed partial
    mode="$("$jq_bin" -r '.mode // ""' "$STATUS_FILE" 2>/dev/null)"
    failed="$("$jq_bin" -r '.debloat_failed // 0' "$STATUS_FILE" 2>/dev/null)"
    failed="${failed:-0}"
    partial="$("$jq_bin" -r '.partial // false' "$STATUS_FILE" 2>/dev/null)"

    local need_rerun="false"
    local override_mode=""

    # post-fs-data killed mid-execution (KSU 10s timeout)
    if [ "$mode" = "running" ]; then
        need_rerun="true"
    # pm attempted but PMS wasn't ready yet
    elif [ "$mode" = "pm" ] && [ "$failed" -gt 0 ]; then
        need_rerun="true"
        override_mode="pm"
    # post-fs-data hit timeout before finishing all packages
    elif [ "$partial" = "true" ]; then
        need_rerun="true"
    fi

    [ "$need_rerun" = "false" ] && return 0

    log_i "$_tag" "finishing deferred debloat (mode=$mode, partial=$partial)"

    local _prev_override="${SCALPEL_MODE_OVERRIDE:-}"
    local _prev_timeout="${SCALPEL_NUKE_TIMEOUT:-}"

    SCALPEL_NUKE_TIMEOUT=0
    [ -n "$override_mode" ] && SCALPEL_MODE_OVERRIDE="$override_mode"

    . "${MODDIR}/core/nuke.sh"
    nuke_run || log_w "$_tag" "deferred debloat completed with failures"

    SCALPEL_MODE_OVERRIDE="$_prev_override"
    SCALPEL_NUKE_TIMEOUT="$_prev_timeout"
}

# Description updates handled by monitor.sh to avoid duplicate/conflicting updates

# Exactly-once gate: first caller wins, second caller exits early
_post_boot_acquire() {
    mkdir "$_POST_BOOT_FLAG" 2>/dev/null
}

post_boot_run() {
    local _tag="post_boot"
    . "${MODDIR}/core/logging.sh"
    . "${MODDIR}/core/config.sh"
    config_init 2>/dev/null || echo "scalpel[post_boot]: config_init failed (continuing)" > /dev/kmsg
    log_init 2>/dev/null || echo "scalpel[post_boot]: log_init failed (continuing)" > /dev/kmsg

    if ! _post_boot_acquire; then
        log_i "$_tag" "post-boot already handled this cycle, skipping"
        return 0
    fi

    log_i "$_tag" "post-boot starting"

    . "${MODDIR}/core/bootloop.sh"
    bootloop_reset

    _finish_deferred_debloat

    _remove_system_updates

    _uninstall_fallback

    _restore_app_states

    . "${MODDIR}/core/verify.sh"
    verify_run || log_w "$_tag" "verification found issues"

    _verify_systemized_apps

    # Stale PID from previous boot can block new monitor if PID gets reused
    rm -f "${SCALPEL_DATA}/monitor.pid" 2>/dev/null

    log_d "$_tag" "starting supervised monitor daemon"
    nohup sh "${MODDIR}/core/monitor.sh" > /dev/null 2>&1 &

    log_i "$_tag" "post-boot complete"
}

case "${0##*/}" in
    post_boot.sh) post_boot_run "$@" ;;
esac
