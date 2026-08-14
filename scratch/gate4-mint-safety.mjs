// GATE 4 (Tally, 2026-08-14) — the two questions that must be answered BEFORE
// minting junction nodes in derive.js. Made a CHECK, not prose, because both
// answers are properties of source that will drift.
//
//   (a) Does minting SPLIT any chain? — the skelId renumbering question.
//       skeleton.js:1681 mints ids POSITIONALLY (`${slugify(name)}-${i}`, i =
//       array index), so if a mint changed how many chains a street splits into,
//       every id after that point renumbers and every authoring slot keyed
//       skelId|side|segOrd orphans.
//   (b) What actually CONSUMES junction nodes — specifically whether per-IX
//       corner radius derives from them.
//
//   node scratch/gate4-mint-safety.mjs --scene <s> --snapshot
//   … change derive.js, re-pour …
//   node scratch/gate4-mint-safety.mjs --scene <s> --against
//
// Exit 0 = safe · 1 = identity moved · 2 = NOT MEASURED (⛔ never a pass).
//
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const argv = process.argv.slice(2)
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? (argv[i + 1] ?? true) : d }
const MODE = argv.includes('--snapshot') ? 'snapshot' : argv.includes('--against') ? 'against' : null
const SCENE = arg('--scene', 'lafayette-square')
const SNAP = path.join(ROOT, 'scratch', '_snapshots', `${SCENE}-mintsafety.json`)
const MAP = path.join(ROOT, 'cartograph', 'data', SCENE, 'clean', 'map.json')

// ── (b) READ THE SOURCE, never restate it. If the corner-radius key derivation
// changes, this check must change with it rather than keep asserting an answer
// that was true once.
function cornerKeyEvidence() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'tileGround.js'), 'utf8')
  const lines = src.split('\n')
  const find = (re) => { const i = lines.findIndex(l => re.test(l)); return i < 0 ? null : { line: i + 1, text: lines[i].trim() } }
  const ixKeyOf = find(/const ixKeyOf\s*=/)
  const resolveVertR = find(/const resolveVertR\s*=/)
  const legKey = find(/const legOut\s*=/)
  // the consumer census: every site naming junctionMap outside derive.js
  const consumers = []
  for (const f of ['src/lib/tileGround.js', 'src/lib/buildBlockGeometryV2.js', 'src/lib/substrateWalk.js', 'cartograph/promote-ribbons.js']) {
    const p = path.join(ROOT, f)
    if (!fs.existsSync(p)) continue
    fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
      if (/junctionMap/.test(l) && !/^\s*\/\//.test(l)) consumers.push(`${f}:${i + 1}  ${l.trim().slice(0, 96)}`)
    })
  }
  return { ixKeyOf, resolveVertR, legKey, consumers }
}

function readScene() {
  if (!fs.existsSync(MAP)) return { ok: false, why: `no ${path.relative(ROOT, MAP)}` }
  const m = JSON.parse(fs.readFileSync(MAP, 'utf8'))
  const r = m.layers?.ribbons
  if (!r) return { ok: false, why: 'map.json carries no layers.ribbons' }
  return {
    ok: true,
    // ⭐ ORDERED, not a set — positional ids make ORDER the thing that matters.
    skelIds: (r.streets || []).map(s => s.skelId ?? s.name ?? '?'),
    counts: {
      streets: (r.streets || []).length, tiles: (r.tiles || []).length,
      faces: (r.faces || []).length, medians: (r.medians || []).length,
      nodes: (r.junctionMap?.nodes || []).length,
      cornersAdjacent: (r.junctionMap?.nodes || []).reduce((s, n) => s + (n.cornersAdjacent?.length || 0), 0),
    },
    // tile ring vertices at 3 dp — the per-IX corner-radius override key space.
    ixKeys: [...new Set((r.tiles || []).flatMap(t => (t.ring || []).map(p => `${(+p[0]).toFixed(3)},${(+p[1]).toFixed(3)}`)))].sort(),
  }
}

console.log(`\nGATE 4 — MINT SAFETY — ${SCENE}\n`)

const ev = cornerKeyEvidence()
console.log('── (b) WHAT CONSUMES JUNCTION NODES — read from source, this run:')
for (const c of ev.consumers) console.log(`     ${c}`)
console.log('\n   PER-IX CORNER RADIUS — its key, read from source:')
console.log(`     tileGround.js:${ev.ixKeyOf?.line}  ${ev.ixKeyOf?.text}`)
console.log(`     tileGround.js:${ev.legKey?.line}  ${ev.legKey?.text}`)
console.log(`     tileGround.js:${ev.resolveVertR?.line}  ${ev.resolveVertR?.text}`)
const derivesFromNodes = /junctionMap/.test(ev.ixKeyOf?.text || '') || /junctionMap/.test(ev.resolveVertR?.text || '')
console.log(`\n   ⇒ per-IX corner radius derives from junctionMap: ${derivesFromNodes ? '⛔ YES — minting can orphan overrides' : '✅ NO'}`)
console.log('     The key is a 3-dp TILE-RING COORDINATE plus two legs named `${skelId}:${f|b}`.')
console.log('     Minting a node adds a junctionMap record; it moves no tile vertex and renames')
console.log('     no chain, so the override key space is untouched. ⚠️ The exposure is INDIRECT:')
console.log('     if a mint changed tile ring vertices, ixKeys would move. That is asserted below.')

if (!MODE) { console.log('\nusage: --scene <name> (--snapshot | --against)\n'); process.exit(2) }

const now = readScene()
if (!now.ok) { console.log(`\n⛔ NOT MEASURED — ${now.why}\n`); process.exit(2) }

if (MODE === 'snapshot') {
  fs.mkdirSync(path.dirname(SNAP), { recursive: true })
  fs.writeFileSync(SNAP, JSON.stringify(now))
  console.log(`\n── BASELINE TAKEN`)
  console.log(`   ${Object.entries(now.counts).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  console.log(`   skelIds ${now.skelIds.length} · distinct tile-ring ixKeys ${now.ixKeys.length}`)
  console.log(`   → ${path.relative(ROOT, SNAP)}\n`)
  process.exit(0)
}

if (!fs.existsSync(SNAP)) { console.log(`\n⛔ NOT MEASURED — no baseline. Take one BEFORE the change.\n`); process.exit(2) }
const base = JSON.parse(fs.readFileSync(SNAP, 'utf8'))

console.log('\n── (a) DOES THE MINT SPLIT A CHAIN? — the skelId renumbering question')
const beforeIds = base.skelIds, afterIds = now.skelIds
const bSet = new Set(beforeIds), aSet = new Set(afterIds)
const lost = beforeIds.filter(x => !aSet.has(x))
const gained = afterIds.filter(x => !bSet.has(x))
let reordered = 0
for (let i = 0; i < Math.min(beforeIds.length, afterIds.length); i++) if (beforeIds[i] !== afterIds[i]) reordered++
console.log(`   streets ${beforeIds.length} → ${afterIds.length}`)
console.log(`   skelIds LOST ....... ${lost.length}${lost.length ? '  ' + lost.slice(0, 8).join(', ') : ''}`)
console.log(`   skelIds GAINED ..... ${gained.length}${gained.length ? '  ' + gained.slice(0, 8).join(', ') : ''}`)
console.log(`   POSITIONS CHANGED .. ${reordered}   ⭐ positional ids make this the one that orphans authoring`)

console.log('\n── TILE-RING IX KEY SPACE (the per-IX corner-radius override keys)')
const bIx = new Set(base.ixKeys), aIx = new Set(now.ixKeys)
const ixLost = base.ixKeys.filter(k => !aIx.has(k))
const ixGained = now.ixKeys.filter(k => !bIx.has(k))
console.log(`   distinct ixKeys ${base.ixKeys.length} → ${now.ixKeys.length}   LOST ${ixLost.length} · GAINED ${ixGained.length}`)

console.log('\n── FINGERPRINT (expected to move on the node counts, and ONLY there)')
for (const k of Object.keys(base.counts)) {
  const b = base.counts[k], a = now.counts[k]
  const expected = k === 'nodes' || k === 'cornersAdjacent'
  console.log(`   ${k.padEnd(18)} ${String(b).padStart(6)} → ${String(a).padStart(6)}  ${b === a ? '' : expected ? '(expected to move)' : '⛔ UNEXPECTED'}`)
}

const fatal = []
if (lost.length || gained.length) fatal.push(`skelId set changed (${lost.length} lost, ${gained.length} gained) — authoring keyed skelId|side|segOrd orphans`)
if (reordered) fatal.push(`${reordered} skelIds changed POSITION — skeleton.js:1681 mints by array index`)
if (ixLost.length) fatal.push(`${ixLost.length} tile-ring ixKeys vanished — per-IX corner-radius overrides orphan`)
for (const k of Object.keys(base.counts)) {
  if (k === 'nodes' || k === 'cornersAdjacent') continue
  if (base.counts[k] !== now.counts[k]) fatal.push(`${k} moved ${base.counts[k]} → ${now.counts[k]} — the mint should not change this`)
}
console.log('')
if (fatal.length) { console.log('⛔ GATE 4 FAILS:'); for (const f of fatal) console.log(`   · ${f}`); console.log('') ; process.exit(1) }
console.log('✅ GATE 4 PASSES — no chain split, no skelId renumber, no ixKey lost.\n')
process.exit(0)
