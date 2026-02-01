import { For, createMemo } from 'solid-js'
import { store } from '../lib/store'
import type { LogEntry, OperationHistoryEntry } from '../lib/types'

function InfoCell(props: { label: string; value: string | number; color?: string; pulse?: boolean }) {
  return (
    <div style={{
      padding: '6px 8px',
      border: '1px solid var(--border)',
      background: 'var(--bg-panel)',
      'border-radius': 'var(--radius)',
      flex: '1',
      'min-width': '0',
    }}>
      <div style={{ 'font-size': '8px', color: 'var(--text-muted)', 'text-transform': 'uppercase', 'letter-spacing': '0.5px', 'margin-bottom': '2px' }}>
        {props.label}
      </div>
      <div style={{
        'font-size': '13px',
        'font-weight': '600',
        color: props.color || 'var(--text-primary)',
        display: 'flex',
        'align-items': 'center',
        gap: '4px',
      }}>
        {props.pulse && (
          <span class="pulse" style={{
            width: '6px',
            height: '6px',
            'border-radius': '3px',
            background: props.color || 'var(--green)',
            display: 'inline-block',
          }} />
        )}
        {props.value}
      </div>
    </div>
  )
}

function levelColor(level: string): string {
  switch (level) {
    case 'DEBUG': return 'var(--text-muted)'
    case 'INFO': return 'var(--cyan)'
    case 'WARN': return 'var(--amber)'
    case 'ERROR': return 'var(--red)'
    case 'FATAL': return 'var(--red)'
    default: return 'var(--text-secondary)'
  }
}

function levelBg(level: string): string {
  switch (level) {
    case 'ERROR': return 'rgba(239,68,68,0.06)'
    case 'FATAL': return 'rgba(239,68,68,0.08)'
    case 'WARN': return 'rgba(245,158,11,0.04)'
    default: return 'transparent'
  }
}

export function StatusTab() {
  const s = () => store.status()
  const mp = () => store.moduleProp()

  const operationHistory = createMemo<OperationHistoryEntry[]>(() => {
    const st = s()
    if (!st) return []
    const history: OperationHistoryEntry[] = []
    if (st.last_nuke !== 'never') {
      history.push({ time: formatTime(st.last_nuke), operation: 'NUKE', target: `${st.debloated} apps`, result: st.debloat_failed > 0 ? 'partial' : 'success' })
    }
    if (st.last_verify) {
      history.push({ time: formatTime(st.last_verify), operation: 'VERIFY', target: `${st.debloat_verified || 0} checked`, result: (st.debloat_broken || 0) > 0 ? 'failed' : 'success' })
    }
    if (st.last_monitor) {
      history.push({ time: formatTime(st.last_monitor), operation: 'REPAIR', target: `${st.monitor_repairs || 0} fixed`, result: 'success' })
    }
    return history
  })

  const uptime = createMemo(() => {
    const st = s()
    if (!st?.timestamp) return '0m'
    const now = Math.floor(Date.now() / 1000)
    const diff = now - st.timestamp
    const h = Math.floor(diff / 3600)
    const m = Math.floor((diff % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  })

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0' }}>
      {/* Module info */}
      <div style={{
        padding: '6px 8px',
        'border-bottom': '1px solid var(--border)',
        background: 'var(--bg-panel)',
        display: 'flex',
        'justify-content': 'space-between',
        'align-items': 'center',
        'font-size': '10px',
      }}>
        <div>
          <span style={{ color: 'var(--cyan)', 'font-weight': '600' }}>{mp()?.name}</span>
          <span style={{ color: 'var(--text-muted)', 'margin-left': '6px' }}>{mp()?.version}</span>
          <span style={{ color: 'var(--text-muted)', 'margin-left': '6px' }}>by {mp()?.author}</span>
        </div>
        <span style={{ color: 'var(--text-muted)', 'font-size': '9px' }}>{mp()?.description}</span>
      </div>

      {/* Status cells row */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '6px 8px',
        'border-bottom': '1px solid var(--border)',
      }}>
        <InfoCell
          label="Mode"
          value={(s()?.mode || 'none').toUpperCase()}
          color="var(--cyan)"
        />
        <InfoCell
          label="Boot"
          value={`${store.bootCount()}/3`}
          color={store.bootCount() === 0 ? 'var(--green)' : store.bootCount() >= 2 ? 'var(--red)' : 'var(--amber)'}
        />
        <InfoCell
          label="Monitor"
          value={store.monitorStatus().toUpperCase()}
          color={store.monitorStatus() === 'running' ? 'var(--green)' : 'var(--red)'}
          pulse={store.monitorStatus() === 'running'}
        />
        <InfoCell
          label="Uptime"
          value={uptime()}
        />
      </div>

      {/* Debloat summary */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '6px 8px',
        'border-bottom': '1px solid var(--border)',
      }}>
        <InfoCell label="Debloated" value={s()?.debloated || 0} color="var(--green)" />
        <InfoCell label="Failed" value={s()?.debloat_failed || 0} color={s()?.debloat_failed ? 'var(--red)' : 'var(--text-muted)'} />
        <InfoCell label="Verified" value={s()?.debloat_verified || 0} color="var(--green)" />
        <InfoCell label="Broken" value={s()?.debloat_broken || 0} color={s()?.debloat_broken ? 'var(--amber)' : 'var(--text-muted)'} />
        <InfoCell label="Repairs" value={s()?.monitor_repairs || 0} color="var(--blue)" />
      </div>

      {/* Systemize summary */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '6px 8px',
        'border-bottom': '1px solid var(--border)',
      }}>
        <InfoCell label="Systemized" value={s()?.systemized || 0} color="var(--purple)" />
        <InfoCell label="Sys Verified" value={s()?.systemize_verified || 0} color="var(--green)" />
        <InfoCell label="Sys Broken" value={s()?.systemize_broken || 0} color={s()?.systemize_broken ? 'var(--amber)' : 'var(--text-muted)'} />
      </div>

      {/* Operation history */}
      <div style={{
        padding: '4px 8px',
        background: 'var(--bg-surface)',
        'border-bottom': '1px solid var(--border)',
        'font-size': '9px',
        color: 'var(--text-muted)',
        'font-weight': '600',
        'letter-spacing': '1px',
      }}>
        OPERATION HISTORY
      </div>

      <div style={{
        display: 'grid',
        'grid-template-columns': '80px 56px 1fr 56px',
        'min-height': '22px',
        padding: '0 8px',
        'align-items': 'center',
        'border-bottom': '1px solid var(--border)',
        background: 'var(--bg-surface)',
        gap: '4px',
        'font-size': '9px',
        color: 'var(--text-muted)',
        'font-weight': '500',
        'letter-spacing': '0.5px',
      }}>
        <span>TIME</span>
        <span>OP</span>
        <span>TARGET</span>
        <span style={{ 'text-align': 'center' }}>RESULT</span>
      </div>

      <For each={operationHistory()}>
        {(op) => (
          <div style={{
            display: 'grid',
            'grid-template-columns': '80px 56px 1fr 56px',
            'min-height': 'var(--row-h)',
            padding: '0 8px',
            'align-items': 'center',
            'border-bottom': '1px solid var(--border)',
            gap: '4px',
            'font-size': '10px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>{op.time}</span>
            <span style={{ color: 'var(--cyan)', 'font-weight': '500' }}>{op.operation}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{op.target}</span>
            <span
              class={`badge ${op.result === 'success' ? 'badge-active' : op.result === 'failed' ? 'badge-nuked' : 'badge-caution'}`}
              style={{ 'text-align': 'center', 'font-size': '8px' }}
            >
              {op.result === 'success' ? 'OK' : op.result === 'failed' ? 'FAIL' : 'PART'}
            </span>
          </div>
        )}
      </For>

      {/* Log viewer */}
      <div style={{
        padding: '4px 8px',
        background: 'var(--bg-surface)',
        'border-bottom': '1px solid var(--border)',
        display: 'flex',
        'justify-content': 'space-between',
        'align-items': 'center',
      }}>
        <span style={{
          'font-size': '9px',
          color: 'var(--text-muted)',
          'font-weight': '600',
          'letter-spacing': '1px',
        }}>
          DEBUG LOG
        </span>
        <span style={{ 'font-size': '9px', color: 'var(--text-muted)' }}>
          {store.logEntries().length} lines
        </span>
      </div>

      <div style={{
        background: '#08080A',
        'max-height': '300px',
        overflow: 'auto',
        padding: '4px 0',
      }}>
        <For each={store.logEntries()}>
          {(entry) => (
            <div style={{
              padding: '1px 8px',
              'font-size': '10px',
              'line-height': '1.5',
              background: levelBg(entry.level),
              display: 'flex',
              gap: '6px',
              'white-space': 'nowrap',
            }}>
              <span style={{ color: 'var(--text-muted)', 'flex-shrink': '0' }}>
                {entry.timestamp.split(' ')[1]}
              </span>
              <span style={{
                color: levelColor(entry.level),
                'font-weight': entry.level === 'FATAL' ? '700' : '500',
                width: '40px',
                'flex-shrink': '0',
              }}>
                {entry.level}
              </span>
              <span style={{ color: 'var(--text-muted)', width: '60px', 'flex-shrink': '0' }}>
                [{entry.caller}]
              </span>
              <span style={{ color: entry.level === 'DEBUG' ? 'var(--text-muted)' : 'var(--text-secondary)', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
                {entry.message}
              </span>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toTimeString().slice(0, 8)
  } catch {
    return iso
  }
}
