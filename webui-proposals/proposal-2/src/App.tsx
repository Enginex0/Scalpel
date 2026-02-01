import { createSignal, onMount, Show, Switch, Match } from 'solid-js'
import { store } from './lib/store'
import { NavBar } from './components/NavBar'
import { RebootFab } from './components/RebootFab'
import { DebloatTab } from './routes/DebloatTab'
import { SystemizeTab } from './routes/SystemizeTab'
import { StatusTab } from './routes/StatusTab'
import { SettingsTab } from './routes/SettingsTab'
import './app.css'

export function App() {
  const [ready, setReady] = createSignal(false)

  onMount(async () => {
    await store.loadInitialData()
    setReady(true)
  })

  return (
    <Show
      when={ready()}
      fallback={
        <div style={{
          'min-height': '100vh',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          background: '#0A0A0B',
          color: '#71717A',
          'font-family': "var(--font)",
          'font-size': '12px',
        }}>
          SCALPEL LOADING...
        </div>
      }
    >
      <div style={{
        display: 'flex',
        'flex-direction': 'column',
        'min-height': '100vh',
        'min-height': '100dvh',
      }}>
        <header style={{
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
          padding: '8px 12px',
          'border-bottom': '1px solid var(--border)',
          background: 'var(--bg-panel)',
          'flex-shrink': '0',
        }}>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
            <span style={{ color: 'var(--cyan)', 'font-weight': '600', 'font-size': '13px', 'letter-spacing': '1px' }}>
              SCALPEL
            </span>
            <span style={{ color: 'var(--text-muted)', 'font-size': '10px' }}>
              {store.moduleProp()?.version || 'v0.1.0'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '12px', 'font-size': '10px' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              MODE:<span style={{ color: 'var(--cyan)', 'margin-left': '4px' }}>
                {(store.status()?.mode || 'none').toUpperCase()}
              </span>
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              BOOT:<span style={{
                color: store.bootCount() === 0 ? 'var(--green)' : 'var(--red)',
                'margin-left': '4px',
              }}>
                {store.bootCount()}/3
              </span>
            </span>
          </div>
        </header>

        <main style={{ flex: '1', overflow: 'auto', 'padding-bottom': '52px' }}>
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

        <Show when={store.needsReboot()}>
          <RebootFab />
        </Show>
      </div>
    </Show>
  )
}
