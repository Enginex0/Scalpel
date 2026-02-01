#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Module installation -- $MODPATH valid here ONLY (never at boot, use $MODDIR)

SCALPEL_DATA="/data/adb/scalpel"

[ -z "$MODPATH" ] && { echo "[ERROR] MODPATH undefined"; exit 1; }

ui_print "-----------------------------------"
ui_print "  Scalpel - Precision Debloater"
ui_print "-----------------------------------"
ui_print ""

# Persistent data survives module updates
mkdir -p "$SCALPEL_DATA"

# Config: load existing or write defaults
. "$MODPATH/core/config.sh"
config_init 2>/dev/null

# Logging available after config sets SCALPEL_LOG_LEVEL
. "$MODPATH/core/logging.sh"
log_init 2>/dev/null

TAG="install"
log_i "$TAG" "installing scalpel v0.1.0"

# Detect root manager for logging
. "$MODPATH/core/detect.sh"
ROOT_MGR=$(detect_root_manager)
log_i "$TAG" "root_manager=$ROOT_MGR"
ui_print "  Root manager: $ROOT_MGR"

# Place correct aapt binary for device architecture
_setup_aapt() {
    local abi
    abi=$(getprop ro.product.cpu.abi 2>/dev/null)
    case "$abi" in
        arm64*) abi="arm64-v8a" ;;
        armeabi*|arm*) abi="armeabi-v7a" ;;
        *) log_w "$TAG" "unsupported abi=$abi"; return 1 ;;
    esac
    local src="$MODPATH/bin/${abi}/aapt"
    if [ -f "$src" ]; then
        mkdir -p "$MODPATH/common"
        cp "$src" "$MODPATH/common/aapt"
        chmod 0755 "$MODPATH/common/aapt"
        log_d "$TAG" "aapt=$abi"
    else
        log_w "$TAG" "aapt binary missing for $abi"
    fi
}
_setup_aapt

# Categories DB needed by scanner and WebUI
if [ -f "$MODPATH/webroot/categories.json" ]; then
    cp "$MODPATH/webroot/categories.json" "$SCALPEL_DATA/categories.json"
fi

# Scanner needs MODDIR for aapt lookup -- alias from MODPATH during install
MODDIR="$MODPATH"
. "$MODPATH/core/scanner.sh"

ui_print "  Scanning system apps..."
if scanner_run; then
    _app_count=$(jq 'length' "$SCALPEL_DATA/app_list.json" 2>/dev/null)
    ui_print "  Found ${_app_count:-0} system apps (cached)"
    log_i "$TAG" "scan: ${_app_count:-0} apps"
else
    ui_print "  Scan completed with warnings"
    log_w "$TAG" "scanner returned non-zero"
fi

# Volume key: UP = apply default debloat, DOWN/timeout = skip (safe default)
ui_print ""
ui_print "  Apply default debloat list?"
ui_print "  VOL UP = Yes | VOL DOWN / timeout = Skip"
ui_print ""

_chooseport() {
    local timeout_s="${1:-8}"
    local result
    result=$(timeout "$timeout_s" getevent -qlc 1 2>/dev/null)
    case "$result" in
        *KEY_VOLUMEUP*)   return 0 ;;
        *KEY_VOLUMEDOWN*) return 1 ;;
        *)                return 1 ;;
    esac
}

if _chooseport 8; then
    ui_print "  Applying default debloat list..."
    . "$MODPATH/core/default_debloat.sh"
    if apply_default_debloat "$MODPATH"; then
        ui_print "  Default list applied -- apps hidden on first boot"
        log_i "$TAG" "default debloat applied"

        # KSU/APatch: REMOVE triggers mknod whiteouts at install time
        # Magisk does not process REMOVE -- nuke.sh handles it at boot
        if [ -n "$KSU" ] || [ -n "$APATCH" ]; then
            _nuke="${SCALPEL_DATA}/nuke_list.json"
            _jq="${MODPATH}/bin/jq"
            [ ! -x "$_jq" ] && _jq="jq"
            if [ -f "$_nuke" ]; then
                # Extract unique parent directories from APK paths, /system/ prefix only
                _candidates=$("$_jq" -r \
                    '[.[].app_path // empty | split("/")[:-1] | join("/")]
                     | unique[]
                     | select(startswith("/system/"))' \
                    "$_nuke" 2>/dev/null)

                _remove_entries=""
                for _d in $_candidates; do
                    [ -d "$_d" ] || continue
                    if [ -z "$_remove_entries" ]; then
                        _remove_entries="$_d"
                    else
                        _remove_entries="${_remove_entries}
${_d}"
                    fi
                done

                if [ -n "$_remove_entries" ]; then
                    REMOVE="$_remove_entries"
                    _rc=$(echo "$_remove_entries" | grep -c '/')
                    ui_print "  REMOVE set: ${_rc} app dirs (instant debloat)"
                    log_i "$TAG" "REMOVE: ${_rc} dirs for ${ROOT_MGR}"
                fi
                unset _candidates _remove_entries _rc _d
            fi
            unset _nuke _jq
        fi
    else
        ui_print "  Failed to build default list"
        log_e "$TAG" "default debloat failed"
    fi
else
    ui_print "  Skipped -- configure via WebUI after reboot"
    log_i "$TAG" "default debloat skipped"
fi

# Clean arch-specific aapt dirs (jq stays -- every boot script needs it)
rm -rf "$MODPATH/bin/arm64-v8a" "$MODPATH/bin/armeabi-v7a" 2>/dev/null

# KSU/APatch have built-in WebUI, no need for action.sh bridge
if [ -n "$KSU" ] || [ -n "$APATCH" ]; then
    rm -f "$MODPATH/action.sh" 2>/dev/null
fi

# Permissions
ui_print ""
ui_print "  Setting permissions..."
set_perm_recursive "$MODPATH" 0 0 0755 0644
[ -f "$MODPATH/common/aapt" ] && set_perm "$MODPATH/common/aapt" 0 0 0755
[ -f "$MODPATH/bin/jq" ] && set_perm "$MODPATH/bin/jq" 0 0 0755
[ -d "$MODPATH/webroot" ] && set_perm_recursive "$MODPATH/webroot" 0 0 0755 0644

ui_print ""
ui_print "  Installation complete -- reboot to activate"
ui_print "-----------------------------------"

log_i "$TAG" "installation complete"
