# Changelog

## v0.1.27

- x86 and x86_64 ABI support for emulators and ChromeOS devices
- Scanner path canonicalization fixes missing apps (com.android.egg, com.android.dreams.basic)
- Shared OEM partition constants across scanner, whiteout, and nuke (adds my_reserve and others)
- Post-boot skips pm uninstall for packages with /data/app copies, protecting user-downgraded APKs
- Monitor canonicalizes stored paths before verification to prevent false repair loops
- WebUI settings now hydrate from backend config.toml instead of hardcoded defaults
- Raw whiteout validation accepts all known vendor partition paths
- CI pipeline builds all four ABIs (arm64-v8a, armeabi-v7a, x86_64, x86)
- Fixed pnpm/npm mismatch in package.sh

## v0.1.22

Complete Rust rewrite of the debloat and systemize backend — replaces
all shell logic with a native binary. Three debloat modes (VFS
interception, overlayfs whiteout, pm disable) with auto-detection,
app promotion to /system/ with split APK and permissions XML support,
3-strike bootloop guard, self-healing monitor daemon, and a full
Solid.js WebUI. Supports Magisk, KernelSU, and APatch.
