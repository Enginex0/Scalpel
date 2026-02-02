type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PREFIX: Record<LogLevel, string> = {
  debug: '[DEBUG]',
  info: '[INFO]',
  warn: '[WARN]',
  error: '[ERROR]',
};

let backendLoggingEnabled = false;
let minLevel: LogLevel = 'debug';
let ksuExecFn: ((cmd: string) => Promise<{ errno: number }>) | null = null;

function shouldLog(level: LogLevel): boolean {
  const order: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  return order.indexOf(level) >= order.indexOf(minLevel);
}

function formatMessage(level: LogLevel, tag: string, msg: string, extra?: string): string {
  const ts = new Date().toISOString().slice(11, 23);
  const base = `${ts} ${LEVEL_PREFIX[level]} [${tag}] ${msg}`;
  return extra ? `${base} | ${extra}` : base;
}

async function logToBackend(level: LogLevel, tag: string, msg: string): Promise<void> {
  if (!backendLoggingEnabled || !ksuExecFn) return;
  if (level === 'debug') return;

  const safeMsg = msg.replace(/'/g, "'\\''").slice(0, 500);
  const cmd = `echo "[$(date '+%Y-%m-%d %H:%M:%S')] [${LEVEL_PREFIX[level]}] [webui:${tag}] ${safeMsg}" >> /data/adb/scalpel/debug.log`;

  try {
    await ksuExecFn(cmd);
  } catch {
    // Avoid infinite loop if logging itself fails
  }
}

function createLogFn(level: LogLevel) {
  return (tag: string, msg: string, extra?: string) => {
    if (!shouldLog(level)) return;

    const formatted = formatMessage(level, tag, msg, extra);

    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }

    logToBackend(level, tag, extra ? `${msg} | ${extra}` : msg);
  };
}

export const log = {
  debug: createLogFn('debug'),
  info: createLogFn('info'),
  warn: createLogFn('warn'),
  error: createLogFn('error'),

  setMinLevel(level: LogLevel) {
    minLevel = level;
  },

  enableBackendLogging(execFn: (cmd: string) => Promise<{ errno: number }>) {
    ksuExecFn = execFn;
    backendLoggingEnabled = true;
    log.info('logger', 'Backend logging enabled');
  },

  disableBackendLogging() {
    backendLoggingEnabled = false;
    ksuExecFn = null;
  },
};
