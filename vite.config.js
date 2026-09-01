import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Serve helper-app routes (/cartograph, /arborist, /preview) as separate
// HTML entry points. Each helper has its own `*.html` at repo root and
// `main.jsx` under `src/<helper>/`. Add new helpers by appending here +
// adding the `*.html` to `build.rollupOptions.input` below.
//
// /stage is intentionally absent — Stage is cartograph-hosted, not a
// standalone route. See feedback_stage_standalone_should_die.md.
function serveHelperApps() {
  const routes = [
    { url: '/cartograph', file: 'cartograph.html' },
    { url: '/arborist',   file: 'arborist.html' },
    { url: '/meteorologist', file: 'meteorologist.html' },
    { url: '/preview',    file: 'preview.html' },
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

// Serve an installation's OWN content assets (§5.1.2). A payload keeps its
// logos/photos under cartograph/data/<look>/content/; the reader references them
// instance-relative and resolves to /content/<look>/… (see src/lib/assetUrl.js +
// INSTANCE.contentRoot). Dev only — the publish step mirrors content/ into the
// deployed payload for production. Source stays single (no copy to public/).
function serveInstallationContent() {
  const MIME = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
  }
  return {
    name: 'serve-installation-content',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0]
        const m = url.match(/^\/content\/([^/]+)\/(.+)$/)
        if (!m) return next()
        const [, look, rest] = m
        const root = path.resolve('cartograph/data', look, 'content')
        const filePath = path.resolve(root, decodeURIComponent(rest))
        // Confine to the installation's content root (no path traversal).
        if (filePath !== root && !filePath.startsWith(root + path.sep)) return next()
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return next()
        res.setHeader('Content-Type', MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream')
        res.end(fs.readFileSync(filePath))
      })
    }
  }
}

// Serve AUTHORING-ONLY assets (repo-root `authoring/`) in DEV. These are inputs
// to the helper apps and the bake — never fetched by the shipped player — so
// they deliberately do NOT live under public/, which Vite copies verbatim into
// the build. Keeping them out is structural: the production bundle cannot
// contain them, rather than being trusted not to.
//
// ⛔ Dev only. In a production build these paths 404, and that is correct: the
// helper apps are local-authoring tools (they also need localhost backends on
// :3333/:3334/:3335). A 404 here is a loud, honest failure, not a regression.
//
// Same shape as serveInstallationContent above — URL prefix → a repo directory,
// with the identical path-traversal confinement.
function serveAuthoringAssets() {
  const MIME = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif',
    '.avif': 'image/avif', '.json': 'application/json',
  }
  return {
    name: 'serve-authoring-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0]
        if (!url.startsWith('/authoring/')) return next()
        const root = path.resolve('authoring')
        const filePath = path.resolve(root, decodeURIComponent(url.slice('/authoring/'.length)))
        // Confine to authoring/ (no path traversal).
        if (filePath !== root && !filePath.startsWith(root + path.sep)) return next()
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return next()
        res.setHeader('Content-Type', MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream')
        res.end(fs.readFileSync(filePath))
      })
    },
  }
}

// Build-time counterpart to serveInstallationContent (above): mirror each
// installation's content payload (cartograph/data/<look>/content/) into
// dist/content/<look>/ so the STATIC build (staging/prod) serves the same
// /content/<look>/… tree the dev middleware serves. LS (contentRoot '') keeps
// its assets under public/ and needs no mirror; HPDM + future installs resolve
// their logos/photos here (assetUrl.js → BASE + contentRoot + url). The content
// JSON (listings/menus/roster) is already bundled via loadInstanceData's
// dynamic import(); this handles the runtime-fetched MEDIA the bundle can't.
// Scene-generic — globs every data/<look>/content dir, no per-scene fork.
function mirrorInstallationContent() {
  let outDir = 'dist'
  const copyDir = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name), d = path.join(dest, entry.name)
      if (entry.isDirectory()) copyDir(s, d)
      else if (entry.isFile()) fs.copyFileSync(s, d)
    }
  }
  return {
    name: 'mirror-installation-content',
    apply: 'build',
    configResolved(cfg) { outDir = cfg.build.outDir },
    closeBundle() {
      const dataRoot = path.resolve('cartograph/data')
      if (!fs.existsSync(dataRoot)) return
      for (const look of fs.readdirSync(dataRoot, { withFileTypes: true })) {
        if (!look.isDirectory()) continue
        const contentDir = path.join(dataRoot, look.name, 'content')
        if (!fs.existsSync(contentDir)) continue
        copyDir(contentDir, path.resolve(outDir, 'content', look.name))
        console.log(`[mirror-content] content/${look.name}/ → ${outDir}/content/${look.name}/`)
      }
    },
  }
}

export default defineConfig(({ command }) => ({
  plugins: [serveHelperApps(), serveCodedesk(), serveAuthoringAssets(), serveInstallationContent(), mirrorInstallationContent(), react()],
  define: {
    __BUILD_HASH__: JSON.stringify(new Date().toISOString().slice(0, 16)),
    // poly2tri's UMD shim references `global`; polyfill to globalThis so
    // it runs in-browser.
    global: 'globalThis',
  },
  base: '/',
  server: {
    watch: {
      // Skip large asset trees so chokidar doesn't iterate hundreds of
      // GLB/PNG files every time. iCloud-synced repos especially: any
      // chokidar read can ETIMEDOUT if the file is a stub awaiting fetch,
      // killing the dev server. None of these are sources we edit live.
      ignored: [
        '**/public/models/**',
        '**/public/photos/**',
        '**/public/trees/**',
        '**/public/lidar/**',
        '**/botanica/**',
        '**/.git/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/_cache/**',
        '**/_republish.log',
      ],
    },
    proxy: {
      // agent:false disables keep-alive socket pooling. The cartograph
      // and arborist backends are plain Node http servers with default
      // Keep-Alive timeout (~5s); vite was holding pooled sockets past
      // that and failing on next reuse with ECONNRESET → 404 "Not found"
      // surfaced to the browser. Fresh connection per request is cheap
      // here and rock-solid.
      '/api/cartograph': {
        target: process.env.CARTO_API || 'http://localhost:3333',
        rewrite: (path) => path.replace(/^\/api\/cartograph/, ''),
        agent: false,
      },
      '/api/arborist': {
        target: process.env.ARB_API || 'http://localhost:3334',
        rewrite: (path) => path.replace(/^\/api\/arborist/, ''),
        agent: false,
      },
      '/api/meteorologist': {
        target: 'http://localhost:3335',
        rewrite: (path) => path.replace(/^\/api\/meteorologist/, ''),
        agent: false,
      },
    },
  },
  assetsInclude: ['**/*.bin'],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: 'index.html',
        cartograph: 'cartograph.html',
        arborist: 'arborist.html',
        meteorologist: 'meteorologist.html',
        preview: 'preview.html',
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
