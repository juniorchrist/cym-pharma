import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

/**
 * vite.config.ts — CYM Pharma (Frontend seulement)
 * Le backend cymBackend.ts est déprécié en développement local et remplacé par
 * le serveur Express de production (src/server/index.ts) déployé sur Render.
 * En développement, utilisez Supabase directement via VITE_SUPABASE_URL.
 */
export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
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
