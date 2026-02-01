import { createSignal, createMemo, batch } from 'solid-js'
import type { AppEntry, NukeEntry, StatusJson, CategoriesJson, SystemizeEntry, ConfigState, ModuleProp, LogEntry, TabId, SortField, SortDir, UserApp } from './types'
import * as mock from './mock-bridge'

const [activeTab, setActiveTab] = createSignal<TabId>('debloat')
const [appList, setAppList] = createSignal<AppEntry[]>([])
const [nukeList, setNukeList] = createSignal<NukeEntry[]>([])
const [status, setStatus] = createSignal<StatusJson | null>(null)
const [categories, setCategories] = createSignal<CategoriesJson | null>(null)
const [systemizeList, setSystemizeList] = createSignal<SystemizeEntry[]>([])
const [userApps, setUserApps] = createSignal<UserApp[]>([])
const [config, setConfig] = createSignal<ConfigState | null>(null)
const [moduleProp, setModuleProp] = createSignal<ModuleProp | null>(null)
const [logEntries, setLogEntries] = createSignal<LogEntry[]>([])
const [bootCount, setBootCount] = createSignal(0)
const [monitorStatus, setMonitorStatus] = createSignal<'running' | 'stopped'>('stopped')

const [searchQuery, setSearchQuery] = createSignal('')
const [categoryFilters, setCategoryFilters] = createSignal<Set<string>>(new Set())
const [selectedApps, setSelectedApps] = createSignal<Set<string>>(new Set())
const [expandedApp, setExpandedApp] = createSignal<string | null>(null)
const [sortField, setSortField] = createSignal<SortField>('app_name')
const [sortDir, setSortDir] = createSignal<SortDir>('asc')

const [selectedUserApps, setSelectedUserApps] = createSignal<Set<string>>(new Set())

const [operating, setOperating] = createSignal(false)
const [operatingPkgs, setOperatingPkgs] = createSignal<Set<string>>(new Set())
const [needsReboot, setNeedsReboot] = createSignal(false)
const [scanning, setScanning] = createSignal(false)

function parseLogLine(line: string): LogEntry | null {
  const match = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[(\w+)\] \[(\w+(?:\-\w+)*)\] (.+)$/)
  if (!match) return null
  return {
    timestamp: match[1],
    level: match[2] as LogEntry['level'],
    caller: match[3],
    message: match[4],
    raw: line,
  }
}

function parseModuleProp(raw: string): ModuleProp {
  const lines = raw.trim().split('\n')
  const props: Record<string, string> = {}
  for (const line of lines) {
    const idx = line.indexOf('=')
    if (idx > 0) props[line.slice(0, idx)] = line.slice(idx + 1)
  }
  return {
    id: props.id || 'scalpel',
    name: props.name || 'Scalpel',
    version: props.version || 'v0.1.0',
    versionCode: props.versionCode || '1',
    author: props.author || 'Jeremy Wealth',
    description: props.description || '',
  }
}

function isNuked(pkg: string): boolean {
  return nukeList().some(e => e.package_name === pkg)
}

function toggleCategoryFilter(catId: string) {
  const current = new Set(categoryFilters())
  if (current.has(catId)) current.delete(catId)
  else current.add(catId)
  setCategoryFilters(current)
}

function toggleAppSelection(pkg: string) {
  const current = new Set(selectedApps())
  if (current.has(pkg)) current.delete(pkg)
  else current.add(pkg)
  setSelectedApps(current)
}

function toggleUserAppSelection(pkg: string) {
  const current = new Set(selectedUserApps())
  if (current.has(pkg)) current.delete(pkg)
  else current.add(pkg)
  setSelectedUserApps(current)
}

function clearSelection() {
  setSelectedApps(new Set())
}

function clearUserSelection() {
  setSelectedUserApps(new Set())
}

function toggleSort(field: SortField) {
  if (sortField() === field) {
    setSortDir(sortDir() === 'asc' ? 'desc' : 'asc')
  } else {
    setSortField(field)
    setSortDir('asc')
  }
}

const filteredApps = createMemo(() => {
  let apps = appList()
  const q = searchQuery().toLowerCase()
  if (q) {
    apps = apps.filter(a =>
      a.app_name.toLowerCase().includes(q) ||
      a.package_name.toLowerCase().includes(q)
    )
  }
  const filters = categoryFilters()
  if (filters.size > 0) {
    apps = apps.filter(a => filters.has(a.category))
  }

  const field = sortField()
  const dir = sortDir()
  return [...apps].sort((a, b) => {
    let va: string, vb: string
    if (field === 'status') {
      va = isNuked(a.package_name) ? 'nuked' : 'active'
      vb = isNuked(b.package_name) ? 'nuked' : 'active'
    } else {
      va = (a as Record<string, unknown>)[field] as string
      vb = (b as Record<string, unknown>)[field] as string
    }
    const cmp = va.localeCompare(vb)
    return dir === 'asc' ? cmp : -cmp
  })
})

const nukedCount = createMemo(() => nukeList().length)
const activeCount = createMemo(() => appList().length - nukeList().length)
const totalCount = createMemo(() => appList().length)

async function loadInitialData() {
  batch(() => {
    setAppList(mock.getAppList())
    setNukeList(mock.getNukeList())
    setStatus(mock.getStatus())
    setCategories(mock.getCategories())
    setSystemizeList(mock.getSystemizeList())
    setUserApps(mock.getUserApps())
    setConfig(mock.getConfig())
    setModuleProp(parseModuleProp(mock.getModuleProp()))
    setBootCount(mock.getBootCount())
    setMonitorStatus(mock.getMonitorStatus())

    const logRaw = mock.getDebugLog()
    const entries = logRaw.split('\n').map(parseLogLine).filter((e): e is LogEntry => e !== null)
    setLogEntries(entries)
  })
}

async function nukeSelected() {
  const sel = selectedApps()
  if (sel.size === 0) return

  setOperating(true)
  setOperatingPkgs(new Set(sel))

  const entries: NukeEntry[] = []
  for (const pkg of sel) {
    const app = appList().find(a => a.package_name === pkg)
    if (app && !isNuked(pkg)) {
      entries.push({ package_name: pkg, app_path: app.app_path })
    }
  }

  if (entries.length > 0) {
    await mock.nukeApps(entries)
    batch(() => {
      setNukeList(mock.getNukeList())
      setStatus(mock.getStatus())
      setNeedsReboot(true)
    })
  }

  batch(() => {
    setOperating(false)
    setOperatingPkgs(new Set())
    setSelectedApps(new Set())
  })
}

async function restoreSelected() {
  const sel = selectedApps()
  if (sel.size === 0) return

  setOperating(true)
  setOperatingPkgs(new Set(sel))

  const pkgs = [...sel].filter(pkg => isNuked(pkg))
  if (pkgs.length > 0) {
    await mock.restoreApps(pkgs)
    batch(() => {
      setNukeList(mock.getNukeList())
      setStatus(mock.getStatus())
      setNeedsReboot(true)
    })
  }

  batch(() => {
    setOperating(false)
    setOperatingPkgs(new Set())
    setSelectedApps(new Set())
  })
}

async function nukeApp(pkg: string) {
  const app = appList().find(a => a.package_name === pkg)
  if (!app || isNuked(pkg)) return

  setOperatingPkgs(new Set([pkg]))
  await mock.nukeApps([{ package_name: pkg, app_path: app.app_path }])
  batch(() => {
    setNukeList(mock.getNukeList())
    setStatus(mock.getStatus())
    setNeedsReboot(true)
    setOperatingPkgs(new Set())
  })
}

async function restoreApp(pkg: string) {
  if (!isNuked(pkg)) return

  setOperatingPkgs(new Set([pkg]))
  await mock.restoreApps([pkg])
  batch(() => {
    setNukeList(mock.getNukeList())
    setStatus(mock.getStatus())
    setNeedsReboot(true)
    setOperatingPkgs(new Set())
  })
}

async function promote(pkg: string) {
  setOperatingPkgs(new Set([pkg]))
  const ok = await mock.promoteApp(pkg)
  if (ok) {
    batch(() => {
      setSystemizeList(mock.getSystemizeList())
      setUserApps(mock.getUserApps())
      setStatus(mock.getStatus())
      setNeedsReboot(true)
    })
  }
  setOperatingPkgs(new Set())
}

async function demote(pkg: string) {
  setOperatingPkgs(new Set([pkg]))
  const ok = await mock.demoteApp(pkg)
  if (ok) {
    batch(() => {
      setSystemizeList(mock.getSystemizeList())
      setUserApps(mock.getUserApps())
      setStatus(mock.getStatus())
      setNeedsReboot(true)
    })
  }
  setOperatingPkgs(new Set())
}

async function updateConfig(key: string, value: string) {
  const ok = await mock.setConfig(key, value)
  if (ok) setConfig(mock.getConfig())
}

async function refreshAppList() {
  setScanning(true)
  await mock.refreshScan()
  batch(() => {
    setAppList(mock.getAppList())
    setScanning(false)
  })
}

export const store = {
  activeTab, setActiveTab,
  appList, nukeList, status, categories, systemizeList, userApps, config, moduleProp,
  logEntries, bootCount, monitorStatus,
  searchQuery, setSearchQuery,
  categoryFilters, toggleCategoryFilter,
  selectedApps, toggleAppSelection, clearSelection,
  selectedUserApps, toggleUserAppSelection, clearUserSelection,
  expandedApp, setExpandedApp,
  sortField, sortDir, toggleSort,
  filteredApps, nukedCount, activeCount, totalCount,
  operating, operatingPkgs, needsReboot, setNeedsReboot, scanning,
  isNuked,
  loadInitialData, nukeSelected, restoreSelected, nukeApp, restoreApp,
  promote, demote, updateConfig, refreshAppList,
}
