import { createSignal, For } from 'solid-js';
import { store } from '../lib/store';
import { api } from '../lib/api';
import { Card } from '../components/core/Card';
import { Button } from '../components/core/Button';
import { Toggle } from '../components/core/Toggle';
import { ImportModal } from '../components/layout/ImportModal';
import { accentPresets, accentNames } from '../lib/theme';
import { MODES, MODULE_ID, APP_VERSION } from '../lib/constants';
import { ICONS } from '../lib/icons';
import type { ModeOverride, LogLevel, ThemeMode } from '../lib/types';

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal'];
const MONITOR_STEPS = [60, 120, 300, 600, 900, 1800, 3600];

function closestStepIndex(value: number): number {
  let best = 0;
  let bestDist = Math.abs(MONITOR_STEPS[0] - value);
  for (let i = 1; i < MONITOR_STEPS.length; i++) {
    const dist = Math.abs(MONITOR_STEPS[i] - value);
    if (dist < bestDist) { best = i; bestDist = dist; }
  }
  return best;
}

const dropdownArrowUrl = () => {
  const isLight = store.settings.theme === 'light';
  const fillColor = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='${encodeURIComponent(fillColor)}'%3E%3Cpath d='M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z'/%3E%3C/svg%3E")`;
};

export function SettingsTab() {
  const accentColors = Object.keys(accentPresets);
  const [importModalOpen, setImportModalOpen] = createSignal(false);
  const [exporting, setExporting] = createSignal(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await api.exportPackageList();
      if (result.success) {
        store.showToast(`Exported to Download/${result.filename}`, 'success');
      } else {
        store.showToast(result.error || 'Export failed', 'error');
      }
    } finally {
      setExporting(false);
    }
  };

  const handleImport = (packages: string[]) => {
    if (packages.length === 0) {
      store.showToast('No valid packages found', 'error');
      return;
    }

    const scanned = store.scannedApps();
    const nukedPkgs = new Set(store.nukedApps().map(a => a.package_name));
    const matchedPackages = packages.filter(pkg =>
      scanned.some(a => a.package_name === pkg) && !nukedPkgs.has(pkg)
    );
    const alreadyNuked = packages.filter(pkg => nukedPkgs.has(pkg));
    const notFound = packages.length - matchedPackages.length - alreadyNuked.length;

    if (matchedPackages.length > 0) {
      store.setActiveTab('debloat');
      store.showToast(
        `${matchedPackages.length} found${notFound > 0 ? `, ${notFound} not on device` : ''}${alreadyNuked.length > 0 ? `, ${alreadyNuked.length} already nuked` : ''}`,
        'info'
      );
    } else if (alreadyNuked.length > 0) {
      store.showToast(`All ${alreadyNuked.length} packages already nuked`, 'info');
    } else {
      store.showToast('No matching packages found on device', 'error');
    }
  };

  const selectStyle = () => `
    width:100%;padding:10px 12px;border-radius:8px;
    background:var(--bg-surface-elevated);border:1px solid var(--glass-border);
    color:var(--text-primary);font-size:14px;
    appearance:none;
    background-image:${dropdownArrowUrl()};
    background-repeat:no-repeat;background-position:right 8px center;background-size:20px;
  `;

  return (
    <div style="padding:0 16px;display:flex;flex-direction:column;gap:16px;">
      {/* Debloat Engine */}
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">
          Debloat Engine
        </div>
        <Card variant="glass" padding="medium">
          <div style="display:flex;flex-direction:column;gap:16px;">
            <div>
              <div style="font-size:13px;font-weight:500;margin-bottom:6px;">Mode Override</div>
              <select
                value={store.settings.modeOverride}
                onChange={(e) => store.updateSettings({ modeOverride: e.currentTarget.value as ModeOverride })}
                style={selectStyle()}
              >
                <For each={MODES}>
                  {(mode) => <option value={mode.id}>{mode.name}</option>}
                </For>
              </select>
              <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">
                {MODES.find(m => m.id === store.settings.modeOverride)?.description}
              </div>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div>
                <div style="font-size:13px;font-weight:500;">Disable Only</div>
                <div style="font-size:11px;color:var(--text-tertiary);">Use pm disable instead of removal</div>
              </div>
              <Toggle checked={store.settings.disableOnly} onChange={(v) => store.updateSettings({ disableOnly: v })} />
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div>
                <div style="font-size:13px;font-weight:500;">Refresh on Boot</div>
                <div style="font-size:11px;color:var(--text-tertiary);">Re-scan apps on next boot</div>
              </div>
              <Toggle checked={store.settings.refreshOnBoot} onChange={(v) => store.updateSettings({ refreshOnBoot: v })} />
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div>
                <div style="font-size:13px;font-weight:500;">Fix Bottom Nav</div>
                <div style="font-size:11px;color:var(--text-tertiary);">Pin navigation to bottom of screen</div>
              </div>
              <Toggle checked={store.settings.fixedNav} onChange={(v) => store.updateSettings({ fixedNav: v })} />
            </div>
          </div>
        </Card>
      </div>

      {/* Monitor */}
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">
          Monitor
        </div>
        <Card variant="glass" padding="medium">
          <div style="display:flex;flex-direction:column;gap:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div>
                <div style="font-size:13px;font-weight:500;">Enable Monitor</div>
                <div style="font-size:11px;color:var(--text-tertiary);">Background repair daemon</div>
              </div>
              <Toggle checked={store.settings.monitorEnabled} onChange={(v) => store.updateSettings({ monitorEnabled: v })} />
            </div>

            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <span style="font-size:13px;font-weight:500;">Interval</span>
                <span style="font-size:13px;font-family:'JetBrains Mono',monospace;color:var(--text-accent);">{store.settings.monitorInterval}s</span>
              </div>
              <input
                type="range"
                min="0"
                max={MONITOR_STEPS.length - 1}
                value={closestStepIndex(store.settings.monitorInterval)}
                onInput={(e) => store.updateSettings({ monitorInterval: MONITOR_STEPS[parseInt(e.currentTarget.value)] })}
                style={`
                  width:100%;height:4px;border-radius:2px;
                  accent-color:var(--text-accent);
                  background:var(--bg-surface-elevated);
                `}
              />
              <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-tertiary);">
                <span>1m</span><span>1h</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Appearance */}
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">
          Appearance
        </div>
        <Card variant="glass" padding="medium">
          <div style="display:flex;flex-direction:column;gap:16px;">
            <div>
              <div style="font-size:13px;font-weight:500;margin-bottom:8px;">Theme</div>
              <div style="display:flex;gap:8px;">
                <For each={(['amoled', 'dark', 'light', 'auto'] as ThemeMode[])}>
                  {(theme) => (
                    <button
                      onClick={() => store.updateSettings({ theme })}
                      style={`
                        flex:1;padding:10px;border-radius:10px;
                        border:2px solid ${store.settings.theme === theme ? 'rgba(var(--accent-rgb), 0.6)' : 'var(--glass-border)'};
                        background:${store.settings.theme === theme ? 'rgba(var(--accent-rgb), 0.1)' : 'var(--bg-surface)'};
                        color:var(--text-primary);font-size:11px;font-weight:600;text-transform:uppercase;
                        transition:all 0.2s var(--ease-spring);cursor:pointer;
                      `}
                    >
                      {theme === 'amoled' ? 'AMOLED' : theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'Auto'}
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div>
              <div style="font-size:13px;font-weight:500;margin-bottom:8px;">Accent Color</div>
              <div style="display:flex;flex-direction:column;gap:8px;">
                <For each={accentColors}>
                  {(color) => {
                    const preset = accentPresets[color];
                    const name = accentNames[color] || color;
                    const active = () => store.settings.accentColor === color;
                    return (
                      <button
                        onClick={() => store.updateSettings({ accentColor: color, autoAccentColor: false })}
                        style={`
                          display:flex;align-items:center;gap:10px;
                          padding:8px 12px;border-radius:10px;
                          border:2px solid ${active() ? 'rgba(var(--accent-rgb), 0.6)' : 'var(--glass-border)'};
                          background:${active() ? 'rgba(var(--accent-rgb), 0.08)' : 'var(--bg-surface)'};
                          cursor:pointer;transition:all 0.2s var(--ease-spring);
                          width:100%;text-align:left;
                        `}
                      >
                        <div style={`
                          width:28px;height:28px;border-radius:50%;flex-shrink:0;
                          background:${preset.gradient};
                          box-shadow:${active() ? `0 0 12px rgba(${preset.rgb}, 0.5)` : 'none'};
                          transform:${active() ? 'scale(1.1)' : 'scale(1)'};
                          transition:all 0.2s var(--ease-spring);
                        `} />
                        <span style={`
                          font-size:13px;font-weight:${active() ? '600' : '400'};
                          color:${active() ? 'var(--text-accent)' : 'var(--text-secondary)'};
                          font-family:'Space Grotesk',system-ui,sans-serif;
                          letter-spacing:0.02em;
                        `}>{name}</span>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div>
                <div style="font-size:13px;font-weight:500;">Auto Accent</div>
                <div style="font-size:11px;color:var(--text-tertiary);">Randomize on each open</div>
              </div>
              <Toggle checked={store.settings.autoAccentColor} onChange={(v) => store.updateSettings({ autoAccentColor: v })} />
            </div>
          </div>
        </Card>
      </div>

      {/* Logging */}
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">
          Logging
        </div>
        <Card variant="glass" padding="medium">
          <div style="font-size:13px;font-weight:500;margin-bottom:6px;">Log Level</div>
          <select
            value={store.settings.logLevel}
            onChange={(e) => store.updateSettings({ logLevel: e.currentTarget.value as LogLevel })}
            style={selectStyle()}
          >
            <For each={LOG_LEVELS}>
              {(level) => <option value={level}>{level.toUpperCase()}</option>}
            </For>
          </select>
        </Card>
      </div>

      {/* Backup & Restore */}
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">
          Backup & Restore
        </div>
        <Card variant="glass" padding="medium">
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;">
              Export your debloat list for backup or transfer to another device. Import a package list to quickly select apps.
            </div>
            <div style="display:flex;gap:12px;">
              <Button
                variant="secondary"
                fullWidth
                loading={exporting()}
                onClick={handleExport}
              >
                Export List
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setImportModalOpen(true)}
              >
                Import List
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Import Modal */}
      <ImportModal
        isOpen={importModalOpen()}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImport}
        parsePackages={api.parseImportedPackages}
      />

      {/* Incision separator before About */}
      <div class="incision-line" style="margin:8px 0;" />

      {/* About */}
      <div>
        <Card variant="glass" padding="medium">
          <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px 0;">
            {/* Large blade mark with glint */}
            <div class="blade-mark-wrapper" style="width:64px;height:64px;">
              <svg viewBox="0 0 24 24" width="64" height="64">
                <defs>
                  <linearGradient id="blade-grad-about" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" style={`stop-color: var(--text-accent)`} />
                    <stop offset="50%" style="stop-color: rgba(var(--accent-rgb), 0.8)" />
                    <stop offset="100%" style="stop-color: rgba(var(--accent-rgb), 0.4)" />
                  </linearGradient>
                </defs>
                <path d={ICONS.scalpelBlade} fill="url(#blade-grad-about)" />
              </svg>
            </div>

            <h2
              class="gradient-text"
              style="font-family:'Space Grotesk',system-ui,sans-serif;font-size:24px;font-weight:700;letter-spacing:0.08em;margin:0;"
            >
              SCALPEL
            </h2>

            <div style="font-size:12px;color:var(--text-tertiary);font-style:italic;letter-spacing:0.03em;">
              Surgical precision for your device
            </div>

            <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-tertiary);">
              v{APP_VERSION}
            </div>

            <div class="incision-line" style="width:60%;margin:8px 0;" />

            <div style="display:flex;flex-direction:column;gap:6px;width:100%;font-size:13px;">
              <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--text-tertiary);">Module ID</span>
                <span style="font-family:'JetBrains Mono',monospace;">{MODULE_ID}</span>
              </div>
              <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--text-tertiary);">Active Mode</span>
                <span class="gradient-text" style="font-weight:600;">{store.status.mode}</span>
              </div>
              <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--text-tertiary);">Metamodule</span>
                <span style="font-family:'JetBrains Mono',monospace;">{store.metamoduleInfo().name}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div style="height:16px;" />
    </div>
  );
}
