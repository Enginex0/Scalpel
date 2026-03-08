#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Background daemon -- periodic verification of debloated/systemized apps with auto-repair

MODDIR="${MODDIR:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
SCALPEL_DATA="/data/adb/scalpel"
NUKE_LIST="${SCALPEL_DATA}/nuke_list.json"
STATUS_FILE="${SCALPEL_DATA}/status.json"
SYSTEMIZE_LIST="${SCALPEL_DATA}/systemize_list.json"
PID_FILE="${SCALPEL_DATA}/monitor.pid"
NUKE_LOCK_DIR="${SCALPEL_DATA}/nuke.lock.d"

_cleanup() {
    rm -f "$PID_FILE"
}

_is_pid_alive() {
    [ -n "$1" ] && kill -0 "$1" 2>/dev/null
}

# mksh on Android doesn't support exec N>file for flock — use PID file instead
_acquire_singleton() {
    if [ -f "$PID_FILE" ]; then
        local old_pid
        old_pid=$(cat "$PID_FILE" 2>/dev/null)
        if _is_pid_alive "$old_pid"; then
            return 1
        fi
        rm -f "$PID_FILE"
    fi
    echo "$$" > "$PID_FILE"
    return 0
}

# nuke.sh uses mkdir-based lock which works on all Android shells
_is_nuke_running() {
    [ ! -d "$NUKE_LOCK_DIR" ] && return 1
    local holder
    holder=$(cat "${NUKE_LOCK_DIR}/pid" 2>/dev/null)
    [ -n "$holder" ] && _is_pid_alive "$holder" && return 0
    return 1
}

_jq() {
    local jq_bin="${MODDIR}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"
    "$jq_bin" "$@"
}

_check_debloated_apps() {
    local _tag="monitor"
    [ ! -f "$NUKE_LIST" ] && return 0
    _is_nuke_running && return 0

    local mode=""
    if [ -f "$STATUS_FILE" ]; then
        mode="$(_jq -r '.mode // ""' "$STATUS_FILE" 2>/dev/null)"
    fi
    case "$mode" in
        ""|unknown|none|null|running|error) return 0 ;;
    esac

    . "${MODDIR}/core/whiteout_helpers.sh"

    local tmp="${SCALPEL_DATA}/.monitor_batch.$$"
    _jq -r '.[] | "\(.package_name)\t\(.app_path)"' "$NUKE_LIST" > "$tmp" 2>/dev/null
    [ ! -s "$tmp" ] && { rm -f "$tmp"; return 0; }

    local repaired=0
    while IFS='	' read -r pkg app_path; do
        [ -z "$pkg" ] && continue
        [ -z "$app_path" ] && continue

        local needs_repair="false"
        if [ "$mode" = "pm" ]; then
            pm list packages -d 2>/dev/null | grep -qF "package:${pkg}" || needs_repair="true"
        else
            whiteout_verify "$MODDIR" "$app_path" || needs_repair="true"
        fi

        if [ "$needs_repair" = "true" ]; then
            log_w "$_tag" "debloat reverted: $pkg"
            if _is_nuke_running; then
                log_d "$_tag" "nuke lock appeared, aborting repair cycle"
                break
            fi
            if [ "$mode" = "pm" ]; then
                pm disable-user --user 0 "$pkg" >/dev/null 2>&1 && repaired=$((repaired + 1)) || log_e "$_tag" "repair failed: $pkg"
            else
                if whiteout_create "$MODDIR" "$app_path"; then
                    repaired=$((repaired + 1))
                    log_i "$_tag" "re-applied debloat: $pkg"
                else
                    log_e "$_tag" "repair failed: $pkg"
                fi
            fi
        fi
    done < "$tmp"

    rm -f "$tmp"

    if [ "$repaired" -gt 0 ]; then
        whiteout_fix_vendor_symlinks "$MODDIR"
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

    local debloated=0 systemized=0 mode="none" repairs=0

    [ -f "$NUKE_LIST" ] && debloated="$(_jq 'length' "$NUKE_LIST" 2>/dev/null)"
    debloated="${debloated:-0}"

    [ -f "$SYSTEMIZE_LIST" ] && systemized="$(_jq 'length' "$SYSTEMIZE_LIST" 2>/dev/null)"
    systemized="${systemized:-0}"

    if [ -f "$STATUS_FILE" ]; then
        mode="$(_jq -r '.mode // "none"' "$STATUS_FILE" 2>/dev/null)"
        repairs="$(_jq -r '.monitor_repairs // 0' "$STATUS_FILE" 2>/dev/null)"
    fi
    [ "$mode" = "null" ] && mode="none"

    local desc=""
    if [ "$repairs" -gt 0 ] 2>/dev/null; then
        desc="⚠️ ${repairs} repairs"
        [ "$debloated" -gt 0 ] 2>/dev/null && desc="${desc} | ${debloated} Debloated"
        [ "$systemized" -gt 0 ] 2>/dev/null && desc="${desc} | ${systemized} Systemized"
        [ "$mode" != "none" ] && desc="${desc} | ${mode}"
    elif [ "$debloated" -gt 0 ] 2>/dev/null || [ "$systemized" -gt 0 ] 2>/dev/null; then
        desc="⚕️ Active"
        [ "$debloated" -gt 0 ] 2>/dev/null && desc="${desc} | ${debloated} Debloated"
        [ "$systemized" -gt 0 ] 2>/dev/null && desc="${desc} | ${systemized} Systemized"
        [ "$mode" != "none" ] && desc="${desc} | ${mode}"
    else
        desc="😴 Idle — Ready to operate"
    fi

    awk -v d="$desc" '{if(/^description=/){print "description=" d}else{print}}' "$prop_file" > "${prop_file}.tmp.$$" \
        && mv "${prop_file}.tmp.$$" "$prop_file" \
        || rm -f "${prop_file}.tmp.$$"

    if [ "$KSU" = "true" ] && [ -x /data/adb/ksud ]; then
        KSU_MODULE=scalpel /data/adb/ksud module config set override.description "$desc" 2>/dev/null
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

    while true; do
        sleep "$interval"

        if [ -f "${MODDIR}/disable" ] || [ -f "${MODDIR}/remove" ]; then
            log_i "$_tag" "module disabled, stopping"
            break
        fi

        _check_debloated_apps
        _check_systemized_apps

        _update_description
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
