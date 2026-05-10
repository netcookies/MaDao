import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function resolveAppVersion() {
  const cargoTomlPath = resolve(__dirname, 'Cargo.toml');
  const cargoToml = readFileSync(cargoTomlPath, 'utf8');
  const workspaceVersion = cargoToml.match(/\[workspace\.package\][\s\S]*?version\s*=\s*"([^"]+)"/)?.[1];
  return workspaceVersion ?? process.env.npm_package_version ?? process.env.CARGO_PKG_VERSION ?? '0.0.0';
}

export default defineConfig({
  plugins: [react()],
  root: 'ui',
  define: {
    __APP_VERSION__: JSON.stringify(resolveAppVersion()),
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) {
            return 'i18n-vendor';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons-vendor';
          }
          if (id.includes('node_modules/simple-icons') || id.includes('node_modules/country-flag-icons')) {
            return 'badge-vendor';
          }
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true
  }
});
