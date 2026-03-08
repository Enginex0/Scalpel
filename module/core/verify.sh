#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Post-reboot verification — confirms debloat whiteouts survived boot, updates status.json for WebUI

MODDIR="${MODDIR:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
SCALPEL_DATA="/data/adb/scalpel"
NUKE_LIST="${SCALPEL_DATA}/nuke_list.json"
STATUS_FILE="${SCALPEL_DATA}/status.json"

verify_run() {
    local _tag="verify"
    . "${MODDIR}/core/logging.sh"
    . "${MODDIR}/core/config.sh"
    . "${MODDIR}/core/whiteout_helpers.sh"
    config_init 2>/dev/null
    log_init

    log_i "$_tag" "starting post-boot verification"

    if [ ! -f "$NUKE_LIST" ]; then
        log_i "$_tag" "no nuke list, nothing to verify"
        _update_verify_status 0 0 0 0
        return 0
    fi

    local jq_bin="${MODDIR}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    local count
    count="$("$jq_bin" 'length' "$NUKE_LIST" 2>/dev/null)"
    count="$(echo "$count" | tr -d '[:space:]')"
    count="${count:-0}"

    if [ "$count" = "0" ]; then
        log_i "$_tag" "nuke list empty, nothing to verify"
        _update_verify_status 0 0 0 0
        return 0
    fi

    local mode=""
    if [ -f "$STATUS_FILE" ]; then
        mode="$("$jq_bin" -r '.mode // ""' "$STATUS_FILE" 2>/dev/null)"
    fi

    local verified=0 broken=0
    local tmp="${SCALPEL_DATA}/.verify_batch.$$"

    "$jq_bin" -r '.[] | "\(.package_name)\t\(.app_path)"' "$NUKE_LIST" > "$tmp" 2>/dev/null

    if [ ! -s "$tmp" ]; then
        log_e "$_tag" "failed to parse nuke list"
        rm -f "$tmp"
        return 1
    fi

    while IFS='	' read -r pkg app_path; do
        [ -z "$pkg" ] && continue
        [ -z "$app_path" ] && continue

        if [ "$mode" = "pm" ]; then
            # pm mode: check if package is disabled
            if pm list packages -d 2>/dev/null | grep -qF "package:${pkg}"; then
                verified=$((verified + 1))
            else
                broken=$((broken + 1))
                log_w "$_tag" "debloat not holding: $pkg (pm disabled but re-enabled)"
            fi
        else
            # overlay mode: check whiteout char dev exists in module dir
            if whiteout_verify "$MODDIR" "$app_path"; then
                verified=$((verified + 1))
            else
                broken=$((broken + 1))
                log_w "$_tag" "debloat not holding: $pkg (whiteout missing)"
            fi
        fi
    done < "$tmp"

    rm -f "$tmp"

    local sys_verified=0 sys_broken=0

    _update_verify_status "$verified" "$broken" "$sys_verified" "$sys_broken"
    log_i "$_tag" "complete: verified=$verified broken=$broken"

    [ "$broken" -gt 0 ] && return 1
    return 0
}

_update_verify_status() {
    local _tag="verify"
    local debloat_verified="$1" debloat_broken="$2"
    local sys_verified="$3" sys_broken="$4"

    local jq_bin="${MODDIR}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    local timestamp iso_date
    timestamp="$(date +%s 2>/dev/null || echo 0)"
    iso_date="$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || echo "unknown")"

    local tmp="${STATUS_FILE}.tmp.$$"

    if [ -f "$STATUS_FILE" ]; then
        "$jq_bin" \
            --argjson dv "$debloat_verified" \
            --argjson db "$debloat_broken" \
            --argjson sv "$sys_verified" \
            --argjson sb "$sys_broken" \
            --arg lv "$iso_date" \
            --argjson ts "$timestamp" \
            '. + {debloat_verified:$dv, debloat_broken:$db, systemize_verified:$sv, systemize_broken:$sb, last_verify:$lv, timestamp:$ts}' \
            "$STATUS_FILE" > "$tmp" 2>/dev/null
    else
        "$jq_bin" -n \
            --argjson dv "$debloat_verified" \
            --argjson db "$debloat_broken" \
            --argjson sv "$sys_verified" \
            --argjson sb "$sys_broken" \
            --arg lv "$iso_date" \
            --argjson ts "$timestamp" \
            '{mode:"unknown",debloated:0,debloat_failed:0,debloat_verified:$dv,debloat_broken:$db,systemized:0,systemize_verified:$sv,systemize_broken:$sb,last_nuke:"never",last_verify:$lv,timestamp:$ts}' \
            > "$tmp" 2>/dev/null
    fi

    if [ ! -s "$tmp" ]; then
        log_w "$_tag" "status merge failed, writing fresh status"
        rm -f "$tmp"
        "$jq_bin" -n \
            --argjson dv "$debloat_verified" \
            --argjson db "$debloat_broken" \
            --argjson sv "$sys_verified" \
            --argjson sb "$sys_broken" \
            --arg lv "$iso_date" \
            --argjson ts "$timestamp" \
            '{mode:"unknown",debloated:0,debloat_failed:0,debloat_verified:$dv,debloat_broken:$db,systemized:0,systemize_verified:$sv,systemize_broken:$sb,last_nuke:"never",last_verify:$lv,timestamp:$ts}' \
            > "$tmp" 2>/dev/null
    fi

    mv "$tmp" "$STATUS_FILE" 2>/dev/null || {
        log_w "$_tag" "failed to write status file"
        rm -f "$tmp"
    }
}

_verify_systemized() {
    return 0
}

case "${0##*/}" in
    verify.sh) verify_run "$@" ;;
esac
