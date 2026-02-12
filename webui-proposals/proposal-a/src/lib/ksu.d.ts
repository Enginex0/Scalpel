interface KsuPackageInfo {
  packageName: string;
  appLabel: string;
  versionName?: string;
  versionCode?: number;
  uid?: number;
  targetSdkVersion?: number;
  isSystemApp?: boolean;
  isSystem?: boolean;
}

interface KsuNativeApi {
  exec(cmd: string, options: string, callbackName: string): void;
  listPackages?(type: string): string;
  getPackagesInfo?(packageNamesJson: string): string;
  toast?(message: string): void;
  fullScreen?(isFullScreen: boolean): void;
  moduleInfo?(): string;
  spawn?(command: string, optionsJson: string, callbackName: string): number;
}

declare global {
  var ksu: KsuNativeApi | undefined;

  interface Window {
    [key: `ksu_api_cb_${string}`]: ((errno: number, stdout: string, stderr: string) => void) | undefined;
    [key: `exec_cb_${string}`]: ((errno: number, stdout: string, stderr: string) => void) | undefined;
  }
}

declare module 'kernelsu' {
  export function exec(command: string): Promise<{ errno: number; stdout: string; stderr: string }>;
  export function listPackages(type?: 'user' | 'system' | 'all'): string[];
  export function getPackagesInfo(packages: string[]): KsuPackageInfo[];
  export function spawn(command: string, env?: Record<string, string>, cwd?: string): {
    stdout: ReadableStream<string>;
    stderr: ReadableStream<string>;
    exitCode: Promise<number>;
  };
}

export type { KsuNativeApi, KsuPackageInfo };
