import { invoke } from '@tauri-apps/api/core';
import { CONFIG_DIRECTORY, IS_DESKTOP_RUNTIME } from './runtimeEnv';

export async function getAppConfigDirectory() {
  if (!IS_DESKTOP_RUNTIME) {
    return CONFIG_DIRECTORY;
  }
  return invoke<string>('app_config_directory');
}

export async function openAppConfigDirectory() {
  if (!IS_DESKTOP_RUNTIME) return;
  await invoke('open_app_config_directory');
}
