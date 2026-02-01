import { createSignal, Show, For } from 'solid-js';
import { store } from '../lib/store';
import { BottomSheet } from '../App';
import { ICONS } from '../lib/icons';
import { accentPresets } from '../lib/theme';

function Icon(props: { path: string; size?: number }) {
  return (
    <svg width={props.size || 24} height={props.size || 24} viewBox="0 0 24 24" fill="currentColor">
      <path d={props.path} />
    </svg>
  );
}

const modeOptions = [
  { value: '', label: 'Auto-detect', desc: 'Best mode selected at each boot' },
  { value: 'zeromount', label: 'ZeroMount VFS', desc: 'Requires ZeroMount kernel module' },
  { value: 'mountify', label: 'Mountify (tmpfs)', desc: 'Standalone tmpfs+overlayfs' },
  { value: 'symlink', label: 'Symlink Overlay', desc: 'Symlink + overlayfs' },
  { value: 'whiteout', label: 'Whiteout', desc: 'Overlayfs char device whiteouts' },
  { value: 'magisk', label: 'Magisk Mount', desc: 'Magic mount file overlay' },
  { value: 'pm', label: 'Package Manager', desc: 'pm disable/uninstall (slowest)' },
];

const logLevelOptions = [
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warning' },
  { value: 'error', label: 'Error' },
  { value: 'fatal', label: 'Fatal' },
];

const themeOptions: { value: 'light' | 'dark' | 'amoled' | 'auto'; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'amoled', label: 'AMOLED' },
  { value: 'auto', label: 'System' },
];

function Toggle(props: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => props.onChange(!props.checked)}
      style={`
        position: relative; width: 48px; height: 28px;
        border-radius: 14px; padding: 0;
        background: ${props.checked ? 'var(--accent)' : 'var(--surface-hover)'};
        border: 1px solid ${props.checked ? 'transparent' : 'var(--border)'};
        transition: background 300ms ease, border-color 300ms ease;
      `}
    >
      <div style={`
        position: absolute; top: 3px;
        left: ${props.checked ? '22px' : '3px'};
        width: 20px; height: 20px; border-radius: 10px;
        background: white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.2);
        transition: left 200ms var(--ease-spring);
      `} />
    </button>
  );
}

function Stepper(props: { value: number; min: number; max: number; step: number; label: string; onChange: (v: number) => void }) {
  return (
    <div style="display: flex; align-items: center; gap: 12px;">
      <button
        onClick={() => props.onChange(Math.max(props.min, props.value - props.step))}
        style={`
          width: 36px; height: 36px; border-radius: var(--radius-sm);
          background: var(--surface-hover); display: flex; align-items: center;
          justify-content: center; color: var(--text-secondary);
          transition: transform 200ms var(--ease-spring);
        `}
        onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.9)')}
        onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        <Icon path={ICONS.minus} size={18} />
      </button>
      <span style="font-size: 15px; font-weight: 600; min-width: 48px; text-align: center;">
        {props.value}{props.label}
      </span>
      <button
        onClick={() => props.onChange(Math.min(props.max, props.value + props.step))}
        style={`
          width: 36px; height: 36px; border-radius: var(--radius-sm);
          background: var(--surface-hover); display: flex; align-items: center;
          justify-content: center; color: var(--text-secondary);
          transition: transform 200ms var(--ease-spring);
        `}
        onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.9)')}
        onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        <Icon path={ICONS.plus} size={18} />
      </button>
    </div>
  );
}

export function SettingsTab() {
  const [showModeSheet, setShowModeSheet] = createSignal(false);
  const [showLogSheet, setShowLogSheet] = createSignal(false);

  const c = () => store.config();
  const currentModeLabel = () => {
    const val = c()?.SCALPEL_MODE_OVERRIDE || '';
    return modeOptions.find(o => o.value === val)?.label || 'Auto-detect';
  };
  const currentLogLabel = () => {
    const val = c()?.SCALPEL_LOG_LEVEL || 'info';
    return logLevelOptions.find(o => o.value === val)?.label || 'Info';
  };

  const monitorInterval = () => parseInt(c()?.SCALPEL_MONITOR_INTERVAL || '300', 10);

  return (
    <div class="page-content">
      {/* Debloat Settings */}
      <div class="stagger-1" style={`
        background: var(--surface); border-radius: var(--radius-xl);
        padding: 4px 0; margin-bottom: 16px; border: 1px solid var(--border);
      `}>
        <div style="padding: 14px 16px; font-size: 12px; font-weight: 600; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em;">
          Debloat Engine
        </div>

        {/* Mode Override */}
        <button
          onClick={() => setShowModeSheet(true)}
          style={`
            width: 100%; padding: 14px 16px; display: flex; align-items: center;
            justify-content: space-between; text-align: left;
          `}
        >
          <div>
            <div style="font-size: 14px; font-weight: 500;">Mode Override</div>
            <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 2px;">
              Force a specific debloat mode
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 13px; color: var(--accent); font-weight: 500;">{currentModeLabel()}</span>
            <Icon path={ICONS.chevronRight} size={16} />
          </div>
        </button>

        <div style="height: 1px; background: var(--border); margin: 0 16px;" />

        {/* Log Level */}
        <button
          onClick={() => setShowLogSheet(true)}
          style={`
            width: 100%; padding: 14px 16px; display: flex; align-items: center;
            justify-content: space-between; text-align: left;
          `}
        >
          <div>
            <div style="font-size: 14px; font-weight: 500;">Log Level</div>
            <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 2px;">
              Minimum severity to record
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 13px; color: var(--accent); font-weight: 500;">{currentLogLabel()}</span>
            <Icon path={ICONS.chevronRight} size={16} />
          </div>
        </button>

        <div style="height: 1px; background: var(--border); margin: 0 16px;" />

        {/* Refresh on Boot */}
        <div style="padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-size: 14px; font-weight: 500;">Refresh on Boot</div>
            <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 2px;">
              Re-scan system apps on next boot
            </div>
          </div>
          <Toggle
            checked={c()?.SCALPEL_REFRESH_APPLIST === 'true'}
            onChange={(v) => store.updateConfig('SCALPEL_REFRESH_APPLIST', v ? 'true' : 'false')}
          />
        </div>

        <div style="height: 1px; background: var(--border); margin: 0 16px;" />

        {/* Disable Only */}
        <div style="padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-size: 14px; font-weight: 500;">Disable Only</div>
            <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 2px;">
              Use pm disable instead of uninstall
            </div>
          </div>
          <Toggle
            checked={c()?.SCALPEL_DISABLE_ONLY === 'true'}
            onChange={(v) => store.updateConfig('SCALPEL_DISABLE_ONLY', v ? 'true' : 'false')}
          />
        </div>

        <div style="height: 1px; background: var(--border); margin: 0 16px;" />

        {/* Monitor Interval */}
        <div style="padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-size: 14px; font-weight: 500;">Monitor Interval</div>
            <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 2px;">
              Background check frequency
            </div>
          </div>
          <Stepper
            value={monitorInterval()}
            min={60}
            max={3600}
            step={60}
            label="s"
            onChange={(v) => store.updateConfig('SCALPEL_MONITOR_INTERVAL', String(v))}
          />
        </div>
      </div>

      {/* Appearance */}
      <div class="stagger-2" style={`
        background: var(--surface); border-radius: var(--radius-xl);
        padding: 4px 0; margin-bottom: 16px; border: 1px solid var(--border);
      `}>
        <div style="padding: 14px 16px; font-size: 12px; font-weight: 600; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em;">
          Appearance
        </div>

        {/* Theme */}
        <div style="padding: 14px 16px;">
          <div style="font-size: 14px; font-weight: 500; margin-bottom: 10px;">Theme</div>
          <div style="display: flex; gap: 8px;">
            <For each={themeOptions}>
              {(opt) => (
                <button
                  onClick={() => store.updateSettings({ theme: opt.value })}
                  style={`
                    flex: 1; padding: 10px 8px; border-radius: var(--radius-sm);
                    background: ${store.settings.theme === opt.value ? 'rgba(var(--accent-rgb), 0.15)' : 'var(--surface-hover)'};
                    border: 1.5px solid ${store.settings.theme === opt.value ? 'var(--accent)' : 'transparent'};
                    color: ${store.settings.theme === opt.value ? 'var(--accent)' : 'var(--text-secondary)'};
                    font-size: 12px; font-weight: 600;
                    transition: all 200ms ease;
                  `}
                >
                  {opt.label}
                </button>
              )}
            </For>
          </div>
        </div>

        <div style="height: 1px; background: var(--border); margin: 0 16px;" />

        {/* Accent Color */}
        <div style="padding: 14px 16px;">
          <div style="font-size: 14px; font-weight: 500; margin-bottom: 10px;">Accent Color</div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <For each={Object.entries(accentPresets)}>
              {([key, preset]) => (
                <button
                  onClick={() => store.updateSettings({ accentColor: key })}
                  style={`
                    width: 40px; height: 40px; border-radius: 50%;
                    background: ${preset.hex};
                    border: 3px solid ${store.settings.accentColor === key ? 'var(--text)' : 'transparent'};
                    transition: border-color 200ms ease, transform 200ms var(--ease-spring);
                    box-shadow: ${store.settings.accentColor === key ? `0 0 12px ${preset.hex}40` : 'none'};
                  `}
                  onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.9)')}
                  onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  title={preset.name}
                />
              )}
            </For>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div class="stagger-3" style={`
        background: var(--surface); border-radius: var(--radius-xl);
        padding: 16px; margin-bottom: 16px; border: 1px solid var(--border);
      `}>
        <div style="font-size: 12px; font-weight: 600; color: var(--danger); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">
          Danger Zone
        </div>
        <button
          onClick={() => {
            store.updateConfig('SCALPEL_MODE_OVERRIDE', '');
            store.updateConfig('SCALPEL_LOG_LEVEL', 'info');
            store.updateConfig('SCALPEL_REFRESH_APPLIST', 'false');
            store.updateConfig('SCALPEL_DISABLE_ONLY', 'false');
            store.updateConfig('SCALPEL_MONITOR_INTERVAL', '300');
          }}
          style={`
            width: 100%; padding: 14px; border-radius: var(--radius-md);
            background: transparent; color: var(--danger);
            border: 1.5px solid rgba(239,68,68,0.3);
            font-size: 14px; font-weight: 600;
            transition: all 200ms ease;
          `}
        >
          Reset All Settings
        </button>
      </div>

      {/* Version */}
      <div class="stagger-4" style="text-align: center; padding: 12px 0;">
        <div style="font-size: 12px; color: var(--text-tertiary);">
          Scalpel {store.moduleProp()?.version || 'v0.1.0'}
        </div>
        <div style="font-size: 11px; color: var(--text-tertiary); margin-top: 2px;">
          {store.moduleProp()?.description || ''}
        </div>
      </div>

      {/* Mode Selection Bottom Sheet */}
      <BottomSheet
        open={showModeSheet()}
        onClose={() => setShowModeSheet(false)}
        title="Select Mode"
      >
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <For each={modeOptions}>
            {(opt) => {
              const selected = () => (c()?.SCALPEL_MODE_OVERRIDE || '') === opt.value;
              return (
                <button
                  onClick={() => { store.updateConfig('SCALPEL_MODE_OVERRIDE', opt.value); setShowModeSheet(false); }}
                  style={`
                    padding: 14px 16px; border-radius: var(--radius-md);
                    background: ${selected() ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent'};
                    border: 1px solid ${selected() ? 'rgba(var(--accent-rgb), 0.2)' : 'transparent'};
                    text-align: left; width: 100%;
                    transition: background 200ms ease;
                  `}
                >
                  <div style={`font-size: 14px; font-weight: 500; color: ${selected() ? 'var(--accent)' : 'var(--text)'};`}>
                    {opt.label}
                  </div>
                  <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 2px;">
                    {opt.desc}
                  </div>
                </button>
              );
            }}
          </For>
        </div>
      </BottomSheet>

      {/* Log Level Bottom Sheet */}
      <BottomSheet
        open={showLogSheet()}
        onClose={() => setShowLogSheet(false)}
        title="Log Level"
      >
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <For each={logLevelOptions}>
            {(opt) => {
              const selected = () => (c()?.SCALPEL_LOG_LEVEL || 'info') === opt.value;
              return (
                <button
                  onClick={() => { store.updateConfig('SCALPEL_LOG_LEVEL', opt.value); setShowLogSheet(false); }}
                  style={`
                    padding: 14px 16px; border-radius: var(--radius-md);
                    background: ${selected() ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent'};
                    border: 1px solid ${selected() ? 'rgba(var(--accent-rgb), 0.2)' : 'transparent'};
                    text-align: left; width: 100%;
                    font-size: 14px; font-weight: 500;
                    color: ${selected() ? 'var(--accent)' : 'var(--text)'};
                  `}
                >
                  {opt.label}
                </button>
              );
            }}
          </For>
        </div>
      </BottomSheet>
    </div>
  );
}
