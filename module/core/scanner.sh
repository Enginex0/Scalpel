#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Runs once at install -- scan all partitions, extract app metadata, write app_list.json

SCALPEL_DIR="/data/adb/scalpel"
APP_LIST="$SCALPEL_DIR/app_list.json"
ICON_DIR="$SCALPEL_DIR/icons"
CATEGORIES="$SCALPEL_DIR/categories.json"

[ -z "$MODDIR" ] && MODDIR="${0%/*}/.."
CATEGORIES_FALLBACK="$MODDIR/webroot/categories.json"

_scan_partitions() {
    local parts=""
    while IFS=' ' read -r _ mp _ _ _ _; do
        case "$mp" in
            /system|/vendor|/product|/system_ext|/odm|/oem|/mi_ext|/my_*) ;;
            *) continue ;;
        esac
        [ -d "$mp" ] && parts="$parts $mp"
    done < /proc/mounts

    # Symlinked sub-partitions under /system
    local d
    for d in /system/vendor /system/product /system/system_ext /system/odm /system/oem; do
        [ -d "$d" ] || continue
        local base="/${d#/system/}"
        case "$parts" in *"$base"*) continue ;; esac
        parts="$parts $d"
    done

    case "$parts" in *"/system"*) ;; *) [ -d "/system" ] && parts="/system $parts" ;; esac
    echo "$parts"
}

_partition_name() {
    case "$1" in
        /system/vendor|/vendor)         echo "vendor" ;;
        /system/product|/product)       echo "product" ;;
        /system/system_ext|/system_ext) echo "system_ext" ;;
        /system/odm|/odm)              echo "odm" ;;
        /system/oem|/oem)              echo "oem" ;;
        /system)                        echo "system" ;;
        *)                              echo "${1#/}" ;;
    esac
}

_is_split_apk() {
    local count=0
    for f in "$1"/*.apk; do
        [ -f "$f" ] || continue
        count=$((count + 1))
        [ "$count" -ge 2 ] && return 0
    done
    return 1
}

_get_category() {
    [ -z "$2" ] && { echo "unknown"; return; }
    local r
    r=$(jq -r --arg p "$1" '.apps[$p] // "unknown"' "$2" 2>/dev/null)
    echo "${r:-unknown}"
}

_get_app_name() {
    local apk="$1" aapt="$2" fallback="$3"
    if [ -n "$aapt" ]; then
        local n
        n=$("$aapt" dump badging "$apk" 2>/dev/null | \
            sed -n "s/^application-label:'\(.*\)'/\1/p" | head -1)
        [ -n "$n" ] && { echo "$n"; return; }
    fi
    echo "$fallback"
}

_extract_icon() {
    local out="$ICON_DIR/${2}.png"
    [ -f "$out" ] && return 0
    [ -z "$3" ] && return 0
    local ip
    ip=$("$3" dump badging "$1" 2>/dev/null | \
        sed -n "s/.*icon='\([^']*\)'.*/\1/p" | head -1)
    [ -z "$ip" ] && return 0
    unzip -p "$1" "$ip" > "$out" 2>/dev/null || rm -f "$out" 2>/dev/null
}

scanner_run() {
    local _tag="scanner"
    log_i "$_tag" "scan started"
    local t0
    t0=$(date +%s 2>/dev/null)
    mkdir -p "$SCALPEL_DIR" "$ICON_DIR" 2>/dev/null

    local aapt=""
    command -v detect_aapt >/dev/null 2>&1 && aapt=$(detect_aapt)

    local cats=""
    [ -f "$CATEGORIES" ] && cats="$CATEGORIES"
    [ -z "$cats" ] && [ -f "$CATEGORIES_FALLBACK" ] && cats="$CATEGORIES_FALLBACK"

    # PMS can be sluggish during install if device is under load
    local pm_cache="" _pm_try=0
    while [ "$_pm_try" -lt 3 ]; do
        pm_cache=$(pm list packages -f -s 2>/dev/null)
        [ -n "$pm_cache" ] && break
        _pm_try=$((_pm_try + 1))
        log_w "$_tag" "pm list packages empty (attempt $_pm_try/3)"
        sleep 1
    done
    if [ -z "$pm_cache" ]; then
        log_e "$_tag" "pm list packages failed after 3 attempts"
        return 1
    fi

    local partitions
    partitions=$(_scan_partitions)
    log_d "$_tag" "partitions:$partitions"

    # Collect newline-delimited JSON objects, assemble array in one jq call at the end
    local entries="$APP_LIST.entries"
    : > "$entries"
    local scanned=0 failed=0

    for part in $partitions; do
        for sub in app priv-app; do
            [ -d "$part/$sub" ] || continue
            for app_dir in "$part/$sub"/*/; do
                [ -d "$app_dir" ] || continue

                local apk=""
                if [ -f "${app_dir}base.apk" ]; then
                    apk="${app_dir}base.apk"
                else
                    for c in "$app_dir"*.apk; do [ -f "$c" ] && { apk="$c"; break; }; done
                fi
                [ -z "$apk" ] && continue

                local dname="${app_dir%/}"; dname="${dname##*/}"

                # Fast: resolve package name from cached pm output
                local pkg=""
                pkg=$(echo "$pm_cache" | grep -F "$app_dir" | sed 's/^package://;s/.*=//' | head -1)
                [ -z "$pkg" ] && [ -n "$aapt" ] && \
                    pkg=$("$aapt" dump badging "$apk" 2>/dev/null | \
                        sed -n "s/^package: name='\([^']*\)'.*/\1/p" | head -1)
                if [ -z "$pkg" ]; then
                    log_w "$_tag" "skipped $apk (no package name)"
                    failed=$((failed + 1)); continue
                fi

                local aname; aname=$(_get_app_name "$apk" "$aapt" "$dname")
                local pname; pname=$(_partition_name "$part")
                local cat;   cat=$(_get_category "$pkg" "$cats")
                local priv=false; [ "$sub" = "priv-app" ] && priv=true
                local split=false; _is_split_apk "$app_dir" && split=true

                # Write one JSON object per line (assembled later)
                printf '%s\n' "$(jq -n --arg pn "$pkg" --arg an "$aname" --arg ap "$apk" \
                    --arg pt "$pname" --arg ct "$cat" --argjson ip "$priv" --argjson is "$split" \
                    '{"package_name":$pn,"app_name":$an,"app_path":$ap,"partition":$pt,"category":$ct,"is_priv_app":$ip,"is_split":$is}')" \
                    >> "$entries"

                _extract_icon "$apk" "$pkg" "$aapt" &
                scanned=$((scanned + 1))
                # Drain background icon extractions every 20 apps to avoid OOM
                [ $((scanned % 20)) -eq 0 ] && wait
            done
        done
    done
    wait

    # Single jq call: slurp all objects into an array, atomic write
    jq -s '.' "$entries" > "$APP_LIST.tmp" 2>/dev/null && mv "$APP_LIST.tmp" "$APP_LIST"
    rm -f "$entries" "$APP_LIST.tmp" 2>/dev/null

    local elapsed=$(( $(date +%s 2>/dev/null) - t0 ))
    log_i "$_tag" "scan complete: $scanned apps, $failed skipped, ${elapsed}s"
    return 0
}

scanner_refresh() {
    local _tag="scanner"
    log_i "$_tag" "refresh requested"
    scanner_run
}

# Direct invocation from WebUI bridge or customize.sh
case "${1:-}" in
    refresh) scanner_refresh ;;
    run)     scanner_run ;;
esac
