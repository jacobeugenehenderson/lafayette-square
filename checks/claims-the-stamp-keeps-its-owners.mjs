// claims-the-stamp-keeps-its-owners.mjs — DOES STAMPING A TILE WITH ITS LAND USE LEAVE EVERY EDGE'S OWNER WHERE IT WAS,
// AND DOES EVERY CLASS BOUNDARY MEET THE BLOCK AT A VERTEX THE BLOCK HAS?
//
// ⭐ `stampTile` (src/lib/tileGround.js) writes the RAW land evidence's crossings INTO the block contours (iaFull, the struck
// one; iA, the cut one) and into the evidence — in the ① producer, on the UNCUT contours, before the circle cuts them — and
// the pieces are then cut into the stamped evidence (`evidenceByPiece`). ROADMAP A10's construction: one shared line, one
// vertex set. Two halves:
//   --selftest — the construction itself, on a stamped tile: (a) iaFull⁺ holds iaFull as an exact subsequence (nothing
//     moved, only vertices added); (b) every sub-edge of an original edge q carries iaStamp[q] (ownership by length
//     unchanged); (c) iaCorner's corners are the same ones; (d) iA⁺ holds every vertex of iA; (e) the crossing pass settles
//     (stampTile refuses by name if not); (f) no one-side crossing. MUTATION TEST: five breaches planted — a sub-edge given
//     another owner, an iA vertex lost, a corner flipped, a contour vertex moved, and the pieces cut from the UNSTAMPED
//     evidence (the cut before the stamp) — and each must be caught.
//   the towns — what the bake FROZE (shape.json, or a scratch slab by --dir): (f) on every stamped tile, every evidence-part
//     vertex within 5 mm of an iA edge is a vertex of iA, or a vertex of the poured evidence. One that is neither was made
//     by a cut and written to one side only — the class boundary meets the block off its line, and the strips cut there
//     fold or slit (HPDM 2026-10-14: 1,465 on interior edges before the stamp, 4 after). Split by where it lies: an
//     INTERIOR edge (the stamp's — RED) or a RIM edge (made by the circle cut, which writes its own crossing into iA only:
//     COUNTED, open as its own item). A shape frozen before the stamp (`evidenceStamped` absent) is RED by name — RE-FREEZE.
// ⭐ COUNTED, not judged: a POURED evidence vertex near the block edge that does not cross it (the parcel line and the block
// line are the same real line from two sources; the pour's ½-cm lattice). Open with the pour fix, as is the evidence's
// disjointness. ▶ checks/claims-the-land-is-painted-by-its-evidence.mjs.
//
//   node checks/claims-the-stamp-keeps-its-owners.mjs [town …] [--dir=<slab dir> --scene=<town>] [--selftest]
//     (reads public/baked/<town>/shape.json, or <dir>/shape.json, and cartograph/data/<town>/clean/ribbons.json)
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { stampTile, prepareEvidence, evidenceByPiece } from '../src/lib/tileGround.js'
import { LATTICE_M } from '../src/lib/lattice.js'

const NEAR_M = 0.005
const sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }

export function verify(st, s2) {
  const breach = []
  ;(st.iaFull || []).forEach((r, ri) => {
    const r2 = s2.iaFull?.[ri] || [], st0 = st.iaStamp?.[ri], st2 = s2.iaStamp?.[ri]
    let j = 0, q = -1; const sub = []
    for (let k = 0; k < r2.length; k++) { if (j < r.length && r2[k][0] === r[j][0] && r2[k][1] === r[j][1]) { q = j; j++; sub.push(q) } else sub.push(q) }
    if (j !== r.length) breach.push(`ring ${ri}: iaFull⁺ does not hold iaFull as a subsequence (${j} of ${r.length} vertices found in order)`)
    if (st0 && st2) sub.forEach((q0, k) => { const want = st0[(q0 + r.length) % r.length]; if (st2[k] !== want) breach.push(`ring ${ri} vertex ${k} (on edge ${q0}): owner ${st2[k]} ≠ ${want}`) })
    const c0 = (st.iaCorner?.[ri] || []).map((v, i) => v ? i : -1).filter(i => i >= 0)
    const c2 = (s2.iaCorner?.[ri] || []).map((v, i) => v ? sub[i] : -1).filter(i => i >= 0)
    if (c0.join() !== c2.join()) breach.push(`ring ${ri}: corners at ${c0.join(',')} → ${c2.join(',')}`)
  })
  ;(st.iA || []).forEach((r, ri) => { const keys = new Set((s2.iA?.[ri] || []).map(v => v.join(','))); const lost = r.filter(v => !keys.has(v.join(','))).length
    if (lost) breach.push(`iA ring ${ri}: ${lost} vertex(es) lost`) })
  return breach
}
// (f): the cut's evidence parts against iA — { oneSide: [vertices a cut made off the line, with `rim`], poured: count }.
// `onRim(a, b)`: whether iA's edge a→b lies on the circle (both ends within one lattice step of the boundary ring's line).
export function crossingsShared(iA, parts, groups, onRim = () => false) {
  const keys = new Set(iA.flat().map(v => v.join(','))), raw = new Set(groups.flatMap(g => g.rings.flatMap(x => (x.r || x).map(v => v.join(',')))))
  const oneSide = []; let poured = 0
  for (const e of (parts || []).flatMap(l => l || [])) for (const r of e.rings) for (const p of r) { if (keys.has(p.join(','))) continue
    let d = Infinity, ea = null, eb = null
    for (const ring of iA) for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length], dd = sd(p, a, b); if (dd < d) { d = dd; ea = a; eb = b } }
    if (!(d > 0 && d <= NEAR_M)) continue
    if (raw.has(p.join(','))) poured++; else oneSide.push({ p, mm: +(d * 1000).toFixed(3), rim: onRim(ea, eb) }) }
  return { oneSide, poured }
}
export function rimOf(boundary) {
  const B = boundary || []
  const near = p => { for (let k = 0; k < B.length; k++) if (sd(p, B[k], B[(k + 1) % B.length]) <= LATTICE_M) return true; return false }
  return (a, b) => near(a) && near(b)
}
function cut(st, groups) {
  const { tile, groups: g } = stampTile(st, groups)
  return { tile, groups: g, parts: evidenceByPiece(tile.iA, g, null) }
}

function selftest() {
  const sq = (x, z, w, h) => [[x, z], [x + w, z], [x + w, z + h], [x, z + h]]
  const block = sq(0, 0, 40, 30)
  const st = { iA: [block], iaFull: [block], iaStamp: [[0, 1, 2, 3]], iaArc: [[null, null, null, null]], iaCorner: [[true, true, true, true]],
    iaJunction: [[null, null, null, null]] }
  // a commercial region whose west line crosses the block's top and bottom edges off the lattice (17.3 → 22.7 m)
  const groups = prepareEvidence([{ lu: 'commercial', src: 'osm', rings: [[[17.3, -10], [60, -10], [60, 50], [22.7, 50]]] }])
  const { tile: s2, groups: g2, parts } = cut(st, groups), clean = verify(st, s2), f = crossingsShared(s2.iA, parts, g2)
  const added = s2.iaFull[0].length - block.length
  const ins = s2.iaFull[0].findIndex(v => !block.some(w => w[0] === v[0] && w[1] === v[1]))
  const plant = {
    'a sub-edge given another owner': () => verify(st, { ...s2, iaStamp: [s2.iaStamp[0].map((v, i) => i === ins ? 99 : v)] }),
    'an original iA vertex lost': () => verify(st, { ...s2, iA: [s2.iA[0].filter(v => !(v[0] === block[1][0] && v[1] === block[1][1]))] }),
    'a corner flipped': () => verify(st, { ...s2, iaCorner: [s2.iaCorner[0].map((v, i) => i === ins ? true : v)] }),
    'a contour vertex moved': () => verify(st, { ...s2, iaFull: [s2.iaFull[0].map((v, i) => i === 0 ? [v[0] + LATTICE_M, v[1]] : v)] }),
    // the cut before the stamp: block unstamped, pieces cut from the raw evidence
    'the pieces cut from the UNSTAMPED evidence': () => crossingsShared(st.iA, evidenceByPiece(st.iA, groups, null), groups).oneSide.map(v => `one-side ${v.p.join(',')}`),
  }
  let bad = 0
  const ok0 = !clean.length && !f.oneSide.length && added > 0 && ins >= 0; if (!ok0) bad++
  console.log(`  ${ok0 ? '✅' : '⛔'} a stamped tile (${added} vertices added where its land use crosses the block): ${clean.length || f.oneSide.length ? [...clean, ...f.oneSide.map(v => `one-side ${v.p.join(',')}`)].join(' · ') : 'owners, corners, contours intact; every crossing shared'}`)
  for (const [name, fn] of Object.entries(plant)) { const got = fn().length > 0; if (!got) bad++
    console.log(`  ${got ? '✅' : '⛔'} planted — ${name}: ${got ? 'caught' : 'NOT caught'}`) }
  return bad
}

if (process.argv.includes('--selftest')) process.exit(selftest() ? 1 : 0)
const { scenes, ROOT } = await import('./_scenes.mjs')
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const DIR = arg('dir')
if (DIR && !arg('scene')) { console.error('--dir needs --scene=<town> (whose poured evidence and circle to read)'); process.exit(2) }
const towns = DIR ? [arg('scene')] : scenes('public/baked/<scene>/shape.json')
let bad = 0
for (const town of towns) {
  const rib = join(ROOT, 'cartograph/data', town, 'clean/ribbons.json')
  if (!existsSync(rib)) { console.log(`⚪ ${town.padEnd(18)} NOT CHECKED — no ${rib.slice(ROOT.length + 1)}`); continue }
  const R = JSON.parse(readFileSync(rib, 'utf8')), groups = prepareEvidence(R.landEvidence)
  if (!groups) { console.log(`⚪ ${town.padEnd(18)} NOT CHECKED — its pour carries no land evidence`); continue }
  const shape = DIR ? join(DIR, 'shape.json') : join(ROOT, 'public/baked', town, 'shape.json')
  const T = JSON.parse(readFileSync(shape, 'utf8')).tiles, onRim = rimOf(R.protopolygon?.boundaryRing)
  const withEv = T.filter(t => Array.isArray(t?.evidenceByPiece))
  if (!withEv.length) { console.log(`⚪ ${town.padEnd(18)} NOT CHECKED — no tile carries evidence parts`); continue }
  const unstamped = withEv.filter(t => !t.evidenceStamped).length
  if (unstamped) { bad++; console.log(`⛔ ${town.padEnd(18)} ${unstamped} of ${withEv.length} tile(s) were frozen BEFORE the land-use stamp (\`evidenceStamped\` absent) — their pieces were cut from the raw evidence, so every class boundary meets the block off its line. RE-FREEZE (re-bake).`); continue }
  let interior = 0, rim = 0, poured = 0; const at = []
  for (const [ti, t] of T.entries()) { if (!Array.isArray(t?.evidenceByPiece)) continue
    const f = crossingsShared(t.iA, t.evidenceByPiece, groups, onRim); poured += f.poured
    for (const v of f.oneSide) { if (v.rim) rim++; else { interior++; if (at.length < 6) at.push(`tile ${ti}: a class boundary meets the block OFF its line at ${v.p.join(',')} (${v.mm} mm) — a one-side crossing`) } } }
  if (interior) bad++
  console.log(`${interior ? '⛔' : '✅'} ${town.padEnd(18)} ${withEv.length} stamped tile(s) · one-side crossings on block edges ${interior} · on rim edges ${rim} (the circle cut's; counted) · poured evidence vertices ≤ ${NEAR_M * 1000} mm off the block, not crossing it: ${poured} (the pour's; counted)`)
  for (const b of at) console.log('     ' + b)
  if (interior) console.log(`     ⛔ OPEN (boarded): one-side vertices on block edges after the stamp — at HPDM tile 1 the stamp wrote the crossing into both rings and Clipper's intersection emitted the part's vertex 3 mm from it, on the block line: its integer TopX at a scanline where two edges converge on a shared vertex at ~2° registers a false crossing. Measured there and in crossing-premise trial 754; per vertex here, cause not established.`)
}
process.exit(bad ? 1 : 0)
