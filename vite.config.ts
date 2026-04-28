import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'ui',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    port: 1420,
    strictPort: true
  }
});
