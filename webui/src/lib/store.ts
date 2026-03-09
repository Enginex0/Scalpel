import { createSignal, createRoot, createMemo, createEffect, batch } from 'solid-js';
import { createStore } from 'solid-js/store';
import type {
  Tab, ScannedApp, DebloatedApp, SystemizedApp, UserApp,
  StatusData, BootInfo, MonitorInfo, MetamoduleInfo, Settings, Category, ActiveMode, SystemizeTarget,
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
  const [metamoduleInfo, setMetamoduleInfo] = createSignal<MetamoduleInfo>({ id: '', name: 'detecting...' });
  const [moduleVersion, setModuleVersion] = createSignal('...');
  const [logLines, setLogLines] = createSignal<string[]>([]);
  const [verboseMode, setVerboseMode] = createSignal(false);

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
  const initialAccent = savedAutoAccent ? randomAccent : (savedAccent && accentPresets[savedAccent] ? savedAccent : '#FF3B5C');

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
    deferredUninstall: false,
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

    // Single batch call replaces 8 separate reads
    const initData = await api.getWebUiInit();

    if (initData) {
      // Batch user apps fetch in parallel with webui-init (KSU native API, not in binary)
      const [userResult, logResult] = await Promise.allSettled([
        api.getUserApps(),
        api.getLogLines(),
      ]);

      batch(() => {
        setScannedApps(initData.scanned_apps);
        setNukedApps(initData.nuked_apps);
        setPromotedApps(initData.promoted_apps);
        setStatus(initData.status);
        setBootInfo(initData.boot_info);
        setMonitorInfo(initData.monitor_info);
        setModuleVersion(initData.version);
        setMetamoduleInfo(initData.metamodule ?? { id: '', name: 'none' });
        setUserApps(userResult.status === 'fulfilled' ? userResult.value : []);
        setLogLines(logResult.status === 'fulfilled' ? logResult.value : []);
        setLoading({ apps: false, nuked: false, promoted: false, userApps: false, status: false, config: false });
      });

      log.info('store', 'loadInitialData: completed via webui-init');
    } else {
      // Mock mode or webui-init failed — fall back to individual calls
      const results = await Promise.allSettled([
        api.getScannedApps(),
        api.getNukedApps(),
        api.getPromotedApps(),
        api.getUserApps(),
        api.getStatus(),
        api.getBootInfo(),
        api.getMonitorInfo(),
        api.getLogLines(),
        api.getMetamoduleInfo(),
        api.getModuleVersion(),
      ]);

      const settled = <T,>(r: PromiseSettledResult<T>, fallback: T) =>
        r.status === 'fulfilled' ? r.value : fallback;

      batch(() => {
        setScannedApps(settled(results[0], []));
        setNukedApps(settled(results[1], []));
        setPromotedApps(settled(results[2], []));
        setUserApps(settled(results[3], []));
        setStatus(settled(results[4], {
          mode: 'none' as ActiveMode, debloated: 0, debloat_failed: 0, systemized: 0,
          partial: false, last_nuke: 'never',
        }));
        setBootInfo(settled(results[5], { boot_count: 0 }));
        setMonitorInfo(settled(results[6], { running: false, interval: 300 }));
        setLogLines(settled(results[7], []));
        setMetamoduleInfo(settled(results[8], { id: '', name: 'none' }));
        setModuleVersion(settled(results[9], 'unknown'));
        setLoading({ apps: false, nuked: false, promoted: false, userApps: false, status: false, config: false });
      });

      const anyFailed = results.some(r => r.status === 'rejected');
      if (anyFailed) {
        log.warn('store', 'loadInitialData: some data failed to load');
        showToast('Some data failed to load', 'error');
      } else {
        log.info('store', 'loadInitialData: completed via individual calls');
      }
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
        batch(() => {
          const successEntries = entries.filter(e => success.includes(e.package_name));
          const existing = new Set(nukedApps().map(a => a.package_name));
          setNukedApps(prev => [...prev, ...successEntries.filter(e => !existing.has(e.package_name))]);
          setNeedsReboot(true);
        });
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
      const ok = await api.restoreApp(pkg, appPath);
      if (ok) {
        setNukedApps(prev => prev.filter(a => a.package_name !== pkg));
        showToast('App restored', 'success');
      }
    } catch {
      showToast('Restore failed', 'error');
    }
  };

  const restoreAllNuked = async () => {
    const apps = [...nukedApps()];
    for (const app of apps) {
      await restoreApp(app.package_name);
    }
  };

  const promoteApp = async (pkg: string, target: SystemizeTarget = 'priv-app'): Promise<boolean> => {
    try {
      const user = userApps().find(a => a.package_name === pkg);
      const appName = user?.app_name || pkg;
      const ok = await api.promoteApp(pkg, target, appName);
      if (ok) {
        batch(() => {
          setPromotedApps(prev => [...prev, {
            package_name: pkg,
            app_name: appName,
            original_path: user?.sourcePath || `/data/app/${pkg}`,
            system_path: `/data/adb/modules/scalpel/system/${target}/${appName}/base.apk`,
            promoted_date: new Date().toISOString().split('T')[0],
          }]);
          setNeedsReboot(true);
        });
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
        batch(() => {
          setPromotedApps(prev => prev.map(a =>
            a.package_name === pkg ? { ...a, pending_demote: true } : a
          ));
          setNeedsReboot(true);
        });
        showToast('App will be demoted on reboot', 'success');
      }
    } catch {
      showToast('Demotion failed', 'error');
    }
  };

  // Persist config settings via binary CLI
  const updateSettings = (updates: Partial<Settings>) => {
    if (updates.monitorInterval !== undefined) {
      updates.monitorInterval = Math.max(60, Math.min(3600, updates.monitorInterval));
    }
    setSettings(updates);

    if (updates.modeOverride !== undefined) {
      const val = updates.modeOverride === 'auto' ? '' : updates.modeOverride;
      api.setConfigValue('debloat.mode_override', val);
    }
    if (updates.logLevel !== undefined) {
      api.setConfigValue('log.level', updates.logLevel);
    }
    if (updates.disableOnly !== undefined) {
      api.setConfigValue('debloat.disable_only', String(updates.disableOnly));
    }
    if (updates.refreshOnBoot !== undefined) {
      api.setConfigValue('scan.refresh_on_boot', String(updates.refreshOnBoot));
    }
    if (updates.monitorInterval !== undefined) {
      api.setConfigValue('monitor.interval', String(updates.monitorInterval));
    }
    if (updates.deferredUninstall !== undefined) {
      api.setConfigValue('systemize.deferred_uninstall', String(updates.deferredUninstall));
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

  const toggleVerboseMode = () => {
    const next = !verboseMode();
    setVerboseMode(next);
    if (next) {
      setSettings({ logLevel: 'debug' });
      api.setConfigValue('log.level', 'debug');
      showToast('Debug logging active — takes effect next boot', 'info');
    } else {
      setSettings({ logLevel: 'info' });
      api.setConfigValue('log.level', 'info');
    }
  };

  const dumpDiagnostics = async () => {
    showToast('Running diagnostics...', 'info');
    const result = await api.saveDiagToDownload();
    if (result.success) {
      showToast(`Saved to Download/${result.filename}`, 'success');
    } else {
      showToast('Failed to save diagnostics', 'error');
    }
  };

  return {
    activeTab, setActiveTab, loading, needsReboot, setNeedsReboot, mockMode,
    scannedApps, nukedApps, promotedApps, userApps, status, bootInfo, monitorInfo, metamoduleInfo, moduleVersion, logLines,
    debloatSelected, setDebloatSelected,
    systemizeSelected, setSystemizeSelected,
    settings, currentTheme, toast, showToast,
    verboseMode, toggleVerboseMode, dumpDiagnostics,
    loadInitialData, nukeApps, restoreApp, restoreAllNuked, promoteApp, demoteApp, updateSettings, refreshAppList,
  };
}

export const store = createRoot(createAppStore);
