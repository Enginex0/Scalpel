#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
MODDIR="${0%/*}"

[ -f "${MODDIR}/disable" ] && exit 0

# KSU/APatch fire boot-completed.sh natively after ACTION_BOOT_COMPLETED.
# On those managers, service.sh has nothing boot-dependent to do.
# On Magisk, boot-completed.sh never fires, so we poll and handle it here.
if [ "$KSU" = "true" ] || [ "$APATCH" = "true" ]; then
    echo "scalpel: service.sh deferring to boot-completed.sh (KSU/APatch)" > /dev/kmsg 2>/dev/null
    exit 0
fi

# Magisk path: poll for boot_completed, then run the shared post-boot work
_boot_wait=0
while [ "$(getprop sys.boot_completed)" != "1" ]; do
    sleep 1
    _boot_wait=$((_boot_wait + 1))
    if [ "$_boot_wait" -ge 300 ]; then
        echo "scalpel: boot_completed timeout after 300s, proceeding anyway" > /dev/kmsg
        break
    fi
done

. "${MODDIR}/core/post_boot.sh"
post_boot_run
