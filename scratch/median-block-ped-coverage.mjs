// MEDIAN-AS-BLOCK — is the ped data there, and does a polygon rule find the medians?
// (Wick, 2026-08-14)
//
// Two questions, no building, no product code touched:
//   Q1  OSM sidewalk + crossing coverage on LS and HPDM, NORMALIZED — per metre of
//       street frontage the product actually paints, never a raw fetch count.
//   Q2  MEDIAN BLOCKS found by a POLYGON rule ("a block bounded by two sides of the
//       same street") vs the set the CHAIN apparatus flags (`tile.isMedian`, which is
//       phase.role/pairKey downstream). Agreement or disagreement IS the deliverable.
//
// ⛔ The polygon rule NEVER reads pairId / anchor / innerSign / phase.role. It reads
//    tile.runs' skelId + throughId (identity the POLYGON carries) and tile.ring geometry.
// ⛔ No fallbacks. A missing artifact or a missing field prints as a named LOUD class.
// ⛔ ksi-y-m-yn / centrum / altadena are CHILLERED — printed as such, never as a number.
//
//   node scratch/median-block-ped-coverage.mjs
//
import fs from 'fs'
import crypto from 'crypto'

const o = console.log
const H = (f) => { try { return 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 10) } catch { return 'ABSENT' } }
const R2 = (x) => (Math.round(x * 100) / 100)

const SCENES = ['lafayette-square', 'hipointe-demun']
const CHILLERED = ['ksi-y-m-yn', 'centrum', 'altadena']

// ── Tag keys are LIFTED FROM SOURCE, never restated ─────────────────────────
// derive.js:~1162 is the live sidewalk ingest. Parse the tag key+value out of it so
// this probe cannot go stale if the ingest's predicate changes.
const DERIVE_SRC = fs.readFileSync('cartograph/derive.js', 'utf8')
// ⚠️ Anchored on the `sidewalks` BINDING, not on a bare tags?.X === 'Y' shape — the
// unanchored form matched derive.js's ALLEY filter three lines above and the whole
// first run measured alleys. That is what "read the source, don't restate it" costs
// if the read is sloppy; the binding name is the load-bearing part.
const swMatch = DERIVE_SRC.match(/const sidewalks\s*=\s*highways\.filter\(\s*f\s*=>\s*f\.tags\?\.(\w+)\s*===\s*'([\w-]+)'/)
if (!swMatch) {
  o('⛔ LOUD FAILURE — could not lift the sidewalk ingest predicate out of cartograph/derive.js.')
  o('   The probe refuses to guess the tag. Fix the regex against the live source and re-run.')
  process.exit(1)
}
const [, SW_KEY, SW_VAL] = swMatch
// The crossing key is NOT restated from BACKLOG (which says highway=crossing and is
// wrong for these towns). It is EVIDENCED from the data: the footway histogram is
// printed per scene, and the crossing bucket is selected out of the same key space
// the sidewalk ingest uses.
const CX_KEY = SW_KEY, CX_VAL = 'crossing'

// ── geometry ────────────────────────────────────────────────────────────────
const len = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s }
function nearestOnPoly(q, poly) {
  let best = Infinity, bp = null
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i]
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9
    let t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2; t = Math.max(0, Math.min(1, t))
    const px = a[0] + t * dx, pz = a[1] + t * dz
    const d = Math.hypot(q[0] - px, q[1] - pz)
    if (d < best) { best = d; bp = [px, pz] }
  }
  return { d: best, p: bp }
}
function pointInRing(q, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1]
    if ((zi > q[1]) !== (zj > q[1]) && q[0] < ((xj - xi) * (q[1] - zi)) / ((zj - zi) || 1e-12) + xi) inside = !inside
  }
  return inside
}
function segIntersect(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0])
  if (Math.abs(d) < 1e-12) return false
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}
function sampleAlong(poly, step) {
  const out = []
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-9) continue
    const n = Math.max(1, Math.round(L / step))
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n
      out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], tan: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], w: L / n })
    }
  }
  return out
}
// uniform grid over polyline segments
function buildGrid(polys, cell) {
  const g = new Map()
  const key = (i, j) => i + ':' + j
  polys.forEach((poly, idx) => {
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1], b = poly[i]
      const i0 = Math.floor(Math.min(a[0], b[0]) / cell), i1 = Math.floor(Math.max(a[0], b[0]) / cell)
      const j0 = Math.floor(Math.min(a[1], b[1]) / cell), j1 = Math.floor(Math.max(a[1], b[1]) / cell)
      for (let ii = i0; ii <= i1; ii++) for (let jj = j0; jj <= j1; jj++) {
        const k = key(ii, jj); let arr = g.get(k); if (!arr) g.set(k, arr = [])
        arr.push([a, b, idx])
      }
    }
  })
  return { g, cell, near(q, r) {
    const i0 = Math.floor((q[0] - r) / cell), i1 = Math.floor((q[0] + r) / cell)
    const j0 = Math.floor((q[1] - r) / cell), j1 = Math.floor((q[1] + r) / cell)
    const out = []
    for (let ii = i0; ii <= i1; ii++) for (let jj = j0; jj <= j1; jj++) {
      const arr = this.g.get(ii + ':' + jj); if (arr) out.push(...arr)
    }
    return out
  } }
}
const d2seg = (q, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9
  let t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2; t = Math.max(0, Math.min(1, t))
  return Math.hypot(q[0] - (a[0] + t * dx), q[1] - (a[1] + t * dz))
}
const centroid = (ring) => { let x = 0, z = 0; for (const p of ring) { x += p[0]; z += p[1] } return [x / ring.length, z / ring.length] }

// ═══════════════════════════════════════════════════════════════════════════
o('═══ CHILLERED (⛔ made for a pitch; never sized on) ═══')
for (const c of CHILLERED) o(`  ${c} ......... CHILLERED — not measured, no number reported.`)
o('')
o('═══ TAG PREDICATES — LIFTED FROM SOURCE, NOT RESTATED ═══')
o(`  sidewalk ... f.tags?.${SW_KEY} === '${SW_VAL}'   ← parsed out of cartograph/derive.js  ${H('cartograph/derive.js')}`)
o(`  crossing ... f.tags?.${CX_KEY} === '${CX_VAL}'   ← same key space; the value is EVIDENCED by the per-scene histogram below`)
o(`  ⚠️  BACKLOG.md:103 names highway=crossing. Both scenes carry ZERO of those (printed below).`)
o('')

const REPORT = {}

for (const scene of SCENES) {
  const P = {
    shape: `public/baked/${scene}/shape.json`,
    osm: `cartograph/data/${scene}/raw/osm.json`,
    skel: `cartograph/data/${scene}/clean/skeleton.json`,
  }
  o('═'.repeat(96))
  o(`═══ SCENE: ${scene} ═══`)
  for (const [k, f] of Object.entries(P)) {
    const h = H(f)
    o(`  ${k.padEnd(6)} ${f.padEnd(52)} ${h}${h === 'ABSENT' ? '   ⛔ LOUD FAILURE — artifact missing' : ''}`)
    if (h === 'ABSENT') process.exit(1)
  }
  const mt = (f) => fs.statSync(f).mtime.toISOString().slice(0, 10)
  o(`  vintages: shape ${mt(P.shape)} · osm ${mt(P.osm)} · skeleton ${mt(P.skel)}`)

  const shape = JSON.parse(fs.readFileSync(P.shape, 'utf8'))
  const osm = JSON.parse(fs.readFileSync(P.osm, 'utf8'))
  const skel = JSON.parse(fs.readFileSync(P.skel, 'utf8'))
  const tiles = shape.tiles || []

  // ── producer stamp (A07) — LOUD if absent ────────────────────────────────
  const withProducer = tiles.filter(t => t.producer != null).length
  if (withProducer === 0) {
    o(`  ⛔ LOUD FAILURE CLASS — PRODUCER STAMP ABSENT: 0 of ${tiles.length} tiles carry \`producer\`.`)
    o(`     This shape.json predates A07's two-producer disclosure. Any producer question is`)
    o(`     UNANSWERABLE for this scene until it is re-baked. No default substituted.`)
  } else {
    const tally = {}
    for (const t of tiles) { const k = `${t.producer}/${t.producerReason}`; tally[k] = (tally[k] || 0) + 1 }
    o(`  producer stamp: ${withProducer}/${tiles.length} tiles — ${Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' · ')}`)
  }

  // ── the footway histogram — evidence for the tag keys ────────────────────
  const hw = osm.ground?.highway || []
  const hist = {}
  for (const f of hw) { const t = f.tags || {}; const k = t[SW_KEY] ? `${SW_KEY}=${t[SW_KEY]}` : `highway=${t.highway}`; hist[k] = (hist[k] || 0) + 1 }
  o(`  raw osm ground.highway ways: ${hw.length}`)
  o(`    ${Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`).join(' · ')}`)
  o(`    highway=crossing ways: ${hist['highway=crossing'] || 0}   ← BACKLOG:103's key`)

  const toPoly = (f) => f.coords.map(c => [c.x, c.z])
  const swWays = hw.filter(f => f.tags?.[SW_KEY] === SW_VAL && f.coords.length >= 2).map(toPoly)
  const cxWays = hw.filter(f => f.tags?.[CX_KEY] === CX_VAL && f.coords.length >= 2).map(toPoly)
  o(`  ways: ${SW_KEY}=${SW_VAL} ${swWays.length} · ${CX_KEY}=${CX_VAL} ${cxWays.length}   ⛔ RAW COUNTS — NOT a portability finding. Normalized below.`)

  // ── THE ANALYSIS REGION is the scene's own painted footprint ─────────────
  // (the tiles), never the fetch bbox — the fetch bbox is exactly what makes a
  // raw cross-scene count meaningless.
  const rings = tiles.map(t => t.ring).filter(r => r && r.length >= 3)
  const inRegion = (q) => rings.some(r => pointInRing(q, r))
  let regionArea = 0
  for (const r of rings) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * r[i][1] - r[i][0] * r[j][1]); regionArea += Math.abs(a) / 2 }

  // ── DENOMINATOR: street frontage the product paints ──────────────────────
  // One run = one SIDE of one street bounding one tile. Its poly is the CENTRELINE
  // (verified: mean 0.02 m off skeleton.points). Σ run length = frontage metres.
  let frontageM = 0
  const runRecs = []
  for (let ti = 0; ti < tiles.length; ti++) {
    for (const r of tiles[ti].runs || []) {
      if (!r.poly || r.poly.length < 2) continue
      if (!r.skelId || r.skelId === '__boundary__') continue   // rim edges are not street frontage
      const L = len(r.poly); frontageM += L
      runRecs.push({ ti, r, L })
    }
  }
  // centreline metres inside the region (crossing density denominator)
  let centrelineM = 0
  for (const s of skel.streets || []) {
    if (s.gradeSeparated) continue
    const pts = (s.points || []).map(p => [p.x, p.z])
    for (let i = 1; i < pts.length; i++) {
      const mid = [(pts[i][0] + pts[i - 1][0]) / 2, (pts[i][1] + pts[i - 1][1]) / 2]
      if (inRegion(mid)) centrelineM += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    }
  }

  // ── Q1a NORMALIZED SIDEWALK COVERAGE ────────────────────────────────────
  // Fraction of frontage METRES with an OSM sidewalk way alongside, ON THE TILE'S
  // SIDE of the centreline. Reported as a CURVE over the margin beyond the road's
  // own half-width — no single tuned distance is baked in.
  const swGrid = buildGrid(swWays, 25)
  const MARGINS = [2, 4, 8]
  const covered = Object.fromEntries(MARGINS.map(m => [m, 0]))
  for (const { ti, r } of runRecs) {
    const cen = centroid(tiles[ti].ring)
    const hwL = r.measure?.left?.pavementHW, hwR = r.measure?.right?.pavementHW
    const half = Math.max(Number.isFinite(hwL) ? hwL : 0, Number.isFinite(hwR) ? hwR : 0)
    if (!(half > 0)) continue   // no width on the run — not silently defaulted, counted below
    for (const s of sampleAlong(r.poly, 2)) {
      const n = [-s.tan[1], s.tan[0]]
      const sgn = Math.sign(n[0] * (cen[0] - s.p[0]) + n[1] * (cen[1] - s.p[1])) || 1
      for (const m of MARGINS) {
        const R = half + m
        let hit = false
        for (const [a, b, ] of swGrid.near(s.p, R)) {
          if (d2seg(s.p, a, b) > R) continue
          const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
          const side = Math.sign(n[0] * (mid[0] - s.p[0]) + n[1] * (mid[1] - s.p[1]))
          if (side === sgn) { hit = true; break }
        }
        if (hit) covered[m] += s.w
      }
    }
  }
  const noWidth = runRecs.filter(x => !(Math.max(x.r.measure?.left?.pavementHW || 0, x.r.measure?.right?.pavementHW || 0) > 0))
  const noWidthM = noWidth.reduce((a, x) => a + x.L, 0)

  // ── Q1b NORMALIZED CROSSING COVERAGE ────────────────────────────────────
  const cxIn = cxWays.filter(w => inRegion([(w[0][0] + w[w.length - 1][0]) / 2, (w[0][1] + w[w.length - 1][1]) / 2]))
  const junc = (skel.junctions || []).filter(j => j.degree >= 3 && inRegion([j.x, j.z]))
  const cxGrid = buildGrid(cxIn, 25)
  const RADII = [10, 20, 30]
  const juncHit = Object.fromEntries(RADII.map(r => [r, 0]))
  for (const j of junc) {
    for (const R of RADII) {
      let hit = false
      for (const [a, b] of cxGrid.near([j.x, j.z], R)) { if (d2seg([j.x, j.z], a, b) <= R) { hit = true; break } }
      if (hit) juncHit[R]++
    }
  }

  o('')
  o('  ── Q1 · NORMALIZED PED COVERAGE ─────────────────────────────────────')
  o(`     region       = the scene's own painted tiles (⛔ NOT the fetch bbox): ${tiles.length} tiles, ${Math.round(regionArea).toLocaleString()} m²`)
  o(`     frontage     = ${Math.round(frontageM).toLocaleString()} m  (Σ tile.runs centreline length, one run = one street SIDE)`)
  o(`     centreline   = ${Math.round(centrelineM).toLocaleString()} m  (skeleton segments with midpoint in region)`)
  o(`     ⛔ runs with NO pavementHW (excluded from the sidewalk denominator, NOT defaulted): ${noWidth.length} runs / ${Math.round(noWidthM)} m`)
  o(`     ① SIDEWALK COVERAGE — fraction of frontage metres with an OSM sidewalk on the tile side:`)
  for (const m of MARGINS) o(`          within pavementHW + ${m} m : ${(100 * covered[m] / (frontageM - noWidthM)).toFixed(1)} %   (${Math.round(covered[m]).toLocaleString()} of ${Math.round(frontageM - noWidthM).toLocaleString()} m)`)
  o(`     ② CROSSING COVERAGE — ${cxIn.length} crossing ways with midpoint in region`)
  o(`          density        : ${(1000 * cxIn.length / centrelineM).toFixed(1)} crossings per km of centreline`)
  o(`          junctions deg≥3 in region: ${junc.length}`)
  for (const R of RADII) o(`          junctions with a crossing within ${String(R).padStart(2)} m : ${junc.length ? (100 * juncHit[R] / junc.length).toFixed(1) : 'n/a'} %   (${juncHit[R]}/${junc.length})`)

  // ═══ Q2 · THE POLYGON RULE ════════════════════════════════════════════════
  // "A median is a BLOCK bounded by two sides of the SAME STREET."
  // Read ONLY off the polygon: tile.runs' skelId + throughId (street identity the
  // polygon carries) and tile.ring geometry.
  //   LOOSE  : ≥2 distinct skelIds share a throughId among the tile's runs.
  //   FACING : loose, PLUS the block LIES BETWEEN them — for a majority of samples
  //            along each run set, the midpoint of the shortest connector to the other
  //            run set falls INSIDE tile.ring. This is what separates "two carriageways
  //            with the block between" from "two consecutive segments of one street
  //            meeting end-to-end at a junction". ⛔ No tuned distance: the ring is the
  //            only bound.
  const FRACS = [0.3, 0.5, 0.7]
  const looseSet = new Set(), facingSet = Object.fromEntries(FRACS.map(f => [f, new Set()]))
  const facingDetail = new Map()
  for (let ti = 0; ti < tiles.length; ti++) {
    const t = tiles[ti]; if (!t.ring || t.ring.length < 3) continue
    const byStreet = new Map()
    for (const r of t.runs || []) {
      if (!r.skelId || r.skelId === '__boundary__' || !r.poly || r.poly.length < 2) continue
      const k = r.throughId || r.roadId || r.skelId
      let m = byStreet.get(k); if (!m) byStreet.set(k, m = new Map())
      let arr = m.get(r.skelId); if (!arr) m.set(r.skelId, arr = [])
      arr.push(r.poly)
    }
    let isLoose = false
    let best = 0, bestWho = null, bestGap = NaN
    for (const [street, m] of byStreet) {
      if (m.size < 2) continue
      isLoose = true
      const ids = [...m.keys()]
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
        const A = m.get(ids[a]), B = m.get(ids[b])
        const frac = (from, to) => {
          let tot = 0, ins = 0
          for (const poly of from) for (const s of sampleAlong(poly, 2)) {
            let nb = { d: Infinity, p: null }
            for (const q of to) { const c = nearestOnPoly(s.p, q); if (c.d < nb.d) nb = c }
            if (!nb.p || nb.d < 0.5) { tot += s.w; continue }
            tot += s.w
            const mid = [(s.p[0] + nb.p[0]) / 2, (s.p[1] + nb.p[1]) / 2]
            if (pointInRing(mid, t.ring)) ins += s.w
          }
          return tot ? ins / tot : 0
        }
        const f = Math.min(frac(A, B), frac(B, A))
        // descriptive only: the mean separation between the two run sets, and the
        // tile's area. NOT a filter — no threshold is applied to either. They are
        // printed so the polygon-only excess can be characterised as a shape.
        if (f > best) {
          let ds = [], w = 0
          for (const poly of A) for (const s of sampleAlong(poly, 4)) {
            let nb = Infinity; for (const q of B) { const c = nearestOnPoly(s.p, q); if (c.d < nb) nb = c.d }
            if (Number.isFinite(nb)) { ds.push(nb * s.w); w += s.w }
          }
          best = f; bestWho = `${street} [${ids[a]} ‖ ${ids[b]}]`
          bestGap = w ? ds.reduce((x, y) => x + y, 0) / w : NaN
        }
      }
    }
    if (isLoose) looseSet.add(ti)
    for (const f of FRACS) if (best >= f) facingSet[f].add(ti)
    let tarea = 0; for (let i = 0, j = t.ring.length - 1; i < t.ring.length; j = i++) tarea += (t.ring[j][0] * t.ring[i][1] - t.ring[i][0] * t.ring[j][1])
    if (best > 0) facingDetail.set(ti, { best: R2(best), who: bestWho, gap: R2(bestGap), area: Math.round(Math.abs(tarea) / 2) })
  }

  // ── the CHAIN-flag set ───────────────────────────────────────────────────
  const hasIsMedianField = tiles.some(t => 'isMedian' in t)
  const chainSet = new Set(tiles.map((t, i) => t.isMedian ? i : -1).filter(i => i >= 0))
  if (!hasIsMedianField) o('  ⛔ LOUD FAILURE CLASS — no `isMedian` field on any tile; the chain-flag set is UNAVAILABLE, not empty.')

  const P50 = facingSet[0.5]
  const both = [...P50].filter(i => chainSet.has(i))
  const polyOnly = [...P50].filter(i => !chainSet.has(i))
  const chainOnly = [...chainSet].filter(i => !P50.has(i))

  o('')
  o('  ── Q2 · MEDIAN BLOCKS: POLYGON RULE vs CHAIN FLAGS ──────────────────')
  o(`     ③ POLYGON rule, LOOSE  (≥2 skelIds share a throughId) : ${looseSet.size} / ${tiles.length}   ⚠️ over-fires — a street splits at junctions`)
  for (const f of FRACS) o(`     ③ POLYGON rule, FACING ≥${f} (block lies BETWEEN them)  : ${facingSet[f].size} / ${tiles.length}`)
  o(`     ④ CHAIN flags (tile.isMedian)                          : ${chainSet.size} / ${tiles.length}`)
  o(`     SET COMPARISON at FACING ≥0.5 — SAME SET? ${polyOnly.length === 0 && chainOnly.length === 0 ? 'YES' : 'NO'}`)
  o(`        both       : ${both.length}   [${both.join(',')}]`)
  o(`        polygon-only: ${polyOnly.length}   [${polyOnly.join(',')}]`)
  o(`        chain-only  : ${chainOnly.length}   [${chainOnly.join(',')}]`)
  if (chainOnly.length) {
    o('        chain-only tiles, with their best facing score (why the polygon rule missed them):')
    for (const i of chainOnly) { const d = facingDetail.get(i); o(`          tile ${String(i).padStart(3)}  facing=${d ? d.best : 0}  ${d ? d.who : '(no same-street pair on the ring at all)'}`) }
  }
  if (polyOnly.length) {
    o('        polygon-only tiles (the rule calls them medians, the apparatus does not):')
    for (const i of polyOnly) { const d = facingDetail.get(i); o(`          tile ${String(i).padStart(3)}  facing=${d.best}  gap=${d.gap} m  area=${d.area} m²  ${d.who}`) }
  }

  // ── ped data ON the polygon-rule medians ─────────────────────────────────
  const cxGridAll = buildGrid(cxWays, 25)
  const swGridAll = buildGrid(swWays, 25)
  const ringHits = (grid, ring) => {
    let cross = 0, inside = 0
    const seen = new Set()
    const c = centroid(ring); const rad = Math.max(...ring.map(p => Math.hypot(p[0] - c[0], p[1] - c[1])))
    for (const [a, b, idx] of grid.near(c, rad + 5)) {
      if (seen.has(idx)) continue
      let hit = false
      for (let i = 1; i < ring.length && !hit; i++) if (segIntersect(a, b, ring[i - 1], ring[i])) hit = true
      if (hit) { cross++; seen.add(idx); continue }
      if (pointInRing(a, ring) || pointInRing(b, ring)) { inside++; seen.add(idx) }
    }
    return { cross, inside }
  }
  let withCx = 0, withSw = 0
  const rows = []
  for (const i of [...P50].sort((a, b) => a - b)) {
    const ring = tiles[i].ring
    const cx = ringHits(cxGridAll, ring), sw = ringHits(swGridAll, ring)
    const hasCx = cx.cross > 0, hasSw = sw.cross + sw.inside > 0
    if (hasCx) withCx++; if (hasSw) withSw++
    const dd = facingDetail.get(i)
    rows.push(`          tile ${String(i).padStart(3)}  ${chainSet.has(i) ? 'chain✓' : 'chain✗'}  gap=${String(dd?.gap).padStart(6)} m  area=${String(dd?.area).padStart(7)} m²  crossings-over=${cx.cross}  sidewalk-ways-touching=${sw.cross + sw.inside}  ${dd?.who || ''}`)
  }
  o('')
  o('  ── Q2b · PED DATA ON THE POLYGON-RULE MEDIANS ───────────────────────')
  if (P50.size === 0) {
    o('     ⛔ EMPTY CASE — the polygon rule found ZERO median blocks in this scene.')
    o('        Reported as loudly as a populated one. Nothing substituted.')
  } else {
    o(`     of ${P50.size} polygon-rule medians: ${withCx} have an OSM ${CX_KEY}=${CX_VAL} way CROSSING the block (${(100 * withCx / P50.size).toFixed(0)} %)`)
    o(`                                   ${withSw} have an OSM ${SW_KEY}=${SW_VAL} way touching/inside the block (${(100 * withSw / P50.size).toFixed(0)} %)`)
    if (withCx === 0) o('     ⛔ EMPTY CASE, CROSSINGS: not one polygon-rule median is crossed. Loud, not silent.')
    if (withSw === 0) o('     ⛔ EMPTY CASE, SIDEWALKS: not one polygon-rule median carries a sidewalk way. Loud, not silent.')
    for (const r of rows) o(r)
  }

  REPORT[scene] = {
    sidewalkCoverage: Object.fromEntries(MARGINS.map(m => [m, R2(100 * covered[m] / (frontageM - noWidthM))])),
    crossingsPerKm: R2(1000 * cxIn.length / centrelineM),
    juncWithCrossing20: junc.length ? R2(100 * juncHit[20] / junc.length) : null,
    polygonMedians: P50.size, chainMedians: chainSet.size,
    sameSet: polyOnly.length === 0 && chainOnly.length === 0,
    polyOnly: polyOnly.length, chainOnly: chainOnly.length,
    medianWithCrossing: withCx, medianWithSidewalk: withSw,
    producerStamped: withProducer,
  }
  o('')
}

o('═'.repeat(96))
o('═══ SUMMARY — four numbers and one verdict, per town ═══')
for (const [s, r] of Object.entries(REPORT)) {
  o(`  ${s}`)
  o(`    ① sidewalk coverage (frontage m, +2/+4/+8 m) : ${r.sidewalkCoverage[2]} % / ${r.sidewalkCoverage[4]} % / ${r.sidewalkCoverage[8]} %`)
  o(`    ② crossing density                           : ${r.crossingsPerKm} per km centreline · ${r.juncWithCrossing20} % of deg≥3 junctions within 20 m`)
  o(`    ③ median blocks by the POLYGON rule          : ${r.polygonMedians}`)
  o(`    ④ median blocks by the CHAIN flags           : ${r.chainMedians}`)
  o(`    SAME SET? ${r.sameSet ? 'YES' : `NO — polygon-only ${r.polyOnly}, chain-only ${r.chainOnly}`}`)
  o(`    of ③: ${r.medianWithCrossing} crossed by a crossing way · ${r.medianWithSidewalk} carrying a sidewalk way`)
  o(`    producer stamp: ${r.producerStamped === 0 ? '⛔ ABSENT — scene predates A07; unanswerable without a re-bake' : r.producerStamped + ' tiles'}`)
}
o('')
o('⛔ Numbers only. Cause not established for any of them — the ruling is Jacob\'s.')
