import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Local dev: forward /api calls to the Express backend, matching how
    // production serves the client and API from the same origin.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})