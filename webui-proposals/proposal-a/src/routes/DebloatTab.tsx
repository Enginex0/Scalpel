import { createSignal, createMemo, For, Show } from 'solid-js';
import { store } from '../lib/store';
import { CATEGORY_COLORS } from '../lib/constants';
import { Card } from '../components/core/Card';
import { Button } from '../components/core/Button';
import { AppIcon } from '../components/core/AppIcon';
import { Modal } from '../components/layout/Modal';
import { AppDetailSheet } from '../components/scalpel/AppDetailSheet';
import { ICONS } from '../lib/icons';
import { setupTextScroll } from '../lib/textScroll';
import type { Category, ScannedApp } from '../lib/types';

type SectionId = 'all' | Category;

// SAN skips 'unknown' filter — unknown apps only appear in 'All System Apps'
const SECTION_ORDER: SectionId[] = ['all', 'safe', 'essential', 'caution', 'google'];

const SECTION_META: Record<string, { color: string; glow: string; label: string }> = {
  all: { color: '#9e9e9e', glow: 'rgba(158, 158, 158, 0.4)', label: 'All System Apps' },
  ...CATEGORY_COLORS,
};

export function DebloatTab() {
  const [searchQuery, setSearchQuery] = createSignal('');
  const selected = store.debloatSelected;
  const setSelected = store.setDebloatSelected;
  const [restoreConfirmPkg, setRestoreConfirmPkg] = createSignal<string | null>(null);
  const [detailApp, setDetailApp] = createSignal<ScannedApp | null>(null);
  const [nukedOpen, setNukedOpen] = createSignal(false);
  const [scanning, setScanning] = createSignal(false);
  const [restoreSelected, setRestoreSelected] = createSignal<Set<string>>(new Set());

  const [openSections, setOpenSections] = createSignal<Set<SectionId>>(new Set(['safe']));

  const toggleSection = (id: SectionId) => {
    const next = new Set(openSections());
    if (next.has(id)) next.delete(id); else next.add(id);
    setOpenSections(next);
  };

  const nukedPkgs = createMemo(() => new Set(store.nukedApps().map(a => a.package_name)));

  const filteredNukedApps = createMemo(() => {
    const q = searchQuery().toLowerCase();
    if (!q) return store.nukedApps();
    return store.nukedApps().filter(a =>
      a.app_name.toLowerCase().includes(q) || a.package_name.toLowerCase().includes(q)
    );
  });

  const availableApps = createMemo(() =>
    store.scannedApps().filter(a => !nukedPkgs().has(a.package_name))
  );

  const searchFilteredApps = createMemo(() => {
    const q = searchQuery().toLowerCase();
    if (!q) return availableApps();
    return availableApps().filter(a =>
      a.app_name.toLowerCase().includes(q) || a.package_name.toLowerCase().includes(q)
    );
  });

  // "All System Apps" = flat alphabetical, categories = grouped
  const sectionApps = createMemo(() => {
    const apps = searchFilteredApps();
    const sections: { id: SectionId; apps: ScannedApp[] }[] = [];

    for (const id of SECTION_ORDER) {
      if (id === 'all') {
        const sorted = [...apps].sort((a, b) => a.app_name.localeCompare(b.app_name));
        if (sorted.length > 0) sections.push({ id: 'all', apps: sorted });
      } else {
        const catApps = apps
          .filter(a => a.category === id)
          .sort((a, b) => a.app_name.localeCompare(b.app_name));
        if (catApps.length > 0) sections.push({ id, apps: catApps });
      }
    }
    return sections;
  });

  const totalAvailable = createMemo(() => searchFilteredApps().length);

  const toggleSelect = (pkg: string) => {
    const s = new Set<string>(selected());
    if (s.has(pkg)) s.delete(pkg); else s.add(pkg);
    setSelected(s);
  };

  const toggleRestoreSelect = (pkg: string) => {
    const s = new Set(restoreSelected());
    if (s.has(pkg)) s.delete(pkg); else s.add(pkg);
    setRestoreSelected(s);
  };

  const handleRestore = async (pkg: string) => {
    setRestoreConfirmPkg(null);
    await store.restoreApp(pkg);
  };

  const handleBatchRestore = async () => {
    const pkgs = [...restoreSelected()];
    setRestoreSelected(new Set<string>());
    for (const pkg of pkgs) await store.restoreApp(pkg);
  };

  const handleRefresh = async () => {
    setScanning(true);
    try {
      await store.refreshAppList();
    } finally {
      setScanning(false);
    }
  };

  return (
    <div style={`padding:0 16px;padding-top:48px;padding-bottom:${selected().size > 0 || restoreSelected().size > 0 ? '140' : '80'}px;`}>
      {/* Search + refresh */}
      <div style="display:flex;gap:8px;margin-bottom:8px;padding-top:16px;">
        <div style="position:relative;flex:1;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--text-tertiary)" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);">
            <path d={ICONS.search} />
          </svg>
          <input
            type="text"
            placeholder="Search apps..."
            aria-label="Search apps"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            style={`
              width:100%;padding:12px 12px 12px 42px;
              background:var(--bg-surface);border:1px solid var(--glass-border);border-radius:100px;
              color:var(--text-primary);font-size:14px;
              transition:border-color 0.2s ease;
            `}
            onFocus={(e) => e.currentTarget.style.borderColor = `rgba(var(--accent-rgb), 0.5)`}
            onBlur={(e) => e.currentTarget.style.borderColor = `var(--glass-border)`}
          />
        </div>
        <button
          onClick={handleRefresh}
          disabled={scanning()}
          aria-label="Refresh app list"
          style={`
            width:44px;height:44px;border-radius:50%;flex-shrink:0;
            background:var(--bg-surface);border:1px solid var(--glass-border);
            color:var(--text-tertiary);display:flex;align-items:center;justify-content:center;
            transition:all 0.2s ease;cursor:pointer;
          `}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"
            style={scanning() ? 'animation:spin 1s linear infinite;' : ''}>
            <path d={ICONS.refresh} />
          </svg>
        </button>
      </div>

      {/* Instruction hint */}
      <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px;padding-left:4px;">
        Tap app to mark for removal
      </div>

      {/* Nuked apps section */}
      <Show when={filteredNukedApps().length > 0}>
        <div class="section-header" onClick={() => setNukedOpen(!nukedOpen())}>
          <span class="section-label">Debloated</span>
          <div class="section-meta">
            <span class="section-count">{filteredNukedApps().length}</span>
            <svg class={`section-chevron${nukedOpen() ? ' section-chevron--open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d={ICONS.chevronDown} />
            </svg>
          </div>
        </div>

        {/* Collapsed: last debloated app preview */}
        <Show when={!nukedOpen()}>
          {(() => {
            const last = filteredNukedApps()[filteredNukedApps().length - 1];
            return (
              <Card variant="glass" padding="small" style="border-left:2px solid var(--color-success);margin-bottom:16px;cursor:pointer;"
                onClick={() => setRestoreConfirmPkg(last.package_name)}>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
                  <AppIcon packageName={last.package_name} source="ksu" size={36} />
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:14px;font-weight:500;text-decoration:line-through;opacity:0.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                      <span ref={(el) => setupTextScroll(el)}>{last.app_name}</span>
                    </div>
                    <div style="font-size:11px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                      <span ref={(el) => setupTextScroll(el)}>{last.package_name}</span>
                    </div>
                  </div>
                  <Button size="small" variant="ghost" onClick={(e: MouseEvent) => { e.stopPropagation(); setRestoreConfirmPkg(last.package_name); }}>Restore</Button>
                </div>
              </Card>
            );
          })()}
        </Show>

        {/* Expanded: full list with Restore All */}
        <Show when={nukedOpen()}>
          <Show when={filteredNukedApps().length > 1}>
            <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
              <button
                class="section-action"
                onClick={() => store.restoreAllNuked()}
              >
                Restore All
              </button>
            </div>
          </Show>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
            <For each={filteredNukedApps()}>
              {(app, i) => {
                const isMarked = () => restoreSelected().has(app.package_name);
                return (
                  <div
                    onClick={() => toggleRestoreSelect(app.package_name)}
                    style={`
                      display:flex;align-items:center;gap:10px;padding:10px 12px;
                      background:${isMarked() ? 'rgba(76,175,80,0.10)' : 'var(--bg-surface)'};
                      border:1px solid ${isMarked() ? 'rgba(76,175,80,0.4)' : 'var(--glass-border)'};
                      border-left:3px solid ${isMarked() ? '#4caf50' : 'var(--color-success)'};
                      border-radius:12px;cursor:pointer;
                      transition:all 0.2s var(--ease-spring);
                      animation:slideInRight 0.2s var(--ease-out) ${i() * 40}ms both;
                    `}
                  >
                    <AppIcon packageName={app.package_name} source="ksu" size={36} />
                    <div style="flex:1;min-width:0;">
                      <div style="font-size:14px;font-weight:500;text-decoration:line-through;opacity:0.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        <span ref={(el) => setupTextScroll(el)}>{app.app_name}</span>
                      </div>
                      <div style="font-size:11px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        <span ref={(el) => setupTextScroll(el)}>{app.package_name}</span>
                      </div>
                    </div>
                    <Button size="small" variant="ghost" onClick={(e: MouseEvent) => { e.stopPropagation(); setRestoreConfirmPkg(app.package_name); }}>Restore</Button>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>

      {/* Available apps count */}
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px;">
        <span style="font-family:'Space Grotesk',sans-serif;font-size:32px;font-weight:700;" class="gradient-text">{totalAvailable()}</span>
        <span style="color:var(--text-tertiary);font-size:13px;">apps available</span>
      </div>
      <div class="category-separator" />

      {/* Collapsible category sections */}
      <For each={sectionApps()}>
        {(section) => {
          const meta = SECTION_META[section.id];
          const isOpen = () => openSections().has(section.id);
          return (
            <div style="margin-bottom:4px;">
              <div class="section-header" onClick={() => toggleSection(section.id)}>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span class="category-dot" style={`background:${meta.color};box-shadow:0 0 6px ${meta.glow};`} />
                  <span class="section-label" style={`color:${meta.color};`}>{meta.label}</span>
                </div>
                <div class="section-meta">
                  <span class="section-count">{section.apps.length}</span>
                  <svg class={`section-chevron${isOpen() ? ' section-chevron--open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d={ICONS.chevronDown} />
                  </svg>
                </div>
              </div>

              {/* App list — only rendered when open */}
              <Show when={isOpen()}>
                <div style="display:flex;flex-direction:column;gap:6px;padding-bottom:4px;">
                  <For each={section.apps}>
                    {(app, i) => {
                      const isSelected = () => selected().has(app.package_name);
                      const isEssential = app.category === 'essential';
                      const isCaution = app.category === 'caution';
                      return (
                        <div
                          onClick={() => toggleSelect(app.package_name)}
                          class={isEssential ? 'risk-essential' : isCaution ? 'risk-caution' : ''}
                          style={`
                            display:flex;align-items:center;gap:12px;padding:12px;
                            background:${isSelected() ? 'rgba(255,59,48,0.10)' : isEssential ? 'rgba(255,107,107,0.04)' : isCaution ? 'rgba(255,152,0,0.03)' : 'var(--bg-surface)'};
                            border:1px solid ${isSelected() ? 'rgba(255,59,48,0.4)' : 'var(--glass-border)'};
                            border-left:3px solid ${isSelected() ? '#ff3b30' : app.category !== 'unknown' ? (CATEGORY_COLORS[app.category]?.color || meta.color) : 'var(--glass-border)'};
                            border-radius:12px;cursor:pointer;
                            transition:all 0.2s var(--ease-spring);
                            animation:slideInRight 0.2s var(--ease-out) ${Math.min(i(), 8) * 40}ms both;
                          `}
                        >
                          <AppIcon packageName={app.package_name} source="ksu" />

                          <div style="flex:1;min-width:0;">
                            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                              <span ref={(el) => setupTextScroll(el)} style="font-size:14px;font-weight:500;">{app.app_name}</span>
                            </div>
                            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                              <span ref={(el) => setupTextScroll(el)} style="font-size:11px;color:var(--text-tertiary);">{app.package_name}</span>
                            </div>
                          </div>

                          <button
                            onClick={(e) => { e.stopPropagation(); setDetailApp(app); }}
                            aria-label={`Details for ${app.app_name}`}
                            style={`
                              width:28px;height:28px;border-radius:50%;flex-shrink:0;
                              border:1.5px solid rgba(var(--accent-rgb), 0.4);
                              background:rgba(var(--accent-rgb), 0.06);
                              color:var(--text-accent);
                              display:flex;align-items:center;justify-content:center;
                              transition:all 0.2s var(--ease-spring);
                            `}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
                            </svg>
                          </button>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>
          );
        }}
      </For>

      {/* Empty state */}
      <Show when={totalAvailable() === 0 && !scanning()}>
        <div style="text-align:center;padding:40px 0;color:var(--text-tertiary);">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.3;margin-bottom:12px;">
            <path d={ICONS.check} />
          </svg>
          <div style="font-size:14px;">No apps found</div>
        </div>
      </Show>

      {/* Mock mode indicator */}
      <Show when={store.mockMode()}>
        <div style="margin-top:16px;padding:8px 12px;border-radius:8px;background:rgba(var(--accent-rgb),0.1);border:1px solid rgba(var(--accent-rgb),0.2);text-align:center;font-size:11px;color:var(--text-tertiary);">
          Bridge not available -- showing mock data
        </div>
      </Show>

      {/* Batch restore bar */}
      <Show when={restoreSelected().size > 0}>
        <div style={`
          position:fixed;bottom:calc(68px + env(safe-area-inset-bottom));left:16px;right:76px;
          padding:12px 16px;border-radius:16px;
          background:var(--bg-surface-elevated);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
          border:1px solid rgba(76,175,80,0.3);
          display:flex;align-items:center;justify-content:space-between;
          z-index:110;
          animation:slideInUp 0.3s var(--ease-spring);
        `}>
          <span style="font-size:14px;font-weight:600;color:#4caf50;">{restoreSelected().size} to restore</span>
          <div style="display:flex;gap:8px;">
            <button
              onClick={() => setRestoreSelected(new Set<string>())}
              style="padding:4px 10px;border-radius:8px;font-size:12px;color:var(--text-tertiary);background:var(--bg-surface);border:1px solid var(--glass-border);"
            >
              Clear
            </button>
            <button
              onClick={handleBatchRestore}
              style="padding:4px 12px;border-radius:8px;font-size:12px;font-weight:600;color:#fff;background:#4caf50;border:none;"
            >
              Restore
            </button>
          </div>
        </div>
      </Show>

      {/* Batch debloat bar */}
      <Show when={selected().size > 0 && restoreSelected().size === 0}>
        <div style={`
          position:fixed;bottom:calc(68px + env(safe-area-inset-bottom));left:16px;right:76px;
          padding:12px 16px;border-radius:16px;
          background:var(--bg-surface-elevated);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
          border:1px solid rgba(255,59,48,0.3);
          display:flex;align-items:center;justify-content:space-between;
          z-index:110;
          animation:slideInUp 0.3s var(--ease-spring);
        `}>
          <span style="font-size:14px;font-weight:600;color:#ff3b30;">{selected().size} scheduled</span>
          <button
            onClick={() => setSelected(new Set<string>())}
            style="padding:4px 10px;border-radius:8px;font-size:12px;color:var(--text-tertiary);background:var(--bg-surface);border:1px solid var(--glass-border);"
          >
            Clear
          </button>
        </div>
      </Show>

      {/* Restore confirmation modal */}
      <Modal open={!!restoreConfirmPkg()} onClose={() => setRestoreConfirmPkg(null)} title="Confirm Restore">
        <p style="text-align:center;color:var(--text-secondary);margin-bottom:16px;font-size:14px;">
          Restore {store.nukedApps().find(a => a.package_name === restoreConfirmPkg())?.app_name || restoreConfirmPkg()}?
        </p>
        <div style="display:flex;gap:12px;">
          <Button variant="ghost" fullWidth onClick={() => setRestoreConfirmPkg(null)}>Cancel</Button>
          <Button variant="primary" fullWidth onClick={() => handleRestore(restoreConfirmPkg()!)}>Restore</Button>
        </div>
      </Modal>

      <AppDetailSheet app={detailApp()} onClose={() => setDetailApp(null)} />
    </div>
  );
}
