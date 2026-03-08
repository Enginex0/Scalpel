import { createSignal, createMemo, For, Show } from 'solid-js';
import { store } from '../lib/store';
import { Card } from '../components/core/Card';
import { Button } from '../components/core/Button';
import { AppIcon } from '../components/core/AppIcon';
import { Modal } from '../components/layout/Modal';
import { ICONS } from '../lib/icons';
import { setupTextScroll } from '../lib/textScroll';

export function SystemizeTab() {
  const [searchQuery, setSearchQuery] = createSignal('');
  const [demoteConfirmPkg, setDemoteConfirmPkg] = createSignal<string | null>(null);

  const selected = store.systemizeSelected;
  const setSelected = store.setSystemizeSelected;

  const promotedPkgs = createMemo(() => new Set(store.promotedApps().map(a => a.package_name)));

  // Only user-installed apps (/data/app/) are eligible for promotion
  const eligibleApps = createMemo(() =>
    store.userApps().filter(a => !a.sourcePath || a.sourcePath.startsWith('/data/app/'))
  );

  const availableUserApps = createMemo(() => {
    const q = searchQuery().toLowerCase();
    return eligibleApps()
      .filter(a => {
        if (promotedPkgs().has(a.package_name)) return false;
        if (q && !a.app_name.toLowerCase().includes(q) && !a.package_name.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.app_name.localeCompare(b.app_name));
  });

  const availableCount = createMemo(() =>
    eligibleApps().filter(a => !promotedPkgs().has(a.package_name)).length
  );

  const toggleSelect = (pkg: string) => {
    const s = new Set<string>(selected());
    if (s.has(pkg)) s.delete(pkg); else s.add(pkg);
    setSelected(s);
  };

  const [demoteSelected, setDemoteSelected] = createSignal<Set<string>>(new Set());

  const [openSections, setOpenSections] = createSignal<Set<string>>(new Set(['available']));
  const toggleSection = (id: string) => {
    const next = new Set(openSections());
    if (next.has(id)) next.delete(id); else next.add(id);
    setOpenSections(next);
  };

  const toggleDemoteSelect = (pkg: string) => {
    const s = new Set(demoteSelected());
    if (s.has(pkg)) s.delete(pkg); else s.add(pkg);
    setDemoteSelected(s);
  };

  const handleDemote = async (pkg: string) => {
    setDemoteConfirmPkg(null);
    await store.demoteApp(pkg);
  };

  const handleBatchDemote = async () => {
    const pkgs = [...demoteSelected()];
    setDemoteSelected(new Set<string>());
    for (const pkg of pkgs) await store.demoteApp(pkg);
  };

  return (
    <div style="padding:0 16px;padding-top:48px;">
      {/* Hero stats */}
      <div style="display:flex;gap:16px;margin-bottom:20px;">
        <div style="flex:1;text-align:center;">
          <div style="font-family:'Space Grotesk',sans-serif;font-size:36px;font-weight:700;" class="gradient-text">
            {store.promotedApps().length}
          </div>
          <div style="font-size:12px;color:var(--text-tertiary);font-weight:500;">PROMOTED</div>
        </div>
        <div style="width:1px;background:var(--glass-border);" />
        <div style="flex:1;text-align:center;">
          <div style="font-family:'Space Grotesk',sans-serif;font-size:36px;font-weight:700;color:var(--text-secondary);">
            {availableCount()}
          </div>
          <div style="font-size:12px;color:var(--text-tertiary);font-weight:500;">AVAILABLE</div>
        </div>
      </div>

      <Show when={store.promotedApps().length > 0}>
        <div style="margin-bottom:20px;">
          <div class="section-header" onClick={() => toggleSection('promoted')}>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="category-dot" style="background:var(--color-success);box-shadow:0 0 6px var(--color-success);" />
              <span class="section-label" style="color:var(--color-success);">Promoted to System</span>
            </div>
            <div class="section-meta">
              <span class="section-count">{store.promotedApps().length}</span>
              <svg class={`section-chevron${openSections().has('promoted') ? ' section-chevron--open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d={ICONS.chevronDown} />
              </svg>
            </div>
          </div>

          <Show when={!openSections().has('promoted')}>
            {(() => {
              const last = store.promotedApps()[store.promotedApps().length - 1];
              return (
                <Card variant="glass" padding="small" style="border-left:2px solid var(--color-success);margin-bottom:16px;cursor:pointer;"
                  onClick={() => setDemoteConfirmPkg(last.package_name)}>
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
                    <AppIcon packageName={last.package_name} source="ksu" size={36} appName={last.app_name} />
                    <div style="flex:1;min-width:0;">
                      <div style="font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        <span ref={(el) => setupTextScroll(el)}>{last.app_name}</span>
                      </div>
                      <div style="font-size:11px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        <span ref={(el) => setupTextScroll(el)}>{last.package_name}</span>
                      </div>
                    </div>
                    <Button size="small" variant="ghost" style="color:var(--color-error);" onClick={(e: MouseEvent) => { e.stopPropagation(); setDemoteConfirmPkg(last.package_name); }}>Demote</Button>
                  </div>
                </Card>
              );
            })()}
          </Show>

          <Show when={openSections().has('promoted')}>
            <Show when={store.promotedApps().length > 1}>
              <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
                <button
                  class="section-action"
                  onClick={() => { for (const a of store.promotedApps()) store.demoteApp(a.package_name); }}
                >
                  Demote All
                </button>
              </div>
            </Show>
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
              <For each={store.promotedApps()}>
                {(app, i) => {
                  const isMarked = () => demoteSelected().has(app.package_name);
                  return (
                    <div
                      onClick={() => toggleDemoteSelect(app.package_name)}
                      style={`
                        display:flex;align-items:center;gap:10px;padding:10px 12px;
                        background:${isMarked() ? 'rgba(255,59,48,0.10)' : 'var(--bg-surface)'};
                        border:1px solid ${isMarked() ? 'rgba(255,59,48,0.4)' : 'var(--glass-border)'};
                        border-left:3px solid ${isMarked() ? '#ff3b30' : 'var(--color-success)'};
                        border-radius:12px;cursor:pointer;
                        transition:all 0.2s var(--ease-spring);
                        animation:slideInRight 0.2s var(--ease-out) ${i() * 40}ms both;
                      `}
                    >
                      <AppIcon packageName={app.package_name} source="ksu" size={36} appName={app.app_name} />
                      <div style="flex:1;min-width:0;">
                        <div style="font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                          <span ref={(el) => setupTextScroll(el)}>{app.app_name}</span>
                        </div>
                        <div style="font-size:11px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                          <span ref={(el) => setupTextScroll(el)}>{app.package_name}</span>
                        </div>
                      </div>
                      <Button size="small" variant="ghost" style="color:var(--color-error);" onClick={(e: MouseEvent) => { e.stopPropagation(); setDemoteConfirmPkg(app.package_name); }}>Demote</Button>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      {/* Available user apps */}
      <div class="section-header" onClick={() => toggleSection('available')}>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="category-dot" style="background:var(--text-accent);box-shadow:0 0 6px var(--text-accent);" />
          <span class="section-label">Available User Apps</span>
        </div>
        <div class="section-meta">
          <span class="section-count">{availableCount()}</span>
          <svg class={`section-chevron${openSections().has('available') ? ' section-chevron--open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d={ICONS.chevronDown} />
          </svg>
        </div>
      </div>

      <Show when={openSections().has('available')}>
        <div style="position:relative;margin-bottom:8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--text-tertiary)" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);">
            <path d={ICONS.search} />
          </svg>
          <input
            type="text"
            placeholder="Search user apps..."
            aria-label="Search user apps"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            style="width:100%;padding:10px 12px 10px 42px;background:var(--bg-surface);border:1px solid var(--glass-border);border-radius:100px;color:var(--text-primary);font-size:14px;"
          />
        </div>

        <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px;padding-left:4px;">
          Tap app to mark for promotion
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <For each={availableUserApps()}>
            {(app, i) => {
              const isSelected = () => selected().has(app.package_name);
              return (
                <div
                  onClick={() => toggleSelect(app.package_name)}
                  style={`
                    display:flex;align-items:center;gap:12px;padding:12px;
                    background:${isSelected() ? 'rgba(var(--accent-rgb), 0.08)' : 'var(--bg-surface)'};
                    border:1px solid ${isSelected() ? 'rgba(var(--accent-rgb), 0.3)' : 'var(--glass-border)'};
                    border-radius:12px;cursor:pointer;
                    transition:all 0.2s var(--ease-spring);
                    animation:slideInRight 0.2s var(--ease-out) ${Math.min(i(), 8) * 40}ms both;
                  `}
                >
                  <AppIcon packageName={app.package_name} source="ksu" appName={app.app_name} />
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                      <span ref={(el) => setupTextScroll(el)}>{app.app_name}</span>
                    </div>
                    <div style="font-size:11px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                      <span ref={(el) => setupTextScroll(el)}>{app.package_name}</span>
                    </div>
                  </div>
                  <div style={`
                    width:22px;height:22px;border-radius:50%;flex-shrink:0;
                    border:2px solid ${isSelected() ? 'rgba(var(--accent-rgb), 0.8)' : 'rgba(255,255,255,0.15)'};
                    background:${isSelected() ? 'rgba(var(--accent-rgb), 0.15)' : 'transparent'};
                    display:flex;align-items:center;justify-content:center;
                    transition:all 0.2s var(--ease-spring);
                  `}>
                    <Show when={isSelected()}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--text-accent)">
                        <path d={ICONS.check} />
                      </svg>
                    </Show>
                  </div>
                </div>
              );
            }}
          </For>
        </div>

        <Show when={availableUserApps().length === 0}>
          <div style="text-align:center;padding:40px 0;color:var(--text-tertiary);">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.3;margin-bottom:12px;">
              <path d={ICONS.check} />
            </svg>
            <div style="font-size:14px;">No user apps available</div>
          </div>
        </Show>
      </Show>

      <Show when={demoteSelected().size > 0}>
        <div style={`
          position:fixed;bottom:calc(68px + env(safe-area-inset-bottom));left:16px;right:76px;
          padding:12px 16px;border-radius:16px;
          background:var(--bg-surface-elevated);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
          border:1px solid rgba(255,59,48,0.3);
          display:flex;align-items:center;justify-content:space-between;
          z-index:110;
          animation:slideInUp 0.3s var(--ease-spring);
        `}>
          <span style="font-size:14px;font-weight:600;color:#ff3b30;">{demoteSelected().size} to demote</span>
          <div style="display:flex;gap:8px;">
            <button
              onClick={() => setDemoteSelected(new Set())}
              style="padding:4px 10px;border-radius:8px;font-size:12px;color:var(--text-tertiary);background:var(--bg-surface);border:1px solid var(--glass-border);"
            >
              Clear
            </button>
            <button
              onClick={handleBatchDemote}
              style="padding:4px 12px;border-radius:8px;font-size:12px;font-weight:600;color:#fff;background:#ff3b30;border:none;"
            >
              Demote
            </button>
          </div>
        </div>
      </Show>

      <Show when={selected().size > 0 && demoteSelected().size === 0}>
        <div style={`
          position:fixed;bottom:calc(68px + env(safe-area-inset-bottom));left:16px;right:76px;
          padding:12px 16px;border-radius:16px;
          background:var(--bg-surface-elevated);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
          border:1px solid var(--glass-border);
          display:flex;align-items:center;justify-content:space-between;
          z-index:110;
          animation:slideInUp 0.3s var(--ease-spring);
        `}>
          <span style="font-size:14px;font-weight:600;">{selected().size} selected</span>
          <button
            onClick={() => setSelected(new Set<string>())}
            style="padding:4px 10px;border-radius:8px;font-size:12px;color:var(--text-tertiary);background:var(--bg-surface);border:1px solid var(--glass-border);"
          >
            Clear
          </button>
        </div>
      </Show>

      {/* Demote confirmation */}
      <Modal open={!!demoteConfirmPkg()} onClose={() => setDemoteConfirmPkg(null)} title="Confirm Demotion">
        <p style="text-align:center;color:var(--text-secondary);margin-bottom:8px;font-size:14px;">
          Demote <strong>{store.promotedApps().find(a => a.package_name === demoteConfirmPkg())?.app_name || demoteConfirmPkg()}</strong> back to user app?
        </p>
        <p style="text-align:center;color:var(--text-tertiary);margin-bottom:16px;font-size:12px;">
          A reboot is required.
        </p>
        <div style="display:flex;gap:12px;">
          <Button variant="ghost" fullWidth onClick={() => setDemoteConfirmPkg(null)}>Cancel</Button>
          <Button variant="danger" fullWidth onClick={() => handleDemote(demoteConfirmPkg()!)}>Demote</Button>
        </div>
      </Modal>
    </div>
  );
}
