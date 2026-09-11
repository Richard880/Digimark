import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // 🎯 Guarantees Vercel reads the output static assets folder correctly
    outDir: 'dist', 
  }
})
