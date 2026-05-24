/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_RUNTIME_MODE?: string;
  readonly VITE_API_BASE?: string;
  readonly VITE_SOCKET_PATH?: string;
  readonly VITE_CONFIG_DIRECTORY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
