import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  build: {
    // Keep generated image variants as hashed files. The 4 KB default would
    // base64 the smallest srcset candidates into the JS bundle, making them
    // uncacheable across deploys and inconsistent with the rest of the set.
    assetsInlineLimit: 0
  }
})