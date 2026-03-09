import type { KsuPackageInfo } from './ksu.d.ts';
import { log } from './logger';

interface KsuExecResult {
  errno: number;
  stdout: string;
  stderr: string;
}

let execCounter = 0;

const VALID_PACKAGE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.]*$/;

function isKsuPackageInfo(obj: unknown): obj is KsuPackageInfo {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'packageName' in obj &&
    typeof (obj as KsuPackageInfo).packageName === 'string'
  );
}

function isValidPackageName(name: string): boolean {
  return VALID_PACKAGE_PATTERN.test(name) && name.length <= 256;
}

export async function ksuExec(cmd: string, timeoutMs = 30000): Promise<KsuExecResult> {
  const ksu = globalThis.ksu;
  if (!ksu?.exec) {
    log.warn('ksuApi', 'ksuExec: KSU not available');
    return { errno: -1, stdout: '', stderr: 'KSU not available' };
  }

  return new Promise((resolve) => {
    const callbackName = `ksu_api_cb_${Date.now()}_${execCounter++}` as const;

    const timeoutId = setTimeout(() => {
      delete window[callbackName];
      log.error('ksuApi', `ksuExec: timeout after ${timeoutMs}ms`, cmd.slice(0, 100));
      resolve({ errno: -1, stdout: '', stderr: 'timeout' });
    }, timeoutMs);

    window[callbackName] = (errno: number, stdout: string, stderr: string) => {
      clearTimeout(timeoutId);
      delete window[callbackName];
      if (errno !== 0) {
        log.debug('ksuApi', `ksuExec: errno=${errno}`, stderr.slice(0, 200));
      }
      resolve({ errno, stdout, stderr });
    };

    try {
      ksu.exec(cmd, '{}', callbackName);
    } catch (e) {
      clearTimeout(timeoutId);
      delete window[callbackName];
      log.error('ksuApi', 'ksuExec: exec threw exception', String(e));
      resolve({ errno: -1, stdout: '', stderr: 'exec failed' });
    }
  });
}

export async function listPackages(type: 'all' | 'user' | 'system' = 'all'): Promise<string[]> {
  const ksu = globalThis.ksu;

  if (ksu?.listPackages) {
    try {
      const result = ksu.listPackages(type);
      if (result) {
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed)) {
          log.debug('ksuApi', `listPackages(${type}): ${parsed.length} via native API`);
          return parsed;
        }
      }
    } catch (e) {
      log.debug('ksuApi', `listPackages(${type}): native API failed, using shell fallback`, String(e));
    }
  }

  const flags = type === 'user' ? '-3' : type === 'system' ? '-s' : '';
  const { stdout, errno, stderr } = await ksuExec(`pm list packages ${flags} | sed 's/package://'`);
  if (errno === 0 && stdout.trim()) {
    const pkgs = stdout.trim().split('\n').filter(Boolean);
    log.debug('ksuApi', `listPackages(${type}): ${pkgs.length} via pm`);
    return pkgs;
  }

  log.warn('ksuApi', `listPackages(${type}): failed`, stderr);
  return [];
}

export async function getPackagesInfo(packageNames: string[]): Promise<KsuPackageInfo[]> {
  if (!packageNames.length) return [];

  const ksu = globalThis.ksu;

  if (ksu?.getPackagesInfo) {
    try {
      const result = ksu.getPackagesInfo(JSON.stringify(packageNames));
      if (result) {
        const parsed: unknown = JSON.parse(result);
        if (Array.isArray(parsed) && parsed.every(isKsuPackageInfo)) {
          log.debug('ksuApi', `getPackagesInfo: ${parsed.length} via native API`);
          return parsed;
        }
      }
    } catch (e) {
      log.debug('ksuApi', 'getPackagesInfo: native API failed, using shell fallback', String(e));
    }
  }

  log.debug('ksuApi', `getPackagesInfo: fetching ${packageNames.length} via shell`);
  const results: KsuPackageInfo[] = [];
  for (const packageName of packageNames) {
    if (!isValidPackageName(packageName)) {
      results.push({ packageName, appLabel: packageName });
      continue;
    }
    const { stdout, errno } = await ksuExec(
      `pm path ${packageName} 2>/dev/null | head -1 | sed 's/package://' | xargs -I{} aapt dump badging {} 2>/dev/null | grep "application-label:" | head -1 | sed "s/application-label:'\\(.*\\)'/\\1/"`
    );
    results.push({
      packageName,
      appLabel: errno === 0 && stdout.trim() ? stdout.trim() : packageName,
    });
  }
  return results;
}

