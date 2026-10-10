import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { sanchariApi } from './server/http/vitePlugin.js';

export default defineConfig(({ mode }) => {
  // Make server-only variables (FLIGHTSTATS_APP_KEY, …) from .env available to the
  // /api middleware. They are NOT exposed to the browser bundle (no VITE_ prefix).
  Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ''), ...process.env });
  return {
    plugins: [react(), sanchariApi()],
    build: {
      rollupOptions: {
        output: {
          // Separate vendor chunks so app updates don't re-download libraries.
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            supabase: ['@supabase/supabase-js'],
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.{js,jsx}', 'server/**/*.test.js'],
      exclude: ['**/*.live.test.js', 'node_modules/**'],
    },
  };
});
