import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// GitHub project site: https://thaitamtzer.github.io/betteraim/
export default defineConfig({
  base: '/betteraim/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 900 }, // three.js alone is ~700 kB, uPlot adds ~50 kB; the app is a small screen shell
  test: { include: ['src/**/*.test.ts'] },
})
