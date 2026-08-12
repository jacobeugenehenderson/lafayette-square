#!/usr/bin/env node
// ── DOES THE AUTHORING HANDLE SIT ON THE ARC IT OWNS? ────────────────────────
// The Survey (asphalt-edge) and Measure (ped) handles are placed by casting a
// perpendicular ray FROM THE CENTERLINE and taking whatever curb it hits first.
// The curb rings reach the store FLAT (`sectionCurbRings` = every tile's `iA`,
// no owner), so neither overlay can tell its OWN curb from the one across the
// street — only "how far away was it", which is a tuned distance.
//
// This check asks the polygon instead. `tile.runs[]` names every arc
// (skelId · side · segOrd) and `iaEdge` binds every `iA` vertex to the ring edge
// that produced it, so `ringRunOwners` + `bandSpans` — both already exported and
// already used by the FILL — hand back the curb ARCS with one owner each.
//
//   RAY  — what the tool places today (both overlays' exact acceptance rules)
//   ARC  — the point on the arc that THIS run owns at this station
//
// ⭐ HOW A STATION FINDS ITS ARC, and why no distance decides it. A run's poly is
// a sub-polyline OF ITS OWN CHAIN — measured, 550/550 runs, every INTERIOR vertex
// within 0.05 m. Ends are NOT asserted (`ringRunOwners`: "the shape pass may snap
// a run's END onto a fillet apex" — 85 of 550 runs are snapped, up to 10.9 m), so
// containment is resolved by ARCLENGTH ALONG THE CHAIN taken from the interior
// vertices: exact, and immune to the snap. ⚠️ A reader that matched on raw vertex
// distance instead rejected ~20% of covered stations and reported them as gaps —
// that reader produced the "44.8% have no arc" figure, which was its own defect.
//
// ⭐ Runs WITH the scene's authored state loaded (`design.json` blockCustoms) —
// CLAUDE.md Layer 0 q3. An un-authored run measures the wrong map.
// ⛔ TOL below only classifies how far a RAY strayed, for reporting. Nothing here
// uses a distance to decide ownership.
//
//   node scratch/claims-handle-rides-its-arc.mjs [scene]

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const SCENE = process.argv[2] || 'lafayette-square'
const TOL = 0.5          // m — reporting bucket only, never an ownership test
const STEP = 10          // m — station spacing along each chain

const { buildTileGround, ringRunOwners, bandSpans } = await import(path.join(ROOT, 'src/lib/tileGround.js'))
// ⭐ THE SHIPPED RESOLVER — the check exercises the code the tool runs, it does
// not re-implement it. A check that restates its subject cannot catch it drifting.
const { buildCurbArcs, feArcRecords, arcAnchor } = await import(path.join(ROOT, 'src/cartograph/measureModel.js'))

const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const ribbons = rd(SCENE === 'lafayette-square'
  ? 'src/data/ribbons.json'
  : `cartograph/data/${SCENE}/clean/ribbons.json`)
const design = (() => { try { return rd(`public/looks/${SCENE}/design.json`) } catch { return {} } })()
// ⭐ TWO polygons, and using the wrong one is a denominator defect this check
// already committed: the STENCIL is the fade-extended envelope (radius + fade +
// 50 m) used to clip the pour, while the HOOD is the neighborhood itself. Chains
// run well past the hood — 13.5 km of LS's 79 km of frontage — and out there
// there is no tile, so "no arc" is the edge of the map, not a gap. Stations are
// sampled against the HOOD; the pour is clipped by the STENCIL.
let hood = null
const stencil = (() => {
  try {
    const b = rd(`cartograph/data/${SCENE}/neighborhood_boundary.json`)
    hood = b.boundary
    const tR = b.streetFade.outer + 50, sc = tR / b.radius, cx = b.center[0], cz = b.center[1]
    return b.boundary.map(([x, z]) => [cx + (x - cx) * sc, cz + (z - cz) * sc])
  } catch { return null }
})()

const inHood = (x, z) => {
  if (!hood) return true
  let o = false
  for (let i = 0, j = hood.length - 1; i < hood.length; j = i++) {
    const [xi, zi] = hood[i], [xj, zj] = hood[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) o = !o
  }
  return o
}

const nCustoms = Object.keys(design.blockCustoms || {}).length
if (!nCustoms) console.log(`⚠️  ${SCENE}: design.json carries NO blockCustoms — this scene is at default, not authored.`)

const pr = buildTileGround(ribbons, {
  stencil,
  curbWidth: design.curbWidth,
  smooth: 0,
  blockLandUse: design.blockLandUse || null,
  cornerRadiusScale: design.cornerRadiusScale ?? 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || null,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null,
  blockCustoms: design.blockCustoms || null,
  emitArtifact: true,
})

const tiles = pr._shapeArtifact || []
const curbRings = (pr.block || []).filter(r => r && r.length >= 3)   // what the store publishes today

// ── geometry ────────────────────────────────────────────────────────────────
const projSeg = (ax, az, bx, bz, px, pz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz
  const raw = l2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0
  const t = Math.max(0, Math.min(1, raw))
  return { t, x: ax + t * dx, z: az + t * dz, d: Math.hypot(px - (ax + t * dx), pz - (az + t * dz)) }
}
// Arclength of the foot of (px,pz) on a polyline, plus the distance to it.
const arcAt = (pts, cum, px, pz) => {
  let best = Infinity, s = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const r = projSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], px, pz)
    if (r.d < best) { best = r.d; s = cum[i] + r.t * (cum[i + 1] - cum[i]) }
  }
  return { s, d: best }
}
const cumOf = (pts) => {
  const c = [0]
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  return c
}
const nearestOn = (pts, px, pz) => {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const r = projSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], px, pz)
    if (r.d < best) best = r.d
  }
  return best
}
// SurveyorOverlay.rayHitRings — first hit, no identity filter
const rayHitRings = (O, D, rings) => {
  let best = Infinity
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const A = ring[i], B = ring[(i + 1) % ring.length]
      const ex = B[0] - A[0], ez = B[1] - A[1]
      const den = ex * D[1] - ez * D[0]
      if (Math.abs(den) < 1e-12) continue
      const wx = A[0] - O[0], wz = A[1] - O[1]
      const t = (ex * wz - ez * wx) / den
      const s = (D[0] * wz - D[1] * wx) / den
      if (t > 1e-3 && s >= -1e-9 && s <= 1 + 1e-9 && t < best) best = t
    }
  }
  return best
}

// ── THE ARCS, ONE OWNER EACH ────────────────────────────────────────────────
const byId = new Map()
for (const s of ribbons.streets || []) byId.set(s.skelId || s.name, s)
const chainCum = new Map()
const cumFor = (st) => { const k = st.skelId || st.name; if (!chainCum.has(k)) chainCum.set(k, cumOf(st.points)); return chainCum.get(k) }

// key `skelId|side` → [{ span:[s0,s1] along the chain, arcs, segOrd, stamped, why }]
const runsByKey = new Map()
let stamped = 0, unstamped = 0, refused = 0
const refusedWhy = {}
const addRun = (run, arcs, why) => {
  const ch = byId.get(run.skelId)
  if (!ch || !run.poly || run.poly.length < 2) return
  const cum = cumFor(ch)
  // ⭐ EXTENT from ALL vertices; ASSERTION from the interior ones. The two are
  // different jobs and conflating them is a defect this check already made once:
  // interior-only extent collapses a 3-vertex run (ONE interior vertex) to a
  // zero-length span, and LS has many — a 212 m frontage read as 0 m. A snapped
  // END still lands within a fillet radius along the chain, so it is fine for
  // extent; it is only untrustworthy for asserting WHICH chain the run is on.
  let s0 = Infinity, s1 = -Infinity
  for (const p of run.poly) { const a = arcAt(ch.points, cum, p[0], p[1]); if (a.s < s0) s0 = a.s; if (a.s > s1) s1 = a.s }
  if (!Number.isFinite(s0)) return
  const k = `${run.skelId}|${run.side}`
  if (!runsByKey.has(k)) runsByKey.set(k, [])
  runsByKey.get(k).push({ span: [s0, s1], arcs, segOrd: run.segOrd, why })
}
for (const st of tiles) {
  if (!st.iaEdge) {
    unstamped++
    const why = st.iaEdgeReason || 'unstamped'
    refusedWhy[why] = (refusedWhy[why] || 0) + 1
    for (const run of (st.runs || [])) if (run.skelId) addRun(run, [], why)
    continue
  }
  const owner = ringRunOwners(st)
  const spans = owner ? bandSpans(st, owner) : null
  if (!spans) {
    refused++
    for (const run of (st.runs || [])) if (run.skelId) addRun(run, [], 'partition refused')
    continue
  }
  stamped++
  const arcsByRun = new Map()
  for (const s of spans) {
    const A = st.iA[s.r], m = A.length
    const poly = []
    for (let t = 0; t <= s.len; t++) poly.push(A[(s.i0 + t) % m])
    if (!arcsByRun.has(s.owner)) arcsByRun.set(s.owner, [])
    arcsByRun.get(s.owner).push(poly)
  }
  st.runs.forEach((run, ri) => { if (run.skelId) addRun(run, arcsByRun.get(ri) || [], arcsByRun.has(ri) ? null : 'run owns no arc') })
}

// ── sample stations along every chain, both sides ────────────────────────────
// what the TOOL now does, built from the same artifact
const shippedArcs = buildCurbArcs(tiles)
const feSegOrdsOf = (skelId, side) => shippedArcs.filter(r => r.skelId === skelId && r.side === side).map(r => r.segOrd)
const onOwnedArc = (a, recs) => recs.some(rec => (rec.arcs || []).some(arc => {
  for (let i = 0; i < arc.length - 1; i++) {
    const ax = arc[i][0], az = arc[i][1]
    const dx = arc[i + 1][0] - ax, dz = arc[i + 1][1] - az
    const l2 = dx * dx + dz * dz
    if (l2 < 1e-12) continue
    const t = Math.max(0, Math.min(1, ((a.x - ax) * dx + (a.z - az) * dz) / l2))
    if (Math.hypot(a.x - (ax + t * dx), a.z - (az + t * dz)) < 1e-6) return true
  }
  return false
}))
let placedNew = 0, withheldNew = 0, offOwnArc = 0

let anchors = 0, outsideHood = 0, surveyAccepted = 0, surveyStray = 0, surveyWorst = 0, surveyWorstAt = ''
let measureNoHit = 0, measureStray = 0, noArc = 0
const noArcBy = new Map()
const bump = (k) => noArcBy.set(k, (noArcBy.get(k) || 0) + 1)
const strayByStreet = new Map()
const HIGHWAY_TYPES = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link'])

for (const st of ribbons.streets || []) {
  const pts = st.points
  if (!pts || pts.length < 2 || st.gradeSeparated || st.disabled) continue
  const skelId = st.skelId || st.name
  const m = st.measure || {}
  const cum = cumFor(st)
  const total = cum[cum.length - 1]
  for (let s = 0; s < total; s += STEP) {
    let i = 0
    while (i < cum.length - 2 && cum[i + 1] < s) i++
    const f = (s - cum[i]) / Math.max(1e-9, cum[i + 1] - cum[i])
    const cx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f
    const cz = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f
    const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1]
    const L = Math.hypot(dx, dz) || 1
    const nx = -dz / L, nz = dx / L
    if (!inHood(cx, cz)) { outsideHood++; continue }
    for (const [side, sign] of [['left', -1], ['right', +1]]) {
      const pavHW = Math.max(0, m[side]?.pavementHW || 0)
      if (pavHW <= 0) continue
      anchors++
      // ── AFTER: what the tool places now, through the SHIPPED resolver ──────
      // ⛔ The assertion is MEMBERSHIP, not distance: the anchor must lie ON an
      // arc this block-edge owns. A wrong-street hit is then not expressible, so
      // there is no "how far off" left to measure — that is what "by
      // construction" has to mean or it means nothing.
      const recs = feArcRecords(shippedArcs, skelId, side, feSegOrdsOf(skelId, side))
      const placed = arcAnchor(recs, cx, cz)
      if (placed) { placedNew++; if (!onOwnedArc(placed, recs)) offOwnArc++ }
      else withheldNew++

      // THE ARC: the run of this (skelId, side) whose chain-arclength span
      // contains this station. Containment, not proximity.
      let hit = null
      for (const e of (runsByKey.get(`${skelId}|${side}`) || [])) {
        if (s < e.span[0] - 1e-6 || s > e.span[1] + 1e-6) continue
        if (!hit || (!hit.arcs.length && e.arcs.length)) hit = e
      }
      let arcD = Infinity
      if (hit && hit.arcs.length) for (const a of hit.arcs) arcD = Math.min(arcD, nearestOn(a, cx, cz))
      if (!Number.isFinite(arcD)) {
        noArc++
        const other = side === 'left' ? 'right' : 'left'
        const farSide = (runsByKey.get(`${skelId}|${other}`) || [])
          .some(e => s >= e.span[0] && s <= e.span[1] && e.arcs.length)
        bump(HIGHWAY_TYPES.has(st.type) ? `highway class (${st.type}) — owns no frontage arc by construction`
           : hit ? `adjacent tile: ${hit.why || 'no arc'} (${st.type})`
           : farSide ? `one-sided frontage — far side owns an arc here (${st.type})`
           : `⛔ GAP · no tile face on this side (${st.type})`)
        continue
      }
      // RAY, Survey rules (SurveyorOverlay.jsx:237-238): accept 0.2 < t < 40
      const ray = rayHitRings([cx, cz], [sign * nx, sign * nz], curbRings)
      if (Number.isFinite(ray) && ray > 0.2 && ray < 40) {
        surveyAccepted++
        const err = Math.abs(ray - arcD)
        if (err > TOL) {
          surveyStray++
          strayByStreet.set(skelId, (strayByStreet.get(skelId) || 0) + 1)
          if (err > surveyWorst) { surveyWorst = err; surveyWorstAt = `${skelId}/${side} own arc ${arcD.toFixed(2)} m, ray ${ray.toFixed(2)} m` }
        }
      }
      // RAY, Measure rules (MeasureOverlay.jsx:441): same ray capped at
      // pavHW + curb + 8 m; a miss falls back to the centreline ruler SILENTLY
      const cw = Number.isFinite(m[side]?.curb) ? m[side].curb : 0.15
      const capped = Number.isFinite(ray) && ray > 0.05 && ray <= pavHW + cw + 8 ? ray : null
      if (capped == null) measureNoHit++
      else if (Math.abs(capped - arcD) > TOL) measureStray++
    }
  }
}

const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : '—'
console.log(`\n══ HANDLE PLACEMENT · ${SCENE} ══`)
console.log(`   authored:   ${nCustoms} blockCustoms chain(s) loaded`)
console.log(`   tiles:      ${tiles.length} — ${stamped} partitioned into arcs · ${unstamped} no iaEdge stamp · ${refused} stamp present, partition refused`)
if (unstamped) console.log(`   no stamp:   ${Object.entries(refusedWhy).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`\n   stations sampled inside the hood (every ${STEP} m, both sides): ${anchors}`)
console.log(`   (${outsideHood} chain stations lie outside the hood polygon — no tile there, not sampled)`)
console.log(`   ✅ station found its own arc by containment:        ${anchors - noArc}  (${pct(anchors - noArc, anchors)})`)
console.log(`\n   ⛔ SURVEY ray accepted (0.2–40 m, no identity filter): ${surveyAccepted}`)
console.log(`      of those, >${TOL} m off this side's OWN arc:        ${surveyStray}  (${pct(surveyStray, surveyAccepted)})`)
if (surveyWorst) console.log(`      worst: ${surveyWorst.toFixed(2)} m — ${surveyWorstAt}`)
console.log(`   ⛔ MEASURE ray (capped at pavHW + curb + 8 m):`)
console.log(`      no hit in range → SILENT centreline-ruler fallback:  ${measureNoHit}`)
console.log(`      hit in range but >${TOL} m off its own arc:          ${measureStray}`)
console.log(`\n   ── AFTER · the shipped resolver (measureModel.buildCurbArcs → feArcRecords → arcAnchor)`)
console.log(`      handle placed:                                   ${placedNew}  (${pct(placedNew, anchors)})`)
console.log(`      ⛔ placed OFF an arc its own block-edge owns:     ${offOwnArc}   ← must be 0, by construction`)
console.log(`      handle WITHHELD (no arc; the panel names why):    ${withheldNew}  (${pct(withheldNew, anchors)})`)

console.log(`\n   ⚠️  stations with no arc: ${noArc} (${pct(noArc, anchors)}) — no handle may be drawn at these.`)
for (const [k, v] of [...noArcBy.entries()].sort((a, b) => b[1] - a[1])) console.log(`      ${String(v).padStart(5)}  ${k}`)
const gaps = [...noArcBy.entries()].filter(([k]) => k.startsWith('⛔')).reduce((a, [, v]) => a + v, 0)
console.log(`      ⇒ ${gaps} (${pct(gaps, anchors)}) unexplained; the rest own none by construction.`)
const top = [...strayByStreet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
if (top.length) console.log(`\n   worst streets (stray stations): ${top.map(([k, v]) => `${k} ${v}`).join(' · ')}`)
// ⛔⛔ THE NUMBER THE EYE ACTUALLY CARES ABOUT, and the one this check did not
// report until the eye gate failed: not "what fraction of stations", but HOW MANY
// STREET-SIDES LOSE THEIR HANDLE ENTIRELY. A side that is 90% covered still feels
// fine to author; a side with NO handle anywhere on it is a dead tool for that
// street, and averaging hides it. Park Place is the case that taught this.
{
  const bySideKey = new Map()
  for (const r of shippedArcs) {
    const k = `${r.skelId}|${r.side}`
    if (!bySideKey.has(k)) bySideKey.set(k, false)
    if (r.arcs.length) bySideKey.set(k, true)
  }
  const allSides = []
  for (const st of ribbons.streets || []) {
    if (st.gradeSeparated || !st.measure) continue
    for (const side of ['left', 'right']) if (st.measure[side]?.pavementHW > 0) allSides.push(`${st.skelId || st.name}|${side}`)
  }
  const darkSides = allSides.filter(k => !bySideKey.get(k))
  console.log(`\n   ⛔ STREET-SIDES WITH NO HANDLE ANYWHERE ON THEM: ${darkSides.length} of ${allSides.length}  (${pct(darkSides.length, allSides.length)})`)
  console.log(`      ${darkSides.slice(0, 10).join(' · ')}${darkSides.length > 10 ? ` … +${darkSides.length - 10}` : ''}`)
  console.log(`      ⭐ EYE GATE, lafayette-square, 2026-08-12 — Jacob: "Park place and the whole`)
  console.log(`         area around it is a mess … both cases: No handles." RED. This row is why.`)
}

console.log(`\n   ⭐ The BEFORE rows are what the ray did and are kept as the record of the`)
console.log(`      defect; the tool no longer contains that path.`)
// ⛔ The gate is the AFTER number. The before-numbers are reported so the fix can
// be seen, but a non-zero `offOwnArc` is the only thing that can fail this check
// now — the old ray is gone from the tool.
if (offOwnArc) { console.error(`   ⛔ RED — ${offOwnArc} handle(s) placed off their own arc.`); process.exit(1) }
console.log(`   ✅ GREEN — every placed handle sits on an arc its own block-edge owns.\n`)
process.exit(0)
