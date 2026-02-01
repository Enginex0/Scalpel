import { store } from '../lib/store'
import type { TabId } from '../lib/types'

const TABS: { id: TabId; label: string; short: string; count?: () => number }[] = [
  { id: 'debloat', label: 'Debloat', short: 'DBL', count: () => store.nukedCount() },
  { id: 'systemize', label: 'Systemize', short: 'SYS', count: () => store.systemizeList().length },
  { id: 'status', label: 'Status', short: 'STS' },
  { id: 'settings', label: 'Settings', short: 'CFG' },
]

export function NavBar() {
  return (
    <nav style={{
      position: 'fixed',
      bottom: '0',
      left: '0',
      right: '0',
      display: 'flex',
      background: 'var(--bg-panel)',
      'border-top': '1px solid var(--border)',
      height: '48px',
      'z-index': '100',
      'padding-bottom': 'env(safe-area-inset-bottom)',
    }}>
      {TABS.map(tab => {
        const active = () => store.activeTab() === tab.id
        return (
          <button
            onClick={() => store.setActiveTab(tab.id)}
            style={{
              flex: '1',
              display: 'flex',
              'flex-direction': 'column',
              'align-items': 'center',
              'justify-content': 'center',
              gap: '2px',
              background: 'none',
              border: 'none',
              position: 'relative',
              transition: 'color 80ms',
              color: active() ? 'var(--cyan)' : 'var(--text-muted)',
            }}
          >
            <span style={{
              'font-size': '10px',
              'font-weight': active() ? '600' : '400',
              'letter-spacing': '0.5px',
            }}>
              {tab.short}
            </span>
            <span style={{ 'font-size': '8px', opacity: active() ? '1' : '0.6' }}>
              {tab.label}
            </span>

            {tab.count && tab.count() > 0 && (
              <span style={{
                position: 'absolute',
                top: '4px',
                right: 'calc(50% - 18px)',
                background: tab.id === 'debloat' ? 'var(--red)' : 'var(--purple)',
                color: '#fff',
                'font-size': '8px',
                'font-weight': '600',
                padding: '0 4px',
                'border-radius': '6px',
                'min-width': '14px',
                'text-align': 'center',
                'line-height': '14px',
              }}>
                {tab.count()}
              </span>
            )}

            {active() && (
              <div style={{
                position: 'absolute',
                bottom: '0',
                left: '20%',
                right: '20%',
                height: '2px',
                background: 'var(--cyan)',
                'border-radius': '1px 1px 0 0',
              }} />
            )}
          </button>
        )
      })}
    </nav>
  )
}
