import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'PULSAR - ポケット液晶ペット',
        short_name: 'PULSAR',
        description: '手のひらサイズの液晶ペット',
        lang: 'ja',
        start_url: '.',
        scope: '.',
        display: 'fullscreen',
        orientation: 'portrait',
        background_color: '#1d1a17',
        theme_color: '#1d1a17',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'] },
    }),
  ],
})
