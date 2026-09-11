/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Deployed to GitHub Pages under /scrumflow/. Override with VITE_BASE=/ for root hosting.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/scrumflow/',
  plugins: [react()],
  build: { sourcemap: false, chunkSizeWarningLimit: 1500 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
