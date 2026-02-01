import { createSignal, For, Show } from 'solid-js';
import { store } from '../lib/store.ts';

export function SystemizeTab() {
  const [busy, setBusy] = createSignal<string | null>(null);
  const [confirmDemote, setConfirmDemote] = createSignal<string | null>(null);

  async function handlePromote(pkg: string) {
    setBusy(pkg);
    await store.promoteApp(pkg);
    setBusy(null);
  }

  async function handleDemote(pkg: string) {
    if (confirmDemote() !== pkg) {
      setConfirmDemote(pkg);
      return;
    }
    setBusy(pkg);
    setConfirmDemote(null);
    await store.demoteApp(pkg);
    setBusy(null);
  }

  return (
    <div>
      <div style={{ padding: '16px 0 8px' }}>
        <span style={{ 'font-size': '13px', color: 'var(--text-2)' }}>
          {store.systemizeList().length} promoted
        </span>
      </div>

      <Show when={store.systemizeList().length > 0}>
        <div style={{
          'font-size': '10px',
          'text-transform': 'uppercase',
          'letter-spacing': '0.08em',
          color: 'var(--text-3)',
          padding: '8px 0 6px',
          'font-weight': '500',
        }}>
          Promoted Apps
        </div>
        <div style={{ 'margin-bottom': '20px' }}>
          <For each={store.systemizeList()}>
            {(entry) => (
              <div style={{
                display: 'flex',
                'align-items': 'center',
                gap: '10px',
                padding: '12px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                'border-left': '3px solid var(--accent)',
                'border-radius': 'var(--radius)',
                'margin-bottom': '4px',
                'min-height': '48px',
              }}>
                <div style={{ flex: '1', 'min-width': '0' }}>
                  <div style={{ 'font-weight': '600', 'font-size': '14px' }}>
                    {entry.app_name}
                  </div>
                  <div style={{
                    'font-family': 'var(--mono)',
                    'font-size': '11px',
                    color: 'var(--text-3)',
                  }}>
                    {entry.package_name}
                  </div>
                  <div style={{ 'font-size': '11px', color: 'var(--text-3)', 'margin-top': '2px' }}>
                    Promoted {entry.promoted_date}
                  </div>
                </div>

                <Show when={confirmDemote() === entry.package_name}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => setConfirmDemote(null)}
                      style={{
                        padding: '4px 8px',
                        'font-size': '11px',
                        'border-radius': '4px',
                        border: '1px solid var(--border)',
                        color: 'var(--text-2)',
                        background: 'var(--bg)',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDemote(entry.package_name)}
                      disabled={busy() === entry.package_name}
                      style={{
                        padding: '4px 8px',
                        'font-size': '11px',
                        'border-radius': '4px',
                        border: 'none',
                        color: '#fff',
                        background: 'var(--danger)',
                        opacity: busy() === entry.package_name ? '0.5' : '1',
                      }}
                    >
                      {busy() === entry.package_name ? '...' : 'Confirm'}
                    </button>
                  </div>
                </Show>

                <Show when={confirmDemote() !== entry.package_name}>
                  <button
                    onClick={() => handleDemote(entry.package_name)}
                    disabled={busy() === entry.package_name}
                    style={{
                      padding: '6px 12px',
                      'font-size': '12px',
                      'border-radius': 'var(--radius)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-2)',
                      background: 'var(--bg)',
                      'min-height': '32px',
                      opacity: busy() === entry.package_name ? '0.5' : '1',
                    }}
                  >
                    Demote
                  </button>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>

      <div style={{
        'font-size': '10px',
        'text-transform': 'uppercase',
        'letter-spacing': '0.08em',
        color: 'var(--text-3)',
        padding: '8px 0 6px',
        'font-weight': '500',
      }}>
        Available Apps
      </div>

      <Show when={store.userApps().length === 0}>
        <div style={{
          padding: '40px 0',
          'text-align': 'center',
          color: 'var(--text-3)',
          'font-size': '13px',
        }}>
          No user apps available
        </div>
      </Show>

      <For each={store.userApps()}>
        {(app) => (
          <div style={{
            display: 'flex',
            'align-items': 'center',
            gap: '10px',
            padding: '12px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            'border-radius': 'var(--radius)',
            'margin-bottom': '4px',
            'min-height': '48px',
          }}>
            <div style={{ flex: '1', 'min-width': '0' }}>
              <div style={{ 'font-weight': '600', 'font-size': '14px' }}>
                {app.app_name}
              </div>
              <div style={{
                'font-family': 'var(--mono)',
                'font-size': '11px',
                color: 'var(--text-3)',
              }}>
                {app.package_name}
              </div>
            </div>
            <button
              onClick={() => handlePromote(app.package_name)}
              disabled={busy() === app.package_name}
              style={{
                padding: '6px 12px',
                'font-size': '12px',
                'border-radius': 'var(--radius)',
                border: 'none',
                color: '#fff',
                background: 'var(--accent)',
                'min-height': '32px',
                opacity: busy() === app.package_name ? '0.5' : '1',
              }}
            >
              {busy() === app.package_name ? 'Promoting...' : 'Promote'}
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
