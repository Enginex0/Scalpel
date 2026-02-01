export type Tab = 'debloat' | 'systemize' | 'status' | 'settings';

export type CategoryId = 'essential' | 'caution' | 'safe' | 'google' | 'unknown';

export interface AppEntry {
  package_name: string;
  app_name: string;
  app_path: string;
  partition: string;
  category: CategoryId;
  is_priv_app: boolean;
  is_split: boolean;
}

export interface NukeEntry {
  package_name: string;
  app_path: string;
}

export interface CategoryDef {
  id: CategoryId;
  name: string;
  description: string;
  color: string;
  emoji: string;
}

export interface CategoriesJson {
  categories: CategoryDef[];
  apps: Record<string, string>;
}

export interface StatusJson {
  mode: string;
  debloated: number;
  debloat_failed: number;
  systemized: number;
  partial: boolean;
  last_nuke: string;
  timestamp: number;
  debloat_verified?: number;
  debloat_broken?: number;
  systemize_verified?: number;
  systemize_broken?: number;
  last_verify?: string;
  monitor_repairs?: number;
  last_monitor?: string;
}

export interface SystemizeEntry {
  app_name: string;
  package_name: string;
  original_path: string;
  system_path: string;
  promoted_date: string;
}

export interface ConfigValues {
  SCALPEL_MODE_OVERRIDE: string;
  SCALPEL_LOG_LEVEL: string;
  SCALPEL_REFRESH_APPLIST: string;
  SCALPEL_DISABLE_ONLY: string;
  SCALPEL_MONITOR_INTERVAL: string;
}

export interface ModuleProp {
  id: string;
  name: string;
  version: string;
  versionCode: string;
  author: string;
  description: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  caller: string;
  message: string;
  raw: string;
}

export interface Settings {
  theme: 'dark' | 'light' | 'auto' | 'amoled';
  accentColor: string;
  animationsEnabled: boolean;
}

export type AppDebloatState = 'active' | 'nuked' | 'pending';
