import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        // listen on all network interfaces so ngrok can reach the dev server
        host: true,
        port: 5173,
        // allow common ngrok host suffixes so dynamic ngrok subdomains are accepted
        // this covers *.ngrok-free.app and *.ngrok.io hosts
        allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.ngrok.app'],
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/api/, ''); },
            },
        },
    },
});
