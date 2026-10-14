import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const API = process.env.VITE_API_TARGET ?? 'http://localhost:4000'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Pre-bundle the heavy 3D stack up front so dev never stalls on "new dependencies optimized" reloads.
  optimizeDeps: {
    include: [
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      '@react-three/postprocessing',
      'postprocessing',
      'framer-motion',
      'canvas-confetti',
      'socket.io-client',
      'lucide-react',
      'sonner',
    ],
  },
  server: {
    port: 5173,
    warmup: { clientFiles: ['./src/show/ShowPage.tsx', './src/admin/AdminApp.tsx'] },
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/uploads': { target: API, changeOrigin: true },
      '/socket.io': { target: API, ws: true, changeOrigin: true },
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei', '@react-three/postprocessing', 'postprocessing'],
          motion: ['framer-motion'],
        },
      },
    },
  },
})
