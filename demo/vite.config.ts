import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
    plugins: [vue()],
    root: './src',
    base: './',
    build: {
        outDir: '../dist',
        emptyOutDir: true,
    },
    server: {
        port: 8080,
        open: true,
    },
})
