import { invoke } from '@tauri-apps/api/core';

export async function windowAction(action: 'minimize' | 'maximize_toggle' | 'close') {
  await invoke('window_action', { action });
}
