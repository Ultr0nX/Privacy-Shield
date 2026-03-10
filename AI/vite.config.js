import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
  },
  resolve: {
    alias: {
      '@': '/src',
      '@bio': '/src/bio',
    },
  },
  // Allow loading face-api.js models from public/models
  publicDir: 'public',
});
