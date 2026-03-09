import { Show } from 'solid-js';
import { store } from '../../lib/store';
import { CATEGORY_COLORS } from '../../lib/constants';
import { AppIcon } from '../core/AppIcon';
import { Button } from '../core/Button';
import { Modal } from '../layout/Modal';
import { ICONS } from '../../lib/icons';
import type { ScannedApp } from '../../lib/types';

interface AppDetailSheetProps {
  app: ScannedApp | null;
  onClose: () => void;
}

export function AppDetailSheet(props: AppDetailSheetProps) {
  return (
    <Modal open={!!props.app} onClose={props.onClose} title={props.app?.app_name || ''}>
      <Show when={props.app}>
        {(app) => {
          const cc = CATEGORY_COLORS[app().category];
          const isEssential = app().category === 'essential';
          const isCaution = app().category === 'caution';
          return (
            <div style="display:flex;flex-direction:column;gap:16px;">
              <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
                <AppIcon packageName={app().package_name} source="ksu" size={40} />
                <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-tertiary);">
                  {app().package_name}
                </div>
              </div>

              {/* Metadata grid */}
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div style="padding:10px 12px;border-radius:8px;background:var(--bg-surface);border:1px solid var(--glass-border);">
                  <div style="font-size:9px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;font-weight:600;">Category</div>
                  <div style={`font-size:13px;font-weight:600;color:${cc.color};text-transform:capitalize;`}>{cc.label}</div>
                </div>
                <div style="padding:10px 12px;border-radius:8px;background:var(--bg-surface);border:1px solid var(--glass-border);">
                  <div style="font-size:9px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;font-weight:600;">Partition</div>
                  <div style="font-size:13px;font-weight:600;color:var(--text-secondary);text-transform:capitalize;">{app().partition}</div>
                </div>
                <div style="padding:10px 12px;border-radius:8px;background:var(--bg-surface);border:1px solid var(--glass-border);">
                  <div style="font-size:9px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;font-weight:600;">Privileged</div>
                  <div style={`font-size:13px;font-weight:600;color:${app().is_priv_app ? 'var(--text-accent)' : 'var(--text-tertiary)'};`}>{app().is_priv_app ? 'Yes' : 'No'}</div>
                </div>
                <div style="padding:10px 12px;border-radius:8px;background:var(--bg-surface);border:1px solid var(--glass-border);">
                  <div style="font-size:9px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;font-weight:600;">Split APK</div>
                  <div style={`font-size:13px;font-weight:600;color:${app().is_split ? 'var(--text-accent)' : 'var(--text-tertiary)'};`}>{app().is_split ? 'Yes' : 'No'}</div>
                </div>
              </div>

              <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-tertiary);padding:8px 10px;border-radius:6px;background:var(--bg-surface);border:1px solid var(--glass-border);word-break:break-all;">
                {app().app_path}
              </div>

              <Show when={isEssential}>
                <div class="risk-essential" style="padding:12px 14px;border-radius:10px;background:rgba(255,107,107,0.06);border:1px solid rgba(255,107,107,0.2);display:flex;align-items:center;gap:10px;">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#ff6b6b" style="flex-shrink:0;filter:drop-shadow(0 0 4px rgba(255,107,107,0.5));"><path d={ICONS.warning} /></svg>
                  <span style="font-size:13px;color:#ff6b6b;font-weight:500;line-height:1.4;">Critical system component. Removal may cause bootloop.</span>
                </div>
              </Show>
              <Show when={isCaution}>
                <div class="risk-caution" style="padding:12px 14px;border-radius:10px;background:rgba(255,152,0,0.06);border:1px solid rgba(255,152,0,0.2);display:flex;align-items:center;gap:10px;">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#ff9800" style="flex-shrink:0;filter:drop-shadow(0 0 4px rgba(255,152,0,0.4));"><path d={ICONS.warning} /></svg>
                  <span style="font-size:13px;color:#ff9800;font-weight:500;line-height:1.4;">May affect device functionality. Proceed with knowledge.</span>
                </div>
              </Show>

              <Button variant="danger" fullWidth onClick={() => { store.nukeApps([app().package_name]); props.onClose(); }}>
                Nuke This App
              </Button>
            </div>
          );
        }}
      </Show>
    </Modal>
  );
}
