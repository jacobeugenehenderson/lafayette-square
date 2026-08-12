// READ-ONLY reconciliation probe: punch-out rings vs the frozen face walk.
// Throwaway. Does not modify punchout-spike.mjs or anything in src/ or cartograph/.
//
// Reads the compound path CORRECTLY (winding split, outer contour excluded,
// |area| floor) per scratch/punchout-spike.mjs:1-9.
//
//   node scratch/reconcile-punchout-vs-faces.mjs
//
import fs from 'fs'
const o = console.log; console.log = () => {}
const { buildBlockGeometryV2 } = await import('../src/lib/buildBlockGeometryV2.js')
const { extractFaces } = await import('../src/lib/tileGround.js')
const { offsetClosedRing } = await import('../src/lib/buildPathRibbons.js')
console.log = o

const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const nb = JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json', 'utf8'))
let design = {}; try { design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8')) } catch {}

const [cx, cz] = nb.center
const scaleBoundary = (s) => nb.boundary.map(([x, z]) => [cx + (x - cx) * s, cz + (z - cz) * s])
const SC_SPIKE = ((nb?.streetFade?.outer ?? nb.radius) + 50) / nb.radius
const stencilSpike = scaleBoundary(SC_SPIKE)
const stencilRaw = scaleBoundary(1)

const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2 }
const centroid = (r) => { let x = 0, z = 0, a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += f; x += (r[j][0] + r[i][0]) * f; z += (r[j][1] + r[i][1]) * f } a *= 3; return a ? [x / a, z / a] : r[0] }
const inRing = (p, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) ins = !ins } return ins }
const bbox = (r) => { let a = 1e18, b = 1e18, c = -1e18, d = -1e18; for (const p of r) { if (p[0] < a) a = p[0]; if (p[1] < b) b = p[1]; if (p[0] > c) c = p[0]; if (p[1] > d) d = p[1] } return [a, b, c, d] }
const perim = (r) => { let L = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) L += Math.hypot(r[i][0] - r[j][0], r[i][1] - r[j][1]); return L }

// Vertex-for-vertex identity with the stencil (the outer contour test the header names).
function isStencilContour(r, stencil) {
  if (Math.abs(r.length - stencil.length) > 2) return false
  const s = new Set(stencil.map(p => p[0].toFixed(3) + ',' + p[1].toFixed(3)))
  let hit = 0; for (const p of r) if (s.has(p[0].toFixed(3) + ',' + p[1].toFixed(3))) hit++
  return hit / r.length > 0.95
}

function punchout(streets, stencil, label) {
  const c0 = console.log; console.log = () => {}
  const v2 = buildBlockGeometryV2({ ...ribbons, streets }, {
    stencil,
    blockCustoms: design.blockCustoms || null,
    curbWidth: design.curbWidth ?? 0.15,
    blockLandUse: design.blockLandUse,
    __debugRings: true,
  })
  console.log = c0
  const rings = v2.__blockRings || []
  const rec = rings.map((r, i) => ({ i, r, a: area(r), n: r.length }))
  const outerIdx = rec.findIndex(x => isStencilContour(x.r, stencil))
  const stencilSign = Math.sign(area(stencil))
  const outer = outerIdx >= 0 ? rec[outerIdx] : null
  const rest = rec.filter(x => x !== outer)
  const sameWind = rest.filter(x => Math.sign(x.a) === stencilSign)
  const oppWind = rest.filter(x => Math.sign(x.a) !== stencilSign)
  const islands = sameWind.filter(x => Math.abs(x.a) > 1)
  const slivers = sameWind.filter(x => Math.abs(x.a) <= 1)
  const holes = oppWind.filter(x => Math.abs(x.a) > 1)
  const holeSlivers = oppWind.filter(x => Math.abs(x.a) <= 1)
  return { label, v2, rings, outer, islands, slivers, holes, holeSlivers, stencilSign }
}

function report(P) {
  o(`\n── ${P.label}`)
  o(`   total rings ................ ${P.rings.length}`)
  o(`   outer contour (= stencil) .. ${P.outer ? `1  (${Math.abs(P.outer.a).toFixed(0)} m², ${P.outer.n} verts)` : '0  ⚠️ NOT FOUND'}`)
  o(`   holes (opp. winding) >1 m² . ${P.holes.length}  (${P.holes.map(h => Math.abs(h.a).toFixed(0)).slice(0, 4).join(', ')}${P.holes.length > 4 ? ' …' : ''})`)
  o(`   hole slivers <=1 m² ........ ${P.holeSlivers.length}`)
  o(`   ISLANDS (blocks) >1 m² ..... ${P.islands.length}   total ${P.islands.reduce((s, x) => s + Math.abs(x.a), 0).toFixed(0)} m²`)
  o(`   island slivers <=1 m² ...... ${P.slivers.length}`)
  return P
}

o('═══ 0. THE INSTRUMENT AND ITS INPUTS ═══')
const all = (ribbons.streets || []).filter(s => s?.points?.length >= 2)
const noGrade = all.filter(s => !s.gradeSeparated)
o(`ribbons.streets ................ ${(ribbons.streets || []).length}`)
o(`  with >=2 points .............. ${all.length}`)
o(`  gradeSeparated ............... ${all.length - noGrade.length}   (tileGround.js:2618 EXCLUDES these from the face graph)`)
o(`stencil (spike) = boundary x ${SC_SPIKE.toFixed(4)}   area ${Math.abs(area(stencilSpike)).toFixed(0)} m²`)
o(`stencil (raw boundary, what derive.js injects) area ${Math.abs(area(stencilRaw)).toFixed(0)} m²`)
o(`frozen ribbons.tiles ........... ${(ribbons.tiles || []).length}`)

o('\n═══ 1. THE COMPOUND PATH, READ CORRECTLY (LOOSE = stencil − asphaltSharp) ═══')
const A = report(punchout(all, stencilSpike, 'A · spike settings: ALL streets (incl. 57 grade-sep), stencil x1.177'))
const B = report(punchout(noGrade, stencilSpike, 'B · grade-sep EXCLUDED (matches the face graph), stencil x1.177'))
const C = report(punchout(noGrade, stencilRaw, 'C · grade-sep EXCLUDED, stencil = RAW boundary (what derive.js walks)'))

o('\n═══ 2. THE FROZEN COMPARAND ═══')
const frozen = ribbons.tiles || []
const fz = frozen.map((t, i) => ({ i, r: t.ring, a: area(t.ring), edges: t.edges }))
o(`frozen tiles ................... ${fz.length}   total |area| ${fz.reduce((s, x) => s + Math.abs(x.a), 0).toFixed(0)} m²`)
// retracing rings (the slit): consecutive edges same skelId, opposite side, ring vertex repeated
let retrace = 0
for (const t of frozen) {
  const r = t.ring; let hit = false
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 2) % r.length]
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6) { hit = true; break }
  }
  if (hit) retrace++
}
o(`  rings that RETRACE a vertex .. ${retrace}`)
const bEdges = frozen.filter(t => t.edges.some(e => e.skelId === '__boundary__')).length
o(`  tiles touching __boundary__ .. ${bEdges}`)

// live walk on the same street set, unclipped, no boundary injected
const liveFaces = extractFaces(noGrade)
o(`live extractFaces(noGrade), NO boundary injected: ${liveFaces.length} bounded faces (outer face dropped by the >1e-3 filter, tileGround.js:984)`)

o('\n═══ 3. MATCH: punch-out islands ↔ frozen tiles (centroid containment) ═══')
function match(P, fzSet) {
  const unmatched = []
  const hits = new Map()
  for (const isl of P.islands) {
    const c = centroid(isl.r)
    let found = -1
    for (const t of fzSet) { if (inRing(c, t.r)) { found = t.i; break } }
    if (found < 0) unmatched.push(isl); else hits.set(found, (hits.get(found) || 0) + 1)
  }
  const fzUnhit = fzSet.filter(t => !hits.has(t.i))
  const fzMulti = [...hits.entries()].filter(([, n]) => n > 1)
  return { unmatched, fzUnhit, fzMulti, hits }
}
for (const P of [A, B, C]) {
  const m = match(P, fz)
  o(`\n${P.label}`)
  o(`   islands ${P.islands.length} → frozen-tile hits ${m.hits.size}/${fz.length}`)
  o(`   islands with centroid in NO frozen tile ....... ${m.unmatched.length}`)
  o(`   frozen tiles claimed by >1 island (SPLIT) ..... ${m.fzMulti.length}  (extra rings: ${m.fzMulti.reduce((s, [, n]) => s + n - 1, 0)})`)
  o(`   frozen tiles claimed by NO island (MERGED/GONE) ${m.fzUnhit.length}`)
  if (P === B || P === C) {
    o('   unmatched island detail (area m², bbox radius from centre):')
    for (const u of m.unmatched.sort((x, y) => Math.abs(y.a) - Math.abs(x.a)).slice(0, 40)) {
      const c = centroid(u.r); const R = Math.hypot(c[0] - cx, c[1] - cz)
      const bb = bbox(u.r); const w = bb[2] - bb[0], h = bb[3] - bb[1]
      const thin = Math.abs(u.a) / Math.max(perim(u.r), 1e-9)
      o(`     ${Math.abs(u.a).toFixed(1).padStart(10)}  r=${R.toFixed(0).padStart(4)}m  bbox ${w.toFixed(1)}x${h.toFixed(1)}  thickness≈${(2 * thin).toFixed(2)}m  verts ${u.n}`)
    }
    o('   frozen tiles with NO island (area m², r):')
    for (const t of m.fzUnhit.sort((x, y) => Math.abs(y.a) - Math.abs(x.a)).slice(0, 40)) {
      const c = centroid(t.r); const R = Math.hypot(c[0] - cx, c[1] - cz)
      const skel = [...new Set(t.edges.map(e => e.skelId))].slice(0, 3).join('|')
      o(`     ${Math.abs(t.a).toFixed(1).padStart(10)}  r=${R.toFixed(0).padStart(4)}m  verts ${t.r.length}  edges[${skel}]`)
    }
  }
}

o('\n═══ 4. SLIVER / THINNESS CENSUS on the island set (boolean artifact signature) ═══')
for (const P of [A, B, C]) {
  const th = P.islands.map(x => 2 * Math.abs(x.a) / Math.max(perim(x.r), 1e-9))
  const bands = [0.01, 0.1, 0.5, 1, 2, 5]
  const counts = bands.map(b => th.filter(t => t < b).length)
  o(`${P.label.slice(0, 30).padEnd(32)} islands ${String(P.islands.length).padStart(4)}  thickness< ${bands.map((b, i) => `${b}m:${counts[i]}`).join('  ')}`)
  o(`   ${' '.repeat(30)}  area<10m²:${P.islands.filter(x => Math.abs(x.a) < 10).length}  <100:${P.islands.filter(x => Math.abs(x.a) < 100).length}  <1000:${P.islands.filter(x => Math.abs(x.a) < 1000).length}`)
}

o('\n═══ 5. MEDIANS — do divided corridors leave island polygons? ═══')
o(`ribbons.medians[] .............. ${(ribbons.medians || []).length}`)
const frozenMedianish = fz.filter(t => {
  const bySkel = new Map()
  for (const e of t.edges) bySkel.set(e.skelId, (bySkel.get(e.skelId) || 0) + 1)
  return t.edges.length <= 6 && [...bySkel.keys()].length <= 2
}).length
o(`frozen tiles with <=2 distinct skelIds and <=6 edges (median-shaped): ${frozenMedianish}`)

o('\n═══ 6. TIGHT vs LOOSE — flip the variant by dilating the asphalt union ═══')
o('(V2 has NO ribbon-outer union — only `asphaltRings` (:1628). LOOSE is the only variant it can')
o(' produce. TIGHT is approximated here by dilating the asphalt union uniformly, which is a')
o(' PROXY, not the real tight cut: real ped depths are per-chain-per-side.)')
{
  const c0 = console.log; console.log = () => {}
  const v2 = buildBlockGeometryV2({ ...ribbons, streets: noGrade }, {
    stencil: stencilSpike, blockCustoms: design.blockCustoms || null,
    curbWidth: design.curbWidth ?? 0.15, blockLandUse: design.blockLandUse, __debugRings: true,
  })
  console.log = c0
  const base = (v2.__blockRings || []).filter(r => Math.sign(area(r)) === Math.sign(area(stencilSpike)) && Math.abs(area(r)) > 1 && !isStencilContour(r, stencilSpike))
  o(`   LOOSE islands (grade-sep excluded) ......... ${base.length}`)
  for (const d of [0.5, 1.5, 3.0, 5.0]) {
    // erode each island inward by d — equivalent to dilating the road union by d
    let n = 0, killed = 0, split = 0
    for (const r of base) {
      let out = []
      try { out = offsetClosedRing(r, -d) || [] } catch { out = [] }
      const keep = out.filter(x => Math.abs(area(x)) > 1)
      if (keep.length === 0) killed++
      else if (keep.length > 1) split += keep.length - 1
      n += keep.length
    }
    o(`   TIGHT proxy, road dilated ${d.toFixed(1).padStart(4)} m → ${String(n).padStart(4)} islands  (${killed} vanish, ${split} extra from splitting)`)
  }
}

o('\n═══ 7. WHAT THE BOOLEAN DOES THAT A WALK WOULD NOT ═══')
{
  // grade-sep delta
  o(`   grade-sep punching: A islands ${A.islands.length} vs B islands ${B.islands.length}  → Δ ${A.islands.length - B.islands.length}`)
  o(`   stencil choice:     B islands ${B.islands.length} vs C islands ${C.islands.length}  → Δ ${B.islands.length - C.islands.length}`)
  // count islands whose entire boundary is asphalt-adjacent vs stencil-adjacent
  const onStencil = (r, stencil) => {
    const bb = bbox(stencil)
    let hit = 0
    for (const p of r) { const R = Math.hypot(p[0] - cx, p[1] - cz); if (Math.abs(R - Math.hypot(stencil[0][0] - cx, stencil[0][1] - cz)) < 2) hit++ }
    return hit
  }
  for (const P of [B, C]) {
    const st = P === B ? stencilSpike : stencilRaw
    const rimTouch = P.islands.filter(x => onStencil(x.r, st) > 0).length
    o(`   ${P.label.slice(0, 28).padEnd(30)} islands touching the stencil rim: ${rimTouch}`)
  }
}

o('\n═══ 8. DEAD ENDS — count or shape? ═══')
{
  // frozen: how many tiles retrace (the slit) — computed above.
  // punch-out: is the notch INSIDE one island, or does it separate two?
  const capTips = new Set()
  for (const t of frozen) for (const c of (t.caps || [])) capTips.add(JSON.stringify(t.ring[c.vertexIdx]))
  o(`   frozen tiles carrying caps[] ............... ${frozen.filter(t => t.caps?.length).length}`)
  o(`   total frozen caps .......................... ${frozen.reduce((s, t) => s + (t.caps?.length || 0), 0)}`)
  o(`   frozen rings that retrace a vertex ......... ${retrace}`)
  o(`   → a notch is a CONCAVITY of the enclosing island; it adds vertices, not rings,`)
  o(`     UNLESS the spur reaches across and separates the block. Test: islands whose`)
  o(`     centroid falls in a frozen tile that also has a cap:`)
  const capTiles = new Set(fz.filter(t => frozen[t.i].caps?.length).map(t => t.i))
  const m = match(B, fz)
  let inCapTile = 0
  for (const [id, n] of m.hits) if (capTiles.has(id) && n > 1) inCapTile++
  o(`     frozen cap-tiles split into >1 island by the punch-out: ${inCapTile}`)
}
o('\n═══ 9. THE RESIDUAL, CLASSIFIED (variant C — grade-sep excluded, RAW boundary) ═══')
{
  const shape = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))
  const shTiles = shape.tiles || []
  o(`   shape.json tiles ${shTiles.length}   isMedian ${shTiles.filter(t => t.isMedian).length}`)
  // index-align shape.json to ribbons.tiles by ring area (both are the same frozen set)
  const alignOK = shTiles.length === fz.length && shTiles.every((t, i) => Math.abs(Math.abs(area(t.ring)) - Math.abs(fz[i].a)) < 1)
  o(`   shape.json index-aligns to ribbons.tiles by ring area: ${alignOK}`)

  // rebuild C's asphalt union so we can ask "is this frozen tile INSIDE the asphalt?"
  const c0 = console.log; console.log = () => {}
  const v2 = buildBlockGeometryV2({ ...ribbons, streets: noGrade }, {
    stencil: stencilRaw, blockCustoms: design.blockCustoms || null,
    curbWidth: design.curbWidth ?? 0.15, blockLandUse: design.blockLandUse, __debugRings: true,
  })
  console.log = c0
  const Cp = punchout(noGrade, stencilRaw, 'C')
  const m = match(Cp, fz)

  // asphalt coverage test: sample points inside the frozen tile; how many land in NO island?
  const islands = Cp.islands
  const coveredFrac = (t) => {
    const bb = bbox(t.r); let tot = 0, unc = 0
    for (let k = 0; k < 400; k++) {
      const px = bb[0] + (bb[2] - bb[0]) * ((k * 0.6180339887) % 1)
      const pz = bb[1] + (bb[3] - bb[1]) * (((k * 0.7548776662) % 1))
      if (!inRing([px, pz], t.r)) continue
      tot++
      if (!islands.some(x => inRing([px, pz], x.r))) unc++
    }
    return tot ? unc / tot : 1
  }
  o('\n   ── the 9 frozen tiles with NO punch-out island:')
  o('      area m²   isMedian  distinct-skelIds  %of tile swallowed by asphalt  edges')
  for (const t of m.fzUnhit.sort((x, y) => Math.abs(y.a) - Math.abs(x.a))) {
    const skels = [...new Set(frozen[t.i].edges.map(e => e.skelId))]
    const f = coveredFrac(t)
    const sm = alignOK ? (shTiles[t.i].isMedian ? 'YES' : 'no ') : ' ? '
    o(`      ${Math.abs(t.a).toFixed(1).padStart(9)}   ${sm}       ${String(skels.length).padStart(2)}            ${(f * 100).toFixed(0).padStart(3)}%              ${skels.join(',')}`)
  }
  o('\n   ── the frozen tile SPLIT into >1 island:')
  for (const [id, n] of m.fzMulti) {
    const skels = [...new Set(frozen[id].edges.map(e => e.skelId))]
    const parts = islands.filter(x => inRing(centroid(x.r), fz[id].r))
    o(`      frozen[${id}] area ${Math.abs(fz[id].a).toFixed(0)} m², ${n} islands: ${parts.map(p => Math.abs(p.a).toFixed(0)).join(' + ')}`)
    o(`      isMedian ${alignOK ? shTiles[id].isMedian : '?'}   caps ${frozen[id].caps?.length || 0}   edges ${skels.join(',')}`)
  }
  o('\n   ── C island slivers (<=1 m², dropped by the floor):')
  for (const s of Cp.slivers) { const c = centroid(s.r); o(`      ${Math.abs(s.a).toExponential(2)} m²  verts ${s.n}  r=${Math.hypot(c[0] - cx, c[1] - cz).toFixed(0)}m`) }
  o('\n   ── C holes (>1 m², opposite winding = voids punched inside land):')
  for (const h of Cp.holes) { const c = centroid(h.r); o(`      ${Math.abs(h.a).toFixed(1)} m²  verts ${h.n}  r=${Math.hypot(c[0] - cx, c[1] - cz).toFixed(0)}m`) }

  o('\n   ── AREA CLOSURE (does the compound path account for the stencil?)')
  const sumIsl = Cp.islands.reduce((s, x) => s + Math.abs(x.a), 0)
  const sumSl = Cp.slivers.reduce((s, x) => s + Math.abs(x.a), 0)
  const sumHo = Cp.holes.reduce((s, x) => s + Math.abs(x.a), 0)
  o(`      stencilRaw ${Math.abs(area(stencilRaw)).toFixed(0)}  =  islands ${sumIsl.toFixed(0)} + slivers ${sumSl.toFixed(2)} + asphalt-inside-stencil ?`)
  o(`      residual (stencil − islands − slivers + holes) = ${(Math.abs(area(stencilRaw)) - sumIsl - sumSl + sumHo).toFixed(0)} m²  ← this is the ROAD footprint`)

  o('\n   ── MEDIAN CENSUS: do the 30 median-divided frozen tiles survive the punch-out?')
  if (alignOK) {
    const meds = fz.filter(t => shTiles[t.i].isMedian)
    let survive = 0, gone = 0
    for (const t of meds) { if (m.hits.has(t.i)) survive++; else gone++ }
    o(`      isMedian tiles ${meds.length}: survive as an island ${survive}, swallowed ${gone}`)
    o(`      their areas: ${meds.map(t => Math.abs(t.a).toFixed(0)).sort((a, b) => b - a).join(', ')}`)
  }
}

o('\n═══ 10. GRADE-SEP DELTA, ITEMISED (A minus B) ═══')
{
  const mA = match(A, fz), mB = match(B, fz)
  o(`   A islands ${A.islands.length}  slivers ${A.slivers.length}   |   B islands ${B.islands.length}  slivers ${B.slivers.length}`)
  o(`   A frozen tiles split into >1 island: ${mA.fzMulti.length} (extra rings ${mA.fzMulti.reduce((s, [, n]) => s + n - 1, 0)})`)
  o(`   B frozen tiles split into >1 island: ${mB.fzMulti.length} (extra rings ${mB.fzMulti.reduce((s, [, n]) => s + n - 1, 0)})`)
  o('   A: frozen tiles the grade-sep punch CUTS apart —')
  for (const [id, n] of mA.fzMulti) {
    const parts = A.islands.filter(x => inRing(centroid(x.r), fz[id].r))
    o(`      frozen[${id}] ${Math.abs(fz[id].a).toFixed(0)} m² → ${n} pieces: ${parts.map(p => Math.abs(p.a).toFixed(0)).sort((a, b) => b - a).join(' + ')}`)
  }
}

o('\n═══ 11. THE BIJECTION, BY AREA OVERLAP (not centroid) — variant C ═══')
{
  const Cp = punchout(noGrade, stencilRaw, 'C')
  const islands = Cp.islands
  const shape = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))
  const shTiles = shape.tiles

  const STEP = 4 // m
  const bbAll = bbox(stencilRaw)
  const fzBB = fz.map(t => bbox(t.r)), isBB = islands.map(t => bbox(t.r))
  const cov = fz.map(() => new Map())      // tile → islandIdx → cells
  const tileCells = new Array(fz.length).fill(0)
  const islCells = new Array(islands.length).fill(0)
  const islTiles = islands.map(() => new Map())
  let roadCells = 0, tot = 0
  for (let x = bbAll[0]; x <= bbAll[2]; x += STEP) for (let z = bbAll[1]; z <= bbAll[3]; z += STEP) {
    const p = [x, z]
    let ti = -1
    for (let i = 0; i < fz.length; i++) { const b = fzBB[i]; if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue; if (inRing(p, fz[i].r)) { ti = i; break } }
    if (ti < 0) continue
    tot++; tileCells[ti]++
    let ii = -1
    for (let j = 0; j < islands.length; j++) { const b = isBB[j]; if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue; if (inRing(p, islands[j].r)) { ii = j; break } }
    if (ii < 0) { roadCells++; continue }
    islCells[ii]++
    cov[ti].set(ii, (cov[ti].get(ii) || 0) + 1)
    islTiles[ii].set(ti, (islTiles[ii].get(ti) || 0) + 1)
  }
  o(`   grid ${STEP} m · cells inside a frozen tile ${tot} · of those, on ROAD (no island) ${roadCells} (${(100 * roadCells / tot).toFixed(1)}%)`)

  // classify each island by how many frozen tiles it substantially covers
  const SIG = 0.10
  const oneToOne = [], merges = [], orphanIsl = []
  for (let j = 0; j < islands.length; j++) {
    const total = islCells[j]
    if (!total) { orphanIsl.push(j); continue }
    const parts = [...islTiles[j].entries()].filter(([, n]) => n / total >= SIG).sort((a, b) => b[1] - a[1])
    if (parts.length <= 1) oneToOne.push({ j, tile: parts[0]?.[0] })
    else merges.push({ j, tiles: parts.map(([t]) => t), area: Math.abs(islands[j].a) })
  }
  // classify each frozen tile
  const tileSplit = [], tileGone = [], tileClean = []
  for (let i = 0; i < fz.length; i++) {
    const total = tileCells[i]
    if (!total) { tileGone.push({ i, why: 'no grid cell (tile < grid)' }); continue }
    const parts = [...cov[i].entries()].filter(([, n]) => n / total >= 0.15).sort((a, b) => b[1] - a[1])
    const road = (cov[i].size === 0 ? total : total - [...cov[i].values()].reduce((s, n) => s + n, 0))
    if (parts.length === 0) tileGone.push({ i, why: `${(100 * road / total).toFixed(0)}% road` })
    else if (parts.length > 1) tileSplit.push({ i, n: parts.length, parts })
    else tileClean.push(i)
  }
  o(`\n   ISLANDS (${islands.length}):`)
  o(`     covering exactly ONE frozen tile ......... ${oneToOne.length}`)
  o(`     spanning >=2 frozen tiles (MERGE) ........ ${merges.length}`)
  o(`     no grid cell inside any frozen tile ...... ${orphanIsl.length}`)
  o(`   FROZEN TILES (${fz.length}):`)
  o(`     covered by exactly ONE island ............ ${tileClean.length}`)
  o(`     split across >=2 islands ................. ${tileSplit.length}`)
  o(`     no island covers >=15% (SWALLOWED) ....... ${tileGone.length}`)

  o('\n   ── MERGES (one island swallowing several frozen tiles):')
  for (const m of merges.sort((a, b) => b.area - a.area)) {
    const detail = m.tiles.map(t => `${Math.abs(fz[t].a).toFixed(0)}${shTiles[t].isMedian ? 'M' : ''}`).join(' + ')
    o(`     island ${Math.abs(islands[m.j].a).toFixed(0).padStart(7)} m² = frozen tiles [${detail}]   (M = isMedian)`)
  }
  o('\n   ── SPLITS (one frozen tile cut into several islands):')
  for (const s of tileSplit) {
    o(`     frozen[${s.i}] ${Math.abs(fz[s.i].a).toFixed(0)} m² isMedian=${!!shTiles[s.i].isMedian} caps=${frozen[s.i].caps?.length || 0} → ${s.n} islands (${s.parts.map(([j, n]) => `${Math.abs(islands[j].a).toFixed(0)}@${(100 * n / tileCells[s.i]).toFixed(0)}%`).join(', ')})`)
    o(`        edges: ${[...new Set(frozen[s.i].edges.map(e => e.skelId))].join(',')}`)
  }
  o('\n   ── SWALLOWED (frozen tile entirely under the asphalt):')
  for (const g of tileGone) {
    o(`     frozen[${g.i}] ${Math.abs(fz[g.i].a).toFixed(0).padStart(7)} m² isMedian=${String(!!shTiles[g.i].isMedian).padEnd(5)} ${g.why.padEnd(14)} edges: ${[...new Set(frozen[g.i].edges.map(e => e.skelId))].join(',')}`)
  }
  o('\n   ── ORPHAN ISLANDS (land the frozen tiling does not cover at all):')
  for (const j of orphanIsl) { const c = centroid(islands[j].r); o(`     ${Math.abs(islands[j].a).toFixed(1)} m²  r=${Math.hypot(c[0] - cx, c[1] - cz).toFixed(0)}m  verts ${islands[j].n}`) }
}

o('\n═══ 12. THE 92-vs-89 GAP: frozen tiles receiving MORE THAN ONE island ═══')
{
  const Cp = punchout(noGrade, stencilRaw, 'C')
  const islands = Cp.islands
  const shape = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))
  // assign each island to the frozen tile containing its centroid (all 93 matched earlier)
  const byTile = new Map()
  for (let j = 0; j < islands.length; j++) {
    const c = centroid(islands[j].r)
    let t = -1
    for (let i = 0; i < fz.length; i++) if (inRing(c, fz[i].r)) { t = i; break }
    if (!byTile.has(t)) byTile.set(t, [])
    byTile.get(t).push(j)
  }
  o(`   islands assigned to a frozen tile by centroid: ${[...byTile.entries()].filter(([t]) => t >= 0).reduce((s, [, v]) => s + v.length, 0)} / ${islands.length}   (unassigned ${byTile.get(-1)?.length || 0})`)
  o(`   distinct frozen tiles receiving >=1 island: ${[...byTile.keys()].filter(t => t >= 0).length}`)
  for (const [t, js] of byTile) {
    if (t < 0 || js.length < 2) continue
    o(`   frozen[${t}] ${Math.abs(fz[t].a).toFixed(0)} m² isMedian=${!!shape.tiles[t].isMedian} caps=${frozen[t].caps?.length || 0} receives ${js.length} islands: ${js.map(j => Math.abs(islands[j].a).toFixed(1)).join(' + ')}`)
    o(`      edges: ${[...new Set(frozen[t].edges.map(e => e.skelId))].join(',')}`)
    for (const j of js) { const c = centroid(islands[j].r); const th = 2 * Math.abs(islands[j].a) / perim(islands[j].r); o(`      island ${Math.abs(islands[j].a).toFixed(1)} m²  verts ${islands[j].n}  thickness≈${th.toFixed(2)} m  r=${Math.hypot(c[0] - cx, c[1] - cz).toFixed(0)}m`) }
  }
}

o('\n═══ 13. ISLAND → DOMINANT FROZEN TILE (sampled inside the island) — is it a bijection? ═══')
{
  const Cp = punchout(noGrade, stencilRaw, 'C')
  const islands = Cp.islands.map(x => x.r)
  const shape = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))
  const fzBB = fz.map(t => bbox(t.r))
  const dom = []
  for (let j = 0; j < islands.length; j++) {
    const b = bbox(islands[j]); const cnt = new Map(); let n = 0
    const step = Math.max(0.5, Math.sqrt(Math.abs(area(islands[j]))) / 40)
    for (let x = b[0]; x <= b[2]; x += step) for (let z = b[1]; z <= b[3]; z += step) {
      if (!inRing([x, z], islands[j])) continue; n++
      for (let i = 0; i < fz.length; i++) { const bb = fzBB[i]; if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) continue; if (inRing([x, z], fz[i].r)) { cnt.set(i, (cnt.get(i) || 0) + 1); break } }
    }
    const parts = [...cnt.entries()].sort((a, b) => b[1] - a[1])
    dom.push({ j, area: Math.abs(area(islands[j])), parts, frac: parts[0] ? parts[0][1] / n : 0 })
  }
  const claimed = new Set(dom.map(d => d.parts[0]?.[0]))
  o(`   islands ${islands.length} → distinct dominant frozen tiles ${claimed.size}`)
  o(`   islands whose dominant tile holds <70% of them (straddlers): ${dom.filter(d => d.frac < 0.7).length}`)
  const shared = [...claimed].filter(t => dom.filter(d => d.parts[0]?.[0] === t).length > 1)
  o(`   frozen tiles that are the dominant tile of >1 island (SPLIT): ${shared.length}`)
  o(`\n   ── the frozen tiles NO island claims (${fz.length - claimed.size}):`)
  for (const t of fz) {
    if (claimed.has(t.i)) continue
    o(`     frozen[${String(t.i).padStart(3)}] ${Math.abs(t.a).toFixed(0).padStart(7)} m² isMedian=${String(!!shape.tiles[t.i].isMedian).padEnd(5)} verts ${String(t.r.length).padStart(3)} caps=${frozen[t.i].caps?.length || 0}  edges: ${[...new Set(frozen[t.i].edges.map(e => e.skelId))].join(',')}`)
  }
  o(`\n   ── how hard each surviving island shrinks vs its frozen tile (curb-to-curb vs centerline-to-centerline):`)
  const sh = dom.filter(d => d.parts[0] != null).map(d => ({ t: d.parts[0][0], k: d.area / Math.abs(fz[d.parts[0][0]].a) }))
  const q = (p) => sh.map(s => s.k).sort((a, b) => a - b)[Math.floor(p * (sh.length - 1))]
  o(`     island/tile area ratio — min ${q(0).toFixed(2)}  p25 ${q(0.25).toFixed(2)}  median ${q(0.5).toFixed(2)}  p75 ${q(0.75).toFixed(2)}  max ${q(1).toFixed(2)}`)
  o(`     medians (isMedian) ratio — ${sh.filter(s => shape.tiles[s.t].isMedian).map(s => s.k.toFixed(2)).sort().join(' ')}`)
}

o('\n═══ 14. WHY THOSE TILES VANISH — tile width vs the facing pavement half-widths ═══')
{
  const shape = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))
  const by = new Map(ribbons.streets.map(s => [s.skelId, s]))
  const VANISHED = new Set([0, 1, 36, 72, 73, 83, 87, 97])   // from §13; re-derive if the scene changes
  o('   tile     area   width≈2A/P   Σ two widest facing pavementHW   verdict')
  const rows = []
  frozen.forEach((t, i) => {
    if (!shape.tiles[i].isMedian && !VANISHED.has(i)) return
    const skels = [...new Set(t.edges.map(e => e.skelId))].filter(k => k !== '__boundary__')
    const w = 2 * Math.abs(area(t.ring)) / perim(t.ring)
    const hws = skels.map(k => { const s = by.get(k); return s?.measure ? Math.max(s.measure.left?.pavementHW || 0, s.measure.right?.pavementHW || 0) : 0 }).sort((a, b) => b - a)
    rows.push({ i, a: Math.abs(area(t.ring)), w, sum: (hws[0] || 0) + (hws[1] || 0), van: VANISHED.has(i), med: !!shape.tiles[i].isMedian, skels })
  })
  for (const r of rows.sort((a, b) => a.w - b.w)) o(`   ${String(r.i).padStart(4)} ${r.a.toFixed(0).padStart(8)}   ${r.w.toFixed(2).padStart(6)} m        ${r.sum.toFixed(2).padStart(6)} m           ${(r.w < r.sum ? 'ASPHALT OVERLAPS' : 'land survives   ')} ${r.van ? '[NO ISLAND]' : '           '} ${r.med ? 'M' : ' '} ${r.skels.slice(0, 3).join(',')}`)
  const v = rows.filter(r => r.van), s = rows.filter(r => !r.van)
  o(`\n   tiles with no island: width < Σhw in ${v.filter(r => r.w < r.sum).length}/${v.length}`)
  o(`   tiles with an island: width < Σhw in ${s.filter(r => r.w < r.sum).length}/${s.length}   (2A/P understates width on L-shaped tiles — direction only)`)
  o(`\n   ⚠️ buildBlockGeometryV2.js:1469-1471 says the inner-edge transform zeroes "inboard pavement+curb+ped".`)
  o(`      streetProfiles.js:476-495 (innerEdgeMeasure) zeroes ONLY treelawn/sidewalk/terminal — pavementHW is untouched.`)
}

o('\n═══ 15. WHERE THE SUB-AREA RINGS SIT (holes + slivers) ═══')
{
  const Cp = punchout(noGrade, stencilRaw, 'C')
  const cnt = new Map()
  for (const s of noGrade) for (const p of [s.points[0], s.points[s.points.length - 1]]) { const k = p[0].toFixed(2) + ',' + p[1].toFixed(2); cnt.set(k, (cnt.get(k) || 0) + 1) }
  const ends = [...cnt.entries()].map(([k, n]) => ({ p: k.split(',').map(Number), n }))
  const near = (c) => { let bd = 1e9, deg = 0; for (const e of ends) { const d = Math.hypot(e.p[0] - c[0], e.p[1] - c[1]); if (d < bd) { bd = d; deg = e.n } } return { d: bd, deg } }
  o('   HOLES (opposite winding, >1 m² — voids punched inside land):')
  for (const h of Cp.holes) { const e = near(centroid(h.r)); o(`     ${Math.abs(h.a).toFixed(1).padStart(6)} m²  verts ${String(h.n).padStart(3)}  nearest chain endpoint ${e.d.toFixed(2)} m, degree ${e.deg}`) }
  o('   SLIVERS (same winding, <=1 m²):')
  for (const h of Cp.slivers) { const e = near(centroid(h.r)); o(`     ${Math.abs(h.a).toExponential(2)} m²  verts ${String(h.n).padStart(3)}  nearest chain endpoint ${e.d.toFixed(2)} m, degree ${e.deg}`) }
}

o('\ndone.')
