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

# Detect device architecture once
_get_abi() {
    local abi
    abi=$(getprop ro.product.cpu.abi 2>/dev/null)
    case "$abi" in
        arm64*) echo "arm64-v8a" ;;
        armeabi*|arm*) echo "armeabi-v7a" ;;
        *) echo "" ;;
    esac
}
DEVICE_ABI=$(_get_abi)
[ -z "$DEVICE_ABI" ] && { log_w "$TAG" "unsupported abi"; }

# Place correct jq binary for device architecture (needed by scanner)
_setup_jq() {
    local src="$MODPATH/bin/${DEVICE_ABI}/jq"
    if [ -f "$src" ]; then
        cp "$src" "$MODPATH/bin/jq"
        chmod 0755 "$MODPATH/bin/jq"
        log_d "$TAG" "jq=$DEVICE_ABI"
    else
        log_w "$TAG" "jq binary missing for $DEVICE_ABI"
    fi
}
_setup_jq

# Place correct aapt binary for device architecture
_setup_aapt() {
    local src="$MODPATH/bin/${DEVICE_ABI}/aapt"
    if [ -f "$src" ]; then
        mkdir -p "$MODPATH/common"
        cp "$src" "$MODPATH/common/aapt"
        chmod 0755 "$MODPATH/common/aapt"
        log_d "$TAG" "aapt=$DEVICE_ABI"
    else
        log_w "$TAG" "aapt binary missing for $DEVICE_ABI"
    fi
}
_setup_aapt

# Categories DB needed by scanner and WebUI
if [ -f "$MODPATH/data/categories.json" ]; then
    cp "$MODPATH/data/categories.json" "$SCALPEL_DATA/categories.json"
elif [ -f "$MODPATH/webroot/categories.json" ]; then
    cp "$MODPATH/webroot/categories.json" "$SCALPEL_DATA/categories.json"
fi

# Scanner needs MODDIR for aapt lookup -- alias from MODPATH during install
MODDIR="$MODPATH"
. "$MODPATH/core/scanner.sh"

ui_print "  Scanning system apps..."
if scanner_run; then
    _app_count=$("$MODPATH/bin/jq" 'length' "$SCALPEL_DATA/app_list.json" 2>/dev/null)
    ui_print "  Found ${_app_count:-0} system apps (cached)"
    log_i "$TAG" "scan: ${_app_count:-0} apps"
else
    ui_print "  Scan completed with warnings"
    log_w "$TAG" "scanner returned non-zero"
fi

mkdir -p "$SCALPEL_DATA/icons"

# Detect capabilities and show user what mode will be used
ui_print ""
ui_print "  Detecting system capabilities..."

_detect_capabilities() {
    local _mode=""

    # Check ZeroMount (highest priority)
    if [ -e "/dev/zeromount" ]; then
        local _zm=""
        command -v zm >/dev/null 2>&1 && _zm="zm"
        [ -z "$_zm" ] && [ -x "/data/adb/modules/zeromount/bin/zm" ] && _zm="found"
        [ -z "$_zm" ] && [ -x "/data/adb/ksu/bin/zm" ] && _zm="found"
        if [ -n "$_zm" ]; then
            _mode="zeromount"
            ui_print "  [✓] ZeroMount VFS available (best stealth)"
        fi
    fi

    # Check overlayfs support
    local _has_overlayfs="false"
    if grep -q "overlay" /proc/filesystems 2>/dev/null; then
        _has_overlayfs="true"
        log_d "$TAG" "overlayfs supported"
    fi

    # Check tmpfs xattr support (needed for whiteout mode)
    local _has_xattr="false"
    local _mnt_dir=""
    [ -w /mnt/vendor ] && _mnt_dir="/mnt/vendor"
    [ -z "$_mnt_dir" ] && [ -w /mnt ] && _mnt_dir="/mnt"
    [ -z "$_mnt_dir" ] && [ -w /dev ] && _mnt_dir="/dev"

    if [ -n "$_mnt_dir" ]; then
        local _tf="${_mnt_dir}/.scalpel_xattr_test"
        rm -f "$_tf" 2>/dev/null
        if busybox mknod "$_tf" c 0 0 2>/dev/null; then
            if busybox setfattr -n trusted.overlay.whiteout -v y "$_tf" 2>/dev/null; then
                _has_xattr="true"
                log_d "$TAG" "tmpfs xattr supported"
            fi
            rm -f "$_tf" 2>/dev/null
        fi
    fi

    # Check busybox for tmpfs mount (mountify mode)
    local _has_busybox="false"
    if command -v busybox >/dev/null 2>&1 || [ -x "/data/adb/ksu/bin/busybox" ] || [ -x "/data/adb/magisk/busybox" ]; then
        _has_busybox="true"
    fi

    # Check magic mount capability
    local _has_magic="false"
    if [ "$ROOT_MGR" = "magisk" ]; then
        _has_magic="true"
    elif [ "$ROOT_MGR" = "ksu" ]; then
        [ "$KSU_MAGIC_MOUNT" = "true" ] && _has_magic="true"
        [ -n "$KSU_VER_CODE" ] && [ "$KSU_VER_CODE" -ge 22098 ] 2>/dev/null && _has_magic="true"
    elif [ "$ROOT_MGR" = "apatch" ]; then
        [ "$APATCH_BIND_MOUNT" = "true" ] && _has_magic="true"
    fi

    # Report detected mode (if zeromount not already detected)
    if [ -z "$_mode" ]; then
        if [ "$_has_busybox" = "true" ]; then
            _mode="mountify"
            ui_print "  [✓] Mountify (tmpfs overlay) available"
        elif [ "$_has_overlayfs" = "true" ]; then
            _mode="symlink"
            ui_print "  [✓] Symlink overlay available"
        elif [ "$_has_overlayfs" = "true" ] && [ "$_has_xattr" = "true" ]; then
            _mode="whiteout"
            ui_print "  [✓] OverlayFS whiteout available"
        elif [ "$_has_magic" = "true" ]; then
            _mode="magisk"
            ui_print "  [✓] Magic mount available"
        else
            _mode="pm"
            ui_print "  [!] Fallback to pm disable (least stealthy)"
        fi
    fi

    # Additional capability warnings
    [ "$_has_overlayfs" = "false" ] && ui_print "  [i] No overlayfs (kernel limitation)"
    [ "$_has_xattr" = "false" ] && [ "$_has_overlayfs" = "true" ] && ui_print "  [i] No xattr support (whiteout unavailable)"

    log_i "$TAG" "detected_mode=$_mode overlayfs=$_has_overlayfs xattr=$_has_xattr magic=$_has_magic"

    # Write initial status.json so WebUI shows mode before first boot
    local _jq="${MODPATH}/bin/jq"
    [ ! -x "$_jq" ] && _jq="jq"
    "$_jq" -n \
        --arg mode "$_mode" \
        '{mode:$mode,debloated:0,debloat_failed:0,systemized:0,partial:false,last_nuke:"never",timestamp:0}' \
        > "${SCALPEL_DATA}/status.json" 2>/dev/null
}
_detect_capabilities

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

# Permissions (set webroot perms BEFORE symlink creation to avoid following into data dir)
ui_print ""
ui_print "  Setting permissions..."
set_perm_recursive "$MODPATH" 0 0 0755 0644
[ -f "$MODPATH/common/aapt" ] && set_perm "$MODPATH/common/aapt" 0 0 0755
[ -f "$MODPATH/bin/jq" ] && set_perm "$MODPATH/bin/jq" 0 0 0755

# Symlink AFTER permissions to prevent set_perm_recursive following into data dir
ln -sf "$SCALPEL_DATA/icons" "$MODPATH/webroot/icons"
log_d "$TAG" "symlink: webroot/icons -> $SCALPEL_DATA/icons"

ui_print ""
ui_print "  Installation complete -- reboot to activate"
ui_print "-----------------------------------"

log_i "$TAG" "installation complete"
