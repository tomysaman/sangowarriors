import { defineConfig } from 'vite';
export default defineConfig({ server: { port: 5555, strictPort: true, open: false }, preview: { port: 5555 }, build: { target: 'es2022', chunkSizeWarningLimit: 2000 } });
