#!/system/bin/sh
MODDIR="${0%/*}"

. "$MODDIR/common.sh"

_data="/data/adb/scalpel"

echo ""
echo "🔪 Scalpel — Reset to Clean Slate"
echo ""

_pid="$_data/monitor.pid"
if [ -f "$_pid" ]; then
    _mpid="$(cat "$_pid" 2>/dev/null)"
    [ -n "$_mpid" ] && kill "$_mpid" 2>/dev/null
    echo "  ⏹ Monitor stopped"
fi

rm -rf "$MODDIR/system"
rm -f "$MODDIR/skip_mount" "$MODDIR/skip_mountify"
echo "  🧹 Overlay cleared"

rm -rf "$_data"
echo "  🗑️ Data wiped"

echo ""
echo "  ✅ All config, debloat, and systemize state cleared."
echo "  🔁 Reboot to apply."
echo ""
