import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Serve /cartograph and /stage as separate entry points
function serveCartograph() {
  return {
    name: 'serve-cartograph',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0]
        if (url === '/cartograph' || url === '/cartograph/') {
          const filePath = path.resolve('cartograph.html')
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(fs.readFileSync(filePath, 'utf-8'))
            return
          }
        }
        if (url === '/stage' || url === '/stage/') {
          const filePath = path.resolve('stage.html')
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(fs.readFileSync(filePath, 'utf-8'))
            return
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
  plugins: [serveCartograph(), serveCodedesk(), react()],
  define: {
    __BUILD_HASH__: JSON.stringify(new Date().toISOString().slice(0, 16)),
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
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        cartograph: 'cartograph.html',
        stage: 'stage.html',
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
