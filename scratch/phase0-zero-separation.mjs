// PHASE 0(a) (Tally, 2026-08-13) — DOES THE STROKE SURVIVE ZERO SEPARATION?
//
// RIBBONS §1, the lanes-are-primitive ruling (2026-08-13), names this as the
// one open engineering question:
//   "an undivided street's two chains are *coincident*, and coincident input is
//    exactly where geometry libraries return degenerate results. Verify the
//    stroke handles zero separation before building on it."
//
// WHAT THE CODE ACTUALLY DOES (read before measuring — the premise check):
//   buildBlockGeometryV2.js:1602-1617 does NOT buffer a polyline with Clipper.
//   It builds the asphalt ring by EXPLICIT per-vertex perpendicular offset:
//       leftEdge  = pts[i] - perp[i]*hwL
//       rightEdge = pts[i] + perp[i]*hwR
//       ring      = [...leftEdge, ...rightEdge.reverse()]
//   Under lanes-as-primitive at zero separation the two lane-chains ARE this
//   one polyline, and each emitting to its right yields exactly these two
//   edges. So zero separation is not a new case for the offset itself — it is
//   already what every undivided street does today. The two coincident chains
//   never meet as areas in a boolean.
//
// SO THE REAL RISK IS NOT THE COINCIDENCE. It is the two places the offset can
// still go degenerate, and both are measured here on real authored data:
//   D1  the per-vertex perpendicular COLLAPSES (a duplicated vertex or a 180
//       reversal) — computePerps:110 then returns the CONSTANT [0,1]. That is a
//       silent fallback inside the primitive the walk is built on.
//   D2  an OFFSET CUSP — centerline curvature radius smaller than the authored
//       half-width, so the offset polyline crosses itself. This is where a
//       one-sided offset genuinely fails, and it is independent of separation.
//   D3  the emitted face is degenerate: non-positive area, or self-intersecting.
//
// ⛔ Authoring loaded: blockCustoms merged over the chain measure exactly as
//    resolveSide does at buildBlockGeometryV2.js:1579-1582. A run without it
//    measures the un-authored town (CLAUDE.md Layer 0 q3).
//
//   node scratch/phase0-zero-separation.mjs
//
import fs from 'fs'

const SCENES = [
  ['lafayette-square (bundled)', 'src/data/ribbons.json', 'public/looks/lafayette-square/design.json'],
  ['lafayette-square-staging', 'cartograph/data/lafayette-square-staging/clean/ribbons.json', 'public/looks/lafayette-square-staging/design.json'],
  ['hipointe-demun', 'cartograph/data/hipointe-demun/clean/ribbons.json', 'public/looks/hipointe-demun/design.json'],
  ['ksi-y-m-yn', 'cartograph/data/ksi-y-m-yn/clean/ribbons.json', 'public/looks/ksi-y-m-yn/design.json'],
  ['altadena', 'cartograph/data/altadena/clean/ribbons.json', 'public/looks/altadena/design.json'],
  ['centrum', 'cartograph/data/centrum/clean/ribbons.json', 'public/looks/centrum/design.json'],
]

// verbatim port of buildBlockGeometryV2.js:95-113 — including the :110 fallback,
// which is the thing under test. Returns {perps, collapsed:[i,...]}.
function computePerps(pts) {
  const n = pts.length
  const collapsed = []
  const perps = pts.map((_, i) => {
    let nx = 0, nz = 0
    if (i < n - 1) {
      const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1]
      const l = Math.hypot(dx, dz)
      if (l > 1e-9) { nx -= dz / l; nz += dx / l }
    }
    if (i > 0) {
      const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1]
      const l = Math.hypot(dx, dz)
      if (l > 1e-9) { nx -= dz / l; nz += dx / l }
    }
    const l = Math.hypot(nx, nz)
    if (l < 1e-9) { collapsed.push(i); return [0, 1] }
    return [nx / l, nz / l]
  })
  return { perps, collapsed }
}

const segInt = (a, b, c, d) => {
  const rX = b[0] - a[0], rZ = b[1] - a[1], sX = d[0] - c[0], sZ = d[1] - c[1]
  const den = rX * sZ - rZ * sX
  if (Math.abs(den) < 1e-12) return false
  const t = ((c[0] - a[0]) * sZ - (c[1] - a[1]) * sX) / den
  const u = ((c[0] - a[0]) * rZ - (c[1] - a[1]) * rX) / den
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9
}
// non-adjacent self-crossing count for an OPEN polyline
function selfCross(poly) {
  let n = 0
  for (let i = 0; i + 1 < poly.length; i++)
    for (let j = i + 2; j + 1 < poly.length; j++)
      if (segInt(poly[i], poly[i + 1], poly[j], poly[j + 1])) n++
  return n
}
function selfCrossRing(r) {
  let n = 0
  const m = r.length
  for (let i = 0; i < m; i++) for (let j = i + 2; j < m; j++) {
    if (i === 0 && j === m - 1) continue
    if (segInt(r[i], r[(i + 1) % m], r[j], r[(j + 1) % m])) n++
  }
  return n
}
const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2 }

// buildBlockGeometryV2.js:1579-1582 — a custom LAYERS onto the measure, field by field.
const resolveSide = (m, custom, sideKey) => (custom ? { ...(m?.[sideKey] || {}), ...custom } : (m?.[sideKey] || {}))

for (const [name, rPath, dPath] of SCENES) {
  if (!fs.existsSync(rPath)) { console.log(`\n■ ${name} — no ribbons.json, SKIPPED (not zero)`); continue }
  const ribbons = JSON.parse(fs.readFileSync(rPath, 'utf8'))
  let design = {}
  let designStatus = 'ABSENT (⛔ measuring the un-authored town)'
  try { design = JSON.parse(fs.readFileSync(dPath, 'utf8')); designStatus = `${Object.keys(design.blockCustoms || {}).length} authored streets` } catch {}
  const bc = design.blockCustoms || {}

  const streets = (ribbons.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
  let chains = 0, verts = 0
  let d1 = 0, d1Chains = new Set()
  let d2L = 0, d2R = 0, d2Chains = new Set(), dupChains = new Set(), tightChains = new Set()
  let d3area = 0, d3self = 0, d3Chains = new Set()
  let nan = 0
  let zeroHW = 0, bothZero = 0
  const worst = []

  for (const s of streets) {
    const pts = s.points
    chains++; verts += pts.length
    const { perps, collapsed } = computePerps(pts)
    if (collapsed.length) { d1 += collapsed.length; d1Chains.add(s.skelId) }

    // authoring, whole-chain (segOrd-level customs are a refinement; the
    // widest authored value per side is the harshest case for a cusp, and
    // that is what we want to stress here).
    const cust = bc[s.skelId] || bc[s.name] || null
    const pick = (side) => {
      let hw = resolveSide(s.measure, null, side).pavementHW || 0
      if (cust && cust[side]) for (const segOrd of Object.keys(cust[side])) {
        const v = resolveSide(s.measure, cust[side][segOrd], side).pavementHW
        if (Number.isFinite(v)) hw = Math.max(hw, v)
      }
      return hw
    }
    const hwL = pick('left'), hwR = pick('right')
    if (hwL <= 0 || hwR <= 0) zeroHW++
    if (hwL <= 0 && hwR <= 0) { bothZero++; continue }

    // ZERO SEPARATION: both lane-chains are `pts`. Right lane emits right
    // (+perp*hwR); left lane runs reversed and emits to ITS right (-perp*hwL).
    const rightEdge = pts.map((p, i) => [p[0] + perps[i][0] * hwR, p[1] + perps[i][1] * hwR])
    const leftEdge = pts.map((p, i) => [p[0] - perps[i][0] * hwL, p[1] - perps[i][1] * hwL])
    if ([...rightEdge, ...leftEdge].some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) nan++

    const cL = selfCross(leftEdge), cR = selfCross(rightEdge)
    if (cL || cR) {
      d2L += cL; d2R += cR; d2Chains.add(s.skelId)
      // CLASSIFY THE CAUSE. Two very different defects wear one symptom:
      //   DUP  a zero-length centerline segment (a duplicated vertex) — a
      //        SKELETON defect; the offset has nothing to be perpendicular to.
      //   TURN a genuine turn radius smaller than the authored half-width —
      //        the real, unavoidable offset cusp.
      let dup = 0, tight = 0
      for (let i = 1; i < pts.length - 1; i++) {
        const a = pts[i - 1], b = pts[i], c = pts[i + 1]
        const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1])
        if (l1 < 1e-6 || l2 < 1e-6) { dup++; continue }
        const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        const dt = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])
        const ang = Math.abs(Math.atan2(cr, dt))
        if (ang < 1e-9) continue
        const Rt = Math.min(l1, l2) / (2 * Math.tan(ang / 2))
        if (Rt < Math.max(hwL, hwR)) tight++
      }
      if (dup) dupChains.add(s.skelId)
      if (tight) tightChains.add(s.skelId)
      worst.push([s.skelId, cL, cR, hwL, hwR, dup, tight])
    }

    const ring = [...leftEdge, ...rightEdge.slice().reverse()]
    const A = area(ring)
    const sx = selfCrossRing(ring)
    if (!(Math.abs(A) > 1e-9)) { d3area++; d3Chains.add(s.skelId) }
    if (sx) { d3self++; d3Chains.add(s.skelId) }
  }

  console.log(`\n■ ${name}`)
  console.log(`   ribbons ${rPath}`)
  console.log(`   design.json ................. ${designStatus}`)
  console.log(`   chains measured (no grade-sep) ${chains}   vertices ${verts}`)
  console.log(`   chains with a zero half-width  ${zeroHW}   (both sides zero, skipped: ${bothZero})`)
  console.log(`   D1 perp COLLAPSE (:110 const fallback fires)  ${d1} vertices on ${d1Chains.size} chains`)
  console.log(`   D2 offset CUSP (one-sided self-cross)         left ${d2L} · right ${d2R}  on ${d2Chains.size} chains`)
  console.log(`      cause: DUPLICATED CENTERLINE VERTEX ${dupChains.size} chains · genuine TIGHT TURN (R < hw) ${tightChains.size} · neither ${[...d2Chains].filter(c => !dupChains.has(c) && !tightChains.has(c)).length}`)
  console.log(`   D3 emitted face degenerate                    zero-area ${d3area} · self-intersecting ${d3self}  on ${d3Chains.size} chains`)
  console.log(`   NaN in any offset vertex ...................... ${nan}`)
  if (worst.length) {
    console.log(`   ── the cusping chains (skelId, crossL, crossR, hwL, hwR):`)
    for (const w of worst.sort((a, b) => (b[1] + b[2]) - (a[1] + a[2])).slice(0, 12))
      console.log(`       ${String(w[0]).padEnd(30)} L${String(w[1]).padStart(3)} R${String(w[2]).padStart(3)}   hwL ${w[3].toFixed(2)}  hwR ${w[4].toFixed(2)}   dupVerts ${w[5]}  tightVerts ${w[6]}`)
  }
}

console.log(`
─────────────────────────────────────────────────────────────────────
READ THIS RESULT AS: zero separation is not itself a degeneracy in this
codebase, because the stroke is an explicit per-vertex offset and never a
buffer of coincident input. D1/D2/D3 are the degeneracies that DO exist and
they are properties of the CENTERLINE and the AUTHORED WIDTH, not of the
separation. A nonzero D1 is a silent constant substitution inside the walk's
own primitive (buildBlockGeometryV2.js:110) and must be made loud before the
walk consumes it.`)
