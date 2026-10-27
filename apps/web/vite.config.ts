import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

const API_URL = 'http://localhost:3002';

export default defineConfig({
  plugins: [
    // Must come before react(): generates src/routeTree.gen.ts from src/routes/.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5174,
    strictPort: true,
    // Dev stays on this computer; use `npm start` with HOST=0.0.0.0 for the home network.
    host: 'localhost',
    // In dev, the browser talks only to Vite; API and docs requests are forwarded.
    proxy: {
      '/api': API_URL,
      '/docs': API_URL,
    },
  },
  test: {
    environment: 'node',
  },
});
