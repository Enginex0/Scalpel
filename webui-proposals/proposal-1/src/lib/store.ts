import { createSignal, createMemo } from 'solid-js';
import { mockBridge } from './mock-bridge.ts';
import type {
  AppEntry, NukeEntry, StatusJson, CategoriesJson,
  SystemizeEntry, ConfigValues, TabId, UserApp
} from './types.ts';

const [activeTab, setActiveTab] = createSignal<TabId>('debloat');
const [apps, setApps] = createSignal<AppEntry[]>([]);
const [nukeList, setNukeList] = createSignal<NukeEntry[]>([]);
const [status, setStatus] = createSignal<StatusJson | null>(null);
const [categories, setCategories] = createSignal<CategoriesJson | null>(null);
const [systemizeList, setSystemizeList] = createSignal<SystemizeEntry[]>([]);
const [userApps, setUserApps] = createSignal<UserApp[]>([]);
const [config, setConfig] = createSignal<ConfigValues | null>(null);
const [logText, setLogText] = createSignal('');
const [bootCount, setBootCount] = createSignal(0);
const [monitorStatus, setMonitorStatus] = createSignal<'running' | 'stopped'>('stopped');
const [loading, setLoading] = createSignal(false);
const [needsReboot, setNeedsReboot] = createSignal(false);
const [detailApp, setDetailApp] = createSignal<AppEntry | null>(null);
const [darkMode, setDarkMode] = createSignal(
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : true
);

function isNuked(pkg: string): boolean {
  return nukeList().some(e => e.package_name === pkg);
}

function getCategoryForApp(pkg: string): string {
  const cats = categories();
  if (!cats) return 'unknown';
  return cats.apps[pkg] || 'unknown';
}

function getCategoryMeta(id: string) {
  const cats = categories();
  if (!cats) return { id: 'unknown', name: 'Unknown', description: '', color: '#9e9e9e' };
  return cats.categories.find(c => c.id === id) || { id: 'unknown', name: 'Unknown', description: '', color: '#9e9e9e' };
}

async function loadAll() {
  setLoading(true);
  try {
    setApps(mockBridge.getAppList());
    setNukeList(mockBridge.getNukeList());
    setStatus(mockBridge.getStatus());
    setCategories(mockBridge.getCategories());
    setSystemizeList(mockBridge.getSystemizeList());
    setUserApps(mockBridge.getUserApps());
    setConfig(mockBridge.getConfig());
    setLogText(mockBridge.getLog());
    setBootCount(mockBridge.getBootCount());
    setMonitorStatus(mockBridge.getMonitorStatus());
  } finally {
    setLoading(false);
  }
}

async function nukeApp(app: AppEntry): Promise<boolean> {
  setLoading(true);
  try {
    const ok = await mockBridge.nukeApp(app.package_name, app.app_path);
    if (ok) {
      setNukeList(mockBridge.getNukeList());
      setStatus(mockBridge.getStatus());
      if (mockBridge.getStatus().mode !== 'pm') setNeedsReboot(true);
    }
    return ok;
  } finally {
    setLoading(false);
  }
}

async function restoreApp(pkg: string): Promise<boolean> {
  setLoading(true);
  try {
    const ok = await mockBridge.restoreApp(pkg);
    if (ok) {
      setNukeList(mockBridge.getNukeList());
      setStatus(mockBridge.getStatus());
      if (mockBridge.getStatus().mode !== 'pm') setNeedsReboot(true);
    }
    return ok;
  } finally {
    setLoading(false);
  }
}

async function promoteApp(pkg: string): Promise<boolean> {
  setLoading(true);
  try {
    const ok = await mockBridge.promoteApp(pkg);
    if (ok) {
      setSystemizeList(mockBridge.getSystemizeList());
      setUserApps(mockBridge.getUserApps());
      setStatus(mockBridge.getStatus());
      setNeedsReboot(true);
    }
    return ok;
  } finally {
    setLoading(false);
  }
}

async function demoteApp(pkg: string): Promise<boolean> {
  setLoading(true);
  try {
    const ok = await mockBridge.demoteApp(pkg);
    if (ok) {
      setSystemizeList(mockBridge.getSystemizeList());
      setUserApps(mockBridge.getUserApps());
      setStatus(mockBridge.getStatus());
      setNeedsReboot(true);
    }
    return ok;
  } finally {
    setLoading(false);
  }
}

async function updateConfig(key: keyof ConfigValues, value: string): Promise<boolean> {
  const ok = await mockBridge.setConfig(key, value);
  if (ok) setConfig(mockBridge.getConfig());
  return ok;
}

async function refreshScan(): Promise<void> {
  setLoading(true);
  try {
    const newApps = await mockBridge.refreshScan();
    setApps(newApps);
  } finally {
    setLoading(false);
  }
}

async function reboot(): Promise<void> {
  await mockBridge.reboot();
  setNeedsReboot(false);
}

function toggleDark() {
  setDarkMode(!darkMode());
}

export const store = {
  activeTab, setActiveTab,
  apps, nukeList, status, categories,
  systemizeList, userApps, config,
  logText, bootCount, monitorStatus,
  loading, needsReboot, detailApp, setDetailApp,
  darkMode, toggleDark,
  isNuked, getCategoryForApp, getCategoryMeta,
  loadAll, nukeApp, restoreApp,
  promoteApp, demoteApp,
  updateConfig, refreshScan, reboot,
};
