import { createEffect, createSignal, For } from 'solid-js';
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
  { id: 'systemize', label: 'System', iconPath: ICONS.promote },
  { id: 'settings', label: 'Settings', iconPath: ICONS.settings },
];

export function NavBar(props: NavBarProps) {
  const [indicatorLeft, setIndicatorLeft] = createSignal(0);
  const [indicatorWidth, setIndicatorWidth] = createSignal(0);
  const [stretching, setStretching] = createSignal(false);
  let tabRefs: Record<string, HTMLButtonElement | undefined> = {};

  createEffect(() => {
    const el = tabRefs[props.activeTab];
    if (el) {
      const rect = el.getBoundingClientRect();
      const parentRect = el.parentElement?.getBoundingClientRect();
      if (parentRect) {
        setStretching(true);
        setTimeout(() => {
          setIndicatorLeft(rect.left - parentRect.left);
          setIndicatorWidth(rect.width);
          setTimeout(() => setStretching(false), 200);
        }, 50);
      }
    }
  });

  return (
    <nav class={`navbar ${store.settings.fixedNav ? 'navbar--fixed-nav' : ''}`}>
      <div class="navbar__tabs">
        <div
          class={`navbar__indicator ${stretching() ? 'navbar__indicator--stretching' : ''}`}
          style={{ left: `${indicatorLeft()}px`, width: `${indicatorWidth()}px` }}
        />
        <For each={tabs}>
          {(tab) => (
            <button
              ref={(el) => (tabRefs[tab.id] = el)}
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
