import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Loopback only; strict ports so dev/E2E never silently move to another port.
// A09: Tailwind v4 through its Vite plugin; the entry (src/styles/app.css) is P1 with @config.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
