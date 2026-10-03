import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  root: resolve(projectRoot, 'web'),
  base: './',
  server: { host: '127.0.0.1', port: 4173, strictPort: true, headers: isolationHeaders },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, headers: isolationHeaders },
  build: { outDir: resolve(projectRoot, 'dist'), emptyOutDir: true, target: 'es2022' },
  optimizeDeps: { exclude: ['@cofhe/sdk', 'tfhe'] },
  worker: { format: 'es' },
});
