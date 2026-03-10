<p align="center">
  <h1 align="center">🔪 Scalpel</h1>
  <p align="center"><b>Precision Debloat & Systemize for Rooted Android</b></p>
  <p align="center">Cut the bloat. Elevate your apps. Zero risk.</p>
  <p align="center">
    <img src="https://img.shields.io/badge/status-stable-brightgreen?style=for-the-badge" alt="Stable">
    <img src="https://img.shields.io/badge/Magisk%20%7C%20KSU%20%7C%20APatch-supported-green?style=for-the-badge&logo=android" alt="Root Managers">
    <img src="https://img.shields.io/badge/Telegram-community-blue?style=for-the-badge&logo=telegram" alt="Telegram">
  </p>
  <p align="center">
    English | 简体中文 | 繁體中文 | Türkçe | Português (Brasil) | 한국어 | Français | Bahasa Indonesia | Русский | Українська | ภาษาไทย | Tiếng Việt | Italiano | Polski | Български | 日本語 | Español | العربية | हिन्दी | Deutsch | Nederlands | Ελληνικά | Svenska | Norsk | Dansk
  </p>
</p>

---

## 🧬 What is Scalpel?

Scalpel is a **system app management module** for rooted Android. It does two things: **debloat** — removing pre-installed apps you don't want — and **systemize** — promoting user apps to run as system apps with elevated privileges. Rather than locking you into a single removal method, Scalpel auto-detects your device capabilities at every boot and selects the best available strategy: kernel-level VFS interception, overlayfs whiteouts, or package manager commands.

The result: **bloatware gone, your apps elevated, your device safe**. A 3-strike bootloop guard protects against bad configurations, deferred operations ensure your data is never destroyed prematurely, and a self-healing background monitor repairs any drift between reboots. Everything is managed through a WebUI inside your root manager — no terminal needed.

> **This is not `pm disable`.** Scalpel's multi-mode engine goes beyond simple package manager commands. When your kernel supports it, apps are hidden at the VFS level — invisible to the system entirely. On stock kernels, overlayfs whiteouts provide persistent removal across reboots. Package manager commands are the last resort, not the only option.

---

## 🔥 Why Scalpel?

🛡️ **Bootloop-Proof** — Three failed boots auto-disable the module and restore your config. You can always recover.

🎯 **Multi-Mode Debloat** — VFS interception, overlayfs whiteouts, or pm disable — auto-detects the best strategy for your kernel.

📦 **Systemize Apps** — Promote user apps to `/system/` with proper permissions. Your original data is preserved until the system copy is verified.

🎛️ **Full WebUI** — Browse, search, select, and manage apps from your root manager. No terminal needed.

🔄 **Self-Healing** — Background monitor detects and repairs broken debloats automatically between reboots.

📱 **Universal Root** — Works with Magisk, KernelSU, and APatch out of the box.

---

## ✨ Features

**Debloat Engine**
- [x] **3 debloat modes** — VFS interception, overlayfs whiteouts, or package manager — auto-detected per boot
- [x] **App scanner** — discovers all system apps across partitions with 5-category risk classification
- [x] **Default debloat** — volume key prompt during install for immediate cleanup on first boot
- [x] **Raw whiteout support** — advanced users can supply a plain-text package list

**Systemize Engine**
- [x] **App promotion** — elevate user apps to `/system/app` or `/system/priv-app`
- [x] **Split APK support** — handles multi-APK bundles and native libraries
- [x] **Permissions XML** — auto-generates privileged permission allowlists for priv-app targets
- [x] **Deferred uninstall** — original app data preserved until system overlay is verified working
- [x] **Demote & rollback** — reverse any promotion with pending state tracking across reboots

**Safety & Recovery**
- [x] **3-strike bootloop guard** — auto-disables module and restores config after repeated boot failures
- [x] **Deferred operations** — never removes original app data before confirming the replacement works
- [x] **Post-boot verification** — confirms every debloated and systemized app is in the expected state
- [x] **Self-healing monitor** — background daemon detects and repairs broken debloats automatically
- [x] **Config backup** — automatic backup before risky operations, restored on boot failures

**WebUI**
- [x] **Full dashboard** — status overview, debloat manager, systemize manager, settings
- [x] **Category browsing** — apps grouped by risk level with search and batch selection
- [x] **Context-sensitive actions** — floating action button adapts per tab (reboot, nuke, promote)
- [x] **Themeable** — light, dark, accent colors, glass effects

---

## ⚙️ Debloat Modes

Scalpel evaluates your device at every boot and selects the best available mode. You can override this in Settings.

| Mode | How It Works | Requirement | Trace Level |
|---|---|---|---|
| **VFS Interception** | Whiteouts synced to kernel VFS driver — apps vanish from the filesystem entirely | Custom kernel with VFS hooks | None — invisible to mount tables and stat |
| **Overlayfs Whiteout** | Character device whiteouts with overlay xattr in module directory | Stock kernel with overlayfs support | Low — overlay metadata visible to root |
| **Package Manager** | `pm disable-user` removes app from user space | Any rooted device | Visible — apps disabled, not hidden |

> Auto-detection fallback: **VFS** → **Whiteout** → **PM**. The best available mode is always selected automatically.

---

## 📋 Requirements

> [!IMPORTANT]
> Scalpel works on **any rooted Android 9+ device** out of the box. No custom kernel needed. For VFS-level app hiding, a kernel with VFS redirection support is recommended — but overlayfs and pm fallbacks work everywhere.

**You need:**
1. A rooted Android device (Android 9+) with an unlocked bootloader
2. A supported root manager (see compatibility below)

---

## 📱 Compatibility

### Root Managers

| Manager | Status | Notes |
|---|---|---|
| KernelSU | ✅ Tested | Full lifecycle support |
| APatch | ⚠️ Untested | Boot hooks present but not verified on device |
| Magisk | ⚠️ Untested | Boot-completed polling and magic mount fallback present but not verified |

> More devices and root managers will be tested as development continues. If you test on an unlisted combo, let us know!

---

## 🚀 Quick Start

1. **Download** the latest module ZIP from [Releases](https://github.com/Enginex0/Scalpel/releases)
2. **Install** via your root manager (Magisk, KSU, or APatch)
3. **Choose default debloat** during install — Volume Up to apply, Volume Down to skip
4. **Reboot** your device
5. **Open the WebUI** from your root manager to browse and manage apps

---

## 💬 Community

```bash
$ scalpel --operate

 ██████╗ ██████╗ ███████╗██████╗  █████╗ ████████╗███████╗
██╔═══██╗██╔══██╗██╔════╝██╔══██╗██╔══██╗╚══██╔══╝██╔════╝
██║   ██║██████╔╝█████╗  ██████╔╝███████║   ██║   █████╗
██║   ██║██╔═══╝ ██╔══╝  ██╔══██╗██╔══██║   ██║   ██╔══╝
╚██████╔╝██║     ███████╗██║  ██║██║  ██║   ██║   ███████╗
 ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝

 [✓] SIGNAL    ──→  t.me/superpowers9
 [✓] UPLINK    ──→  debloat tips · bug triage · feature drops
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
  <b>🔪 Precision mode — cut the bloat, keep the edge.</b>
</p>
