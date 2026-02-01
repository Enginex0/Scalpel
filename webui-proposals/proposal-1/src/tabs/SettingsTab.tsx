import { createSignal, Show } from 'solid-js';
import { store } from '../lib/store.ts';

const MODE_OPTIONS = [
  { value: '', label: 'Auto-detect (recommended)' },
  { value: 'zeromount', label: 'ZeroMount VFS' },
  { value: 'mountify', label: 'Mountify (tmpfs)' },
  { value: 'symlink', label: 'Symlink Overlay' },
  { value: 'whiteout', label: 'Whiteout' },
  { value: 'magisk', label: 'Magisk Mount' },
  { value: 'pm', label: 'Package Manager' },
];

const LOG_OPTIONS = [
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warn' },
  { value: 'error', label: 'Error' },
  { value: 'fatal', label: 'Fatal' },
];

function FieldLabel(props: { label: string; hint?: string }) {
  return (
    <div style={{ 'margin-bottom': '6px' }}>
      <div style={{ 'font-size': '13px', 'font-weight': '500', color: 'var(--text-1)' }}>
        {props.label}
      </div>
      <Show when={props.hint}>
        <div style={{ 'font-size': '11px', color: 'var(--text-3)', 'margin-top': '2px' }}>
          {props.hint}
        </div>
      </Show>
    </div>
  );
}

function Toggle(props: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => props.onChange(!props.checked)}
      style={{
        width: '40px',
        height: '22px',
        'border-radius': '11px',
        border: 'none',
        padding: '2px',
        background: props.checked ? 'var(--accent)' : 'var(--border)',
        transition: 'background 150ms',
        position: 'relative',
        cursor: 'pointer',
        'flex-shrink': '0',
      }}
    >
      <div style={{
        width: '18px',
        height: '18px',
        'border-radius': '50%',
        background: '#fff',
        transition: 'transform 150ms',
        transform: props.checked ? 'translateX(18px)' : 'translateX(0)',
      }} />
    </button>
  );
}

export function SettingsTab() {
  const cfg = () => store.config();
  const [saved, setSaved] = createSignal(false);
  const [confirmReset, setConfirmReset] = createSignal(false);

  async function set(key: Parameters<typeof store.updateConfig>[0], value: string) {
    await store.updateConfig(key, value);
    flash();
  }

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  async function resetDefaults() {
    if (!confirmReset()) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    await store.updateConfig('SCALPEL_MODE_OVERRIDE', '');
    await store.updateConfig('SCALPEL_LOG_LEVEL', 'info');
    await store.updateConfig('SCALPEL_REFRESH_APPLIST', 'false');
    await store.updateConfig('SCALPEL_DISABLE_ONLY', 'false');
    await store.updateConfig('SCALPEL_MONITOR_INTERVAL', '300');
    flash();
  }

  return (
    <div style={{ 'padding-top': '12px' }}>
      <Show when={saved()}>
        <div style={{
          padding: '8px 12px',
          background: 'var(--success-light)',
          'border-radius': 'var(--radius)',
          'font-size': '12px',
          color: 'var(--success)',
          'margin-bottom': '12px',
          animation: 'fadeIn 200ms ease-out',
        }}>
          Settings saved
        </div>
      </Show>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        'border-radius': 'var(--radius)',
        padding: '16px',
        'margin-bottom': '8px',
      }}>
        <FieldLabel
          label="Mode Override"
          hint="Force a specific debloat mode. Leave on Auto-detect unless you know your device."
        />
        <select
          value={cfg()?.SCALPEL_MODE_OVERRIDE || ''}
          onChange={(e) => set('SCALPEL_MODE_OVERRIDE', e.currentTarget.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            'border-radius': 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text-1)',
            'font-size': '13px',
            'min-height': '48px',
            appearance: 'none',
            '-webkit-appearance': 'none',
          }}
        >
          {MODE_OPTIONS.map(opt => (
            <option value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        'border-radius': 'var(--radius)',
        padding: '16px',
        'margin-bottom': '8px',
      }}>
        <FieldLabel
          label="Log Level"
          hint="Minimum severity to log. Debug is verbose, Error shows only failures."
        />
        <select
          value={cfg()?.SCALPEL_LOG_LEVEL || 'info'}
          onChange={(e) => set('SCALPEL_LOG_LEVEL', e.currentTarget.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            'border-radius': 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text-1)',
            'font-size': '13px',
            'min-height': '48px',
            appearance: 'none',
            '-webkit-appearance': 'none',
          }}
        >
          {LOG_OPTIONS.map(opt => (
            <option value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        'border-radius': 'var(--radius)',
        padding: '16px',
        'margin-bottom': '8px',
      }}>
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
          <div>
            <FieldLabel
              label="Refresh App List on Boot"
              hint="Re-scan system partitions on next boot."
            />
          </div>
          <Toggle
            checked={cfg()?.SCALPEL_REFRESH_APPLIST === 'true'}
            onChange={(v) => set('SCALPEL_REFRESH_APPLIST', v ? 'true' : 'false')}
          />
        </div>
      </div>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        'border-radius': 'var(--radius)',
        padding: '16px',
        'margin-bottom': '8px',
      }}>
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
          <div>
            <FieldLabel
              label="Disable Only (PM mode)"
              hint="Disable instead of uninstall. Easier to restore."
            />
          </div>
          <Toggle
            checked={cfg()?.SCALPEL_DISABLE_ONLY === 'true'}
            onChange={(v) => set('SCALPEL_DISABLE_ONLY', v ? 'true' : 'false')}
          />
        </div>
      </div>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        'border-radius': 'var(--radius)',
        padding: '16px',
        'margin-bottom': '8px',
      }}>
        <FieldLabel
          label="Monitor Interval"
          hint="Background daemon check interval in seconds (60-3600)."
        />
        <div style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
          <input
            type="range"
            min="60"
            max="3600"
            step="60"
            value={cfg()?.SCALPEL_MONITOR_INTERVAL || '300'}
            onInput={(e) => set('SCALPEL_MONITOR_INTERVAL', e.currentTarget.value)}
            style={{ flex: '1' }}
          />
          <span style={{
            'font-family': 'var(--mono)',
            'font-size': '13px',
            'min-width': '45px',
            'text-align': 'right',
          }}>
            {cfg()?.SCALPEL_MONITOR_INTERVAL || '300'}s
          </span>
        </div>
      </div>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        'border-radius': 'var(--radius)',
        padding: '16px',
        'margin-bottom': '8px',
      }}>
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
          <div>
            <FieldLabel label="Dark Mode" />
          </div>
          <Toggle
            checked={store.darkMode()}
            onChange={() => {
              store.toggleDark();
              document.documentElement.classList.toggle('dark', store.darkMode());
            }}
          />
        </div>
      </div>

      <Show when={confirmReset()}>
        <div style={{
          display: 'flex',
          gap: '8px',
          'margin-top': '16px',
          'align-items': 'center',
          'justify-content': 'center',
        }}>
          <span style={{ 'font-size': '13px', color: 'var(--text-2)' }}>Reset all?</span>
          <button
            onClick={() => setConfirmReset(false)}
            style={{
              padding: '8px 16px',
              'font-size': '13px',
              'border-radius': 'var(--radius)',
              border: '1px solid var(--border)',
              color: 'var(--text-2)',
              background: 'var(--bg)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={resetDefaults}
            style={{
              padding: '8px 16px',
              'font-size': '13px',
              'border-radius': 'var(--radius)',
              border: 'none',
              color: '#fff',
              background: 'var(--danger)',
            }}
          >
            Confirm
          </button>
        </div>
      </Show>

      <Show when={!confirmReset()}>
        <button
          onClick={resetDefaults}
          style={{
            width: '100%',
            padding: '12px',
            'margin-top': '16px',
            'font-size': '13px',
            'font-weight': '500',
            color: 'var(--danger)',
            'border-radius': 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            'min-height': '48px',
          }}
        >
          Reset to Defaults
        </button>
      </Show>

      <div style={{
        'text-align': 'center',
        'margin-top': '24px',
        padding: '16px 0',
        'font-size': '11px',
        color: 'var(--text-3)',
      }}>
        Scalpel v0.1.0
      </div>
    </div>
  );
}
