import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Loopback only; strict ports so dev/E2E never silently move to another port.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
