#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
MODDIR="${0%/*}"

# Clear the post-boot flag so service.sh/boot-completed.sh can claim it fresh
rm -rf "/data/adb/scalpel/boot_completed_handled" 2>/dev/null

# 3-strike bootloop protection -- must run before anything else
. "${MODDIR}/core/bootloop.sh"
bootloop_init
bootloop_check || exit 0

# Config first so SCALPEL_MODE_OVERRIDE and SCALPEL_LOG_LEVEL are available
. "${MODDIR}/core/config.sh"
config_init 2>/dev/null || echo "scalpel[post-fs-data]: config_init failed (continuing)" > /dev/kmsg

. "${MODDIR}/core/logging.sh"
log_init

SCALPEL_DATA="/data/adb/scalpel"
TAG="post-fs-data"
log_i "$TAG" "scalpel starting (boot)"

# Process deferred demotions before KSU locks module dirs
_pending="${SCALPEL_DATA}/pending_demote.json"
if [ -f "$_pending" ]; then
    _jq_bin="${MODDIR}/bin/jq"
    [ ! -x "$_jq_bin" ] && _jq_bin="jq"
    while IFS='|' read -r _pkg _tgt; do
        [ -z "$_pkg" ] && continue
        rm -rf "${MODDIR}/system/${_tgt}/${_pkg}"
        [ "$_tgt" = "priv-app" ] && rm -f "${MODDIR}/system/etc/permissions/privapp-permissions-${_pkg}.xml"
        log_i "$TAG" "cleaned demoted app: $_pkg"
    done <<DEMOTE_EOF
$("$_jq_bin" -r '.[] | "\(.package_name)|\(.target // "priv-app")"' "$_pending" 2>/dev/null)
DEMOTE_EOF
    rm -f "$_pending"
fi

. "${MODDIR}/core/nuke.sh"
nuke_run || log_w "post-fs-data" "nuke completed with failures"

log_i "$TAG" "post-fs-data complete"
