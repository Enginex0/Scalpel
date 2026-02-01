import { createSignal, onMount, Show, Switch, Match } from 'solid-js';
import { store } from './lib/store.ts';
import { TabBar } from './components/TabBar.tsx';
import { RebootFab } from './components/RebootFab.tsx';
import { DetailPanel } from './components/DetailPanel.tsx';
import { DebloatTab } from './tabs/DebloatTab.tsx';
import { SystemizeTab } from './tabs/SystemizeTab.tsx';
import { StatusTab } from './tabs/StatusTab.tsx';
import { SettingsTab } from './tabs/SettingsTab.tsx';

export function App() {
  const [ready, setReady] = createSignal(false);

  onMount(async () => {
    if (store.darkMode()) {
      document.documentElement.classList.add('dark');
    }
    await store.loadAll();
    setReady(true);
  });

  return (
    <Show
      when={ready()}
      fallback={
        <div style={{
          height: '100dvh',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          color: 'var(--text-2)',
          'font-size': '13px',
          'letter-spacing': '0.05em',
          'text-transform': 'uppercase',
        }}>
          Loading
        </div>
      }
    >
      <div style={{
        'max-width': '420px',
        margin: '0 auto',
        'min-height': '100dvh',
        display: 'flex',
        'flex-direction': 'column',
      }}>
        <TabBar />

        <main style={{
          flex: '1',
          padding: '0 16px 96px',
        }}>
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

        <Show when={store.needsReboot()}>
          <RebootFab />
        </Show>

        <Show when={store.detailApp()}>
          <DetailPanel />
        </Show>
      </div>
    </Show>
  );
}
