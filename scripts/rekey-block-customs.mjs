#!/usr/bin/env node
// RE-KEY A TOWN'S AUTHORED WIDTHS ACROSS A ① RELABEL — so every face renders the width it rendered before.
//
// `blockCustoms` is keyed `skelId → side → segOrd`, and Survey writes the key the frozen ① gives the clicked face
// (MeasureOverlay: "the tool resolves against the frontages the paint uses"). When a pour relabels ① (fc3faf43 fixed
// the span a flipped stroke's edges carried), the same face can come back under another key, and the authored
// width would silently move to a neighbour. This moves the AUTHORING with the face instead.
//
// ⭐ BY THE FACE, NEVER BY THE KEY: every block edge of the AFTER ① is matched to the BEFORE block edge it lies on
// (midpoint within `eps` + a grid step, by geometry alone — a relabel can change a face's STREET), and each after-key takes the authored value its faces
// had before. ⛔ NO GUESSING: an after-key whose faces had DIFFERENT authored values is a CONFLICT — listed, and
// nothing is written. An authored slot that governed faces before and governs none after is ORPHANED (its authoring
// would vanish) — also nothing written. A slot that governed NO face even before is DORMANT (an earlier relabel
// already stranded it): carried over unchanged, and reported — loudly if a moved slot now lands on its key.
// Faces ≤ 3·eps (caps, degenerate slivers) render nothing and are not judged. Faces with no before-match are counted.
// ⛔ Dry run unless `--write`; `--write` refuses unless zero faces would change width and nothing is orphaned.
// Every Look whose `scene` is this scene is re-keyed (a scene can have several Looks).
//
//   node scripts/rekey-block-customs.mjs <scene> --before=<ribbons.json snapshotted before the pour> [--after=<ribbons.json>] [--write]
//
// ⛔ Anyone with this scene open in the Designer must RELOAD after a write: the open page holds the old keys and
// its next autosave would write them back.
import fs from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../checks/_scenes.mjs'

const scene = process.argv[2]
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
if (!scene || scene.startsWith('--') || !arg('before')) { console.error('usage: rekey-block-customs.mjs <scene> --before=<ribbons.json> [--after=<ribbons.json>] [--write]'); process.exit(2) }
const DEFAULT_MAP = fs.readFileSync(join(ROOT, 'cartograph/scene.js'), 'utf8').match(/export const DEFAULT_MAP = '([^']+)'/)?.[1]
const afterP = arg('after') || (scene === DEFAULT_MAP ? join(ROOT, 'src/data/ribbons.json') : join(ROOT, 'cartograph/data', scene, 'clean/ribbons.json'))
const PB = JSON.parse(fs.readFileSync(arg('before'), 'utf8')).protopolygon, PA = JSON.parse(fs.readFileSync(afterP, 'utf8')).protopolygon
if (!PB?.blocks || !PA?.blocks) { console.error(`⛔ ${!PB?.blocks ? 'the BEFORE' : 'the AFTER'} ribbons carry no frozen ① blocks — nothing to match faces by`); process.exit(1) }
const SCALE = +fs.readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8').match(/^const SCALE = (\d+)/m)?.[1]
const TOL = PB.eps + 2 / SCALE

// every block edge (outer + holes) as { a, b, mid, L, o } — `o` the owner record
const edgesOf = (P) => { const out = []
  P.blocks.forEach((ring, k) => { for (const [r, labs] of [[ring, P.blockLabels[k]], ...(P.blockHoles?.[k] || []).map((h, j) => [h, P.blockHoleLabels?.[k]?.[j]])]) {
    if (!r || !labs) continue
    r.forEach((a, i) => { const b = r[(i + 1) % r.length], o = P.owners[labs[i]]; if (!o?.skelId || o.skelId.startsWith('__')) return
      out.push({ a, b, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], L: Math.hypot(b[0] - a[0], b[1] - a[1]), o }) }) } })
  return out }
const EB = edgesOf(PB), EA = edgesOf(PA)
const CELL = 10, cell = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`, grid = new Map()
EB.forEach((e, id) => { const x0 = Math.floor(Math.min(e.a[0], e.b[0]) / CELL), x1 = Math.floor(Math.max(e.a[0], e.b[0]) / CELL), z0 = Math.floor(Math.min(e.a[1], e.b[1]) / CELL), z1 = Math.floor(Math.max(e.a[1], e.b[1]) / CELL)
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = `${x},${z}`; let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(id) } })
const onSeg = (p, e) => { const dx = e.b[0] - e.a[0], dz = e.b[1] - e.a[1], L2 = dx * dx + dz * dz; if (!L2) return false
  const t = ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dz) / L2; if (t < -1e-6 || t > 1 + 1e-6) return false
  return Math.hypot(p[0] - e.a[0] - t * dx, p[1] - e.a[1] - t * dz) <= TOL }
const beforeOf = (e) => { const [cx, cz] = cell(e.mid[0], e.mid[1]).split(',').map(Number), hit = new Set()
  for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) for (const id of grid.get(`${x},${z}`) || []) { const b = EB[id]; if (b.L > 3 * PB.eps && onSeg(e.mid, b)) hit.add(id) }
  return [...hit].map(id => EB[id]) }

const keyOf = (o) => `${o.skelId}|${o.side}|${o.segOrd}`
const idx = JSON.parse(fs.readFileSync(join(ROOT, 'public/looks/index.json'), 'utf8'))
const looks = (idx.looks || []).filter(l => l.scene === scene)
if (!looks.length) { console.error(`⛔ no Look's scene is "${scene}" — no authoring to re-key`); process.exit(1) }
let refuse = false
for (const look of looks) {
  const dP = join(ROOT, 'public/looks', look.id, 'design.json'), design = JSON.parse(fs.readFileSync(dP, 'utf8'))
  const bc = design.blockCustoms || {}
  const valOf = (k) => { const [s, d, o] = k.split('|'); const v = bc[s]?.[d]?.[o]; return v == null ? null : JSON.stringify(v) }
  const authored = new Set(); for (const [s, sides] of Object.entries(bc)) for (const [d, ords] of Object.entries(sides || {})) for (const o of Object.keys(ords || {})) authored.add(`${s}|${d}|${o}`)
  // each after-key: the authored values its faces carried before (by face length)
  const want = new Map(); let unmatched = 0, unmatchedM = 0
  for (const e of EA) { if (e.L <= 3 * PA.eps) continue; const bs = beforeOf(e); const K = keyOf(e.o); if (!want.has(K)) want.set(K, new Map())
    if (!bs.length) { unmatched++; unmatchedM += e.L; continue }
    for (const b of bs) { const v = valOf(keyOf(b.o)); const m = want.get(K); const r = m.get(v) || { L: 0, from: new Set() }; r.L += e.L; r.from.add(keyOf(b.o)); m.set(v, r) } }
  const next = {}, conflicts = [], moved = []
  for (const [K, m] of want) {
    const vals = [...m.keys()]
    if (vals.length > 1) { conflicts.push(`${K}: ${[...m].map(([v, r]) => `${v == null ? 'unauthored' : 'authored'} from ${[...r.from].join('+')} (${r.L.toFixed(0)} m)`).join(' vs ')}`); continue }
    const v = vals[0]; if (v == null) continue
    const [s, d, o] = K.split('|'); ((next[s] ||= {})[d] ||= {})[o] = JSON.parse(v)
    const from = [...m.get(v).from]; if (from.length !== 1 || from[0] !== K) moved.push(`${from.join('+')} → ${K}`)
  }
  const governed = new Set(); for (const m of want.values()) for (const r of m.values()) for (const k of r.from) governed.add(k)
  const hadFace = new Set(EB.filter(e => e.L > 3 * PB.eps).map(e => keyOf(e.o)))
  const orphaned = [...authored].filter(k => hadFace.has(k) && !governed.has(k))
  const dormant = [...authored].filter(k => !hadFace.has(k)), clobbered = []
  for (const k of dormant) { const [s, d, o] = k.split('|'); if (next[s]?.[d]?.[o] !== undefined) { if (JSON.stringify(next[s][d][o]) !== valOf(k)) clobbered.push(k) } else ((next[s] ||= {})[d] ||= {})[o] = JSON.parse(valOf(k)) }
  console.log(`── ${scene} · Look "${look.id}": ${authored.size} authored slot(s) · ${moved.length} move · ${conflicts.length} CONFLICT(S) · ${orphaned.length} ORPHANED · ${dormant.length} dormant · after-faces with no before-match: ${unmatched} (${unmatchedM.toFixed(0)} m)`)
  for (const x of moved) console.log(`   ↪ ${x}`)
  for (const x of conflicts) console.log(`   ⛔ CONFLICT ${x}`)
  for (const x of orphaned) console.log(`   ⛔ ORPHANED ${x} — governed a face before, none after; its authoring would vanish`)
  for (const x of dormant) console.log(`   · DORMANT ${x} — governed no face even BEFORE this pour (an earlier relabel stranded it)${clobbered.includes(x) ? ` · ⚠️ a moved slot now lands on this key with a DIFFERENT value: the rendered value wins (was ${valOf(x)})` : (moved.some(m => m.endsWith(`→ ${x}`)) ? ' · a moved slot now lands on this key with the SAME value' : ' · carried over unchanged')}`)
  if (conflicts.length || orphaned.length) { refuse = true; continue }
  if (process.argv.includes('--write')) {
    if (!moved.length) { console.log('   nothing to move — design.json untouched'); continue }
    fs.writeFileSync(dP, JSON.stringify({ ...design, blockCustoms: next }, null, 2) + '\n')
    console.log(`   ✅ wrote ${dP.slice(ROOT.length)} — RELOAD any Designer page with this scene open before editing`)
  }
}
if (refuse) { console.log('\n⛔ Not written: resolve the conflicts / orphans with the operator first. Nothing was guessed.'); process.exit(1) }
if (!process.argv.includes('--write')) console.log('\n(dry run — add --write to apply)')
