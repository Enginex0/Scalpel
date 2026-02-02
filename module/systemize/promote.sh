#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090,SC2016
# Clinical systemization — copy APK, set perms, defer pm uninstall to post-boot after overlay verified

MODDIR="${MODDIR:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
SCALPEL_DATA="/data/adb/scalpel"
SYSTEMIZE_LIST="${SCALPEL_DATA}/systemize_list.json"

_jq() {
    local jq_bin="${MODDIR}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"
    "$jq_bin" "$@"
}

_ensure_logging() {
    if [ -z "$SCALPEL_LOG_INITIALIZED" ] || [ "$SCALPEL_LOG_INITIALIZED" != "1" ]; then
        . "${MODDIR}/core/logging.sh"
        log_init 2>/dev/null
    fi
}

promote_app() {
    local _tag="promote"
    local pkg="$1"
    local target="${2:-priv-app}"
    local app_label="$3"
    [ -z "$pkg" ] && { log_e "$_tag" "missing package name"; return 1; }

    case "$target" in
        app|priv-app) ;;
        *) log_e "$_tag" "invalid target: $target (must be 'app' or 'priv-app')"; return 1 ;;
    esac

    _ensure_logging

    # 1: Validate — installed, user-app, not already system
    local app_info
    app_info="$(pm path "$pkg" 2>/dev/null)"
    [ -z "$app_info" ] && { log_e "$_tag" "package not found: $pkg"; return 1; }

    if pm list packages -s 2>/dev/null | grep -qF "package:${pkg}"; then
        log_w "$_tag" "already a system app: $pkg"
        return 0
    fi

    # 2: Discover APK path(s) — split APKs live alongside base.apk
    local first_path app_dir
    first_path="$(echo "$app_info" | head -1 | sed 's/^package://')"
    app_dir="$(dirname "$first_path")"
    [ ! -d "$app_dir" ] && { log_e "$_tag" "app dir missing: $app_dir"; return 1; }

    # Only user-installed apps (/data/app/) can be promoted — preloaded apps on
    # read-only partitions (/cust, /product, /vendor) create duplicate packages in PMS
    case "$first_path" in
        /data/app/*) ;;
        *) log_e "$_tag" "not a user app: $pkg ($first_path)"; return 1 ;;
    esac

    # Directory name must be a valid filesystem path (no spaces/special chars)
    local app_name
    app_name="$(basename "$app_dir" | sed 's/-[a-zA-Z0-9_]*$//')"
    [ -z "$app_name" ] || [ "$app_name" = "." ] && app_name="${pkg##*.}"

    # Human-readable label for JSON record (WebUI display)
    local display_name
    if [ -n "$app_label" ]; then
        display_name="$app_label"
    else
        display_name="$app_name"
    fi

    # 3: Create target in module overlay
    local target_dir="${MODDIR}/system/${target}/${app_name}"
    mkdir -p "$target_dir" || { log_e "$_tag" "cannot create: $target_dir"; return 1; }

    # 4: Copy ALL APKs (base + config splits)
    local copied=0
    for apk in "$app_dir"/*.apk; do
        [ -f "$apk" ] || continue
        cp "$apk" "$target_dir/" || { log_e "$_tag" "copy failed: $apk"; rm -rf "$target_dir"; return 1; }
        copied=$((copied + 1))
    done
    [ "$copied" -eq 0 ] && { log_e "$_tag" "no APKs in: $app_dir"; rm -rf "$target_dir"; return 1; }

    # Native libs needed for JNI apps
    [ -d "${app_dir}/lib" ] && cp -r "${app_dir}/lib" "$target_dir/" 2>/dev/null

    # 5: Permissions — dirs 0755, files 0644
    chmod 0755 "$target_dir"
    for f in "$target_dir"/*.apk; do
        [ -f "$f" ] && chmod 0644 "$f"
    done
    [ -d "${target_dir}/lib" ] && chmod -R 0755 "${target_dir}/lib" 2>/dev/null

    # 6: SELinux context
    chcon -R 'u:object_r:system_file:s0' "$target_dir" 2>/dev/null

    # 7: Priv-app permissions XML -- only needed for priv-app (Android 9+ requirement)
    if [ "$target" = "priv-app" ]; then
        local perm_script="${MODDIR}/systemize/permissions.sh"
        if [ -f "$perm_script" ]; then
            . "$perm_script"
            if type generate_permissions >/dev/null 2>&1; then
                generate_permissions "$pkg" "$target_dir" || log_w "$_tag" "permissions XML failed for $pkg"
            fi
        fi
    fi

    # 8: Record operation — pm uninstall deferred to post_boot after overlay is verified
    _record_promotion "$pkg" "$display_name" "$first_path" "$target_dir" "$target"

    log_i "$_tag" "promoted: $pkg ($copied APKs) -> $target_dir"
    return 0
}

_record_promotion() {
    local _tag="promote"
    local pkg="$1" app_name="$2" orig_path="$3" target_dir="$4" target="$5"
    local iso_date
    iso_date="$(date '+%Y-%m-%d' 2>/dev/null || echo 'unknown')"

    local sys_path
    sys_path="${target_dir}/$(basename "$orig_path")"
    local tmp="${SYSTEMIZE_LIST}.tmp.$$"

    if [ -f "$SYSTEMIZE_LIST" ]; then
        _jq --arg pkg "$pkg" --arg name "$app_name" \
            --arg orig "$orig_path" --arg sys "$sys_path" \
            --arg date "$iso_date" --arg tgt "$target" \
            '[.[] | select(.package_name != $pkg)] + [{"app_name":$name,"package_name":$pkg,"original_path":$orig,"system_path":$sys,"promoted_date":$date,"target":$tgt,"needs_uninstall":true}]' \
            "$SYSTEMIZE_LIST" > "$tmp" 2>/dev/null
    else
        mkdir -p "$SCALPEL_DATA" 2>/dev/null
        _jq -n --arg pkg "$pkg" --arg name "$app_name" \
            --arg orig "$orig_path" --arg sys "$sys_path" \
            --arg date "$iso_date" --arg tgt "$target" \
            '[{"app_name":$name,"package_name":$pkg,"original_path":$orig,"system_path":$sys,"promoted_date":$date,"target":$tgt,"needs_uninstall":true}]' \
            > "$tmp" 2>/dev/null
    fi

    mv "$tmp" "$SYSTEMIZE_LIST" 2>/dev/null || {
        log_w "$_tag" "failed to record promotion for $pkg"
        rm -f "$tmp"
    }
}

demote_app() {
    local _tag="promote"
    local pkg="$1"
    [ -z "$pkg" ] && { log_e "$_tag" "demote: missing package name"; return 1; }
    _ensure_logging
    [ ! -f "$SYSTEMIZE_LIST" ] && { log_e "$_tag" "no systemize list found"; return 1; }

    local entry_json
    entry_json="$(_jq -r --arg pkg "$pkg" \
        '.[] | select(.package_name==$pkg)' "$SYSTEMIZE_LIST" 2>/dev/null)"
    [ -z "$entry_json" ] && { log_e "$_tag" "not in systemize list: $pkg"; return 1; }

    local sys_path target
    sys_path="$(echo "$entry_json" | _jq -r '.system_path // ""' 2>/dev/null)"
    target="$(echo "$entry_json" | _jq -r '.target // "priv-app"' 2>/dev/null)"

    local sys_dir
    sys_dir="$(dirname "$sys_path")"
    [ -d "$sys_dir" ] && rm -rf "$sys_dir"

    # Only priv-app promotions have permissions XML
    if [ "$target" = "priv-app" ]; then
        rm -f "${MODDIR}/system/etc/permissions/privapp-permissions-${pkg}.xml" 2>/dev/null
    fi

    local tmp="${SYSTEMIZE_LIST}.tmp.$$"
    _jq --arg pkg "$pkg" '[.[] | select(.package_name != $pkg)]' \
        "$SYSTEMIZE_LIST" > "$tmp" 2>/dev/null
    mv "$tmp" "$SYSTEMIZE_LIST" 2>/dev/null || rm -f "$tmp"
    pm install-existing "$pkg" 2>/dev/null

    log_i "$_tag" "demoted: $pkg"
    return 0
}

is_promoted() {
    local pkg="$1"
    [ -z "$pkg" ] && return 1
    [ ! -f "$SYSTEMIZE_LIST" ] && return 1
    _jq -e --arg pkg "$pkg" '.[] | select(.package_name==$pkg)' \
        "$SYSTEMIZE_LIST" >/dev/null 2>&1
}

list_promoted() {
    [ ! -f "$SYSTEMIZE_LIST" ] && { echo "[]"; return 0; }
    _jq '.' "$SYSTEMIZE_LIST" 2>/dev/null || echo "[]"
}

verify_promotion() {
    local pkg="$1"
    [ -z "$pkg" ] && return 1
    local dump
    dump="$(dumpsys package "$pkg" 2>/dev/null)"
    [ -z "$dump" ] && return 1
    # FLAG_SYSTEM + sourceDir must both point to /system
    echo "$dump" | grep -q 'SYSTEM' || return 1
    local source_dir
    source_dir="$(echo "$dump" | grep 'sourceDir=' | head -1 | sed 's/.*sourceDir=//')"
    case "$source_dir" in /system/*) return 0 ;; *) return 1 ;; esac
}

# Only execute when run directly
case "${0##*/}" in
    promote.sh)
        . "${MODDIR}/core/logging.sh"
        log_init 2>/dev/null
        case "$1" in
            promote) shift; promote_app "$@" ;;
            demote)  shift; demote_app "$@" ;;
            verify)  shift; verify_promotion "$@" ;;
            list)    list_promoted ;;
            *)       log_e "promote" "usage: promote.sh {promote|demote|verify|list} [pkg]"; exit 1 ;;
        esac
        ;;
esac
