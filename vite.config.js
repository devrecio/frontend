import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  define: {
    'process.env': process.env
  },
  server: {
    proxy: {
      '/socket.io': {
        target: process.env.BACKEND_URL || 'http://localhost:3001',
        ws: true,
      }
    }
  }
});

