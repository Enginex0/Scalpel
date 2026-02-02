#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Sourced at boot -- probe chain selects best debloat mode
# Order: zeromount > mountify > symlink > whiteout > magisk > pm

_DETECT_BUSYBOX=""
_DETECT_ROOT_MGR=""
_DETECT_OVERLAYFS=""

detect_root_manager() {
    local _tag="detect"
    [ -n "$_DETECT_ROOT_MGR" ] && { echo "$_DETECT_ROOT_MGR"; return 0; }
    if [ -n "$KSU" ]; then
        _DETECT_ROOT_MGR="ksu"
    elif [ -n "$APATCH" ]; then
        _DETECT_ROOT_MGR="apatch"
    else
        _DETECT_ROOT_MGR="magisk"
    fi
    log_d "$_tag" "root_manager=$_DETECT_ROOT_MGR"
    echo "$_DETECT_ROOT_MGR"
}

detect_busybox() {
    local _tag="detect"
    [ -n "$_DETECT_BUSYBOX" ] && { echo "$_DETECT_BUSYBOX"; return 0; }
    local bb=""
    if command -v busybox >/dev/null 2>&1; then
        bb=$(command -v busybox)
    else
        local p
        for p in /data/adb/magisk/busybox /data/adb/ksu/bin/busybox /data/adb/ap/bin/busybox; do
            [ -x "$p" ] && { bb="$p"; break; }
        done
    fi
    _DETECT_BUSYBOX="$bb"
    [ -n "$bb" ] && log_d "$_tag" "busybox=$bb" || log_w "$_tag" "busybox not found"
    echo "$bb"
}

detect_aapt() {
    local _tag="detect"
    local common_path="${MODDIR}/common/aapt"
    [ -x "$common_path" ] && { echo "$common_path"; return 0; }
    local abi
    abi=$(getprop ro.product.cpu.abi 2>/dev/null)
    case "$abi" in
        arm64*) abi="arm64-v8a" ;;
        armeabi*|arm*) abi="armeabi-v7a" ;;
        *) log_w "$_tag" "unsupported abi=$abi"; echo ""; return 1 ;;
    esac
    local path="${MODDIR}/bin/${abi}/aapt"
    [ -x "$path" ] && { echo "$path"; return 0; }
    log_w "$_tag" "aapt not found"
    echo ""
    return 1
}

_has_overlayfs() {
    if [ -z "$_DETECT_OVERLAYFS" ]; then
        grep -q "overlay" /proc/filesystems 2>/dev/null && _DETECT_OVERLAYFS="y" || _DETECT_OVERLAYFS="n"
        log_d "detect" "overlayfs=$_DETECT_OVERLAYFS"
    fi
    [ "$_DETECT_OVERLAYFS" = "y" ]
}

_find_tmpfs_dir() {
    local d
    for d in /mnt/vendor /mnt /dev; do
        [ -w "$d" ] && { echo "$d"; return 0; }
    done
    log_d "detect" "no writable tmpfs dir found"
    return 1
}

# Test mknod + setfattr on a writable dir (shared by mountify/whiteout probes)
_test_xattr() {
    local bb="$1" tf="$2"
    rm -f "$tf" 2>/dev/null
    "$bb" mknod "$tf" c 0 0 2>/dev/null || { rm -f "$tf" 2>/dev/null; return 1; }
    if "$bb" setfattr -n trusted.overlay.whiteout -v y "$tf" 2>/dev/null; then
        rm -f "$tf" 2>/dev/null
        return 0
    fi
    rm -f "$tf" 2>/dev/null
    return 1
}

_probe_zeromount() {
    [ -e "/dev/zeromount" ] || return 1
    command -v zm >/dev/null 2>&1 && return 0
    local p
    for p in /data/adb/modules/zeromount/bin/zm /data/adb/ksu/bin/zm /data/adb/magisk/zm /data/adb/ap/bin/zm; do
        [ -x "$p" ] && return 0
    done
    return 1
}

_probe_mountify() {
    # tmpfs mount over app dirs — needs busybox mount, not overlayfs
    local bb
    bb=$(detect_busybox)
    [ -z "$bb" ] && return 1
    local test_dir="/dev/.scalpel_mf_probe"
    mkdir -p "$test_dir" 2>/dev/null || return 1
    if ! "$bb" mount -t tmpfs -o size=0 tmpfs "$test_dir" 2>/dev/null; then
        rmdir "$test_dir" 2>/dev/null
        return 1
    fi
    "$bb" umount "$test_dir" 2>/dev/null
    rmdir "$test_dir" 2>/dev/null
    return 0
}

_probe_symlink() {
    _has_overlayfs
}

_probe_whiteout() {
    _has_overlayfs || return 1
    local bb
    bb=$(detect_busybox)
    [ -z "$bb" ] && return 1
    local tdir
    tdir=$(_find_tmpfs_dir) || return 1
    _test_xattr "$bb" "${tdir}/.scalpel_wo_test"
}

_probe_magisk() {
    local mgr
    mgr=$(detect_root_manager)
    case "$mgr" in
        magisk) return 0 ;;
        ksu)
            [ "$KSU_MAGIC_MOUNT" = "true" ] && return 0
            # KSU 22098+ defaults to magic mount when var is unset
            [ -n "$KSU_VER_CODE" ] && [ "$KSU_VER_CODE" -ge 22098 ] 2>/dev/null && return 0
            return 1
            ;;
        apatch)
            [ "$APATCH_BIND_MOUNT" = "true" ] && return 0
            return 1
            ;;
    esac
    return 1
}

# Skip early if PMS not initialized -- avoids wasting KSU's 10s post-fs-data budget
_probe_pm() {
    [ "$(getprop sys.boot_completed 2>/dev/null)" = "1" ] || return 1
    pm path android >/dev/null 2>&1
}

_validate_mode() {
    case "$1" in
        zeromount) _probe_zeromount ;;
        mountify)  _probe_mountify ;;
        symlink)   _probe_symlink ;;
        whiteout)  _probe_whiteout ;;
        magisk)    _probe_magisk ;;
        pm)        _probe_pm ;;
        *)         return 1 ;;
    esac
}

detect_mode() {
    local _tag="detect"
    local override="$SCALPEL_MODE_OVERRIDE"
    if [ -n "$override" ]; then
        if _validate_mode "$override"; then
            log_i "$_tag" "mode=$override (config override)"
            echo "$override"
            return 0
        fi
        log_w "$_tag" "override=$override unavailable, falling back to auto-detect"
    fi

    local mode
    for mode in zeromount mountify symlink whiteout magisk pm; do
        if "_probe_${mode}"; then
            log_i "$_tag" "mode=$mode (auto-detected)"
            echo "$mode"
            return 0
        fi
        log_d "$_tag" "probe $mode failed"
    done

    log_w "$_tag" "all probes failed, no mode available"
    echo ""
}
