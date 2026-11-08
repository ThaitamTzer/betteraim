import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// GitHub project site: https://thaitamtzer.github.io/betteraim/
export default defineConfig({
  base: '/betteraim/',
  plugins: [react()],
  test: { include: ['src/**/*.test.ts'] },
})
