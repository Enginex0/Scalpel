import { createSignal, onMount, onCleanup, Show, Switch, Match, For, createEffect } from 'solid-js';
import type { JSXElement } from 'solid-js';
import { store } from './lib/store';
import { ICONS } from './lib/icons';
import type { Tab } from './lib/types';
import { DebloatTab } from './routes/DebloatTab';
import { SystemizeTab } from './routes/SystemizeTab';
import { StatusTab } from './routes/StatusTab';
import { SettingsTab } from './routes/SettingsTab';

function Icon(props: { path: string; size?: number }) {
  return (
    <svg width={props.size || 24} height={props.size || 24} viewBox="0 0 24 24" fill="currentColor">
      <path d={props.path} />
    </svg>
  );
}

const navItems: { id: Tab; label: string; icon: string; iconActive: string }[] = [
  { id: 'debloat', label: 'Debloat', icon: ICONS.trash, iconActive: ICONS.trash },
  { id: 'systemize', label: 'Systemize', icon: ICONS.arrowUp, iconActive: ICONS.arrowUp },
  { id: 'status', label: 'Status', icon: ICONS.shield, iconActive: ICONS.shield },
  { id: 'settings', label: 'Settings', icon: ICONS.settings, iconActive: ICONS.settings },
];

function NavBar() {
  const [indicatorX, setIndicatorX] = createSignal(0);
  let refs: Record<string, HTMLButtonElement | undefined> = {};

  createEffect(() => {
    const el = refs[store.activeTab()];
    if (el) {
      const rect = el.getBoundingClientRect();
      const parent = el.parentElement?.getBoundingClientRect();
      if (parent) setIndicatorX(rect.left - parent.left + rect.width / 2 - 16);
    }
  });

  return (
    <nav style={`
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;
      background: var(--glass-bg); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
      border-top: 1px solid var(--glass-border);
      padding: 6px 0; padding-bottom: calc(6px + env(safe-area-inset-bottom));
    `}>
      <div style="position: relative; display: flex; justify-content: space-around; max-width: 420px; margin: 0 auto;">
        <div style={`
          position: absolute; top: 2px; left: ${indicatorX() - 8}px; width: 48px; height: 36px;
          background: rgba(var(--accent-rgb), 0.15); border-radius: var(--radius-pill);
          transition: left 300ms var(--ease-spring); pointer-events: none;
        `} />
        <For each={navItems}>
          {(item) => (
            <button
              ref={el => refs[item.id] = el}
              onClick={() => store.setActiveTab(item.id)}
              style={`
                display: flex; flex-direction: column; align-items: center; gap: 2px;
                padding: 8px 16px; position: relative; z-index: 1;
                transition: transform 200ms var(--ease-spring);
              `}
              onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.92)')}
              onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              onPointerLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <span style={`
                color: ${store.activeTab() === item.id ? 'var(--accent)' : 'var(--text-tertiary)'};
                transition: color 200ms ease;
              `}>
                <Icon path={item.icon} size={22} />
              </span>
              <span style={`
                font-size: 10px; font-weight: 600; letter-spacing: 0.02em;
                color: ${store.activeTab() === item.id ? 'var(--accent)' : 'var(--text-tertiary)'};
                transition: color 200ms ease;
              `}>
                {item.label}
              </span>
            </button>
          )}
        </For>
      </div>
    </nav>
  );
}

function RebootFAB() {
  const [showSheet, setShowSheet] = createSignal(false);

  return (
    <>
      <Show when={store.needsReboot()}>
        <button
          onClick={() => setShowSheet(true)}
          style={`
            position: fixed; bottom: calc(72px + env(safe-area-inset-bottom));
            right: 20px; z-index: 99;
            width: 56px; height: 56px; border-radius: var(--radius-fab);
            background: var(--accent); color: white;
            box-shadow: 0 8px 24px rgba(var(--accent-rgb), 0.4);
            display: flex; align-items: center; justify-content: center;
            transition: transform 200ms var(--ease-spring), box-shadow 200ms ease;
            animation: slideUp 300ms var(--ease-spring);
          `}
          onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.92)')}
          onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          onPointerLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <Icon path={ICONS.reboot} />
        </button>
      </Show>

      <BottomSheet open={showSheet()} onClose={() => setShowSheet(false)} title="Reboot Device?">
        <p style="color: var(--text-secondary); text-align: center; margin-bottom: 24px; line-height: 1.6;">
          Some changes require a reboot to take effect. Your device will restart immediately.
        </p>
        <button
          onClick={() => { store.reboot(); setShowSheet(false); }}
          style={`
            width: 100%; padding: 16px; border-radius: var(--radius-md);
            background: var(--accent); color: white;
            font-size: 15px; font-weight: 600;
            transition: transform 200ms var(--ease-spring);
          `}
          onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
          onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          Reboot Now
        </button>
        <button
          onClick={() => setShowSheet(false)}
          style={`
            width: 100%; padding: 14px; margin-top: 8px;
            border-radius: var(--radius-md); background: transparent;
            color: var(--text-secondary); font-size: 14px; font-weight: 500;
          `}
        >
          Never mind
        </button>
      </BottomSheet>
    </>
  );
}

export function BottomSheet(props: { open: boolean; onClose: () => void; title: string; children?: JSXElement }) {
  const [visible, setVisible] = createSignal(false);
  const [translateY, setTranslateY] = createSignal(100);
  const [opacity, setOpacity] = createSignal(0);

  createEffect(() => {
    if (props.open) {
      setVisible(true);
      requestAnimationFrame(() => {
        setTranslateY(0);
        setOpacity(1);
      });
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') props.onClose();
      };
      document.addEventListener('keydown', handleKey);
      onCleanup(() => document.removeEventListener('keydown', handleKey));
    } else {
      setTranslateY(100);
      setOpacity(0);
      setTimeout(() => setVisible(false), 350);
    }
  });

  return (
    <Show when={visible()}>
      <div
        onClick={props.onClose}
        style={`
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
          opacity: ${opacity()}; transition: opacity 300ms ease;
        `}
      />
      <div style={`
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 201;
        background: var(--surface); border-radius: var(--radius-xl) var(--radius-xl) 0 0;
        padding: 16px 20px; padding-bottom: calc(24px + env(safe-area-inset-bottom));
        max-height: 85vh; overflow-y: auto;
        transform: translateY(${translateY()}%);
        transition: transform 350ms var(--ease-spring);
        box-shadow: 0 -8px 32px var(--shadow-color);
      `}>
        <div style="width: 36px; height: 4px; background: var(--text-tertiary); border-radius: 2px; margin: 0 auto 16px; opacity: 0.5;" />
        <h3 style="font-size: 20px; font-weight: 600; letter-spacing: -0.02em; text-align: center; margin-bottom: 16px;">
          {props.title}
        </h3>
        {props.children}
      </div>
    </Show>
  );
}

function ToastNotification() {
  return (
    <Show when={store.toast()}>
      {(t) => {
        const bgMap = { success: 'var(--success)', error: 'var(--danger)', info: 'var(--accent)' };
        return (
          <div style={`
            position: fixed; bottom: calc(80px + env(safe-area-inset-bottom));
            left: 50%; transform: translateX(-50%);
            z-index: 1000; display: flex; align-items: center; gap: 10px;
            padding: 14px 20px; border-radius: var(--radius-md);
            background: ${bgMap[t().type] || 'var(--accent)'}; color: white;
            font-size: 14px; font-weight: 500;
            box-shadow: 0 8px 24px rgba(0,0,0,0.3);
            animation: slideUp 300ms var(--ease-spring);
          `}>
            <Show when={t().type === 'success'}>
              <Icon path={ICONS.check} size={18} />
            </Show>
            <Show when={t().type === 'error'}>
              <Icon path={ICONS.warning} size={18} />
            </Show>
            <Show when={t().type === 'info'}>
              <Icon path={ICONS.info} size={18} />
            </Show>
            {t().message}
          </div>
        );
      }}
    </Show>
  );
}

function LoadingSplash() {
  return (
    <div style={`
      min-height: 100vh; min-height: 100dvh;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: var(--bg); color: var(--text); gap: 16px;
    `}>
      <div style={`
        width: 48px; height: 48px; border: 3px solid var(--border);
        border-top-color: var(--accent); border-radius: 50%;
        animation: spin 0.8s linear infinite;
      `} />
      <span style="font-size: 14px; color: var(--text-secondary);">Loading Scalpel...</span>
    </div>
  );
}

export function App() {
  const [ready, setReady] = createSignal(false);

  onMount(async () => {
    await store.loadInitialData();
    setReady(true);
  });

  return (
    <Show when={ready()} fallback={<LoadingSplash />}>
      <div style={`
        min-height: 100vh; min-height: 100dvh;
        background: var(--bg); color: var(--text);
      `}>
        <header style="padding: 20px 20px 4px; text-align: center;">
          <h1 style={`
            font-size: 22px; font-weight: 700; letter-spacing: -0.02em;
            color: var(--accent); margin: 0;
          `}>
            Scalpel
          </h1>
          <span style="font-size: 11px; color: var(--text-tertiary); letter-spacing: 0.05em;">
            {store.moduleProp()?.version || 'v0.1.0'}
          </span>
        </header>

        <main>
          <Switch>
            <Match when={store.activeTab() === 'debloat'}>
              <DebloatTab />
            </Match>
            <Match when={store.activeTab() === 'systemize'}>
              <SystemizeTab />
            </Match>
            <Match when={store.activeTab() === 'status'}>
              <StatusTab />
            </Match>
            <Match when={store.activeTab() === 'settings'}>
              <SettingsTab />
            </Match>
          </Switch>
        </main>

        <NavBar />
        <RebootFAB />
        <ToastNotification />
      </div>
    </Show>
  );
}
