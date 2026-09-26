#!/usr/bin/env node
/**
 * "DOES EVERY APP THAT DRAWS A TOWN DRAW ITS SET-PIECE?"
 *
 * WHY (2026-09-26): the Pilgrim Monument was mounted by hand in Scene and Preview only,
 * and was missing in Stage, where Jacob baked Provincetown. The class: a set-piece added
 * app by app goes missing, silently, in whichever app nobody remembered.
 *
 * An APP is found, never listed: a file under src/ that owns an R3F `<Canvas>` AND mounts
 * the town's ground (`<BakedGround` / `<ViewKeyedBakedGround`). A new app that draws a town
 * is covered the day it exists. Fails when:
 *   · an app does not import and render `<SetPiece` (src/components/SetPiece.jsx)
 *   · any file other than SetPiece.jsx imports a set-piece renderer directly (the hand-mount)
 *   · a town declares a `setPiece.kind` that SetPiece.jsx has no renderer for
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-every-app-mounts-the-set-piece.mjs [--self-test]
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
const MOUNT = join(SRC, 'components/SetPiece.jsx')

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|mjs)$/.test(n)) out.push(p)
  }
  return out
}

// The renderers SetPiece.jsx maps kinds to: read from its own source, never restated.
function renderersOf(mountSrc) {
  const block = mountSrc.match(/const RENDERERS = \{([\s\S]*?)\n\}/)
  if (!block) return null
  const kinds = [...block[1].matchAll(/'([^']+)'\s*:\s*(\w+)/g)].map(m => ({ kind: m[1], comp: m[2] }))
  const imports = Object.fromEntries([...mountSrc.matchAll(/import (\w+) from '([^']+)'/g)].map(m => [m[1], m[2]]))
  return kinds.map(k => ({ ...k, file: imports[k.comp] ? imports[k.comp].replace(/^\.\//, '').replace(/\.jsx?$/, '') : null }))
}

export function audit(files, mountSrc, declaredKinds) {
  const f = [], info = []
  const R = renderersOf(mountSrc)
  if (!R) return { f: ['SetPiece.jsx has no RENDERERS table — cannot verify'], info }
  const apps = files.filter(x => /<Canvas\b/.test(x.src) && /<(ViewKeyed)?BakedGround\b/.test(x.src))
  info.push(`apps found: ${apps.map(a => a.path).join(', ')}`)
  if (!apps.length) f.push('no app found (no file owns a <Canvas> and mounts the ground) — the definition broke')
  for (const a of apps) {
    const imports = /import SetPiece from '[^']*SetPiece(\.jsx)?'/.test(a.src)
    const renders = /<SetPiece\b/.test(a.src)
    if (!imports || !renders) f.push(`${a.path} draws a town but does not ${!imports ? 'import' : 'render'} <SetPiece>`)
  }
  for (const x of files) {
    if (x.path.endsWith('components/SetPiece.jsx')) continue
    for (const r of R) if (r.file && new RegExp(`import \\w+ from '[^']*${r.file.split('/').pop()}(\\.jsx)?'`).test(x.src))
      f.push(`${x.path} imports the set-piece renderer ${r.comp} directly — mount <SetPiece> instead`)
  }
  for (const k of declaredKinds) if (!R.some(r => r.kind === k.kind)) f.push(`${k.town} declares set-piece kind "${k.kind}"; SetPiece.jsx has no renderer for it`)
  return { f, info }
}

const files = walk(SRC).map(p => ({ path: relative(ROOT, p), src: readFileSync(p, 'utf8') }))
const mountSrc = readFileSync(MOUNT, 'utf8')
const declaredKinds = []
for (const n of readdirSync(join(SRC, 'instances')).filter(n => n.endsWith('.js') && n !== 'registry.js')) {
  const m = (await import(join(SRC, 'instances', n))).default
  if (m?.setPiece?.kind) declaredKinds.push({ town: n.replace(/\.js$/, ''), kind: m.setPiece.kind })
}

if (process.argv.includes('--self-test')) {
  const app = files.find(x => x.path.endsWith('components/Scene.jsx'))
  const cases = [
    ['an app drops its mount', () => audit(files.map(x => x === app ? { ...x, src: x.src.replace(/<SetPiece\b[^>]*\/>/g, '') } : x), mountSrc, declaredKinds).f.length],
    ['an app hand-mounts the renderer', () => audit([...files, { path: 'src/fake/App.jsx', src: "import PilgrimMonument from '../components/PilgrimMonument.jsx'" }], mountSrc, declaredKinds).f.length],
    ['a new app with no mount', () => audit([...files, { path: 'src/fake/NewApp.jsx', src: '<Canvas><BakedGround /></Canvas>' }], mountSrc, declaredKinds).f.length],
    ['a kind with no renderer', () => audit(files, mountSrc, [...declaredKinds, { town: 'town-2', kind: 'lighthouse' }]).f.length],
  ]
  let bad = 0
  for (const [n, run] of cases) { const c = run() > 0; if (!c) bad++; console.log(`${c ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  process.exit(bad ? 1 : 0)
}

const { f, info } = audit(files, mountSrc, declaredKinds)
console.log(info.join('\n'))
console.log(`declared set-pieces: ${declaredKinds.map(k => `${k.town}:${k.kind}`).join(', ') || 'none'}`)
if (f.length) { console.log(`⛔ FAIL\n   ${f.join('\n   ')}`); process.exit(1) }
console.log('✅ every app that draws a town mounts <SetPiece>; no hand-mounts; every declared kind has a renderer')
