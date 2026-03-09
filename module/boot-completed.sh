#!/system/bin/sh
MODDIR="${0%/*}"
[ -f "$MODDIR/disable" ] && exit 0

. "$MODDIR/common.sh"
[ -z "$ABI" ] && exit 0
[ -x "$BIN" ] || exit 0

"$BIN" boot-init --stage=boot-completed \
    2>&1 | while IFS= read -r line; do echo "scalpel: $line" > /dev/kmsg; done

"$BIN" webui-init > /data/adb/scalpel/webui_init_cache.json 2>/dev/null
