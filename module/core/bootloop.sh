#!/system/bin/sh
# Sourced at early boot -- 3-strike counter, backup restore, module disable on threshold
# ZERO external dependencies: no busybox, no jq, no logging.sh

BOOTLOOP_TAG="scalpel:bootloop"
BOOTLOOP_COUNT_FILE="/data/adb/scalpel/count.sh"

# Overlay partition dirs that bootloop recovery must wipe
BOOTLOOP_WIPE_DIRS="system system_ext vendor product odm oem \
mi_ext my_bigball my_carrier my_company my_engineering \
my_heytap my_manifest my_preload my_product my_region \
my_reserve my_stock"

_bl_log() {
    echo "${BOOTLOOP_TAG}: $1" > /dev/kmsg 2>/dev/null
}

_bl_write_count() {
    echo "BOOTCOUNT=$1" > "$BOOTLOOP_COUNT_FILE" 2>/dev/null || {
        _bl_log "FATAL cannot write boot counter to $BOOTLOOP_COUNT_FILE"
        return 1
    }
}

# Force reboot -- safe at post-fs-data (no setprop, it deadlocks KSU)
_bl_reboot() {
    # Best-effort flush; timeout prevents hang on wedged I/O during bootloop recovery
    busybox timeout 3 sync 2>/dev/null
    reboot 2>/dev/null
    /system/bin/reboot 2>/dev/null
    busybox reboot 2>/dev/null
    echo b > /proc/sysrq-trigger 2>/dev/null
}

# Read counter, increment, persist. Called from post-fs-data.sh.
bootloop_init() {
    mkdir -p "/data/adb/scalpel" 2>/dev/null || {
        _bl_log "WARN cannot create /data/adb/scalpel directory"
    }

    BOOTCOUNT=0
    if [ -f "$BOOTLOOP_COUNT_FILE" ]; then
        BOOTCOUNT="$(grep -oE '^BOOTCOUNT=[0-9]+$' "$BOOTLOOP_COUNT_FILE" 2>/dev/null | head -1 | cut -d= -f2)"
    fi

    # Sanitize: non-numeric resets to 0; only -1 (recovery marker) is valid negative
    case "$BOOTCOUNT" in
        ''|*[!0-9-]*) BOOTCOUNT=0 ;;
    esac
    [ "$BOOTCOUNT" -lt -1 ] 2>/dev/null && BOOTCOUNT=0

    BOOTCOUNT=$(( BOOTCOUNT + 1 ))
    _bl_write_count "$BOOTCOUNT"
}

# If counter hit threshold, nuke everything and disable. Called from post-fs-data.sh.
bootloop_check() {
    if [ "$BOOTCOUNT" -ge 3 ] 2>/dev/null; then
        _bl_log "FATAL: bootloop detected, strike ${BOOTCOUNT} -- initiating recovery"

        # Attempt config recovery if config.sh was sourced
        if type config_restore >/dev/null 2>&1; then
            config_restore
        fi

        # Wipe all overlay/whiteout directories
        for dir in $BOOTLOOP_WIPE_DIRS; do
            rm -rf "${MODDIR:?}/${dir}" 2>/dev/null
        done

        touch "$MODDIR/disable" || _bl_log "WARN failed to create disable marker"

        # Inform user via module description
        local _bl_desc="Bootloop protection triggered. Module disabled. Re-enable manually."
        if [ "$KSU" = "true" ] && command -v ksud >/dev/null 2>&1; then
            ksud module config set override.description "$_bl_desc" 2>/dev/null
        fi
        if [ -f "$MODDIR/module.prop" ]; then
            sed -i "s|^description=.*|description=${_bl_desc}|" \
                "$MODDIR/module.prop" 2>/dev/null
        fi

        # Recovery marker: -1 increments to 0 on next boot
        _bl_write_count -1

        _bl_log "recovery complete, rebooting"
        _bl_reboot
    fi

    _bl_log "boot attempt ${BOOTCOUNT}/3"
    return 0
}

# Mark boot successful. Called from post_boot.sh after boot_completed.
bootloop_reset() {
    _bl_write_count 0
    _bl_log "boot succeeded, counter reset"
}
