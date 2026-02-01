import { createSignal, Show, For, createMemo } from 'solid-js';
import { store } from '../lib/store';
import { BottomSheet } from '../App';
import { ICONS } from '../lib/icons';
import type { AppEntry, CategoryId } from '../lib/types';

function Icon(props: { path: string; size?: number }) {
  return (
    <svg width={props.size || 24} height={props.size || 24} viewBox="0 0 24 24" fill="currentColor">
      <path d={props.path} />
    </svg>
  );
}

export function DebloatTab() {
  const [selectedCategory, setSelectedCategory] = createSignal<CategoryId | null>(null);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [selectedApp, setSelectedApp] = createSignal<AppEntry | null>(null);
  const [showConfirm, setShowConfirm] = createSignal(false);
  const [confirmAction, setConfirmAction] = createSignal<'debloat' | 'restore'>('debloat');

  const totalDebloated = createMemo(() => store.nukeList().length);
  const totalApps = createMemo(() => store.appList().length);

  const categoryDefs = createMemo(() => store.categories()?.categories || []);

  const filteredApps = createMemo(() => {
    const cat = selectedCategory();
    if (!cat) return [];
    const q = searchQuery().toLowerCase();
    return store.getAppsByCategory(cat).filter(a =>
      !q || a.app_name.toLowerCase().includes(q) || a.package_name.toLowerCase().includes(q)
    );
  });

  const handleAppAction = (app: AppEntry, action: 'debloat' | 'restore') => {
    setSelectedApp(app);
    setConfirmAction(action);
    if (action === 'debloat' && (app.category === 'essential' || app.category === 'caution')) {
      setShowConfirm(true);
    } else {
      setShowConfirm(true);
    }
  };

  const executeAction = async () => {
    const app = selectedApp();
    if (!app) return;
    setShowConfirm(false);
    if (confirmAction() === 'debloat') {
      await store.debloatApp(app);
    } else {
      await store.restoreApp(app);
    }
    setSelectedApp(null);
  };

  const getCategoryTint = (color: string) => `${color}15`;
  const getCategoryBorder = (color: string) => `${color}30`;

  return (
    <div class="page-content">
      {/* Hero Summary Card */}
      <div class="stagger-1" style={`
        background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.15), rgba(var(--accent-rgb), 0.05));
        border-radius: var(--radius-xl); padding: 20px;
        margin-bottom: 16px; border: 1px solid rgba(var(--accent-rgb), 0.1);
      `}>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 32px; font-weight: 700; letter-spacing: -0.02em; color: var(--accent);">
              {totalDebloated()}
            </div>
            <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
              apps debloated
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 24px; font-weight: 600; color: var(--text);">
              {totalApps()}
            </div>
            <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
              system apps found
            </div>
          </div>
        </div>
        <Show when={store.status()}>
          {(s) => (
            <div style={`
              margin-top: 12px; padding: 8px 12px;
              background: rgba(var(--accent-rgb), 0.1); border-radius: var(--radius-sm);
              font-size: 12px; color: var(--text-secondary);
              display: flex; align-items: center; gap: 6px;
            `}>
              <span style={`width: 6px; height: 6px; border-radius: 50%; background: var(--success);`} />
              Mode: {s().mode} {s().mode !== 'pm' ? '' : '(immediate)'}
            </div>
          )}
        </Show>
      </div>

      {/* Back button when in category view */}
      <Show when={selectedCategory() !== null}>
        <button
          class="stagger-1"
          onClick={() => { setSelectedCategory(null); setSearchQuery(''); }}
          style={`
            display: flex; align-items: center; gap: 8px; padding: 10px 0;
            color: var(--accent); font-size: 14px; font-weight: 500;
            margin-bottom: 8px;
          `}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="transform: rotate(180deg);">
            <path d={ICONS.chevronRight} />
          </svg>
          All Categories
        </button>
      </Show>

      {/* Search Bar */}
      <Show when={selectedCategory() !== null}>
        <div class="stagger-1" style={`
          position: relative; margin-bottom: 16px;
        `}>
          <span style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary);">
            <Icon path={ICONS.search} size={18} />
          </span>
          <input
            type="text"
            placeholder="Search apps..."
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            style={`
              width: 100%; padding: 14px 16px 14px 44px;
              background: var(--surface); border: 1px solid var(--border);
              border-radius: var(--radius-pill); color: var(--text);
              font-size: 14px; transition: border-color 200ms ease;
            `}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
          />
        </div>
      </Show>

      {/* Category Cards View */}
      <Show when={selectedCategory() === null}>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 15px; font-weight: 600; letter-spacing: -0.01em;">Categories</span>
            <button
              onClick={() => store.refreshScanner()}
              disabled={store.loading.scanner}
              style={`
                display: flex; align-items: center; gap: 6px;
                padding: 8px 14px; border-radius: var(--radius-pill);
                background: var(--surface); border: 1px solid var(--border);
                color: var(--text-secondary); font-size: 12px; font-weight: 500;
                transition: all 200ms ease;
              `}
            >
              <span style={store.loading.scanner ? 'animation: spin 0.8s linear infinite;' : ''}>
                <Icon path={ICONS.refresh} size={14} />
              </span>
              Refresh
            </button>
          </div>

          <For each={categoryDefs()}>
            {(cat, i) => {
              const count = () => store.getCategoryCount(cat.id);
              const nuked = () => store.getNukedCountByCategory(cat.id);
              return (
                <button
                  class={`stagger-${Math.min(i() + 2, 5)}`}
                  onClick={() => setSelectedCategory(cat.id)}
                  style={`
                    display: flex; align-items: center; gap: 14px;
                    padding: 18px 16px; min-height: 80px; border-radius: var(--radius-lg);
                    background: ${getCategoryTint(cat.color)};
                    border: 1px solid ${getCategoryBorder(cat.color)};
                    text-align: left; width: 100%;
                    transition: transform 200ms var(--ease-spring), box-shadow 200ms ease;
                  `}
                  onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                  onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  onPointerLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <span style="font-size: 28px; flex-shrink: 0; width: 40px; text-align: center;">
                    {cat.emoji}
                  </span>
                  <div style="flex: 1; min-width: 0;">
                    <div style={`font-size: 15px; font-weight: 600; color: ${cat.color};`}>
                      {cat.name}
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px; line-height: 1.4;">
                      {cat.description.substring(0, 60)}{cat.description.length > 60 ? '...' : ''}
                    </div>
                  </div>
                  <div style="flex-shrink: 0; text-align: right;">
                    <div style="font-size: 18px; font-weight: 700; color: var(--text);">
                      {count()}
                    </div>
                    <Show when={nuked() > 0}>
                      <div style={`font-size: 11px; color: var(--success); font-weight: 500;`}>
                        {nuked()} nuked
                      </div>
                    </Show>
                  </div>
                  <span style="color: var(--text-tertiary); flex-shrink: 0;">
                    <Icon path={ICONS.chevronRight} size={20} />
                  </span>
                </button>
              );
            }}
          </For>
        </div>
      </Show>

      {/* App List View (inside a category) */}
      <Show when={selectedCategory() !== null}>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <Show when={filteredApps().length === 0}>
            <div style={`
              text-align: center; padding: 48px 20px; color: var(--text-tertiary);
            `}>
              <Icon path={ICONS.search} size={40} />
              <p style="margin-top: 12px; font-size: 14px;">No apps match your search</p>
            </div>
          </Show>

          <For each={filteredApps()}>
            {(app, i) => {
              const nuked = () => store.isNuked(app.package_name);
              const catDef = () => categoryDefs().find(c => c.id === app.category);
              return (
                <button
                  class={`stagger-${Math.min(i() + 1, 5)}`}
                  onClick={() => {
                    setSelectedApp(app);
                  }}
                  style={`
                    display: flex; align-items: center; gap: 12px;
                    padding: 14px 16px; border-radius: var(--radius-lg);
                    background: var(--surface); border: 1px solid var(--border);
                    text-align: left; width: 100%;
                    transition: transform 200ms var(--ease-spring);
                    ${nuked() ? 'opacity: 0.6;' : ''}
                  `}
                  onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                  onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  onPointerLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <div style={`
                    width: 40px; height: 40px; border-radius: var(--radius-sm);
                    background: ${getCategoryTint(catDef()?.color || '#666')};
                    display: flex; align-items: center; justify-content: center;
                    font-size: 18px; flex-shrink: 0;
                  `}>
                    {app.app_name.charAt(0)}
                  </div>
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      {app.app_name}
                    </div>
                    <div style="font-size: 11px; color: var(--text-tertiary); font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      {app.package_name}
                    </div>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                    <Show when={app.is_split}>
                      <span style={`
                        padding: 2px 6px; border-radius: var(--radius-pill);
                        background: rgba(var(--accent-rgb), 0.1); color: var(--accent);
                        font-size: 10px; font-weight: 600;
                      `}>Split</span>
                    </Show>
                    <Show when={nuked()}>
                      <span style={`
                        padding: 2px 8px; border-radius: var(--radius-pill);
                        background: rgba(239, 68, 68, 0.15); color: var(--danger);
                        font-size: 10px; font-weight: 600;
                      `}>Nuked</span>
                    </Show>
                    <Show when={!nuked()}>
                      <span style={`
                        padding: 2px 8px; border-radius: var(--radius-pill);
                        background: rgba(16, 185, 129, 0.1); color: var(--success);
                        font-size: 10px; font-weight: 600;
                      `}>Active</span>
                    </Show>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
      </Show>

      {/* App Detail Bottom Sheet */}
      <BottomSheet
        open={selectedApp() !== null && !showConfirm()}
        onClose={() => setSelectedApp(null)}
        title={selectedApp()?.app_name || ''}
      >
        <Show when={selectedApp()}>
          {(app) => {
            const nuked = () => store.isNuked(app().package_name);
            const catDef = () => categoryDefs().find(c => c.id === app().category);
            return (
              <div>
                <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary); font-size: 13px;">Package</span>
                    <span style="font-size: 12px; font-family: monospace; color: var(--text-tertiary);">{app().package_name}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary); font-size: 13px;">Partition</span>
                    <span style="font-size: 13px; text-transform: capitalize;">{app().partition}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary); font-size: 13px;">Category</span>
                    <span style={`
                      padding: 2px 10px; border-radius: var(--radius-pill);
                      background: ${getCategoryTint(catDef()?.color || '#666')};
                      color: ${catDef()?.color || 'var(--text)'};
                      font-size: 12px; font-weight: 600;
                    `}>{catDef()?.name || app().category}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary); font-size: 13px;">Privileged</span>
                    <span style="font-size: 13px;">{app().is_priv_app ? 'Yes' : 'No'}</span>
                  </div>
                  <Show when={app().is_split}>
                    <div style="display: flex; justify-content: space-between;">
                      <span style="color: var(--text-secondary); font-size: 13px;">Split APK</span>
                      <span style="font-size: 13px;">Yes</span>
                    </div>
                  </Show>
                </div>

                <Show when={app().category === 'essential'}>
                  <div style={`
                    padding: 12px 14px; border-radius: var(--radius-sm);
                    background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2);
                    margin-bottom: 16px; display: flex; align-items: flex-start; gap: 10px;
                  `}>
                    <Icon path={ICONS.warning} size={18} />
                    <span style="font-size: 12px; color: var(--danger); line-height: 1.5;">
                      Removing this app will likely cause a bootloop. Proceed with extreme caution.
                    </span>
                  </div>
                </Show>

                <Show when={app().category === 'caution'}>
                  <div style={`
                    padding: 12px 14px; border-radius: var(--radius-sm);
                    background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2);
                    margin-bottom: 16px; display: flex; align-items: flex-start; gap: 10px;
                  `}>
                    <Icon path={ICONS.warning} size={18} />
                    <span style="font-size: 12px; color: var(--warning); line-height: 1.5;">
                      This may affect device functionality. Remove only if you know what you are doing.
                    </span>
                  </div>
                </Show>

                <Show when={!nuked()}>
                  <button
                    onClick={() => handleAppAction(app(), 'debloat')}
                    disabled={store.operationInProgress()}
                    style={`
                      width: 100%; padding: 16px; border-radius: var(--radius-md);
                      background: var(--danger); color: white;
                      font-size: 15px; font-weight: 600;
                      transition: transform 200ms var(--ease-spring);
                      opacity: ${store.operationInProgress() ? '0.5' : '1'};
                    `}
                    onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
                    onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    {store.loading.nuke ? 'Debloating...' : 'Debloat This App'}
                  </button>
                </Show>
                <Show when={nuked()}>
                  <button
                    onClick={() => handleAppAction(app(), 'restore')}
                    disabled={store.operationInProgress()}
                    style={`
                      width: 100%; padding: 16px; border-radius: var(--radius-md);
                      background: var(--success); color: white;
                      font-size: 15px; font-weight: 600;
                      transition: transform 200ms var(--ease-spring);
                      opacity: ${store.operationInProgress() ? '0.5' : '1'};
                    `}
                    onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
                    onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    {store.loading.restore ? 'Restoring...' : 'Restore This App'}
                  </button>
                </Show>
                <button
                  onClick={() => setSelectedApp(null)}
                  style={`
                    width: 100%; padding: 14px; margin-top: 8px;
                    border-radius: var(--radius-md); background: transparent;
                    color: var(--text-secondary); font-size: 14px;
                  `}
                >
                  Never mind
                </button>
              </div>
            );
          }}
        </Show>
      </BottomSheet>

      {/* Confirmation Bottom Sheet */}
      <BottomSheet
        open={showConfirm()}
        onClose={() => setShowConfirm(false)}
        title={confirmAction() === 'debloat' ? 'Confirm Debloat' : 'Confirm Restore'}
      >
        <Show when={selectedApp()}>
          {(app) => (
            <div>
              <p style="color: var(--text-secondary); text-align: center; margin-bottom: 20px; line-height: 1.6;">
                <Show when={confirmAction() === 'debloat'}>
                  Are you sure you want to debloat <strong style="color: var(--text);">{app().app_name}</strong>?
                  {app().category === 'essential' && ' This WILL likely cause a bootloop!'}
                  {app().category === 'caution' && ' This may affect device functionality.'}
                </Show>
                <Show when={confirmAction() === 'restore'}>
                  Restore <strong style="color: var(--text);">{app().app_name}</strong> back to active?
                </Show>
              </p>
              <button
                onClick={executeAction}
                style={`
                  width: 100%; padding: 16px; border-radius: var(--radius-md);
                  background: ${confirmAction() === 'debloat' ? 'var(--danger)' : 'var(--success)'};
                  color: white; font-size: 15px; font-weight: 600;
                `}
              >
                {confirmAction() === 'debloat' ? 'Yes, Debloat' : 'Yes, Restore'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                style={`
                  width: 100%; padding: 14px; margin-top: 8px;
                  border-radius: var(--radius-md); background: transparent;
                  color: var(--text-secondary); font-size: 14px;
                `}
              >
                Cancel
              </button>
            </div>
          )}
        </Show>
      </BottomSheet>
    </div>
  );
}
