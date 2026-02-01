#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Background daemon -- periodic verification of debloated/systemized apps with auto-repair

MODDIR="${MODDIR:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
SCALPEL_DATA="/data/adb/scalpel"
NUKE_LIST="${SCALPEL_DATA}/nuke_list.json"
STATUS_FILE="${SCALPEL_DATA}/status.json"
SYSTEMIZE_LIST="${SCALPEL_DATA}/systemize_list.json"
PID_FILE="${SCALPEL_DATA}/monitor.pid"
NUKE_LOCK="${SCALPEL_DATA}/nuke.lock"

_cleanup() {
    rm -f "$PID_FILE"
}

# Stale PID check prevents ghost lock from orphaned processes
_is_pid_alive() {
    [ -n "$1" ] && kill -0 "$1" 2>/dev/null
}

_acquire_singleton() {
    if [ -f "$PID_FILE" ]; then
        local old_pid
        old_pid="$(cat "$PID_FILE" 2>/dev/null)"
        if _is_pid_alive "$old_pid"; then
            return 1
        fi
        rm -f "$PID_FILE"
    fi
    echo "$$" > "$PID_FILE"
    # Verify we won the race (re-read after write)
    local written
    written="$(cat "$PID_FILE" 2>/dev/null)"
    [ "$written" = "$$" ]
}

_jq() {
    local jq_bin="${MODDIR}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"
    "$jq_bin" "$@"
}

_check_debloated_apps() {
    local _tag="monitor"
    [ ! -f "$NUKE_LIST" ] && return 0
    [ -f "$NUKE_LOCK" ] && return 0

    local mode=""
    if [ -f "$STATUS_FILE" ]; then
        mode="$(_jq -r '.mode // ""' "$STATUS_FILE" 2>/dev/null)"
    fi
    case "$mode" in
        ""|unknown|none|null|running|pm_deferred|error) return 0 ;;
    esac

    local mode_script="${MODDIR}/modes/mode_${mode}.sh"
    [ ! -f "$mode_script" ] && return 0
    . "$mode_script"

    local tmp="${SCALPEL_DATA}/.monitor_batch.$$"
    _jq -r '.[] | "\(.package_name)\t\(.app_path)"' "$NUKE_LIST" > "$tmp" 2>/dev/null
    [ ! -s "$tmp" ] && { rm -f "$tmp"; return 0; }

    local repaired=0
    # Literal tab in IFS
    while IFS='	' read -r pkg app_path; do
        [ -z "$pkg" ] && continue
        [ -z "$app_path" ] && continue

        if ! mode_verify "$pkg" "$app_path"; then
            log_w "$_tag" "debloat reverted: $pkg"
            # Concurrent nuke.sh may have started between check and here
            if [ -f "$NUKE_LOCK" ]; then
                log_d "$_tag" "nuke lock appeared, aborting repair cycle"
                break
            fi
            if mode_debloat "$pkg" "$app_path"; then
                repaired=$((repaired + 1))
                log_i "$_tag" "re-applied debloat: $pkg"
            else
                log_e "$_tag" "repair failed: $pkg"
            fi
        fi
    done < "$tmp"

    rm -f "$tmp"

    if [ "$repaired" -gt 0 ]; then
        _update_repair_count "$repaired"
    fi
}

_check_systemized_apps() {
    local _tag="monitor"
    [ ! -f "$SYSTEMIZE_LIST" ] && return 0

    local count
    count="$(_jq 'length' "$SYSTEMIZE_LIST" 2>/dev/null)"
    count="${count:-0}"
    [ "$count" = "0" ] && return 0

    . "${MODDIR}/systemize/promote.sh"

    local tmp="${SCALPEL_DATA}/.monitor_sys_batch.$$"
    _jq -r '.[].package_name' "$SYSTEMIZE_LIST" > "$tmp" 2>/dev/null
    [ ! -s "$tmp" ] && { rm -f "$tmp"; return 0; }

    while IFS= read -r pkg; do
        [ -z "$pkg" ] && continue
        # Log-only: auto-re-promotion is too dangerous (copies APKs, modifies PMS state)
        if ! verify_promotion "$pkg"; then
            log_w "$_tag" "systemization lost: $pkg (manual re-promote required)"
        fi
    done < "$tmp"

    rm -f "$tmp"
}

_update_repair_count() {
    local repaired="$1"
    [ ! -f "$STATUS_FILE" ] && return 0

    local iso_date
    iso_date="$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || echo 'unknown')"

    local tmp="${STATUS_FILE}.tmp.$$"
    _jq --argjson r "$repaired" --arg ts "$iso_date" \
        '. + {monitor_repairs: ((.monitor_repairs // 0) + $r), last_monitor: $ts}' \
        "$STATUS_FILE" > "$tmp" 2>/dev/null

    if [ -s "$tmp" ]; then
        mv "$tmp" "$STATUS_FILE" 2>/dev/null || rm -f "$tmp"
    else
        rm -f "$tmp"
    fi
}

monitor_start() {
    local _tag="monitor"
    . "${MODDIR}/core/logging.sh"
    . "${MODDIR}/core/config.sh"
    . "${MODDIR}/core/detect.sh"
    config_init 2>/dev/null
    log_init

    if ! _acquire_singleton; then
        log_w "$_tag" "another instance running, exiting"
        return 0
    fi

    trap '_cleanup' EXIT TERM INT HUP

    local interval
    interval="$(config_get SCALPEL_MONITOR_INTERVAL 2>/dev/null)"
    interval="${interval:-300}"
    # Sane bounds: minimum 60s to protect battery, maximum 3600s
    [ "$interval" -lt 60 ] 2>/dev/null && interval=60
    [ "$interval" -gt 3600 ] 2>/dev/null && interval=3600

    log_i "$_tag" "started (pid=$$, interval=${interval}s)"

    while true; do
        sleep "$interval"

        # Module disabled or marked for removal
        if [ -f "${MODDIR}/disable" ] || [ -f "${MODDIR}/remove" ]; then
            log_i "$_tag" "module disabled, stopping"
            break
        fi

        _check_debloated_apps
        _check_systemized_apps
    done

    _cleanup
}

case "${0##*/}" in
    monitor.sh) monitor_start "$@" ;;
esac
