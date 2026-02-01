#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Shared post-boot work called by EITHER service.sh (Magisk) or boot-completed.sh (KSU/APatch)
# Guarded by flag file to guarantee exactly-once execution per boot cycle

MODDIR="${MODDIR:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
SCALPEL_DATA="/data/adb/scalpel"
STATUS_FILE="${SCALPEL_DATA}/status.json"
_POST_BOOT_FLAG="${SCALPEL_DATA}/boot_completed_handled"

# Finish work deferred from post-fs-data: pm deferral, pm failures, timeout partials
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
    # no filesystem mode at post-fs-data, full pm run needed
    elif [ "$mode" = "pm_deferred" ]; then
        need_rerun="true"
        override_mode="pm"
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

_update_module_description() {
    local _tag="post_boot"
    local jq_bin="${MODDIR}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"
    [ ! -f "$STATUS_FILE" ] && return 0

    local debloated verified broken mode
    debloated="$("$jq_bin" -r '.debloated // 0' "$STATUS_FILE" 2>/dev/null)"
    verified="$("$jq_bin" -r '.debloat_verified // 0' "$STATUS_FILE" 2>/dev/null)"
    broken="$("$jq_bin" -r '.debloat_broken // 0' "$STATUS_FILE" 2>/dev/null)"
    mode="$("$jq_bin" -r '.mode // "?"' "$STATUS_FILE" 2>/dev/null)"

    local desc="${debloated} debloated, ${verified} verified [${mode}]"
    [ "${broken:-0}" -gt 0 ] && desc="${desc} - ${broken} broken"

    # KSU: native config API avoids modifying module.prop on disk
    if [ "$KSU" = "true" ] && command -v ksud >/dev/null 2>&1; then
        ksud module config set override.description "$desc" 2>/dev/null && return 0
    fi

    # Magisk / APatch fallback: direct module.prop edit (strip sed-unsafe chars)
    [ ! -f "${MODDIR}/module.prop" ] && return 0
    local safe_desc
    safe_desc="$(printf '%s' "$desc" | tr -d '|/&\\')"
    # tr also strips newlines (theoretical risk if jq field somehow contained CR/LF, but status.json is single-line)
    sed -i "s|^description=.*|description=${safe_desc}|" "${MODDIR}/module.prop" 2>/dev/null
}

# Exactly-once gate: first caller wins, second caller exits early
_post_boot_acquire() {
    [ -f "$_POST_BOOT_FLAG" ] && return 1
    echo "$$" > "$_POST_BOOT_FLAG" 2>/dev/null
    # Race guard: re-read to confirm we won
    local written
    written="$(cat "$_POST_BOOT_FLAG" 2>/dev/null)"
    [ "$written" = "$$" ]
}

post_boot_run() {
    local _tag="post_boot"
    . "${MODDIR}/core/logging.sh"
    . "${MODDIR}/core/config.sh"
    config_init 2>/dev/null
    log_init

    if ! _post_boot_acquire; then
        log_i "$_tag" "post-boot already handled this cycle, skipping"
        return 0
    fi

    log_i "$_tag" "post-boot starting"

    . "${MODDIR}/core/bootloop.sh"
    bootloop_reset

    _finish_deferred_debloat

    . "${MODDIR}/core/verify.sh"
    verify_run || log_w "$_tag" "verification found issues"

    _update_module_description

    . "${MODDIR}/core/monitor.sh"
    monitor_start &

    log_i "$_tag" "post-boot complete"
}

case "${0##*/}" in
    post_boot.sh) post_boot_run "$@" ;;
esac
