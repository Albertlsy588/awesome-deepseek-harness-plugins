import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    cloudflare({
      // 和主站共用一份本地 D1 状态。会话行写在 api_sessions 里,主站在 5641
      // 登录后社区必须能读到同一行,否则本地根本走不通登录。
      persistState: { path: '../web/.wrangler/state' },
    }),
    react(),
  ],
  server: {
    host: '127.0.0.1',
    port: 5642,
  },
})
