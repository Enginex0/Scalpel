# Goal

## One-Sentence Summary

Scalpel is an Android module that debloats system apps and systemizes user apps with clinical precision, auto-detecting the best available mounting mode across all root managers.

---

## Success Criteria

- [ ] Auto-detects device capabilities and selects optimal mode (6 modes supported)
- [ ] Debloats system apps via whiteouts with zero false failures
- [ ] Systemizes user apps so Android's PackageManager recognizes them as true system apps (FLAG_SYSTEM + correct sourceDir)
- [ ] Works on Magisk, KernelSU, and APatch without user configuration
- [ ] WebUI (Solid.js) provides app selection, category warnings, and status verification
- [ ] 3-strike bootloop protection with config backup/restore
- [ ] Post-reboot verification confirms operations succeeded

---

## Explicitly Out of Scope

- NOT a metamodule — Scalpel is a regular module that consumes the mounting system
- NOT reimplementing VFS hooks — leverages ZeroMount when available, not its own kernel patches
- NOT building a standalone SUSFS engine — relies on ZeroMount's SUSFS integration
- NOT supporting x86/x86_64 emulators in v1
- NOT providing app backup/restore (data migration)
- NOT re-signing APKs with platform keys (Level 3 system privileges impossible without OEM key)

---

## Why This Matters

Every existing Android debloater/systemizer module is either deprecated (9+ years old), single-mode, single-root-manager, or broken in ways that cause silent failures. No module combines both directions (debloat + systemize) with multi-mode auto-detection. Scalpel fills this gap with the precision and reliability the Android root community lacks.
