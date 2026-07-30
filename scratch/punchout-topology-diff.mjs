// punchout-topology-diff.mjs — what does punch-out ACTUALLY change about the map?
//
// Answers the C2 question ("~115 punch-out rings vs 101 frozen faces is unexplained")
// by diffing the two topologies directly instead of comparing counts:
//   1. ring inventory — outer rings vs holes, and the annulus pair that is ONE region
//   2. a grid overlay — every frozen face classified as survives / splits / disappears
//
// ⛔ Counting rings is not comparing maps. `blockSharp` is a Clipper result: outer rings
// and holes are both "rings", and the disc's own annulus contributes two of them.
//   node scratch/punchout-topology-diff.mjs [gridStep=3]
import fs from 'fs'

const STEP = Number(process.argv[2] || 3)
const o = console.log; console.log = () => {}
const { buildBlockGeometryV2 } = await import('../src/lib/buildBlockGeometryV2.js')
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const nb = JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json', 'utf8'))
let design = {}; try { design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8')) } catch {}
const sc0 = ((nb?.streetFade?.outer ?? nb.radius) + 50) / nb.radius
const [cx, cz] = nb.center
const stencil = nb.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const v2 = buildBlockGeometryV2(ribbons, {
  stencil, blockCustoms: design.blockCustoms || null, curbWidth: design.curbWidth ?? 0.15,
  blockLandUse: design.blockLandUse, __debugRings: true,
})
console.log = o

const rings = v2.__blockRings || []          // blockSharp = differenceRings([stencil], asphaltSharp) — the LOOSE variant
const tiles = (ribbons.tiles || []).map(t => t.ring)
const sA = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2 }
const bb = (r) => { let x0 = 1 / 0, y0 = 1 / 0, x1 = -1 / 0, y1 = -1 / 0; for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1] } return { x0, y0, x1, y1 } }
const inR = (r, x, y) => { let s = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) s = !s } return s }

// ── 1. the ring inventory ────────────────────────────────────────────────────
const R = rings.map((r, i) => ({ i, r, b: bb(r), sa: sA(r), a: Math.abs(sA(r)) }))
const outer = R.filter(q => q.sa < 0), holes = R.filter(q => q.sa > 0)
const bySize = [...R].sort((a, b) => b.a - a.a)
const discOuter = bySize[0], annulusHole = bySize[1]        // the two boundaries of ONE region
const ANN = new Set([discOuter.i, annulusHole.i])
const blocks = R.filter(q => !ANN.has(q.i))

console.log(`── ring inventory (blockSharp = stencil − asphaltSharp, the LOOSE variant) ──`)
console.log(`rings: ${rings.length} = ${outer.length} OUTER + ${holes.length} HOLES`)
console.log(`⭐ two of them are ONE region — the annulus between the outermost streets and the stencil rim:`)
console.log(`   outer ${discOuter.a.toFixed(0)} m2 (the disc) − hole ${annulusHole.a.toFixed(0)} m2 = ${(discOuter.a - annulusHole.a).toFixed(0)} m2 of actual ground`)
console.log(`   ⛔ that hole is NOT "the road union being subtracted" — it is the annulus's inner boundary`)
console.log(`⇒ candidate BLOCK rings: ${blocks.length}`)
console.log(`   >=1000 m2: ${blocks.filter(q => q.a >= 1000).length}   100–1000: ${blocks.filter(q => q.a >= 100 && q.a < 1000).length}   <100 m2 (crumbs): ${blocks.filter(q => q.a < 100).length}`)
let maxT = 0; for (const t of tiles) for (const p of t) maxT = Math.max(maxT, Math.hypot(p[0], p[1]))
console.log(`   stencil radius ≈ ${Math.hypot(stencil[0][0] - cx, stencil[0][1] - cz).toFixed(0)} m; frozen faces reach only ${maxT.toFixed(0)} m ⇒ a periphery band the face graph never had`)

// ── 2. the grid overlay ──────────────────────────────────────────────────────
const T = tiles.map((r, i) => ({ i, r, b: bb(r), a: Math.abs(sA(r)) }))
let x0 = 1 / 0, y0 = 1 / 0, x1 = -1 / 0, y1 = -1 / 0
for (const t of T) { x0 = Math.min(x0, t.b.x0); y0 = Math.min(y0, t.b.y0); x1 = Math.max(x1, t.b.x1); y1 = Math.max(y1, t.b.y1) }
const cell = STEP * STEP
const tileArea = new Map(), ringArea = new Map(), pairArea = new Map()
let tileOnly = 0, ringOnly = 0, both = 0
for (let x = x0; x <= x1; x += STEP) for (let y = y0; y <= y1; y += STEP) {
  let ti = -1
  for (const t of T) { if (x < t.b.x0 || x > t.b.x1 || y < t.b.y0 || y > t.b.y1) continue; if (inR(t.r, x, y)) { ti = t.i; break } }
  let ri = -1
  for (const q of blocks) { if (x < q.b.x0 || x > q.b.x1 || y < q.b.y0 || y > q.b.y1) continue; if (inR(q.r, x, y)) { ri = q.i; break } }
  // ⭐ the ANNULUS is a real punch-out region (disc outer MINUS its hole), not a non-place:
  // at the map edge the street network never closes a ring, so the peripheral blocks are
  // continuous with the ground outside the outermost streets and merge into ONE region.
  if (ri < 0 && inR(discOuter.r, x, y) && !inR(annulusHole.r, x, y)) ri = -2
  if (ti >= 0) tileArea.set(ti, (tileArea.get(ti) || 0) + cell)
  if (ri !== -1) ringArea.set(ri, (ringArea.get(ri) || 0) + cell)
  if (ti >= 0 && ri !== -1) { both += cell; const k = ti + '|' + ri; pairArea.set(k, (pairArea.get(k) || 0) + cell) }
  else if (ti >= 0) tileOnly += cell
  else if (ri !== -1) ringOnly += cell
}
console.log(`\n── grid overlay at ${STEP} m ──`)
console.log(`frozen-face ground PUNCHED AWAY (the road width — expected, faces are centerline-to-centerline): ${tileOnly.toLocaleString()} m2`)
console.log(`punch-out ground OUTSIDE every frozen face (the periphery band):                                 ${ringOnly.toLocaleString()} m2`)
console.log(`ground in both:                                                                                 ${both.toLocaleString()} m2`)

const perTile = new Map()
for (const [k, a] of pairArea) { const [ti, ri] = k.split('|').map(Number); if (!perTile.has(ti)) perTile.set(ti, []); perTile.get(ti).push([ri, a]) }
let survives = 0, splits = 0, gone = 0, absorbed = 0
const splitRows = [], goneRows = [], absorbedRows = []
for (const t of T) {
  const ta = tileArea.get(t.i) || 0
  if (!ta) continue
  const parts = (perTile.get(t.i) || []).filter(([, a]) => a >= Math.max(50, ta * 0.05))
  const annShare = (perTile.get(t.i) || []).filter(([r]) => r === -2).reduce((s2, [, a]) => s2 + a, 0) / ta
  if (annShare >= 0.5) { absorbed++; absorbedRows.push(`  tile#${t.i} ${ta.toLocaleString()} m2 — ${(annShare * 100).toFixed(0)}% in the annulus`) }
  else if (parts.length === 0) { gone++; goneRows.push(`  tile#${t.i} ${ta.toLocaleString()} m2`) }
  else if (parts.length === 1) survives++
  else { splits++; splitRows.push(`  tile#${t.i} → ${parts.length} parts (face ${ta.toLocaleString()} m2)  ${parts.map(([r, a]) => `#${r === -2 ? 'ANNULUS' : r}:${(a / ta * 100).toFixed(0)}%`).join(' ')}`) }
}
console.log(`\n── what happens to each of the ${T.length} frozen faces ──`)
console.log(`survives as exactly ONE block: ${survives}`)
console.log(`SPLITS into 2+ blocks:         ${splits}`)
console.log(`ABSORBED into the ANNULUS:     ${absorbed}   ⛔ merged with the periphery — no longer its own block`)
console.log(`DISAPPEARS (all asphalt):      ${gone}   ⛔ these are clickable today`)
if (splitRows.length) console.log(splitRows.join('\n'))
if (absorbedRows.length) console.log(absorbedRows.slice(0, 40).join('\n'))
if (goneRows.length) console.log(goneRows.slice(0, 30).join('\n'))

let orphan = 0
for (const q of blocks) {
  const ra = ringArea.get(q.i) || 0
  if (!ra) { orphan++; continue }
  const tot = [...pairArea].filter(([k]) => k.endsWith('|' + q.i)).reduce((s, [, a]) => s + a, 0)
  if (tot < ra * 0.5) orphan++
}
console.log(`\npunch-out blocks lying mostly OUTSIDE any frozen face: ${orphan}`)
console.log(`\n⭐ The two topologies are not off-by-N — they are different maps. Parity is a CHANGE BUDGET, not a gate.`)
