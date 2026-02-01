import type {
  AppEntry, NukeEntry, StatusJson, CategoriesJson,
  SystemizeEntry, ConfigValues, UserApp
} from './types.ts';

const MOCK_APPS: AppEntry[] = [
  { package_name: "com.facebook.katana", app_name: "Facebook", app_path: "/system/app/Facebook/Facebook.apk", partition: "system", category: "safe", is_priv_app: false, is_split: true },
  { package_name: "com.facebook.orca", app_name: "Messenger", app_path: "/system/app/Messenger/Messenger.apk", partition: "system", category: "safe", is_priv_app: false, is_split: true },
  { package_name: "com.facebook.services", app_name: "Facebook Services", app_path: "/system/app/FacebookServices/FacebookServices.apk", partition: "system", category: "safe", is_priv_app: false, is_split: false },
  { package_name: "com.instagram.android", app_name: "Instagram", app_path: "/system/app/Instagram/Instagram.apk", partition: "system", category: "safe", is_priv_app: false, is_split: true },
  { package_name: "com.samsung.android.bixby.agent", app_name: "Bixby Voice", app_path: "/system/priv-app/Bixby/Bixby.apk", partition: "system", category: "safe", is_priv_app: true, is_split: false },
  { package_name: "com.samsung.android.bixby.service", app_name: "Bixby Routines", app_path: "/system/priv-app/BixbyService/BixbyService.apk", partition: "system", category: "safe", is_priv_app: true, is_split: false },
  { package_name: "com.samsung.android.game.gamehome", app_name: "Game Launcher", app_path: "/system/priv-app/GameHome/GameHome.apk", partition: "system", category: "safe", is_priv_app: true, is_split: false },
  { package_name: "com.samsung.android.app.tips", app_name: "Samsung Tips", app_path: "/system/app/Tips/Tips.apk", partition: "system", category: "safe", is_priv_app: false, is_split: false },
  { package_name: "com.samsung.android.themestore", app_name: "Galaxy Themes", app_path: "/system/app/ThemeStore/ThemeStore.apk", partition: "system", category: "safe", is_priv_app: false, is_split: false },
  { package_name: "com.samsung.android.arzone", app_name: "AR Zone", app_path: "/system/app/ARZone/ARZone.apk", partition: "system", category: "safe", is_priv_app: false, is_split: false },
  { package_name: "com.google.android.gms", app_name: "Google Play Services", app_path: "/system/priv-app/GmsCore/GmsCore.apk", partition: "system", category: "google", is_priv_app: true, is_split: true },
  { package_name: "com.google.android.gsf", app_name: "Google Services Framework", app_path: "/system/priv-app/GoogleServicesFramework/GoogleServicesFramework.apk", partition: "system", category: "google", is_priv_app: true, is_split: false },
  { package_name: "com.google.android.apps.maps", app_name: "Google Maps", app_path: "/system/app/Maps/Maps.apk", partition: "system", category: "google", is_priv_app: false, is_split: true },
  { package_name: "com.google.android.youtube", app_name: "YouTube", app_path: "/system/app/YouTube/YouTube.apk", partition: "system", category: "google", is_priv_app: false, is_split: true },
  { package_name: "com.google.android.apps.docs", app_name: "Google Drive", app_path: "/system/app/Drive/Drive.apk", partition: "system", category: "google", is_priv_app: false, is_split: true },
  { package_name: "com.google.android.apps.photos", app_name: "Google Photos", app_path: "/system/app/Photos/Photos.apk", partition: "system", category: "google", is_priv_app: false, is_split: true },
  { package_name: "com.google.android.gm", app_name: "Gmail", app_path: "/system/app/Gmail2/Gmail2.apk", partition: "system", category: "google", is_priv_app: false, is_split: true },
  { package_name: "com.google.android.tts", app_name: "Google TTS", app_path: "/system/app/GoogleTTS/GoogleTTS.apk", partition: "system", category: "google", is_priv_app: false, is_split: false },
  { package_name: "com.android.systemui", app_name: "System UI", app_path: "/system/priv-app/SystemUI/SystemUI.apk", partition: "system", category: "essential", is_priv_app: true, is_split: false },
  { package_name: "com.android.settings", app_name: "Settings", app_path: "/system/priv-app/Settings/Settings.apk", partition: "system", category: "essential", is_priv_app: true, is_split: false },
  { package_name: "com.android.phone", app_name: "Phone", app_path: "/system/priv-app/TeleService/TeleService.apk", partition: "system", category: "essential", is_priv_app: true, is_split: false },
  { package_name: "com.android.launcher3", app_name: "Launcher", app_path: "/system/priv-app/Launcher3/Launcher3.apk", partition: "system", category: "essential", is_priv_app: true, is_split: false },
  { package_name: "com.android.providers.contacts", app_name: "Contacts Storage", app_path: "/system/priv-app/ContactsProvider/ContactsProvider.apk", partition: "system", category: "essential", is_priv_app: true, is_split: false },
  { package_name: "com.android.bluetooth", app_name: "Bluetooth", app_path: "/system/priv-app/Bluetooth/Bluetooth.apk", partition: "system", category: "caution", is_priv_app: true, is_split: false },
  { package_name: "com.android.nfc", app_name: "NFC Service", app_path: "/system/priv-app/NfcNci/NfcNci.apk", partition: "system", category: "caution", is_priv_app: true, is_split: false },
  { package_name: "com.android.printspooler", app_name: "Print Spooler", app_path: "/system/priv-app/PrintSpooler/PrintSpooler.apk", partition: "system", category: "caution", is_priv_app: true, is_split: false },
  { package_name: "com.qualcomm.qti.cne", app_name: "CNE Service", app_path: "/vendor/app/CneApp/CneApp.apk", partition: "vendor", category: "unknown", is_priv_app: false, is_split: false },
  { package_name: "com.qualcomm.qti.ims", app_name: "IMS Service", app_path: "/vendor/app/ims/ims.apk", partition: "vendor", category: "unknown", is_priv_app: false, is_split: false },
  { package_name: "com.miui.analytics", app_name: "Analytics", app_path: "/product/app/Analytics/Analytics.apk", partition: "product", category: "safe", is_priv_app: false, is_split: false },
  { package_name: "com.miui.msa.global", app_name: "MSA", app_path: "/product/app/MSA/MSA.apk", partition: "product", category: "safe", is_priv_app: false, is_split: false },
  { package_name: "com.verizon.messaging.vzmsgs", app_name: "Verizon Messages", app_path: "/product/app/VZMessages/VZMessages.apk", partition: "product", category: "safe", is_priv_app: false, is_split: false },
  { package_name: "com.sprint.ce.updater", app_name: "Sprint Updater", app_path: "/product/app/SprintUpdater/SprintUpdater.apk", partition: "product", category: "safe", is_priv_app: false, is_split: false },
  { package_name: "com.android.chrome", app_name: "Chrome", app_path: "/system/app/Chrome/Chrome.apk", partition: "system", category: "google", is_priv_app: false, is_split: true },
  { package_name: "com.google.android.calendar", app_name: "Google Calendar", app_path: "/system/app/CalendarGoogle/CalendarGoogle.apk", partition: "system", category: "google", is_priv_app: false, is_split: false },
];

let nukeList: NukeEntry[] = [
  { package_name: "com.facebook.katana", app_path: "/system/app/Facebook/Facebook.apk" },
  { package_name: "com.samsung.android.bixby.agent", app_path: "/system/priv-app/Bixby/Bixby.apk" },
  { package_name: "com.samsung.android.bixby.service", app_path: "/system/priv-app/BixbyService/BixbyService.apk" },
  { package_name: "com.miui.analytics", app_path: "/product/app/Analytics/Analytics.apk" },
];

let status: StatusJson = {
  mode: "whiteout",
  debloated: 4,
  debloat_failed: 0,
  systemized: 1,
  partial: false,
  last_nuke: "2026-02-01T10:30:45+00:00",
  timestamp: 1738405845,
  debloat_verified: 4,
  debloat_broken: 0,
  systemize_verified: 1,
  systemize_broken: 0,
  last_verify: "2026-02-01T10:31:02+00:00",
  monitor_repairs: 2,
  last_monitor: "2026-02-01T11:05:00+00:00",
};

const categories: CategoriesJson = {
  categories: [
    { id: "essential", name: "Essential", description: "Critical system components. Removing these WILL cause bootloops, crashes, or device brick. DO NOT REMOVE.", color: "#ff6b6b" },
    { id: "caution", name: "Caution", description: "May affect device functionality. Remove only if you understand the consequences.", color: "#ff9800" },
    { id: "safe", name: "Safe to Remove", description: "Non-essential apps that can be safely removed without affecting system stability.", color: "#4caf50" },
    { id: "google", name: "Google Services", description: "Google ecosystem apps. Removing breaks Google-dependent features.", color: "#4285f4" },
    { id: "unknown", name: "Unknown", description: "Unclassified apps. Research before removing.", color: "#9e9e9e" },
  ],
  apps: {
    "com.android.systemui": "essential",
    "com.android.settings": "essential",
    "com.android.phone": "essential",
    "com.android.launcher3": "essential",
    "com.android.providers.contacts": "essential",
    "com.android.bluetooth": "caution",
    "com.android.nfc": "caution",
    "com.android.printspooler": "caution",
    "com.facebook.katana": "safe",
    "com.facebook.orca": "safe",
    "com.facebook.services": "safe",
    "com.instagram.android": "safe",
    "com.samsung.android.bixby.agent": "safe",
    "com.samsung.android.bixby.service": "safe",
    "com.samsung.android.game.gamehome": "safe",
    "com.samsung.android.app.tips": "safe",
    "com.samsung.android.themestore": "safe",
    "com.samsung.android.arzone": "safe",
    "com.miui.analytics": "safe",
    "com.miui.msa.global": "safe",
    "com.verizon.messaging.vzmsgs": "safe",
    "com.sprint.ce.updater": "safe",
    "com.google.android.gms": "google",
    "com.google.android.gsf": "google",
    "com.google.android.apps.maps": "google",
    "com.google.android.youtube": "google",
    "com.google.android.apps.docs": "google",
    "com.google.android.apps.photos": "google",
    "com.google.android.gm": "google",
    "com.google.android.tts": "google",
    "com.android.chrome": "google",
    "com.google.android.calendar": "google",
    "com.qualcomm.qti.cne": "unknown",
    "com.qualcomm.qti.ims": "unknown",
  }
};

let systemizeList: SystemizeEntry[] = [
  {
    app_name: "Termux",
    package_name: "com.termux",
    original_path: "/data/app/~~abc123/com.termux-def456/base.apk",
    system_path: "/data/adb/modules/scalpel/system/priv-app/Termux/base.apk",
    promoted_date: "2026-01-30",
  }
];

let config: ConfigValues = {
  SCALPEL_MODE_OVERRIDE: "",
  SCALPEL_LOG_LEVEL: "info",
  SCALPEL_REFRESH_APPLIST: "false",
  SCALPEL_DISABLE_ONLY: "false",
  SCALPEL_MONITOR_INTERVAL: "300",
};

const MOCK_USER_APPS: UserApp[] = [
  { package_name: "com.termux", app_name: "Termux", version: "0.118.0" },
  { package_name: "org.mozilla.firefox", app_name: "Firefox", version: "124.0" },
  { package_name: "org.telegram.messenger", app_name: "Telegram", version: "10.8.1" },
  { package_name: "com.spotify.music", app_name: "Spotify", version: "8.9.12" },
  { package_name: "com.reddit.frontpage", app_name: "Reddit", version: "2024.8.0" },
  { package_name: "com.discord", app_name: "Discord", version: "223.15" },
  { package_name: "com.brave.browser", app_name: "Brave Browser", version: "1.62.153" },
  { package_name: "com.nextcloud.client", app_name: "Nextcloud", version: "3.28.0" },
];

const LOG_LINES = [
  "[2026-02-01 10:29:55] [INFO] [post-fs-data] Scalpel v0.1.0 starting",
  "[2026-02-01 10:29:55] [INFO] [bootloop] boot count: 0/3",
  "[2026-02-01 10:29:56] [INFO] [detect] probing zeromount... not available",
  "[2026-02-01 10:29:56] [INFO] [detect] probing mountify... not available",
  "[2026-02-01 10:29:56] [INFO] [detect] probing symlink... not available",
  "[2026-02-01 10:29:56] [INFO] [detect] probing whiteout... success",
  "[2026-02-01 10:29:56] [INFO] [detect] mode=whiteout (auto-detected)",
  "[2026-02-01 10:30:00] [INFO] [nuke] starting debloat run",
  "[2026-02-01 10:30:00] [INFO] [nuke] mode=whiteout apps=4",
  "[2026-02-01 10:30:01] [DEBUG] [nuke] debloated: com.facebook.katana",
  "[2026-02-01 10:30:01] [DEBUG] [nuke] debloated: com.samsung.android.bixby.agent",
  "[2026-02-01 10:30:02] [DEBUG] [nuke] debloated: com.samsung.android.bixby.service",
  "[2026-02-01 10:30:02] [DEBUG] [nuke] debloated: com.miui.analytics",
  "[2026-02-01 10:30:03] [INFO] [nuke] complete: mode=whiteout success=4 failed=0",
  "[2026-02-01 10:30:45] [INFO] [post-fs-data] completed in 50s",
  "[2026-02-01 10:31:00] [INFO] [verify] starting post-boot verification",
  "[2026-02-01 10:31:01] [DEBUG] [verify] com.facebook.katana: holding",
  "[2026-02-01 10:31:01] [DEBUG] [verify] com.samsung.android.bixby.agent: holding",
  "[2026-02-01 10:31:01] [DEBUG] [verify] com.samsung.android.bixby.service: holding",
  "[2026-02-01 10:31:02] [DEBUG] [verify] com.miui.analytics: holding",
  "[2026-02-01 10:31:02] [INFO] [verify] complete: verified=4 broken=0",
  "[2026-02-01 10:31:03] [INFO] [monitor] daemon started (pid=1234)",
  "[2026-02-01 10:31:03] [INFO] [monitor] interval=300s",
  "[2026-02-01 10:36:03] [DEBUG] [monitor] cycle: all 4 debloats holding",
  "[2026-02-01 10:41:03] [DEBUG] [monitor] cycle: all 4 debloats holding",
  "[2026-02-01 10:46:03] [DEBUG] [monitor] cycle: all 4 debloats holding",
  "[2026-02-01 10:51:03] [WARN] [monitor] com.facebook.katana reappeared, repairing",
  "[2026-02-01 10:51:04] [INFO] [monitor] repaired com.facebook.katana via whiteout",
  "[2026-02-01 11:05:00] [WARN] [monitor] com.miui.analytics reappeared, repairing",
  "[2026-02-01 11:05:01] [INFO] [monitor] repaired com.miui.analytics via whiteout",
  "[2026-02-01 11:10:01] [DEBUG] [monitor] cycle: all 4 debloats holding",
];

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export const mockBridge = {
  getAppList(): AppEntry[] {
    return [...MOCK_APPS];
  },

  getNukeList(): NukeEntry[] {
    return [...nukeList];
  },

  getStatus(): StatusJson {
    return { ...status };
  },

  getCategories(): CategoriesJson {
    return categories;
  },

  getSystemizeList(): SystemizeEntry[] {
    return [...systemizeList];
  },

  getUserApps(): UserApp[] {
    return MOCK_USER_APPS.filter(
      app => !systemizeList.some(s => s.package_name === app.package_name)
    );
  },

  getConfig(): ConfigValues {
    return { ...config };
  },

  getLog(): string {
    return LOG_LINES.join('\n');
  },

  getBootCount(): number {
    return 0;
  },

  getMonitorStatus(): 'running' | 'stopped' {
    return 'running';
  },

  async nukeApp(pkg: string, appPath: string): Promise<boolean> {
    await delay(600);
    if (nukeList.some(e => e.package_name === pkg)) return true;
    nukeList.push({ package_name: pkg, app_path: appPath });
    status.debloated = nukeList.length;
    status.debloat_verified = nukeList.length;
    status.last_nuke = new Date().toISOString();
    status.timestamp = Math.floor(Date.now() / 1000);
    return true;
  },

  async restoreApp(pkg: string): Promise<boolean> {
    await delay(400);
    nukeList = nukeList.filter(e => e.package_name !== pkg);
    status.debloated = nukeList.length;
    status.debloat_verified = nukeList.length;
    status.last_nuke = new Date().toISOString();
    status.timestamp = Math.floor(Date.now() / 1000);
    return true;
  },

  async promoteApp(pkg: string): Promise<boolean> {
    await delay(800);
    const userApp = MOCK_USER_APPS.find(a => a.package_name === pkg);
    if (!userApp) return false;
    systemizeList.push({
      app_name: userApp.app_name,
      package_name: pkg,
      original_path: `/data/app/~~rand/${pkg}-rand/base.apk`,
      system_path: `/data/adb/modules/scalpel/system/priv-app/${userApp.app_name}/base.apk`,
      promoted_date: new Date().toISOString().split('T')[0],
    });
    status.systemized = systemizeList.length;
    return true;
  },

  async demoteApp(pkg: string): Promise<boolean> {
    await delay(400);
    systemizeList = systemizeList.filter(e => e.package_name !== pkg);
    status.systemized = systemizeList.length;
    return true;
  },

  async setConfig(key: keyof ConfigValues, value: string): Promise<boolean> {
    await delay(100);
    config[key] = value;
    return true;
  },

  async refreshScan(): Promise<AppEntry[]> {
    await delay(3000);
    return [...MOCK_APPS];
  },

  async reboot(): Promise<void> {
    await delay(200);
  },
};
