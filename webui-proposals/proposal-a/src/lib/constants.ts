import type { ModeInfo } from './types';

export const PATHS = {
  DATA_DIR: '/data/adb/scalpel',
  MODULE_DIR: '/data/adb/modules/scalpel',
  CONFIG: '/data/adb/scalpel/config.sh',
  STATUS: '/data/adb/scalpel/status.json',
  NUKE_LIST: '/data/adb/scalpel/nuke_list.json',
  APP_LIST: '/data/adb/scalpel/app_list.json',
  SYSTEMIZE_LIST: '/data/adb/scalpel/systemize_list.json',
  DEBUG_LOG: '/data/adb/scalpel/debug.log',
  COUNT: '/data/adb/scalpel/count.sh',
  MONITOR_PID: '/data/adb/scalpel/monitor.pid',
  ICONS_DIR: '/data/adb/scalpel/icons',
  DOWNLOAD_DIR: '/storage/emulated/0/Download',
};

export const APP_VERSION = '0.1.0';
export const MODULE_ID = 'scalpel';

export const MODES: ModeInfo[] = [
  { id: 'auto', name: 'Auto-detect', description: 'Evaluates system capabilities at each boot, selects best available mode' },
  { id: 'zeromount', name: 'ZeroMount VFS', description: 'Kernel-level VFS interception for invisible file hiding' },
  { id: 'mountify', name: 'Standalone Mount', description: 'tmpfs mounts per partition. Ephemeral (re-applied each boot)' },
  { id: 'symlink', name: 'Symlink Overlay', description: 'Empty opaque directories in module overlay' },
  { id: 'whiteout', name: 'OverlayFS Whiteout', description: 'Character device nodes treated as deleted by overlayfs' },
  { id: 'magisk', name: 'Magic Mount', description: 'Whiteout files in module directory for Magisk mount system' },
  { id: 'pm', name: 'Package Manager', description: 'pm disable-user. Universal fallback. Least stealthy' },
];

// FOUNDATION.md 10.1 -- exact category colors from categories.json
export const CATEGORY_COLORS: Record<string, { color: string; glow: string; label: string }> = {
  essential: { color: '#ff6b6b', glow: 'rgba(255, 107, 107, 0.4)', label: 'Essential' },
  caution:   { color: '#ff9800', glow: 'rgba(255, 152, 0, 0.4)',   label: 'Caution' },
  safe:      { color: '#4caf50', glow: 'rgba(76, 175, 80, 0.4)',   label: 'Safe to Remove' },
  google:    { color: '#4285f4', glow: 'rgba(66, 133, 244, 0.4)',  label: 'Google Services' },
  unknown:   { color: '#9e9e9e', glow: 'rgba(158, 158, 158, 0.4)', label: 'Unknown' },
};

// Modes that do NOT require reboot for debloat (FOUNDATION.md 5.12)
export const NO_REBOOT_DEBLOAT_MODES = new Set(['zeromount', 'mountify', 'pm']);
