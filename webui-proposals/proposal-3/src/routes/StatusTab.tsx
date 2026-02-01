import { createSignal, Show, For } from 'solid-js';
import { store } from '../lib/store';
import { ICONS } from '../lib/icons';

function Icon(props: { path: string; size?: number }) {
  return (
    <svg width={props.size || 24} height={props.size || 24} viewBox="0 0 24 24" fill="currentColor">
      <path d={props.path} />
    </svg>
  );
}

const modeDisplayNames: Record<string, { name: string; desc: string }> = {
  zeromount: { name: 'ZeroMount VFS', desc: 'Kernel-level VFS interception' },
  mountify: { name: 'Mountify', desc: 'tmpfs overlay mount' },
  symlink: { name: 'Symlink Overlay', desc: 'Symlink + overlayfs' },
  whiteout: { name: 'Whiteout', desc: 'Overlayfs char device whiteouts' },
  magisk: { name: 'Magisk Mount', desc: 'Magic mount file overlay' },
  pm: { name: 'Package Manager', desc: 'pm disable/uninstall' },
  pm_deferred: { name: 'PM (Deferred)', desc: 'Waiting for post-boot' },
  none: { name: 'None', desc: 'No debloat list' },
  error: { name: 'Error', desc: 'Mode detection failed' },
  running: { name: 'Running', desc: 'Nuke in progress' },
  unknown: { name: 'Unknown', desc: '' },
};

const logLevelColors: Record<string, string> = {
  DEBUG: 'var(--text-tertiary)',
  INFO: 'var(--text)',
  WARN: 'var(--warning)',
  ERROR: 'var(--danger)',
  FATAL: 'var(--danger)',
};

function formatTimestamp(iso: string): string {
  if (!iso || iso === 'never') return 'Never';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

export function StatusTab() {
  const [showLog, setShowLog] = createSignal(false);
  const [showActivity, setShowActivity] = createSignal(false);

  const s = () => store.status();
  const modeInfo = () => modeDisplayNames[s()?.mode || 'unknown'] || modeDisplayNames.unknown;
  const isOverridden = () => {
    const c = store.config();
    return c && c.SCALPEL_MODE_OVERRIDE !== '';
  };

  const healthColor = () => {
    const st = s();
    if (!st) return 'var(--text-tertiary)';
    if (st.debloat_broken && st.debloat_broken > 0) return 'var(--warning)';
    if (st.debloat_failed > 0) return 'var(--danger)';
    return 'var(--success)';
  };

  return (
    <div class="page-content">
      {/* Health Card */}
      <div class="stagger-1" style={`
        background: var(--surface); border-radius: var(--radius-xl);
        padding: 24px 20px; margin-bottom: 16px;
        border: 1px solid var(--border);
      `}>
        <div style="display: flex; align-items: center; gap: 16px;">
          <div style={`
            width: 56px; height: 56px; border-radius: var(--radius-lg);
            background: ${healthColor()}15;
            display: flex; align-items: center; justify-content: center;
            color: ${healthColor()};
          `}>
            <Icon path={ICONS.shield} size={28} />
          </div>
          <div>
            <div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em;">
              {modeInfo().name}
            </div>
            <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
              {modeInfo().desc}
            </div>
            <Show when={isOverridden()}>
              <span style={`
                display: inline-block; margin-top: 6px;
                padding: 2px 8px; border-radius: var(--radius-pill);
                background: rgba(var(--accent-rgb), 0.12); color: var(--accent);
                font-size: 10px; font-weight: 600;
              `}>Override Active</span>
            </Show>
          </div>
        </div>
      </div>

      {/* Stats Grid - 2 columns */}
      <div class="stagger-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
        {/* Boot Protection */}
        <div style={`
          background: var(--surface); border-radius: var(--radius-lg);
          padding: 16px; border: 1px solid var(--border);
        `}>
          <div style="font-size: 11px; color: var(--text-tertiary); font-weight: 500; margin-bottom: 8px;">
            Boot Protection
          </div>
          <div style={`
            font-size: 24px; font-weight: 700;
            color: ${store.bootCount() === 0 ? 'var(--success)' : store.bootCount() >= 2 ? 'var(--danger)' : 'var(--warning)'};
          `}>
            {store.bootCount()}/3
          </div>
          <div style="font-size: 11px; color: var(--text-tertiary); margin-top: 2px;">
            {store.bootCount() === 0 ? 'Healthy' : `${store.bootCount()} strike${store.bootCount() > 1 ? 's' : ''}`}
          </div>
        </div>

        {/* Monitor */}
        <div style={`
          background: var(--surface); border-radius: var(--radius-lg);
          padding: 16px; border: 1px solid var(--border);
        `}>
          <div style="font-size: 11px; color: var(--text-tertiary); font-weight: 500; margin-bottom: 8px;">
            Monitor
          </div>
          <div style={`
            display: flex; align-items: center; gap: 6px;
          `}>
            <span style={`
              width: 8px; height: 8px; border-radius: 50%;
              background: ${store.monitorStatus() === 'running' ? 'var(--success)' : 'var(--text-tertiary)'};
              ${store.monitorStatus() === 'running' ? 'animation: pulse 2s infinite;' : ''}
            `} />
            <span style={`
              font-size: 16px; font-weight: 600;
              color: ${store.monitorStatus() === 'running' ? 'var(--success)' : 'var(--text-tertiary)'};
            `}>
              {store.monitorStatus() === 'running' ? 'Active' : 'Stopped'}
            </span>
          </div>
          <Show when={s()?.monitor_repairs !== undefined}>
            <div style="font-size: 11px; color: var(--text-tertiary); margin-top: 2px;">
              {s()!.monitor_repairs} repairs
            </div>
          </Show>
        </div>

        {/* Debloat Stats */}
        <div style={`
          background: var(--surface); border-radius: var(--radius-lg);
          padding: 16px; border: 1px solid var(--border);
        `}>
          <div style="font-size: 11px; color: var(--text-tertiary); font-weight: 500; margin-bottom: 8px;">
            Debloated
          </div>
          <div style="font-size: 24px; font-weight: 700; color: var(--accent);">
            {s()?.debloated || 0}
          </div>
          <Show when={s()?.debloat_verified !== undefined}>
            <div style="font-size: 11px; color: var(--success); margin-top: 2px;">
              {s()!.debloat_verified} verified
            </div>
          </Show>
        </div>

        {/* Systemized Stats */}
        <div style={`
          background: var(--surface); border-radius: var(--radius-lg);
          padding: 16px; border: 1px solid var(--border);
        `}>
          <div style="font-size: 11px; color: var(--text-tertiary); font-weight: 500; margin-bottom: 8px;">
            Systemized
          </div>
          <div style="font-size: 24px; font-weight: 700; color: var(--accent);">
            {s()?.systemized || 0}
          </div>
          <Show when={s()?.systemize_verified !== undefined}>
            <div style="font-size: 11px; color: var(--success); margin-top: 2px;">
              {s()!.systemize_verified} verified
            </div>
          </Show>
        </div>
      </div>

      {/* Timestamps */}
      <div class="stagger-3" style={`
        background: var(--surface); border-radius: var(--radius-lg);
        padding: 16px; margin-bottom: 16px; border: 1px solid var(--border);
      `}>
        <div style="font-size: 13px; font-weight: 600; margin-bottom: 12px;">Recent Activity</div>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 13px; color: var(--text-secondary);">Last Debloat</span>
            <span style="font-size: 12px; color: var(--text-tertiary);">{formatTimestamp(s()?.last_nuke || '')}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 13px; color: var(--text-secondary);">Last Verify</span>
            <span style="font-size: 12px; color: var(--text-tertiary);">{formatTimestamp(s()?.last_verify || '')}</span>
          </div>
          <Show when={s()?.last_monitor}>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 13px; color: var(--text-secondary);">Last Monitor</span>
              <span style="font-size: 12px; color: var(--text-tertiary);">{formatTimestamp(s()!.last_monitor!)}</span>
            </div>
          </Show>
        </div>
      </div>

      {/* Actions */}
      <div class="stagger-3" style="display: flex; gap: 12px; margin-bottom: 16px;">
        <button
          onClick={() => store.runVerify()}
          disabled={store.loading.verify}
          style={`
            flex: 1; padding: 14px; border-radius: var(--radius-md);
            background: var(--surface); border: 1px solid var(--border);
            color: var(--text); font-size: 13px; font-weight: 600;
            display: flex; align-items: center; justify-content: center; gap: 8px;
            transition: transform 200ms var(--ease-spring);
            opacity: ${store.loading.verify ? '0.6' : '1'};
          `}
          onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
          onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <span style={store.loading.verify ? 'animation: spin 0.8s linear infinite;' : ''}>
            <Icon path={ICONS.check} size={16} />
          </span>
          {store.loading.verify ? 'Verifying...' : 'Run Verify'}
        </button>
      </div>

      {/* Debug Log - Expandable */}
      <div class="stagger-4" style={`
        background: var(--surface); border-radius: var(--radius-lg);
        border: 1px solid var(--border); overflow: hidden;
      `}>
        <button
          onClick={() => setShowLog(!showLog())}
          style={`
            width: 100%; padding: 16px; display: flex; align-items: center;
            justify-content: space-between; text-align: left;
          `}
        >
          <span style="font-size: 13px; font-weight: 600;">Debug Log</span>
          <span style={`
            transform: rotate(${showLog() ? '180deg' : '0deg'});
            transition: transform 200ms ease; color: var(--text-tertiary);
          `}>
            <Icon path={ICONS.chevronDown} size={20} />
          </span>
        </button>
        <Show when={showLog()}>
          <div style={`
            padding: 0 16px 16px; max-height: 300px; overflow-y: auto;
            font-family: monospace; font-size: 11px; line-height: 1.7;
          `}>
            <For each={store.debugLog()}>
              {(entry) => (
                <div style={`color: ${logLevelColors[entry.level] || 'var(--text)'};`}>
                  <span style="opacity: 0.5;">[{entry.timestamp}]</span>{' '}
                  <span style={`font-weight: ${entry.level === 'FATAL' ? '700' : '400'};`}>
                    [{entry.level}]
                  </span>{' '}
                  <span style="opacity: 0.6;">[{entry.caller}]</span>{' '}
                  {entry.message}
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* Module Info */}
      <Show when={store.moduleProp()}>
        {(prop) => (
          <div class="stagger-5" style={`
            margin-top: 16px; padding: 16px;
            background: var(--surface); border-radius: var(--radius-lg);
            border: 1px solid var(--border);
          `}>
            <div style="font-size: 13px; font-weight: 600; margin-bottom: 10px;">Module Info</div>
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-secondary);">Name</span>
                <span>{prop().name}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-secondary);">Version</span>
                <span>{prop().version}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-secondary);">Author</span>
                <span>{prop().author}</span>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
