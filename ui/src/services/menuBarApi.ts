import type { MenuCommandPayload } from '../app/types';
import { IS_DESKTOP_RUNTIME } from './runtimeEnv';

type UnlistenFn = () => void;

export async function refreshMenuBar() {
  if (!IS_DESKTOP_RUNTIME) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('refresh_menu_bar');
}

export async function listenMenuCommand(
  handler: (payload: MenuCommandPayload) => void,
): Promise<UnlistenFn> {
  if (!IS_DESKTOP_RUNTIME) {
    return () => {
      void handler;
    };
  }
  const { listen } = await import('@tauri-apps/api/event');
  return listen<MenuCommandPayload>('menu-command', (event) => {
    handler(event.payload);
  });
}
