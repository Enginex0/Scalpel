import { For } from 'solid-js';
import { store } from '../lib/store.ts';
import type { TabId } from '../lib/types.ts';

const TABS: { id: TabId; label: string }[] = [
  { id: 'debloat', label: 'Debloat' },
  { id: 'systemize', label: 'Systemize' },
  { id: 'status', label: 'Status' },
  { id: 'settings', label: 'Settings' },
];

export function TabBar() {
  return (
    <nav style={{
      display: 'flex',
      'border-bottom': '1px solid var(--border)',
      background: 'var(--bg)',
      position: 'sticky',
      top: '0',
      'z-index': '100',
      'padding-top': 'env(safe-area-inset-top, 0px)',
    }}>
      <For each={TABS}>
        {(tab) => {
          const isActive = () => store.activeTab() === tab.id;
          return (
            <button
              onClick={() => store.setActiveTab(tab.id)}
              style={{
                flex: '1',
                padding: '14px 0 12px',
                'font-size': '13px',
                'font-weight': isActive() ? '500' : '400',
                'letter-spacing': '0.02em',
                color: isActive() ? 'var(--accent)' : 'var(--text-2)',
                'border-bottom': isActive() ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'color 150ms, border-color 150ms',
                background: 'none',
                'min-height': '48px',
              }}
            >
              {tab.label}
            </button>
          );
        }}
      </For>
    </nav>
  );
}
