import type {
  AppEntry, NukeEntry, StatusJson, SystemizeEntry,
  ConfigValues, ModuleProp, CategoriesJson, LogEntry
} from './types';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const mockAppList: AppEntry[] = [
  { package_name: 'com.android.systemui', app_name: 'System UI', app_path: '/system/priv-app/SystemUI/SystemUI.apk', partition: 'system', category: 'essential', is_priv_app: true, is_split: false },
  { package_name: 'com.android.settings', app_name: 'Settings', app_path: '/system/priv-app/Settings/Settings.apk', partition: 'system', category: 'essential', is_priv_app: true, is_split: true },
  { package_name: 'com.android.phone', app_name: 'Phone', app_path: '/system/priv-app/TeleService/TeleService.apk', partition: 'system', category: 'essential', is_priv_app: true, is_split: false },
  { package_name: 'com.android.launcher3', app_name: 'Launcher', app_path: '/system/priv-app/Launcher3/Launcher3.apk', partition: 'system', category: 'essential', is_priv_app: true, is_split: false },
  { package_name: 'com.android.providers.contacts', app_name: 'Contacts Storage', app_path: '/system/priv-app/ContactsProvider/ContactsProvider.apk', partition: 'system', category: 'essential', is_priv_app: true, is_split: false },
  { package_name: 'com.android.bluetooth', app_name: 'Bluetooth', app_path: '/system/app/Bluetooth/Bluetooth.apk', partition: 'system', category: 'caution', is_priv_app: false, is_split: true },
  { package_name: 'com.android.nfc', app_name: 'NFC Service', app_path: '/system/app/NfcNci/NfcNci.apk', partition: 'system', category: 'caution', is_priv_app: false, is_split: false },
  { package_name: 'com.android.printspooler', app_name: 'Print Spooler', app_path: '/system/app/PrintSpooler/PrintSpooler.apk', partition: 'system', category: 'caution', is_priv_app: false, is_split: false },
  { package_name: 'com.android.wallpaper.livepicker', app_name: 'Live Wallpaper Picker', app_path: '/system/app/LiveWallpapersPicker/LiveWallpapersPicker.apk', partition: 'system', category: 'caution', is_priv_app: false, is_split: false },
  { package_name: 'com.facebook.katana', app_name: 'Facebook', app_path: '/system/app/Facebook/Facebook.apk', partition: 'system', category: 'safe', is_priv_app: false, is_split: true },
  { package_name: 'com.facebook.orca', app_name: 'Messenger', app_path: '/system/app/Messenger/Messenger.apk', partition: 'system', category: 'safe', is_priv_app: false, is_split: true },
  { package_name: 'com.facebook.services', app_name: 'Facebook Services', app_path: '/system/app/FacebookServices/FacebookServices.apk', partition: 'system', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.netflix.mediaclient', app_name: 'Netflix', app_path: '/system/app/Netflix/Netflix.apk', partition: 'system', category: 'safe', is_priv_app: false, is_split: true },
  { package_name: 'com.spotify.music', app_name: 'Spotify', app_path: '/product/app/Spotify/Spotify.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: true },
  { package_name: 'com.amazon.mShop.android', app_name: 'Amazon Shopping', app_path: '/product/app/Amazon/Amazon.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.miui.analytics', app_name: 'Analytics', app_path: '/product/app/Analytics/Analytics.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.miui.weather2', app_name: 'Weather', app_path: '/product/app/Weather/Weather.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.miui.player', app_name: 'Mi Music', app_path: '/product/app/MiMusic/MiMusic.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.miui.videoplayer', app_name: 'Mi Video', app_path: '/product/app/MiVideo/MiVideo.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.miui.gallery', app_name: 'Gallery', app_path: '/product/app/MiGallery/MiGallery.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: true },
  { package_name: 'com.miui.compass', app_name: 'Compass', app_path: '/product/app/Compass/Compass.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.miui.calculator', app_name: 'Calculator', app_path: '/product/app/Calculator/Calculator.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.miui.notes', app_name: 'Notes', app_path: '/product/app/Notes/Notes.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.miui.screenrecorder', app_name: 'Screen Recorder', app_path: '/product/app/ScreenRecorder/ScreenRecorder.apk', partition: 'product', category: 'safe', is_priv_app: false, is_split: false },
  { package_name: 'com.google.android.gms', app_name: 'Google Play Services', app_path: '/system/priv-app/PrebuiltGmsCore/PrebuiltGmsCore.apk', partition: 'system', category: 'google', is_priv_app: true, is_split: true },
  { package_name: 'com.google.android.gsf', app_name: 'Google Services Framework', app_path: '/system/priv-app/GoogleServicesFramework/GoogleServicesFramework.apk', partition: 'system', category: 'google', is_priv_app: true, is_split: false },
  { package_name: 'com.android.vending', app_name: 'Play Store', app_path: '/system/priv-app/Phonesky/Phonesky.apk', partition: 'system', category: 'google', is_priv_app: true, is_split: true },
  { package_name: 'com.google.android.youtube', app_name: 'YouTube', app_path: '/system/app/YouTube/YouTube.apk', partition: 'system', category: 'google', is_priv_app: false, is_split: true },
  { package_name: 'com.google.android.apps.maps', app_name: 'Google Maps', app_path: '/system/app/Maps/Maps.apk', partition: 'system', category: 'google', is_priv_app: false, is_split: true },
  { package_name: 'com.google.android.gm', app_name: 'Gmail', app_path: '/system/app/Gmail2/Gmail2.apk', partition: 'system', category: 'google', is_priv_app: false, is_split: true },
  { package_name: 'com.google.android.apps.photos', app_name: 'Google Photos', app_path: '/system/app/Photos/Photos.apk', partition: 'system', category: 'google', is_priv_app: false, is_split: true },
  { package_name: 'com.google.android.calendar', app_name: 'Google Calendar', app_path: '/system/app/CalendarGoogle/CalendarGoogle.apk', partition: 'system', category: 'google', is_priv_app: false, is_split: false },
  { package_name: 'com.google.android.tts', app_name: 'Google TTS', app_path: '/system/app/GoogleTTS/GoogleTTS.apk', partition: 'system', category: 'google', is_priv_app: false, is_split: false },
  { package_name: 'com.samsung.android.bixby.agent', app_name: 'Bixby Voice', app_path: '/vendor/app/BixbyAgent/BixbyAgent.apk', partition: 'vendor', category: 'unknown', is_priv_app: false, is_split: false },
  { package_name: 'com.sec.android.app.dexonpc', app_name: 'Samsung DeX', app_path: '/vendor/app/DexOnPC/DexOnPC.apk', partition: 'vendor', category: 'unknown', is_priv_app: false, is_split: false },
  { package_name: 'com.samsung.android.game.gamehome', app_name: 'Game Launcher', app_path: '/system/app/GameHome/GameHome.apk', partition: 'system', category: 'unknown', is_priv_app: false, is_split: false },
  { package_name: 'com.sec.android.app.popupcalculator', app_name: 'Popup Calculator', app_path: '/system_ext/app/PopupCalc/PopupCalc.apk', partition: 'system_ext', category: 'unknown', is_priv_app: false, is_split: false },
  { package_name: 'com.sec.android.daemonapp', app_name: 'Weather Widget', app_path: '/system/app/WeatherWidget/WeatherWidget.apk', partition: 'system', category: 'unknown', is_priv_app: false, is_split: false },
];

let mockNukeList: NukeEntry[] = [
  { package_name: 'com.facebook.katana', app_path: '/system/app/Facebook/Facebook.apk' },
  { package_name: 'com.facebook.orca', app_path: '/system/app/Messenger/Messenger.apk' },
  { package_name: 'com.facebook.services', app_path: '/system/app/FacebookServices/FacebookServices.apk' },
  { package_name: 'com.miui.analytics', app_path: '/product/app/Analytics/Analytics.apk' },
  { package_name: 'com.miui.player', app_path: '/product/app/MiMusic/MiMusic.apk' },
  { package_name: 'com.miui.videoplayer', app_path: '/product/app/MiVideo/MiVideo.apk' },
];

const mockStatus: StatusJson = {
  mode: 'whiteout',
  debloated: 6,
  debloat_failed: 0,
  systemized: 1,
  partial: false,
  last_nuke: '2026-02-01T10:30:45+00:00',
  timestamp: Math.floor(Date.now() / 1000),
  debloat_verified: 6,
  debloat_broken: 0,
  systemize_verified: 1,
  systemize_broken: 0,
  last_verify: '2026-02-01T10:31:02+00:00',
  monitor_repairs: 2,
  last_monitor: '2026-02-01T11:05:00+00:00',
};

let mockSystemizeList: SystemizeEntry[] = [
  {
    app_name: 'Termux',
    package_name: 'com.termux',
    original_path: '/data/app/~~abc123/com.termux-def456/base.apk',
    system_path: '/data/adb/modules/scalpel/system/priv-app/Termux/base.apk',
    promoted_date: '2026-01-30',
  },
];

const mockConfig: ConfigValues = {
  SCALPEL_MODE_OVERRIDE: '',
  SCALPEL_LOG_LEVEL: 'info',
  SCALPEL_REFRESH_APPLIST: 'false',
  SCALPEL_DISABLE_ONLY: 'false',
  SCALPEL_MONITOR_INTERVAL: '300',
};

const mockModuleProp: ModuleProp = {
  id: 'scalpel',
  name: 'Scalpel',
  version: 'v0.1.0',
  versionCode: '1',
  author: 'Jeremy Wealth',
  description: 'Clinical debloater + systemizer with multi-mode auto-detection',
};

const mockCategories: CategoriesJson = {
  categories: [
    { id: 'essential', name: 'Essential', description: 'Critical system components. Removing these WILL cause bootloops or crashes.', color: '#ff6b6b', emoji: '\u{1F6E1}' },
    { id: 'caution', name: 'Caution', description: 'May affect device functionality. Remove only if you understand the impact.', color: '#ff9800', emoji: '\u26A0\uFE0F' },
    { id: 'safe', name: 'Safe to Remove', description: 'Non-essential apps that can be safely removed without affecting stability.', color: '#10B981', emoji: '\u2705' },
    { id: 'google', name: 'Google Services', description: 'Google ecosystem apps. Removing breaks Google-dependent features.', color: '#4285f4', emoji: '\u{1F310}' },
    { id: 'unknown', name: 'Unknown', description: 'Unclassified apps. Research before removing.', color: '#9e9e9e', emoji: '\u2753' },
  ],
  apps: {},
};
for (const app of mockAppList) {
  mockCategories.apps[app.package_name] = app.category;
}

const mockLogLines: string[] = [
  '[2026-02-01 10:29:55] [INFO] [bootloop] boot count: 0, threshold: 3',
  '[2026-02-01 10:29:55] [INFO] [bootloop] increment to 1',
  '[2026-02-01 10:29:56] [INFO] [detect] probing zeromount... not available',
  '[2026-02-01 10:29:56] [INFO] [detect] probing mountify... not available',
  '[2026-02-01 10:29:56] [INFO] [detect] probing symlink... not available',
  '[2026-02-01 10:29:56] [INFO] [detect] probing whiteout... OK',
  '[2026-02-01 10:29:56] [INFO] [detect] mode=whiteout (auto-detected)',
  '[2026-02-01 10:30:00] [INFO] [nuke] starting debloat run',
  '[2026-02-01 10:30:01] [INFO] [nuke] mode=whiteout apps=6',
  '[2026-02-01 10:30:01] [DEBUG] [nuke] debloating: com.facebook.katana',
  '[2026-02-01 10:30:02] [DEBUG] [nuke] debloating: com.facebook.orca',
  '[2026-02-01 10:30:02] [DEBUG] [nuke] debloating: com.facebook.services',
  '[2026-02-01 10:30:03] [DEBUG] [nuke] debloating: com.miui.analytics',
  '[2026-02-01 10:30:03] [DEBUG] [nuke] debloating: com.miui.player',
  '[2026-02-01 10:30:04] [DEBUG] [nuke] debloating: com.miui.videoplayer',
  '[2026-02-01 10:30:05] [INFO] [nuke] complete: mode=whiteout success=6 failed=0',
  '[2026-02-01 10:31:00] [INFO] [verify] starting post-boot verification',
  '[2026-02-01 10:31:01] [INFO] [verify] checking 6 debloated apps',
  '[2026-02-01 10:31:02] [INFO] [verify] complete: verified=6 broken=0',
  '[2026-02-01 10:31:03] [INFO] [bootloop] reset boot count to 0',
  '[2026-02-01 10:31:04] [INFO] [monitor] starting daemon, interval=300s',
  '[2026-02-01 10:36:04] [DEBUG] [monitor] cycle 1: all 6 debloats holding',
  '[2026-02-01 10:41:04] [DEBUG] [monitor] cycle 2: all 6 debloats holding',
  '[2026-02-01 10:46:04] [WARN] [monitor] com.facebook.katana reappeared, repairing',
  '[2026-02-01 10:46:05] [INFO] [monitor] repaired 1 broken debloat',
  '[2026-02-01 10:51:05] [DEBUG] [monitor] cycle 4: all 6 debloats holding',
  '[2026-02-01 10:56:05] [DEBUG] [monitor] cycle 5: all 6 debloats holding',
  '[2026-02-01 11:01:05] [DEBUG] [monitor] cycle 6: all 6 debloats holding',
  '[2026-02-01 11:04:55] [WARN] [monitor] com.miui.analytics reappeared, repairing',
  '[2026-02-01 11:05:00] [INFO] [monitor] repaired 1 broken debloat',
  '[2026-02-01 11:10:00] [DEBUG] [monitor] cycle 8: all 6 debloats holding',
];

function parseLogLine(raw: string): LogEntry {
  const match = raw.match(/^\[(.+?)\]\s+\[(\w+)\]\s+\[(\w+)\]\s+(.+)$/);
  if (match) {
    return {
      timestamp: match[1],
      level: match[2] as LogEntry['level'],
      caller: match[3],
      message: match[4],
      raw,
    };
  }
  return { timestamp: '', level: 'INFO', caller: '', message: raw, raw };
}

export const MockBridge = {
  async getAppList(): Promise<AppEntry[]> {
    await delay(200);
    return [...mockAppList];
  },

  async getNukeList(): Promise<NukeEntry[]> {
    await delay(100);
    return [...mockNukeList];
  },

  async getStatus(): Promise<StatusJson> {
    await delay(100);
    return { ...mockStatus };
  },

  async getCategories(): Promise<CategoriesJson> {
    await delay(50);
    return mockCategories;
  },

  async getSystemizeList(): Promise<SystemizeEntry[]> {
    await delay(100);
    return [...mockSystemizeList];
  },

  async getConfig(): Promise<ConfigValues> {
    await delay(50);
    return { ...mockConfig };
  },

  async setConfig(key: keyof ConfigValues, value: string): Promise<boolean> {
    await delay(150);
    (mockConfig as any)[key] = value;
    return true;
  },

  async getModuleProp(): Promise<ModuleProp> {
    await delay(50);
    return { ...mockModuleProp };
  },

  async getDebugLog(): Promise<LogEntry[]> {
    await delay(100);
    return mockLogLines.map(parseLogLine);
  },

  async getBootCount(): Promise<number> {
    await delay(50);
    return 0;
  },

  async getMonitorStatus(): Promise<'running' | 'stopped'> {
    await delay(50);
    return 'running';
  },

  async nukeApps(entries: NukeEntry[]): Promise<boolean> {
    await delay(800);
    for (const entry of entries) {
      if (!mockNukeList.find(n => n.package_name === entry.package_name)) {
        mockNukeList.push(entry);
      }
    }
    mockStatus.debloated = mockNukeList.length;
    mockStatus.debloat_verified = mockNukeList.length;
    mockStatus.last_nuke = new Date().toISOString();
    mockStatus.timestamp = Math.floor(Date.now() / 1000);
    return true;
  },

  async restoreApp(packageName: string): Promise<boolean> {
    await delay(600);
    mockNukeList = mockNukeList.filter(n => n.package_name !== packageName);
    mockStatus.debloated = mockNukeList.length;
    mockStatus.debloat_verified = mockNukeList.length;
    return true;
  },

  async promoteApp(packageName: string): Promise<boolean> {
    await delay(1000);
    const entry: SystemizeEntry = {
      app_name: packageName.split('.').pop() || packageName,
      package_name: packageName,
      original_path: `/data/app/~~rand/${packageName}-rand/base.apk`,
      system_path: `/data/adb/modules/scalpel/system/priv-app/${packageName}/base.apk`,
      promoted_date: new Date().toISOString().split('T')[0],
    };
    mockSystemizeList.push(entry);
    mockStatus.systemized = mockSystemizeList.length;
    return true;
  },

  async demoteApp(packageName: string): Promise<boolean> {
    await delay(600);
    mockSystemizeList = mockSystemizeList.filter(s => s.package_name !== packageName);
    mockStatus.systemized = mockSystemizeList.length;
    return true;
  },

  async refreshScanner(): Promise<boolean> {
    await delay(2000);
    return true;
  },

  async runVerify(): Promise<boolean> {
    await delay(1500);
    return true;
  },

  async reboot(): Promise<void> {
    await delay(300);
  },
};
