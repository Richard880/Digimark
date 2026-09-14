import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },

  define: {
    __FIREBASE_API_KEY__: JSON.stringify(process.env.FIREBASE_API_KEY),
    __FIREBASE_AUTH_DOMAIN__: JSON.stringify(process.env.FIREBASE_AUTH_DOMAIN),
    __FIREBASE_PROJECT_ID__: JSON.stringify(process.env.FIREBASE_PROJECT_ID),
    __FIREBASE_STORAGE_BUCKET__: JSON.stringify(process.env.FIREBASE_STORAGE_BUCKET),
    __FIREBASE_MESSAGING_SENDER_ID__: JSON.stringify(process.env.FIREBASE_MESSAGING_SENDER_ID),
    __FIREBASE_APP_ID__: JSON.stringify(process.env.FIREBASE_APP_ID),
    __FIREBASE_MEASUREMENT_ID__: JSON.stringify(process.env.FIREBASE_MEASUREMENT_ID),
  },
})