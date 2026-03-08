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

async function readJsonFile<T>(path: string): Promise<T> {
  const { errno, stdout, stderr } = await ksuExec(`cat ${escapeShellArg(path)}`);
  if (errno !== 0) {
    log.error('api', `readJsonFile failed: ${path}`, stderr);
    throw new Error(`Failed to read ${path}: ${stderr}`);
  }
  return JSON.parse(stdout);
}

async function writeJsonFile(path: string, data: unknown): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const { errno, stderr } = await ksuExec(`cat > ${escapeShellArg(path)} << 'SCALPEL_EOF'\n${json}\nSCALPEL_EOF`);
  if (errno !== 0) {
    log.error('api', `writeJsonFile failed: ${path}`, stderr);
    throw new Error(`Failed to write ${path}: ${stderr}`);
  }
}

async function getMock() {
  return import('./api.mock');
}

async function syncDescription(): Promise<void> {
  const jq = `${PATHS.MODULE_DIR}/bin/jq`;
  const prop = `${PATHS.MODULE_DIR}/module.prop`;
  const cmd = `
    jq="${jq}"; [ ! -x "$jq" ] && jq=jq
    d=$("$jq" 'length' ${PATHS.NUKE_LIST} 2>/dev/null || echo 0)
    s=$("$jq" 'length' ${PATHS.SYSTEMIZE_LIST} 2>/dev/null || echo 0)
    m=$("$jq" -r '.mode // "none"' ${PATHS.STATUS} 2>/dev/null || echo none)
    desc="😴 Idle — Ready to operate"
    if [ "$d" -gt 0 ] 2>/dev/null || [ "$s" -gt 0 ] 2>/dev/null; then
      desc="⚕️ Active"
      [ "$d" -gt 0 ] 2>/dev/null && desc="$desc | $d Debloated"
      [ "$s" -gt 0 ] 2>/dev/null && desc="$desc | $s Systemized"
      [ "$m" != "none" ] && desc="$desc | $m"
    fi
    awk -v d="$desc" '{if(/^description=/){print "description=" d}else{print}}' ${prop} > ${prop}.tmp.$$ \
      && mv ${prop}.tmp.$$ ${prop} \
      || rm -f ${prop}.tmp.$$
    KSU_MODULE=scalpel /data/adb/ksud module config set override.description "$desc" 2>/dev/null
  `;
  await ksuExec(cmd);
}

export const api = {
  async getScannedApps(): Promise<ScannedApp[]> {
    if (shouldUseMock()) return (await getMock()).MOCK_SCANNED;
    try {
      return await readJsonFile<ScannedApp[]>(PATHS.APP_LIST);
    } catch (e) {
      log.warn('api', 'getScannedApps failed', String(e));
      return [];
    }
  },

  async getNukedApps(): Promise<DebloatedApp[]> {
    if (shouldUseMock()) return [...(await getMock()).MOCK_NUKED];
    try {
      return await readJsonFile<DebloatedApp[]>(PATHS.NUKE_LIST);
    } catch (e) {
      log.debug('api', 'getNukedApps: no nuke list yet', String(e));
      return [];
    }
  },

  async getPromotedApps(): Promise<SystemizedApp[]> {
    if (shouldUseMock()) return [...(await getMock()).MOCK_PROMOTED];
    try {
      return await readJsonFile<SystemizedApp[]>(PATHS.SYSTEMIZE_LIST);
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
      const raw = await readJsonFile<Partial<StatusData>>(PATHS.STATUS);
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
      return {
        mode: 'none', debloated: 0, debloat_failed: 0, systemized: 0,
        partial: false, last_nuke: 'never',
      };
    }
  },

  async getBootInfo(): Promise<BootInfo> {
    if (shouldUseMock()) return { ...(await getMock()).MOCK_BOOT_INFO };
    try {
      const { errno, stdout, stderr } = await ksuExec(`cat ${escapeShellArg(PATHS.COUNT)}`);
      if (errno !== 0) {
        log.debug('api', 'getBootInfo: count file not found', stderr);
        return { boot_count: 0 };
      }
      const match = stdout.match(/BOOTCOUNT=(-?\d+)/);
      return { boot_count: match ? parseInt(match[1], 10) : 0 };
    } catch (e) {
      log.warn('api', 'getBootInfo failed', String(e));
      return { boot_count: 0 };
    }
  },

  async getMonitorInfo(): Promise<MonitorInfo> {
    if (shouldUseMock()) return { ...(await getMock()).MOCK_MONITOR_INFO };
    try {
      const { errno: pidErr, stdout: pidOut } = await ksuExec(
        `kill -0 $(cat ${escapeShellArg(PATHS.MONITOR_PID)} 2>/dev/null) 2>/dev/null && echo "running" || echo "stopped"`
      );
      const running = pidErr === 0 && pidOut.trim() === 'running';

      const { stdout: cfgOut } = await ksuExec(`cat ${escapeShellArg(PATHS.CONFIG)}`);
      const intervalMatch = cfgOut.match(/SCALPEL_MONITOR_INTERVAL="(\d+)"/);
      const interval = intervalMatch ? parseInt(intervalMatch[1], 10) : 300;

      return { running, interval };
    } catch (e) {
      log.warn('api', 'getMonitorInfo failed', String(e));
      return { running: false, interval: 300 };
    }
  },

  async getLogLines(lines = 50): Promise<string[]> {
    if (shouldUseMock()) return [...(await getMock()).MOCK_LOG_LINES];
    try {
      const { errno, stdout, stderr } = await ksuExec(`tail -${lines} ${escapeShellArg(PATHS.DEBUG_LOG)}`);
      if (errno !== 0) {
        log.debug('api', 'getLogLines: log file not found', stderr);
        return [];
      }
      return stdout.split('\n').filter(Boolean);
    } catch (e) {
      log.warn('api', 'getLogLines failed', String(e));
      return [];
    }
  },

  async runDiagnostics(): Promise<string[]> {
    if (shouldUseMock()) return [...(await getMock()).MOCK_LOG_LINES];
    const { errno, stdout } = await ksuExec(`sh ${PATHS.MODULE_DIR}/core/diagnostics.sh dump`, 30000);
    if (errno !== 0) return [];
    return stdout.split('\n');
  },

  async clearLog(): Promise<boolean> {
    if (shouldUseMock()) return true;
    const { errno } = await ksuExec(`> ${escapeShellArg(PATHS.DEBUG_LOG)}`);
    return errno === 0;
  },

  async saveDiagToDownload(): Promise<{ success: boolean; filename?: string }> {
    if (shouldUseMock()) return { success: true, filename: 'scalpel_diag.log' };
    const date = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const filename = `scalpel_diag_${date}.log`;
    const dest = `${PATHS.DOWNLOAD_DIR}/${filename}`;
    const { errno } = await ksuExec(`sh ${PATHS.MODULE_DIR}/core/diagnostics.sh dump > ${escapeShellArg(dest)}`, 30000);
    if (errno !== 0) return { success: false };
    log.info('api', `saveDiagToDownload: saved to ${filename}`);
    return { success: true, filename };
  },

  async nukeApps(entries: DebloatedApp[]): Promise<{ success: string[]; failed: string[] }> {
    if (shouldUseMock()) {
      await new Promise(r => setTimeout(r, 800));
      return { success: entries.map(e => e.package_name), failed: [] };
    }

    let currentList: DebloatedApp[] = [];
    try {
      currentList = await readJsonFile<DebloatedApp[]>(PATHS.NUKE_LIST);
    } catch { /* empty list if file doesn't exist */ }

    const existingPkgs = new Set(currentList.map(a => a.package_name));
    for (const entry of entries) {
      if (!existingPkgs.has(entry.package_name)) {
        currentList.push(entry);
      }
    }

    await writeJsonFile(PATHS.NUKE_LIST, currentList);

    log.info('api', `nukeApps: running nuke.sh for ${entries.length} apps`);
    const { errno, stderr } = await ksuExec(`sh ${PATHS.MODULE_DIR}/core/nuke.sh`, 60000);
    if (errno !== 0) {
      log.error('api', 'nukeApps: nuke.sh failed', stderr);
      return { success: [], failed: entries.map(e => e.package_name) };
    }
    log.info('api', `nukeApps: completed successfully`);
    syncDescription();
    return { success: entries.map(e => e.package_name), failed: [] };
  },

  async restoreApp(pkg: string, appPath: string): Promise<boolean> {
    if (shouldUseMock()) {
      await new Promise(r => setTimeout(r, 500));
      return true;
    }

    let currentList: DebloatedApp[] = [];
    try {
      currentList = await readJsonFile<DebloatedApp[]>(PATHS.NUKE_LIST);
    } catch { return false; }

    const updated = currentList.filter(a => a.package_name !== pkg);
    await writeJsonFile(PATHS.NUKE_LIST, updated);

    log.info('api', `restoreApp: restoring ${pkg}`);
    const cmd = `MODDIR=${PATHS.MODULE_DIR}; . $MODDIR/core/nuke.sh; nuke_restore ${escapeShellArg(pkg)} ${escapeShellArg(appPath)}`;
    const { errno, stderr } = await ksuExec(cmd);
    if (errno !== 0) {
      log.error('api', `restoreApp: failed for ${pkg}`, stderr);
      return false;
    }
    log.info('api', `restoreApp: ${pkg} restored`);
    syncDescription();
    return true;
  },

  async getModuleVersion(): Promise<string> {
    if (shouldUseMock()) return 'v0.1.0';
    try {
      const { errno, stdout } = await ksuExec(`grep '^version=' ${PATHS.MODULE_DIR}/module.prop`);
      if (errno !== 0) return 'unknown';
      return stdout.trim().replace('version=', '') || 'unknown';
    } catch {
      return 'unknown';
    }
  },

  async getMetamoduleInfo(): Promise<MetamoduleInfo> {
    if (shouldUseMock()) return { id: 'meta-zeromount', name: 'ZeroMount' };
    try {
      const cmd = `MODDIR=${PATHS.MODULE_DIR}; . $MODDIR/core/logging.sh; log_init 2>/dev/null; . $MODDIR/core/detect.sh; detect_metamodule`;
      const { errno, stdout } = await ksuExec(cmd);
      if (errno !== 0 || !stdout.trim()) return { id: '', name: 'none' };
      const [id, name] = stdout.trim().split('|', 2);
      return { id: id || '', name: name || 'unknown' };
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
    const nameArg = appName ? ` ${escapeShellArg(appName)}` : '';
    const { errno, stderr } = await ksuExec(`sh ${PATHS.MODULE_DIR}/systemize/promote.sh promote ${escapeShellArg(pkg)} ${target}${nameArg}`);
    if (errno !== 0) {
      log.error('api', `promoteApp: failed for ${pkg}`, stderr);
      return false;
    }
    log.info('api', `promoteApp: ${pkg} promoted`);
    syncDescription();
    return true;
  },

  async demoteApp(pkg: string): Promise<boolean> {
    if (shouldUseMock()) {
      await new Promise(r => setTimeout(r, 500));
      return true;
    }
    log.info('api', `demoteApp: demoting ${pkg}`);
    const { errno, stderr } = await ksuExec(`sh ${PATHS.MODULE_DIR}/systemize/promote.sh demote ${escapeShellArg(pkg)}`);
    if (errno !== 0) {
      log.error('api', `demoteApp: failed for ${pkg}`, stderr);
      return false;
    }
    log.info('api', `demoteApp: ${pkg} demoted`);
    syncDescription();
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
    const { errno, stderr } = await ksuExec(`sh ${PATHS.MODULE_DIR}/core/scanner.sh refresh`, 60000);
    if (errno !== 0) {
      log.error('api', 'runScanner: scanner.sh failed', stderr);
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
    const { errno, stdout, stderr } = await ksuExec(`sh ${PATHS.MODULE_DIR}/core/scanner.sh icons`, 60000);
    if (errno !== 0) {
      log.error('api', 'refreshIcons: scanner.sh icons failed', stderr);
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
    const { errno, stderr } = await ksuExec(`sh ${PATHS.MODULE_DIR}/core/verify.sh`, 60000);
    if (errno !== 0) {
      log.error('api', 'runVerify: verify.sh failed', stderr);
    } else {
      log.info('api', 'runVerify: completed');
    }
  },

  async exportPackageList(): Promise<{ success: boolean; filename?: string; error?: string }> {
    if (shouldUseMock()) {
      return { success: true, filename: 'scalpel_packages_2026-02-01.txt' };
    }
    try {
      const nuked = await this.getNukedApps();
      if (nuked.length === 0) {
        return { success: false, error: 'No packages to export' };
      }

      const packageList = nuked.map(app => app.package_name).join('\n');
      const date = new Date().toISOString().slice(0, 10);
      const filename = `scalpel_packages_${date}.txt`;
      const filePath = `${PATHS.DOWNLOAD_DIR}/${filename}`;

      const { errno, stderr } = await ksuExec(`echo ${escapeShellArg(packageList)} > ${escapeShellArg(filePath)}`);
      if (errno !== 0) {
        log.error('api', 'exportPackageList: write failed', stderr);
        return { success: false, error: 'Failed to write file' };
      }

      log.info('api', `exportPackageList: saved to ${filename}`);
      return { success: true, filename };
    } catch (e) {
      log.error('api', 'exportPackageList failed', String(e));
      return { success: false, error: String(e) };
    }
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
    const cmd = `MODDIR=${PATHS.MODULE_DIR}; . $MODDIR/core/config.sh; config_init; config_set ${escapeShellArg(key)} ${escapeShellArg(value)}`;
    const { errno, stderr } = await ksuExec(cmd);
    if (errno !== 0) {
      log.error('api', `setConfigValue: failed for ${key}`, stderr);
      return false;
    }
    return true;
  },
};
