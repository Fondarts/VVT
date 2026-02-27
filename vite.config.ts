import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // FFmpeg.wasm uses ESM workers — exclude from pre-bundling
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: {
    headers: {
      // Required for SharedArrayBuffer (FFmpeg.wasm multi-thread mode)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      // Allow cross-origin workers (e.g. internal @ffmpeg/ffmpeg chunk) to importScripts() our files
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  },
  build: {
    rollupOptions: {
      // Keep FFmpeg.wasm worker files from being inlined
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
