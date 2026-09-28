#!/usr/bin/env node
/**
 * "DOES EVERY APP THAT DRAWS A TOWN DRAW IT THROUGH THE ONE ASSEMBLY?"
 *
 * WHY (2026-09-27, BRIEF-one-town-assembly). Production, Preview and Stage each assembled the
 * town's renderer by hand, and the three lists had drifted: Preview drew no mountains, Stage drew
 * Lafayette Square's buildings through a path no other town used, three copies of the clock ticked.
 * Jacob: "the 3-way renderer is an excellent example of what is forbidden: overlap and palimpsest."
 * So every app mounts <Town> (src/components/Town.jsx) and mounts no renderer piece of its own.
 *
 * THE RENDERER PIECES are READ from Town.jsx — every component it renders that it imports from a
 * local file — never listed here. A piece added to Town is covered the day it is added.
 * AN APP is found, never listed: a file under src/ that owns an R3F `<Canvas>` and renders `<Town>`
 * or the town's ground (`<BakedGround>`) — the ground is what makes a canvas a town, the same
 * definition claims-every-app-mounts-the-set-piece used. A canvas that draws only a sky (SkyEmbed,
 * TreeDiorama, the weather canary) mounts sky pieces and is not an app. Fails when:
 *   · src/components/Town.jsx does not exist, or renders no piece
 *   · an app does not render `<Town`
 *   · an app renders a renderer piece itself (the hand-assembly)
 * A file under src/harness/ whose header says `⛔ HARNESS ONLY` is declared exempt, with that line
 * as the reason: a harness mounts a partial scene on purpose. The marker exempts nothing elsewhere.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-every-app-mounts-the-town.mjs [--self-test]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, relative } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
const TOWN = 'src/components/Town.jsx'
// Rendered by Town but not a drawing: an app may use it for its own children.
const WRAPPERS = { R3FErrorBoundary: 'an error boundary; it draws nothing' }

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|mjs)$/.test(n)) out.push(p)
  }
  return out
}

// The components Town renders that it imports from a local file — read from its source.
export function piecesOf(townSrc) {
  const imported = new Set()
  for (const m of townSrc.matchAll(/^import\s+([^'"]+?)\s+from\s+'(\.[^']+)'/gm)) {
    const [def, named] = m[1].split(/,?\s*\{/)
    if (def && /^\w+$/.test(def.trim())) imported.add(def.trim())
    if (named) for (const n of named.replace('}', '').split(',')) { const k = n.trim().split(/\s+as\s+/).pop(); if (k) imported.add(k) }
  }
  const rendered = new Set([...townSrc.matchAll(/<([A-Z]\w*)\b/g)].map(m => m[1]))
  return [...imported].filter(n => rendered.has(n) && !WRAPPERS[n]).sort()
}

const renders = (src, name) => new RegExp(`<${name}\\b`).test(src)
const harnessReason = (x) => x.path.startsWith('src/harness/') && (x.src.slice(0, 1500).match(/^.*⛔ HARNESS ONLY.*$/m) || [])[0]

export function audit(files) {
  const f = [], info = []
  const town = files.find(x => x.path === TOWN)
  if (!town) return { f: [`${TOWN} does not exist — there is no one assembly for an app to mount`], info }
  const pieces = piecesOf(town.src)
  if (!pieces.includes('BakedGround')) return { f: [`${TOWN} does not render <BakedGround> — an assembly without the town's ground is not the town`], info }
  if (!pieces.length) return { f: [`${TOWN} renders no renderer piece — the definition broke`], info }
  info.push(`renderer pieces (read from ${TOWN}): ${pieces.join(', ')}`)
  const apps = files.filter(x => x.path !== TOWN && /<Canvas\b/.test(x.src) && (renders(x.src, 'Town') || renders(x.src, 'BakedGround')))
  if (!apps.length) f.push('no app found (no file owns a <Canvas> and renders <Town> or a piece) — the definition broke')
  for (const a of apps) {
    const exempt = harnessReason(a)
    if (exempt) { info.push(`exempt: ${a.path} — ${exempt.replace(/^\s*\*?\s*/, '')}`); continue }
    const hand = pieces.filter(p => renders(a.src, p))
    if (!renders(a.src, 'Town')) f.push(`${a.path} draws a town but does not render <Town>`)
    if (hand.length) f.push(`${a.path} renders renderer pieces itself — mount them through <Town>: ${hand.join(', ')}`)
    if (!hand.length && renders(a.src, 'Town')) info.push(`app: ${a.path} mounts <Town>`)
  }
  return { f, info }
}

const files = walk(SRC).map(p => ({ path: relative(ROOT, p), src: readFileSync(p, 'utf8') }))

if (process.argv.includes('--self-test')) {
  if (!existsSync(join(ROOT, TOWN))) { console.log(`⛔ cannot self-test: ${TOWN} does not exist yet`); process.exit(1) }
  const town = files.find(x => x.path === TOWN)
  const piece = piecesOf(town.src).find(p => p !== 'BakedGround')
  const swap = (path, fn) => files.map(x => x.path === path ? { ...x, src: fn(x.src) } : x)
  const cases = [
    ['production hand-mounts a piece', () => audit(swap('src/components/Scene.jsx', s => s + `\n<${piece} />`)).f.length],
    ['Preview drops <Town>', () => audit(swap('src/preview/PreviewApp.jsx', s => s.replace(/<Town\b/g, `<${piece}`))).f.length],
    ['Stage drops <Town>', () => audit(swap('src/cartograph/CartographApp.jsx', s => s.replace(/<Town\b/g, `<${piece}`))).f.length],
    ['a new app hand-assembles', () => audit([...files, { path: 'src/fake/NewApp.jsx', src: `<Canvas><BakedGround /><${piece} /></Canvas>` }]).f.length],
    ['the harness marker outside src/harness/', () => audit([...files, { path: 'src/fake/NewApp.jsx', src: `/* ⛔ HARNESS ONLY */ <Canvas><BakedGround /></Canvas>` }]).f.length],
    ['Town is deleted', () => audit(files.filter(x => x.path !== TOWN)).f.length],
  ]
  let bad = 0
  for (const [n, run] of cases) { const c = run() > 0; if (!c) bad++; console.log(`${c ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  process.exit(bad ? 1 : 0)
}

const { f, info } = audit(files)
console.log(info.join('\n'))
if (f.length) { console.log(`⛔ FAIL\n   ${f.join('\n   ')}`); process.exit(1) }
console.log('✅ every app that draws a town mounts <Town>, and none mounts a renderer piece of its own')
