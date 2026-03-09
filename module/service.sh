#!/system/bin/sh
MODDIR="${0%/*}"
[ -f "$MODDIR/disable" ] && exit 0

# Single-instance guard
LOCKFILE="/dev/scalpel_svc_lock"
( set -o noclobber; echo $$ > "$LOCKFILE" ) 2>/dev/null || exit 0
trap 'rm -f "$LOCKFILE"' EXIT

. "$MODDIR/common.sh"
[ -z "$ABI" ] && exit 0
[ -x "$BIN" ] || exit 0

"$BIN" boot-init --stage=service \
    2>&1 | while IFS= read -r line; do echo "scalpel: $line" > /dev/kmsg; done

# Magisk lacks native boot-completed callback — poll and emulate
if [ -z "$KSU" ] && [ -z "$APATCH" ]; then
    (
        while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done
        sh "$MODDIR/boot-completed.sh"
    ) &
fi

wait
