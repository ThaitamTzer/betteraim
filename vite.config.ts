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
  // The Run screen (and with it Three.js, whose WebGLRenderer alone is ~500 kB and cannot be tree-shaken further) is a lazy chunk of ~542 kB; the app shell and the
  // Anthropic SDK chunk are under 400 kB. 550 is the smallest round value above the Run chunk: a bigger one means something new has joined it.
  build: { chunkSizeWarningLimit: 550 },
  test: { include: ['src/**/*.test.ts'] },
})
