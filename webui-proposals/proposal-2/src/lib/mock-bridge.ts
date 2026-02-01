import type { AppEntry, NukeEntry, StatusJson, CategoriesJson, SystemizeEntry, ConfigState, UserApp } from './types'

const MOCK_APPS: AppEntry[] = [
  { package_name: 'com.android.systemui', app_name: 'System UI', app_path: '/system/priv-app/SystemUI/SystemUI.apk', partition: 'system', category: 'essential', is_priv_app: true, is_split: false },
  { package_name: 'com.android.settings', app_name: 'Settings', app_path: '/system/priv-app/Settings/Settings.apk', partition: 'system', category: 'essential', is_priv_app: true, is_split: true },
  { package_name: 'com.android.phone', app_name: 'Phone', app_path: '/system/priv-app/TeleService/TeleService.apk', partition: 'system', category: 'essential', is_priv_app: true, is_split: false },
  { package_name: 'com.android.launcher3', app_name: 'Launcher', app_path: '/system/priv-app/Launcher3/Launcher3.apk', partition: 'system', category: 'essential', is_priv_app: true, is_split: false },
  { package_name: 'com.android.providers.contacts', app_name: 'Contacts Provider', app_path: '/system/priv-app/ContactsProvider/ContactsProvider.apk', partition: 'system', category: 'essential', is_priv_app: true, is_split: false },

  { package_name: 'com.android.bluetooth', app_name: 'Bluetooth', app_path: '/system/app/Bluetooth/Bluetooth.apk', partition: 'system', category: 'caution', is_priv_app: false, is_split: false },
  { package_name: 'com.android.nfc', app_name: 'NFC Service', app_path: '/system/app/NfcNci/NfcNci.apk', partition: 'system', category: 'caution', is_priv_app: false, is_split: false },
  { package_name: 'com.android.printspooler', app_name: 'Print Spooler', app_path: '/system/app/PrintSpooler/PrintSpooler.apk', partition: 'system', category: 'caution', is_priv_app: false, is_split: false },
  { package_name: 'com.android.inputdevices', app_name: 'Input Devices', app_path: '/system/priv-app/InputDevices/InputDevices.apk', partition: 'system', category: 'caution', is_priv_app: true, is_split: false },

  { package_name: 'com.facebook.katana', app_name: 'Facebook', app_path: '/system/app/Facebook/Facebook.apk', partition: 'system', category: 'safe', is_priv_app: false, is_split: true },
  { package_name: 'com.facebook.orca', app_name: 'Messenger', app_path: '/system/app/Messenger/Messenger.apk', partition: 'system', category: 'safe', is_priv_app: false, is_split: true },
  { package_name: 'com.facebook.services', app_name: 'Facebook Services', app_path: '/system/app/FacebookServices/FacebookServices.apk', partition: 'system', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.facebook.system', app_name: 'Facebook System', app_path: '/system/app/FacebookSystem/FacebookSystem.apk', partition: 'system', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.netflix.mediaclient', app_name: 'Netflix', app_path: '/system/app/Netflix/Netflix.apk', partition: 'system', category: 'safe', is_priv_app: false, is_split: true },
  { package_name: 'com.spotify.music', app_name: 'Spotify', app_path: '/product/app/Spotify/Spotify.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.linkedin.android', app_name: 'LinkedIn', app_path: '/product/app/LinkedIn/LinkedIn.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.amazon.appmanager', app_name: 'Amazon', app_path: '/system/app/Amazon/Amazon.apk', partition: 'system', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.microsoft.skydrive', app_name: 'OneDrive', app_path: '/product/app/OneDrive/OneDrive.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.tiktok.market', app_name: 'TikTok', app_path: '/system/app/TikTok/TikTok.apk', partition: 'system', category: 'safe', is_priv_app: false, is_split: true },
  { package_name: 'com.miui.analytics', app_name: 'Analytics', app_path: '/product/app/Analytics/Analytics.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.miui.daemon', app_name: 'MIUI Daemon', app_path: '/system/app/MiuiDaemon/MiuiDaemon.apk', partition: 'system', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.miui.yellowpage', app_name: 'Yellow Pages', app_path: '/product/app/YellowPages/YellowPages.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.miui.cloudbackup', app_name: 'Mi Cloud Backup', app_path: '/product/app/CloudBackup/CloudBackup.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.miui.weather2', app_name: 'Weather', app_path: '/product/app/Weather/Weather.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.miui.player', app_name: 'Mi Music', app_path: '/product/app/MiMusic/MiMusic.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.miui.videoplayer', app_name: 'Mi Video', app_path: '/product/app/MiVideo/MiVideo.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.miui.gallery', app_name: 'Mi Gallery', app_path: '/product/app/MiGallery/MiGallery.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: true },
  { package_name: 'com.samsung.android.bixby.agent', app_name: 'Bixby Voice', app_path: '/system/app/Bixby/Bixby.apk', partition: 'system', category: 'safe', is_priv_app: false, is_split: true },
  { package_name: 'com.samsung.android.app.tips', app_name: 'Samsung Tips', app_path: '/system/app/Tips/Tips.apk', partition: 'system', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.samsung.android.game.gamehome', app_name: 'Game Launcher', app_path: '/system/app/GameLauncher/GameLauncher.apk', partition: 'system', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.samsung.android.app.spage', app_name: 'Samsung Free', app_path: '/system/app/SamsungFree/SamsungFree.apk', partition: 'system', category: 'safe', is_priv_app: false, is_split: false },

  { package_name: 'com.google.android.gms', app_name: 'Google Play Services', app_path: '/system/priv-app/GmsCore/GmsCore.apk', partition: 'system', category: 'google', is_priv_app: true, is_split: true },
  { package_name: 'com.google.android.gsf', app_name: 'Google Services Framework', app_path: '/system/priv-app/GoogleServicesFramework/GoogleServicesFramework.apk', partition: 'system', category: 'google', is_priv_app: true, is_split: false },
  { package_name: 'com.google.android.apps.maps', app_name: 'Google Maps', app_path: '/system/app/Maps/Maps.apk', partition: 'system', category: 'google', is_priv_app: false, is_split: true },
  { package_name: 'com.google.android.youtube', app_name: 'YouTube', app_path: '/system/app/YouTube/YouTube.apk', partition: 'system', category: 'google', is_priv_app: false, is_split: true },
  { package_name: 'com.google.android.apps.photos', app_name: 'Google Photos', app_path: '/product/app/Photos/Photos.apk', partition: 'product', category: 'google', is_priv_app: false, is_split: true },
  { package_name: 'com.google.android.gm', app_name: 'Gmail', app_path: '/system/app/Gmail/Gmail.apk', partition: 'system', category: 'google', is_priv_app: false, is_split: true },
  { package_name: 'com.google.android.apps.docs', app_name: 'Google Drive', app_path: '/product/app/Drive/Drive.apk', partition: 'product', category: 'google', is_priv_app: false, is_split: true },
  { package_name: 'com.google.android.tts', app_name: 'Google TTS', app_path: '/system/app/GoogleTTS/GoogleTTS.apk', partition: 'system', category: 'google', is_priv_app: false, is_split: false },
  { package_name: 'com.google.android.keep', app_name: 'Google Keep', app_path: '/product/app/Keep/Keep.apk', partition: 'product', category: 'google', is_priv_app: false, is_split: false },
  { package_name: 'com.google.android.calendar', app_name: 'Google Calendar', app_path: '/product/app/Calendar/Calendar.apk', partition: 'product', category: 'google', is_priv_app: false, is_split: true },

  { package_name: 'com.qualcomm.qti.autoregistration', app_name: 'QTI Auto Registration', app_path: '/vendor/app/QtiAutoReg/QtiAutoReg.apk', partition: 'vendor', category: 'unknown', is_priv_app: false, is_split: false },
  { package_name: 'com.qualcomm.qti.smcinvokepkgmgr', app_name: 'SMC Invoke Pkg Mgr', app_path: '/vendor/app/SmcInvoke/SmcInvoke.apk', partition: 'vendor', category: 'unknown', is_priv_app: false, is_split: false },
  { package_name: 'com.qualcomm.qcrilmsgtunnel', app_name: 'QCRIL MSG Tunnel', app_path: '/vendor/app/QcrilMsgTunnel/QcrilMsgTunnel.apk', partition: 'vendor', category: 'unknown', is_priv_app: false, is_split: false },
  { package_name: 'com.android.wallpapercropper', app_name: 'Wallpaper Cropper', app_path: '/system/app/WallpaperCropper/WallpaperCropper.apk', partition: 'system', category: 'unknown', is_priv_app: false, is_split: false },
  { package_name: 'com.android.bookmarkprovider', app_name: 'Bookmark Provider', app_path: '/system/app/BookmarkProvider/BookmarkProvider.apk', partition: 'system', category: 'unknown', is_priv_app: false, is_split: false },
]

// Already nuked apps
let mockNukeList: NukeEntry[] = [
  { package_name: 'com.facebook.katana', app_path: '/system/app/Facebook/Facebook.apk' },
  { package_name: 'com.facebook.orca', app_path: '/system/app/Messenger/Messenger.apk' },
  { package_name: 'com.facebook.services', app_path: '/system/app/FacebookServices/FacebookServices.apk' },
  { package_name: 'com.facebook.system', app_path: '/system/app/FacebookSystem/FacebookSystem.apk' },
  { package_name: 'com.miui.analytics', app_path: '/product/app/Analytics/Analytics.apk' },
  { package_name: 'com.miui.daemon', app_path: '/system/app/MiuiDaemon/MiuiDaemon.apk' },
  { package_name: 'com.miui.yellowpage', app_path: '/product/app/YellowPages/YellowPages.apk' },
  { package_name: 'com.netflix.mediaclient', app_path: '/system/app/Netflix/Netflix.apk' },
  { package_name: 'com.tiktok.market', app_path: '/system/app/TikTok/TikTok.apk' },
  { package_name: 'com.linkedin.android', app_path: '/product/app/LinkedIn/LinkedIn.apk' },
  { package_name: 'com.amazon.appmanager', app_path: '/system/app/Amazon/Amazon.apk' },
  { package_name: 'com.samsung.android.app.tips', app_path: '/system/app/Tips/Tips.apk' },
]

let mockStatus: StatusJson = {
  mode: 'whiteout',
  debloated: 12,
  debloat_failed: 0,
  systemized: 2,
  partial: false,
  last_nuke: '2026-02-01T10:30:45+00:00',
  timestamp: 1738405845,
  debloat_verified: 12,
  debloat_broken: 0,
  systemize_verified: 2,
  systemize_broken: 0,
  last_verify: '2026-02-01T10:31:02+00:00',
  monitor_repairs: 3,
  last_monitor: '2026-02-01T14:15:00+00:00',
}

const mockConfig: ConfigState = {
  SCALPEL_VERSION: '0.1.0',
  SCALPEL_MODE_OVERRIDE: '',
  SCALPEL_LOG_LEVEL: 'info',
  SCALPEL_REFRESH_APPLIST: 'false',
  SCALPEL_DISABLE_ONLY: 'false',
  SCALPEL_MONITOR_INTERVAL: '300',
}

const mockCategories: CategoriesJson = {
  categories: [
    { id: 'essential', name: 'Essential', description: 'Critical system components. Removing these WILL cause bootloops, crashes, or device brick. DO NOT REMOVE.', color: '#ff6b6b' },
    { id: 'caution', name: 'Caution', description: 'May affect device functionality. Remove only if you understand the consequences.', color: '#ff9800' },
    { id: 'safe', name: 'Safe to Remove', description: 'Non-essential apps that can be safely removed without affecting system stability.', color: '#4caf50' },
    { id: 'google', name: 'Google Services', description: 'Google ecosystem apps. Removing breaks Google-dependent features.', color: '#4285f4' },
    { id: 'unknown', name: 'Unknown', description: 'Unclassified apps. Research before removing.', color: '#9e9e9e' },
  ],
  apps: Object.fromEntries(MOCK_APPS.map(a => [a.package_name, a.category])),
}

let mockSystemizeList: SystemizeEntry[] = [
  { app_name: 'Termux', package_name: 'com.termux', original_path: '/data/app/~~abc/com.termux-123/base.apk', system_path: '/data/adb/modules/scalpel/system/priv-app/Termux/base.apk', promoted_date: '2026-01-30' },
  { app_name: 'KernelSU', package_name: 'me.weishu.kernelsu', original_path: '/data/app/~~def/me.weishu.kernelsu-456/base.apk', system_path: '/data/adb/modules/scalpel/system/priv-app/KernelSU/base.apk', promoted_date: '2026-01-29' },
  { app_name: 'AdAway', package_name: 'org.adaway', original_path: '/data/app/~~ghi/org.adaway-789/base.apk', system_path: '/data/adb/modules/scalpel/system/priv-app/AdAway/base.apk', promoted_date: '2026-02-01' },
]

const MOCK_USER_APPS: UserApp[] = [
  { package_name: 'com.termux', app_name: 'Termux', version: '0.118.0', status: 'promoted' },
  { package_name: 'me.weishu.kernelsu', app_name: 'KernelSU', version: '0.9.5', status: 'promoted' },
  { package_name: 'org.adaway', app_name: 'AdAway', version: '6.1.3', status: 'promoted' },
  { package_name: 'org.mozilla.firefox', app_name: 'Firefox', version: '124.0', status: 'user' },
  { package_name: 'org.telegram.messenger', app_name: 'Telegram', version: '10.8.1', status: 'user' },
  { package_name: 'com.whatsapp', app_name: 'WhatsApp', version: '2.24.5.12', status: 'user' },
  { package_name: 'com.discord', app_name: 'Discord', version: '216.18', status: 'user' },
  { package_name: 'tv.twitch.android.app', app_name: 'Twitch', version: '16.5.0', status: 'user' },
  { package_name: 'com.github.android', app_name: 'GitHub', version: '1.156.0', status: 'user' },
  { package_name: 'com.brave.browser', app_name: 'Brave Browser', version: '1.63.162', status: 'user' },
  { package_name: 'org.videolan.vlc', app_name: 'VLC', version: '3.6.0', status: 'user' },
  { package_name: 'com.foobar2000.foobar2000', app_name: 'foobar2000', version: '1.5.12', status: 'user' },
]

const MOCK_LOG = `[2026-02-01 10:29:55] [INFO] [post-fs-data] scalpel starting
[2026-02-01 10:29:55] [INFO] [bootloop] boot count: 0/3
[2026-02-01 10:29:55] [DEBUG] [bootloop] incremented counter to 1
[2026-02-01 10:29:56] [INFO] [detect] probing modes...
[2026-02-01 10:29:56] [DEBUG] [detect] zeromount: /dev/zeromount not found
[2026-02-01 10:29:56] [DEBUG] [detect] mountify: busybox found, tmpfs OK
[2026-02-01 10:29:56] [DEBUG] [detect] symlink: overlayfs in /proc/filesystems
[2026-02-01 10:29:56] [DEBUG] [detect] whiteout: overlayfs+busybox+mknod+setfattr OK
[2026-02-01 10:29:56] [INFO] [detect] mode=whiteout (auto-detected, rank 4/6)
[2026-02-01 10:29:56] [INFO] [nuke] starting debloat run
[2026-02-01 10:29:56] [INFO] [nuke] mode=whiteout apps=12
[2026-02-01 10:29:57] [DEBUG] [nuke] debloated: com.facebook.katana
[2026-02-01 10:29:57] [DEBUG] [nuke] debloated: com.facebook.orca
[2026-02-01 10:29:57] [DEBUG] [nuke] debloated: com.facebook.services
[2026-02-01 10:29:57] [DEBUG] [nuke] debloated: com.facebook.system
[2026-02-01 10:29:57] [DEBUG] [nuke] debloated: com.miui.analytics
[2026-02-01 10:29:58] [DEBUG] [nuke] debloated: com.miui.daemon
[2026-02-01 10:29:58] [DEBUG] [nuke] debloated: com.miui.yellowpage
[2026-02-01 10:29:58] [DEBUG] [nuke] debloated: com.netflix.mediaclient
[2026-02-01 10:29:58] [DEBUG] [nuke] debloated: com.tiktok.market
[2026-02-01 10:29:58] [DEBUG] [nuke] debloated: com.linkedin.android
[2026-02-01 10:29:59] [DEBUG] [nuke] debloated: com.amazon.appmanager
[2026-02-01 10:29:59] [DEBUG] [nuke] debloated: com.samsung.android.app.tips
[2026-02-01 10:29:59] [INFO] [nuke] complete: mode=whiteout success=12 failed=0
[2026-02-01 10:30:45] [INFO] [service] boot_completed, starting post-boot
[2026-02-01 10:30:45] [INFO] [bootloop] reset counter to 0
[2026-02-01 10:30:46] [INFO] [verify] starting post-boot verification
[2026-02-01 10:30:47] [DEBUG] [verify] checking com.facebook.katana: hidden=true
[2026-02-01 10:30:47] [DEBUG] [verify] checking com.facebook.orca: hidden=true
[2026-02-01 10:30:48] [DEBUG] [verify] checking com.miui.analytics: hidden=true
[2026-02-01 10:30:48] [INFO] [verify] complete: verified=12 broken=0
[2026-02-01 10:30:49] [INFO] [monitor] starting daemon (pid=4821, interval=300s)
[2026-02-01 10:35:49] [DEBUG] [monitor] cycle: all 12 debloats holding
[2026-02-01 10:40:49] [DEBUG] [monitor] cycle: all 12 debloats holding
[2026-02-01 10:45:49] [DEBUG] [monitor] cycle: all 12 debloats holding
[2026-02-01 10:50:49] [WARN] [monitor] com.miui.analytics respawned, repairing...
[2026-02-01 10:50:49] [INFO] [monitor] repaired com.miui.analytics via whiteout
[2026-02-01 10:55:49] [DEBUG] [monitor] cycle: all 12 debloats holding
[2026-02-01 11:00:49] [DEBUG] [monitor] cycle: all 12 debloats holding
[2026-02-01 11:05:00] [WARN] [monitor] com.facebook.katana respawned, repairing...
[2026-02-01 11:05:00] [INFO] [monitor] repaired com.facebook.katana via whiteout
[2026-02-01 11:10:00] [DEBUG] [monitor] cycle: all 12 debloats holding
[2026-02-01 14:15:00] [WARN] [monitor] com.netflix.mediaclient respawned, repairing...
[2026-02-01 14:15:00] [INFO] [monitor] repaired com.netflix.mediaclient via whiteout
[2026-02-01 14:20:00] [DEBUG] [monitor] cycle: all 12 debloats holding
[2026-02-01 14:25:00] [DEBUG] [monitor] cycle: all 12 debloats holding
[2026-02-01 14:30:00] [DEBUG] [monitor] cycle: all 12 debloats holding`

const MOCK_MODULE_PROP = `id=scalpel
name=Scalpel
version=v0.1.0
versionCode=1
author=Jeremy Wealth
description=Clinical debloater + systemizer with multi-mode auto-detection`

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function isNuked(pkg: string): boolean {
  return mockNukeList.some(e => e.package_name === pkg)
}

export function getAppList(): AppEntry[] {
  return [...MOCK_APPS]
}

export function getNukeList(): NukeEntry[] {
  return [...mockNukeList]
}

export function getStatus(): StatusJson {
  return { ...mockStatus }
}

export function getConfig(): ConfigState {
  return { ...mockConfig }
}

export function getCategories(): CategoriesJson {
  return JSON.parse(JSON.stringify(mockCategories))
}

export function getSystemizeList(): SystemizeEntry[] {
  return [...mockSystemizeList]
}

export function getUserApps(): UserApp[] {
  return MOCK_USER_APPS.map(a => ({
    ...a,
    status: mockSystemizeList.some(s => s.package_name === a.package_name) ? 'promoted' as const : a.status,
  }))
}

export function getDebugLog(): string {
  return MOCK_LOG
}

export function getModuleProp(): string {
  return MOCK_MODULE_PROP
}

export function getBootCount(): number {
  return 0
}

export function getMonitorStatus(): 'running' | 'stopped' {
  return 'running'
}

export async function nukeApps(entries: NukeEntry[]): Promise<{ success: boolean; count: number }> {
  await delay(800)
  for (const e of entries) {
    if (!mockNukeList.some(n => n.package_name === e.package_name)) {
      mockNukeList.push(e)
    }
  }
  mockStatus.debloated = mockNukeList.length
  mockStatus.debloat_verified = mockNukeList.length
  mockStatus.last_nuke = new Date().toISOString()
  return { success: true, count: entries.length }
}

export async function restoreApps(packageNames: string[]): Promise<{ success: boolean; count: number }> {
  await delay(500)
  mockNukeList = mockNukeList.filter(e => !packageNames.includes(e.package_name))
  mockStatus.debloated = mockNukeList.length
  mockStatus.debloat_verified = mockNukeList.length
  return { success: true, count: packageNames.length }
}

export async function promoteApp(pkg: string): Promise<boolean> {
  await delay(600)
  const userApp = MOCK_USER_APPS.find(a => a.package_name === pkg)
  if (!userApp) return false
  mockSystemizeList.push({
    app_name: userApp.app_name,
    package_name: pkg,
    original_path: `/data/app/~~mock/${pkg}/base.apk`,
    system_path: `/data/adb/modules/scalpel/system/priv-app/${userApp.app_name}/base.apk`,
    promoted_date: new Date().toISOString().split('T')[0],
  })
  mockStatus.systemized = mockSystemizeList.length
  return true
}

export async function demoteApp(pkg: string): Promise<boolean> {
  await delay(400)
  mockSystemizeList = mockSystemizeList.filter(e => e.package_name !== pkg)
  mockStatus.systemized = mockSystemizeList.length
  return true
}

export async function setConfig(key: string, value: string): Promise<boolean> {
  await delay(100)
  if (key in mockConfig) {
    (mockConfig as Record<string, string>)[key] = value
    return true
  }
  return false
}

export async function refreshScan(): Promise<boolean> {
  await delay(3000)
  return true
}

export { isNuked }
