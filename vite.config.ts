import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: './dist/vue',
    rollupOptions: {
      input: {
        main: './src/vue/main.ts'
      }
    }
  },
});