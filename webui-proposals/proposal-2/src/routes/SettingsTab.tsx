import { createSignal, Show } from 'solid-js'
import { store } from '../lib/store'

const MODE_OPTIONS = [
  { value: '', label: 'Auto-detect (recommended)' },
  { value: 'zeromount', label: 'ZeroMount VFS' },
  { value: 'mountify', label: 'Mountify (tmpfs)' },
  { value: 'symlink', label: 'Symlink Overlay' },
  { value: 'whiteout', label: 'Whiteout' },
  { value: 'magisk', label: 'Magisk Mount' },
  { value: 'pm', label: 'Package Manager' },
]

const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal']

const DESCRIPTIONS: Record<string, string> = {
  SCALPEL_MODE_OVERRIDE: 'Force a specific debloat mode. Leave on Auto-detect unless you know your device capabilities.',
  SCALPEL_LOG_LEVEL: 'Minimum severity to log. Debug is verbose, Error shows only failures.',
  SCALPEL_REFRESH_APPLIST: 'Re-scan system partitions on next boot. Use if apps changed outside Scalpel.',
  SCALPEL_DISABLE_ONLY: 'When using PM mode, disable instead of uninstall. Easier to restore but less thorough.',
  SCALPEL_MONITOR_INTERVAL: 'How often the background daemon checks debloated apps. Lower = more battery usage. Range: 60-3600s.',
}

function SettingRow(props: { label: string; configKey: string; children: any }) {
  return (
    <div style={{
      display: 'grid',
      'grid-template-columns': '1fr',
      padding: '8px',
      'border-bottom': '1px solid var(--border)',
      gap: '4px',
    }}>
      <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
        <span style={{ color: 'var(--text-primary)', 'font-weight': '500', 'font-size': '11px' }}>
          {props.label}
        </span>
        {props.children}
      </div>
      <div style={{ color: 'var(--text-muted)', 'font-size': '9px', 'line-height': '1.4' }}>
        {DESCRIPTIONS[props.configKey]}
      </div>
    </div>
  )
}

export function SettingsTab() {
  const cfg = () => store.config()
  const [modified, setModified] = createSignal<Set<string>>(new Set())

  function markModified(key: string) {
    const m = new Set(modified())
    m.add(key)
    setModified(m)
  }

  async function handleModeChange(val: string) {
    await store.updateConfig('SCALPEL_MODE_OVERRIDE', val)
    markModified('SCALPEL_MODE_OVERRIDE')
  }

  async function handleLogLevel(val: string) {
    await store.updateConfig('SCALPEL_LOG_LEVEL', val)
    markModified('SCALPEL_LOG_LEVEL')
  }

  async function handleToggle(key: string) {
    const current = (cfg() as any)?.[key]
    await store.updateConfig(key, current === 'true' ? 'false' : 'true')
    markModified(key)
  }

  async function handleInterval(val: string) {
    const n = parseInt(val)
    if (isNaN(n) || n < 60 || n > 3600) return
    await store.updateConfig('SCALPEL_MONITOR_INTERVAL', String(n))
    markModified('SCALPEL_MONITOR_INTERVAL')
  }

  async function resetAll() {
    await store.updateConfig('SCALPEL_MODE_OVERRIDE', '')
    await store.updateConfig('SCALPEL_LOG_LEVEL', 'info')
    await store.updateConfig('SCALPEL_REFRESH_APPLIST', 'false')
    await store.updateConfig('SCALPEL_DISABLE_ONLY', 'false')
    await store.updateConfig('SCALPEL_MONITOR_INTERVAL', '300')
    setModified(new Set())
  }

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column' }}>
      {/* Header */}
      <div style={{
        padding: '6px 8px',
        'border-bottom': '1px solid var(--border)',
        background: 'var(--bg-panel)',
        display: 'flex',
        'justify-content': 'space-between',
        'align-items': 'center',
        'font-size': '10px',
      }}>
        <span style={{ color: 'var(--text-muted)', 'font-weight': '600', 'letter-spacing': '1px', 'font-size': '9px' }}>
          CONFIGURATION
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <Show when={modified().size > 0}>
            <span style={{ color: 'var(--amber)', 'font-size': '9px', display: 'flex', 'align-items': 'center', gap: '3px' }}>
              <span style={{
                width: '5px', height: '5px', 'border-radius': '50%', background: 'var(--amber)',
                display: 'inline-block',
              }} />
              {modified().size} modified
            </span>
          </Show>
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        'grid-template-columns': '1fr',
        padding: '4px 8px',
        background: 'var(--bg-surface)',
        'border-bottom': '1px solid var(--border)',
        'font-size': '9px',
        color: 'var(--text-muted)',
        'font-weight': '500',
        'letter-spacing': '0.5px',
      }}>
        MODULE SETTINGS
      </div>

      {/* Mode override */}
      <SettingRow label="Mode Override" configKey="SCALPEL_MODE_OVERRIDE">
        <div style={{ display: 'flex', 'align-items': 'center', gap: '4px' }}>
          <Show when={modified().has('SCALPEL_MODE_OVERRIDE')}>
            <span style={{ width: '5px', height: '5px', 'border-radius': '50%', background: 'var(--amber)', display: 'inline-block' }} />
          </Show>
          <select
            value={cfg()?.SCALPEL_MODE_OVERRIDE || ''}
            onChange={(e) => handleModeChange(e.currentTarget.value)}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              'border-radius': 'var(--radius)',
              padding: '3px 6px',
              color: 'var(--text-primary)',
              'font-size': '10px',
              cursor: 'pointer',
            }}
          >
            {MODE_OPTIONS.map(opt => (
              <option value={opt.value} style={{ background: 'var(--bg-panel)', color: 'var(--text-primary)' }}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </SettingRow>

      {/* Log level */}
      <SettingRow label="Log Level" configKey="SCALPEL_LOG_LEVEL">
        <div style={{ display: 'flex', 'align-items': 'center', gap: '4px' }}>
          <Show when={modified().has('SCALPEL_LOG_LEVEL')}>
            <span style={{ width: '5px', height: '5px', 'border-radius': '50%', background: 'var(--amber)', display: 'inline-block' }} />
          </Show>
          <select
            value={cfg()?.SCALPEL_LOG_LEVEL || 'info'}
            onChange={(e) => handleLogLevel(e.currentTarget.value)}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              'border-radius': 'var(--radius)',
              padding: '3px 6px',
              color: 'var(--text-primary)',
              'font-size': '10px',
              cursor: 'pointer',
            }}
          >
            {LOG_LEVELS.map(l => (
              <option value={l} style={{ background: 'var(--bg-panel)', color: 'var(--text-primary)' }}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </SettingRow>

      {/* Refresh app list toggle */}
      <SettingRow label="Refresh App List on Boot" configKey="SCALPEL_REFRESH_APPLIST">
        <div style={{ display: 'flex', 'align-items': 'center', gap: '4px' }}>
          <Show when={modified().has('SCALPEL_REFRESH_APPLIST')}>
            <span style={{ width: '5px', height: '5px', 'border-radius': '50%', background: 'var(--amber)', display: 'inline-block' }} />
          </Show>
          <div
            class={`toggle-track ${cfg()?.SCALPEL_REFRESH_APPLIST === 'true' ? 'on' : ''}`}
            onClick={() => handleToggle('SCALPEL_REFRESH_APPLIST')}
          >
            <div class="toggle-thumb" />
          </div>
        </div>
      </SettingRow>

      {/* Disable only toggle */}
      <SettingRow label="Disable Only (PM Mode)" configKey="SCALPEL_DISABLE_ONLY">
        <div style={{ display: 'flex', 'align-items': 'center', gap: '4px' }}>
          <Show when={modified().has('SCALPEL_DISABLE_ONLY')}>
            <span style={{ width: '5px', height: '5px', 'border-radius': '50%', background: 'var(--amber)', display: 'inline-block' }} />
          </Show>
          <div
            class={`toggle-track ${cfg()?.SCALPEL_DISABLE_ONLY === 'true' ? 'on' : ''}`}
            onClick={() => handleToggle('SCALPEL_DISABLE_ONLY')}
          >
            <div class="toggle-thumb" />
          </div>
        </div>
      </SettingRow>

      {/* Monitor interval */}
      <SettingRow label="Monitor Interval" configKey="SCALPEL_MONITOR_INTERVAL">
        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
          <Show when={modified().has('SCALPEL_MONITOR_INTERVAL')}>
            <span style={{ width: '5px', height: '5px', 'border-radius': '50%', background: 'var(--amber)', display: 'inline-block' }} />
          </Show>
          <input
            type="number"
            min="60"
            max="3600"
            step="60"
            value={cfg()?.SCALPEL_MONITOR_INTERVAL || '300'}
            onChange={(e) => handleInterval(e.currentTarget.value)}
            style={{
              width: '72px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              'border-radius': 'var(--radius)',
              padding: '3px 6px',
              color: 'var(--text-primary)',
              'font-size': '10px',
              'text-align': 'right',
            }}
          />
          <span style={{ color: 'var(--text-muted)', 'font-size': '10px' }}>sec</span>
        </div>
      </SettingRow>

      {/* Version info */}
      <div style={{
        padding: '4px 8px',
        background: 'var(--bg-surface)',
        'border-bottom': '1px solid var(--border)',
        'font-size': '9px',
        color: 'var(--text-muted)',
        'font-weight': '600',
        'letter-spacing': '1px',
        'margin-top': '8px',
      }}>
        MODULE INFO
      </div>

      <div style={{ padding: '8px', 'border-bottom': '1px solid var(--border)' }}>
        <div style={{ display: 'grid', 'grid-template-columns': '100px 1fr', gap: '4px', 'font-size': '10px' }}>
          <span style={{ color: 'var(--text-muted)' }}>Version</span>
          <span>{cfg()?.SCALPEL_VERSION}</span>
          <span style={{ color: 'var(--text-muted)' }}>Module ID</span>
          <span>scalpel</span>
          <span style={{ color: 'var(--text-muted)' }}>Author</span>
          <span>{store.moduleProp()?.author}</span>
          <span style={{ color: 'var(--text-muted)' }}>Active Mode</span>
          <span style={{ color: 'var(--cyan)' }}>{(store.status()?.mode || 'none').toUpperCase()}</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{
        padding: '12px 8px',
        display: 'flex',
        gap: '8px',
        'justify-content': 'flex-end',
      }}>
        <button
          class="action-btn action-btn-danger"
          style={{ 'font-size': '10px' }}
          onClick={resetAll}
        >
          RESET ALL
        </button>
      </div>
    </div>
  )
}
