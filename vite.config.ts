import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    base: './',
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, '.') },
        // pdf-lib v1.17.1 ESM build is missing internal files; force CJS build
        { find: /^pdf-lib$/, replacement: 'pdf-lib/cjs/index.js' },
      ],
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            charts: ['recharts'],
            pdf: ['pdf-lib', 'jspdf', 'html2canvas'],
          }
        }
      }
    }
  };
});
