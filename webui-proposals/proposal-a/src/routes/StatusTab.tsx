import { createSignal, For, Show } from 'solid-js';
import { store } from '../lib/store';
import { Card } from '../components/core/Card';
import { Badge } from '../components/core/Badge';
import { MODES } from '../lib/constants';
import { ICONS } from '../lib/icons';

function TimeSince(props: { timestamp: string }) {
  const format = () => {
    if (!props.timestamp || props.timestamp === 'never') return 'Never';
    const d = new Date(props.timestamp);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };
  return <span>{format()}</span>;
}

function EkgHeader() {
  return (
    <svg
      width="100%"
      height="40"
      viewBox="0 0 200 40"
      preserveAspectRatio="none"
      style="display:block;margin-bottom:16px;"
    >
      <defs>
        <filter id="ekgGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        class="ekg-line"
        d="M0,20 L60,20 L70,20 L80,5 L90,35 L100,10 L110,25 L120,20 L200,20"
        filter="url(#ekgGlow)"
      />
    </svg>
  );
}

function StatRing(props: { value: number; max: number; color: string; label: string; icon: string; delay: number }) {
  const ratio = () => Math.min(props.value / Math.max(props.max, 1), 1);
  const offset = () => 113 * (1 - ratio());

  return (
    <Card variant="glass" padding="small" style={`animation:scaleIn 0.25s var(--ease-out) ${props.delay}ms both;`}>
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="position:relative;width:44px;height:44px;">
          <svg class="stat-ring" width="44" height="44" viewBox="0 0 44 44">
            <circle class="track" cx="22" cy="22" r="18" />
            <circle
              class="fill"
              cx="22" cy="22" r="18"
              style={{
                stroke: props.color,
                'stroke-dashoffset': offset()
              }}
            />
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill={props.color}><path d={props.icon} /></svg>
          </div>
        </div>
        <div>
          <div style={`font-family:'Space Grotesk',sans-serif;font-size:24px;font-weight:700;color:${props.color};line-height:1;`}>{props.value}</div>
          <div style="font-size:11px;color:var(--text-tertiary);font-weight:500;">{props.label}</div>
        </div>
      </div>
    </Card>
  );
}

function VitalIndicator(props: { ok: boolean }) {
  return (
    <div
      class={`vital-indicator ${props.ok ? 'ok' : 'error'}`}
      style="flex-shrink:0;"
    />
  );
}

export function StatusTab() {
  const [logExpanded, setLogExpanded] = createSignal(false);

  const modeInfo = () => {
    const found = MODES.find(m => m.id === store.status.mode);
    const mm = store.metamoduleInfo();
    const base = found || { name: store.status.mode || 'Unknown', description: '' };
    const desc = mm.name && mm.name !== 'none' ? `${base.description} · ${mm.name}` : base.description;
    return { name: base.name, description: desc };
  };

  const stats = () => [
    { label: 'Debloated', value: store.nukedApps().length, max: 30, color: 'var(--color-success)', icon: ICONS.debloat },
    { label: 'Failed', value: store.status.debloat_failed, max: 10, color: store.status.debloat_failed > 0 ? 'var(--color-error)' : 'var(--color-success)', icon: ICONS.error },
    { label: 'Systemized', value: store.promotedApps().length, max: 10, color: 'var(--text-accent)', icon: ICONS.promote },
    { label: 'Repairs', value: store.status.monitor_repairs ?? 0, max: 10, color: 'var(--color-warning)', icon: ICONS.restore },
  ];

  const bootPips = () => {
    const count = Math.min(Math.max(store.bootInfo.boot_count, 0), 3);
    return [0, 1, 2].map(i => i < count);
  };

  return (
    <div style="padding:0 16px;">
      {/* ECG vital signs header */}
      <EkgHeader />

      {/* Mode hero with CRT scanline overlay */}
      <div style="position:relative;text-align:center;margin-bottom:24px;padding:24px 16px;border-radius:16px;background:rgba(var(--accent-rgb),0.03);border:1px solid rgba(var(--accent-rgb),0.12);overflow:hidden;animation:scaleIn 0.35s cubic-bezier(0.16,1,0.3,1);">
        <div class="crt-scanlines" />
        <div style={`position:absolute;top:-20px;right:-20px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle, rgba(var(--accent-rgb),0.1) 0%, transparent 70%);pointer-events:none;`} />
        <div style="position:relative;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:rgba(var(--accent-rgb),0.6);margin-bottom:8px;">Active Mode</div>
          <div style="font-family:'Space Grotesk',sans-serif;font-size:36px;font-weight:700;margin-bottom:4px;" class="mode-name-holographic">
            {modeInfo().name}
          </div>
          <div style="font-size:13px;color:var(--text-tertiary);max-width:280px;margin:0 auto;">
            {modeInfo().description}
          </div>
        </div>
      </div>

      {/* Stats grid with circular gauge rings */}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">
        <For each={stats()}>
          {(stat, i) => (
            <StatRing
              value={stat.value}
              max={stat.max}
              color={stat.color}
              label={stat.label}
              icon={stat.icon}
              delay={i() * 60}
            />
          )}
        </For>
      </div>

      {/* Blade divider */}
      <div class="blade-divider" />

      {/* Verification grid -- 2x2 quadrant with vital indicators */}
      <Card variant="glass" padding="medium" style="margin-bottom:12px;animation:slideInUp 0.3s var(--ease-out) 0.15s both;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text-accent)"><path d={ICONS.check} /></svg>
          <span style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-secondary);">Verification</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div style="padding:12px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--glass-border);">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div style="text-align:center;flex:1;">
                <div style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:var(--color-success);line-height:1;">{store.status.debloat_verified ?? 0}</div>
                <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;">Debloat OK</div>
              </div>
              <VitalIndicator ok={true} />
            </div>
          </div>
          <div style="padding:12px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--glass-border);">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div style="text-align:center;flex:1;">
                <div style={`font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:${(store.status.debloat_broken ?? 0) > 0 ? 'var(--color-error)' : 'var(--text-tertiary)'};line-height:1;`}>{store.status.debloat_broken ?? 0}</div>
                <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;">Debloat Broken</div>
              </div>
              <Show when={(store.status.debloat_broken ?? 0) > 0}>
                <VitalIndicator ok={false} />
              </Show>
            </div>
          </div>
          <div style="padding:12px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--glass-border);">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div style="text-align:center;flex:1;">
                <div style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:var(--color-success);line-height:1;">{store.status.systemize_verified ?? 0}</div>
                <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;">Systemize OK</div>
              </div>
              <VitalIndicator ok={true} />
            </div>
          </div>
          <div style="padding:12px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--glass-border);">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div style="text-align:center;flex:1;">
                <div style={`font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:${(store.status.systemize_broken ?? 0) > 0 ? 'var(--color-error)' : 'var(--text-tertiary)'};line-height:1;`}>{store.status.systemize_broken ?? 0}</div>
                <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;">Systemize Broken</div>
              </div>
              <Show when={(store.status.systemize_broken ?? 0) > 0}>
                <VitalIndicator ok={false} />
              </Show>
            </div>
          </div>
        </div>
      </Card>

      {/* Blade divider */}
      <div class="blade-divider" />

      {/* Bootloop protection */}
      <Card variant="glass" padding="medium" style="margin-bottom:12px;animation:slideInUp 0.3s var(--ease-out) 0.2s both;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--text-accent)"><path d={ICONS.shield} /></svg>
            <span style="font-size:14px;font-weight:600;">Bootloop Protection</span>
          </div>
          <Badge variant={store.bootInfo.boot_count === 0 ? 'success' : store.bootInfo.boot_count >= 3 ? 'error' : 'warning'} size="small">
            {store.bootInfo.boot_count}/3
          </Badge>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <For each={bootPips()}>
            {(filled, i) => (
              <div
                class={`bootloop-pip ${filled ? 'active' : ''}`}
                style={{
                  '--pip-index': i()
                }}
              />
            )}
          </For>
          <span style="font-size:11px;color:var(--text-tertiary);margin-left:8px;">
            {store.bootInfo.boot_count === 0 ? 'Healthy' : store.bootInfo.boot_count >= 3 ? 'Recovery triggered' : `${3 - store.bootInfo.boot_count} strikes remaining`}
          </span>
        </div>
      </Card>

      {/* Blade divider */}
      <div class="blade-divider" style="animation-delay:0.25s;" />

      {/* Monitor status with cycle time, repairs, last check */}
      <Card variant="glass" padding="medium" style="margin-bottom:12px;animation:slideInUp 0.3s var(--ease-out) 0.3s both;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--text-accent)"><path d={ICONS.monitor} /></svg>
            <span style="font-size:14px;font-weight:600;">Monitor Daemon</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <div style={`
              width:8px;height:8px;border-radius:50%;
              background:${store.monitorInfo.running ? 'var(--color-success)' : 'var(--text-tertiary)'};
              ${store.monitorInfo.running ? 'box-shadow:0 0 8px var(--color-success-glow);animation:heartbeat 2s ease-in-out infinite;' : ''}
            `} />
            <span style="font-size:12px;color:var(--text-secondary);">
              {store.monitorInfo.running ? 'Running' : 'Stopped'}
            </span>
            <Show when={store.monitorInfo.running}>
              <span style="font-size:11px;color:var(--text-tertiary);font-family:'JetBrains Mono',monospace;margin-left:4px;">
                {store.monitorInfo.interval}s cycle
              </span>
            </Show>
          </div>
        </div>
        {/* Monitor operational stats */}
        <div style="display:flex;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid var(--glass-border);">
          <div style="flex:1;text-align:center;">
            <div style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;color:var(--text-primary);line-height:1;">{store.status.monitor_repairs ?? 0}</div>
            <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;">Repairs</div>
          </div>
          <div style="width:1px;height:32px;background:var(--glass-border);" />
          <div style="flex:1;text-align:center;">
            <div style="font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:600;color:var(--text-primary);line-height:1;">
              <TimeSince timestamp={store.status.last_monitor || 'never'} />
            </div>
            <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;">Last Check</div>
          </div>
        </div>
      </Card>

      {/* Blade divider */}
      <div class="blade-divider" style="animation-delay:0.35s;" />

      {/* Last operation */}
      <Card variant="glass" padding="medium" style="margin-bottom:12px;animation:slideInUp 0.3s var(--ease-out) 0.4s both;">
        <div style="font-size:14px;font-weight:600;margin-bottom:8px;">Last Operation</div>
        <div style="font-size:12px;color:var(--text-tertiary);display:flex;flex-direction:column;gap:4px;">
          <div>Last nuke: {store.status.last_nuke && store.status.last_nuke !== 'never' ? new Date(store.status.last_nuke).toLocaleString() : 'Never'}</div>
          <div>Last verify: {store.status.last_verify ? new Date(store.status.last_verify).toLocaleString() : 'Never'}</div>
          <Show when={store.status.partial}>
            <Badge variant="warning" size="small">Partial completion</Badge>
          </Show>
        </div>
      </Card>

      {/* Log viewer */}
      <button
        onClick={() => setLogExpanded(!logExpanded())}
        style="width:100%;display:flex;align-items:center;gap:8px;padding:12px 0;color:var(--text-secondary);font-size:13px;font-weight:600;cursor:pointer;"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={`transform:rotate(${logExpanded() ? '0' : '-90'}deg);transition:transform 0.2s;`}>
          <path d={ICONS.chevronDown} />
        </svg>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d={ICONS.log} /></svg>
        Debug Log
      </button>
      <Show when={logExpanded()}>
        <div style={`
          background:var(--bg-surface);border:1px solid var(--glass-border);border-radius:12px;
          padding:12px;padding-bottom:120px;max-height:300px;overflow-y:auto;
          font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.6;
          animation:slideInUp 0.2s var(--ease-out);margin-bottom:120px;
        `}>
          <For each={store.logLines()}>
            {(line) => {
              const isFatal = line.includes('FATAL');
              const isError = line.includes('ERROR');
              const isWarn = line.includes('WARN');
              return (
                <div style={`
                  color:${isFatal || isError ? 'var(--color-error)' : isWarn ? 'var(--color-warning)' : 'var(--color-info)'};
                  word-break:break-all;
                  ${isFatal || isError ? 'font-weight:600;' : ''}
                `}>
                  {line}
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
