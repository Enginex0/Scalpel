import { createSignal, createRoot, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';
import type {
  Tab, AppEntry, NukeEntry, StatusJson, SystemizeEntry,
  ConfigValues, ModuleProp, CategoriesJson, LogEntry, Settings, CategoryId
} from './types';
import { MockBridge } from './mock-bridge';
import { getColors, applyThemeVars, accentPresets } from './theme';

function createAppStore() {
  const [activeTab, setActiveTab] = createSignal<Tab>('debloat');
  const [appList, setAppList] = createSignal<AppEntry[]>([]);
  const [nukeList, setNukeList] = createSignal<NukeEntry[]>([]);
  const [status, setStatus] = createSignal<StatusJson | null>(null);
  const [categories, setCategories] = createSignal<CategoriesJson | null>(null);
  const [systemizeList, setSystemizeList] = createSignal<SystemizeEntry[]>([]);
  const [config, setConfig] = createSignal<ConfigValues | null>(null);
  const [moduleProp, setModuleProp] = createSignal<ModuleProp | null>(null);
  const [debugLog, setDebugLog] = createSignal<LogEntry[]>([]);
  const [bootCount, setBootCount] = createSignal(0);
  const [monitorStatus, setMonitorStatus] = createSignal<'running' | 'stopped'>('stopped');
  const [needsReboot, setNeedsReboot] = createSignal(false);
  const [operationInProgress, setOperationInProgress] = createSignal(false);

  const [loading, setLoading] = createStore({
    initial: true,
    apps: false,
    nuke: false,
    restore: false,
    promote: false,
    demote: false,
    scanner: false,
    verify: false,
  });

  const [toast, setToast] = createSignal<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const savedTheme = typeof window !== 'undefined'
    ? (localStorage.getItem('scalpel-theme') as Settings['theme'] | null) : null;
  const savedAccent = typeof window !== 'undefined'
    ? (localStorage.getItem('scalpel-accent') || 'indigo') : 'indigo';

  const [settings, setSettings] = createStore<Settings>({
    theme: savedTheme || 'dark',
    accentColor: accentPresets[savedAccent] ? savedAccent : 'indigo',
    animationsEnabled: true,
  });

  createEffect(() => {
    const colors = getColors(settings.theme);
    applyThemeVars(colors, settings.accentColor);
    if (typeof window !== 'undefined') {
      localStorage.setItem('scalpel-theme', settings.theme);
      localStorage.setItem('scalpel-accent', settings.accentColor);
    }
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadInitialData = async () => {
    setLoading({ initial: true });
    try {
      const [apps, nuke, stat, cats, syslist, conf, prop, log, bc, mon] = await Promise.all([
        MockBridge.getAppList(),
        MockBridge.getNukeList(),
        MockBridge.getStatus(),
        MockBridge.getCategories(),
        MockBridge.getSystemizeList(),
        MockBridge.getConfig(),
        MockBridge.getModuleProp(),
        MockBridge.getDebugLog(),
        MockBridge.getBootCount(),
        MockBridge.getMonitorStatus(),
      ]);
      setAppList(apps);
      setNukeList(nuke);
      setStatus(stat);
      setCategories(cats);
      setSystemizeList(syslist);
      setConfig(conf);
      setModuleProp(prop);
      setDebugLog(log);
      setBootCount(bc);
      setMonitorStatus(mon);
    } catch (err) {
      console.error('[Store] loadInitialData error:', err);
      showToast('Failed to load data', 'error');
    } finally {
      setLoading({ initial: false });
    }
  };

  const isNuked = (packageName: string) =>
    nukeList().some(n => n.package_name === packageName);

  const getAppsByCategory = (catId: CategoryId) =>
    appList().filter(a => a.category === catId);

  const getCategoryCount = (catId: CategoryId) =>
    appList().filter(a => a.category === catId).length;

  const getNukedCountByCategory = (catId: CategoryId) =>
    appList().filter(a => a.category === catId && isNuked(a.package_name)).length;

  const debloatApp = async (app: AppEntry) => {
    setLoading('nuke', true);
    setOperationInProgress(true);
    try {
      const entry: NukeEntry = { package_name: app.package_name, app_path: app.app_path };
      await MockBridge.nukeApps([entry]);
      setNukeList(prev => [...prev, entry]);
      const s = await MockBridge.getStatus();
      setStatus(s);
      if (s.mode !== 'pm') setNeedsReboot(true);
      showToast(`${app.app_name} debloated`, 'success');
    } catch {
      showToast(`Failed to debloat ${app.app_name}`, 'error');
    } finally {
      setLoading('nuke', false);
      setOperationInProgress(false);
    }
  };

  const restoreApp = async (app: AppEntry) => {
    setLoading('restore', true);
    setOperationInProgress(true);
    try {
      await MockBridge.restoreApp(app.package_name);
      setNukeList(prev => prev.filter(n => n.package_name !== app.package_name));
      const s = await MockBridge.getStatus();
      setStatus(s);
      const stat = status();
      if (stat && stat.mode !== 'pm') setNeedsReboot(true);
      showToast(`${app.app_name} restored`, 'success');
    } catch {
      showToast(`Failed to restore ${app.app_name}`, 'error');
    } finally {
      setLoading('restore', false);
      setOperationInProgress(false);
    }
  };

  const promoteApp = async (packageName: string) => {
    setLoading('promote', true);
    setOperationInProgress(true);
    try {
      await MockBridge.promoteApp(packageName);
      const list = await MockBridge.getSystemizeList();
      setSystemizeList(list);
      setNeedsReboot(true);
      showToast('App promoted to system. Reboot required.', 'success');
    } catch {
      showToast('Promotion failed', 'error');
    } finally {
      setLoading('promote', false);
      setOperationInProgress(false);
    }
  };

  const demoteApp = async (packageName: string) => {
    setLoading('demote', true);
    setOperationInProgress(true);
    try {
      await MockBridge.demoteApp(packageName);
      const list = await MockBridge.getSystemizeList();
      setSystemizeList(list);
      setNeedsReboot(true);
      showToast('App demoted. Reboot required.', 'success');
    } catch {
      showToast('Demotion failed', 'error');
    } finally {
      setLoading('demote', false);
      setOperationInProgress(false);
    }
  };

  const refreshScanner = async () => {
    setLoading('scanner', true);
    try {
      await MockBridge.refreshScanner();
      const apps = await MockBridge.getAppList();
      setAppList(apps);
      showToast('App list refreshed', 'success');
    } catch {
      showToast('Scan failed', 'error');
    } finally {
      setLoading('scanner', false);
    }
  };

  const runVerify = async () => {
    setLoading('verify', true);
    try {
      await MockBridge.runVerify();
      const s = await MockBridge.getStatus();
      setStatus(s);
      showToast('Verification complete', 'success');
    } catch {
      showToast('Verification failed', 'error');
    } finally {
      setLoading('verify', false);
    }
  };

  const updateConfig = async (key: keyof ConfigValues, value: string) => {
    try {
      await MockBridge.setConfig(key, value);
      const c = await MockBridge.getConfig();
      setConfig(c);
      showToast('Setting saved', 'success');
    } catch {
      showToast('Failed to save setting', 'error');
    }
  };

  const updateSettings = (updates: Partial<Settings>) => {
    setSettings(updates);
  };

  const reboot = async () => {
    await MockBridge.reboot();
    showToast('Rebooting device...', 'info');
  };

  return {
    activeTab, setActiveTab,
    appList, nukeList, status, categories, systemizeList,
    config, moduleProp, debugLog, bootCount, monitorStatus,
    needsReboot, setNeedsReboot, operationInProgress,
    loading, toast, settings,
    showToast, loadInitialData,
    isNuked, getAppsByCategory, getCategoryCount, getNukedCountByCategory,
    debloatApp, restoreApp, promoteApp, demoteApp,
    refreshScanner, runVerify, updateConfig, updateSettings, reboot,
  };
}

export const store = createRoot(createAppStore);
