#!/system/bin/sh
# ABI detection and binary path setup — sourced by all lifecycle scripts

if [ -n "$ARCH" ]; then
    case "$ARCH" in
        arm64) ABI=arm64-v8a ;;
        arm)   ABI=armeabi-v7a ;;
        *)     ABI="" ;;
    esac
else
    case "$(uname -m)" in
        aarch64)       ABI=arm64-v8a ;;
        armv7*|armv8l) ABI=armeabi-v7a ;;
        *)             ABI="" ;;
    esac
fi

[ -n "$MODDIR" ] && [ -n "$ABI" ] && BIN="$MODDIR/bin/${ABI}/scalpel"
