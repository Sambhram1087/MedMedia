import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the API runs on :5000. In production the API server serves this build directly.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${process.env.PORT || 5001}`,
      '/media': `http://localhost:${process.env.PORT || 5001}`,
    },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 600 },
});
