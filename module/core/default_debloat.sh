#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Sourced by customize.sh -- generates nuke_list.json from safe+google categories

apply_default_debloat() {
    local _tag="default_debloat"
    local modpath="$1"
    [ -z "$modpath" ] && return 1

    local jq_bin="${modpath}/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"

    local categories="${modpath}/data/categories.json"
    [ ! -f "$categories" ] && categories="${SCALPEL_DATA:-/data/adb/scalpel}/categories.json"
    local app_list="${SCALPEL_DATA:-/data/adb/scalpel}/app_list.json"
    local nuke_list="${SCALPEL_DATA:-/data/adb/scalpel}/nuke_list.json"

    [ ! -f "$categories" ] && { log_e "$_tag" "categories.json not found"; return 1; }

    local tmp="${nuke_list}.tmp.$$"

    if [ -f "$app_list" ]; then
        # Intersect safe+google packages from categories with actually-installed apps
        "$jq_bin" -n \
            --slurpfile cats "$categories" \
            --slurpfile apps "$app_list" \
            '[ $cats[0].apps | to_entries[]
               | select(.value == "safe" or .value == "google")
               | .key as $pkg
               | ($apps[0][] | select(.package_name == $pkg)) as $inst
               | if $inst then {
                   "app_name": $inst.app_name,
                   "package_name": $pkg,
                   "app_path": $inst.app_path
                 } else empty end
             ]' \
            > "$tmp" 2>/dev/null
    else
        # No scanner output -- resolve paths via pm, collect one JSON object per line
        local pkgs entries="${tmp}.entries"
        pkgs=$("$jq_bin" -r '.apps | to_entries[] | select(.value == "safe" or .value == "google") | .key' "$categories" 2>/dev/null)
        [ -z "$pkgs" ] && { log_w "$_tag" "no safe/google packages in categories"; return 0; }

        : > "$entries"
        echo "$pkgs" | while IFS= read -r pkg; do
            [ -z "$pkg" ] && continue
            local path
            path=$(pm path "$pkg" 2>/dev/null | head -1 | sed 's/^package://')
            [ -z "$path" ] && continue
            "$jq_bin" -n --arg p "$pkg" --arg a "$path" \
                '{"app_name":$p,"package_name":$p,"app_path":$a}' >> "$entries"
        done

        "$jq_bin" -s '.' "$entries" > "$tmp" 2>/dev/null
        rm -f "$entries"
    fi

    if [ ! -s "$tmp" ] || ! "$jq_bin" '.' "$tmp" >/dev/null 2>&1; then
        log_e "$_tag" "failed to generate default nuke list"
        rm -f "$tmp"
        return 1
    fi

    local count
    count=$("$jq_bin" 'length' "$tmp" 2>/dev/null | tr -d '[:space:]')

    if [ "${count:-0}" = "0" ]; then
        log_i "$_tag" "no default debloat apps found on device"
        rm -f "$tmp"
        return 0
    fi

    mv "$tmp" "$nuke_list" 2>/dev/null || {
        log_w "$_tag" "failed to write nuke list"
        rm -f "$tmp"
        return 1
    }

    log_i "$_tag" "default debloat: ${count} apps"
    return 0
}
