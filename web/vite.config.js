import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const shim = fileURLToPath(new URL('./src/lib/node-shim.js', import.meta.url));

export default defineConfig({
  plugins: [react()],
  // The scanner in tools/ runs in the page; its Node-only CLI code is shimmed.
  resolve: { alias: { 'node:fs': shim, 'node:path': shim, 'node:crypto': shim, 'node:url': shim } },
  define: { 'process.argv': '[]' },
  build: {
    // three.js (~520 kB) is its own lazy chunk, loaded after first paint.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'], motion: ['gsap', 'lenis'], react: ['react', 'react-dom'] },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:4317' },
  },
});
