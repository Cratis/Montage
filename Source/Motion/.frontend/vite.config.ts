import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { EmitMetadataPlugin } from '@cratis/arc.vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    root: fileURLToPath(new URL('./', import.meta.url)),
    optimizeDeps: { exclude: ['tslib'] },
    esbuild: { supported: { 'top-level-await': true } },
    build: {
        outDir: '../wwwroot',
        assetsDir: '',
        modulePreload: false,
        target: 'esnext',
        minify: false,
        cssCodeSplit: false,
    },
    plugins: [
        react(),
        tailwindcss(),
        EmitMetadataPlugin({ tsconfigPath: fileURLToPath(new URL('./tsconfig.json', import.meta.url)) }) as any,
    ],
    server: {
        port: 9000,
        host: true,
        open: false,
        proxy: {
            '/api': { target: 'http://localhost:5000', ws: true },
            '/packages': { target: 'http://localhost:5000' },
            '/renders': { target: 'http://localhost:5000' },
            '/preview': { target: 'http://localhost:5000' },
            '/fonts': { target: 'http://localhost:5000' },
        },
    },
});
