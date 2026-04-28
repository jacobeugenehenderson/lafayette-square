import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Serve helper-app routes (/cartograph, /stage, /arborist) as separate
// HTML entry points. Each helper has its own `*.html` at repo root and
// `main.jsx` under `src/<helper>/`. Add new helpers by appending here +
// adding the `*.html` to `build.rollupOptions.input` below.
function serveHelperApps() {
  const routes = [
    { url: '/cartograph', file: 'cartograph.html' },
    { url: '/stage',      file: 'stage.html' },
    { url: '/arborist',   file: 'arborist.html' },
  ]
  return {
    name: 'serve-helper-apps',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0]
        for (const r of routes) {
          if (url === r.url || url === r.url + '/') {
            const filePath = path.resolve(r.file)
            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'text/html; charset=utf-8')
              res.end(fs.readFileSync(filePath, 'utf-8'))
              return
            }
          }
        }
        next()
      })
    }
  }
}

// Serve public/codedesk/*.html directly (bypass SPA history fallback)
function serveCodedesk() {
  return {
    name: 'serve-codedesk',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0]
        if (!url.startsWith('/codedesk')) return next()

        // Resolve which file to serve
        let filePath
        if (url === '/codedesk' || url === '/codedesk/') {
          filePath = path.resolve('public/codedesk/index.html')
        } else if (url.endsWith('.html')) {
          filePath = path.resolve('public' + url)
        } else {
          return next() // Let Vite handle JS/CSS/JSON normally
        }

        if (fs.existsSync(filePath)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(fs.readFileSync(filePath, 'utf-8'))
          return
        }
        next()
      })
    }
  }
}

export default defineConfig(({ command }) => ({
  plugins: [serveHelperApps(), serveCodedesk(), react()],
  define: {
    __BUILD_HASH__: JSON.stringify(new Date().toISOString().slice(0, 16)),
    // poly2tri's UMD shim references `global`; polyfill to globalThis so
    // it runs in-browser.
    global: 'globalThis',
  },
  base: '/',
  server: {
    watch: {
      ignored: ['**/public/models/**', '**/public/photos/**'],
    },
    proxy: {
      '/api/cartograph': {
        target: 'http://localhost:3333',
        rewrite: (path) => path.replace(/^\/api\/cartograph/, ''),
      },
      '/api/arborist': {
        target: 'http://localhost:3334',
        rewrite: (path) => path.replace(/^\/api\/arborist/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        cartograph: 'cartograph.html',
        stage: 'stage.html',
        arborist: 'arborist.html',
      },
      output: {
        manualChunks: {
          // Split Three.js ecosystem into a cacheable vendor chunk (~1.8MB)
          vendor: ['three', 'three/examples/jsm/loaders/GLTFLoader.js', 'three/examples/jsm/libs/meshopt_decoder.module.js'],
          // React + fiber bridge
          react: ['react', 'react-dom', '@react-three/fiber', '@react-three/drei'],
          // Post-processing (shader compilation is the expensive part)
          postfx: ['postprocessing', '@react-three/postprocessing'],
        },
      },
    },
  },
}))
