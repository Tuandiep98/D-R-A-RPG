import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // game-data/ lives at the repo root and is imported via import.meta.glob.
    fs: { allow: [repoRoot] },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 6000,
  },
});
