#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Sourced by promote.sh -- generates privapp-permissions XML from APK manifest
# Android 9+ crashes priv-apps without explicit permission whitelisting

# Exports: generate_permissions, remove_permissions

generate_permissions() {
    local _tag="permissions"
    local pkg="$1"
    local apk_dir="$2"

    [ -z "$pkg" ] && { log_e "$_tag" "missing package name"; return 1; }
    [ -z "$apk_dir" ] && { log_e "$_tag" "missing APK directory"; return 1; }

    local target_dir="${MODDIR}/system/etc/permissions"
    mkdir -p "$target_dir" || { log_e "$_tag" "cannot create $target_dir"; return 1; }

    local xml_file="${target_dir}/privapp-permissions-${pkg}.xml"

    local base_apk=""
    base_apk=$(_find_base_apk "$apk_dir") || { log_e "$_tag" "no APK in $apk_dir"; return 1; }

    local perms=""
    perms=$(_extract_permissions "$base_apk" "$pkg")

    local perm_count=0
    [ -n "$perms" ] && perm_count=$(echo "$perms" | wc -l | tr -d '[:space:]')

    if [ "$perm_count" -eq 0 ]; then
        local enforce
        enforce="$(getprop ro.control_privapp_permissions 2>/dev/null)"
        if [ "$enforce" = "enforce" ]; then
            log_e "$_tag" "BLOCKED: zero permissions for $pkg (enforce mode) — empty XML would crash PMS"
            return 1
        fi
        log_w "$_tag" "zero permissions for $pkg (enforce=$enforce) — generating permissive XML"
    fi

    _write_xml "$pkg" "$perms" "$xml_file" || return 1

    chmod 0644 "$xml_file"
    chcon 'u:object_r:system_file:s0' "$xml_file" 2>/dev/null

    log_i "$_tag" "wrote $perm_count permissions to privapp-permissions-${pkg}.xml"
    return 0
}

remove_permissions() {
    local _tag="permissions"
    local pkg="$1"
    [ -z "$pkg" ] && return 1

    local xml_file="${MODDIR}/system/etc/permissions/privapp-permissions-${pkg}.xml"
    if [ -f "$xml_file" ]; then
        rm -f "$xml_file" 2>/dev/null
        log_i "$_tag" "removed privapp-permissions-${pkg}.xml"
    fi
    return 0
}

_find_base_apk() {
    local dir="$1"

    # Split APK layouts use base.apk
    [ -f "${dir}/base.apk" ] && { echo "${dir}/base.apk"; return 0; }

    # Single-APK layouts: first .apk found
    local f
    for f in "$dir"/*.apk; do
        [ -f "$f" ] && { echo "$f"; return 0; }
    done

    return 1
}

_extract_permissions() {
    local _tag="permissions"
    local apk="$1"
    local pkg="$2"
    local aapt_bin=""

    # Self-source detect.sh if not already loaded (WebUI invokes promote.sh directly)
    if ! type detect_aapt >/dev/null 2>&1; then
        [ -f "${MODDIR}/core/detect.sh" ] && . "${MODDIR}/core/detect.sh"
    fi
    if type detect_aapt >/dev/null 2>&1; then
        aapt_bin=$(detect_aapt)
    fi

    if [ -n "$aapt_bin" ] && [ -x "$aapt_bin" ]; then
        # aapt d permissions outputs: "uses-permission: name='android.permission.FOO'"
        local raw
        raw=$("$aapt_bin" dump permissions "$apk" 2>/dev/null)
        if [ -n "$raw" ]; then
            echo "$raw" | grep "uses-permission:" | sed "s/.*name='\([^']*\)'.*/\1/" | sort -u
            return 0
        fi
        log_w "$_tag" "aapt returned empty output for $apk"
    fi

    # Fallback: parse "requested permissions:" section from dumpsys (all namespaces)
    local dump_perms
    dump_perms=$(dumpsys package "$pkg" 2>/dev/null \
        | sed -n '/requested permissions:/,/^[^ ]/p' \
        | grep '^\s' \
        | sed 's/^[[:space:]]*//' \
        | grep -v '^$' \
        | sort -u)

    if [ -n "$dump_perms" ]; then
        log_i "$_tag" "used dumpsys fallback for $pkg permissions"
        echo "$dump_perms"
        return 0
    fi

    log_w "$_tag" "no aapt and dumpsys returned nothing for $pkg"
    return 0
}

_write_xml() {
    local pkg="$1"
    local perms="$2"
    local xml_file="$3"

    case "$pkg" in *[!a-zA-Z0-9._]*) log_e "$_tag" "invalid package name: $pkg"; return 1 ;; esac

    # Atomic write via tmp+mv prevents partial XML on crash/reboot
    local tmp="${xml_file}.tmp.$$"

    {
        echo '<?xml version="1.0" encoding="utf-8"?>'
        echo '<permissions>'
        echo "    <privapp-permissions package=\"${pkg}\">"

        if [ -n "$perms" ]; then
            echo "$perms" | while IFS= read -r perm; do
                [ -z "$perm" ] && continue
                echo "        <permission name=\"${perm}\"/>"
            done
        fi

        echo '    </privapp-permissions>'
        echo '</permissions>'
    } > "$tmp"

    mv "$tmp" "$xml_file" 2>/dev/null || {
        log_e "$_tag" "failed to write $xml_file"
        rm -f "$tmp"
        return 1
    }
}
