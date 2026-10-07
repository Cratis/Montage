import { defineConfig } from 'vite';

export default defineConfig({
  root: 'preview',
  publicDir: '../public',
  build: {
    outDir: '../dist/preview',
    emptyOutDir: true,
    target: 'esnext',
    modulePreload: false,
    assetsDir: '',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'main.js' } },
  },
  server: {
    port: 5173,
    // engine development: point ?pkg= at a running editor backend or a local package dir
    // served by `node scripts/render.ts`'s server, or drop a package at public/package.
  },
});
