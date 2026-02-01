#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Mode: tmpfs overlay — mount empty tmpfs over app directories to hide them

SCALPEL_DATA="${SCALPEL_DATA:-/data/adb/scalpel}"
SCALPEL_NUKE_LIST="${SCALPEL_DATA}/nuke_list.json"
_MF_TRACKING="${SCALPEL_DATA}/mountify_mounts.txt"

# tmpfs doesn't survive reboot — tracking file only needs to be valid within a boot cycle
_mf_ensure_tracking() {
    [ -f "$_MF_TRACKING" ] && return 0
    mkdir -p "$SCALPEL_DATA" 2>/dev/null
    : > "$_MF_TRACKING" 2>/dev/null
}

mode_probe() {
    # Stale tracking from previous boot is meaningless -- tmpfs mounts don't survive reboot
    rm -f "$_MF_TRACKING" 2>/dev/null

    local test_dir="/dev/.scalpel_mf_probe_$$"
    mkdir -p "$test_dir" 2>/dev/null || return 1

    if ! busybox mount -t tmpfs -o size=0 tmpfs "$test_dir" 2>/dev/null; then
        rmdir "$test_dir" 2>/dev/null
        return 1
    fi

    busybox umount "$test_dir" 2>/dev/null
    rmdir "$test_dir" 2>/dev/null
    return 0
}

mode_debloat() {
    local _tag="mountify"
    local pkg="$1" app_path="$2"
    [ -z "$pkg" ] || [ -z "$app_path" ] && { log_e "$_tag" "debloat: missing args"; return 1; }

    local app_dir
    app_dir=$(dirname "$app_path")

    [ ! -d "$app_dir" ] && { log_e "$_tag" "$app_dir does not exist"; return 1; }

    # Already mounted — idempotent
    if busybox mount | grep -qF " on ${app_dir} type tmpfs"; then
        log_d "$_tag" "$pkg already mounted"
        return 0
    fi

    # Inherit SELinux context from original directory so PMS doesn't choke
    local ctx=""
    ctx=$(ls -Zd "$app_dir" 2>/dev/null | awk '{print $1}')

    local mount_opts="size=0,mode=755"
    [ -n "$ctx" ] && [ "$ctx" != "?" ] && mount_opts="${mount_opts},context=${ctx}"

    if ! busybox mount -t tmpfs -o "$mount_opts" tmpfs "$app_dir"; then
        log_e "$_tag" "mount failed for $pkg ($app_dir)"
        return 1
    fi

    _mf_ensure_tracking
    # Dedup before appending
    grep -qxF "$app_dir" "$_MF_TRACKING" 2>/dev/null || echo "$app_dir" >> "$_MF_TRACKING"

    log_i "$_tag" "hidden $pkg ($app_dir)"
    return 0
}

mode_restore() {
    local _tag="mountify"
    local pkg="$1" app_path="$2"
    [ -z "$pkg" ] || [ -z "$app_path" ] && { log_e "$_tag" "restore: missing args"; return 1; }

    local app_dir
    app_dir=$(dirname "$app_path")

    if busybox umount "$app_dir" 2>/dev/null; then
        log_i "$_tag" "restored $pkg ($app_dir)"
    else
        log_w "$_tag" "umount failed for $pkg ($app_dir) — may not be mounted"
    fi

    # Remove from tracking regardless (cleanup stale entries)
    if [ -f "$_MF_TRACKING" ]; then
        local tmp="${_MF_TRACKING}.tmp.$$"
        grep -vxF "$app_dir" "$_MF_TRACKING" > "$tmp" 2>/dev/null
        mv "$tmp" "$_MF_TRACKING" 2>/dev/null || rm -f "$tmp"
    fi

    # PMS re-discovery after unmount exposes original files
    pm install-existing "$pkg" 2>/dev/null

    return 0
}

mode_verify() {
    local pkg="$1" app_path="$2"
    [ -z "$app_path" ] && return 1

    local app_dir
    app_dir=$(dirname "$app_path")

    # Mount presence alone confirms debloat -- PMS may create transient files inside the tmpfs
    busybox mount | grep -qF " on ${app_dir} type tmpfs"
}

mode_cleanup() {
    local _tag="mountify"
    local jq_bin="${MODDIR:-/data/adb/modules/scalpel}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    local failed=0

    # Phase 1: unmount everything in the nuke list (authoritative source)
    if [ -f "$SCALPEL_NUKE_LIST" ]; then
        local tmp="/data/local/tmp/.scalpel_mf_cleanup_$$"
        "$jq_bin" -r '.[] | "\(.package_name)\t\(.app_path)"' "$SCALPEL_NUKE_LIST" > "$tmp" 2>/dev/null
        if [ -s "$tmp" ]; then
            while IFS='	' read -r pkg app_path; do
                [ -z "$pkg" ] && continue
                mode_restore "$pkg" "$app_path" || failed=1
            done < "$tmp"
        fi
        rm -f "$tmp" 2>/dev/null
    fi

    # Phase 2: sweep any orphaned mounts from tracking file
    if [ -f "$_MF_TRACKING" ]; then
        while IFS= read -r app_dir; do
            [ -z "$app_dir" ] && continue
            busybox mount | grep -qF " on ${app_dir} type tmpfs" || continue
            busybox umount "$app_dir" 2>/dev/null || {
                log_w "$_tag" "orphan unmount failed: $app_dir"
                failed=1
            }
        done < "$_MF_TRACKING"
        rm -f "$_MF_TRACKING" 2>/dev/null
    fi

    log_i "$_tag" "cleanup complete (failed=$failed)"
    return "$failed"
}
