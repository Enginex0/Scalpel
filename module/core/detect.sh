#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Sourced at boot -- device capability detection (busybox, aapt, whiteout support)

_DETECT_BUSYBOX=""
_DETECT_ROOT_MGR=""

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

# Identify active metamodule via /data/adb/metamodule symlink (KSU convention)
# Falls back to scanning module dirs for metamodule=1 in module.prop
detect_metamodule() {
    local _tag="detect"

    # KSU symlink is canonical — resolves to active metamodule directory
    if [ -L "/data/adb/metamodule" ]; then
        local target
        target="$(readlink -f /data/adb/metamodule 2>/dev/null)"
        if [ -n "$target" ] && [ -f "${target}/module.prop" ]; then
            local mm_id mm_name
            mm_id="$(sed -n 's/^id=//p' "${target}/module.prop" 2>/dev/null)"
            mm_name="$(sed -n 's/^name=//p' "${target}/module.prop" 2>/dev/null)"
            log_d "$_tag" "metamodule=${mm_id} (${mm_name})"
            echo "${mm_id}|${mm_name}"
            return 0
        fi
    fi

    # Fallback: scan /data/adb/modules/meta-* for metamodule=1
    local d
    for d in /data/adb/modules/meta-*; do
        [ -f "${d}/module.prop" ] || continue
        if grep -q "^metamodule=1\|^metamodule=true" "${d}/module.prop" 2>/dev/null; then
            local mm_id mm_name
            mm_id="$(sed -n 's/^id=//p' "${d}/module.prop" 2>/dev/null)"
            mm_name="$(sed -n 's/^name=//p' "${d}/module.prop" 2>/dev/null)"
            log_d "$_tag" "metamodule=${mm_id} (${mm_name}) via scan"
            echo "${mm_id}|${mm_name}"
            return 0
        fi
    done

    # Magisk/APatch handle mounting natively — no separate metamodule
    local mgr
    mgr="$(detect_root_manager)"
    case "$mgr" in
        magisk)  echo "magisk|Magisk"; return 0 ;;
        apatch)  echo "apatch|APatch"; return 0 ;;
    esac

    log_w "$_tag" "no metamodule detected"
    echo "|none"
    return 1
}

# Can we create overlayfs char device whiteouts in the module directory?
can_create_whiteouts() {
    local probe_dir="${MODDIR}/.whiteout_probe"
    mkdir -p "$probe_dir" 2>/dev/null || return 1
    local probe_file="${probe_dir}/test_wo"
    rm -f "$probe_file" 2>/dev/null

    if busybox mknod "$probe_file" c 0 0 2>/dev/null || \
       mknod "$probe_file" c 0 0 2>/dev/null; then
        rm -f "$probe_file" 2>/dev/null
        rmdir "$probe_dir" 2>/dev/null
        return 0
    fi

    rmdir "$probe_dir" 2>/dev/null
    return 1
}
