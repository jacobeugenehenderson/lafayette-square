// PHASE 0 (Tally, 2026-08-13) — why has the case-C regression guard drifted?
//
// RIBBONS §1 gate 1 records, measured 2026-08-12 (Quire, re-verified Tessel):
//   "Case C (grade-sep excluded, raw boundary, authoring loaded):
//    93 islands <-> 101 tiles, a CLEAN INJECTION - 0 merges, 0 splits, 0 straddlers"
//   "The 8 tiles with no island are ONE class ... the 8 narrowest tiles, 2.39-7.48 m"
//
// Re-run of scratch/reconcile-punchout-vs-faces.mjs on 2026-08-13 HEAD reports
// case C as: 93 islands, 0 straddlers, but SPLIT 1 and NO-ISLAND 9.
//
// Two things moved after 2026-08-12 and both are inputs to case C:
//   design.json            75c67487  (today's authoring session)
//   buildBlockGeometryV2.js de7fcba5  (innerEdgeMeasure excision)
// This probe holds the code fixed at HEAD and swaps ONLY design.json, so it
// isolates the AUTHORING contribution from the CODE contribution.
//
//   node scratch/phase0-guard-bisect.mjs
//
import fs from 'fs'
import { execSync } from 'child_process'
const o = console.log; console.log = () => {}
const { buildBlockGeometryV2 } = await import('../src/lib/buildBlockGeometryV2.js')
console.log = o

const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const nb = JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json', 'utf8'))
const DESIGN = 'public/looks/lafayette-square/design.json'

const revs = [
  ['HEAD (75c67487 authoring session)', null],
  ['ba655686 (the 2026-08-12 state)', 'ba655686'],
]

const [cx, cz] = nb.center
const stencilRaw = nb.boundary.map(([x, z]) => [cx + (x - cx) * 1, cz + (z - cz) * 1])
const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2 }
const centroid = (r) => { let x = 0, z = 0, a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += f; x += (r[j][0] + r[i][0]) * f; z += (r[j][1] + r[i][1]) * f } a *= 3; return a ? [x / a, z / a] : r[0] }
const inRing = (p, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) ins = !ins } return ins }
const bbox = (r) => { let a = 1e18, b = 1e18, c = -1e18, d = -1e18; for (const p of r) { if (p[0] < a) a = p[0]; if (p[1] < b) b = p[1]; if (p[0] > c) c = p[0]; if (p[1] > d) d = p[1] } return [a, b, c, d] }
const perim = (r) => { let L = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) L += Math.hypot(r[i][0] - r[j][0], r[i][1] - r[j][1]); return L }
// thickness proxy used by the reconcile probe: 4A/P for a long thin quad
const thick = (r) => 4 * Math.abs(area(r)) / Math.max(perim(r), 1e-9)
function isStencilContour(r, stencil) {
  if (Math.abs(r.length - stencil.length) > 2) return false
  const s = new Set(stencil.map(p => p[0].toFixed(3) + ',' + p[1].toFixed(3)))
  let hit = 0; for (const p of r) if (s.has(p[0].toFixed(3) + ',' + p[1].toFixed(3))) hit++
  return hit / r.length > 0.95
}

const noGrade = (ribbons.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
const frozen = (ribbons.tiles || []).map((t, i) => ({ i, ring: t.ring, a: Math.abs(area(t.ring)), c: centroid(t.ring), edges: [...new Set((t.runs || []).map(r => r.skelId))] }))

function caseC(design, label) {
  const c0 = console.log; console.log = () => {}
  const v2 = buildBlockGeometryV2({ ...ribbons, streets: noGrade }, {
    stencil: stencilRaw,
    blockCustoms: design.blockCustoms || null,
    curbWidth: design.curbWidth ?? 0.15,
    blockLandUse: design.blockLandUse,
    __debugRings: true,
  })
  console.log = c0
  const rings = v2.__blockRings || []
  const rec = rings.map((r, i) => ({ i, r, a: area(r) }))
  const outer = rec.find(x => isStencilContour(x.r, stencilRaw))
  const sign = Math.sign(area(stencilRaw))
  const islands = rec.filter(x => x !== outer && Math.sign(x.a) === sign && Math.abs(x.a) > 1)

  // island -> frozen tile by centroid containment (same rule as the reconcile probe)
  const claim = new Map()   // frozen idx -> [island idx]
  let straddle = 0
  for (const isl of islands) {
    const c = centroid(isl.r)
    const hit = frozen.find(f => inRing(c, f.ring))
    if (!hit) { straddle++; continue }
    if (!claim.has(hit.i)) claim.set(hit.i, [])
    claim.get(hit.i).push(isl)
  }
  const splits = [...claim.entries()].filter(([, v]) => v.length > 1)
  const noIsland = frozen.filter(f => !claim.has(f.i))

  o(`\n── ${label}`)
  o(`   blockCustoms streets ....... ${Object.keys(design.blockCustoms || {}).length}`)
  o(`   islands (>1 m2) ............ ${islands.length}`)
  o(`   straddlers (in no tile) .... ${straddle}`)
  o(`   SPLIT tiles (>1 island) .... ${splits.length}${splits.length ? '   ' + splits.map(([k, v]) => `tile#${k}x${v.length}`).join(' ') : ''}`)
  o(`   tiles with NO island ....... ${noIsland.length}`)
  for (const f of noIsland.sort((a, b) => b.a - a.a)) {
    o(`       tile#${String(f.i).padStart(3)}  ${f.a.toFixed(1).padStart(9)} m2  thick~${thick(f.ring).toFixed(2).padStart(6)} m  verts ${String(f.ring.length).padStart(3)}  [${f.edges.join('|')}]`)
  }
  return { islands: islands.length, straddle, splits: splits.length, noIsland: noIsland.length, noIslandIdx: new Set(noIsland.map(f => f.i)), splitIdx: new Set(splits.map(([k]) => k)) }
}

o('═══ CASE C, code held at HEAD, ONLY design.json swapped ═══')
o(`ribbons.streets (no grade-sep) . ${noGrade.length}`)
o(`frozen tiles ................... ${frozen.length}`)
o('⛔ canon (RIBBONS §1 gate 1, 2026-08-12): 93 islands, 0 straddlers, 0 splits, 8 tiles with no island')

const out = []
for (const [label, rev] of revs) {
  const txt = rev ? execSync(`git show ${rev}:${DESIGN}`, { maxBuffer: 1 << 28 }).toString() : fs.readFileSync(DESIGN, 'utf8')
  out.push([label, caseC(JSON.parse(txt), label)])
}

o('\n═══ DELTA ═══')
const [[, A], [, B]] = out
o(`   islands  ${B.islands} → ${A.islands}`)
o(`   splits   ${B.splits} → ${A.splits}`)
o(`   noIsland ${B.noIsland} → ${A.noIsland}`)
const gained = [...A.noIslandIdx].filter(i => !B.noIslandIdx.has(i))
const lost = [...B.noIslandIdx].filter(i => !A.noIslandIdx.has(i))
o(`   tiles that LOST their island since ba655686 : ${gained.length ? gained.map(i => '#' + i).join(' ') : 'none'}`)
o(`   tiles that GAINED an island since ba655686  : ${lost.length ? lost.map(i => '#' + i).join(' ') : 'none'}`)
o(`   split tiles: ${[...B.splitIdx].map(i => '#' + i).join(' ') || 'none'} → ${[...A.splitIdx].map(i => '#' + i).join(' ') || 'none'}`)
o('\n⇒ If the two rows differ, the guard moved because AUTHORING moved, not because code moved.')
o('  If they are identical, the cause is de7fcba5 (code) and this probe has excluded authoring.')
