#!/bin/bash
set -euo pipefail

VERSION=$(grep '^version' Cargo.toml | head -1 | sed 's/.*"\(.*\)"/\1/')
DIST="dist"

rm -rf "$DIST"
mkdir -p "$DIST/bin/arm64-v8a" "$DIST/bin/armeabi-v7a" \
         "$DIST/META-INF/com/google/android"

# 1. Build Rust for both ABIs
cargo build --release --target aarch64-linux-android
cargo build --release --target armv7-linux-androideabi

cp target/aarch64-linux-android/release/scalpel "$DIST/bin/arm64-v8a/"
cp target/armv7-linux-androideabi/release/scalpel "$DIST/bin/armeabi-v7a/"

# 2. Build WebUI
(cd webui && npm ci && npm run build)

# 3. Assemble module files
cp module/module.prop "$DIST/"
cp module/common.sh "$DIST/"
cp module/customize.sh "$DIST/"
cp module/post-fs-data.sh "$DIST/"
cp module/service.sh "$DIST/"
cp module/boot-completed.sh "$DIST/"
cp module/action.sh "$DIST/"
cp module/uninstall.sh "$DIST/"
cp module/sepolicy.rule "$DIST/"
cp module/META-INF/com/google/android/update-binary "$DIST/META-INF/com/google/android/"
cp module/META-INF/com/google/android/updater-script "$DIST/META-INF/com/google/android/"

mkdir -p "$DIST/data"
cp module/data/categories.json "$DIST/data/"

# aapt ships as a pre-built AOSP binary
if [ -d module/common ]; then
    cp -r module/common "$DIST/"
fi

# WebUI build output (vite outputs to module/webroot/)
if [ -d module/webroot ]; then
    cp -r module/webroot "$DIST/"
fi

# 4. Package ZIP
cd "$DIST"
zip -r9 "../scalpel-v${VERSION}.zip" .
echo "Built: scalpel-v${VERSION}.zip"
