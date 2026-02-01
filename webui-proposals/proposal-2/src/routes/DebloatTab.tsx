import { For, Show, createMemo } from 'solid-js'
import { store } from '../lib/store'
import { ICONS } from '../lib/icons'
import type { AppEntry, SortField } from '../lib/types'

const CAT_BUTTONS = [
  { id: 'essential', label: 'ESS', color: 'var(--cat-essential)' },
  { id: 'caution', label: 'CAU', color: 'var(--cat-caution)' },
  { id: 'safe', label: 'SAF', color: 'var(--cat-safe)' },
  { id: 'google', label: 'GOO', color: 'var(--cat-google)' },
  { id: 'unknown', label: 'UNK', color: 'var(--cat-unknown)' },
]

const COLUMNS: { field: SortField; label: string; width: string }[] = [
  { field: 'status' as SortField, label: 'STS', width: '42px' },
  { field: 'app_name', label: 'APP NAME', width: '1fr' },
  { field: 'package_name', label: 'PACKAGE', width: '1fr' },
  { field: 'category', label: 'RISK', width: '52px' },
  { field: 'partition', label: 'PART', width: '52px' },
]

function SortIndicator(props: { field: SortField }) {
  return (
    <Show when={store.sortField() === props.field}>
      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style={{ 'margin-left': '2px' }}>
        <path d={store.sortDir() === 'asc' ? ICONS.chevronUp : ICONS.chevronDown} />
      </svg>
    </Show>
  )
}

function AppRow(props: { app: AppEntry }) {
  const nuked = () => store.isNuked(props.app.package_name)
  const selected = () => store.selectedApps().has(props.app.package_name)
  const expanded = () => store.expandedApp() === props.app.package_name
  const operating = () => store.operatingPkgs().has(props.app.package_name)

  function getCatClass(cat: string) {
    return `badge badge-${cat}`
  }

  return (
    <>
      <div
        class={nuked() ? 'row-nuked' : ''}
        style={{
          display: 'grid',
          'grid-template-columns': '22px 42px 1fr 1fr 52px 52px',
          'align-items': 'center',
          'min-height': 'var(--row-h)',
          padding: '0 8px',
          'border-bottom': '1px solid var(--border)',
          cursor: 'pointer',
          gap: '4px',
          ...(operating() ? { animation: 'border-glow 1.5s ease-in-out infinite', 'border-left': '2px solid var(--cyan)' } : {}),
        }}
        onClick={() => store.setExpandedApp(expanded() ? null : props.app.package_name)}
      >
        <div
          class={`checkbox ${selected() ? 'checked' : ''}`}
          onClick={(e) => { e.stopPropagation(); store.toggleAppSelection(props.app.package_name) }}
        >
          <Show when={selected()}>
            <svg viewBox="0 0 24 24" fill="#0A0A0B"><path d={ICONS.check} /></svg>
          </Show>
        </div>

        <span class={nuked() ? 'badge badge-nuked' : 'badge badge-active'} style={{ 'text-align': 'center' }}>
          {nuked() ? 'NUKE' : 'LIVE'}
        </span>

        <div style={{ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
          <span style={{ color: 'var(--text-primary)', 'font-weight': '500' }}>{props.app.app_name}</span>
          {props.app.is_split && <span style={{ color: 'var(--text-muted)', 'margin-left': '4px', 'font-size': '9px' }}>SPLIT</span>}
          {props.app.is_priv_app && <span style={{ color: 'var(--purple)', 'margin-left': '4px', 'font-size': '9px' }}>PRIV</span>}
        </div>

        <div style={{
          overflow: 'hidden',
          'text-overflow': 'ellipsis',
          'white-space': 'nowrap',
          color: 'var(--text-muted)',
          'font-size': '10px',
        }}>
          {props.app.package_name}
        </div>

        <span class={getCatClass(props.app.category)} style={{ 'text-align': 'center', 'font-size': '8px' }}>
          {props.app.category === 'essential' ? 'CRIT' :
           props.app.category === 'caution' ? 'WARN' :
           props.app.category === 'safe' ? 'SAFE' :
           props.app.category === 'google' ? 'GOOG' : '????'}
        </span>

        <span class={`badge badge-${props.app.partition === 'vendor' ? 'vendor' : props.app.partition === 'product' ? 'product' : 'system'}`} style={{ 'text-align': 'center', 'font-size': '8px' }}>
          {props.app.partition === 'system_ext' ? 'SEXT' : props.app.partition.toUpperCase().slice(0, 4)}
        </span>
      </div>

      <Show when={expanded()}>
        <div style={{
          padding: '8px 12px',
          background: 'var(--bg-surface)',
          'border-bottom': '1px solid var(--border)',
          display: 'grid',
          'grid-template-columns': '1fr auto',
          gap: '8px',
          'font-size': '10px',
        }}>
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '3px' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>PATH </span>
              <span style={{ color: 'var(--text-secondary)', 'word-break': 'break-all' }}>{props.app.app_path}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>PARTITION </span>
              <span style={{ color: 'var(--text-secondary)' }}>{props.app.partition}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>CATEGORY </span>
              <span style={{ color: 'var(--text-secondary)' }}>{props.app.category}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>PRIV-APP </span>
              <span style={{ color: props.app.is_priv_app ? 'var(--purple)' : 'var(--text-secondary)' }}>
                {props.app.is_priv_app ? 'yes' : 'no'}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>SPLIT APK </span>
              <span style={{ color: 'var(--text-secondary)' }}>{props.app.is_split ? 'yes' : 'no'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px', 'align-items': 'flex-end' }}>
            <Show when={!nuked()}>
              <button
                class="action-btn action-btn-danger"
                onClick={(e) => { e.stopPropagation(); store.nukeApp(props.app.package_name) }}
              >
                NUKE
              </button>
            </Show>
            <Show when={nuked()}>
              <button
                class="action-btn action-btn-success"
                onClick={(e) => { e.stopPropagation(); store.restoreApp(props.app.package_name) }}
              >
                RESTORE
              </button>
            </Show>
          </div>
        </div>
      </Show>
    </>
  )
}

export function DebloatTab() {
  const selCount = createMemo(() => store.selectedApps().size)
  const hasNukedSelected = createMemo(() => {
    return [...store.selectedApps()].some(pkg => store.isNuked(pkg))
  })
  const hasActiveSelected = createMemo(() => {
    return [...store.selectedApps()].some(pkg => !store.isNuked(pkg))
  })

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%' }}>
      {/* Search + Stats bar */}
      <div style={{
        display: 'flex',
        'align-items': 'center',
        padding: '6px 8px',
        gap: '8px',
        'border-bottom': '1px solid var(--border)',
        background: 'var(--bg-panel)',
      }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '4px', flex: '1' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--text-muted)">
            <path d={ICONS.search} />
          </svg>
          <input
            type="text"
            placeholder="search apps..."
            value={store.searchQuery()}
            onInput={(e) => store.setSearchQuery(e.currentTarget.value)}
            style={{
              flex: '1',
              background: 'none',
              border: 'none',
              'border-bottom': '1px solid var(--border)',
              padding: '2px 0',
              color: 'var(--text-primary)',
              'font-size': '11px',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', 'font-size': '10px', 'flex-shrink': '0' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            {store.totalCount()}<span style={{ color: 'var(--text-muted)', opacity: '0.5' }}> apps</span>
          </span>
          <span style={{ color: 'var(--red)' }}>
            {store.nukedCount()}<span style={{ color: 'var(--text-muted)', opacity: '0.5' }}> nuked</span>
          </span>
          <span style={{ color: 'var(--green)' }}>
            {store.activeCount()}<span style={{ color: 'var(--text-muted)', opacity: '0.5' }}> active</span>
          </span>
        </div>
      </div>

      {/* Category filter row */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '4px 8px',
        'border-bottom': '1px solid var(--border)',
        background: 'var(--bg-panel)',
        'flex-wrap': 'wrap',
      }}>
        <For each={CAT_BUTTONS}>
          {(cat) => {
            const active = () => store.categoryFilters().has(cat.id)
            return (
              <button
                onClick={() => store.toggleCategoryFilter(cat.id)}
                style={{
                  padding: '2px 8px',
                  border: `1px solid ${active() ? cat.color : 'var(--border)'}`,
                  'border-radius': 'var(--radius)',
                  background: active() ? `${cat.color}15` : 'transparent',
                  color: active() ? cat.color : 'var(--text-muted)',
                  'font-size': '9px',
                  'font-weight': '500',
                  'letter-spacing': '0.5px',
                  cursor: 'pointer',
                  transition: 'all 80ms',
                }}
              >
                {cat.label}
              </button>
            )
          }}
        </For>

        <Show when={store.categoryFilters().size > 0}>
          <button
            onClick={() => {
              for (const c of CAT_BUTTONS) store.toggleCategoryFilter(c.id)
              for (const c of CAT_BUTTONS) {
                if (store.categoryFilters().has(c.id)) store.toggleCategoryFilter(c.id)
              }
            }}
            style={{
              padding: '2px 6px',
              border: 'none',
              color: 'var(--text-muted)',
              'font-size': '9px',
              cursor: 'pointer',
            }}
          >
            CLEAR
          </button>
        </Show>

        <div style={{ 'margin-left': 'auto' }}>
          <button
            class="action-btn"
            style={{ 'font-size': '9px', padding: '2px 6px' }}
            onClick={() => store.refreshAppList()}
            disabled={store.scanning()}
          >
            {store.scanning() ? (
              <span class="spinning" style={{ display: 'inline-block' }}>R</span>
            ) : 'SCAN'}
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      <Show when={selCount() > 0}>
        <div style={{
          display: 'flex',
          'align-items': 'center',
          gap: '8px',
          padding: '4px 8px',
          background: 'var(--bg-surface)',
          'border-bottom': '1px solid var(--cyan)',
          'font-size': '10px',
        }}>
          <span style={{ color: 'var(--cyan)', 'font-weight': '600' }}>
            {selCount()} selected
          </span>
          <div style={{ 'margin-left': 'auto', display: 'flex', gap: '4px' }}>
            <Show when={hasActiveSelected()}>
              <button
                class="action-btn action-btn-danger"
                style={{ 'font-size': '9px' }}
                onClick={() => store.nukeSelected()}
                disabled={store.operating()}
              >
                NUKE ALL
              </button>
            </Show>
            <Show when={hasNukedSelected()}>
              <button
                class="action-btn action-btn-success"
                style={{ 'font-size': '9px' }}
                onClick={() => store.restoreSelected()}
                disabled={store.operating()}
              >
                RESTORE ALL
              </button>
            </Show>
            <button
              class="action-btn"
              style={{ 'font-size': '9px' }}
              onClick={() => store.clearSelection()}
            >
              CLEAR
            </button>
          </div>
        </div>
      </Show>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        'grid-template-columns': '22px 42px 1fr 1fr 52px 52px',
        'align-items': 'center',
        'min-height': '24px',
        padding: '0 8px',
        'border-bottom': '1px solid var(--border)',
        background: 'var(--bg-surface)',
        gap: '4px',
      }}>
        <div
          class="checkbox"
          style={{ width: '12px', height: '12px' }}
          onClick={() => {
            const apps = store.filteredApps()
            const allSelected = apps.every(a => store.selectedApps().has(a.package_name))
            if (allSelected) {
              store.clearSelection()
            } else {
              for (const a of apps) {
                if (!store.selectedApps().has(a.package_name)) store.toggleAppSelection(a.package_name)
              }
            }
          }}
        />
        {COLUMNS.map(col => (
          <button
            onClick={() => store.toggleSort(col.field)}
            style={{
              background: 'none',
              border: 'none',
              color: store.sortField() === col.field ? 'var(--cyan)' : 'var(--text-muted)',
              'font-size': '9px',
              'font-weight': '500',
              'letter-spacing': '0.5px',
              cursor: 'pointer',
              display: 'flex',
              'align-items': 'center',
              padding: '0',
              'text-align': col.field === 'category' || col.field === 'partition' ? 'center' : 'left',
              'justify-content': col.field === 'category' || col.field === 'partition' ? 'center' : 'flex-start',
            }}
          >
            {col.label}
            <SortIndicator field={col.field} />
          </button>
        ))}
      </div>

      {/* App list */}
      <div style={{ flex: '1', overflow: 'auto' }}>
        <For each={store.filteredApps()}>
          {(app) => <AppRow app={app} />}
        </For>
        <Show when={store.filteredApps().length === 0}>
          <div style={{
            padding: '24px',
            'text-align': 'center',
            color: 'var(--text-muted)',
            'font-size': '11px',
          }}>
            No apps match current filters.
          </div>
        </Show>
      </div>
    </div>
  )
}
