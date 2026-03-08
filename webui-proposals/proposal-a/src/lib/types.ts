export type Tab = 'debloat' | 'systemize' | 'status' | 'settings';

export type SystemizeTarget = 'app' | 'priv-app';

export type Category = 'essential' | 'caution' | 'safe' | 'google' | 'unknown';

export type ModeOverride = 'auto' | 'pm';
export type ActiveMode = 'overlay' | 'pm' | 'none' | 'running' | 'error';

export interface MetamoduleInfo {
  id: string;
  name: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type ThemeMode = 'dark' | 'light' | 'amoled' | 'auto';

// FOUNDATION.md 4.2 -- app_list.json schema
export interface ScannedApp {
  package_name: string;
  app_name: string;
  app_path: string;
  partition: string;
  category: Category;
  is_priv_app: boolean;
  is_split: boolean;
}

// FOUNDATION.md 4.3 -- nuke_list.json schema (persisted to disk)
export interface DebloatedApp {
  app_name: string;
  package_name: string;
  app_path: string;
  pending?: boolean;
}

// UI-only extension with display metadata not written to nuke_list.json
export interface NukedAppDisplay extends DebloatedApp {
  category: Category;
}

// FOUNDATION.md 4.4 -- systemize_list.json schema
export interface SystemizedApp {
  app_name: string;
  package_name: string;
  original_path: string;
  system_path: string;
  promoted_date: string;
  target?: SystemizeTarget;
}

// KSU getPackagesInfo() return type
export interface UserApp {
  package_name: string;
  app_name: string;
  uid: number;
  versionName?: string;
  versionCode?: number;
  isSystem?: boolean;
  sourcePath?: string;
}

// FOUNDATION.md 4.1 -- status.json (fields added incrementally)
export interface StatusData {
  mode: ActiveMode;
  debloated: number;
  debloat_failed: number;
  systemized: number;
  partial: boolean;
  last_nuke: string;
  timestamp?: number;
  debloat_verified?: number;
  debloat_broken?: number;
  systemize_verified?: number;
  systemize_broken?: number;
  last_verify?: string;
  monitor_repairs?: number;
  last_monitor?: string;
}

// Separate from status.json -- fetched via different paths
export interface BootInfo {
  boot_count: number;
}

export interface MonitorInfo {
  running: boolean;
  interval: number;
}

export interface Settings {
  theme: ThemeMode;
  accentColor: string;
  autoAccentColor: boolean;
  modeOverride: ModeOverride;
  logLevel: LogLevel;
  disableOnly: boolean;
  monitorEnabled: boolean;
  monitorInterval: number;
  refreshOnBoot: boolean;
  fixedNav: boolean;
}

export interface ModeInfo {
  id: string;
  name: string;
  description: string;
}
