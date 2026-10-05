import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // `vercel dev` serves /api itself; with plain `vite`, point this at it.
    proxy: process.env.FELIX_API_PROXY
      ? { '/api': process.env.FELIX_API_PROXY }
      : undefined,
  },
})
