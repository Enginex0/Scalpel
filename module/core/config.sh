#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
# Sourced by other scripts -- persistent config read/write/migrate/backup

SCALPEL_DATA="/data/adb/scalpel"
SCALPEL_CONFIG="${SCALPEL_DATA}/config.sh"
SCALPEL_CONFIG_BAK="${SCALPEL_DATA}/config.sh.bak"

_config_defaults() {
    SCALPEL_VERSION="0.1.0"
    SCALPEL_MODE_OVERRIDE=""
    SCALPEL_LOG_LEVEL="info"
    SCALPEL_REFRESH_APPLIST="false"
    SCALPEL_DISABLE_ONLY="false"
    SCALPEL_UNINSTALL_FALLBACK="true"
    SCALPEL_MONITOR_INTERVAL="300"
}

_config_log() {
    echo "scalpel:config: $1" > /dev/kmsg 2>/dev/null
}

# Reject keys with anything outside strict alphanumeric+underscore
_config_valid_key() {
    case "$1" in
        SCALPEL_[A-Z_]*)
            case "$1" in
                *[!A-Za-z0-9_]*) return 1 ;;
                *) return 0 ;;
            esac
            ;;
        *) return 1 ;;
    esac
}

# Validate config file contains only safe variable assignments before sourcing
_config_source_safe() {
    local cfg="$1"
    [ ! -f "$cfg" ] && return 1
    if grep -qvE '^(SCALPEL_[A-Z_]+="[^"$`\\]*"|[[:space:]]*$|#.*)$' "$cfg" 2>/dev/null; then
        _config_log "WARN: config contains unsafe content, skipping source"
        return 1
    fi
    . "$cfg"
}

# Atomic write via PID-unique temp file, printf to avoid shell expansion
_config_write_file() {
    local target="$1"
    local tmp_file="${SCALPEL_CONFIG}.tmp.$$"
    {
        printf 'SCALPEL_VERSION="%s"\n' "$SCALPEL_VERSION"
        printf 'SCALPEL_MODE_OVERRIDE="%s"\n' "$SCALPEL_MODE_OVERRIDE"
        printf 'SCALPEL_LOG_LEVEL="%s"\n' "$SCALPEL_LOG_LEVEL"
        printf 'SCALPEL_REFRESH_APPLIST="%s"\n' "$SCALPEL_REFRESH_APPLIST"
        printf 'SCALPEL_DISABLE_ONLY="%s"\n' "$SCALPEL_DISABLE_ONLY"
        printf 'SCALPEL_UNINSTALL_FALLBACK="%s"\n' "$SCALPEL_UNINSTALL_FALLBACK"
        printf 'SCALPEL_MONITOR_INTERVAL="%s"\n' "$SCALPEL_MONITOR_INTERVAL"
    } > "$tmp_file"
    if [ ! -s "$tmp_file" ]; then
        _config_log "ERROR: failed to write temp config"
        rm -f "$tmp_file" 2>/dev/null
        return 1
    fi
    if ! mv "$tmp_file" "$target" 2>/dev/null; then
        _config_log "ERROR: failed to rename config to ${target}"
        rm -f "$tmp_file" 2>/dev/null
        return 1
    fi
}

# Explicit key-to-variable dispatch -- no eval
_config_dispatch_get() {
    case "$1" in
        SCALPEL_VERSION) echo "$SCALPEL_VERSION" ;;
        SCALPEL_MODE_OVERRIDE) echo "$SCALPEL_MODE_OVERRIDE" ;;
        SCALPEL_LOG_LEVEL) echo "$SCALPEL_LOG_LEVEL" ;;
        SCALPEL_REFRESH_APPLIST) echo "$SCALPEL_REFRESH_APPLIST" ;;
        SCALPEL_DISABLE_ONLY) echo "$SCALPEL_DISABLE_ONLY" ;;
        SCALPEL_UNINSTALL_FALLBACK) echo "$SCALPEL_UNINSTALL_FALLBACK" ;;
        SCALPEL_MONITOR_INTERVAL) echo "$SCALPEL_MONITOR_INTERVAL" ;;
        *) return 1 ;;
    esac
}

_config_dispatch_set() {
    local key="$1" val="$2"
    case "$key" in
        SCALPEL_VERSION) SCALPEL_VERSION="$val" ;;
        SCALPEL_MODE_OVERRIDE)
            case "$val" in ""|zeromount|mountify|symlink|whiteout|magisk|pm) ;; *) return 1 ;; esac
            SCALPEL_MODE_OVERRIDE="$val" ;;
        SCALPEL_LOG_LEVEL)
            case "$val" in debug|info|warn|error|fatal) ;; *) return 1 ;; esac
            SCALPEL_LOG_LEVEL="$val" ;;
        SCALPEL_REFRESH_APPLIST)
            case "$val" in true|false) ;; *) return 1 ;; esac
            SCALPEL_REFRESH_APPLIST="$val" ;;
        SCALPEL_DISABLE_ONLY)
            case "$val" in true|false) ;; *) return 1 ;; esac
            SCALPEL_DISABLE_ONLY="$val" ;;
        SCALPEL_UNINSTALL_FALLBACK)
            case "$val" in true|false) ;; *) return 1 ;; esac
            SCALPEL_UNINSTALL_FALLBACK="$val" ;;
        SCALPEL_MONITOR_INTERVAL)
            case "$val" in ''|*[!0-9]*) return 1 ;; esac
            SCALPEL_MONITOR_INTERVAL="$val" ;;
        *) return 1 ;;
    esac
}

config_init() {
    if ! mkdir -p "$SCALPEL_DATA" 2>/dev/null; then
        _config_log "FATAL: cannot create ${SCALPEL_DATA}"
        return 1
    fi

    _config_defaults

    if [ -f "$SCALPEL_CONFIG" ]; then
        _config_source_safe "$SCALPEL_CONFIG" || _config_log "WARN: config invalid, using defaults"
        return 0
    fi

    _config_write_file "$SCALPEL_CONFIG"
    _config_log "created default config"
    return 0
}

config_get() {
    local key="$1"
    _config_valid_key "$key" || return 1

    _config_defaults
    [ -f "$SCALPEL_CONFIG" ] && _config_source_safe "$SCALPEL_CONFIG"

    _config_dispatch_get "$key"
}

config_set() {
    local key="$1" value="$2"
    _config_valid_key "$key" || { _config_log "ERROR: invalid key: ${key}"; return 1; }

    if [ ! -d "$SCALPEL_DATA" ]; then
        _config_log "ERROR: ${SCALPEL_DATA} missing, run config_init first"
        return 1
    fi

    _config_defaults
    [ -f "$SCALPEL_CONFIG" ] && _config_source_safe "$SCALPEL_CONFIG"

    # Strip shell metacharacters and newlines
    local safe_value
    safe_value=$(printf '%s' "$value" | tr -d '`$"\\'"'" | tr -d '\n\r')

    _config_dispatch_set "$key" "$safe_value" || { _config_log "ERROR: unknown key: ${key}"; return 1; }
    _config_write_file "$SCALPEL_CONFIG"
}

config_migrate() {
    local new_version="$1"

    _config_defaults
    [ -f "$SCALPEL_CONFIG" ] && _config_source_safe "$SCALPEL_CONFIG"
    SCALPEL_VERSION="$new_version"

    if [ ! -d "$SCALPEL_DATA" ] && ! mkdir -p "$SCALPEL_DATA" 2>/dev/null; then
        _config_log "FATAL: cannot create ${SCALPEL_DATA}"
        return 1
    fi

    _config_write_file "$SCALPEL_CONFIG"
    _config_log "migrated config to v${new_version}"
}

config_backup() {
    [ ! -f "$SCALPEL_CONFIG" ] && { _config_log "WARN: no config to backup"; return 1; }
    if ! cp "$SCALPEL_CONFIG" "$SCALPEL_CONFIG_BAK" 2>/dev/null; then
        _config_log "ERROR: config backup failed"
        return 1
    fi
}

config_restore() {
    if [ -f "$SCALPEL_CONFIG_BAK" ]; then
        if _config_source_safe "$SCALPEL_CONFIG_BAK" && cp "$SCALPEL_CONFIG_BAK" "$SCALPEL_CONFIG" 2>/dev/null; then
            _config_log "config restored from backup"
            return 0
        fi
        _config_log "WARN: backup restore failed"
    fi
    _config_log "WARN: reinitializing config from defaults"
    config_init
}
