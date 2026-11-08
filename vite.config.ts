import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// GitHub project site: https://thaitamtzer.github.io/betteraim/
export default defineConfig({
  base: '/betteraim/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 800 }, // three.js alone is ~700 kB; the app is one small screen shell
  test: { include: ['src/**/*.test.ts'] },
})
