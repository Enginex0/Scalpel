#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Debloat orchestrator -- iterate nuke_list.json, dispatch to active mode, track results

MODDIR="${MODDIR:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
SCALPEL_DATA="/data/adb/scalpel"
NUKE_LIST="${SCALPEL_DATA}/nuke_list.json"
STATUS_FILE="${SCALPEL_DATA}/status.json"

_write_status() {
    local _tag="nuke"
    local mode="$1" success="$2" failed="$3" partial="${4:-false}"
    local jq_bin="${MODDIR}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    local timestamp iso_date
    timestamp="$(date +%s 2>/dev/null || echo 0)"
    iso_date="$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || echo "unknown")"

    local partial_bool="false"
    [ "$partial" = "true" ] && partial_bool="true"

    local tmp="${STATUS_FILE}.tmp.$$"
    "$jq_bin" -n \
        --arg mode "$mode" \
        --argjson debloated "$success" \
        --argjson debloat_failed "$failed" \
        --argjson systemized 0 \
        --argjson partial "$partial_bool" \
        --arg last_nuke "$iso_date" \
        --argjson timestamp "$timestamp" \
        '{mode:$mode,debloated:$debloated,debloat_failed:$debloat_failed,systemized:$systemized,partial:$partial,last_nuke:$last_nuke,timestamp:$timestamp}' \
        > "$tmp" 2>/dev/null

    if [ ! -s "$tmp" ]; then
        log_w "$_tag" "status write produced empty file, keeping existing"
        rm -f "$tmp"
        return 1
    fi

    mv "$tmp" "$STATUS_FILE" 2>/dev/null || {
        log_w "$_tag" "failed to write status file"
        rm -f "$tmp"
    }
}

nuke_run() {
    local _tag="nuke"
    . "${MODDIR}/core/logging.sh"
    . "${MODDIR}/core/config.sh"
    . "${MODDIR}/core/detect.sh"

    # Preserve caller's overrides -- config_init resets via _config_defaults()
    local _saved_mode_override="${SCALPEL_MODE_OVERRIDE:-}"
    local _saved_nuke_timeout="${SCALPEL_NUKE_TIMEOUT:-}"
    config_init 2>/dev/null
    [ -n "$_saved_mode_override" ] && SCALPEL_MODE_OVERRIDE="$_saved_mode_override"
    [ -n "$_saved_nuke_timeout" ] && SCALPEL_NUKE_TIMEOUT="$_saved_nuke_timeout"

    log_init

    log_i "$_tag" "starting debloat run"

    local _nuke_lock="${SCALPEL_DATA}/nuke.lock"
    echo "$$" > "$_nuke_lock" 2>/dev/null

    # Mark in-flight so service.sh can detect interrupted runs (KSU 10s kill)
    _write_status "running" 0 0

    if [ ! -f "$NUKE_LIST" ]; then
        log_i "$_tag" "no nuke list found, nothing to do"
        _write_status "none" 0 0
        rm -f "$_nuke_lock"
        return 0
    fi

    local jq_bin="${MODDIR}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    if ! "$jq_bin" '.' "$NUKE_LIST" >/dev/null 2>&1; then
        log_e "$_tag" "nuke_list.json is invalid JSON"
        rm -f "$_nuke_lock"
        return 1
    fi

    local count
    count="$("$jq_bin" 'length' "$NUKE_LIST" 2>/dev/null)"
    count="${count:-0}"
    # toybox wc pads with spaces on some ROMs
    count="$(echo "$count" | tr -d '[:space:]')"

    if [ "$count" = "0" ]; then
        log_i "$_tag" "nuke list empty, nothing to do"
        _write_status "none" 0 0
        rm -f "$_nuke_lock"
        return 0
    fi

    local mode
    mode="$(detect_mode)"
    if [ -z "$mode" ]; then
        log_i "$_tag" "no filesystem mode available, deferring to service.sh for pm"
        _write_status "pm_deferred" 0 "$count"
        rm -f "$_nuke_lock"
        return 0
    fi

    local mode_script="${MODDIR}/modes/mode_${mode}.sh"
    if [ ! -f "$mode_script" ]; then
        log_e "$_tag" "mode script not found: $mode_script"
        _write_status "error" 0 0
        rm -f "$_nuke_lock"
        return 1
    fi
    . "$mode_script"

    if ! mode_probe; then
        log_e "$_tag" "mode $mode probe failed"
        _write_status "error" 0 0
        rm -f "$_nuke_lock"
        return 1
    fi

    log_i "$_tag" "mode=$mode apps=$count"

    local success=0
    local failed=0
    local _timed_out="false"
    local tmp="${SCALPEL_DATA}/.nuke_batch.$$"

    # KernelSU kills post-fs-data after ~10s; 0 disables the guard (service.sh context)
    local _timeout="${SCALPEL_NUKE_TIMEOUT:-7}"
    local _start_time
    _start_time=$(date +%s 2>/dev/null || echo 0)

    "$jq_bin" -r '.[] | "\(.package_name)\t\(.app_path)"' "$NUKE_LIST" > "$tmp" 2>/dev/null

    if [ ! -s "$tmp" ]; then
        log_e "$_tag" "failed to parse nuke list"
        rm -f "$tmp"
        rm -f "$_nuke_lock"
        return 1
    fi

    while IFS='	' read -r pkg app_path; do
        [ -z "$pkg" ] && continue
        [ -z "$app_path" ] && continue

        if [ "$_timeout" -gt 0 ] 2>/dev/null; then
            local _now
            _now=$(date +%s 2>/dev/null || echo 0)
            if [ $((_now - _start_time)) -ge "$_timeout" ]; then
                log_w "$_tag" "approaching timeout (${_timeout}s), deferring remaining packages"
                _timed_out="true"
                break
            fi
        fi

        if mode_debloat "$pkg" "$app_path"; then
            success=$((success + 1))
            log_d "$_tag" "debloated: $pkg"
        else
            failed=$((failed + 1))
            log_e "$_tag" "failed to debloat: $pkg"
        fi
    done < "$tmp"

    rm -f "$tmp"

    # Vendor symlink fixup runs ONCE after all debloats (not per-app)
    case "$mode" in
        whiteout|magisk)
            . "${MODDIR}/core/whiteout_helpers.sh"
            whiteout_fix_vendor_symlinks "${MODDIR}"
            ;;
        symlink)
            type _fix_vendor_symlinks >/dev/null 2>&1 && _fix_vendor_symlinks "${MODDIR}"
            ;;
    esac

    _write_status "$mode" "$success" "$failed" "$_timed_out"
    rm -f "$_nuke_lock"

    if [ "$_timed_out" = "true" ]; then
        log_i "$_tag" "partial: mode=$mode success=$success failed=$failed (timeout, rest deferred)"
        return 0
    fi

    log_i "$_tag" "complete: mode=$mode success=$success failed=$failed"

    [ "$failed" -gt 0 ] && return 1
    return 0
}

# Only execute when run directly, not when sourced
case "${0##*/}" in
    nuke.sh) nuke_run "$@" ;;
esac
