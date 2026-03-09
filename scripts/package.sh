#!/usr/bin/env bash
# Build pipeline: cross-compile Rust, build WebUI, package module ZIP.
# Usage: ./scripts/package.sh --build [--version v1.1.0] [--clean]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MODULE_DIR="$PROJECT_ROOT/module"
WEBUI_DIR="$PROJECT_ROOT/webui"
RELEASE_DIR="$PROJECT_ROOT/release"

CURRENT_VERSION="$(grep '^version' "$PROJECT_ROOT/Cargo.toml" | head -1 | sed 's/.*"\(.*\)".*/\1/')"
VERSION=""
BUILD=false
CLEAN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --version) VERSION="$2"; shift 2 ;;
        --build)   BUILD=true; shift ;;
        --clean)   CLEAN=true; shift ;;
        *)         echo "Unknown arg: $1"; exit 1 ;;
    esac
done

if [ -z "$VERSION" ]; then
    IFS='.-' read -r major minor patch pre <<< "$CURRENT_VERSION"
    patch=$((patch + 1))
    if [ -n "$pre" ]; then
        NEW_VERSION="${major}.${minor}.${patch}-${pre}"
    else
        NEW_VERSION="${major}.${minor}.${patch}"
    fi

    sed -i "s/^version = \"$CURRENT_VERSION\"/version = \"$NEW_VERSION\"/" "$PROJECT_ROOT/Cargo.toml"

    vcode="${NEW_VERSION%%-*}"
    vcode="${vcode//./}"
    sed -i "s/^version=.*/version=v${NEW_VERSION}/" "$MODULE_DIR/module.prop"
    sed -i "s/^versionCode=.*/versionCode=${vcode}/" "$MODULE_DIR/module.prop"

    VERSION="v${NEW_VERSION}"
    echo "==> Version bumped: v${CURRENT_VERSION} → ${VERSION}"
else
    VERSION="${VERSION#v}"
    VERSION="v${VERSION}"
fi

mkdir -p "$RELEASE_DIR/debug" "$RELEASE_DIR/release"

if [ "$CLEAN" = true ]; then
    echo "==> Cleaning old releases"
    rm -f "$RELEASE_DIR"/debug/scalpel-*.zip "$RELEASE_DIR"/release/scalpel-*.zip
fi

SCRIPTS=(
    action.sh
    boot-completed.sh
    common.sh
    customize.sh
    post-fs-data.sh
    service.sh
    uninstall.sh
)

declare -A ABI_TARGET=(
    [arm64-v8a]=aarch64-linux-android
    [armeabi-v7a]=armv7-linux-androideabi
)

setup_toolchain() {
    export NDK_BIN="/opt/android-ndk-r25b/toolchains/llvm/prebuilt/linux-x86_64/bin"
    if [ ! -d "$NDK_BIN" ]; then
        echo "FATAL: Android NDK not found at /opt/android-ndk-r25b" >&2
        exit 1
    fi
    if [ -f "/home/president/.cargo/bin/cargo" ]; then
        export RUSTUP_HOME=/home/president/.rustup
        export CARGO_HOME=/home/president/.cargo
        CARGO="/home/president/.cargo/bin/cargo"
    else
        CARGO="cargo"
    fi
    export PATH="$NDK_BIN:$PATH"
}

build_rust() {
    local profile="$1"
    local cargo_flag=""

    if [ "$profile" = "release" ]; then
        cargo_flag="--release"
    fi

    for abi in "${!ABI_TARGET[@]}"; do
        target="${ABI_TARGET[$abi]}"
        echo "==> [$profile] Building $abi ($target)"
        "$CARGO" build --manifest-path "$PROJECT_ROOT/Cargo.toml" \
            --target "$target" $cargo_flag 2>&1
    done
    echo "==> [$profile] All Rust targets built"
}

package_zip() {
    local profile="$1"
    local target_subdir="debug"
    [ "$profile" = "release" ] && target_subdir="release"

    local suffix=""
    [ "$profile" = "debug" ] && suffix="-debug"

    local out_name="scalpel-${VERSION}${suffix}.zip"
    local out_path="$RELEASE_DIR/$profile/$out_name"
    local staging
    staging="$(mktemp -d)"

    echo ""
    echo "==> Packaging $profile: $out_name"

    for script in "${SCRIPTS[@]}"; do
        local src="$MODULE_DIR/$script"
        if [ ! -f "$src" ]; then
            echo "FATAL: missing $script" >&2
            rm -rf "$staging"
            exit 1
        fi
        cp "$src" "$staging/$script"
    done

    cp "$MODULE_DIR/module.prop" "$staging/module.prop"

    if [ -f "$MODULE_DIR/sepolicy.rule" ]; then
        cp "$MODULE_DIR/sepolicy.rule" "$staging/sepolicy.rule"
    fi

    sed -i "s/^version=.*/version=${VERSION}/" "$staging/module.prop"
    local vcode="${VERSION#v}"
    vcode="${vcode%%-*}"
    vcode="${vcode//.}"
    sed -i "s/^versionCode=.*/versionCode=${vcode}/" "$staging/module.prop"

    # Rust binaries + prebuilt tools
    local found_bins=0
    for abi in "${!ABI_TARGET[@]}"; do
        local target="${ABI_TARGET[$abi]}"
        local bin_src="$PROJECT_ROOT/target/$target/$target_subdir/scalpel"
        mkdir -p "$staging/bin/$abi"

        if [ -f "$bin_src" ]; then
            cp "$bin_src" "$staging/bin/$abi/scalpel"
            found_bins=$((found_bins + 1))
        elif [ -f "$MODULE_DIR/bin/$abi/scalpel" ]; then
            cp "$MODULE_DIR/bin/$abi/scalpel" "$staging/bin/$abi/scalpel"
            found_bins=$((found_bins + 1))
        fi

        if [ -f "$MODULE_DIR/bin/$abi/aapt" ]; then
            cp "$MODULE_DIR/bin/$abi/aapt" "$staging/bin/$abi/aapt"
        fi
    done

    if [ "$found_bins" -ne 2 ]; then
        echo "FATAL: [$profile] found $found_bins/2 binaries" >&2
        rm -rf "$staging"
        exit 1
    fi

    # Shell subdirectories (core/, modes/, systemize/)
    for subdir in core modes systemize; do
        if [ -d "$MODULE_DIR/$subdir" ]; then
            cp -r "$MODULE_DIR/$subdir" "$staging/$subdir"
        fi
    done

    # Static data (categories.json)
    if [ -d "$MODULE_DIR/data" ]; then
        cp -r "$MODULE_DIR/data" "$staging/data"
    fi

    # WebUI
    if [ -d "$MODULE_DIR/webroot" ]; then
        cp -r "$MODULE_DIR/webroot" "$staging/webroot"
    elif [ -d "$WEBUI_DIR/dist" ]; then
        cp -r "$WEBUI_DIR/dist" "$staging/webroot"
    else
        echo "FATAL: webroot/ not found (build WebUI first)" >&2
        rm -rf "$staging"
        exit 1
    fi

    # META-INF (use existing from module dir)
    if [ -d "$MODULE_DIR/META-INF" ]; then
        cp -r "$MODULE_DIR/META-INF" "$staging/META-INF"
    fi

    rm -f "$out_path"
    (cd "$staging" && zip -r9 "$out_path" .)
    rm -rf "$staging"

    echo "    Output:  $out_path"
    echo "    Size:    $(du -h "$out_path" | cut -f1)"
    echo "    Bins:    $found_bins/2"
    echo "    WebUI:   present"
}

# -- Main --
echo "==> Scalpel $VERSION build pipeline"
echo ""

if [ "$BUILD" = true ]; then
    setup_toolchain

    build_rust "debug"
    build_rust "release"

    if [ -f "$WEBUI_DIR/package.json" ]; then
        echo "==> Building WebUI"
        (cd "$WEBUI_DIR" && npm install --silent && npm run build)
        if [ -d "$WEBUI_DIR/dist" ]; then
            rm -rf "$MODULE_DIR/webroot"
            cp -r "$WEBUI_DIR/dist" "$MODULE_DIR/webroot"
        fi
        echo "==> WebUI built"
    else
        echo "WARN: webui/package.json not found, skipping WebUI build" >&2
    fi
fi

package_zip "debug"
package_zip "release"

echo ""
echo "==> Build complete"
echo "    Debug:   $RELEASE_DIR/debug/scalpel-${VERSION}-debug.zip"
echo "    Release: $RELEASE_DIR/release/scalpel-${VERSION}.zip"
