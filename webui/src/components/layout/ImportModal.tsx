import { createSignal, createEffect } from 'solid-js';
import { Button } from '../core/Button';
import { FileSelector } from './FileSelector';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (packages: string[]) => void;
  parsePackages: (input: string) => string[];
}

export function ImportModal(props: ImportModalProps) {
  const [input, setInput] = createSignal('');
  const [fileSelectorOpen, setFileSelectorOpen] = createSignal(false);
  let textareaRef: HTMLTextAreaElement | undefined;

  createEffect(() => {
    if (props.isOpen && textareaRef) {
      setTimeout(() => textareaRef!.focus(), 100);
    }
  });

  const handleImport = () => {
    const packages = props.parsePackages(input());
    props.onImport(packages);
    setInput('');
    props.onClose();
  };

  const handleClose = () => {
    setInput('');
    props.onClose();
  };

  const handleFileSelected = (content: string) => {
    setInput(content);
    setFileSelectorOpen(false);
  };

  return (
    <>
      <div
        class="modal-backdrop"
        style={`
          display:${props.isOpen ? 'flex' : 'none'};
          position:fixed;inset:0;z-index:1000;
          background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);
          align-items:flex-start;justify-content:center;
          padding:48px 24px 24px;
        `}
        onClick={(e) => e.target === e.currentTarget && handleClose()}
      >
        <div
          class="modal-content"
          style={`
            background:var(--bg-surface-elevated);
            border-radius:16px;border:1px solid var(--glass-border);
            width:100%;max-width:400px;max-height:80vh;
            display:flex;flex-direction:column;
            box-shadow:0 8px 32px rgba(0,0,0,0.3);
          `}
        >
          <div style="padding:16px 20px;border-bottom:1px solid var(--glass-border);flex-shrink:0;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <h3 style="margin:0;font-size:16px;font-weight:600;">Import Package List</h3>
              <button
                onClick={handleClose}
                style={`
                  background:none;border:none;color:var(--text-tertiary);
                  font-size:20px;cursor:pointer;padding:4px;line-height:1;
                `}
              >
                &times;
              </button>
            </div>
          </div>

          <div style="padding:20px;overflow-y:auto;flex:1;min-height:0;">
            <p style="margin:0 0 12px;font-size:13px;color:var(--text-secondary);">
              Paste package names (one per line) or Canta JSON format:
            </p>

            <textarea
              ref={textareaRef}
              value={input()}
              onInput={(e) => setInput(e.currentTarget.value)}
              placeholder={`Plain text:\ncom.example.app1\ncom.example.app2\n\nCanta JSON:\n{"apps": [{"packageName": "com.example.app1"}]}`}
              style={`
                width:100%;height:120px;padding:12px;border-radius:8px;
                background:var(--bg-base);border:1px solid var(--glass-border);
                color:var(--text-primary);font-size:13px;font-family:'JetBrains Mono',monospace;
                resize:none;box-sizing:border-box;
              `}
            />

            <div style="margin-top:8px;font-size:11px;color:var(--text-tertiary);">
              <strong>Supported:</strong> Plain text or Canta JSON
            </div>

            <div style="margin-top:16px;">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setFileSelectorOpen(true)}
              >
                Import From File
              </Button>
            </div>
          </div>

          <div style="padding:16px 20px;border-top:1px solid var(--glass-border);display:flex;gap:12px;justify-content:flex-end;flex-shrink:0;">
            <Button variant="ghost" size="small" onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="primary" size="small" onClick={handleImport}>
              Import
            </Button>
          </div>
        </div>
      </div>

      {/* File Selector Modal */}
      <FileSelector
        isOpen={fileSelectorOpen()}
        onClose={() => setFileSelectorOpen(false)}
        onFileSelected={handleFileSelected}
      />
    </>
  );
}
