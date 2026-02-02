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
        if ! mv "$tmp" "$STATUS_FILE" 2>/dev/null; then
            log_w "$_tag" "repair count update failed, removing temp file"
            rm -f "$tmp"
        fi
    else
        rm -f "$tmp"
    fi
}

_update_description() {
    local prop_file="${MODDIR}/module.prop"
    [ ! -f "$prop_file" ] && return 0

    local debloated=0
    if [ -f "$NUKE_LIST" ]; then
        debloated="$(_jq 'length' "$NUKE_LIST" 2>/dev/null)"
        debloated="${debloated:-0}"
    fi

    local systemized=0
    if [ -f "$SYSTEMIZE_LIST" ]; then
        systemized="$(_jq 'length' "$SYSTEMIZE_LIST" 2>/dev/null)"
        systemized="${systemized:-0}"
    fi

    local mode=""
    if [ -f "$STATUS_FILE" ]; then
        mode="$(_jq -r '.mode // ""' "$STATUS_FILE" 2>/dev/null)"
    fi

    local repairs=0
    if [ -f "$STATUS_FILE" ]; then
        repairs="$(_jq -r '.monitor_repairs // 0' "$STATUS_FILE" 2>/dev/null)"
    fi

    local desc=""
    if [ "$repairs" -gt 0 ] 2>/dev/null; then
        desc="⚠️ $repairs repairs needed"
        [ "$debloated" -gt 0 ] 2>/dev/null && desc="$desc | $debloated Debloated"
        [ -n "$mode" ] && [ "$mode" != "null" ] && [ "$mode" != "none" ] && desc="$desc | $mode"
    elif [ "$debloated" -gt 0 ] 2>/dev/null || [ "$systemized" -gt 0 ] 2>/dev/null; then
        desc="⚕️ Active"
        [ "$debloated" -gt 0 ] 2>/dev/null && desc="$desc | $debloated Debloated"
        [ "$systemized" -gt 0 ] 2>/dev/null && desc="$desc | $systemized Systemized"
        [ -n "$mode" ] && [ "$mode" != "null" ] && [ "$mode" != "none" ] && desc="$desc | $mode"
    else
        desc="😴 Idle — Ready to operate"
    fi

    # KSU: use native API (takes precedence over file)
    local ksud_bin="/data/adb/ksud"
    if [ "$KSU" = "true" ] && [ -x "$ksud_bin" ]; then
        "$ksud_bin" module config set override.description "$desc" 2>/dev/null
    fi

    # Write file for APatch and as fallback
    printf '%s' "$desc" > "${MODDIR}/override.description" 2>/dev/null

    # Magisk reads module.prop directly
    sed -i "s|^description=.*|description=$desc|" "$prop_file" 2>/dev/null
}

_generate_status_cache() {
    local cache_file="${SCALPEL_DATA}/status_cache.json"

    local kernel_ver device_model android_ver selinux_status
    kernel_ver="$(uname -r 2>/dev/null || echo 'unknown')"
    device_model="$(getprop ro.product.model 2>/dev/null || echo 'unknown')"
    android_ver="$(getprop ro.build.version.release 2>/dev/null || echo 'unknown')"
    selinux_status="$(getenforce 2>/dev/null || echo 'unknown')"

    local uptime_sec uptime_h uptime_m uptime_str
    uptime_sec="$(cut -d. -f1 /proc/uptime 2>/dev/null || echo 0)"
    uptime_h=$((uptime_sec / 3600))
    uptime_m=$(((uptime_sec % 3600) / 60))
    uptime_str="${uptime_h}h ${uptime_m}m"

    local debloated=0 systemized=0 repairs=0
    [ -f "$NUKE_LIST" ] && debloated="$(_jq 'length' "$NUKE_LIST" 2>/dev/null)" && debloated="${debloated:-0}"
    [ -f "$SYSTEMIZE_LIST" ] && systemized="$(_jq 'length' "$SYSTEMIZE_LIST" 2>/dev/null)" && systemized="${systemized:-0}"
    [ -f "$STATUS_FILE" ] && repairs="$(_jq -r '.monitor_repairs // 0' "$STATUS_FILE" 2>/dev/null)"

    local mode="none"
    [ -f "$STATUS_FILE" ] && mode="$(_jq -r '.mode // "none"' "$STATUS_FILE" 2>/dev/null)"
    [ "$mode" = "null" ] && mode="none"

    local timestamp
    timestamp="$(date +%s)000"

    # Single-line JSON for WebUI consumption
    if ! printf '{"debloatedCount":%d,"systemizedCount":%d,"repairsCount":%d,"mode":"%s","kernelVersion":"%s","deviceModel":"%s","androidVersion":"%s","selinuxStatus":"%s","uptime":"%s","monitorPid":%d,"timestamp":%s}\n' \
        "$debloated" "$systemized" "$repairs" "$mode" "$kernel_ver" "$device_model" "$android_ver" "$selinux_status" "$uptime_str" "$$" "$timestamp" \
        > "$cache_file" 2>/dev/null; then
        log_w "$_tag" "failed to write status cache"
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
        return 2
    fi

    trap '_cleanup' EXIT TERM INT HUP

    local interval
    interval="$(config_get SCALPEL_MONITOR_INTERVAL 2>/dev/null)"
    interval="${interval:-300}"
    # Sane bounds: minimum 60s to protect battery, maximum 3600s
    [ "$interval" -lt 60 ] 2>/dev/null && interval=60
    [ "$interval" -gt 3600 ] 2>/dev/null && interval=3600

    log_i "$_tag" "started (pid=$$, interval=${interval}s)"

    _update_description
    _generate_status_cache

    while true; do
        sleep "$interval"

        if [ -f "${MODDIR}/disable" ] || [ -f "${MODDIR}/remove" ]; then
            log_i "$_tag" "module disabled, stopping"
            break
        fi

        _check_debloated_apps
        _check_systemized_apps

        _update_description
        _generate_status_cache
    done

    _cleanup
}

# Supervisor loop - restarts monitor if it dies unexpectedly
monitor_supervised() {
    local _tag="monitor"
    local restart_count=0
    local max_restarts=10
    local cooldown=60

    while true; do
        monitor_start
        local exit_code=$?

        # Exit code 2 = another instance running, supervisor should exit
        if [ "$exit_code" -eq 2 ]; then
            echo "scalpel[$_tag]: another instance running, supervisor exiting" > /dev/kmsg
            break
        fi

        # Clean exit when module disabled
        if [ -f "${MODDIR}/disable" ] || [ -f "${MODDIR}/remove" ]; then
            echo "scalpel[$_tag]: supervisor exiting (module disabled)" > /dev/kmsg
            break
        fi

        restart_count=$((restart_count + 1))
        echo "scalpel[$_tag]: monitor exited (code=$exit_code), restart #$restart_count" > /dev/kmsg

        if [ "$restart_count" -ge "$max_restarts" ]; then
            echo "scalpel[$_tag]: max restarts ($max_restarts) reached, giving up" > /dev/kmsg
            break
        fi

        sleep "$cooldown"
        rm -f "$PID_FILE" 2>/dev/null
    done
}

case "${0##*/}" in
    monitor.sh) monitor_supervised "$@" ;;
esac
