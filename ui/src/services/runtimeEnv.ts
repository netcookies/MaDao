export type RuntimeMode = 'desktop' | 'web';

type ImportMetaEnvWithMode = ImportMetaEnv & {
  readonly VITE_RUNTIME_MODE?: string;
  readonly VITE_API_BASE?: string;
  readonly VITE_SOCKET_PATH?: string;
  readonly VITE_CONFIG_DIRECTORY?: string;
};

const runtimeEnv = import.meta.env as ImportMetaEnvWithMode;

function normalizeMode(value: string | undefined): RuntimeMode | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'desktop' || normalized === 'web') return normalized;
  return null;
}

function detectTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const runtimeMode = normalizeMode(runtimeEnv.VITE_RUNTIME_MODE)
  ?? (detectTauriRuntime() ? 'desktop' : 'web');

function trimTrailingSlash(value: string) {
  if (value === '/') return '/';
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function resolveApiBase() {
  const configuredBase = runtimeEnv.VITE_API_BASE?.trim();
  if (configuredBase) {
    if (configuredBase === '/') {
      if (typeof window !== 'undefined' && window.location?.origin) {
        return trimTrailingSlash(window.location.origin);
      }
      return '';
    }
    return trimTrailingSlash(configuredBase);
  }
  if (runtimeMode === 'desktop') {
    return 'http://127.0.0.1:7822';
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return trimTrailingSlash(window.location.origin);
  }
  return 'http://127.0.0.1:7822';
}

export const RUNTIME_MODE: RuntimeMode = runtimeMode;
export const IS_DESKTOP_RUNTIME = runtimeMode === 'desktop';
export const IS_WEB_RUNTIME = runtimeMode === 'web';
export const API_BASE = resolveApiBase();
export const SOCKET_PATH = runtimeEnv.VITE_SOCKET_PATH?.trim() || '/tmp/madao-sms.sock';
export const CONFIG_DIRECTORY = runtimeEnv.VITE_CONFIG_DIRECTORY?.trim()
  || (IS_DESKTOP_RUNTIME
    ? 'Loading…'
    : 'Managed by runtime');
