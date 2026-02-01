import { Show, For } from 'solid-js';
import { store } from '../lib/store.ts';

const MODE_NAMES: Record<string, string> = {
  zeromount: 'ZeroMount VFS',
  mountify: 'Mountify (tmpfs)',
  symlink: 'Symlink Overlay',
  whiteout: 'Whiteout',
  magisk: 'Magisk Mount',
  pm: 'Package Manager',
  pm_deferred: 'PM (deferred)',
  running: 'In progress',
  none: 'None',
  error: 'Error',
  unknown: 'Unknown',
};

function formatTime(iso: string): string {
  if (!iso || iso === 'never') return 'Never';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function InfoRow(props: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      display: 'flex',
      'justify-content': 'space-between',
      'align-items': 'center',
      padding: '8px 0',
    }}>
      <span style={{ 'font-size': '13px', color: 'var(--text-2)' }}>{props.label}</span>
      <span style={{
        'font-size': '13px',
        'font-weight': '500',
        color: props.color || 'var(--text-1)',
        'font-family': 'var(--mono)',
      }}>
        {props.value}
      </span>
    </div>
  );
}

function Section(props: { title: string; children: any }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      'border-radius': 'var(--radius)',
      padding: '12px 14px',
      'margin-bottom': '8px',
    }}>
      <div style={{
        'font-size': '10px',
        'text-transform': 'uppercase',
        'letter-spacing': '0.08em',
        color: 'var(--text-3)',
        'margin-bottom': '8px',
        'font-weight': '500',
      }}>
        {props.title}
      </div>
      {props.children}
    </div>
  );
}

function LogLevel(props: { level: string }) {
  const colors: Record<string, string> = {
    DEBUG: 'var(--text-3)',
    INFO: 'var(--text-2)',
    WARN: 'var(--warning)',
    ERROR: 'var(--danger)',
    FATAL: 'var(--danger)',
  };
  return (
    <span style={{
      color: colors[props.level] || 'var(--text-2)',
      'font-weight': props.level === 'FATAL' ? '600' : '400',
    }}>
      {props.level}
    </span>
  );
}

export function StatusTab() {
  const s = () => store.status();
  const bootColor = () => {
    const c = store.bootCount();
    if (c === 0) return 'var(--success)';
    if (c <= 2) return 'var(--warning)';
    return 'var(--danger)';
  };

  const logLines = () => {
    const text = store.logText();
    if (!text) return [];
    return text.split('\n').filter(Boolean).slice(-20);
  };

  return (
    <div style={{ 'padding-top': '12px' }}>
      <Section title="Mode">
        <InfoRow label="Active mode" value={MODE_NAMES[s()?.mode || 'unknown'] || s()?.mode || 'Unknown'} />
        <InfoRow
          label="Detection"
          value={store.config()?.SCALPEL_MODE_OVERRIDE ? 'Manual override' : 'Auto-detected'}
        />
      </Section>

      <Section title="Protection">
        <InfoRow
          label="Boot count"
          value={`${store.bootCount()} / 3`}
          color={bootColor()}
        />
        <Show when={store.bootCount() > 0}>
          <div style={{
            padding: '6px 10px',
            background: 'var(--warning-light)',
            'border-radius': '4px',
            'font-size': '12px',
            color: 'var(--warning)',
            'margin-top': '4px',
          }}>
            Device rebooted unexpectedly. {store.bootCount()}/3 strikes before bootloop protection triggers.
          </div>
        </Show>
      </Section>

      <Section title="Debloat">
        <InfoRow label="Debloated" value={String(s()?.debloated ?? 0)} />
        <InfoRow
          label="Failed"
          value={String(s()?.debloat_failed ?? 0)}
          color={s()?.debloat_failed ? 'var(--danger)' : undefined}
        />
        <InfoRow
          label="Verified"
          value={String(s()?.debloat_verified ?? 0)}
          color="var(--success)"
        />
        <InfoRow
          label="Broken"
          value={String(s()?.debloat_broken ?? 0)}
          color={s()?.debloat_broken ? 'var(--warning)' : undefined}
        />
        <InfoRow label="Last nuke" value={formatTime(s()?.last_nuke || 'never')} />
        <InfoRow label="Last verify" value={formatTime(s()?.last_verify || 'never')} />
      </Section>

      <Section title="Monitor">
        <InfoRow
          label="Status"
          value={store.monitorStatus()}
          color={store.monitorStatus() === 'running' ? 'var(--success)' : 'var(--text-3)'}
        />
        <InfoRow label="Repairs" value={String(s()?.monitor_repairs ?? 0)} />
        <InfoRow label="Last repair" value={formatTime(s()?.last_monitor || 'never')} />
      </Section>

      <Section title="Log">
        <div style={{
          'font-family': 'var(--mono)',
          'font-size': '11px',
          'line-height': '1.6',
          'max-height': '300px',
          'overflow-y': 'auto',
          padding: '8px 0',
        }}>
          <Show when={logLines().length === 0}>
            <div style={{ color: 'var(--text-3)' }}>No log entries</div>
          </Show>
          <For each={logLines()}>
            {(line) => {
              const levelMatch = line.match(/\[(DEBUG|INFO|WARN|ERROR|FATAL)\]/);
              const level = levelMatch ? levelMatch[1] : 'INFO';
              const colors: Record<string, string> = {
                DEBUG: 'var(--text-3)',
                INFO: 'var(--text-2)',
                WARN: 'var(--warning)',
                ERROR: 'var(--danger)',
                FATAL: 'var(--danger)',
              };
              return (
                <div style={{
                  color: colors[level] || 'var(--text-2)',
                  'font-weight': level === 'FATAL' ? '600' : '400',
                  'word-break': 'break-all',
                  'padding': '1px 0',
                }}>
                  {line}
                </div>
              );
            }}
          </For>
        </div>
      </Section>
    </div>
  );
}
