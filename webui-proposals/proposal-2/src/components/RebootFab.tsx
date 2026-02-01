import { createSignal } from 'solid-js'
import { store } from '../lib/store'
import { ICONS } from '../lib/icons'

export function RebootFab() {
  const [confirming, setConfirming] = createSignal(false)
  const [rebooting, setRebooting] = createSignal(false)

  function handleReboot() {
    setRebooting(true)
    // Mock: in real device this calls svc power reboot
    setTimeout(() => setRebooting(false), 3000)
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '60px',
      right: '12px',
      'z-index': '200',
    }}>
      {rebooting() ? (
        <div style={{
          padding: '6px 14px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--amber)',
          'border-radius': 'var(--radius)',
          color: 'var(--amber)',
          'font-size': '10px',
          'font-weight': '500',
          display: 'flex',
          'align-items': 'center',
          gap: '6px',
        }}>
          <svg class="spinning" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d={ICONS.reboot} />
          </svg>
          REBOOTING...
        </div>
      ) : confirming() ? (
        <div style={{
          padding: '6px 10px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--cyan)',
          'border-radius': 'var(--radius)',
          display: 'flex',
          'align-items': 'center',
          gap: '8px',
          'font-size': '10px',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>Reboot?</span>
          <button
            class="action-btn action-btn-danger"
            style={{ 'font-size': '9px', padding: '2px 8px' }}
            onClick={handleReboot}
          >
            YES
          </button>
          <button
            class="action-btn"
            style={{ 'font-size': '9px', padding: '2px 8px' }}
            onClick={() => setConfirming(false)}
          >
            NO
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          style={{
            padding: '6px 14px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--cyan)',
            'border-radius': 'var(--radius)',
            color: 'var(--cyan)',
            'font-size': '10px',
            'font-weight': '500',
            display: 'flex',
            'align-items': 'center',
            gap: '6px',
            cursor: 'pointer',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d={ICONS.reboot} />
          </svg>
          REBOOT
        </button>
      )}
    </div>
  )
}
