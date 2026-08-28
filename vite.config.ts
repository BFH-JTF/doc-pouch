import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(__dirname, 'src/srv/vue'),
  plugins: [vue()],
  build: {
    outDir: resolve(__dirname, 'dist/srv/vue'),
    emptyOutDir: true,
  },
  publicDir: resolve(__dirname, 'src/srv/vue/public'),
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});