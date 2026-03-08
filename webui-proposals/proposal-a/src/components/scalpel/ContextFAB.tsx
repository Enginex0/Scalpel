import { createSignal, Show, Switch, Match, createMemo } from 'solid-js';
import { store } from '../../lib/store';
import { Modal } from '../layout/Modal';
import { Button } from '../core/Button';
import { ICONS } from '../../lib/icons';
import { CATEGORY_COLORS } from '../../lib/constants';
import { api } from '../../lib/api';

function fabPosition() {
  return `calc(${store.settings.fixedNav ? '216px' : '168px'} + env(safe-area-inset-bottom))`;
}

const FAB_BASE = `
  position:fixed;right:16px;width:52px;height:52px;border-radius:50%;border:none;
  display:flex;align-items:center;justify-content:center;z-index:150;cursor:pointer;
  transition:transform 0.2s var(--ease-spring);
`;

function RebootFAB() {
  const [confirmOpen, setConfirmOpen] = createSignal(false);

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        style={`${FAB_BASE}
          bottom:${fabPosition()};
          background:var(--gradient-primary);color:var(--text-on-accent);
          box-shadow:0 4px 20px rgba(var(--accent-rgb), 0.4);
          animation:${store.needsReboot() ? 'glowPulse 2s ease-in-out infinite' : 'float 3s ease-in-out infinite'};
        `}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d={ICONS.reboot} />
        </svg>
      </button>

      <Modal open={confirmOpen()} onClose={() => setConfirmOpen(false)} title="Reboot Device?">
        <p style="text-align:center;color:var(--text-secondary);margin-bottom:20px;font-size:14px;">
          {store.needsReboot()
            ? 'Changes are pending. A reboot is required to apply them.'
            : 'Are you sure you want to reboot the device?'
          }
        </p>
        <div style="display:flex;gap:12px;">
          <Button variant="ghost" fullWidth onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="danger" fullWidth onClick={() => { api.reboot(); setConfirmOpen(false); }}>Reboot Now</Button>
        </div>
      </Modal>
    </>
  );
}

function NukeFAB() {
  const [confirmOpen, setConfirmOpen] = createSignal(false);

  const count = () => store.debloatSelected().size;

  const selectedHasDangerous = createMemo(() => {
    const sel = store.debloatSelected();
    return store.scannedApps().some(a => sel.has(a.package_name) && (a.category === 'essential' || a.category === 'caution'));
  });

  const selectedAppNames = createMemo(() => {
    const sel = store.debloatSelected();
    return store.scannedApps()
      .filter(a => sel.has(a.package_name))
      .map(a => ({ name: a.app_name, category: a.category }));
  });

  const handleNuke = async () => {
    await store.nukeApps([...store.debloatSelected()]);
    store.setDebloatSelected(new Set<string>());
    setConfirmOpen(false);
  };

  return (
    <>
      <button
        onClick={() => { if (count() > 0) setConfirmOpen(true); }}
        style={`${FAB_BASE}
          bottom:${fabPosition()};
          background:${count() > 0 ? 'linear-gradient(135deg, #ff6b6b 0%, #e53935 100%)' : 'var(--bg-surface-elevated)'};
          color:${count() > 0 ? '#fff' : 'var(--text-tertiary)'};
          box-shadow:${count() > 0 ? '0 4px 20px rgba(255, 107, 107, 0.5)' : 'var(--shadow-small)'};
          animation:${count() > 0 ? 'glowPulse 2s ease-in-out infinite' : 'none'};
          opacity:${count() > 0 ? 1 : 0.6};
        `}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d={ICONS.debloat} />
        </svg>
        {/* Count badge */}
        <Show when={count() > 0}>
          <span style={`
            position:absolute;top:-4px;right:-4px;
            min-width:20px;height:20px;border-radius:10px;
            background:#fff;color:#e53935;
            font-size:11px;font-weight:700;
            display:flex;align-items:center;justify-content:center;
            padding:0 5px;
            box-shadow:0 2px 8px rgba(0,0,0,0.3);
          `}>
            {count()}
          </span>
        </Show>
      </button>

      {/* Nuke confirmation modal */}
      <Modal open={confirmOpen()} onClose={() => setConfirmOpen(false)} title="Confirm Debloat">
        <Show when={selectedHasDangerous()}>
          <div style="border-left:3px solid var(--color-error);padding:10px 14px;border-radius:8px;background:rgba(255,107,107,0.06);margin-bottom:16px;display:flex;align-items:center;gap:8px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--color-error)">
              <path d={ICONS.warning} />
            </svg>
            <span style="font-size:13px;color:var(--color-error);font-weight:500;">
              Selection includes essential or caution apps. Removing these may cause issues.
            </span>
          </div>
        </Show>

        <div style="max-height:200px;overflow-y:auto;margin-bottom:16px;">
          {selectedAppNames().map((app) => {
            const cc = CATEGORY_COLORS[app.category];
            return (
              <div style="display:flex;align-items:center;gap:8px;padding:6px 0;">
                <span style={`width:6px;height:6px;border-radius:50%;background:${cc.color};flex-shrink:0;`} />
                <span style="font-size:13px;color:var(--text-secondary);">{app.name}</span>
              </div>
            );
          })}
        </div>

        <p style="text-align:center;color:var(--text-secondary);margin-bottom:16px;font-size:14px;">
          Remove {count()} app{count() > 1 ? 's' : ''}?
        </p>
        <div style="display:flex;gap:12px;">
          <Button variant="ghost" fullWidth onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="danger" fullWidth onClick={handleNuke}>
            Nuke {count()}
          </Button>
        </div>
      </Modal>
    </>
  );
}

function SystemizeFAB() {
  const [confirmOpen, setConfirmOpen] = createSignal(false);
  const [target, setTarget] = createSignal<'priv-app' | 'app'>('priv-app');
  const [promoting, setPromoting] = createSignal(false);

  const count = () => store.systemizeSelected().size;
  const active = () => count() > 0;

  const selectedApps = createMemo(() => {
    const sel = store.systemizeSelected();
    return store.userApps().filter(a => sel.has(a.package_name));
  });

  const handleBatchPromote = async () => {
    setPromoting(true);
    try {
      const t = target();
      const succeeded = new Set<string>();
      for (const pkg of store.systemizeSelected()) {
        const ok = await store.promoteApp(pkg, t);
        if (ok) succeeded.add(pkg);
      }
      // Only clear successful promotions from selection
      const remaining = new Set([...store.systemizeSelected()].filter(p => !succeeded.has(p)));
      store.setSystemizeSelected(remaining);
      if (remaining.size === 0) {
        setConfirmOpen(false);
        setTarget('priv-app');
      }
    } finally {
      setPromoting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => { if (active()) setConfirmOpen(true); }}
        style={`${FAB_BASE}
          bottom:${fabPosition()};
          background:${active() ? 'rgba(var(--accent-rgb), 0.1)' : 'rgba(255, 255, 255, 0.06)'};
          backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
          border:${active() ? '1.5px solid rgba(var(--accent-rgb), 0.4)' : '1px solid rgba(255, 255, 255, 0.12)'};
          color:${active() ? 'var(--text-accent)' : 'var(--text-tertiary)'};
          box-shadow:${active()
            ? '0 0 20px rgba(var(--accent-rgb), 0.25), 0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            : '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.08)'};
          animation:${active() ? 'glowPulse 2s ease-in-out infinite' : 'float 3s ease-in-out infinite'};
          opacity:${active() ? 1 : 0.7};
        `}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d={ICONS.promote} />
        </svg>
        <Show when={active()}>
          <span style={`
            position:absolute;top:-4px;right:-4px;
            min-width:20px;height:20px;border-radius:10px;
            background:var(--text-accent);color:var(--text-on-accent);
            font-size:11px;font-weight:700;
            display:flex;align-items:center;justify-content:center;
            padding:0 5px;
            box-shadow:0 2px 8px rgba(var(--accent-rgb), 0.4);
          `}>
            {count()}
          </span>
        </Show>
      </button>

      <Modal open={confirmOpen()} onClose={() => { setConfirmOpen(false); setTarget('priv-app'); }} title="Batch Promote">
        <p style="text-align:center;color:var(--text-secondary);margin-bottom:8px;font-size:14px;">
          Promote <strong>{count()}</strong> app{count() > 1 ? 's' : ''} to system?
        </p>

        <div style="margin-bottom:16px;">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;text-align:center;">Choose installation level</div>
          <div style="display:flex;gap:10px;">
            <button
              onClick={() => setTarget('priv-app')}
              style={`
                flex:1;padding:16px 12px;border-radius:14px;cursor:pointer;text-align:center;
                border:${target() === 'priv-app' ? '2px solid rgba(var(--accent-rgb), 0.6)' : '1px solid var(--glass-border)'};
                background:${target() === 'priv-app' ? 'rgba(var(--accent-rgb), 0.08)' : 'var(--bg-surface)'};
                box-shadow:${target() === 'priv-app' ? '0 0 16px rgba(var(--accent-rgb), 0.15), inset 0 0 12px rgba(var(--accent-rgb), 0.04)' : 'none'};
                transition:all 0.25s var(--ease-spring);
              `}
            >
              <div style={`
                width:40px;height:40px;border-radius:50%;margin:0 auto 10px;
                background:${target() === 'priv-app' ? 'var(--gradient-primary)' : 'var(--bg-surface-elevated)'};
                display:flex;align-items:center;justify-content:center;
                transition:all 0.25s var(--ease-spring);
              `}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill={target() === 'priv-app' ? 'var(--text-on-accent)' : 'var(--text-tertiary)'}>
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
                </svg>
              </div>
              <div style={`font-size:13px;font-weight:700;color:${target() === 'priv-app' ? 'var(--text-accent)' : 'var(--text-secondary)'};margin-bottom:4px;`}>
                Privileged
              </div>
              <div style="font-size:10px;color:var(--text-tertiary);line-height:1.4;">
                Protected permissions &amp; special capabilities
              </div>
            </button>

            <button
              onClick={() => setTarget('app')}
              style={`
                flex:1;padding:16px 12px;border-radius:14px;cursor:pointer;text-align:center;
                border:${target() === 'app' ? '2px solid rgba(var(--accent-rgb), 0.6)' : '1px solid var(--glass-border)'};
                background:${target() === 'app' ? 'rgba(var(--accent-rgb), 0.08)' : 'var(--bg-surface)'};
                box-shadow:${target() === 'app' ? '0 0 16px rgba(var(--accent-rgb), 0.15), inset 0 0 12px rgba(var(--accent-rgb), 0.04)' : 'none'};
                transition:all 0.25s var(--ease-spring);
              `}
            >
              <div style={`
                width:40px;height:40px;border-radius:50%;margin:0 auto 10px;
                background:${target() === 'app' ? 'var(--gradient-primary)' : 'var(--bg-surface-elevated)'};
                display:flex;align-items:center;justify-content:center;
                transition:all 0.25s var(--ease-spring);
              `}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill={target() === 'app' ? 'var(--text-on-accent)' : 'var(--text-tertiary)'}>
                  <path d="M17 1H7c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zm0 18H7V5h10v14zm-5-1c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1z" />
                </svg>
              </div>
              <div style={`font-size:13px;font-weight:700;color:${target() === 'app' ? 'var(--text-accent)' : 'var(--text-secondary)'};margin-bottom:4px;`}>
                System
              </div>
              <div style="font-size:10px;color:var(--text-tertiary);line-height:1.4;">
                Basic system status, no special permissions
              </div>
            </button>
          </div>
        </div>

        <div style="max-height:160px;overflow-y:auto;margin-bottom:16px;">
          {selectedApps().map((app) => (
            <div style="display:flex;align-items:center;gap:8px;padding:5px 0;">
              <span style="width:6px;height:6px;border-radius:50%;background:var(--text-accent);flex-shrink:0;" />
              <span style="font-size:13px;color:var(--text-secondary);">{app.app_name}</span>
            </div>
          ))}
        </div>

        <p style="text-align:center;color:var(--text-tertiary);margin-bottom:16px;font-size:12px;">
          This survives factory reset. A reboot is required.
        </p>
        <div style="display:flex;gap:12px;">
          <Button variant="ghost" fullWidth onClick={() => { setConfirmOpen(false); setTarget('priv-app'); }}>Cancel</Button>
          <Button variant="primary" fullWidth loading={promoting()} onClick={handleBatchPromote}>
            Promote {count()}
          </Button>
        </div>
      </Modal>
    </>
  );
}

export function ContextFAB() {
  return (
    <Switch>
      <Match when={store.activeTab() === 'status'}><RebootFAB /></Match>
      <Match when={store.activeTab() === 'debloat'}><NukeFAB /></Match>
      <Match when={store.activeTab() === 'systemize'}><SystemizeFAB /></Match>
      {/* No FAB on settings */}
    </Switch>
  );
}
