import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import http from 'http';
import { defineConfig } from 'vite';

/**
 * Vérifie si le serveur Express local tourne sur le port 4000.
 * S'il n'est pas actif, le proxy bascule automatiquement sur le backend Render en ligne.
 */
function checkLocalServer(port = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * vite.config.ts — CYM Pharma
 * Supporte le développement local (server.js sur port 4000) ET la bascule
 * automatique sur Render (https://cym-pharma.onrender.com) en l'absence de serveur local.
 */
export default defineConfig(async () => {
  let backendTarget = process.env.VITE_BACKEND_URL;
  if (!backendTarget) {
    const isLocalActive = await checkLocalServer(4000);
    backendTarget = isLocalActive ? 'http://localhost:4000' : 'https://cym-pharma.onrender.com';
  }

  return {
    base: '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('error', (_err, _req, res) => {
              if (res && 'writeHead' in res && !(res as any).headersSent) {
                (res as any).writeHead(502, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    success: false,
                    message:
                      'Connexion au serveur temporairement indisponible. Nouvelle tentative en cours...',
                  })
                );
              }
            });
          },
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('error', (_err, _req, res) => {
              if (res && 'writeHead' in res && !(res as any).headersSent) {
                (res as any).writeHead(502, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    success: false,
                    message:
                      'Connexion au serveur temporairement indisponible.',
                  })
                );
              }
            });
          },
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
              return 'vendor';
            }
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('lucide-react') || id.includes('motion')) return 'ui';
          },
        },
      },
    },
  };
});
