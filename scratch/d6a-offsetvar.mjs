// D6a — build the TRUE per-edge variable offset polygon (offsetRingVariable)
// and prove it: (1) clean (no self-intersection), (2) fixes the d, (3) does NOT
// regress straight-run parallelism. Develops the helper against live tile data.
import fs from 'fs'
import path from 'path'
import clipperLib from 'clipper-lib'
const ROOT = process.cwd()
const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))
const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const marks = JSON.parse(fs.readFileSync(path.join(ROOT, 'cartograph/data/lafayette-square/clean/marker_strokes.json')))
const target = Object.values(marks[0]).filter(p => p && typeof p.x === 'number').map(p => [p.x, p.z])

const SCALE = 1000
const toC = p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
const frC = p => [p.X / SCALE, p.Y / SCALE]
function signedArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1 } return a / 2 }
// clean self-intersections: Clipper union of one path (nonzero) → simple boundary
function cleanRing(ring) {
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper(); c.AddPath(ring.map(toC), PolyType.ptSubject, true)
  const out = []; c.Execute(ClipType.ctUnion, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(p => p.map(frC))
}

// ── the helper under development ───────────────────────────────────────────
// per-edge inward offset of a closed ring. depthAt(i) = inward depth for edge
// i (V[i]→V[i+1]). Corners = intersection of adjacent offset lines (the
// offset-INTERSECTION). Acute spikes miter-clamped; result cleaned of self-x.
function offsetRingVariable(ring, depthAt) {
  const n = ring.length
  if (n < 3) return []
  const ccw = signedArea(ring) > 0
  const seg = []
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n]
    let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L
    const nx = ccw ? -dy : dy, ny = ccw ? dx : -dx        // inward normal
    const d = depthAt(i)
    seg.push({ a, dir: [dx, dy], nrm: [nx, ny], d, P: [a[0] + nx * d, a[1] + ny * d] })  // offset line: through P, dir
  }
  const W = []
  for (let i = 0; i < n; i++) {
    const A = seg[(i - 1 + n) % n], B = seg[i]   // vertex i is between edge i-1 and edge i
    const det = A.dir[0] * B.dir[1] - A.dir[1] * B.dir[0]
    if (Math.abs(det) < 1e-9) {
      // near-collinear (curve sample / straight) → offset the vertex by the local normal
      W.push([ring[i][0] + B.nrm[0] * B.d, ring[i][1] + B.nrm[1] * B.d])
      continue
    }
    // intersect line A (A.P + s·A.dir) with line B (B.P + t·B.dir)
    const t = ((B.P[0] - A.P[0]) * A.dir[1] - (B.P[1] - A.P[1]) * A.dir[0]) / det
    let X = [B.P[0] + B.dir[0] * t, B.P[1] + B.dir[1] * t]
    // miter clamp: if the offset vertex flew far from the original (acute spike),
    // bevel it to the two edges' offset endpoints
    const miter = Math.hypot(X[0] - ring[i][0], X[1] - ring[i][1])
    const lim = 2.5 * Math.max(A.d, B.d, 0.5) + 1
    if (miter > lim) {
      W.push([A.P[0] + A.dir[0] * (vproj(ring[i], A) ), A.P[1] + A.dir[1] * (vproj(ring[i], A))])
      W.push([B.P[0] + B.dir[0] * (vproj(ring[i], B) ), B.P[1] + B.dir[1] * (vproj(ring[i], B))])
    } else W.push(X)
  }
  const cleaned = cleanRing(W).filter(r => Math.abs(signedArea(r)) > 0.5)
  return cleaned
}
function vproj(V, S) { return (V[0] - S.P[0]) * S.dir[0] + (V[1] - S.P[1]) * S.dir[1] }  // param of V's foot on offset line

// per-edge depth lookup from runsD (match ring edge to the run covering it)
function depthFn(ring, runsD) {
  const key = (p, q) => `${Math.round(p[0] * 50)},${Math.round(p[1] * 50)}|${Math.round(q[0] * 50)},${Math.round(q[1] * 50)}`
  const m = new Map()
  for (const r of runsD) for (let i = 0; i < r.poly.length - 1; i++) { m.set(key(r.poly[i], r.poly[i + 1]), r.d); m.set(key(r.poly[i + 1], r.poly[i]), r.d) }
  const n = ring.length
  return (i) => { const d = m.get(key(ring[i], ring[(i + 1) % n])); return d != null ? d : 0 }
}

// ── prove ───────────────────────────────────────────────────────────────────
const cap = []
buildTileGround(ribbons, { stencil: null, curbWidth: 0.15, smooth: 0, _iaDebugCapture: cap })

function distToRings(pt, rings) { let best = Infinity; for (const r of rings) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy || 1; let t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); best = Math.min(best, Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy))) } return best }
function score(rings) { const ds = target.map(p => distToRings(p, rings)); return { mean: ds.reduce((a, b) => a + b, 0) / ds.length, max: Math.max(...ds) } }

// build the variable-offset iA for every tile, count failures
let empties = 0, selfx = 0
const tileVarIA = cap.map(t => {
  const ia = offsetRingVariable(t.ring, depthFn(t.ring, t.runsD))
  if (!ia.length) empties++
  return ia
})
console.log(`tiles: ${cap.length}   offsetRingVariable empties: ${empties}`)

// (1) the d-site
const tx0 = Math.min(...target.map(p => p[0])) - 15, tx1 = Math.max(...target.map(p => p[0])) + 15
const tz0 = Math.min(...target.map(p => p[1])) - 15, tz1 = Math.max(...target.map(p => p[1])) + 15
const near = (rings) => rings.some(r => r.some(p => p[0] > tx0 && p[0] < tx1 && p[1] > tz0 && p[1] < tz1))
console.log('\n=== (1) Lafayette×Mississippi vs drawn line ===')
for (let i = 0; i < cap.length; i++) { if (!near(cap[i].iA_legacy) && !near(tileVarIA[i])) continue; const sv = score(tileVarIA[i]); if (sv.mean > 5) continue; console.log(`tile ${i}: legacy mean ${score(cap[i].iA_legacy).mean.toFixed(2)}/max ${score(cap[i].iA_legacy).max.toFixed(2)}  |  offsetVar mean ${sv.mean.toFixed(2)}/max ${sv.max.toFixed(2)}`) }

// (3) litmus on the variable-offset iA vs legacy: sample each run-derived edge
console.log('\n=== (3) straight-run parallelism (raycast chain→iA, dev from depth) ===')
function litmusOn(getIA) {
  let v = 0
  for (let ti = 0; ti < cap.length; ti++) {
    const iA = getIA(ti); if (!iA.length) continue
    const edges = []; for (const r of iA) for (let i = 0; i < r.length; i++) edges.push([r[i], r[(i + 1) % r.length]])
    let xn = 1e9, xx = -1e9, yn = 1e9, yx = -1e9; for (const p of cap[ti].ring) { xn = Math.min(xn, p[0]); xx = Math.max(xx, p[0]); yn = Math.min(yn, p[1]); yx = Math.max(yx, p[1]) }
    if (Math.hypot(xx - xn, yx - yn) > 250) continue
    for (const run of cap[ti].runsD) {
      const poly = run.poly, hw = run.d; if (!poly || poly.length < 2 || !(hw > 0.5)) continue
      let L = 0; for (let i = 1; i < poly.length; i++) L += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]); if (L < 22) continue
      let worst = 0, along = 0
      for (let i = 1; i < poly.length; i++) {
        const a = poly[i - 1], b = poly[i]; const sl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; const fx = (b[0] - a[0]) / sl, fy = (b[1] - a[1]) / sl
        for (let d = 0; d <= sl; d += 0.5) { const aA = along + d; if (aA < 9 || aA > L - 9) continue; const O = [a[0] + (b[0] - a[0]) * (d / sl), a[1] + (b[1] - a[1]) * (d / sl)]
          for (const nrm of [[-fy, fx], [fy, -fx]]) { let best = Infinity; for (const [A, B] of edges) { const ex = B[0] - A[0], ey = B[1] - A[1]; const den = ex * nrm[1] - ey * nrm[0]; if (Math.abs(den) < 1e-9) continue; const tt = ((A[0] - O[0]) * nrm[1] - (A[1] - O[1]) * nrm[0]) / den; const uu = ((A[0] - O[0]) * ey - (A[1] - O[1]) * ex) / den; if (tt >= 0 && tt <= 1 && uu > 0.1 && uu < hw + 4.5 && uu < best) best = uu } if (best < Infinity) worst = Math.max(worst, Math.abs(best - hw)) } }
        along += sl
      }
      if (worst > 0.75) v++
    }
  }
  return v
}
console.log(`   legacy carve:    ${litmusOn(i => cap[i].iA_legacy)} violations`)
console.log(`   offsetVariable:  ${litmusOn(i => tileVarIA[i])} violations`)
