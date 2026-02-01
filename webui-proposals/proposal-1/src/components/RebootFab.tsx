import { createSignal, Show } from 'solid-js';
import { store } from '../lib/store.ts';

export function RebootFab() {
  const [confirming, setConfirming] = createSignal(false);

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: 'max(24px, calc((100vw - 420px) / 2 + 24px))',
      'z-index': '200',
      display: 'flex',
      'align-items': 'center',
      gap: '8px',
    }}>
      <Show when={confirming()}>
        <div style={{
          display: 'flex',
          'align-items': 'center',
          gap: '6px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          'border-radius': 'var(--radius)',
          padding: '6px 10px',
          'font-size': '13px',
          'box-shadow': '0 1px 3px rgba(0,0,0,0.08)',
          'animation': 'fadeIn 150ms ease-out',
        }}>
          <span style={{ color: 'var(--text-2)' }}>Reboot?</span>
          <button
            onClick={() => setConfirming(false)}
            style={{
              padding: '4px 10px',
              'font-size': '12px',
              color: 'var(--text-2)',
              'border-radius': '4px',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => store.reboot()}
            style={{
              padding: '4px 10px',
              'font-size': '12px',
              color: '#fff',
              'border-radius': '4px',
              background: 'var(--danger)',
              border: 'none',
            }}
          >
            Reboot
          </button>
        </div>
      </Show>

      <button
        onClick={() => setConfirming(!confirming())}
        style={{
          width: '48px',
          height: '48px',
          'border-radius': '50%',
          background: 'var(--accent)',
          color: '#fff',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          'box-shadow': '0 1px 4px rgba(0,0,0,0.15)',
          border: 'none',
          'font-size': '18px',
          transition: 'transform 150ms',
        }}
        title="Reboot device"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
      </button>
    </div>
  );
}
