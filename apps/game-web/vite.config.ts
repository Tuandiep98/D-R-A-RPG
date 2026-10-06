import { fileURLToPath } from 'node:url';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => ({
  // `pnpm dev:mobile` serves HTTPS on the LAN: Safari only exposes WebGPU in a
  // secure context, and plain http://<lan-ip> is not one.
  plugins: [react(), ...(mode === 'mobile' ? [basicSsl()] : [])],
  server: {
    port: 5173,
    // game-data/ lives at the repo root and is imported via import.meta.glob.
    fs: { allow: [repoRoot] },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 6000,
  },
}));
