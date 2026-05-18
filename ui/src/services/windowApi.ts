import { IS_DESKTOP_RUNTIME } from './runtimeEnv';

export async function windowAction(action: 'minimize' | 'maximize_toggle' | 'close') {
  if (!IS_DESKTOP_RUNTIME) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('window_action', { action });
}

export async function setWindowTitle(title: string) {
  if (!IS_DESKTOP_RUNTIME) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_window_title', { title });
  } catch {
    // 浏览器模式下没有 Tauri window，静默忽略。
  }
}

export async function openExternalUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}
