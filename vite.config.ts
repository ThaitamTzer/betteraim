import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { CONTENT_SECURITY_POLICY } from './src/csp.ts'

// First in <head>: "policies in meta elements are not applied to content which precedes them". Build only (see src/csp.ts).
const cspMeta: Plugin = {
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' }],
}

// GitHub project site: https://thaitamtzer.github.io/betteraim/
export default defineConfig({
  base: '/betteraim/',
  plugins: [react(), cspMeta],
  build: { chunkSizeWarningLimit: 900 }, // three.js alone is ~700 kB, uPlot adds ~50 kB; the app is a small screen shell
  test: { include: ['src/**/*.test.ts'] },
})
