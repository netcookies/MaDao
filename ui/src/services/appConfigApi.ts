import { invoke } from '@tauri-apps/api/core';

export async function getAppConfigDirectory() {
  return invoke<string>('app_config_directory');
}

export async function openAppConfigDirectory() {
  await invoke('open_app_config_directory');
}
