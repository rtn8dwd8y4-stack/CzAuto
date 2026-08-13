import reactPlugin from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const target = process.env.VITE_BUILD_TARGET || 'public';
  const outDir = target === 'admin' ? 'dist-admin' : 'dist';

  return {
    plugins: [reactPlugin()],
    build: {
      outDir,
      rollupOptions: {
        input: {
          main: resolve(__dirname, target === 'admin' ? 'admin.html' : 'index.html'),
        },
      },
    },
    server: {
      port: 3001,
      host: '0.0.0.0',
      allowedHosts: [
        'anteater-storm-deluge.ngrok-free.dev',
        '.ngrok-free.dev',
      ],
      proxy: {
        '/api': {
          target: 'http://localhost:3003',
          changeOrigin: true,
        },
      },
    },
  };
});
