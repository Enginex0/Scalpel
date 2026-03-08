#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Debloat orchestrator -- create standard overlayfs whiteouts in module dir, let metamodule handle mounting

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

_nuke_unlock() {
    exec 8>&- 2>/dev/null
    rm -f "${SCALPEL_DATA}/nuke.lock" 2>/dev/null
}

_prune_empty_parents() {
    local dir="$1" stop="$2"
    while [ "$dir" != "$stop" ] && [ "$dir" != "/" ]; do
        rmdir "$dir" 2>/dev/null || break
        dir="$(dirname "$dir")"
    done
}

nuke_restore() {
    local _tag="nuke"
    local pkg="$1" app_path="$2"
    [ -z "$pkg" ] || [ -z "$app_path" ] && return 1

    . "${MODDIR}/core/logging.sh" 2>/dev/null
    . "${MODDIR}/core/whiteout_helpers.sh" 2>/dev/null

    log_init 2>/dev/null

    local app_dir
    app_dir="$(dirname "$app_path")"

    # Remove whiteout from module overlay
    whiteout_remove "$MODDIR" "$app_path"
    _prune_empty_parents "${MODDIR}${app_dir}" "$MODDIR"

    # Re-register with package manager
    pm install-existing "$pkg" >/dev/null 2>&1
    pm enable "$pkg" >/dev/null 2>&1

    log_i "$_tag" "restored: $pkg"
    return 0
}

nuke_run() {
    local _tag="nuke"
    . "${MODDIR}/core/logging.sh"
    . "${MODDIR}/core/config.sh"
    . "${MODDIR}/core/detect.sh"
    . "${MODDIR}/core/whiteout_helpers.sh"

    # Preserve caller's overrides -- config_init resets via _config_defaults()
    local _saved_mode_override="${SCALPEL_MODE_OVERRIDE:-}"
    local _saved_nuke_timeout="${SCALPEL_NUKE_TIMEOUT:-}"
    config_init 2>/dev/null
    [ -n "$_saved_mode_override" ] && SCALPEL_MODE_OVERRIDE="$_saved_mode_override"
    [ -n "$_saved_nuke_timeout" ] && SCALPEL_NUKE_TIMEOUT="$_saved_nuke_timeout"

    log_init

    log_i "$_tag" "starting debloat run"

    local _nuke_lock="${SCALPEL_DATA}/nuke.lock"
    exec 8>"$_nuke_lock"
    if ! flock -n 8; then
        log_w "$_tag" "another nuke_run is active, skipping"
        exec 8>&-
        return 1
    fi

    _write_status "running" 0 0

    if [ ! -f "$NUKE_LIST" ]; then
        log_i "$_tag" "no nuke list found, nothing to do"
        _write_status "none" 0 0
        _nuke_unlock
        return 0
    fi

    local jq_bin="${MODDIR}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    if ! "$jq_bin" '.' "$NUKE_LIST" >/dev/null 2>&1; then
        log_e "$_tag" "nuke_list.json is invalid JSON"
        _nuke_unlock
        return 1
    fi

    local count
    count="$("$jq_bin" 'length' "$NUKE_LIST" 2>/dev/null)"
    count="${count:-0}"
    count="$(echo "$count" | tr -d '[:space:]')"

    if [ "$count" = "0" ]; then
        log_i "$_tag" "nuke list empty, nothing to do"
        _write_status "none" 0 0
        _nuke_unlock
        return 0
    fi

    # Disable-only mode: pm disable each package, skip all filesystem operations
    if [ "$SCALPEL_DISABLE_ONLY" = "true" ] || [ "$SCALPEL_MODE_OVERRIDE" = "pm" ]; then
        log_i "$_tag" "pm-only mode: skipping filesystem debloat"
        local success=0 failed=0 pkg
        while read -r pkg; do
            [ -z "$pkg" ] && continue
            if pm disable-user --user 0 "$pkg" >/dev/null 2>&1; then
                success=$((success + 1))
                log_d "$_tag" "disabled: $pkg"
            else
                failed=$((failed + 1))
                log_w "$_tag" "failed to disable: $pkg"
            fi
        done <<EOF
$("$jq_bin" -r '.[].package_name' "$NUKE_LIST" 2>/dev/null)
EOF
        _write_status "pm" "$success" "$failed"
        _nuke_unlock
        log_i "$_tag" "pm-only complete: success=$success failed=$failed"
        [ "$failed" -gt 0 ] && return 1
        return 0
    fi

    # Determine debloat strategy: overlay whiteouts (standard) or pm fallback
    local mode="overlay"
    if ! can_create_whiteouts; then
        log_w "$_tag" "cannot create whiteouts, falling back to pm disable"
        mode="pm"
    fi

    log_i "$_tag" "mode=$mode apps=$count"

    # Pre-debloat pm disable for immediate UI hiding (system updates handled by post_boot.sh)
    if [ "$(getprop sys.boot_completed 2>/dev/null)" = "1" ]; then
        log_d "$_tag" "pre-debloat: disabling packages"
        local _pkg
        while read -r _pkg; do
            [ -z "$_pkg" ] && continue
            pm disable-user --user 0 "$_pkg" >/dev/null 2>&1 || true
        done <<EOF
$("$jq_bin" -r '.[].package_name' "$NUKE_LIST" 2>/dev/null)
EOF
    fi

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
        _nuke_unlock
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

        if [ "$mode" = "overlay" ]; then
            if whiteout_create "$MODDIR" "$app_path"; then
                success=$((success + 1))
                log_d "$_tag" "debloated: $pkg"
            else
                failed=$((failed + 1))
                log_e "$_tag" "failed to debloat: $pkg"
            fi
        else
            if pm disable-user --user 0 "$pkg" >/dev/null 2>&1; then
                success=$((success + 1))
                log_d "$_tag" "disabled: $pkg"
            else
                failed=$((failed + 1))
                log_e "$_tag" "failed to disable: $pkg"
            fi
        fi
    done < "$tmp"

    rm -f "$tmp"

    # Raw whiteouts: user-defined paths
    if [ "$mode" = "overlay" ]; then
        local _raw_file="${SCALPEL_DATA}/raw_whiteouts.txt"
        if [ -f "$_raw_file" ]; then
            log_d "$_tag" "processing raw_whiteouts.txt"
            local _line
            while IFS= read -r _line; do
                case "$_line" in '#'*|'') continue ;; esac
                case "$_line" in
                    /system/*|/vendor/*|/product/*|/system_ext/*|/oem/*|/odm/*) ;;
                    *) log_w "$_tag" "raw: skipping invalid path: $_line"; continue ;;
                esac
                if whiteout_create "$MODDIR" "${_line}/_.apk"; then
                    log_d "$_tag" "raw hidden: $_line"
                else
                    log_w "$_tag" "raw hide failed: $_line"
                fi
            done < "$_raw_file"
        fi

        # Vendor symlink fixup runs ONCE after all debloats
        whiteout_fix_vendor_symlinks "$MODDIR"
    fi

    # Re-enable apps from app_list that are disabled but NOT being nuked
    local _app_list="${SCALPEL_DATA}/app_list.json"
    if [ -f "$_app_list" ] && [ "$(getprop sys.boot_completed 2>/dev/null)" = "1" ]; then
        local _disabled_list _app_pkg
        _disabled_list=$(pm list packages -d 2>/dev/null)
        while read -r _app_pkg; do
            [ -z "$_app_pkg" ] && continue
            "$jq_bin" -e --arg pkg "$_app_pkg" '.[] | select(.package_name == $pkg)' "$NUKE_LIST" >/dev/null 2>&1 && continue
            if echo "$_disabled_list" | grep -qx "package:$_app_pkg"; then
                pm enable "$_app_pkg" >/dev/null 2>&1 || true
                log_d "$_tag" "re-enabled: $_app_pkg"
            fi
        done <<EOF
$("$jq_bin" -r '.[].package_name' "$_app_list" 2>/dev/null)
EOF
    fi

    _write_status "$mode" "$success" "$failed" "$_timed_out"
    _nuke_unlock

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
