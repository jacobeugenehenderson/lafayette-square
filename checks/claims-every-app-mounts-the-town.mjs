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
 * or any piece of the DRAWN town — what Town.jsx mounts inside its <Suspense> block (ground,
 * buildings, trees, lamps, set-pieces, horizon), read from its source. A canvas that draws only a
 * sky (SkyEmbed, TreeDiorama, the weather canary) mounts sky pieces and is not an app. Fails when:
 *   · src/components/Town.jsx does not exist, or renders no piece
 *   · an app does not render `<Town`
 *   · an app renders a renderer piece itself (the hand-assembly)
 * ⏳ KNOWN OPEN, still RED: an app named in OPEN keeps failing, and the failure carries why it is open
 * and what closes it. It is not an exemption; it is a time-box made visible.
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
// ⏳ Known-open apps, by path → why it is open and what closes it (see the header). Empty: none is open.
const OPEN = {}
// Rendered by Town but not a drawing: an app may use it for its own children.
const WRAPPERS = {
  R3FErrorBoundary: 'an error boundary; it draws nothing',
  // Town mounts the controls only under <Town controls> (an app that imports only Town); an app that places its own
  // camera (Stage, the old player — flight={false}) mounts its own. They draw nothing, and the regimes are defined
  // once (claims-the-camera-has-one-definition).
  RegimeControls: 'the camera controls; Town mounts them only when an app asks (<Town controls>)',
}

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

// Code only: a comment that names a piece mounts nothing.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
// Each top-level <Suspense>…</Suspense> block, matched by depth (Town has more than one).
function suspenseBlocks(src) {
  const out = [], tag = /<(\/?)Suspense\b[^>]*>/g
  let depth = 0, start = -1, t
  while ((t = tag.exec(src))) {
    if (!t[1]) { if (depth++ === 0) start = t.index }
    else if (depth > 0 && --depth === 0) out.push(src.slice(start, tag.lastIndex))
  }
  return out
}
// The drawn town: the pieces of the <Suspense> block that draws the ground. ⛔ Never first-<Suspense>-to-last-</Suspense>:
// a one-line <Suspense><TownMoonPainter/></Suspense> above the sky (fd3cf5a5, 2026-10-04) made that span swallow every sky
// and wind piece, and five sky and tree viewers read as towns for 25 days.
function drawnPiecesOf(townSrc) {
  const b = suspenseBlocks(code(townSrc)).find(s => /<BakedGround\b/.test(s))
  return b ? [...new Set([...b.matchAll(/<([A-Z]\w*)\b/g)].map(x => x[1]))].filter(n => n !== 'Suspense' && !WRAPPERS[n]) : []
}
const renders = (src, name) => new RegExp(`<${name}\\b`).test(code(src))
const harnessReason = (x) => x.path.startsWith('src/harness/') && (x.src.slice(0, 1500).match(/^.*⛔ HARNESS ONLY.*$/m) || [])[0]

export function audit(files, drawnOf = drawnPiecesOf) {
  const f = [], info = []
  const town = files.find(x => x.path === TOWN)
  if (!town) return { f: [`${TOWN} does not exist — there is no one assembly for an app to mount`], info }
  const pieces = piecesOf(town.src)
  if (!pieces.length) return { f: [`${TOWN} renders no renderer piece — the definition broke`], info }
  info.push(`renderer pieces (read from ${TOWN}): ${pieces.join(', ')}`)
  const drawn = drawnOf(town.src)
  if (!drawn.includes('BakedGround')) return { f: [`${TOWN}'s <Suspense> block does not draw <BakedGround> — the definition broke`], info }
  // An app: owns a <Canvas> and draws a town — renders <Town> or a piece, or PLACES a town (placeTown / TownPlace), so
  // an app that places its town and then drops <Town> is still seen.
  const apps = files.filter(x => x.path !== TOWN && /<Canvas\b/.test(code(x.src)) && (renders(x.src, 'Town') || drawn.some(p => renders(x.src, p)) || /\b(placeTown|TownPlace)\b/.test(code(x.src))))
  if (!apps.length) f.push('no app found (no file owns a <Canvas> and renders <Town> or a piece) — the definition broke')
  for (const a of apps) {
    const exempt = harnessReason(a)
    if (exempt) { info.push(`exempt: ${a.path} — ${exempt.replace(/^\s*\*?\s*/, '')}`); continue }
    const hand = pieces.filter(p => renders(a.src, p))
    if (!renders(a.src, 'Town')) f.push(`${a.path} draws a town but does not render <Town>`)
    if (hand.length) f.push(`${a.path} renders renderer pieces itself — mount them through <Town>: ${hand.join(', ')}${OPEN[a.path] ? `\n      ⏳ OPEN: ${OPEN[a.path]}` : ''}`)
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
    ['Preview drops <Town> for a drawn piece', () => audit(swap('src/preview/PreviewApp.jsx', s => s.replace(/<Town\b/g, '<SlabBuildings'))).f.length],
    ['Stage drops <Town>', () => audit(swap('src/cartograph/CartographApp.jsx', s => s.replace(/<Town\b/g, `<Nothing`))).f.length],
    ['a new app hand-assembles', () => audit([...files, { path: 'src/fake/NewApp.jsx', src: `<Canvas><BakedGround /><${piece} /></Canvas>` }]).f.length],
    ['the harness marker outside src/harness/', () => audit([...files, { path: 'src/fake/NewApp.jsx', src: `/* ⛔ HARNESS ONLY */ <Canvas><BakedGround /></Canvas>` }]).f.length],
    ['Town is deleted', () => audit(files.filter(x => x.path !== TOWN)).f.some(x => /does not exist/.test(x)) ? Infinity : 0],
  ]
  // Caught means MORE failures than the tree has now.
  const base = audit(files).f.length
  let bad = 0
  for (const [n, run] of cases) { const c = run() > base; if (!c) bad++; console.log(`${c ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  // The other direction: a canvas that draws only a sky is NOT an app, even when Town wraps a sky piece in a <Suspense>
  // of its own above the drawn block (the 2026-10-04 shape). Planted, then seen RED under the old first-to-last parse.
  const sky = [...swap(TOWN, s => s.replace(/<Suspense\b/, '<Suspense fallback={null}><CloudDome /></Suspense>\n<Suspense')),
    { path: 'src/fake/SkyOnly.jsx', src: `<Canvas><CloudDome /></Canvas>` }]
  const greedy = (t) => { const m = code(t).match(/<Suspense\b[\s\S]*<\/Suspense>/); return m ? [...new Set([...m[0].matchAll(/<([A-Z]\w*)\b/g)].map(x => x[1]))].filter(n => n !== 'Suspense' && !WRAPPERS[n]) : [] }
  const skyOk = audit(sky).f.length === base, skyMut = audit(sky, greedy).f.length > base
  if (!skyOk) bad++
  if (!skyMut) bad++
  console.log(`${skyOk ? '✅' : '⛔'} a sky-only canvas is not an app, with a sky piece in its own <Suspense> above the drawn block`)
  console.log(`${skyMut ? '✅ RED as it must be' : '⛔ MISSED'} — mutant: the first-<Suspense>-to-last-</Suspense> parse`)
  process.exit(bad ? 1 : 0)
}

const { f, info } = audit(files)
console.log(info.join('\n'))
if (f.length) { console.log(`⛔ FAIL\n   ${f.join('\n   ')}`); process.exit(1) }
console.log('✅ every app that draws a town mounts <Town>, and none mounts a renderer piece of its own')
