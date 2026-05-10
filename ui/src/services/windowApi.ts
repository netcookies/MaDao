import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export async function windowAction(action: 'minimize' | 'maximize_toggle' | 'close') {
  await invoke('window_action', { action });
}

export async function setWindowTitle(title: string) {
  try {
    await getCurrentWindow().setTitle(title);
  } catch {
    // 浏览器模式下没有 Tauri window，静默忽略。
  }
}
