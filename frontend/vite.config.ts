import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'SoulMate',
        short_name: 'SM',
        description: '可定制化人机恋体验',
        theme_color: '#ff7eb3',
        background_color: '#fff5f8',
        display: 'standalone',
        icons: [{ src: 'icon.png', sizes: '512x512', type: 'image/png' }]
      }
    })
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true }
    }
  }
})
