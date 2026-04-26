import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ===============================================================
//  Vite config
//  - Dev server em 5173 (default).
//  - VITE_API_URL vem do .env e é lido em runtime por src/api/client.js.
// ===============================================================
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
});
