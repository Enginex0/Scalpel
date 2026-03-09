import { createSignal, Show } from 'solid-js';
import { store } from '../../lib/store';
import { Modal } from '../layout/Modal';
import { Button } from '../core/Button';
import { ICONS } from '../../lib/icons';
import { api } from '../../lib/api';

export function RebootFAB() {
  const [confirmOpen, setConfirmOpen] = createSignal(false);

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        class={store.needsReboot() ? 'reboot-fab reboot-fab--pulse' : 'reboot-fab'}
        style={`
          position: fixed;
          bottom: calc(${store.settings.fixedNav ? '216px' : '168px'} + env(safe-area-inset-bottom));
          right: 16px;
          width: 52px;
          height: 52px;
          border-radius: 50%;
          border: none;
          background: var(--gradient-primary);
          color: var(--text-on-accent);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 150;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(var(--accent-rgb), 0.4);
          transition: transform 0.2s var(--ease-spring);
          animation: ${store.needsReboot() ? 'glowPulse 2s ease-in-out infinite' : 'float 3s ease-in-out infinite'};
        `}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d={ICONS.reboot} />
        </svg>
      </button>

      <Modal open={confirmOpen()} onClose={() => setConfirmOpen(false)} title="Reboot Device?">
        <p style="text-align:center;color:var(--text-secondary);margin-bottom:20px;font-size:14px;">
          {store.needsReboot()
            ? 'Changes are pending. A reboot is required to apply them.'
            : 'Are you sure you want to reboot the device?'
          }
        </p>
        <div style="display:flex;gap:12px;">
          <Button variant="ghost" fullWidth onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="danger" fullWidth onClick={() => { api.reboot(); setConfirmOpen(false); }}>Reboot Now</Button>
        </div>
      </Modal>
    </>
  );
}
