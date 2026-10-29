// TEMPORARY receipt server (Boz's grant, 2026-10-28): ferrule's code on :5190, the live data READ-ONLY from the
// integration checkout's public/ (Jacob's), API GETs to :3333. Every non-GET is refused here. Killed after the receipts.
import base from '../../vite.config.js'
const INTEG = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/integration/public'
export default async (env) => { const c = typeof base === 'function' ? await base(env) : base
  return { ...c, root: '/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/ferrule', publicDir: INTEG, cacheDir: 'node_modules/.vite-receipt',
    server: { ...c.server, port: 5190, strictPort: true, host: 'localhost', hmr: c.server?.hmr },
    plugins: [{ name: 'read-only-receipt', configureServer(s) { s.middlewares.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end('read-only receipt server: ' + req.method + ' refused'); return } next() }) } }, ...(c.plugins || [])] } }
