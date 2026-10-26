import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

function pwaBundlePlugin(): Plugin {
  return {
    name: 'pwa-bundle-injector',
    closeBundle() {
      try {
        const distDir = path.resolve(__dirname, 'dist');
        const indexPath = path.join(distDir, 'index.html');
        const swPath = path.join(distDir, 'sw.js');
        if (fs.existsSync(indexPath) && fs.existsSync(swPath)) {
          const html = fs.readFileSync(indexPath, 'utf-8');
          const scriptMatches = html.match(/src="(\/assets\/[^"]+)"/g) || [];
          const cssMatches = html.match(/href="(\/assets\/[^"]+)"/g) || [];
          const assets = new Set<string>();
          for (const m of [...scriptMatches, ...cssMatches]) {
            const match = m.match(/["'](\/assets\/[^"']+)["']/);
            if (match && match[1]) assets.add(match[1]);
          }

          let swCode = fs.readFileSync(swPath, 'utf-8');
          const assetArrayStr = JSON.stringify(Array.from(assets), null, 2);
          swCode = swCode.replace(
            /const STATIC_ASSETS = \[[^\]]*\];/,
            `const STATIC_ASSETS = [\n  '/',\n  '/index.html',\n  '/manifest.json',\n  '/icons/icon.svg',\n  '/icons/icon-192.png',\n  '/icons/icon-512.png',\n  '/icons/icon-maskable.png',\n  '/assets/terrain-default.png',\n  '/assets/terrain-blue.png',\n  ...${assetArrayStr}\n];`
          );
          fs.writeFileSync(swPath, swCode, 'utf-8');
          console.log('[PWA Plugin] Successfully injected build bundles into dist/sw.js:', Array.from(assets));
        }
      } catch (err) {
        console.warn('[PWA Plugin] Bundle injection warning:', err);
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), pwaBundlePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
