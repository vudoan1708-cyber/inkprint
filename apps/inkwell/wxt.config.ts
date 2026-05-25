import { defineConfig } from 'wxt';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';

// Cross-browser by construction: `wxt build --browser <chrome|firefox|edge|safari>`
// emits a per-browser bundle from the same source. Never branch on user agent.
export default defineConfig({
  srcDir: '.',
  outDir: '.output',
  dev: {
    server: {
      port: 3001,
    },
  },
  vite: () => ({
    plugins: [
      tailwindcss(),
      react(),
      babel({ presets: [reactCompilerPreset()] }),
    ],
  }),
  manifest: {
    name: 'Inkwell — your handwriting, everywhere',
    description: 'Apply your InkPrint handwriting font across every web page you visit.',
    permissions: ['storage'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Inkwell',
    },
  },
});
