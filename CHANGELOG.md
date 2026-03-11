# Changelog

## v0.1.22

Complete Rust rewrite of the debloat and systemize backend — replaces
all shell logic with a native binary. Three debloat modes (VFS
interception, overlayfs whiteout, pm disable) with auto-detection,
app promotion to /system/ with split APK and permissions XML support,
3-strike bootloop guard, self-healing monitor daemon, and a full
Solid.js WebUI. Supports Magisk, KernelSU, and APatch.
