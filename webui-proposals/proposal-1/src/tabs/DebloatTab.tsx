import { createSignal, createMemo, For, Show } from 'solid-js';
import { store } from '../lib/store.ts';
import type { AppEntry } from '../lib/types.ts';

const FILTERS = ['All', 'Safe to Remove', 'Google', 'Caution', 'Essential', 'Unknown'] as const;
const FILTER_MAP: Record<string, string> = {
  'All': 'all',
  'Safe to Remove': 'safe',
  'Google': 'google',
  'Caution': 'caution',
  'Essential': 'essential',
  'Unknown': 'unknown',
};

export function DebloatTab() {
  const [search, setSearch] = createSignal('');
  const [filter, setFilter] = createSignal('All');
  const [scanning, setScanning] = createSignal(false);

  const filteredApps = createMemo(() => {
    let list = store.apps();
    const q = search().toLowerCase();
    if (q) {
      list = list.filter(a =>
        a.app_name.toLowerCase().includes(q) ||
        a.package_name.toLowerCase().includes(q)
      );
    }
    const f = FILTER_MAP[filter()];
    if (f && f !== 'all') {
      list = list.filter(a => a.category === f);
    }
    return list;
  });

  const counts = createMemo(() => {
    const all = store.apps();
    const nuked = store.nukeList().length;
    const result: Record<string, number> = { all: all.length };
    for (const a of all) {
      result[a.category] = (result[a.category] || 0) + 1;
    }
    return { ...result, nuked };
  });

  function countFor(label: string): number {
    const key = FILTER_MAP[label];
    if (key === 'all') return counts().all;
    return counts()[key] || 0;
  }

  async function handleRefresh() {
    setScanning(true);
    await store.refreshScan();
    setScanning(false);
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        padding: '16px 0 8px',
      }}>
        <div>
          <span style={{ 'font-size': '13px', color: 'var(--text-2)' }}>
            {counts().nuked} debloated
          </span>
          <span style={{ 'font-size': '13px', color: 'var(--text-3)', 'margin-left': '8px' }}>
            {counts().all} total
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={scanning()}
          style={{
            'font-size': '12px',
            color: 'var(--accent)',
            padding: '6px 10px',
            'border-radius': 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            opacity: scanning() ? '0.5' : '1',
          }}
        >
          {scanning() ? 'Scanning...' : 'Refresh'}
        </button>
      </div>

      <Show when={scanning()}>
        <div style={{
          height: '1px',
          background: 'var(--accent)',
          'margin-bottom': '8px',
          animation: 'progress 2s ease-in-out infinite',
        }} />
      </Show>

      <input
        type="text"
        placeholder="Search apps..."
        value={search()}
        onInput={(e) => setSearch(e.currentTarget.value)}
        style={{
          width: '100%',
          padding: '10px 12px',
          'border-radius': 'var(--radius)',
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          color: 'var(--text-1)',
          'font-size': '13px',
          outline: 'none',
          'margin-bottom': '12px',
          'min-height': '48px',
        }}
      />

      <div style={{
        display: 'flex',
        gap: '6px',
        'overflow-x': 'auto',
        'padding-bottom': '12px',
        '-webkit-overflow-scrolling': 'touch',
      }}>
        <For each={[...FILTERS]}>
          {(f) => {
            const active = () => filter() === f;
            return (
              <button
                onClick={() => setFilter(f)}
                style={{
                  'white-space': 'nowrap',
                  padding: '6px 12px',
                  'font-size': '12px',
                  'border-radius': 'var(--radius)',
                  border: active() ? '1px solid var(--accent)' : '1px solid var(--border)',
                  color: active() ? 'var(--accent)' : 'var(--text-2)',
                  background: active() ? 'var(--accent-light)' : 'var(--bg)',
                  'font-weight': active() ? '500' : '400',
                  transition: 'all 150ms',
                  'min-height': '32px',
                }}
              >
                {f}
                <span style={{ 'margin-left': '4px', opacity: '0.6' }}>
                  {countFor(f)}
                </span>
              </button>
            );
          }}
        </For>
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '1px' }}>
        <For each={filteredApps()} fallback={
          <div style={{
            padding: '40px 0',
            'text-align': 'center',
            color: 'var(--text-3)',
            'font-size': '13px',
          }}>
            No apps found
          </div>
        }>
          {(app) => <AppRow app={app} />}
        </For>
      </div>
    </div>
  );
}

function AppRow(props: { app: AppEntry }) {
  const nuked = () => store.isNuked(props.app.package_name);
  const catMeta = () => store.getCategoryMeta(props.app.category);

  return (
    <button
      onClick={() => store.setDetailApp(props.app)}
      style={{
        width: '100%',
        display: 'flex',
        'align-items': 'center',
        gap: '10px',
        padding: '12px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        'border-radius': 'var(--radius)',
        'margin-bottom': '4px',
        'text-align': 'left',
        transition: 'background 100ms',
        'min-height': '48px',
        cursor: 'pointer',
      }}
    >
      <span style={{
        width: '6px',
        height: '6px',
        'border-radius': '50%',
        background: catMeta().color,
        'flex-shrink': '0',
      }} />

      <div style={{ flex: '1', 'min-width': '0' }}>
        <div style={{
          'font-weight': '600',
          'font-size': '14px',
          'text-decoration': nuked() ? 'line-through' : 'none',
          color: nuked() ? 'var(--text-3)' : 'var(--text-1)',
          overflow: 'hidden',
          'text-overflow': 'ellipsis',
          'white-space': 'nowrap',
        }}>
          {props.app.app_name}
        </div>
        <div style={{
          'font-family': 'var(--mono)',
          'font-size': '11px',
          color: 'var(--text-3)',
          overflow: 'hidden',
          'text-overflow': 'ellipsis',
          'white-space': 'nowrap',
        }}>
          {props.app.package_name}
        </div>
      </div>

      <div style={{
        'font-size': '11px',
        color: nuked() ? 'var(--danger)' : 'var(--text-3)',
        'white-space': 'nowrap',
        'flex-shrink': '0',
      }}>
        {nuked() ? 'Removed' : ''}
      </div>
    </button>
  );
}
