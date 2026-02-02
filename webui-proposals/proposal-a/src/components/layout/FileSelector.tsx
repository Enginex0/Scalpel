import { createSignal, For, Show } from 'solid-js';
import { ksuExec } from '../../lib/ksuApi';
import { ICONS } from '../../lib/icons';

interface FileSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelected: (content: string) => void;
}

interface FileItem {
  path: string;
  name: string;
  isDirectory: boolean;
}

export function FileSelector(props: FileSelectorProps) {
  const [currentPath, setCurrentPath] = createSignal('/storage/emulated/0/Download');
  const [files, setFiles] = createSignal<FileItem[]>([]);
  const [loading, setLoading] = createSignal(false);

  const listFiles = async (path: string) => {
    setLoading(true);
    try {
      const { errno, stdout } = await ksuExec(
        `find "${path}" -maxdepth 1 \\( -type f -name "*.txt" -o -type f -name "*.json" \\) -o -type d ! -name ".*" 2>/dev/null | sort`
      );
      if (errno !== 0) {
        setFiles([]);
        return;
      }

      const items: FileItem[] = stdout
        .split('\n')
        .filter(Boolean)
        .filter(item => item !== path)
        .map(item => ({
          path: item,
          name: item.split('/').pop() || item,
          isDirectory: !item.endsWith('.txt') && !item.endsWith('.json'),
        }));

      setFiles(items);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    const path = '/storage/emulated/0/Download';
    setCurrentPath(path);
    listFiles(path);
  };

  const handleNavigate = (item: FileItem) => {
    if (item.isDirectory) {
      setCurrentPath(item.path);
      listFiles(item.path);
    } else {
      handleFileSelect(item.path);
    }
  };

  const handleBack = () => {
    const path = currentPath();
    if (path === '/storage/emulated/0') return;
    const parent = path.split('/').slice(0, -1).join('/') || '/storage/emulated/0';
    setCurrentPath(parent);
    listFiles(parent);
  };

  const handleFileSelect = async (filePath: string) => {
    try {
      const { errno, stdout } = await ksuExec(`cat "${filePath}"`);
      if (errno !== 0) return;

      let packages: string[] = [];

      if (filePath.endsWith('.json')) {
        try {
          const data = JSON.parse(stdout.trim());
          if (data.apps && Array.isArray(data.apps)) {
            packages = data.apps
              .filter((app: { packageName?: string }) => app.packageName)
              .map((app: { packageName: string }) => app.packageName.trim())
              .filter(Boolean);
          }
        } catch {
          // Invalid JSON, ignore
        }
      } else {
        packages = stdout.trim().split('\n').map(l => l.trim()).filter(Boolean);
      }

      props.onFileSelected(packages.join('\n'));
      props.onClose();
    } catch {
      // Read error
    }
  };

  const pathSegments = () => {
    return currentPath().split('/').filter(Boolean);
  };

  // Trigger file listing when modal opens
  const isOpenRef = () => {
    if (props.isOpen) handleOpen();
    return props.isOpen;
  };

  return (
    <div
      style={`
        display:${isOpenRef() ? 'flex' : 'none'};
        position:fixed;inset:0;z-index:1100;
        background:rgba(0,0,0,0.8);backdrop-filter:blur(4px);
        align-items:center;justify-content:center;padding:16px;
      `}
      onClick={(e) => e.target === e.currentTarget && props.onClose()}
    >
      <div style={`
        background:var(--bg-surface-elevated);
        border-radius:16px;border:1px solid var(--glass-border);
        width:100%;max-width:500px;height:70vh;
        display:flex;flex-direction:column;overflow:hidden;
      `}>
        {/* Header */}
        <div style="display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--glass-border);">
          <button
            onClick={handleBack}
            disabled={currentPath() === '/storage/emulated/0'}
            style={`
              background:none;border:none;padding:8px;
              color:${currentPath() === '/storage/emulated/0' ? 'var(--text-tertiary)' : 'var(--text-secondary)'};
              cursor:${currentPath() === '/storage/emulated/0' ? 'default' : 'pointer'};
            `}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d={ICONS.chevronLeft} />
            </svg>
          </button>

          <div style="flex:1;overflow-x:auto;white-space:nowrap;font-size:13px;color:var(--text-secondary);">
            <For each={pathSegments()}>
              {(segment, i) => (
                <>
                  <Show when={i() > 0}>
                    <span style="color:var(--text-tertiary);padding:0 4px;">/</span>
                  </Show>
                  <span>{segment}</span>
                </>
              )}
            </For>
          </div>

          <button
            onClick={props.onClose}
            style="background:none;border:none;padding:8px;color:var(--text-tertiary);cursor:pointer;font-size:18px;"
          >
            &times;
          </button>
        </div>

        {/* File List */}
        <div style="flex:1;overflow-y:auto;padding:8px;">
          <Show when={loading()}>
            <div style="padding:32px;text-align:center;color:var(--text-tertiary);">Loading...</div>
          </Show>

          <Show when={!loading() && files().length === 0}>
            <div style="padding:32px;text-align:center;color:var(--text-tertiary);">
              No .txt or .json files found
            </div>
          </Show>

          <Show when={!loading()}>
            {/* Parent directory */}
            <Show when={currentPath() !== '/storage/emulated/0'}>
              <div
                onClick={handleBack}
                style={`
                  display:flex;align-items:center;gap:12px;padding:12px;
                  border-radius:10px;cursor:pointer;
                  background:var(--bg-surface);margin-bottom:4px;
                `}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--text-tertiary)">
                  <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                </svg>
                <span style="color:var(--text-secondary);">..</span>
              </div>
            </Show>

            <For each={files()}>
              {(item) => (
                <div
                  onClick={() => handleNavigate(item)}
                  style={`
                    display:flex;align-items:center;gap:12px;padding:12px;
                    border-radius:10px;cursor:pointer;margin-bottom:4px;
                    background:var(--bg-surface);
                    transition:background 0.15s ease;
                  `}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-elevated)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-surface)'}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill={item.isDirectory ? 'var(--text-accent)' : 'var(--text-tertiary)'}>
                    <path d={item.isDirectory
                      ? 'M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z'
                      : 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z'
                    } />
                  </svg>
                  <span style={`
                    flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
                    color:${item.isDirectory ? 'var(--text-primary)' : 'var(--text-secondary)'};
                    font-size:14px;
                  `}>
                    {item.name}
                  </span>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>
    </div>
  );
}
