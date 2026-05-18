import { CONFIG_DIRECTORY, IS_DESKTOP_RUNTIME } from './runtimeEnv';

export async function getAppConfigDirectory() {
  if (!IS_DESKTOP_RUNTIME) {
    return CONFIG_DIRECTORY;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('app_config_directory');
}

export async function openAppConfigDirectory() {
  if (!IS_DESKTOP_RUNTIME) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_app_config_directory');
}
