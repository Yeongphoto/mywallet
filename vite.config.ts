import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: 'memoney-build-identity',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'memoney-build.json', source: JSON.stringify({
        app: 'memoney', mode, authProbe: loadEnv(mode, process.cwd()).VITE_ANDROID_AUTH_PROBE === 'true',
      }) + '\n' });
    },
  }],
  base: './',
  server: {
    port: 5173,
  },
}));
