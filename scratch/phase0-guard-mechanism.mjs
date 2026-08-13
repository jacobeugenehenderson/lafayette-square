// (Tally, 2026-08-13) — TEST GATE 1's STATED MECHANISM, NOT ITS COUNT.
//
// RIBBONS §1 gate 1 makes a causal claim about the case-C no-island tiles:
//   "The 8 tiles with no island are ONE class, not eight: narrow gores whose
//    width is less than the sum of the two facing pavementHW — the two
//    carriageways' asphalt overlaps and annihilates the land between them
//    (8/8; the 8 narrowest tiles, 2.39-7.48 m)."
//
// The instrument today reports NINE such tiles, and the largest is 81,698 m2
// with 77 vertices — which cannot be a 2.39-7.48 m gore. So the
// CHARACTERISATION is already false. This probe tests the CAUSE, per tile:
//
//   for each no-island tile, walk its ring; at each vertex measure the tile's
//   local width (the shortest chord across the ring, i.e. the distance to the
//   nearest NON-ADJACENT ring edge) and compare it against the sum of the
//   authored pavementHW of the two chains facing across it. The mechanism
//   predicts width < hwA + hwB EVERYWHERE along the tile — that is what makes
//   the asphalt annihilate the land.
//
// It also asks the direct question, which needs no model at all:
//   is the tile's ring actually COVERED by the asphalt union? If the mechanism
//   holds, tile area minus (tile AND asphalt) is ~0. That is the ground truth
//   and it is what decides this.
//
// ⛔ Authoring loaded (design.json blockCustoms), case C settings exactly:
//    grade-sep EXCLUDED, stencil = raw boundary.
//
//   node scratch/phase0-guard-mechanism.mjs
//
import fs from 'fs'
const o = console.log; console.log = () => {}
const { buildBlockGeometryV2 } = await import('../src/lib/buildBlockGeometryV2.js')
console.log = o

const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const nb = JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json', 'utf8'))
const design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8'))
const crypto = await import('crypto')
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 10)

const [cx, cz] = nb.center
const stencilRaw = nb.boundary.map(([x, z]) => [cx + (x - cx), cz + (z - cz)])
const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2 }
const centroid = (r) => { let x = 0, z = 0, a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += f; x += (r[j][0] + r[i][0]) * f; z += (r[j][1] + r[i][1]) * f } a *= 3; return a ? [x / a, z / a] : r[0] }
const inRing = (p, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) ins = !ins } return ins }
function isStencilContour(r, s) {
  if (Math.abs(r.length - s.length) > 2) return false
  const S = new Set(s.map(p => p[0].toFixed(3) + ',' + p[1].toFixed(3)))
  let h = 0; for (const p of r) if (S.has(p[0].toFixed(3) + ',' + p[1].toFixed(3))) h++
  return h / r.length > 0.95
}
// distance from p to segment ab
function dSeg(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const L = dx * dx + dz * dz
  let t = L > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))
}

const noGrade = (ribbons.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
const byId = new Map(noGrade.map(s => [s.skelId, s]))
const bc = design.blockCustoms || {}
const hwOf = (skelId) => {
  const s = byId.get(skelId); if (!s) return null
  const c = bc[skelId] || null
  const pick = (side) => {
    let hw = s.measure?.[side]?.pavementHW || 0
    if (c && c[side]) for (const k of Object.keys(c[side])) { const v = { ...(s.measure?.[side] || {}), ...c[side][k] }.pavementHW; if (Number.isFinite(v)) hw = Math.max(hw, v) }
    return hw
  }
  return { left: pick('left'), right: pick('right'), max: Math.max(pick('left'), pick('right')) }
}

o('═══ INPUTS (state the artifact — gate 2 says shape.json moved uncommitted) ═══')
o(`  src/data/ribbons.json ................ sha256:${hash('src/data/ribbons.json')}`)
o(`  design.json .......................... sha256:${hash('public/looks/lafayette-square/design.json')}   (${Object.keys(bc).length} authored streets)`)
o(`  neighborhood_boundary.json ........... sha256:${hash('cartograph/data/lafayette-square/neighborhood_boundary.json')}`)
const shapePath = 'public/baked/lafayette-square/shape.json'
o(`  shape.json ........................... ${fs.existsSync(shapePath) ? 'sha256:' + hash(shapePath) : 'ABSENT'}`)
o(`  ⭐ case C reads NONE of shape.json — it compares punch-out islands against`)
o(`     ribbons.tiles[] in src/data/ribbons.json. A mid-session shape.json move`)
o(`     cannot explain a case-C drift.`)

const c0 = console.log; console.log = () => {}
const v2 = buildBlockGeometryV2({ ...ribbons, streets: noGrade }, {
  stencil: stencilRaw, blockCustoms: bc, curbWidth: design.curbWidth ?? 0.15,
  blockLandUse: design.blockLandUse, __debugRings: true,
})
console.log = c0
const rings = v2.__blockRings || []
const sign = Math.sign(area(stencilRaw))
const outer = rings.find(r => isStencilContour(r, stencilRaw))
const islands = rings.filter(r => r !== outer && Math.sign(area(r)) === sign && Math.abs(area(r)) > 1)

const frozen = (ribbons.tiles || []).map((t, i) => ({
  i, ring: t.ring, a: Math.abs(area(t.ring)), c: centroid(t.ring),
  edges: [...new Set((t.edges || []).map(r => r.skelId).filter(Boolean))],
}))
const claim = new Map()
for (const isl of islands) { const c = centroid(isl); const h = frozen.find(f => inRing(c, f.ring)); if (h) { if (!claim.has(h.i)) claim.set(h.i, []); claim.get(h.i).push(isl) } }
const noIsland = frozen.filter(f => !claim.has(f.i)).sort((a, b) => b.a - a.a)
const splits = [...claim.entries()].filter(([, v]) => v.length > 1)

o(`\n═══ CASE C, RE-DERIVED ═══`)
o(`  islands ${islands.length} · frozen tiles ${frozen.length} · tiles with NO island ${noIsland.length} · SPLIT ${splits.length}`)

o(`\n═══ 1. THE MECHANISM, TILE BY TILE ═══`)
o(`  claim: "narrow gore, width < sum of the two facing pavementHW, the asphalt`)
o(`  annihilates the land". Local width = shortest distance from each ring vertex`)
o(`  to a NON-ADJACENT ring edge (the chord across the tile).`)
o('')
o(`  ⛔ THIS SECTION DOES NOT DECIDE. §2 does. maxW is the tile's LONG axis, not`)
o(`  its width; medW is the narrow dimension. Reported as evidence only.`)
o('')
o(`  tile      area m2   minW    medW    maxW   sum(hw)   medW vs sum(hw)`)
for (const f of noIsland) {
  const R = f.ring, n = R.length
  const W = []
  for (let i = 0; i < n; i++) {
    let best = Infinity
    for (let j = 0; j < n; j++) {
      if (j === i || (j + 1) % n === i || j === (i + 1) % n) continue
      const d = dSeg(R[i], R[j], R[(j + 1) % n]); if (d < best) best = d
    }
    if (Number.isFinite(best)) W.push(best)
  }
  W.sort((a, b) => a - b)
  const minW = W[0] ?? NaN, medW = W[(W.length / 2) | 0] ?? NaN, maxW = W[W.length - 1] ?? NaN
  const hws = f.edges.map(e => hwOf(e)).filter(Boolean).map(h => h.max).sort((a, b) => b - a)
  const sumTop2 = (hws[0] || 0) + (hws[1] || 0)
  // ⛔ maxW IS A BAD PROXY and this line used to report a verdict off it.
  // The vertex-to-non-adjacent-edge chord at a tile's ENDS returns the LONG
  // axis, not the width, so maxW says "not a gore" for tiles §2 proves are
  // 100% swallowed. medW is the narrow dimension. ⭐ Neither decides anything:
  // §2 is the ground truth. These columns are reported as evidence, not verdict.
  const verdict = !Number.isFinite(medW) ? 'no width' : (medW < sumTop2 ? 'medW < sum(hw)' : 'medW >= sum(hw)')
  o(`  #${String(f.i).padStart(3)} ${f.a.toFixed(0).padStart(9)}  ${minW.toFixed(2).padStart(6)}  ${medW.toFixed(2).padStart(6)}  ${maxW.toFixed(2).padStart(6)}   ${sumTop2.toFixed(2).padStart(6)}   ${verdict}`)
  o(`        edges [${f.edges.join(' | ')}]`)
}

o(`\n═══ 2. THE GROUND TRUTH — is the tile actually swallowed by asphalt? ═══`)
o(`  No model. Sample the tile's interior on a grid; a point is SWALLOWED if it`)
o(`  is inside no punch-out island. The mechanism predicts ~100% swallowed.`)
o('')
o(`  tile      area m2   interior pts   swallowed   %      VERDICT`)
for (const f of noIsland) {
  let lo = [1e18, 1e18], hi = [-1e18, -1e18]
  for (const p of f.ring) { lo[0] = Math.min(lo[0], p[0]); lo[1] = Math.min(lo[1], p[1]); hi[0] = Math.max(hi[0], p[0]); hi[1] = Math.max(hi[1], p[1]) }
  const STEP = Math.max(0.5, Math.min(4, Math.sqrt(f.a) / 40))
  let inside = 0, swallowed = 0
  for (let x = lo[0]; x <= hi[0]; x += STEP) for (let z = lo[1]; z <= hi[1]; z += STEP) {
    const p = [x, z]
    if (!inRing(p, f.ring)) continue
    inside++
    if (!islands.some(r => inRing(p, r))) swallowed++
  }
  const pct = inside ? 100 * swallowed / inside : NaN
  const verdict = !inside ? 'too thin to sample' : pct > 95 ? 'SWALLOWED — mechanism HOLDS' : pct < 50 ? '⛔ NOT SWALLOWED — mechanism FAILS' : '⚠️ PARTIAL'
  o(`  #${String(f.i).padStart(3)} ${f.a.toFixed(0).padStart(9)}   ${String(inside).padStart(8)}   ${String(swallowed).padStart(9)}  ${(pct).toFixed(1).padStart(5)}   ${verdict}`)
}

o(`\n═══ 3. THE SPLIT — is tile#17 a defect, or a naming artifact? ═══`)
for (const [k, v] of splits) {
  const f = frozen.find(x => x.i === k)
  o(`  frozen tile #${k}   area ${f.a.toFixed(0)} m2   edges [${f.edges.join(' | ')}]`)
  o(`    claimed by ${v.length} islands:`)
  for (const isl of v) {
    const a = Math.abs(area(isl))
    const c = centroid(isl)
    o(`      area ${a.toFixed(1).padStart(10)} m2   verts ${String(isl.length).padStart(4)}   centroid ${c[0].toFixed(1)},${c[1].toFixed(1)}   ${(100 * a / f.a).toFixed(1)}% of the tile`)
  }
  const tot = v.reduce((s, r) => s + Math.abs(area(r)), 0)
  o(`    islands sum to ${tot.toFixed(1)} m2 = ${(100 * tot / f.a).toFixed(1)}% of the frozen tile`)
  o(`    ⇒ a SPLIT means one frozen tile is cut into ${v.length} pieces by the punch.`)
  o(`      If one piece is a sliver, this is a boolean artifact; if both are`)
  o(`      substantial, the punch genuinely re-topologises this tile.`)
}

o(`\n═══ 4. IS THE MATCHING RULE ITSELF THE DEFECT? ═══`)
o(`  reconcile-punchout-vs-faces.mjs assigns an island to a tile by ISLAND`)
o(`  CENTROID INSIDE TILE RING. For a large NON-CONVEX island the centroid can`)
o(`  fall outside its own footprint, or inside a different tile. That single`)
o(`  mis-assignment shows up TWICE: as a phantom SPLIT (two islands claiming one`)
o(`  tile) and as a phantom NO-ISLAND (the real owner left unclaimed).`)
o(`  Re-match by DOMINANT AREA OVERLAP instead and see which survives.`)

// Monte-Carlo overlap: sample each island, count which tile each sample lands in.
function overlapMatch(isl) {
  let lo = [1e18, 1e18], hi = [-1e18, -1e18]
  for (const p of isl) { lo[0] = Math.min(lo[0], p[0]); lo[1] = Math.min(lo[1], p[1]); hi[0] = Math.max(hi[0], p[0]); hi[1] = Math.max(hi[1], p[1]) }
  const A = Math.abs(area(isl))
  const STEP = Math.max(0.5, Math.sqrt(A) / 45)
  const tally = new Map(); let n = 0
  for (let x = lo[0]; x <= hi[0]; x += STEP) for (let z = lo[1]; z <= hi[1]; z += STEP) {
    const p = [x, z]
    if (!inRing(p, isl)) continue
    n++
    const h = frozen.find(f => inRing(p, f.ring))
    if (h) tally.set(h.i, (tally.get(h.i) || 0) + 1)
  }
  const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
  return { n, best, tally }
}
const claim2 = new Map()
let unmatched2 = 0
for (const isl of islands) {
  const { n, best } = overlapMatch(isl)
  if (!best || !n) { unmatched2++; continue }
  if (!claim2.has(best[0])) claim2.set(best[0], [])
  claim2.get(best[0]).push(isl)
}
const noIsland2 = frozen.filter(f => !claim2.has(f.i))
const splits2 = [...claim2.entries()].filter(([, v]) => v.length > 1)
o('')
o(`  matching rule            islands   straddlers   SPLIT   NO-ISLAND`)
o(`  centroid-in-tile (today)  ${String(islands.length).padStart(6)}   ${String(islands.length - [...claim.values()].flat().length).padStart(10)}   ${String(splits.length).padStart(5)}   ${String(noIsland.length).padStart(9)}`)
o(`  dominant area overlap     ${String(islands.length).padStart(6)}   ${String(unmatched2).padStart(10)}   ${String(splits2.length).padStart(5)}   ${String(noIsland2.length).padStart(9)}`)
o('')
o(`  tiles with NO island under AREA matching: ${noIsland2.map(f => '#' + f.i + ' (' + f.a.toFixed(0) + ' m2)').join(', ') || 'none'}`)
o(`  SPLIT tiles under AREA matching:          ${splits2.map(([k, v]) => '#' + k + ' x' + v.length).join(', ') || 'none'}`)
o('')
o(`  ── where tile#3 and tile#17 actually sit:`)
for (const isl of islands) {
  const { best, tally, n } = overlapMatch(isl)
  if (!tally.has(3) && !tally.has(17)) continue
  const A = Math.abs(area(isl))
  const c = centroid(isl)
  o(`    island ${A.toFixed(0).padStart(7)} m2  verts ${String(isl.length).padStart(3)}  centroid falls in tile ${String((frozen.find(f => inRing(c, f.ring)) || {}).i ?? 'NONE').padStart(4)}  |  area-dominant tile ${String(best?.[0]).padStart(4)} (${(100 * best?.[1] / n).toFixed(0)}%)  share in #3 ${(100 * (tally.get(3) || 0) / n).toFixed(0)}%  in #17 ${(100 * (tally.get(17) || 0) / n).toFixed(0)}%`)
}
