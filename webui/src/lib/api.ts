import type {
  ScannedApp, DebloatedApp, SystemizedApp, UserApp,
  StatusData, BootInfo, MonitorInfo, SystemizeTarget, MetamoduleInfo, ActiveMode,
} from './types';
import { PATHS } from './constants';
import { ksuExec, listPackages, getPackagesInfo } from './ksuApi';
import { log } from './logger';

export function shouldUseMock(): boolean {
  return typeof globalThis.ksu === 'undefined';
}

function escapeShellArg(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

async function getMock() {
  return import('./api.mock');
}

// webui-init batch response from binary
interface WebUiInitResponse {
  scanned_apps: ScannedApp[];
  nuked_apps: DebloatedApp[];
  promoted_apps: SystemizedApp[];
  status: StatusData;
  boot_info: BootInfo;
  monitor_info: MonitorInfo;
  version: string;
  metamodule: MetamoduleInfo | null;
}

async function execBin(args: string, timeoutMs = 30000): Promise<{ errno: number; stdout: string; stderr: string }> {
  return ksuExec(`${PATHS.BIN} ${args}`, timeoutMs);
}

export const api = {
  async getWebUiInit(): Promise<WebUiInitResponse | null> {
    if (shouldUseMock()) return null;
    try {
      const { errno, stdout, stderr } = await execBin('webui-init');
      if (errno !== 0) {
        log.error('api', 'webui-init failed', stderr);
        return null;
      }
      return JSON.parse(stdout);
    } catch (e) {
      log.error('api', 'webui-init parse failed', String(e));
      return null;
    }
  },

  async getScannedApps(): Promise<ScannedApp[]> {
    if (shouldUseMock()) return (await getMock()).MOCK_SCANNED;
    try {
      const { errno, stdout, stderr } = await execBin('list apps');
      if (errno !== 0) {
        log.warn('api', 'list apps failed', stderr);
        return [];
      }
      return JSON.parse(stdout);
    } catch (e) {
      log.warn('api', 'getScannedApps failed', String(e));
      return [];
    }
  },

  async getNukedApps(): Promise<DebloatedApp[]> {
    if (shouldUseMock()) return [...(await getMock()).MOCK_NUKED];
    try {
      const { errno, stdout, stderr } = await execBin('list nuked');
      if (errno !== 0) {
        log.debug('api', 'list nuked failed', stderr);
        return [];
      }
      return JSON.parse(stdout);
    } catch (e) {
      log.debug('api', 'getNukedApps: no nuke list yet', String(e));
      return [];
    }
  },

  async getPromotedApps(): Promise<SystemizedApp[]> {
    if (shouldUseMock()) return [...(await getMock()).MOCK_PROMOTED];
    try {
      const { errno, stdout, stderr } = await execBin('list promoted');
      if (errno !== 0) {
        log.debug('api', 'list promoted failed', stderr);
        return [];
      }
      return JSON.parse(stdout);
    } catch (e) {
      log.debug('api', 'getPromotedApps: no systemize list yet', String(e));
      return [];
    }
  },

  async getUserApps(): Promise<UserApp[]> {
    if (shouldUseMock()) return (await getMock()).MOCK_USER_APPS;
    try {
      const pkgs = await listPackages('user');
      if (!pkgs.length) return [];
      const infos = await getPackagesInfo(pkgs);

      // Batch-fetch source paths to filter out preloaded vendor apps
      const pathCmd = pkgs.map(p => `echo "${p}|$(pm path ${p} 2>/dev/null | head -1 | sed 's/package://')"`).join('; ');
      const { stdout: pathOut } = await ksuExec(pathCmd);
      const pathMap = new Map<string, string>();
      for (const line of (pathOut || '').split('\n')) {
        const [pkg, path] = line.split('|', 2);
        if (pkg && path) pathMap.set(pkg.trim(), path.trim());
      }

      return infos.map((info) => ({
        package_name: info.packageName,
        app_name: info.appLabel || info.packageName,
        uid: info.uid ?? 0,
        versionName: info.versionName,
        versionCode: info.versionCode,
        isSystem: info.isSystem,
        sourcePath: pathMap.get(info.packageName),
      }));
    } catch (e) {
      log.error('api', 'getUserApps failed', String(e));
      return [];
    }
  },

  async getStatus(): Promise<StatusData> {
    if (shouldUseMock()) return { ...(await getMock()).MOCK_STATUS };
    try {
      const { errno, stdout, stderr } = await execBin('status --json');
      if (errno !== 0) {
        log.warn('api', 'status failed', stderr);
        return { mode: 'none', debloated: 0, debloat_failed: 0, systemized: 0, partial: false, last_nuke: 'never' };
      }
      const raw = JSON.parse(stdout) as Partial<StatusData>;
      return {
        mode: (raw.mode as ActiveMode) || 'none',
        debloated: raw.debloated ?? 0,
        debloat_failed: raw.debloat_failed ?? 0,
        systemized: raw.systemized ?? 0,
        partial: raw.partial ?? false,
        last_nuke: raw.last_nuke ?? 'never',
        timestamp: raw.timestamp,
        debloat_verified: raw.debloat_verified,
        debloat_broken: raw.debloat_broken,
        systemize_verified: raw.systemize_verified,
        systemize_broken: raw.systemize_broken,
        last_verify: raw.last_verify,
        monitor_repairs: raw.monitor_repairs,
        last_monitor: raw.last_monitor,
      };
    } catch (e) {
      log.warn('api', 'getStatus failed', String(e));
      return { mode: 'none', debloated: 0, debloat_failed: 0, systemized: 0, partial: false, last_nuke: 'never' };
    }
  },

  async getBootInfo(): Promise<BootInfo> {
    if (shouldUseMock()) return { ...(await getMock()).MOCK_BOOT_INFO };
    try {
      const { errno, stdout, stderr } = await execBin('status --boot-info --json');
      if (errno !== 0) {
        log.debug('api', 'boot-info failed', stderr);
        return { boot_count: 0 };
      }
      return JSON.parse(stdout);
    } catch (e) {
      log.warn('api', 'getBootInfo failed', String(e));
      return { boot_count: 0 };
    }
  },

  async getMonitorInfo(): Promise<MonitorInfo> {
    if (shouldUseMock()) return { ...(await getMock()).MOCK_MONITOR_INFO };
    try {
      const { errno, stdout, stderr } = await execBin('monitor status --json');
      if (errno !== 0) {
        log.debug('api', 'monitor status failed', stderr);
        return { running: false, interval: 300 };
      }
      return JSON.parse(stdout);
    } catch (e) {
      log.warn('api', 'getMonitorInfo failed', String(e));
      return { running: false, interval: 300 };
    }
  },

  async getLogLines(lines = 50): Promise<string[]> {
    if (shouldUseMock()) return [...(await getMock()).MOCK_LOG_LINES];
    try {
      const { errno, stdout, stderr } = await execBin(`log tail --lines=${lines} --json`);
      if (errno !== 0) {
        log.debug('api', 'log tail failed', stderr);
        return [];
      }
      return JSON.parse(stdout);
    } catch (e) {
      log.warn('api', 'getLogLines failed', String(e));
      return [];
    }
  },

  async runDiagnostics(): Promise<string[]> {
    if (shouldUseMock()) return [...(await getMock()).MOCK_LOG_LINES];
    const { errno, stdout } = await execBin('diagnose', 30000);
    if (errno !== 0) return [];
    return stdout.split('\n');
  },

  async clearLog(): Promise<boolean> {
    if (shouldUseMock()) return true;
    const { errno } = await execBin('log clear', 5000);
    return errno === 0;
  },

  async saveDiagToDownload(): Promise<{ success: boolean; filename?: string }> {
    if (shouldUseMock()) return { success: true, filename: 'scalpel_diag.log' };
    const date = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const filename = `scalpel_diag_${date}.log`;
    const dest = `${PATHS.DOWNLOAD_DIR}/${filename}`;
    const { errno } = await execBin(`diagnose --output=${escapeShellArg(dest)}`, 30000);
    if (errno !== 0) return { success: false };
    log.info('api', `saveDiagToDownload: saved to ${filename}`);
    return { success: true, filename };
  },

  async nukeApps(entries: DebloatedApp[]): Promise<{ success: string[]; failed: string[] }> {
    if (shouldUseMock()) {
      await new Promise(r => setTimeout(r, 800));
      return { success: entries.map(e => e.package_name), failed: [] };
    }

    const json = JSON.stringify(entries);
    const escaped = escapeShellArg(json);
    log.info('api', `nukeApps: nuking ${entries.length} apps`);
    const { errno, stdout, stderr } = await ksuExec(`echo ${escaped} | ${PATHS.BIN} nuke --json`, 60000);
    if (errno !== 0) {
      log.error('api', 'nukeApps failed', stderr);
      return { success: [], failed: entries.map(e => e.package_name) };
    }

    try {
      const result = JSON.parse(stdout) as { ok: number; failed: number };
      log.info('api', `nukeApps: ok=${result.ok} failed=${result.failed}`);
      // Binary handles description sync internally
      if (result.failed > 0) {
        return {
          success: entries.slice(0, result.ok).map(e => e.package_name),
          failed: entries.slice(result.ok).map(e => e.package_name),
        };
      }
      return { success: entries.map(e => e.package_name), failed: [] };
    } catch {
      return { success: entries.map(e => e.package_name), failed: [] };
    }
  },

  async restoreApp(pkg: string, _appPath: string): Promise<boolean> {
    if (shouldUseMock()) {
      await new Promise(r => setTimeout(r, 500));
      return true;
    }
    log.info('api', `restoreApp: restoring ${pkg}`);
    const { errno, stderr } = await execBin(`restore ${escapeShellArg(pkg)}`, 15000);
    if (errno !== 0) {
      log.error('api', `restoreApp: failed for ${pkg}`, stderr);
      return false;
    }
    log.info('api', `restoreApp: ${pkg} restored`);
    return true;
  },

  async getModuleVersion(): Promise<string> {
    if (shouldUseMock()) return 'v0.1.0';
    try {
      const { errno, stdout } = await execBin('version');
      if (errno !== 0) return 'unknown';
      return stdout.trim() || 'unknown';
    } catch {
      return 'unknown';
    }
  },

  async getMetamoduleInfo(): Promise<MetamoduleInfo> {
    if (shouldUseMock()) return { id: 'meta-zeromount', name: 'ZeroMount' };
    try {
      const { errno, stdout } = await execBin('detect metamodule --json');
      if (errno !== 0) return { id: '', name: 'none' };
      return JSON.parse(stdout);
    } catch {
      return { id: '', name: 'none' };
    }
  },

  async promoteApp(pkg: string, target: SystemizeTarget = 'priv-app', appName?: string): Promise<boolean> {
    if (shouldUseMock()) {
      await new Promise(r => setTimeout(r, 600));
      return true;
    }
    log.info('api', `promoteApp: promoting ${pkg} to ${target}`);
    const nameArg = appName ? ` --name=${escapeShellArg(appName)}` : '';
    const { errno, stderr } = await execBin(`promote ${escapeShellArg(pkg)} --target=${target}${nameArg}`, 15000);
    if (errno !== 0) {
      log.error('api', `promoteApp: failed for ${pkg}`, stderr);
      return false;
    }
    log.info('api', `promoteApp: ${pkg} promoted`);
    return true;
  },

  async demoteApp(pkg: string): Promise<boolean> {
    if (shouldUseMock()) {
      await new Promise(r => setTimeout(r, 500));
      return true;
    }
    log.info('api', `demoteApp: demoting ${pkg}`);
    const { errno, stderr } = await execBin(`demote ${escapeShellArg(pkg)}`, 15000);
    if (errno !== 0) {
      log.error('api', `demoteApp: failed for ${pkg}`, stderr);
      return false;
    }
    log.info('api', `demoteApp: ${pkg} demoted`);
    return true;
  },

  async reboot(): Promise<void> {
    if (shouldUseMock()) return;
    await ksuExec('svc power reboot');
  },

  async runScanner(): Promise<void> {
    if (shouldUseMock()) {
      await new Promise(r => setTimeout(r, 1500));
      return;
    }
    log.info('api', 'runScanner: starting app scan');
    const { errno, stderr } = await execBin('scan --refresh --json', 60000);
    if (errno !== 0) {
      log.error('api', 'runScanner failed', stderr);
    } else {
      log.info('api', 'runScanner: completed');
    }
  },

  async refreshIcons(): Promise<number> {
    if (shouldUseMock()) {
      await new Promise(r => setTimeout(r, 800));
      return 0;
    }
    log.info('api', 'refreshIcons: regenerating missing icons');
    const { errno, stdout, stderr } = await execBin('scan --icons-only', 60000);
    if (errno !== 0) {
      log.error('api', 'refreshIcons failed', stderr);
      return 0;
    }
    const count = parseInt(stdout.trim()) || 0;
    log.info('api', `refreshIcons: ${count} new icons generated`);
    return count;
  },

  async runVerify(): Promise<void> {
    if (shouldUseMock()) {
      await new Promise(r => setTimeout(r, 1000));
      return;
    }
    log.info('api', 'runVerify: starting verification');
    const { errno, stderr } = await execBin('verify --json', 60000);
    if (errno !== 0) {
      log.error('api', 'runVerify failed', stderr);
    } else {
      log.info('api', 'runVerify: completed');
    }
  },

  async exportPackageList(): Promise<{ success: boolean; filename?: string; error?: string }> {
    if (shouldUseMock()) {
      return { success: true, filename: 'scalpel_packages_2026-02-01.txt' };
    }
    const date = new Date().toISOString().slice(0, 10);
    const filename = `scalpel_packages_${date}.txt`;
    const dest = `${PATHS.DOWNLOAD_DIR}/${filename}`;
    const { errno, stderr } = await execBin(`export-packages --output=${escapeShellArg(dest)}`, 5000);
    if (errno !== 0) {
      log.error('api', 'exportPackageList failed', stderr);
      return { success: false, error: stderr || 'Export failed' };
    }
    log.info('api', `exportPackageList: saved to ${filename}`);
    return { success: true, filename };
  },

  parseImportedPackages(input: string): string[] {
    const trimmed = input.trim();
    if (!trimmed) return [];

    // Canta JSON format: {"apps": [{"packageName": "..."}]}
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const data = JSON.parse(trimmed);
        if (data.apps && Array.isArray(data.apps)) {
          return data.apps
            .filter((app: { packageName?: string }) => app.packageName)
            .map((app: { packageName: string }) => app.packageName.trim())
            .filter(Boolean);
        }
      } catch {
        // Not valid JSON, fall through to plain text
      }
    }

    // Plain text: one package per line
    return trimmed.split('\n').map(line => line.trim()).filter(Boolean);
  },

  async setConfigValue(key: string, value: string): Promise<boolean> {
    if (shouldUseMock()) return true;
    log.debug('api', `setConfigValue: ${key}=${value}`);
    const { errno, stderr } = await execBin(`config set ${escapeShellArg(key)} ${escapeShellArg(value)}`, 5000);
    if (errno !== 0) {
      log.error('api', `setConfigValue: failed for ${key}`, stderr);
      return false;
    }
    return true;
  },

  async syncDescription(): Promise<void> {
    if (shouldUseMock()) return;
    await execBin('sync-description', 5000);
  },
};
