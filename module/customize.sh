#!/system/bin/sh
SKIPUNZIP=1
MODPATH="${MODPATH:?MODPATH undefined}"
SCALPEL_DATA="/data/adb/scalpel"

sc_print() {
  local msg="$1"
  local delay="${2:-0.3}"
  local mode="$3"
  local width=$(( ${#msg} + 3 ))
  [ "$width" -gt 60 ] && width=60
  if [ "$mode" = "h" ]; then
    ui_print ""
    ui_print "$(printf '%*s' "$width" | tr ' ' '=')"
    ui_print " $msg"
    ui_print "$(printf '%*s' "$width" | tr ' ' '=')"
  else
    ui_print "$msg"
  fi
  sleep "$delay"
}

unzip -o "$ZIPFILE" -d "$MODPATH" >&2
rm -f "$MODPATH/disable"

for _mgr_bin in /data/adb/ksu/bin /data/adb/ap/bin /data/adb/magisk; do
    [ -d "$_mgr_bin" ] && export PATH="$_mgr_bin:$PATH"
done

SCALPEL_VER=$(grep '^version=' "$MODPATH/module.prop" | cut -d= -f2)

ui_print ""
ui_print "==========================================="
ui_print "  🔪 Scalpel ${SCALPEL_VER} 🔪"
ui_print "==========================================="
ui_print "  ⚕️  Precision system debloater"
ui_print "  ✅ KSU / APatch / Magisk"
ui_print "==========================================="
ui_print ""
sleep 0.5

sc_print "📱 Detecting Architecture" 0.3 "h"

. "$MODPATH/common.sh"
[ -z "$ABI" ] && abort "  ❌ Unsupported architecture: $(uname -m)"

sc_print "  ✅ Architecture: $ABI"

_bin="$MODPATH/bin/${ABI}/scalpel"
[ ! -f "$_bin" ] && abort "  ❌ Binary not found: bin/${ABI}/scalpel"

set_perm_recursive "$MODPATH/bin/${ABI}" 0 0 0755 0755

for d in "$MODPATH"/bin/*/; do
    [ "$d" = "$MODPATH/bin/${ABI}/" ] && continue
    rm -rf "$d"
done

ln -sf "${ABI}/scalpel" "$MODPATH/bin/scalpel"
sc_print "  ✅ Binary ready"

if [ -f "$MODPATH/bin/${ABI}/aapt" ]; then
    set_perm "$MODPATH/bin/${ABI}/aapt" 0 0 0755
    sc_print "  ✅ aapt available"
fi

sc_print "🔍 Debloat Mode Detection" 0.3 "h"

if [ -c /dev/zeromount ] || [ -e /dev/zeromount ]; then
    sc_print "  ✅ ZeroMount VFS driver detected"
elif command -v ksud >/dev/null 2>&1; then
    sc_print "  ✅ KSU overlay mount available"
else
    sc_print "  ⚠️ No VFS driver — will use pm disable fallback"
fi

sc_print "📁 Preparing Data" 0.3 "h"

FRESH_INSTALL=false
if [ ! -d "$SCALPEL_DATA" ]; then
    FRESH_INSTALL=true
fi

mkdir -p "$SCALPEL_DATA"
mkdir -p "$SCALPEL_DATA/logs"

if [ "$FRESH_INSTALL" = true ]; then
    sc_print "  🔧 Writing default config"
else
    sc_print "  ✅ Existing config preserved"
fi

# Preserve categories.json on upgrade — only copy if missing
if [ ! -f "$SCALPEL_DATA/categories.json" ] && [ -f "$MODPATH/data/categories.json" ]; then
    cp "$MODPATH/data/categories.json" "$SCALPEL_DATA/categories.json"
    sc_print "  ✅ Categories database installed"
else
    sc_print "  ✅ Categories database preserved"
fi

sc_print "⚡ Default Debloat" 0.3 "h"

sc_print "  🔑 VOL UP = Apply default debloat"
sc_print "  🔑 VOL DOWN / timeout = Skip"

_result=$(timeout 8 getevent -qlc 1 2>/dev/null)
case "$_result" in
    *KEY_VOLUMEUP*)
        _apply_default="true"
        sc_print "  ✅ Default debloat will apply on boot"
        ;;
    *)
        _apply_default="false"
        sc_print "  ⏭️ Skipped — configure via WebUI"
        ;;
esac

sc_print "🚀 Finalizing" 0.3 "h"

"$_bin" install \
    --modpath="$MODPATH" \
    --apply-default="$_apply_default" \
    2>&1 | while IFS= read -r line; do
        sc_print "  $line"
    done

echo "BOOTCOUNT=0" > "$SCALPEL_DATA/count.sh"
sc_print "  ✅ Boot counter reset"

set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm "$_bin" 0 0 0755
if [ -f "$MODPATH/bin/${ABI}/aapt" ]; then
    set_perm "$MODPATH/bin/${ABI}/aapt" 0 0 0755
fi
set_perm "$MODPATH/module.prop" 0 0 0644

ln -sf "$SCALPEL_DATA/icons" "$MODPATH/webroot/icons"

if command -v chcon >/dev/null 2>&1; then
    find "$MODPATH" -path "*/webroot" -prune -o \
        -exec chcon u:object_r:system_file:s0 {} + 2>/dev/null
    chcon -R u:object_r:adb_data_file:s0 "$SCALPEL_DATA" 2>/dev/null
fi

sc_print "  ✅ Permissions set"

ui_print ""
ui_print "==========================================="
ui_print "  ✨ Scalpel installed successfully ✨"
ui_print "==========================================="
ui_print ""
