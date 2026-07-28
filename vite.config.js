import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import trackerPlugin from './tracker-plugin.js'

export default defineConfig({
  plugins: [react(), trackerPlugin()],
  server: {
    proxy: {
      '/groq': {
        target: 'https://api.groq.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/groq/, ''),
      },
      '/ninjapear': {
        target: 'https://nubela.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ninjapear/, ''),
      },
    },
  },
})
