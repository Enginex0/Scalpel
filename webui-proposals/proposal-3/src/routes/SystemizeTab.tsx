import { createSignal, Show, For, createMemo } from 'solid-js';
import { store } from '../lib/store';
import { BottomSheet } from '../App';
import { ICONS } from '../lib/icons';

function Icon(props: { path: string; size?: number }) {
  return (
    <svg width={props.size || 24} height={props.size || 24} viewBox="0 0 24 24" fill="currentColor">
      <path d={props.path} />
    </svg>
  );
}

const mockUserApps = [
  { package_name: 'com.termux', app_name: 'Termux', version: '0.118.0' },
  { package_name: 'org.fdroid.fdroid', app_name: 'F-Droid', version: '1.19.0' },
  { package_name: 'com.aurora.store', app_name: 'Aurora Store', version: '4.3.5' },
  { package_name: 'com.topjohnwu.magisk', app_name: 'Magisk', version: '27.0' },
  { package_name: 'me.weishu.kernelsu', app_name: 'KernelSU Manager', version: '1.0.1' },
  { package_name: 'com.fox2code.mmm', app_name: 'Fox MMM', version: '2.7.0' },
  { package_name: 'io.github.vvb2060.mahoshojo', app_name: 'Momo', version: '4.2.2' },
  { package_name: 'rikka.appops', app_name: 'App Ops', version: '5.1.0' },
];

export function SystemizeTab() {
  const [selectedPromoted, setSelectedPromoted] = createSignal<string | null>(null);
  const [selectedUser, setSelectedUser] = createSignal<string | null>(null);
  const [showPromoteConfirm, setShowPromoteConfirm] = createSignal(false);
  const [showDemoteConfirm, setShowDemoteConfirm] = createSignal(false);

  const promotedList = createMemo(() => store.systemizeList());

  const availableApps = createMemo(() => {
    const promoted = new Set(store.systemizeList().map(s => s.package_name));
    return mockUserApps.filter(a => !promoted.has(a.package_name));
  });

  const handlePromote = async () => {
    const pkg = selectedUser();
    if (!pkg) return;
    setShowPromoteConfirm(false);
    await store.promoteApp(pkg);
    setSelectedUser(null);
  };

  const handleDemote = async () => {
    const pkg = selectedPromoted();
    if (!pkg) return;
    setShowDemoteConfirm(false);
    await store.demoteApp(pkg);
    setSelectedPromoted(null);
  };

  return (
    <div class="page-content">
      {/* Promoted Apps Section */}
      <div class="stagger-1" style="margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
          <Icon path={ICONS.arrowUp} size={18} />
          <span style="font-size: 15px; font-weight: 600; letter-spacing: -0.01em;">
            Promoted Apps
          </span>
          <span style={`
            padding: 2px 8px; border-radius: var(--radius-pill);
            background: rgba(var(--accent-rgb), 0.15); color: var(--accent);
            font-size: 11px; font-weight: 600;
          `}>{promotedList().length}</span>
        </div>

        <Show when={promotedList().length === 0}>
          <div style={`
            padding: 32px 20px; text-align: center;
            background: var(--surface); border-radius: var(--radius-lg);
            border: 1px dashed var(--border);
          `}>
            <div style="font-size: 36px; margin-bottom: 8px;">
              {'\u{1F4E6}'}
            </div>
            <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 4px;">
              No promoted apps yet
            </p>
            <p style="color: var(--text-tertiary); font-size: 12px;">
              Promote a user app to make it a system app
            </p>
          </div>
        </Show>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          <For each={promotedList()}>
            {(entry) => (
              <button
                onClick={() => { setSelectedPromoted(entry.package_name); setShowDemoteConfirm(true); }}
                style={`
                  display: flex; align-items: center; gap: 12px;
                  padding: 14px 16px; border-radius: var(--radius-lg);
                  background: var(--surface);
                  border: 1.5px solid rgba(var(--accent-rgb), 0.3);
                  text-align: left; width: 100%;
                  transition: transform 200ms var(--ease-spring);
                `}
                onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                onPointerLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <div style={`
                  width: 40px; height: 40px; border-radius: var(--radius-sm);
                  background: rgba(var(--accent-rgb), 0.12);
                  display: flex; align-items: center; justify-content: center;
                  color: var(--accent); font-weight: 700; font-size: 16px;
                `}>
                  {entry.app_name.charAt(0)}
                </div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 14px; font-weight: 600;">{entry.app_name}</div>
                  <div style="font-size: 11px; color: var(--text-tertiary); font-family: monospace;">
                    {entry.package_name}
                  </div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                  <span style={`
                    padding: 2px 8px; border-radius: var(--radius-pill);
                    background: rgba(var(--accent-rgb), 0.15); color: var(--accent);
                    font-size: 10px; font-weight: 600;
                  `}>System</span>
                  <span style="font-size: 10px; color: var(--text-tertiary);">
                    {entry.promoted_date}
                  </span>
                </div>
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Available User Apps */}
      <div class="stagger-2">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
          <Icon path={ICONS.promote} size={18} />
          <span style="font-size: 15px; font-weight: 600; letter-spacing: -0.01em;">
            Available Apps
          </span>
          <span style={`
            padding: 2px 8px; border-radius: var(--radius-pill);
            background: var(--surface-hover); color: var(--text-secondary);
            font-size: 11px; font-weight: 600;
          `}>{availableApps().length}</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          <For each={availableApps()}>
            {(app) => (
              <button
                onClick={() => { setSelectedUser(app.package_name); setShowPromoteConfirm(true); }}
                style={`
                  display: flex; align-items: center; gap: 12px;
                  padding: 14px 16px; border-radius: var(--radius-lg);
                  background: var(--surface); border: 1px solid var(--border);
                  text-align: left; width: 100%;
                  transition: transform 200ms var(--ease-spring);
                `}
                onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                onPointerLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <div style={`
                  width: 40px; height: 40px; border-radius: var(--radius-sm);
                  background: var(--surface-hover);
                  display: flex; align-items: center; justify-content: center;
                  color: var(--text-secondary); font-weight: 600; font-size: 16px;
                `}>
                  {app.app_name.charAt(0)}
                </div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 14px; font-weight: 600;">{app.app_name}</div>
                  <div style="font-size: 11px; color: var(--text-tertiary); font-family: monospace;">
                    {app.package_name}
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 11px; color: var(--text-tertiary);">{app.version}</span>
                  <span style="color: var(--text-tertiary);">
                    <Icon path={ICONS.chevronRight} size={18} />
                  </span>
                </div>
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Promote Confirmation */}
      <BottomSheet
        open={showPromoteConfirm()}
        onClose={() => setShowPromoteConfirm(false)}
        title="Promote to System?"
      >
        <p style="color: var(--text-secondary); text-align: center; margin-bottom: 8px; line-height: 1.6;">
          This will copy the app to the system partition and grant privileged permissions.
        </p>
        <p style="color: var(--warning); text-align: center; font-size: 13px; margin-bottom: 20px;">
          A reboot is required for changes to take effect.
        </p>
        <button
          onClick={handlePromote}
          disabled={store.loading.promote}
          style={`
            width: 100%; padding: 16px; border-radius: var(--radius-md);
            background: var(--accent); color: white;
            font-size: 15px; font-weight: 600;
            opacity: ${store.loading.promote ? '0.6' : '1'};
          `}
        >
          {store.loading.promote ? 'Promoting...' : 'Promote to System'}
        </button>
        <button
          onClick={() => setShowPromoteConfirm(false)}
          style={`
            width: 100%; padding: 14px; margin-top: 8px;
            border-radius: var(--radius-md); background: transparent;
            color: var(--text-secondary); font-size: 14px;
          `}
        >
          Never mind
        </button>
      </BottomSheet>

      {/* Demote Confirmation */}
      <BottomSheet
        open={showDemoteConfirm()}
        onClose={() => setShowDemoteConfirm(false)}
        title="Demote App?"
      >
        <p style="color: var(--text-secondary); text-align: center; margin-bottom: 20px; line-height: 1.6;">
          This will remove the app from the system partition and restore it as a regular user app.
        </p>
        <button
          onClick={handleDemote}
          disabled={store.loading.demote}
          style={`
            width: 100%; padding: 16px; border-radius: var(--radius-md);
            background: var(--warning); color: white;
            font-size: 15px; font-weight: 600;
            opacity: ${store.loading.demote ? '0.6' : '1'};
          `}
        >
          {store.loading.demote ? 'Demoting...' : 'Demote to User App'}
        </button>
        <button
          onClick={() => setShowDemoteConfirm(false)}
          style={`
            width: 100%; padding: 14px; margin-top: 8px;
            border-radius: var(--radius-md); background: transparent;
            color: var(--text-secondary); font-size: 14px;
          `}
        >
          Cancel
        </button>
      </BottomSheet>
    </div>
  );
}
