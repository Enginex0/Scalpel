import { createSignal, Show } from 'solid-js';
import { store } from '../lib/store.ts';

export function DetailPanel() {
  const app = () => store.detailApp()!;
  const nuked = () => store.isNuked(app().package_name);
  const catMeta = () => store.getCategoryMeta(app().category);
  const [busy, setBusy] = createSignal(false);
  const [confirmAction, setConfirmAction] = createSignal<'nuke' | 'restore' | null>(null);
  const [done, setDone] = createSignal(false);

  const needsWarning = () => app().category === 'essential' || app().category === 'caution';

  async function handleNuke() {
    if (needsWarning() && confirmAction() !== 'nuke') {
      setConfirmAction('nuke');
      return;
    }
    setBusy(true);
    setConfirmAction(null);
    await store.nukeApp(app());
    setDone(true);
    setBusy(false);
    setTimeout(() => store.setDetailApp(null), 600);
  }

  async function handleRestore() {
    setBusy(true);
    setConfirmAction(null);
    await store.restoreApp(app().package_name);
    setDone(true);
    setBusy(false);
    setTimeout(() => store.setDetailApp(null), 600);
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: '0',
        'z-index': '300',
        display: 'flex',
        'flex-direction': 'column',
        'justify-content': 'flex-end',
      }}
    >
      <div
        onClick={() => { if (!busy()) store.setDetailApp(null); }}
        style={{
          flex: '1',
          background: 'rgba(0,0,0,0.3)',
          animation: 'fadeIn 150ms ease-out',
        }}
      />

      <div style={{
        background: 'var(--bg-card)',
        'border-top': '1px solid var(--border)',
        padding: '20px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
        'max-width': '420px',
        width: '100%',
        margin: '0 auto',
        animation: 'slideUp 200ms ease-out',
      }}>
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'flex-start', 'margin-bottom': '16px' }}>
          <div>
            <div style={{
              'font-weight': '600',
              'font-size': '18px',
              'line-height': '1.3',
              'text-decoration': nuked() ? 'line-through' : 'none',
              color: nuked() ? 'var(--text-3)' : 'var(--text-1)',
            }}>
              {app().app_name}
            </div>
            <div style={{
              'font-family': 'var(--mono)',
              'font-size': '11px',
              color: 'var(--text-3)',
              'margin-top': '2px',
            }}>
              {app().package_name}
            </div>
          </div>
          <button
            onClick={() => store.setDetailApp(null)}
            style={{
              'font-size': '18px',
              color: 'var(--text-3)',
              padding: '4px',
              'line-height': '1',
            }}
          >
            &times;
          </button>
        </div>

        <div style={{ display: 'flex', gap: '16px', 'margin-bottom': '16px', 'font-size': '12px' }}>
          <div>
            <div style={{ color: 'var(--text-3)', 'letter-spacing': '0.05em', 'text-transform': 'uppercase', 'margin-bottom': '2px', 'font-size': '10px' }}>Category</div>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '5px' }}>
              <span style={{
                width: '6px',
                height: '6px',
                'border-radius': '50%',
                background: catMeta().color,
                display: 'inline-block',
                'flex-shrink': '0',
              }} />
              {catMeta().name}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-3)', 'letter-spacing': '0.05em', 'text-transform': 'uppercase', 'margin-bottom': '2px', 'font-size': '10px' }}>Partition</div>
            <div>{app().partition}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-3)', 'letter-spacing': '0.05em', 'text-transform': 'uppercase', 'margin-bottom': '2px', 'font-size': '10px' }}>Type</div>
            <div>{app().is_priv_app ? 'priv-app' : 'app'}{app().is_split ? ' (split)' : ''}</div>
          </div>
        </div>

        <div style={{
          'font-family': 'var(--mono)',
          'font-size': '11px',
          color: 'var(--text-3)',
          padding: '8px 10px',
          background: 'var(--bg)',
          'border-radius': 'var(--radius)',
          'margin-bottom': '16px',
          'word-break': 'break-all',
        }}>
          {app().app_path}
        </div>

        <Show when={confirmAction() === 'nuke'}>
          <div style={{
            padding: '10px 12px',
            background: app().category === 'essential' ? 'var(--danger-light)' : 'var(--warning-light)',
            'border-radius': 'var(--radius)',
            'margin-bottom': '12px',
            'font-size': '13px',
            color: app().category === 'essential' ? 'var(--danger)' : 'var(--warning)',
          }}>
            {app().category === 'essential'
              ? 'This will likely cause a bootloop. Are you sure?'
              : 'This may affect device functionality.'}
          </div>
        </Show>

        <Show when={done()}>
          <div style={{
            'text-align': 'center',
            padding: '8px',
            color: 'var(--success)',
            'font-size': '13px',
            animation: 'fadeIn 200ms ease-out',
          }}>
            Done
          </div>
        </Show>

        <Show when={!done()}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Show when={!nuked()}>
              <button
                onClick={() => store.setDetailApp(null)}
                disabled={busy()}
                style={{
                  flex: '1',
                  padding: '12px',
                  'border-radius': 'var(--radius)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-2)',
                  'font-size': '13px',
                  'font-weight': '500',
                  background: 'var(--bg)',
                  'min-height': '48px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleNuke}
                disabled={busy()}
                style={{
                  flex: '1',
                  padding: '12px',
                  'border-radius': 'var(--radius)',
                  border: 'none',
                  color: '#fff',
                  'font-size': '13px',
                  'font-weight': '500',
                  background: confirmAction() === 'nuke' ? 'var(--danger)' : 'var(--accent)',
                  'min-height': '48px',
                  opacity: busy() ? '0.6' : '1',
                }}
              >
                {busy() ? 'Working...' : confirmAction() === 'nuke' ? 'Confirm Debloat' : 'Debloat'}
              </button>
            </Show>
            <Show when={nuked()}>
              <button
                onClick={() => store.setDetailApp(null)}
                disabled={busy()}
                style={{
                  flex: '1',
                  padding: '12px',
                  'border-radius': 'var(--radius)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-2)',
                  'font-size': '13px',
                  'font-weight': '500',
                  background: 'var(--bg)',
                  'min-height': '48px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRestore}
                disabled={busy()}
                style={{
                  flex: '1',
                  padding: '12px',
                  'border-radius': 'var(--radius)',
                  border: 'none',
                  color: '#fff',
                  'font-size': '13px',
                  'font-weight': '500',
                  background: 'var(--accent)',
                  'min-height': '48px',
                  opacity: busy() ? '0.6' : '1',
                }}
              >
                {busy() ? 'Restoring...' : 'Restore'}
              </button>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}
