<p align="center">
  <h1 align="center">🔪 Scalpel</h1>
  <p align="center"><b>Precision Debloat + Systemize for Rooted Android</b></p>
  <p align="center">Cut the bloat. Keep the power.</p>
  <p align="center">
    <img src="https://img.shields.io/badge/version-v0.1.22-orange?style=for-the-badge" alt="Version">
    <img src="https://img.shields.io/badge/License-GPLv3-blue?style=for-the-badge" alt="License">
    <img src="https://img.shields.io/badge/Rust-native-B7410E?style=for-the-badge&logo=rust" alt="Rust">
    <img src="https://img.shields.io/badge/Telegram-community-blue?style=for-the-badge&logo=telegram" alt="Telegram">
  </p>
  <p align="center">
    <img src="https://img.shields.io/badge/KernelSU-supported-green?style=for-the-badge" alt="KernelSU">
    <img src="https://img.shields.io/badge/APatch-supported-purple?style=for-the-badge" alt="APatch">
    <img src="https://img.shields.io/badge/Magisk-20.4%2B-00AF9C?style=for-the-badge&logo=magisk" alt="Magisk">
  </p>
</p>

---

> [!NOTE]
> **Personal project. Open-sourced because sharing is good.**
>
> Built to solve a real problem — OEM bloat eats storage and battery, and systemizing apps on KernelSU is pain. This solves both. It works on my devices. PRs welcome. Entitlement is not.
>
> **All support goes through one place:** the [SuperPowers Telegram](https://t.me/superpowers9).

---

## 🧬 What is Scalpel?

A native Rust binary that debloats system apps and promotes user apps to `/system/` — with multi-mode auto-detection across Magisk, KernelSU, and APatch. It probes your kernel's capabilities at every boot, picks the best debloat strategy available, and falls back gracefully if something changes. Systemized apps get deferred uninstall protection — your `/data/app/` copy is never destroyed until the system overlay is verified working. A self-healing monitor daemon watches everything in the background, and a WebUI gives you full control without touching a terminal.

---

## 🔥 Architecture

One Rust binary. Shell scripts exist only where Android's boot lifecycle demands them — `post-fs-data.sh`, `service.sh`, `boot-completed.sh` — each under 60 lines, each doing exactly one thing: set up the environment and call the binary.

```
post-fs-data.sh  →  scalpel boot-init --stage=post-fs-data
service.sh       →  scalpel boot-init --stage=service
boot-completed.sh → scalpel boot-init --stage=boot-completed
```

Config is a typed TOML struct in memory — no `jq` forks, no `grep` pipelines, no `sed` gymnastics. Mode detection runs once and caches. App scanning runs once at install and loads from JSON. The monitor is a single process with a supervised event loop.

One binary. One config file. One process.

---

## ✨ Features

**Debloat — 3 Modes, Auto-Detected**
- [x] **ZeroMount VFS** — kernel-level path redirection via whiteouts + sync delegation. Invisible to userspace
- [x] **Overlayfs whiteouts** — character device whiteouts with `trusted.overlay.whiteout` xattr. Stock kernel compatible
- [x] **pm disable** — universal fallback, works on every rooted device
- [x] **Auto-detection** — probes kernel capabilities at every boot, selects best mode, falls back gracefully
- [x] **Config override** — force any mode from WebUI or `config.toml`

**Systemize — User Apps → /system/**
- [x] **Promote** — copies APK + native libs to `module/system/{app|priv-app}/` with correct SELinux contexts
- [x] **Split APK support** — handles multi-APK bundles in both directions
- [x] **Permission XML generation** — extracts all permission namespaces via `aapt`, generates priv-app grant XMLs
- [x] **Deferred uninstall** — `/data/app/` copy removed only after post-boot VFS verification confirms the overlay is live
- [x] **Demote** — reverse promotion with pending state tracked across reboots

**Safety**
- [x] **3-strike bootloop protection** — shell-native counter at post-fs-data (no binary deps), auto-disables module + wipes overlays + restores config backup on third consecutive failure
- [x] **Guard markers** — Rust-side crash detection independent of shell counter. Dual protection
- [x] **Config backup** — `config.toml.bak` created at install, restored automatically on bootloop recovery
- [x] **Pending reset** — WebUI-initiated reset defers overlay wipe to next boot (before root manager mounts)

**Scanner**
- [x] **8 partition scan** — `/system`, `/system_ext`, `/vendor`, `/product`, `/odm`, `/oem`, and OEM custom partitions
- [x] **5-category classification** — Essential, Caution, Safe to Remove, Google, Unknown
- [x] **Icon extraction** — via `aapt` with PNG validation and atomic symlinks
- [x] **One-shot cache** — scans once at install, loads instantly after. Manual refresh from WebUI

**Monitor Daemon**
- [x] **Self-healing** — supervised loop with 10-restart limit and 60s cooldown
- [x] **Auto-repair** — detects broken debloat entries and re-applies the active mode
- [x] **Status sync** — updates module description every cycle
- [x] **Singleton lock** — PID-tracked, prevents duplicate instances

```
🔪 Debloated: 4 │ Systemized: 3 │ Mode: zeromount │ Monitor: active
```

Live status in your root manager — no need to open anything.

**WebUI**
- [x] **4 tabs** — Debloat (category accordion, multi-select), Systemize (promote/demote with target picker), Status (mode, counts, verification), Settings (all config overrides)
- [x] **Context-sensitive FAB** — action button changes per tab: Nuke, Systemize, or Reboot
- [x] **Glass morphism design** — AMOLED-friendly dark theme
- [x] **Single batched init** — one binary call loads the entire UI state

---

## 📱 Compatibility

| Root Manager | Support | WebUI |
|---|---|---|
| **KernelSU** | Full | Built-in |
| **APatch** | Full | Built-in |
| **Magisk** | Full | Requires standalone WebUI app |

**Android 9+** (API 28). ARM64 and ARMv7.

---

## 🚀 Installation

1. Download the [latest release](https://github.com/Enginex0/scalpel/releases/latest)
2. Install via your root manager
3. Reboot

During install, press **Vol+** to apply default debloat on first boot, or **Vol−** / wait 10s to skip.

The module auto-detects your root manager, scans all system apps, caches the inventory, and starts the daemon. Nothing else to configure.

---

## ⚙️ Configuration

All settings configurable from the **WebUI** or CLI:

```bash
scalpel config get debloat.mode_override
scalpel config set monitor.interval 600
```

Config lives at `/data/adb/scalpel/config.toml` and is preserved across reinstalls.

<details>
<summary><b>Config Reference</b></summary>

| Key | Default | Description |
|---|---|---|
| `debloat.mode_override` | `auto` | Force debloat mode (`auto`, `zeromount`, `whiteout`, `pm`) |
| `debloat.mounting_mode` | `default` | Mount strategy (`default`, `standalone`) |
| `debloat.disable_only` | `false` | Force pm mode regardless of capabilities |
| `debloat.uninstall_fallback` | `true` | Uninstall /data/app/ copy if overlay fails |
| `systemize.deferred_uninstall` | `true` | Verify overlay before removing /data/app/ copy |
| `scan.refresh_on_boot` | `false` | Re-scan app inventory every boot |
| `monitor.enabled` | `true` | Run self-healing monitor daemon |
| `monitor.interval` | `300` | Seconds between monitor cycles (60–3600) |
| `guard.enabled` | `true` | Rust-side bootloop guard markers |
| `guard.marker_threshold` | `3` | Failed boots before auto-disable |
| `log.level` | `info` | Log verbosity (`debug`, `info`, `warn`, `error`) |
| `log.max_size` | `1048576` | Log file size limit in bytes |
| `log.max_archives` | `3` | Number of rotated log files to keep |

</details>

<details>
<summary><b>File Locations</b></summary>

```
/data/adb/scalpel/
├── config.toml              # Configuration
├── config.toml.bak          # Backup (restored on bootloop)
├── app_list.json            # Cached system app inventory
├── nuke_list.json           # Debloated apps
├── systemize_list.json      # Promoted apps
├── pending_demote.json      # Apps pending demotion
├── status.json              # Mode, counts, verification state
├── debug.log                # Runtime log
├── monitor.pid              # Daemon PID
├── count.sh                 # Bootloop counter
├── icons/                   # Extracted app icons
└── guard/                   # Bootloop markers

/data/adb/modules/scalpel/
├── system/                  # Overlay (whiteouts + systemized apps)
├── webroot/                 # WebUI assets
└── bin/                     # Rust binary + aapt
```

</details>

<details>
<summary><b>CLI Reference</b></summary>

```bash
scalpel scan [--refresh] [--json]
scalpel nuke [--mode zeromount|whiteout|pm] [--json]
scalpel restore <package>
scalpel promote <package> [--target app|priv-app] [--name <label>]
scalpel demote <package>
scalpel verify [--json]
scalpel status [--json]
scalpel detect metamodule [--json]
scalpel diagnose [--output <path>]
scalpel monitor [status]
scalpel config {get|set} <key> [<value>]
scalpel list {apps|nuked|promoted}
scalpel log {tail [--lines N] | clear}
scalpel version
```

</details>

---

## 💬 Community

```
$ scalpel --connect

 ███████╗██╗   ██╗██████╗ ███████╗██████╗
 ██╔════╝██║   ██║██╔══██╗██╔════╝██╔══██╗
 ███████╗██║   ██║██████╔╝█████╗  ██████╔╝
 ╚════██║██║   ██║██╔═══╝ ██╔══╝  ██╔══██╗
 ███████║╚██████╔╝██║     ███████╗██║  ██║
 ╚══════╝ ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═╝
              POWERS

 [✓] SIGNAL    ──→  t.me/superpowers9
 [✓] UPLINK    ──→  bug reports · feature drops · dev updates
 [✓] STATUS    ──→  OPEN — all operators welcome
```

<p align="center">
  <a href="https://t.me/superpowers9">
    <img src="https://img.shields.io/badge/⚡_JOIN_THE_GRID-SuperPowers_Telegram-black?style=for-the-badge&logo=telegram&logoColor=cyan&labelColor=0d1117&color=00d4ff" alt="Telegram">
  </a>
</p>

---

## 📄 License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

---

<p align="center">
  <b>🔪 Cut the bloat. Keep the power.</b>
</p>
