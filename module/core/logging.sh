#!/system/bin/sh
# Sourced by other scripts -- 5-level structured logging to kmsg + debug.log with rotation

SCALPEL_LOG_FILE="/data/adb/scalpel/debug.log"
SCALPEL_LOG_DIR="/data/adb/scalpel"
SCALPEL_LOG_TAG="scalpel"
SCALPEL_LOG_MAX=1048576
SCALPEL_LOG_ARCHIVES=3
SCALPEL_LOG_INITIALIZED=0

# Cached numeric level -- set once by log_init, avoids repeated case matching
_SCALPEL_LOG_LEVEL_NUM=1

_log_level_to_num() {
    case "$1" in
        debug) echo 0 ;;
        info)  echo 1 ;;
        warn)  echo 2 ;;
        error) echo 3 ;;
        fatal) echo 4 ;;
        *)     echo 1 ;;
    esac
}

log_init() {
    _SCALPEL_LOG_LEVEL_NUM=$(_log_level_to_num "${SCALPEL_LOG_LEVEL:-info}")

    if [ ! -d "$SCALPEL_LOG_DIR" ]; then
        mkdir -p "$SCALPEL_LOG_DIR" 2>/dev/null || return 1
    fi

    log_rotate
    SCALPEL_LOG_INITIALIZED=1
}

log_rotate() {
    [ ! -f "$SCALPEL_LOG_FILE" ] && return 0

    # wc -c works on Android without busybox
    local size
    size=$(wc -c < "$SCALPEL_LOG_FILE" 2>/dev/null) || return 0
    size=${size##* }

    [ "$size" -lt "$SCALPEL_LOG_MAX" ] 2>/dev/null && return 0

    local i=$SCALPEL_LOG_ARCHIVES
    rm -f "${SCALPEL_LOG_FILE}.${i}" 2>/dev/null

    while [ "$i" -gt 1 ]; do
        local prev=$((i - 1))
        [ -f "${SCALPEL_LOG_FILE}.${prev}" ] && mv "${SCALPEL_LOG_FILE}.${prev}" "${SCALPEL_LOG_FILE}.${i}" 2>/dev/null
        i=$prev
    done

    mv "$SCALPEL_LOG_FILE" "${SCALPEL_LOG_FILE}.1" 2>/dev/null
    : > "$SCALPEL_LOG_FILE" 2>/dev/null
}

_log() {
    local level_num="$1"
    local level_str="$2"
    local caller="$3"
    local message="$4"

    [ "$level_num" -lt "$_SCALPEL_LOG_LEVEL_NUM" ] && return 0

    local kmsg_line="${SCALPEL_LOG_TAG}: [${level_str}] [${caller}] ${message}"
    echo "$kmsg_line" >> /dev/kmsg 2>/dev/null

    # File logging requires /data to be mounted and log_init to have run
    if [ "$SCALPEL_LOG_INITIALIZED" = 1 ]; then
        local ts
        ts=$(date '+%Y-%m-%d %H:%M:%S' 2>/dev/null) || ts="0000-00-00 00:00:00"
        echo "[${ts}] [${level_str}] [${caller}] ${message}" >> "$SCALPEL_LOG_FILE" 2>/dev/null
    fi
}

log_d() { _log 0 "DEBUG" "$1" "$2"; }
log_i() { _log 1 "INFO"  "$1" "$2"; }
log_w() { _log 2 "WARN"  "$1" "$2"; }
log_e() { _log 3 "ERROR" "$1" "$2"; }

log_f() {
    _log 4 "FATAL" "$1" "$2"
}
