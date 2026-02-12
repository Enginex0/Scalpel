#!/system/bin/sh
# Entry point when user taps module in root manager app
MODDIR="${0%/*}"

SCALPEL_DATA="/data/adb/scalpel"

. "${MODDIR}/core/logging.sh"
log_init 2>/dev/null
_tag="action"
STATUS_FILE="${SCALPEL_DATA}/status.json"
SYSTEMIZE_LIST="${SCALPEL_DATA}/systemize_list.json"

# Resolve jq once -- bundled binary first, PATH fallback
_JQ_BIN="${MODDIR}/bin/jq"
[ ! -x "$_JQ_BIN" ] && _JQ_BIN="jq"
_jq() { "$_JQ_BIN" "$@"; }

_print_status() {
    echo ""
    echo "=== Scalpel Status ==="
    echo ""

    if [ ! -f "$STATUS_FILE" ]; then
        echo "  State: Pending first boot"
        echo "  No operations have run yet."
        echo ""
        return
    fi

    if ! _jq '.' "$STATUS_FILE" >/dev/null 2>&1; then
        echo "  State: Status file corrupted"
        echo ""
        return
    fi

    local mode debloated failed systemized last_nuke verified broken
    mode="$(_jq -r '.mode // "unknown"' "$STATUS_FILE" 2>/dev/null)"
    debloated="$(_jq -r '.debloated // 0' "$STATUS_FILE" 2>/dev/null)"
    failed="$(_jq -r '.debloat_failed // 0' "$STATUS_FILE" 2>/dev/null)"
    systemized="$(_jq -r '.systemized // 0' "$STATUS_FILE" 2>/dev/null)"
    last_nuke="$(_jq -r '.last_nuke // "never"' "$STATUS_FILE" 2>/dev/null)"
    verified="$(_jq -r '.debloat_verified // "-"' "$STATUS_FILE" 2>/dev/null)"
    broken="$(_jq -r '.debloat_broken // "-"' "$STATUS_FILE" 2>/dev/null)"

    echo "  Mode:        $mode"
    echo "  Debloated:   $debloated apps"
    [ "$failed" != "0" ] && echo "  Failed:      $failed apps"
    echo "  Verified:    $verified"
    [ "$broken" != "0" ] && [ "$broken" != "-" ] && echo "  Broken:      $broken"
    echo "  Systemized:  $systemized apps"
    echo "  Last run:    $last_nuke"

    # Systemize list count if present
    if [ -f "$SYSTEMIZE_LIST" ]; then
        local sys_count
        sys_count="$(_jq 'length' "$SYSTEMIZE_LIST" 2>/dev/null)"
        sys_count="${sys_count:-0}"
        [ "$sys_count" != "0" ] && echo "  Sys. queued:  $sys_count"
    fi

    echo ""
}

# KSU/APatch can update the module description shown in the manager
_update_description() {
    [ -z "$KSU" ] && [ -z "$APATCH" ] && return

    if [ ! -f "$STATUS_FILE" ]; then
        log_d "$_tag" "update_description: no status file yet"
        return
    fi

    if ! _jq '.' "$STATUS_FILE" >/dev/null 2>&1; then
        log_w "$_tag" "update_description: status file corrupted"
        return
    fi

    local debloated systemized mode
    debloated="$(_jq -r '.debloated // 0' "$STATUS_FILE" 2>/dev/null)"
    systemized="$(_jq -r '.systemized // 0' "$STATUS_FILE" 2>/dev/null)"
    mode="$(_jq -r '.mode // "?"' "$STATUS_FILE" 2>/dev/null)"

    local desc="${debloated} debloated, ${systemized} systemized [${mode}]"

    if [ "$KSU" = "true" ] && command -v ksud >/dev/null 2>&1; then
        KSU_MODULE=scalpel ksud module config set override.description "$desc" 2>/dev/null
        log_d "$_tag" "updated description: $desc"
    elif [ "$APATCH" = "true" ]; then
        printf '%s' "$desc" > "${MODDIR}/override.description" 2>/dev/null
        log_d "$_tag" "updated description (APatch): $desc"
    fi
}

_launch_webui_magisk() {
    if pm path io.github.a13e300.ksuwebui >/dev/null 2>&1; then
        echo "  Launching WebUI in KSUWebUIStandalone..."
        if am start -n "io.github.a13e300.ksuwebui/.WebUIActivity" -e id "scalpel" >/dev/null 2>&1; then
            log_i "$_tag" "launched WebUI via KSUWebUIStandalone"
            return 0
        fi
        log_e "$_tag" "failed to launch KSUWebUIStandalone"
        return 1
    fi

    if pm path com.dergoogler.mmrl.wx >/dev/null 2>&1; then
        echo "  Launching WebUI in WebUI X..."
        if am start -n "com.dergoogler.mmrl.wx/.ui.activity.webui.WebUIActivity" -e MOD_ID "scalpel" >/dev/null 2>&1; then
            log_i "$_tag" "launched WebUI via WebUI X"
            return 0
        fi
        log_e "$_tag" "failed to launch WebUI X"
        return 1
    fi

    echo "  No WebUI viewer installed."
    echo "  Install KSUWebUIStandalone or WebUI X to access the full interface."
    echo "  https://github.com/5ec1cff/KsuWebUIStandalone/releases"
    log_w "$_tag" "no WebUI viewer available for Magisk"
    return 1
}

_show_log_tail() {
    local log_file="${SCALPEL_DATA}/debug.log"
    if [ -f "$log_file" ]; then
        echo "=== Recent Log ==="
        tail -n 15 "$log_file"
        echo ""
    else
        echo "  No debug log found."
    fi
}

# --- Main ---
log_d "$_tag" "action.sh invoked"

_print_status
_update_description

if [ -n "$KSU" ] || [ -n "$APATCH" ]; then
    # KSU/APatch: action button context. Status already printed.
    # WebUI is served natively from webroot/ -- no launch needed.
    _show_log_tail
else
    # Magisk: terminal context. Offer WebUI launch.
    _launch_webui_magisk
    echo ""
    _show_log_tail
fi
