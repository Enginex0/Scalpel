import { For, Show, createSignal } from 'solid-js'
import { store } from '../lib/store'
import { ICONS } from '../lib/icons'

export function SystemizeTab() {
  const [searchQuery, setSearchQuery] = createSignal('')

  const promotedApps = () => store.systemizeList()
  const availableApps = () => {
    const q = searchQuery().toLowerCase()
    return store.userApps()
      .filter(a => a.status === 'user')
      .filter(a => !q || a.app_name.toLowerCase().includes(q) || a.package_name.toLowerCase().includes(q))
  }

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column' }}>
      {/* Header stats */}
      <div style={{
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        padding: '6px 8px',
        'border-bottom': '1px solid var(--border)',
        background: 'var(--bg-panel)',
        'font-size': '10px',
      }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <span style={{ color: 'var(--purple)' }}>
            {promotedApps().length}<span style={{ color: 'var(--text-muted)', opacity: '0.5' }}> promoted</span>
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            {availableApps().length}<span style={{ color: 'var(--text-muted)', opacity: '0.5' }}> available</span>
          </span>
        </div>
      </div>

      {/* Promoted apps section */}
      <Show when={promotedApps().length > 0}>
        <div style={{
          padding: '4px 8px',
          background: 'var(--bg-surface)',
          'border-bottom': '1px solid var(--border)',
          'font-size': '9px',
          color: 'var(--purple)',
          'font-weight': '600',
          'letter-spacing': '1px',
        }}>
          PROMOTED APPS
        </div>

        {/* Promoted header row */}
        <div style={{
          display: 'grid',
          'grid-template-columns': '42px 1fr 1fr 72px 56px',
          'align-items': 'center',
          'min-height': '22px',
          padding: '0 8px',
          'border-bottom': '1px solid var(--border)',
          background: 'var(--bg-surface)',
          gap: '4px',
          'font-size': '9px',
          color: 'var(--text-muted)',
          'font-weight': '500',
          'letter-spacing': '0.5px',
        }}>
          <span>STS</span>
          <span>APP NAME</span>
          <span>PACKAGE</span>
          <span>DATE</span>
          <span style={{ 'text-align': 'center' }}>ACT</span>
        </div>

        <For each={promotedApps()}>
          {(app) => (
            <div style={{
              display: 'grid',
              'grid-template-columns': '42px 1fr 1fr 72px 56px',
              'align-items': 'center',
              'min-height': 'var(--row-h)',
              padding: '0 8px',
              'border-bottom': '1px solid var(--border)',
              gap: '4px',
            }}>
              <span class="badge badge-promoted" style={{ 'text-align': 'center', 'font-size': '8px' }}>SYS</span>

              <div style={{ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                <span style={{ color: 'var(--text-primary)', 'font-weight': '500' }}>{app.app_name}</span>
              </div>

              <div style={{
                overflow: 'hidden',
                'text-overflow': 'ellipsis',
                'white-space': 'nowrap',
                color: 'var(--text-muted)',
                'font-size': '10px',
              }}>
                {app.package_name}
              </div>

              <span style={{ color: 'var(--text-muted)', 'font-size': '10px' }}>
                {app.promoted_date}
              </span>

              <div style={{ 'text-align': 'center' }}>
                <button
                  class="action-btn action-btn-danger"
                  style={{ 'font-size': '8px', padding: '2px 6px' }}
                  onClick={() => store.demote(app.package_name)}
                  disabled={store.operatingPkgs().has(app.package_name)}
                >
                  {store.operatingPkgs().has(app.package_name) ? '...' : 'DEMOTE'}
                </button>
              </div>
            </div>
          )}
        </For>
      </Show>

      {/* Available apps section */}
      <div style={{
        padding: '4px 8px',
        background: 'var(--bg-surface)',
        'border-bottom': '1px solid var(--border)',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
      }}>
        <span style={{
          'font-size': '9px',
          color: 'var(--text-secondary)',
          'font-weight': '600',
          'letter-spacing': '1px',
        }}>
          USER APPS
        </span>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '4px' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--text-muted)">
            <path d={ICONS.search} />
          </svg>
          <input
            type="text"
            placeholder="filter..."
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            style={{
              width: '120px',
              background: 'none',
              border: 'none',
              'border-bottom': '1px solid var(--border)',
              padding: '1px 0',
              color: 'var(--text-primary)',
              'font-size': '10px',
            }}
          />
        </div>
      </div>

      {/* User apps header */}
      <div style={{
        display: 'grid',
        'grid-template-columns': '42px 1fr 1fr 72px 56px',
        'align-items': 'center',
        'min-height': '22px',
        padding: '0 8px',
        'border-bottom': '1px solid var(--border)',
        background: 'var(--bg-surface)',
        gap: '4px',
        'font-size': '9px',
        color: 'var(--text-muted)',
        'font-weight': '500',
        'letter-spacing': '0.5px',
      }}>
        <span>STS</span>
        <span>APP NAME</span>
        <span>PACKAGE</span>
        <span>VERSION</span>
        <span style={{ 'text-align': 'center' }}>ACT</span>
      </div>

      <For each={availableApps()}>
        {(app) => (
          <div style={{
            display: 'grid',
            'grid-template-columns': '42px 1fr 1fr 72px 56px',
            'align-items': 'center',
            'min-height': 'var(--row-h)',
            padding: '0 8px',
            'border-bottom': '1px solid var(--border)',
            gap: '4px',
          }}>
            <span class="badge badge-user" style={{ 'text-align': 'center', 'font-size': '8px' }}>USER</span>

            <div style={{ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
              <span style={{ color: 'var(--text-primary)', 'font-weight': '500' }}>{app.app_name}</span>
            </div>

            <div style={{
              overflow: 'hidden',
              'text-overflow': 'ellipsis',
              'white-space': 'nowrap',
              color: 'var(--text-muted)',
              'font-size': '10px',
            }}>
              {app.package_name}
            </div>

            <span style={{ color: 'var(--text-muted)', 'font-size': '10px' }}>
              {app.version}
            </span>

            <div style={{ 'text-align': 'center' }}>
              <button
                class="action-btn action-btn-accent"
                style={{ 'font-size': '8px', padding: '2px 6px' }}
                onClick={() => store.promote(app.package_name)}
                disabled={store.operatingPkgs().has(app.package_name)}
              >
                {store.operatingPkgs().has(app.package_name) ? '...' : 'PROMO'}
              </button>
            </div>
          </div>
        )}
      </For>

      <Show when={availableApps().length === 0}>
        <div style={{
          padding: '24px',
          'text-align': 'center',
          color: 'var(--text-muted)',
          'font-size': '11px',
        }}>
          No user apps match filter.
        </div>
      </Show>
    </div>
  )
}
