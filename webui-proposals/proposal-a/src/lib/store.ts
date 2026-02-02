import { createSignal, createRoot, createMemo, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';
import type {
  Tab, ScannedApp, DebloatedApp, SystemizedApp, UserApp,
  StatusData, BootInfo, MonitorInfo, Settings, Category, ActiveMode, SystemizeTarget,
} from './types';
import { api, shouldUseMock } from './api';
import { darkTheme, lightTheme, amoledTheme, applyTheme, getAccentStyles, accentPresets } from './theme';
import { log } from './logger';
import { ksuExec } from './ksuApi';

function createAppStore() {
  const [activeTab, setActiveTab] = createSignal<Tab>('status');
  const [needsReboot, setNeedsReboot] = createSignal(false);
  const [mockMode, setMockMode] = createSignal(shouldUseMock());

  // Granular loading states for targeted skeletons per route
  const [loading, setLoading] = createStore({
    apps: false,
    nuked: false,
    promoted: false,
    userApps: false,
    status: false,
    config: false,
  });

  const [scannedApps, setScannedApps] = createSignal<ScannedApp[]>([]);
  const [nukedApps, setNukedApps] = createSignal<DebloatedApp[]>([]);
  const [promotedApps, setPromotedApps] = createSignal<SystemizedApp[]>([]);
  const [userApps, setUserApps] = createSignal<UserApp[]>([]);

  const [status, setStatus] = createStore<StatusData>({
    mode: 'none' as ActiveMode, debloated: 0, debloat_failed: 0, systemized: 0,
    partial: false, last_nuke: 'never',
  });

  const [bootInfo, setBootInfo] = createStore<BootInfo>({ boot_count: 0 });
  const [monitorInfo, setMonitorInfo] = createStore<MonitorInfo>({ running: false, interval: 300 });
  const [logLines, setLogLines] = createSignal<string[]>([]);

  const savedTheme = typeof window !== 'undefined'
    ? (localStorage.getItem('scalpel-theme') as Settings['theme'] | null)
    : null;
  const savedAutoAccentRaw = typeof window !== 'undefined'
    ? localStorage.getItem('scalpel-autoAccent')
    : null;
  const savedAutoAccent = savedAutoAccentRaw === null ? true : savedAutoAccentRaw === 'true';
  const savedAccent = typeof window !== 'undefined'
    ? localStorage.getItem('scalpel-accent')
    : null;
  const savedFixedNavRaw = typeof window !== 'undefined'
    ? localStorage.getItem('scalpel-fixedNav3')
    : null;
  const savedFixedNav = savedFixedNavRaw === null ? false : savedFixedNavRaw === 'true';

  const accentColors = Object.keys(accentPresets);
  const randomAccent = accentColors[Math.floor(Math.random() * accentColors.length)];
  const initialAccent = savedAutoAccent ? randomAccent : (savedAccent && accentPresets[savedAccent] ? savedAccent : '#C0C0C0');

  const [settings, setSettings] = createStore<Settings>({
    theme: (savedTheme || 'amoled') as Settings['theme'],
    accentColor: initialAccent,
    autoAccentColor: savedAutoAccent,
    modeOverride: 'auto',
    logLevel: 'info',
    disableOnly: false,
    monitorEnabled: true,
    monitorInterval: 300,
    refreshOnBoot: false,
    fixedNav: savedFixedNav,
  });

  // Track system color scheme for auto theme
  const [systemPrefersDark, setSystemPrefersDark] = createSignal(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  );

  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => setSystemPrefersDark(e.matches));
  }

  const currentTheme = createMemo(() => {
    const pref = settings.theme;
    const base = pref === 'light' ? lightTheme
      : pref === 'amoled' ? amoledTheme
      : pref === 'auto' ? (systemPrefersDark() ? darkTheme : lightTheme)
      : darkTheme;
    const accent = getAccentStyles(settings.accentColor);
    return {
      ...base,
      gradientPrimary: accent.gradient,
      textAccent: accent.textAccent,
      textOnAccent: accent.textOnAccent,
      accentRgb: accent.rgb,
      shadowGlow: `0 0 20px rgba(${accent.rgb}, 0.3)`,
    };
  });

  createEffect(() => { applyTheme(currentTheme(), settings.accentColor); });
  createEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('scalpel-theme', settings.theme); });
  createEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('scalpel-accent', settings.accentColor); });
  createEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('scalpel-autoAccent', String(settings.autoAccentColor)); });
  createEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('scalpel-fixedNav3', String(settings.fixedNav)); });

  if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && settings.autoAccentColor) {
        const colors = Object.keys(accentPresets);
        setSettings({ accentColor: colors[Math.floor(Math.random() * colors.length)] });
      }
    });
  }

  const [debloatSelected, setDebloatSelected] = createSignal<Set<string>>(new Set());
  const [systemizeSelected, setSystemizeSelected] = createSignal<Set<string>>(new Set());

  const [toast, setToast] = createSignal<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadInitialData = async () => {
    if (!shouldUseMock()) {
      log.enableBackendLogging(ksuExec);
    }
    log.info('store', 'loadInitialData: starting');

    setLoading({ apps: true, nuked: true, promoted: true, userApps: true, status: true, config: true });
    const results = await Promise.allSettled([
      api.getScannedApps(),
      api.getNukedApps(),
      api.getPromotedApps(),
      api.getUserApps(),
      api.getStatus(),
      api.getBootInfo(),
      api.getMonitorInfo(),
      api.getLogLines(),
    ]);

    const settled = <T,>(r: PromiseSettledResult<T>, fallback: T) =>
      r.status === 'fulfilled' ? r.value : fallback;

    setScannedApps(settled(results[0], []));
    setLoading('apps', false);

    setNukedApps(settled(results[1], []));
    setLoading('nuked', false);

    setPromotedApps(settled(results[2], []));
    setLoading('promoted', false);

    setUserApps(settled(results[3], []));
    setLoading('userApps', false);

    const statusData = settled(results[4], {
      mode: 'none' as ActiveMode, debloated: 0, debloat_failed: 0, systemized: 0,
      partial: false, last_nuke: 'never',
    });
    setStatus(statusData);
    setBootInfo(settled(results[5], { boot_count: 0 }));
    setMonitorInfo(settled(results[6], { running: false, interval: 300 }));
    setLogLines(settled(results[7], []));
    setLoading('status', false);
    setLoading('config', false);

    const anyFailed = results.some(r => r.status === 'rejected');
    if (anyFailed) {
      log.warn('store', 'loadInitialData: some data failed to load');
      showToast('Some data failed to load', 'error');
    } else {
      log.info('store', 'loadInitialData: completed successfully');
    }
  };

  const nukeApps = async (packages: string[]) => {
    try {
      const scanned = scannedApps();
      const entries: DebloatedApp[] = packages.map(pkg => {
        const app = scanned.find(a => a.package_name === pkg);
        return {
          package_name: pkg,
          app_name: app?.app_name || pkg,
          app_path: app?.app_path || '',
        };
      });

      const { success } = await api.nukeApps(entries);
      if (success.length > 0) {
        const successEntries = entries.filter(e => success.includes(e.package_name));
        setNukedApps(prev => [...prev, ...successEntries]);
        setNeedsReboot(true);
        showToast(`Nuked ${success.length} app${success.length > 1 ? 's' : ''}`, 'success');
      }
    } catch {
      showToast('Debloat operation failed', 'error');
    }
  };

  const restoreApp = async (pkg: string) => {
    try {
      const nuked = nukedApps().find(a => a.package_name === pkg);
      const appPath = nuked?.app_path || '';
      const ok = await api.restoreApp(pkg, appPath, status.mode);
      if (ok) {
        setNukedApps(prev => prev.filter(a => a.package_name !== pkg));
        setNeedsReboot(true);
        showToast('App restored', 'success');
      }
    } catch {
      showToast('Restore failed', 'error');
    }
  };

  const promoteApp = async (pkg: string, target: SystemizeTarget = 'priv-app'): Promise<boolean> => {
    try {
      const user = userApps().find(a => a.package_name === pkg);
      const appName = user?.app_name || pkg;
      const ok = await api.promoteApp(pkg, target, appName);
      if (ok) {
        setPromotedApps(prev => [...prev, {
          package_name: pkg,
          app_name: appName,
          original_path: user?.sourcePath || `/data/app/${pkg}`,
          system_path: `/data/adb/modules/scalpel/system/${target}/${appName}/base.apk`,
          promoted_date: new Date().toISOString().split('T')[0],
        }]);
        setNeedsReboot(true);
        showToast('App promoted to system', 'success');
      } else {
        showToast('Promotion failed — not a user-installed app', 'error');
      }
      return ok;
    } catch {
      showToast('Promotion failed', 'error');
      return false;
    }
  };

  const demoteApp = async (pkg: string) => {
    try {
      const ok = await api.demoteApp(pkg);
      if (ok) {
        setPromotedApps(prev => prev.filter(a => a.package_name !== pkg));
        setNeedsReboot(true);
        showToast('App demoted', 'success');
      }
    } catch {
      showToast('Demotion failed', 'error');
    }
  };

  // Persist config.sh settings when backend-mapped keys change
  const updateSettings = (updates: Partial<Settings>) => {
    if (updates.monitorInterval !== undefined) {
      updates.monitorInterval = Math.max(60, Math.min(3600, updates.monitorInterval));
    }
    setSettings(updates);

    if (updates.modeOverride !== undefined) {
      const val = updates.modeOverride === 'auto' ? '' : updates.modeOverride;
      api.setConfigValue('SCALPEL_MODE_OVERRIDE', val);
    }
    if (updates.logLevel !== undefined) {
      api.setConfigValue('SCALPEL_LOG_LEVEL', updates.logLevel);
    }
    if (updates.disableOnly !== undefined) {
      api.setConfigValue('SCALPEL_DISABLE_ONLY', String(updates.disableOnly));
    }
    if (updates.refreshOnBoot !== undefined) {
      api.setConfigValue('SCALPEL_REFRESH_APPLIST', String(updates.refreshOnBoot));
    }
    if (updates.monitorInterval !== undefined) {
      api.setConfigValue('SCALPEL_MONITOR_INTERVAL', String(updates.monitorInterval));
    }
  };

  const refreshAppList = async () => {
    try {
      showToast('Scanning apps...', 'info');
      await api.runScanner();
      const scanned = await api.getScannedApps();
      setScannedApps(scanned);
      showToast('App list refreshed', 'success');
    } catch {
      showToast('Scanner failed', 'error');
    }
  };

  return {
    activeTab, setActiveTab, loading, needsReboot, setNeedsReboot, mockMode,
    scannedApps, nukedApps, promotedApps, userApps, status, bootInfo, monitorInfo, logLines,
    debloatSelected, setDebloatSelected,
    systemizeSelected, setSystemizeSelected,
    settings, currentTheme, toast, showToast,
    loadInitialData, nukeApps, restoreApp, promoteApp, demoteApp, updateSettings, refreshAppList,
  };
}

export const store = createRoot(createAppStore);
