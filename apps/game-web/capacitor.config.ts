import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Tech plan §43 Phase 2: wrap the PWA build in native shells.
 *   pnpm --filter @rpg/game-web build
 *   pnpm --filter @rpg/game-web exec cap add android   (once; needs Android Studio for builds)
 *   pnpm --filter @rpg/game-web cap:sync
 */
const config: CapacitorConfig = {
  appId: 'vn.dra.rpg',
  appName: 'Thiên Cơ Kỷ',
  webDir: 'dist',
  server: {
    // The online client talks to these hosts over TLS only.
    androidScheme: 'https',
  },
  android: {
    // WebGL/WebGPU need hardware acceleration; keep the WebView debuggable in dev builds only.
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'never',
  },
};

export default config;
