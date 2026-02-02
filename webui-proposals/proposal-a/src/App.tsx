import { createSignal, onMount, Show, Switch, Match } from 'solid-js';
import { Header } from './components/layout/Header';
import { NavBar } from './components/layout/NavBar';
import { Toast } from './components/layout/Toast';
import { ContextFAB } from './components/scalpel/ContextFAB';
import { DebloatTab } from './routes/DebloatTab';
import { SystemizeTab } from './routes/SystemizeTab';
import { StatusTab } from './routes/StatusTab';
import { SettingsTab } from './routes/SettingsTab';
import { store } from './lib/store';

export function App() {
  const [ready, setReady] = createSignal(false);

  onMount(async () => {
    await store.loadInitialData();
    setReady(true);
  });

  return (
    <Show
      when={ready()}
      fallback={
        <div style={`min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-family:'Space Grotesk',sans-serif;font-size:28px;font-weight:700;letter-spacing:-0.02em;`}>
          <span class="gradient-text">SCALPEL</span>
        </div>
      }
    >
      <div style={`min-height:100vh;min-height:100dvh;background:${store.currentTheme().bgPrimary};color:${store.currentTheme().textPrimary};font-family:${store.currentTheme().fontBody};overflow-x:hidden;`}>
        {/* Header only on status/settings tabs -- debloat/systemize need the vertical space */}
        <Show when={store.activeTab() === 'status' || store.activeTab() === 'settings'}>
          <Header />
        </Show>
        <main style={`padding-bottom:${store.settings.fixedNav ? 'calc(100px + 96px + env(safe-area-inset-bottom))' : 'calc(100px + 48px + env(safe-area-inset-bottom))'};`}>
          <Switch>
            <Match when={store.activeTab() === 'debloat'}><DebloatTab /></Match>
            <Match when={store.activeTab() === 'systemize'}><SystemizeTab /></Match>
            <Match when={store.activeTab() === 'status'}><StatusTab /></Match>
            <Match when={store.activeTab() === 'settings'}><SettingsTab /></Match>
          </Switch>
        </main>
        <ContextFAB />
        <NavBar activeTab={store.activeTab()} onTabChange={store.setActiveTab} />
        <Show when={store.toast()}>
          {(t) => <Toast message={t().message} type={t().type} visible={true} />}
        </Show>
      </div>
    </Show>
  );
}
