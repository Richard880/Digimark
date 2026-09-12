import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev
export default defineConfig({
  plugins: [react()],
  
  // 🎯 THE CRITICAL FIX: Forces Vite to bundle production links relative to their current folder asset slots
  base: './', 
  
  build: {
    outDir: 'dist',
    assetsDir: 'assets', // Consolidates script hashes inside an explicit folder
  }
})
