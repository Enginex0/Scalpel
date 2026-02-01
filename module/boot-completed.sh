#!/system/bin/sh
# KSU/APatch native boot_completed stage -- fires after ACTION_BOOT_COMPLETED
# Magisk lacks this stage; on Magisk, service.sh handles this work via polling.
# Future: post-mount.sh could verify overlayfs early, but adds complexity for little gain.
MODDIR="${0%/*}"

[ -f "${MODDIR}/disable" ] && exit 0

. "${MODDIR}/core/post_boot.sh"
post_boot_run
