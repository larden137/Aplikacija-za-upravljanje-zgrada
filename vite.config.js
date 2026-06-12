import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3001,
    open: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          excel: ['xlsx']
        }
      }
    }
  }
});
