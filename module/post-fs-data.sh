#!/system/bin/sh
MODDIR="${0%/*}"

# SAFETY: bootloop counter runs before binary — shell-native, no deps
SCALPEL_DATA="/data/adb/scalpel"
COUNTFILE="$SCALPEL_DATA/count.sh"
if [ -f "$COUNTFILE" ]; then
    . "$COUNTFILE"
    BOOTCOUNT=$((${BOOTCOUNT:-0} + 1))
else
    BOOTCOUNT=1
fi
mkdir -p "$SCALPEL_DATA"
echo "BOOTCOUNT=$BOOTCOUNT" > "$COUNTFILE"

# Reset exactly-once gate so boot-completed can claim it fresh
rm -rf "$SCALPEL_DATA/boot_completed_handled"

if [ "$BOOTCOUNT" -ge 3 ]; then
    echo "scalpel: bootloop guard triggered (count=$BOOTCOUNT), disabling" > /dev/kmsg
    rm -rf "$MODDIR/system"
    rm -f "$MODDIR/skip_mount" "$MODDIR/skip_mountify"
    touch "$MODDIR/disable"
    exit 0
fi

# Standalone mount mode: tell root manager not to mount module/system/
_mounting_mode=$(grep '^mounting_mode' "$SCALPEL_DATA/config.toml" 2>/dev/null | sed 's/.*= *"//' | sed 's/".*//')
if [ "$_mounting_mode" = "standalone" ]; then
    touch "$MODDIR/skip_mount"
    touch "$MODDIR/skip_mountify"
fi

. "$MODDIR/common.sh"
[ -z "$ABI" ] && exit 0
[ -x "$BIN" ] || exit 0

"$BIN" boot-init --stage=post-fs-data \
    2>&1 | while IFS= read -r line; do echo "scalpel: $line" > /dev/kmsg; done
