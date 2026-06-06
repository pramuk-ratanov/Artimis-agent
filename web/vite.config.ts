import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

/**
 * Strip the `crossorigin` attribute from emitted <script> / <link> tags.
 *
 * Why: Artimis is served by its own FastAPI static mount over plain HTTP from a
 * raw IP (no CORS headers, no TLS). When Vite marks the same-origin JS/CSS as
 * `crossorigin`, the browser fetches them (HTTP 200) but REFUSES to apply them
 * because the server sends no Access-Control-Allow-Origin header. Result: the
 * stylesheet returns 200 yet `document.styleSheets` is empty — zero padding,
 * Times New Roman fallback font, no surface colors. Removing `crossorigin`
 * makes the browser treat them as the same-origin resources they are.
 */
function stripCrossorigin() {
  return {
    name: 'strip-crossorigin',
    enforce: 'post' as const,
    transformIndexHtml(html: string) {
      return html.replace(/\s+crossorigin(="[^"]*")?/g, '')
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), stripCrossorigin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    minify: 'esbuild',
    // Belt-and-suspenders: don't emit crossorigin module-preload links either.
    modulePreload: { polyfill: false },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:7001',
    },
  },
})
