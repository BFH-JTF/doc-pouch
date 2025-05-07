import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src/srv/vue'),
  plugins: [vue()],
  build: {
    outDir: resolve(__dirname, 'dist/srv/vue'),
    emptyOutDir: true
  },
  publicDir: resolve(__dirname, 'src/srv/vue/public'),
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});