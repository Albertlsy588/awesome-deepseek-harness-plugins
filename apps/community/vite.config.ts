import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The community is its own app but not its own service: it is built into the
 * site Worker's asset directory and served from `/community`. `base` is set
 * unconditionally so the dev server mounts at the same path production does —
 * a dev server rooted at `/` would hide every path bug until deploy.
 */
export default defineConfig({
  base: '/community/',
  plugins: [react()],
  build: {
    outDir: '../web/dist/client/community',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5642,
    proxy: {
      // The API belongs to the site Worker, which `npm run dev` serves on 5641.
      // Cookies are not isolated by port, so a session minted there is already
      // valid here.
      '/api': {
        target: 'http://127.0.0.1:5641',
        changeOrigin: false,
      },
    },
  },
})
