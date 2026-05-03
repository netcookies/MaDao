import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type { MenuCommandPayload } from '../app/types';

export async function refreshMenuBar() {
  await invoke('refresh_menu_bar');
}

export async function listenMenuCommand(
  handler: (payload: MenuCommandPayload) => void,
): Promise<UnlistenFn> {
  return listen<MenuCommandPayload>('menu-command', (event) => {
    handler(event.payload);
  });
}
