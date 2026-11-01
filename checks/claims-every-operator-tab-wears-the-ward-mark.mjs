#!/usr/bin/env node
// claims-every-operator-tab-wears-the-ward-mark.mjs — DOES EVERY TAB THE KIT SERVES ITS OPERATOR WEAR THE ONE WARD MARK,
// AND DOES THE TOWN PLAYER WEAR NONE OF IT?
//
// ⭐ THE CLAIM (Sigil, 2026-11-01; Boz's ruling, Zob's co-sign; Jacob: "all tabs from within the environment").
// The operator tabs are DERIVED, never listed: every tracked .html, except what the town player ships, which is
// index.html and tracked public/**.html (publish-player-to-staging ships tracked public/ files). Each wears exactly one
// icon link, to src/operator/ward-mark.svg: the Ward's tab mark, copied byte-for-byte from theward-online and recorded
// in src/operator/ward-mark.source.json. The town player keeps its own mark (the one-icon ruling,
// claims-a-town-has-one-icon). Five judges, each reading the source of truth:
//   1 · THE ONE MARK — the vendored file's sha256 equals the one source.json records. ⛔ Theward-online itself is NOT
//       read: it lives outside the project and a town #2 machine won't have it (Zob, 2026-11-01).
//   2 · NO SECOND COPY — no other tracked text file carries the mark's ring path, and src/operator holds one .svg.
//       ⚠ Named limit (Zob, 2026-11-01): it matches the ring path LITERALLY, so a percent-encoded data: copy slips past
//       it; judge 3 still rejects a data: icon on any operator tab. No decoder until someone inlines the mark.
//   3 · EVERY OPERATOR TAB — each derived operator page has exactly one rel~=icon link, and it is the mark.
//   4 · THE PLAYER UNTOUCHED — no player page names the mark, and no src/ code imports it (the build then keeps it out
//       of the player's graph; measured 2026-11-01: scripts/player-graph.mjs#notThePlayers classes it operator).
//   5 · EVERY BUILT OR ROUTED PAGE IS JUDGED — vite.config.js's serveHelperApps routes and rollupOptions.input are
//       tracked pages, and each is the player's index.html or inside the operator set.
// ⭐ MUTANTS (--mutants), each must go RED: (a) a tab with no icon → 3 · (b) a tab wearing a town's mark → 3 ·
// (c) a second, edited copy of the mark → 2 · (d) the vendored bytes edited → 1 · (e) the Ward mark on index.html → 4 ·
// (f) the player's code importing the mark → 4 · (g) a new route to an untracked page → 5 · (h) a new tracked page
// with no icon → 3.
//   node checks/claims-every-operator-tab-wears-the-ward-mark.mjs [--mutants]
// Read-only. Exits 1 on any failing judge or any mutant left GREEN.
import { readFileSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MARK = 'src/operator/ward-mark.svg'
const SOURCE = 'src/operator/ward-mark.source.json'
const HREF = '/' + MARK
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean)
const isPlayerPage = (p) => p === 'index.html' || p.startsWith('public/')
const TEXT = /\.(html|svg|js|jsx|mjs|css)$/

const world = {
  markBytes: readFileSync(join(ROOT, MARK)),
  source: JSON.parse(read(SOURCE)),
  operatorSvgs: readdirSync(join(ROOT, dirname(MARK))).filter((f) => f.endsWith('.svg')),
  pages: new Map(tracked.filter((p) => p.endsWith('.html')).map((p) => [p, read(p)])),
  texts: new Map(tracked.filter((p) => TEXT.test(p) && p !== MARK && !p.startsWith('node_modules/')).map((p) => [p, read(p)])),
  vite: read('vite.config.js'),
}
const ringOf = (svg) => {
  const d = String(svg).match(/<path[^>]*\sd="([^"]+)"/)
  if (!d) throw new Error(`${MARK} has no <path d="…"> — the mark's ring cannot be read, so its copies cannot be found`)
  return d[1]
}

function judgeOne(w) {
  const why = [], sha = createHash('sha256').update(w.markBytes).digest('hex')
  if (!w.source?.sha256) why.push(`${SOURCE} records no sha256`)
  else if (sha !== w.source.sha256) why.push(`${MARK} is ${sha.slice(0, 12)}…, ${SOURCE} records ${w.source.sha256.slice(0, 12)}… — the vendored mark drifted; re-copy it (${SOURCE}.recopy)`)
  if (!w.source?.from) why.push(`${SOURCE} does not say where the mark came from`)
  return why
}

function judgeNoSecond(w) {
  const why = [], ring = ringOf(w.markBytes.toString('utf8'))
  for (const [p, t] of w.texts) if (t.includes(ring)) why.push(`${p} carries a copy of the mark's ring — there is one mark, at ${MARK}`)
  if (w.operatorSvgs.length !== 1) why.push(`${dirname(MARK)} holds ${w.operatorSvgs.length} .svg (${w.operatorSvgs.join(', ')}), not the one mark`)
  return why
}

const iconLinks = (html) => [...html.matchAll(/<link\b[^>]*\brel=["'][^"']*\bicon\b[^"']*["'][^>]*>/gi)]
  .map((m) => (m[0].match(/\bhref=["']([^"']*)["']/i) || [])[1] ?? '')

function judgeTabs(w) {
  const why = [], ops = [...w.pages.keys()].filter((p) => !isPlayerPage(p))
  if (!ops.length) why.push('no operator page derived from the tracked tree — the derivation is broken')
  for (const p of ops) {
    const links = iconLinks(w.pages.get(p))
    if (links.length !== 1) why.push(`${p} has ${links.length} icon links, not one (the Ward mark)`)
    else if (links[0] !== HREF) why.push(`${p}'s icon is ${links[0].slice(0, 60)}, not the Ward mark ${HREF}`)
  }
  return why
}

function judgePlayer(w) {
  const why = [], name = MARK.split('/').pop()
  for (const [p, t] of w.pages) if (isPlayerPage(p) && t.includes(name)) why.push(`${p} is the town player's and names the Ward mark — a town wears its own mark`)
  for (const [p, t] of w.texts) if (p.startsWith('src/') && /\.(js|jsx|mjs)$/.test(p) && t.includes(name)) why.push(`${p} imports the Ward mark — it would ride into the town player's graph`)
  return why
}

function judgeBuilt(w) {
  const why = [], v = w.vite.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
  const routes = [...v.matchAll(/\{\s*url:\s*'[^']+',\s*file:\s*'([^']+)'\s*\}/g)].map((m) => m[1])
  const input = (v.match(/input:\s*\{([\s\S]*?)\}/) || [])[1]
  const inputs = input ? [...input.matchAll(/:\s*'([^']+\.html)'/g)].map((m) => m[1]) : []
  if (!routes.length) why.push('vite.config.js: no serveHelperApps route read — the reader is broken')
  if (!inputs.length) why.push('vite.config.js: no rollupOptions.input page read — the reader is broken')
  for (const p of new Set([...routes, ...inputs])) {
    if (!w.pages.has(p)) why.push(`vite.config.js serves or builds ${p}, which is not a tracked page — it escapes the operator set`)
    else if (isPlayerPage(p) && p !== 'index.html') why.push(`vite.config.js serves or builds ${p} from public/, outside the operator set`)
  }
  return why
}

const JUDGES = [[1, 'the one mark', judgeOne], [2, 'no second copy', judgeNoSecond], [3, 'every operator tab wears it', judgeTabs],
  [4, 'the town player wears none of it', judgePlayer], [5, 'every built or routed page is judged', judgeBuilt]]
let bad = 0
const ops = [...world.pages.keys()].filter((p) => !isPlayerPage(p))
console.log(`\nEvery operator tab wears the Ward mark (${ops.length} operator pages, ${world.pages.size - ops.length} player pages)`)
for (const [k, name, judge] of JUDGES) {
  const why = judge(world)
  if (why.length) { bad++; console.log(`  ⛔ ${k} · ${name}`); for (const x of why) console.log(`       ${x}`) }
  else console.log(`  ✅ ${k} · ${name}`)
}

if (process.argv.includes('--mutants')) {
  const withPage = (p, f) => ({ ...world, pages: new Map([...world.pages].map(([k, t]) => [k, k === p ? f(t) : t])) })
  const link = `<link rel="icon" type="image/svg+xml" href="${HREF}" />`
  const ring = ringOf(world.markBytes.toString('utf8'))
  const MUTANTS = [
    ['a · a tab with no icon', 3, () => judgeTabs(withPage('cartograph.html', (t) => t.replace(link, '')))],
    ['b · a tab wearing a town mark', 3, () => judgeTabs(withPage('arborist.html', (t) => t.replace(HREF, 'data:image/svg+xml,%3Csvg%3E%F0%9F%A6%9E%3C/svg%3E')))],
    ['c · a second, edited copy', 2, () => judgeNoSecond({ ...world, texts: new Map([...world.texts, ['public/ward-mark-v2.svg', `<svg><path d="${ring}" stroke-width="12"/></svg>`]]) })],
    ['d · the vendored bytes edited', 1, () => judgeOne({ ...world, markBytes: Buffer.from(world.markBytes.toString('utf8').replace('#B96A12', '#B96A13')) })],
    ['e · the Ward mark on index.html', 4, () => judgePlayer(withPage('index.html', (t) => t.replace('</head>', `${link}\n</head>`)))],
    ['f · the player importing the mark', 4, () => judgePlayer({ ...world, texts: new Map([...world.texts, ['src/App.jsx', `import ward from '../${MARK}'\n` + (world.texts.get('src/App.jsx') || '')]]) })],
    ['g · a route to an untracked page', 5, () => judgeBuilt({ ...world, vite: world.vite.replace("{ url: '/arborist',", "{ url: '/newtool', file: 'newtool.html' },\n    { url: '/arborist',") })],
    ['h · a new tracked page with no icon', 3, () => judgeTabs({ ...world, pages: new Map([...world.pages, ['newtool.html', '<!doctype html><title>New tool</title>']]) })],
  ]
  console.log('\n  mutants:')
  for (const [name, judge, run] of MUTANTS) {
    const r = run()
    if (r.length) console.log(`    ✅ RED   ${name} → ${judge}: ${r[0].slice(0, 110)}`)
    else { bad++; console.log(`    ⛔ GREEN ${name} → ${judge} did not catch it`) }
  }
}
process.exit(bad ? 1 : 0)
