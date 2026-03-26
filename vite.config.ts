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
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'credentialless',
      // Allow cross-origin workers (e.g. internal @ffmpeg/ffmpeg chunk) to importScripts() our files
      'Cross-Origin-Resource-Policy': 'cross-origin',
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
