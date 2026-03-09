import { createSignal, createEffect, onMount, onCleanup, For, Show, createMemo } from 'solid-js';
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

// Central nervous system — the EKG drives the rhythm of the whole organism
function EkgHeader() {
  let svgRef: SVGSVGElement | undefined;
  const [pulseX, setPulseX] = createSignal(0);
  const [beat, setBeat] = createSignal(false);

  onMount(() => {
    let frame: number;
    let x = 0;
    const speed = 1.2;
    const tick = () => {
      x = (x + speed) % 200;
      setPulseX(x);
      if (Math.abs(x - 90) < 2) setBeat(true);
      if (Math.abs(x - 110) < 2) setBeat(false);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(frame));
  });

  return (
    <div style="position:relative;margin-bottom:20px;">
      <svg
        ref={svgRef}
        width="100%"
        height="48"
        viewBox="0 0 200 48"
        preserveAspectRatio="none"
        style="display:block;"
      >
        <defs>
          <filter id="ekgGlow3">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="ekgGrad3" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="var(--color-success)" stop-opacity="0.1" />
            <stop offset={`${pulseX() / 200 * 100}%`} stop-color="var(--color-success)" stop-opacity="1" />
            <stop offset="100%" stop-color="var(--color-success)" stop-opacity="0.2" />
          </linearGradient>
          <radialGradient id="pulsePoint3" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="var(--color-success)" stop-opacity="1" />
            <stop offset="100%" stop-color="var(--color-success)" stop-opacity="0" />
          </radialGradient>
        </defs>
        {/* Faint trail */}
        <path
          d="M0,24 L55,24 L65,24 L75,6 L85,42 L95,12 L105,30 L115,24 L200,24"
          fill="none"
          stroke="rgba(0,230,118,0.08)"
          stroke-width="1"
        />
        {/* Main trace */}
        <path
          d="M0,24 L55,24 L65,24 L75,6 L85,42 L95,12 L105,30 L115,24 L200,24"
          fill="none"
          stroke="url(#ekgGrad3)"
          stroke-width="2.5"
          stroke-linecap="round"
          filter="url(#ekgGlow3)"
        />
        {/* Traveling pulse dot */}
        <circle
          cx={pulseX()}
          cy={
            pulseX() < 55 ? 24 :
            pulseX() < 65 ? 24 :
            pulseX() < 75 ? 24 - (pulseX() - 65) * 1.8 :
            pulseX() < 85 ? 6 + (pulseX() - 75) * 3.6 :
            pulseX() < 95 ? 42 - (pulseX() - 85) * 3 :
            pulseX() < 105 ? 12 + (pulseX() - 95) * 1.8 :
            pulseX() < 115 ? 30 - (pulseX() - 105) * 0.6 :
            24
          }
          r={beat() ? 5 : 3}
          fill="var(--color-success)"
          style={`filter:drop-shadow(0 0 ${beat() ? 12 : 4}px var(--color-success));transition:r 0.08s;`}
        />
      </svg>
    </div>
  );
}

// The brain — mode hero with living CRT overlay
function ModeHero() {
  const [breathPhase, setBreathPhase] = createSignal(0);

  onMount(() => {
    let frame: number;
    let phase = 0;
    const tick = () => {
      phase += 0.008;
      setBreathPhase(Math.sin(phase) * 0.5 + 0.5);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(frame));
  });

  const modeInfo = () => {
    const found = MODES.find(m => m.id === store.status.mode);
    const mm = store.metamoduleInfo();
    const base = found || { name: store.status.mode || 'Unknown', description: '' };
    const desc = mm.name && mm.name !== 'none' ? `${base.description} via ${mm.name}` : base.description;
    return { name: base.name, description: desc };
  };

  return (
    <div style={`
      position:relative;text-align:center;margin-bottom:24px;padding:28px 16px;
      border-radius:20px;overflow:hidden;
      background:rgba(var(--accent-rgb),${0.02 + breathPhase() * 0.02});
      border:1px solid rgba(var(--accent-rgb),${0.08 + breathPhase() * 0.08});
      box-shadow:0 0 ${20 + breathPhase() * 15}px rgba(var(--accent-rgb),${0.03 + breathPhase() * 0.04}),
                 inset 0 0 ${30 + breathPhase() * 20}px rgba(var(--accent-rgb),${0.01 + breathPhase() * 0.02});
      transition:background 0.3s,border-color 0.3s;
    `}>
      <div class="crt-scanlines" />
      {/* Neural glow orbs */}
      <div style={`position:absolute;top:-30px;right:-30px;width:140px;height:140px;border-radius:50%;
        background:radial-gradient(circle,rgba(var(--accent-rgb),${0.06 + breathPhase() * 0.06}) 0%,transparent 70%);
        pointer-events:none;`} />
      <div style={`position:absolute;bottom:-20px;left:-20px;width:100px;height:100px;border-radius:50%;
        background:radial-gradient(circle,rgba(var(--accent-rgb),${0.04 + breathPhase() * 0.04}) 0%,transparent 70%);
        pointer-events:none;`} />
      <div style="position:relative;">
        <div style={`font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;
          color:rgba(var(--accent-rgb),${0.5 + breathPhase() * 0.3});margin-bottom:10px;`}>
          Active Mode
        </div>
        <div style="font-family:'Space Grotesk',sans-serif;font-size:38px;font-weight:700;margin-bottom:6px;line-height:1;"
          class="mode-name-holographic">
          {modeInfo().name}
        </div>
        <div style="font-size:13px;color:var(--text-tertiary);max-width:280px;margin:0 auto;">
          {modeInfo().description}
        </div>
      </div>
    </div>
  );
}

// Organ card — each stat is a living cell with its own heartbeat
function OrganCell(props: {
  value: number;
  label: string;
  color: string;
  pulseRate: number; // ms per beat cycle
  icon: string;
  delay: number;
}) {
  const [phase, setPhase] = createSignal(0);
  const [mounted, setMounted] = createSignal(false);

  onMount(() => {
    setTimeout(() => setMounted(true), props.delay);
    let frame: number;
    let t = Math.random() * Math.PI * 2; // offset so organs don't sync
    const speed = (Math.PI * 2) / (props.pulseRate / 16.67);
    const tick = () => {
      t += speed;
      setPhase(Math.sin(t) * 0.5 + 0.5);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(frame));
  });

  return (
    <div style={`
      position:relative;padding:14px;border-radius:18px;
      background:rgba(255,255,255,0.02);
      border:1px solid rgba(255,255,255,${0.06 + phase() * 0.06});
      box-shadow:0 0 ${8 + phase() * 8}px ${props.color}15,
                 inset 0 0 ${12 + phase() * 8}px ${props.color}08;
      transform:scale(${mounted() ? 1 + phase() * 0.008 : 0.92});
      opacity:${mounted() ? 1 : 0};
      transition:opacity 0.4s cubic-bezier(0.16,1,0.3,1),transform 0.15s;
      overflow:hidden;
    `}>
      {/* Membrane glow */}
      <div style={`position:absolute;inset:-1px;border-radius:18px;
        border:1px solid ${props.color}${Math.round(phase() * 30).toString(16).padStart(2, '0')};
        pointer-events:none;`} />
      {/* Nucleus */}
      <div style="display:flex;align-items:center;gap:10px;">
        <div style={`
          width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          background:${props.color}12;
          box-shadow:0 0 ${6 + phase() * 6}px ${props.color}30;
        `}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={props.color} style={`opacity:${0.7 + phase() * 0.3};`}>
            <path d={props.icon} />
          </svg>
        </div>
        <div>
          <div style={`
            font-family:'Space Grotesk',sans-serif;font-size:26px;font-weight:700;
            color:${props.color};line-height:1;
            text-shadow:0 0 ${8 + phase() * 8}px ${props.color}40;
          `}>{props.value}</div>
          <div style="font-size:10px;color:var(--text-tertiary);font-weight:500;margin-top:2px;letter-spacing:0.03em;">
            {props.label}
          </div>
        </div>
      </div>
    </div>
  );
}

function BloodworkPanel() {
  const [flowOffset, setFlowOffset] = createSignal(0);

  onMount(() => {
    let frame: number;
    let offset = 0;
    const tick = () => {
      offset = (offset + 0.3) % 100;
      setFlowOffset(offset);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(frame));
  });

  const bootColor = () => {
    const c = store.bootInfo.boot_count;
    if (c === 0) return 'var(--color-success)';
    if (c >= 3) return 'var(--color-error)';
    return 'var(--color-warning)';
  };

  const entries = () => [
    { label: 'Module', value: store.moduleVersion(), color: 'var(--text-accent)' },
    { label: 'Engine', value: store.metamoduleInfo().name || 'none', color: 'var(--text-accent)' },
    { label: 'Scanned', value: String(store.scannedApps().length), color: 'var(--text-accent)' },
    { label: 'User Apps', value: String(store.userApps().length), color: 'var(--text-accent)' },
    { label: 'Boot Guard', value: `${store.bootInfo.boot_count}/3`, color: bootColor() },
    { label: 'Override', value: store.settings.modeOverride, color: 'var(--text-accent)' },
  ];

  return (
    <div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <div style={`width:6px;height:6px;border-radius:50%;background:var(--text-accent);
          box-shadow:0 0 ${6 + Math.sin(flowOffset() / 10) * 4}px rgba(var(--accent-rgb),0.5);`} />
        <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-tertiary);">
          Bloodwork
        </span>
      </div>
      <div style={`
        position:relative;padding:14px;border-radius:14px;
        background:rgba(255,255,255,0.02);
        border:1px solid rgba(var(--accent-rgb),0.1);
        overflow:hidden;
      `}>
        <div style={`
          position:absolute;top:0;left:0;right:0;height:2px;
          background:linear-gradient(90deg,
            transparent ${flowOffset()}%,
            var(--text-accent) ${flowOffset() + 8}%,
            transparent ${flowOffset() + 16}%
          );
          opacity:0.4;
        `} />
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;">
          <For each={entries()}>
            {(entry) => (
              <div>
                <div style="font-size:9px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;">
                  {entry.label}
                </div>
                <div style={`font-family:'JetBrains Mono','Space Grotesk',monospace;font-size:13px;font-weight:600;color:${entry.color};`}>
                  {entry.value}
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

// Vital signs — bootloop as 3 heartbeat traces, flatline = death
function VitalSigns() {
  const [tracePhase, setTracePhase] = createSignal(0);

  onMount(() => {
    let frame: number;
    let t = 0;
    const tick = () => {
      t += 0.02;
      setTracePhase(t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(frame));
  });

  const strikes = () => Math.min(Math.max(store.bootInfo.boot_count, 0), 3);

  const generatePath = (strike: number, index: number) => {
    const alive = index >= strikes();
    if (!alive) {
      return "M0,15 L120,15"; // flatline
    }
    const t = tracePhase();
    const offset = index * 1.2;
    const baseY = 15;
    const amp = 10;
    let d = `M0,${baseY}`;
    for (let x = 0; x <= 120; x += 2) {
      const nx = x / 120;
      const heartX = ((nx * 3 + t + offset) % 1);
      let y = baseY;
      if (heartX > 0.35 && heartX < 0.38) y = baseY - amp * 0.3;
      else if (heartX > 0.38 && heartX < 0.42) y = baseY - amp;
      else if (heartX > 0.42 && heartX < 0.46) y = baseY + amp * 0.7;
      else if (heartX > 0.46 && heartX < 0.50) y = baseY - amp * 0.4;
      else if (heartX > 0.50 && heartX < 0.54) y = baseY;
      d += ` L${x},${y}`;
    }
    return d;
  };

  const statusText = () => {
    const s = strikes();
    if (s === 0) return 'Vital signs normal';
    if (s >= 3) return 'CRITICAL — recovery triggered';
    return `${3 - s} life${3 - s > 1 ? 'lines' : 'line'} remaining`;
  };

  const statusColor = () => {
    const s = strikes();
    if (s === 0) return 'var(--color-success)';
    if (s >= 3) return 'var(--color-error)';
    return 'var(--color-warning)';
  };

  return (
    <div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style={`width:6px;height:6px;border-radius:50%;background:${statusColor()};
            box-shadow:0 0 6px ${statusColor()};`} />
          <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-tertiary);">
            Vital Signs
          </span>
        </div>
        <Badge variant={strikes() === 0 ? 'success' : strikes() >= 3 ? 'error' : 'warning'} size="small">
          {strikes()}/3
        </Badge>
      </div>

      <div style={`
        padding:12px;border-radius:14px;
        background:rgba(255,255,255,0.015);
        border:1px solid ${strikes() >= 3 ? 'rgba(255,59,59,0.2)' : 'rgba(255,255,255,0.06)'};
      `}>
        <div style="display:flex;flex-direction:column;gap:2px;">
          {[0, 1, 2].map(i => {
            const alive = () => i >= strikes();
            const color = () => alive() ? 'var(--color-success)' : 'var(--color-error)';
            return (
              <div style="position:relative;height:30px;overflow:hidden;">
                <svg width="100%" height="30" viewBox="0 0 120 30" preserveAspectRatio="none">
                  <defs>
                    <filter id={`vitalGlow${i}`}>
                      <feGaussianBlur stdDeviation="1.5" result="b" />
                      <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>
                  {/* Grid lines */}
                  <line x1="0" y1="15" x2="120" y2="15" stroke="rgba(255,255,255,0.03)" stroke-width="0.5" />
                  {/* Trace */}
                  <path
                    d={generatePath(strikes(), i)}
                    fill="none"
                    stroke={color()}
                    stroke-width={alive() ? "1.5" : "1"}
                    stroke-linecap="round"
                    filter={`url(#vitalGlow${i})`}
                    style={`opacity:${alive() ? 0.9 : 0.4};`}
                  />
                </svg>
                {/* Flatline label */}
                <Show when={!alive()}>
                  <div style={`
                    position:absolute;right:8px;top:50%;transform:translateY(-50%);
                    font-size:8px;font-weight:700;color:var(--color-error);opacity:0.5;
                    letter-spacing:0.08em;text-transform:uppercase;
                  `}>strike {i + 1}</div>
                </Show>
              </div>
            );
          })}
        </div>

        {/* Flatline beep for death state */}
        <Show when={strikes() >= 3}>
          <div style="margin-top:6px;height:2px;border-radius:1px;background:var(--color-error);opacity:0.3;animation:pulse 1.5s ease-in-out infinite;" />
        </Show>

        <div style={`
          margin-top:8px;font-size:11px;color:${statusColor()};
          text-align:center;font-weight:500;letter-spacing:0.02em;
        `}>
          {statusText()}
        </div>
      </div>
    </div>
  );
}

// Nervous system — monitor daemon as a neural hub with dendrite pulses
function NervousSystem() {
  const [pulseRing, setPulseRing] = createSignal(0);

  onMount(() => {
    let frame: number;
    let t = 0;
    const tick = () => {
      t = (t + 0.005) % 1;
      setPulseRing(t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(frame));
  });

  const running = () => store.monitorInfo.running;
  const interval = () => store.monitorInfo.interval;

  return (
    <div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <div style={`width:6px;height:6px;border-radius:50%;
          background:${running() ? 'var(--color-success)' : 'var(--text-tertiary)'};
          box-shadow:${running() ? '0 0 6px var(--color-success)' : 'none'};`} />
        <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-tertiary);">
          Nervous System
        </span>
      </div>

      <div style={`
        position:relative;padding:16px;border-radius:14px;
        background:rgba(255,255,255,0.015);
        border:1px solid rgba(255,255,255,0.06);
        overflow:hidden;
      `}>
        {/* Central neural hub */}
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="position:relative;width:52px;height:52px;flex-shrink:0;">
            {/* Ripple rings */}
            <Show when={running()}>
              <div style={`
                position:absolute;inset:0;border-radius:50%;
                border:1px solid rgba(var(--accent-rgb),${0.3 * (1 - pulseRing())});
                transform:scale(${1 + pulseRing() * 0.6});
                opacity:${1 - pulseRing()};
              `} />
              <div style={`
                position:absolute;inset:0;border-radius:50%;
                border:1px solid rgba(var(--accent-rgb),${0.3 * (1 - ((pulseRing() + 0.5) % 1))});
                transform:scale(${1 + ((pulseRing() + 0.5) % 1) * 0.6});
                opacity:${1 - ((pulseRing() + 0.5) % 1)};
              `} />
            </Show>
            {/* Core node */}
            <div style={`
              position:absolute;inset:6px;border-radius:50%;
              background:rgba(var(--accent-rgb),${running() ? 0.15 : 0.05});
              border:1px solid rgba(var(--accent-rgb),${running() ? 0.3 : 0.1});
              display:flex;align-items:center;justify-content:center;
              box-shadow:${running() ? '0 0 12px rgba(var(--accent-rgb),0.2)' : 'none'};
            `}>
              <svg width="18" height="18" viewBox="0 0 24 24"
                fill={running() ? 'var(--text-accent)' : 'var(--text-tertiary)'}>
                <path d={ICONS.monitor} />
              </svg>
            </div>
          </div>

          <div style="flex:1;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div>
                <div style={`font-size:14px;font-weight:600;color:${running() ? 'var(--text-primary)' : 'var(--text-tertiary)'};`}>
                  Monitor Daemon
                </div>
                <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">
                  {running() ? `${interval()}s cycle` : 'Offline'}
                </div>
              </div>
              <Badge variant={running() ? 'success' : 'default'} size="small">
                {running() ? 'Live' : 'Down'}
              </Badge>
            </div>

            {/* Dendrite stats */}
            <div style="display:flex;gap:16px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.04);">
              <div>
                <div style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;color:var(--text-accent);line-height:1;">
                  {store.status.monitor_repairs ?? 0}
                </div>
                <div style="font-size:9px;color:var(--text-tertiary);margin-top:2px;text-transform:uppercase;letter-spacing:0.06em;">
                  Repairs
                </div>
              </div>
              <div style="width:1px;background:rgba(255,255,255,0.04);" />
              <div>
                <div style="font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:600;color:var(--text-secondary);line-height:1;">
                  <TimeSince timestamp={store.status.last_monitor || 'never'} />
                </div>
                <div style="font-size:9px;color:var(--text-tertiary);margin-top:2px;text-transform:uppercase;letter-spacing:0.06em;">
                  Last Scan
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Metabolic log — operations as chemical reactions
function MetabolicLog() {
  const formatOp = (type: string, time: string) => {
    if (!time || time === 'never') return null;
    const d = new Date(time);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    let ago = '';
    if (diff < 60) ago = 'just now';
    else if (diff < 3600) ago = `${Math.floor(diff / 60)}m ago`;
    else if (diff < 86400) ago = `${Math.floor(diff / 3600)}h ago`;
    else ago = `${Math.floor(diff / 86400)}d ago`;
    return { type, ago };
  };

  const reactions = createMemo(() => {
    const ops: { type: string; ago: string }[] = [];
    const nuke = formatOp('NUKE', store.status.last_nuke);
    if (nuke) ops.push(nuke);
    const verify = formatOp('VERIFY', store.status.last_verify || '');
    if (verify) ops.push(verify);
    const monitor = formatOp('SCAN', store.status.last_monitor || '');
    if (monitor) ops.push(monitor);
    return ops;
  });

  const reactionColor = (type: string) => {
    switch (type) {
      case 'NUKE': return 'var(--color-error)';
      case 'VERIFY': return 'var(--color-success)';
      case 'SCAN': return 'var(--text-accent)';
      default: return 'var(--text-tertiary)';
    }
  };

  return (
    <div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <div style="width:6px;height:6px;border-radius:50%;background:var(--text-accent);opacity:0.5;" />
        <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-tertiary);">
          Metabolic Log
        </span>
      </div>

      <Show when={reactions().length > 0} fallback={
        <div style="padding:14px;border-radius:14px;background:rgba(255,255,255,0.015);
          border:1px solid rgba(255,255,255,0.04);text-align:center;">
          <div style="font-size:12px;color:var(--text-tertiary);">No reactions recorded</div>
        </div>
      }>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <For each={reactions()}>
            {(rx) => (
              <div style={`
                display:flex;align-items:center;gap:10px;
                padding:10px 12px;border-radius:12px;
                background:rgba(255,255,255,0.015);
                border:1px solid rgba(255,255,255,0.04);
              `}>
                {/* Reaction catalyst */}
                <div style={`
                  font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;
                  padding:3px 8px;border-radius:6px;
                  background:${reactionColor(rx.type)}15;
                  color:${reactionColor(rx.type)};
                  letter-spacing:0.06em;
                `}>{rx.type}</div>
                {/* Arrow */}
                <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                  <path d="M1,5 L10,5 M8,2 L11,5 L8,8" stroke="var(--text-tertiary)" stroke-width="1" stroke-linecap="round" />
                </svg>
                {/* Result */}
                <div style="font-size:11px;color:var(--text-secondary);flex:1;">
                  metabolized
                </div>
                <div style="font-size:10px;color:var(--text-tertiary);font-family:'JetBrains Mono',monospace;">
                  {rx.ago}
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={store.status.partial}>
        <div style="margin-top:8px;">
          <Badge variant="warning" size="small">Partial metabolism</Badge>
        </div>
      </Show>
    </div>
  );
}

// DNA helix terminal — debug log as genetic sequencing
function DnaTerminal() {
  const [expanded, setExpanded] = createSignal(false);
  const [helixPhase, setHelixPhase] = createSignal(0);

  onMount(() => {
    let frame: number;
    let t = 0;
    const tick = () => {
      t += 0.015;
      setHelixPhase(t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(frame));
  });

  return (
    <div style="margin-bottom:120px;">
      <button
        onClick={() => setExpanded(!expanded())}
        style={`
          width:100%;display:flex;align-items:center;gap:10px;padding:12px 0;
          color:var(--text-secondary);font-size:13px;font-weight:600;cursor:pointer;
        `}
      >
        {/* DNA helix icon — two sine waves */}
        <div style="position:relative;width:20px;height:16px;overflow:hidden;">
          <svg width="20" height="16" viewBox="0 0 20 16">
            {[0, 1].map(strand => {
              const yOff = strand === 0 ? 4 : 12;
              const phase = helixPhase() + (strand * Math.PI);
              let d = '';
              for (let x = 0; x <= 20; x += 1) {
                const y = 8 + Math.sin(x * 0.5 + phase) * 4;
                d += (x === 0 ? 'M' : 'L') + `${x},${y}`;
              }
              return (
                <path d={d} fill="none" stroke="var(--text-accent)" stroke-width="1.2" opacity="0.6" />
              );
            })}
            {/* Base pair rungs */}
            {[4, 8, 12, 16].map(x => {
              const y1 = 8 + Math.sin(x * 0.5 + helixPhase()) * 4;
              const y2 = 8 + Math.sin(x * 0.5 + helixPhase() + Math.PI) * 4;
              return <line x1={x} y1={y1} x2={x} y2={y2} stroke="rgba(var(--accent-rgb),0.2)" stroke-width="0.5" />;
            })}
          </svg>
        </div>
        <span>Genome Sequence</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"
          style={`margin-left:auto;transform:rotate(${expanded() ? '0' : '-90'}deg);transition:transform 0.2s;`}>
          <path d={ICONS.chevronDown} />
        </svg>
      </button>

      <Show when={expanded()}>
        <div style={`
          position:relative;
          background:rgba(0,0,0,0.4);
          border:1px solid rgba(var(--accent-rgb),0.08);
          border-radius:14px;padding:2px;
          max-height:300px;overflow-y:auto;
          animation:slideInUp 0.2s var(--ease-out);
        `}>
          {/* Helix decoration along left edge */}
          <div style="position:absolute;left:0;top:0;bottom:0;width:4px;overflow:hidden;border-radius:14px 0 0 14px;">
            <div style={`
              width:100%;height:100%;
              background:repeating-linear-gradient(
                180deg,
                rgba(var(--accent-rgb),0.3) 0px,
                transparent 4px,
                transparent 8px,
                rgba(var(--accent-rgb),0.15) 12px
              );
              background-size:100% 16px;
              animation:float 3s ease-in-out infinite;
            `} />
          </div>

          <div style="padding:10px 10px 10px 14px;">
            <For each={store.logLines()}>
              {(line, i) => {
                const isFatal = line.includes('FATAL');
                const isError = line.includes('ERROR');
                const isWarn = line.includes('WARN');
                const isDebug = line.includes('DEBUG');
                const base = ['A', 'T', 'C', 'G'][i() % 4];
                return (
                  <div style={`
                    display:flex;gap:6px;align-items:flex-start;
                    font-family:'JetBrains Mono',monospace;font-size:10px;line-height:1.6;
                  `}>
                    <span style={`
                      color:rgba(var(--accent-rgb),0.25);font-size:9px;flex-shrink:0;width:12px;text-align:center;
                    `}>{base}</span>
                    <span style={`
                      color:${isFatal || isError ? 'var(--color-error)' : isWarn ? 'var(--color-warning)' : isDebug ? 'var(--text-tertiary)' : 'var(--color-info)'};
                      word-break:break-all;
                      ${isFatal || isError ? 'font-weight:600;' : ''}
                    `}>{line}</span>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}

// Circulatory vein connector between sections
function Vein() {
  const [flowPos, setFlowPos] = createSignal(0);

  onMount(() => {
    let frame: number;
    let t = 0;
    const tick = () => {
      t = (t + 0.4) % 100;
      setFlowPos(t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(frame));
  });

  return (
    <div style="position:relative;height:20px;margin:4px 20px;display:flex;align-items:center;">
      {/* Vein line */}
      <div style="flex:1;height:1px;background:rgba(var(--accent-rgb),0.06);position:relative;overflow:hidden;border-radius:1px;">
        {/* Blood cell traveling */}
        <div style={`
          position:absolute;top:-1px;width:12px;height:3px;border-radius:2px;
          background:rgba(var(--accent-rgb),0.4);
          left:${flowPos()}%;
          box-shadow:0 0 6px rgba(var(--accent-rgb),0.3);
        `} />
      </div>
    </div>
  );
}

export function StatusTab() {
  const stats = () => [
    {
      label: 'Debloated', value: store.nukedApps().length,
      color: 'var(--color-success)', icon: ICONS.debloat, pulseRate: 1600,
    },
    {
      label: 'Failed', value: store.status.debloat_failed,
      color: store.status.debloat_failed > 0 ? 'var(--color-error)' : 'var(--color-success)',
      icon: ICONS.error, pulseRate: store.status.debloat_failed > 0 ? 800 : 2400,
    },
    {
      label: 'Systemized', value: store.promotedApps().length,
      color: 'var(--text-accent)', icon: ICONS.promote, pulseRate: 2200,
    },
    {
      label: 'Repairs', value: store.status.monitor_repairs ?? 0,
      color: 'var(--color-warning)', icon: ICONS.restore, pulseRate: 2800,
    },
  ];

  return (
    <div style="padding:0 16px;">
      <EkgHeader />
      <ModeHero />

      {/* Organ grid — living stat cells */}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px;">
        <For each={stats()}>
          {(stat, i) => (
            <OrganCell
              value={stat.value}
              label={stat.label}
              color={stat.color}
              icon={stat.icon}
              pulseRate={stat.pulseRate}
              delay={i() * 80}
            />
          )}
        </For>
      </div>

      <Vein />
      <BloodworkPanel />
      <Vein />
      <NervousSystem />
      <Vein />
      <MetabolicLog />
      <DnaTerminal />
    </div>
  );
}
