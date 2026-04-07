/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: [],
  },
  optimizeDeps: {
    // FFmpeg.wasm uses ESM workers — exclude from pre-bundling
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: {
    headers: {
      // Required for SharedArrayBuffer (FFmpeg.wasm multi-thread mode)
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'credentialless',
      // Allow cross-origin workers (e.g. internal @ffmpeg/ffmpeg chunk) to importScripts() our files
      'Cross-Origin-Resource-Policy': 'cross-origin',
      // Mirror production CSP but also allow HMR websocket and jsdelivr for Whisper WASM
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: accounts.google.com apis.google.com; style-src 'self' 'unsafe-inline' accounts.google.com; connect-src 'self' blob: ws://localhost:* https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://firestore.googleapis.com https://huggingface.co https://cdn-lfs.huggingface.co https://cdn-lfs-us-1.huggingface.co https://cdn.jsdelivr.net http://127.0.0.1:3777; img-src 'self' blob: data: https://*.googleusercontent.com; media-src 'self' blob: http://127.0.0.1:3777; worker-src 'self' blob:; child-src 'self' blob:; frame-src accounts.google.com; font-src 'self'",
    },
  },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'vendor-pdf': ['jspdf', 'jspdf-autotable'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
