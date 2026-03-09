import { createMemo, For } from 'solid-js';
import type { Tab } from '../../lib/types';
import { store } from '../../lib/store';
import { ICONS } from '../../lib/icons';
import './NavBar.css';

interface NavBarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const tabs: { id: Tab; label: string; iconPath: string }[] = [
  { id: 'status', label: 'Status', iconPath: ICONS.shield },
  { id: 'debloat', label: 'Debloat', iconPath: ICONS.debloat },
  { id: 'systemize', label: 'Systemize', iconPath: ICONS.promote },
  { id: 'settings', label: 'Settings', iconPath: ICONS.settings },
];

export function NavBar(props: NavBarProps) {
  const tabIndex = createMemo(() => tabs.findIndex(t => t.id === props.activeTab));

  return (
    <nav class={`navbar ${store.settings.fixedNav ? 'navbar--fixed-nav' : ''}`}>
      <div class="navbar__tabs">
        <div
          class="navbar__indicator"
          style={{ '--tab-index': tabIndex() }}
        />
        <For each={tabs}>
          {(tab) => (
            <button
              onClick={() => props.onTabChange(tab.id)}
              class={`navbar__tab ${props.activeTab === tab.id ? 'navbar__tab--active' : ''}`}
            >
              <span class="navbar__icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d={tab.iconPath} />
                </svg>
              </span>
              <span class="navbar__label">{tab.label}</span>
            </button>
          )}
        </For>
      </div>
    </nav>
  );
}
