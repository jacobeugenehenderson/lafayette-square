#!/usr/bin/env node
// claims-a-look-authors-its-curb-width.mjs — IS EVERY CURB THE TOWN'S OWN, AND DOES A TOWN WITHOUT ONE REFUSE?
//
// ⭐ THE CLAIM (Boz ruled 2026-10-19): `curbWidth` is a fact about a town (`cartograph/lookDesign.mjs#TOWN_DESIGN_FIELDS`;
// LS 0.381, PTown 0.1524), authored in the town's home Look. No kit value is neutral, so NOTHING substitutes one. A town
// whose Look carries none REFUSES by name ("author curbWidth in this town's Look") in the producer, the bake, the zone
// tester and the editor; the editor shows the absence as absence. Before the ruling, eight sites quietly substituted 6 in
// (CURB_WIDTH or the literal 0.1524), so Jackson Heights poured, baked and drew at a curb nobody authored.
// Three judges, each reading the source of truth rather than restating it:
//   1 · TOWNS — every Look naming a scene (public/looks/index.json) authors a finite curbWidth in its design.json, or is
//       named as refusing. A refusing town is RED: it cannot pour until its curb is authored.
//   2 · NO SUBSTITUTE IN THE SOURCE — no line in src/, cartograph/, checks/ or scratch/_proto-feed.mjs tests the curb width
//       and supplies a constant in its absence (`?? n` · `|| n` · `isFinite(…) ? … : n|CURB_WIDTH` · a parameter default
//       `curbWidth = …`), and the store's initial state carries no number.
//   3 · THE BUILDERS REFUSE — buildTileGround and buildBlockGeometryV2, called with no curbWidth, throw naming the fix.
// ⭐ MUTANTS (--mutants): (a) a town's curbWidth deleted → 1 must go RED · (b) a substitution put back in buildTileGround's
// source → 2 must find it · (c) the store's initial state given 0.1524 again → 2 must find it.
//   node checks/claims-a-look-authors-its-curb-width.mjs [--mutants]
// Read-only. Exits 1 on any refusing town, any substitution, or a builder that does not refuse.
import fs from 'fs'
import path from 'path'

let bad = 0
const FIX = "author curbWidth in this town's Look"

// ── 1 · TOWNS ─────────────────────────────────────────────────────────────────
const looks = JSON.parse(fs.readFileSync('public/looks/index.json', 'utf8')).looks
const townsOf = (designOf) => looks.filter(l => l.scene).map(l => ({ id: l.id, scene: l.scene, cw: designOf(l.id)?.curbWidth }))
const readDesign = (id) => { const p = `public/looks/${id}/design.json`; return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null }
const refusing = (T) => T.filter(t => !Number.isFinite(t.cw))
const T = townsOf(readDesign), R = refusing(T)
console.log(`${R.length ? '⛔' : '✅'} 1 towns: ${T.length} Look(s) with a scene · authoring a curb width ${T.length - R.length} · REFUSING ${R.length}`)
for (const t of T) console.log(`      ${t.id.padEnd(20)} ${Number.isFinite(t.cw) ? `${t.cw} m` : `⛔ none — refuses until its curb is authored (${FIX})`}`)
if (R.length) bad++

// ── 2 · NO SUBSTITUTE IN THE SOURCE ──────────────────────────────────────────
const SUB = [
  /curbWidth\b[^\n]*?(\?\?|\|\|)\s*(CURB_WIDTH|\d)/,                               // x.curbWidth ?? 0.1524
  /isFinite\([^)]*curbWidth\)\s*\?[^:\n]*:\s*(CURB_WIDTH|\d)/,                      // isFinite(curbWidth) ? curbWidth : CURB_WIDTH
  /^\s*(const|let|var)?\s*\{?[^\n]*\bcurbWidth\s*=\s*(CURB_WIDTH|\d)/,              // a parameter default / assignment of a constant
]
const STORE = 'src/cartograph/stores/useCartographStore.js', STORE_INIT = /^\s*curbWidth:\s*(CURB_WIDTH|\d)/
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (['node_modules', '_archive'].includes(e.name) ? [] : walk(path.join(d, e.name)))
  : /\.(m?js|jsx)$/.test(e.name) ? [path.join(d, e.name)] : [])
const SELF = path.relative(process.cwd(), new URL(import.meta.url).pathname)
const FILES = [...walk('src'), ...walk('cartograph'), ...walk('checks'), 'scratch/_proto-feed.mjs'].filter(f => f !== SELF)
function substitutions(textOf) {
  const out = []
  for (const f of FILES) textOf(f).split('\n').forEach((s, i) => {
    if (/^\s*(\/\/|\*)/.test(s)) return                                             // a comment names the old way; it substitutes nothing
    if (SUB.some(rx => rx.test(s)) || (f === STORE && STORE_INIT.test(s))) out.push(`${f}:${i + 1}  ${s.trim().slice(0, 140)}`) })
  return out
}
const read = (f) => fs.readFileSync(f, 'utf8')
const S = substitutions(read)
console.log(`${S.length ? '⛔' : '✅'} 2 no substitute: ${FILES.length} source file(s) read · lines supplying a curb width nobody authored ${S.length}`)
for (const s of S) console.log(`      ${s}`)
if (S.length) bad++

// ── 3 · THE BUILDERS REFUSE ──────────────────────────────────────────────────
const { buildTileGround } = await import('../src/lib/tileGround.js')
const { buildBlockGeometryV2 } = await import('../src/lib/buildBlockGeometryV2.js')
const refuses = (fn) => { try { fn(); return { ok: false, why: 'returned' } } catch (e) { return { ok: String(e.message).includes(FIX), why: String(e.message).split('\n')[0].slice(0, 160) } } }
for (const [name, fn] of [['buildTileGround', () => buildTileGround({ streets: [] }, {})], ['buildBlockGeometryV2', () => buildBlockGeometryV2({ streets: [] }, {})]]) {
  const r = refuses(fn); if (!r.ok) bad++
  console.log(`${r.ok ? '✅' : '⛔'} 3 ${name} with no curbWidth: ${r.ok ? 'refuses, naming the fix' : `⛔ does not refuse by name (${r.why})`}`) }

// ── MUTANTS ──────────────────────────────────────────────────────────────────
if (process.argv.includes('--mutants')) {
  const home = T.find(t => Number.isFinite(t.cw))
  const ma = home ? refusing(townsOf(id => id === home.id ? { ...readDesign(id), curbWidth: undefined } : readDesign(id))).length > R.length : false
  const TG = 'src/lib/tileGround.js', tg = read(TG)
  const put = tg.replace(/^(\s*)const curbWidth = opts\.curbWidth$/m, '$1const curbWidth = Number.isFinite(opts.curbWidth) ? opts.curbWidth : CURB_WIDTH')
  const mb = put !== tg && substitutions(f => f === TG ? put : read(f)).length > S.length
  const st = read(STORE), stPut = st.replace(/^(\s*)curbWidth: null,$/m, '$1curbWidth: 0.1524,')
  const mc = stPut !== st && substitutions(f => f === STORE ? stPut : read(f)).length > S.length
  if (!ma || !mb || !mc) bad++
  console.log(`   mutant · a town's curbWidth deleted: ${ma ? 'RED, as it must be' : '⛔ still GREEN'} · a fallback put back in buildTileGround: ${put === tg ? '⛔ not run (the site moved — re-aim the mutant)' : mb ? 'RED, as it must be' : '⛔ still GREEN'} · the store's initial 0.1524 put back: ${stPut === st ? '⛔ not run (the site moved — re-aim the mutant)' : mc ? 'RED, as it must be' : '⛔ still GREEN'}`)
}
console.log(bad ? '\n⛔ RED — a town has no authored curb, a curb width is substituted somewhere, or a builder does not refuse' : '\n✅ GREEN — every curb is its town\'s own')
process.exit(bad ? 1 : 0)
