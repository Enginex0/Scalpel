#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Runs once at install -- scan all partitions, extract app metadata, write app_list.json

SCALPEL_DIR="/data/adb/scalpel"
APP_LIST="$SCALPEL_DIR/app_list.json"
ICON_DIR="$SCALPEL_DIR/icons"
CATEGORIES="$SCALPEL_DIR/categories.json"

[ -z "$MODDIR" ] && MODDIR="${0%/*}/.."
CATEGORIES_FALLBACK="$MODDIR/data/categories.json"

# Use module's jq binary
_jq() {
    local jq_bin="$MODDIR/bin/jq"
    [ ! -x "$jq_bin" ] && jq_bin="jq"
    "$jq_bin" "$@"
}

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
    r=$(_jq -r --arg p "$1" '.apps[$p] // "unknown"' "$2" 2>/dev/null)
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
    case "$2" in */* | *..* | "" ) return 1 ;; esac
    local out="$ICON_DIR/${2}.png"
    [ -f "$out" ] && return 0
    [ -z "$3" ] && return 0
    local ip
    ip=$("$3" dump badging "$1" 2>/dev/null | \
        sed -n "s/.*icon='\([^']*\)'.*/\1/p" | head -1)
    [ -z "$ip" ] && return 0
    case "$ip" in *.xml) return 0 ;; esac
    unzip -p "$1" "$ip" > "$out" 2>/dev/null || rm -f "$out" 2>/dev/null
    [ ! -s "$out" ] && { rm -f "$out" 2>/dev/null; return 1; }
    local magic
    magic=$(od -An -tx1 -N4 "$out" 2>/dev/null | tr -d ' ')
    [ "$magic" != "89504e47" ] && rm -f "$out" 2>/dev/null
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
                printf '%s\n' "$(_jq -n --arg pn "$pkg" --arg an "$aname" --arg ap "$apk" \
                    --arg pt "$pname" --arg ct "$cat" --argjson ip "$priv" --argjson is "$split" \
                    '{"package_name":$pn,"app_name":$an,"app_path":$ap,"partition":$pt,"category":$ct,"is_priv_app":$ip,"is_split":$is}')" \
                    >> "$entries"

                _extract_icon "$apk" "$pkg" "$aapt" &
                scanned=$((scanned + 1))
                # Drain background icon extractions every 20 apps to avoid OOM
                [ $((scanned % 8)) -eq 0 ] && wait
            done
        done
    done
    wait

    # Single jq call: slurp all objects into an array, atomic write
    _jq -s '.' "$entries" > "$APP_LIST.tmp" 2>/dev/null && mv "$APP_LIST.tmp" "$APP_LIST"
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

# On-demand icon regeneration -- called from WebUI "Refresh Icons" button
# Reads app_list.json, extracts icons only for apps missing them
_regenerate_icons() {
    local _tag="scanner"
    local lockfile="${ICON_DIR}/.regen.lock"
    exec 9>"$lockfile"
    flock -n 9 || { log_w "$_tag" "icon regeneration already running"; echo "0"; return 0; }
    log_i "$_tag" "icon regeneration started"

    if [ ! -f "$APP_LIST" ]; then
        log_w "$_tag" "no app_list.json — run a full scan first"
        echo "0"
        return 0
    fi

    local aapt=""
    command -v detect_aapt >/dev/null 2>&1 && aapt=$(detect_aapt)
    if [ -z "$aapt" ]; then
        log_w "$_tag" "aapt not available — cannot extract icons"
        echo "0"
        return 0
    fi

    mkdir -p "$ICON_DIR" 2>/dev/null

    local total generated=0 i=0
    total=$(_jq -r 'length' "$APP_LIST" 2>/dev/null) || total=0
    [ "$total" -eq 0 ] && { log_i "$_tag" "app_list.json is empty"; echo "0"; return 0; }

    local jq_output
    jq_output=$(_jq -r '.[] | "\(.package_name)|\(.app_path)"' "$APP_LIST" 2>/dev/null)
    if [ -z "$jq_output" ] && [ "$total" -gt 0 ]; then
        log_e "$_tag" "failed to parse app_list.json"
        echo "0"
        return 1
    fi

    while IFS='|' read -r pkg app_path; do
        i=$((i + 1))
        [ -z "$pkg" ] && continue
        if [ ! -f "$ICON_DIR/${pkg}.png" ]; then
            _extract_icon "$app_path" "$pkg" "$aapt"
            [ -f "$ICON_DIR/${pkg}.png" ] && generated=$((generated + 1))
        fi
        [ $((i % 10)) -eq 0 ] && log_d "$_tag" "regenerating icons: $i/$total"
    done <<EOF
$jq_output
EOF

    log_i "$_tag" "icon regeneration complete: $generated new icons from $total apps"
    echo "$generated"
    return 0
}

# Direct invocation from WebUI bridge
_init_standalone() {
    [ -z "$MODDIR" ] && MODDIR="$(dirname "$(dirname "$(readlink -f "$0")")")"
    if ! command -v log_i >/dev/null 2>&1; then
        . "$MODDIR/core/config.sh"
        config_init 2>/dev/null
        . "$MODDIR/core/logging.sh"
        log_init 2>/dev/null
        . "$MODDIR/core/detect.sh"
    fi
}

case "${1:-}" in
    refresh) _init_standalone; scanner_refresh ;;
    run)     _init_standalone; scanner_run ;;
    icons)   _init_standalone; _regenerate_icons ;;
esac
