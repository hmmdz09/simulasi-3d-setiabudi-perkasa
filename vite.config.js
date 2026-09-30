import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5175,
    host: true,
    open: false
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
