#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
MODDIR="${0%/*}"

# Clear the post-boot flag so service.sh/boot-completed.sh can claim it fresh
rm -f "/data/adb/scalpel/boot_completed_handled" 2>/dev/null

# 3-strike bootloop protection -- must run before anything else
. "${MODDIR}/core/bootloop.sh"
bootloop_init
bootloop_check || exit 0

# Config first so SCALPEL_MODE_OVERRIDE and SCALPEL_LOG_LEVEL are available
. "${MODDIR}/core/config.sh"
config_init 2>/dev/null || echo "scalpel[post-fs-data]: config_init failed (continuing)" > /dev/kmsg

. "${MODDIR}/core/logging.sh"
log_init

TAG="post-fs-data"
log_i "$TAG" "scalpel starting (boot)"

# Debloat engine -- sources detect.sh + mode scripts internally
. "${MODDIR}/core/nuke.sh"
nuke_run || log_w "post-fs-data" "nuke completed with failures"

log_i "$TAG" "post-fs-data complete"
