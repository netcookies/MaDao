import { invoke } from '@tauri-apps/api/core';
import { setTheme } from '@tauri-apps/api/app';
import type { AppearanceTheme } from '../app/types';
import { IS_DESKTOP_RUNTIME } from './runtimeEnv';

export async function windowAction(action: 'minimize' | 'maximize_toggle' | 'close') {
  if (!IS_DESKTOP_RUNTIME) return;
  await invoke('window_action', { action });
}

export async function setWindowTitle(title: string) {
  if (!IS_DESKTOP_RUNTIME) return;
  try {
    await invoke('set_window_title', { title });
  } catch {
    // 浏览器模式下没有 Tauri window，静默忽略。
  }
}

export async function setAppThemePreference(theme: AppearanceTheme) {
  if (!IS_DESKTOP_RUNTIME) return;
  try {
    await setTheme(theme === 'system' ? null : theme);
  } catch {
    // 主题同步失败时保留 WebView 主题，不打断设置更新。
  }
}

export async function openExternalUrl(url: string) {
  if (!IS_DESKTOP_RUNTIME) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  try {
    await invoke('open_external_url', { url });
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
