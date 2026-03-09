#!/system/bin/sh
MODDIR="${0%/*}"

. "$MODDIR/common.sh"

_data="/data/adb/scalpel"

echo ""
echo "🔪 Scalpel — Reset to Clean Slate"
echo ""
echo "  ⚠️  This will restore ALL apps and wipe config."
echo ""
echo "  🔑 VOL UP = Confirm reset"
echo "  🔑 VOL DOWN = Abort"

_result=$(getevent -qlc 1 2>/dev/null)
case "$_result" in
    *KEY_VOLUMEUP*)
        echo ""
        echo "  ✅ Confirmed — resetting..."
        ;;
    *)
        echo ""
        echo "  ❌ Aborted."
        echo ""
        exit 0
        ;;
esac

_pid="$_data/monitor.pid"
if [ -f "$_pid" ]; then
    _mpid="$(cat "$_pid" 2>/dev/null)"
    [ -n "$_mpid" ] && kill "$_mpid" 2>/dev/null
    echo "  ⏹ Monitor stopped"
fi

if [ -n "$ABI" ] && [ -x "$BIN" ]; then
    echo "  🔄 Restoring debloated apps..."
    "$BIN" uninstall 2>/dev/null
    echo "  ✅ Debloated apps restored"
fi

echo ""
echo "  ✅ Debloat reverted. Systemize cleanup on next reboot."
echo "  🔁 Reboot now to complete reset."
echo ""
