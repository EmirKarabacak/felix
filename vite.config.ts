import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Each build gets its own id. It is baked into the app and also written to
// /version.json, so a running Felix can notice a newer version and reload.
const VERSION = process.env.VERCEL_GIT_COMMIT_SHA || `${Date.now()}`

function versionFile(): Plugin {
  return {
    name: 'felix-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION }) })
    },
  }
}

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __FELIX_VERSION__: JSON.stringify(VERSION) },
  server: {
    // `vercel dev` serves /api itself; with plain `vite`, point this at it.
    proxy: process.env.FELIX_API_PROXY
      ? { '/api': process.env.FELIX_API_PROXY }
      : undefined,
  },
})
