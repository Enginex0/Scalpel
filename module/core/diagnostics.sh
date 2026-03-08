#!/system/bin/sh
# Full module diagnostic dump — called by WebUI verbose mode to catch silent failures

MODDIR="${MODDIR:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
SCALPEL_DATA="/data/adb/scalpel"

_section() { printf '\n━━━ %s ━━━\n' "$1"; }

diagnostics_dump() {
    local jq="${MODDIR}/bin/jq"
    [ ! -x "$jq" ] && jq=jq

    _section "SYSTEM"
    printf 'device: %s %s\n' "$(getprop ro.product.brand)" "$(getprop ro.product.model)"
    printf 'android: %s (SDK %s)\n' "$(getprop ro.build.version.release)" "$(getprop ro.build.version.sdk)"
    printf 'kernel: %s\n' "$(uname -r)"
    printf 'uptime: %s\n' "$(uptime 2>/dev/null | sed 's/.*up /up /' | sed 's/,.*load.*//')"
    printf 'selinux: %s\n' "$(getenforce 2>/dev/null || echo unknown)"

    _section "ROOT MANAGER"
    if [ -f /data/adb/ksud ]; then
        printf 'type: KernelSU\n'
        printf 'ksud: %s\n' "$(/data/adb/ksud -V 2>/dev/null || echo unknown)"
    elif [ -f /data/adb/magisk/magisk64 ]; then
        printf 'type: Magisk\n'
        printf 'version: %s\n' "$(magisk -V 2>/dev/null || echo unknown)"
    elif [ -d /data/adb/ap ]; then
        printf 'type: APatch\n'
    else
        printf 'type: unknown\n'
    fi

    _section "MODULE STATE"
    printf 'module_dir: %s\n' "$MODDIR"
    printf 'data_dir: %s\n' "$SCALPEL_DATA"
    printf 'module_enabled: %s\n' "$([ -f "${MODDIR}/disable" ] && echo false || echo true)"
    printf 'update_flag: %s\n' "$([ -f "${MODDIR}/update" ] && echo true || echo false)"
    ls -la "$MODDIR"/module.prop "$MODDIR"/post-fs-data.sh "$MODDIR"/service.sh 2>/dev/null

    _section "CONFIG"
    cat "${SCALPEL_DATA}/config.sh" 2>/dev/null || echo "(no config file)"

    _section "STATUS"
    "$jq" '.' "${SCALPEL_DATA}/status.json" 2>/dev/null || echo "(no status file)"

    _section "NUKE LIST"
    local nuke_count
    nuke_count=$("$jq" 'length' "${SCALPEL_DATA}/nuke_list.json" 2>/dev/null || echo 0)
    printf 'count: %s\n' "$nuke_count"
    "$jq" -r '.[] | "\(.package_name) -> \(.app_path)"' "${SCALPEL_DATA}/nuke_list.json" 2>/dev/null

    _section "SYSTEMIZE LIST"
    local sys_count
    sys_count=$("$jq" 'length' "${SCALPEL_DATA}/systemize_list.json" 2>/dev/null || echo 0)
    printf 'count: %s\n' "$sys_count"
    "$jq" -r '.[] | "\(.package_name) [\(.target // "priv-app")] needs_uninstall=\(.needs_uninstall // false)"' "${SCALPEL_DATA}/systemize_list.json" 2>/dev/null

    _section "WHITEOUTS"
    if [ -d "${MODDIR}/system" ]; then
        find "${MODDIR}/system" -maxdepth 4 -type c -o -type f 2>/dev/null | head -50
    else
        echo "(no module/system/ directory)"
    fi

    _section "ZEROMOUNT"
    local zm_bin=""
    for p in /data/adb/modules/zeromount/bin/zm /data/adb/ksu/bin/zm; do
        [ -x "$p" ] && { zm_bin="$p"; break; }
    done
    if [ -n "$zm_bin" ]; then
        printf 'binary: %s\n' "$zm_bin"
        printf 'rules:\n'
        "$zm_bin" list 2>/dev/null | head -100
    else
        echo "(zm binary not found)"
    fi

    _section "MONITOR"
    local pid_file="${SCALPEL_DATA}/monitor.pid"
    if [ -f "$pid_file" ]; then
        local pid
        pid=$(cat "$pid_file" 2>/dev/null)
        if kill -0 "$pid" 2>/dev/null; then
            printf 'status: running (pid %s)\n' "$pid"
        else
            printf 'status: dead (stale pid %s)\n' "$pid"
        fi
    else
        printf 'status: not started\n'
    fi

    _section "BOOT"
    cat "${SCALPEL_DATA}/count.sh" 2>/dev/null || echo "(no boot counter)"

    _section "KERNEL LOG (scalpel)"
    dmesg 2>/dev/null | grep -i scalpel | tail -30 || echo "(no kernel messages)"

    _section "KERNEL LOG (zeromount)"
    dmesg 2>/dev/null | grep -iE 'zeromount|zm_' | tail -30 || echo "(no zeromount messages)"

    _section "DEBUG LOG"
    if [ -f "${SCALPEL_DATA}/debug.log" ]; then
        local log_size
        log_size=$(wc -c < "${SCALPEL_DATA}/debug.log" 2>/dev/null)
        printf 'size: %s bytes\n' "${log_size:-0}"
        local archives=""
        for i in 1 2 3; do
            [ -f "${SCALPEL_DATA}/debug.log.$i" ] && archives="$archives $i"
        done
        [ -n "$archives" ] && printf 'archives:%s\n' "$archives"
        printf '\n'
        cat "${SCALPEL_DATA}/debug.log" 2>/dev/null
    else
        echo "(no debug log)"
    fi
}

# CLI entry point
case "${1:-dump}" in
    dump) diagnostics_dump ;;
    *) echo "usage: diagnostics.sh [dump]" ;;
esac
