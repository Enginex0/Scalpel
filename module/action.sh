#!/system/bin/sh
# Entry point when user taps module in root manager app
MODDIR="${0%/*}"
TAG="action"

SCALPEL_DATA="/data/adb/scalpel"
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

    if [ ! -f "$STATUS_FILE" ] || ! _jq '.' "$STATUS_FILE" >/dev/null 2>&1; then
        return
    fi

    local debloated systemized mode
    debloated="$(_jq -r '.debloated // 0' "$STATUS_FILE" 2>/dev/null)"
    systemized="$(_jq -r '.systemized // 0' "$STATUS_FILE" 2>/dev/null)"
    mode="$(_jq -r '.mode // "?"' "$STATUS_FILE" 2>/dev/null)"

    local desc="${debloated} debloated, ${systemized} systemized [${mode}]"

    # KSU has ksud config for runtime description override
    if [ "$KSU" = "true" ] && command -v ksud >/dev/null 2>&1; then
        ksud module config set override.description "$desc" 2>/dev/null
    fi
}

_launch_webui_magisk() {
    # Magisk has no native WebUI -- launch standalone viewer app
    if pm path io.github.a13e300.ksuwebui >/dev/null 2>&1; then
        echo "  Launching WebUI in KSUWebUIStandalone..."
        am start -n "io.github.a13e300.ksuwebui/.WebUIActivity" -e id "scalpel" >/dev/null 2>&1
        return 0
    fi

    if pm path com.dergoogler.mmrl.wx >/dev/null 2>&1; then
        echo "  Launching WebUI in WebUI X..."
        am start -n "com.dergoogler.mmrl.wx/.ui.activity.webui.WebUIActivity" -e MOD_ID "scalpel" >/dev/null 2>&1
        return 0
    fi

    echo "  No WebUI viewer installed."
    echo "  Install KSUWebUIStandalone or WebUI X to access the full interface."
    echo "  https://github.com/5ec1cff/KsuWebUIStandalone/releases"
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
