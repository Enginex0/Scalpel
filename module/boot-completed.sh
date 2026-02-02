#!/system/bin/sh
# KSU/APatch native boot_completed stage -- fires after ACTION_BOOT_COMPLETED
# Magisk lacks this stage; on Magisk, service.sh handles this work via polling.
MODDIR="${0%/*}"

echo "scalpel[boot-completed]: starting" > /dev/kmsg

[ -f "${MODDIR}/disable" ] && {
    echo "scalpel[boot-completed]: skipped (module disabled)" > /dev/kmsg
    exit 0
}

# Recreate icon symlink (survives module updates)
. "${MODDIR}/core/logging.sh"
. "${MODDIR}/core/config.sh"
config_init 2>/dev/null
log_init 2>/dev/null
ln -sf "/data/adb/scalpel/icons" "${MODDIR}/webroot/icons.tmp"
mv -f "${MODDIR}/webroot/icons.tmp" "${MODDIR}/webroot/icons"
log_d "boot-completed" "symlink: webroot/icons -> /data/adb/scalpel/icons"

. "${MODDIR}/core/post_boot.sh" || {
    echo "scalpel[boot-completed]: FATAL cannot source post_boot.sh" > /dev/kmsg
    exit 1
}
post_boot_run

echo "scalpel[boot-completed]: complete" > /dev/kmsg
