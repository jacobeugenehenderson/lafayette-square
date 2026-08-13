// PHASE 0 — READ-ONLY. Does the perimeter close on REAL STREETS alone?
//
// derive.js:4632 [F — EDGE OF MAP] injects the boundary ring as closing edges
// because "an undecorated extractFaces walk leaves the region between the
// outermost streets and the boundary OPEN → the perimeter faces never close".
// Clip-last says: walk the FULL street graph, crop at the radius LAST. That is
// only available if the perimeter faces close on real streets alone.
//
// TEST, per scene: take every frozen tile that today carries a __boundary__
// edge, pick a robust interior point, and ask whether that point lands inside a
// BOUNDED face of the unclipped, un-injected walk. Inside ⇒ the region closes on
// streets and the frozen tile is just that face cropped. Outside ⇒ it is part of
// the single unbounded face and the rim genuinely holds it shut.
//
//   node scratch/phase0-unclipped-close.mjs
//
// Writes nothing.
import fs from 'fs'

const o = console.log; console.log = () => {}
const { extractFaces } = await import('../src/lib/tileGround.js')
console.log = o

const SCENES = [
  { id: 'lafayette-square', ribbons: 'src/data/ribbons.json' },
  { id: 'lafayette-square-staging' },
  { id: 'ksi-y-m-yn' },
  { id: 'hipointe-demun' },
  { id: 'centrum' },
  { id: 'altadena' },
]

const BOUNDARY_SKEL = '__boundary__'

const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2 }
const inRing = (p, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) ins = !ins } return ins }
const bbox = (r) => { let a = 1e18, b = 1e18, c = -1e18, d = -1e18; for (const p of r) { if (p[0] < a) a = p[0]; if (p[1] < b) b = p[1]; if (p[0] > c) c = p[0]; if (p[1] > d) d = p[1] } return [a, b, c, d] }
const dSeg = (p, a, b) => { const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1; let t = ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - (a[0] + ex * t), p[1] - (a[1] + ez * t)) }
const dRing = (p, r) => { let m = Infinity; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const d = dSeg(p, r[j], r[i]); if (d < m) m = d } return m }

// Robust interior point: grid-sample the bbox, keep the inside point farthest
// from the ring (a poor man's pole of inaccessibility). Centroid is unusable —
// a perimeter tile is routinely concave and dead-end tiles are slits.
function interiorPoint(r) {
  const [x0, z0, x1, z1] = bbox(r)
  let best = null, bd = -1
  const N = 60
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
    const p = [x0 + (x1 - x0) * i / N, z0 + (z1 - z0) * j / N]
    if (!inRing(p, r)) continue
    const d = dRing(p, r)
    if (d > bd) { bd = d; best = p }
  }
  return best ? { p: best, clearance: bd } : null
}

const compass = (dx, dz) => {
  // +x = east, +z = south in this frame (screen-space z down); report true bearing.
  const ang = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360
  return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(ang / 22.5) % 16]
}

for (const sc of SCENES) {
  const rp = sc.ribbons || `cartograph/data/${sc.id}/clean/ribbons.json`
  const bp = `cartograph/data/${sc.id}/neighborhood_boundary.json`
  if (!fs.existsSync(rp)) { o(`\n══ ${sc.id}: no ribbons.json (${rp}) — skipped`); continue }
  const ribbons = JSON.parse(fs.readFileSync(rp, 'utf8'))
  const nb = fs.existsSync(bp) ? JSON.parse(fs.readFileSync(bp, 'utf8')) : null
  const tiles = ribbons.tiles || []
  const streets = (ribbons.streets || []).filter(s => s?.points?.length >= 2)
  // derive.js:4624-4631 — the face-street set: grade-sep excluded, strokePoints
  // preferred when present. Thru-splits are a derive-time refinement we cannot
  // replay from the artifact; they add vertices, never edges, so face topology
  // is unaffected.
  const faceStreets = streets.filter(s => !s.gradeSeparated).map(s => s.strokePoints ? { ...s, points: s.strokePoints } : s)

  const rim = tiles.map((t, i) => ({ i, t })).filter(x => (x.t.edges || []).some(e => e.skelId === BOUNDARY_SKEL))
  const rimEdges = rim.reduce((s, x) => s + x.t.edges.filter(e => e.skelId === BOUNDARY_SKEL).length, 0)

  o(`\n══ ${sc.id}`)
  o(`   ribbons ......................... ${rp}`)
  o(`   streets ......................... ${streets.length}  (face graph: ${faceStreets.length}, grade-sep excluded ${streets.length - faceStreets.length})`)
  o(`   frozen tiles .................... ${tiles.length}`)
  o(`   tiles with a __boundary__ edge .. ${rim.length}`)
  o(`   __boundary__ ring edges ......... ${rimEdges}`)
  if (!rim.length) { o('   → nothing to test on this scene.'); continue }

  const faces = extractFaces(faceStreets)
  o(`   unclipped walk (no ring injected) ${faces.length} bounded faces`)
  const fr = faces.map(f => ({ ring: f.ring, a: area(f.ring), bb: bbox(f.ring) }))

  const cen = nb?.center || [0, 0]

  // CONTROL — the same containment test on the INTERIOR tiles (no __boundary__
  // edge). Those are bounded by real streets by definition, so they MUST all
  // land inside a bounded face of the unclipped walk. Any miss here is an
  // instrument fault, not a finding.
  const interior = tiles.map((t, i) => ({ i, t })).filter(x => !(x.t.edges || []).some(e => e.skelId === BOUNDARY_SKEL))
  const hostOf = (p) => { for (let k = 0; k < fr.length; k++) { const f = fr[k]; if (p[0] < f.bb[0] || p[0] > f.bb[2] || p[1] < f.bb[1] || p[1] > f.bb[3]) continue; if (inRing(p, f.ring)) return k } return -1 }
  let ctlOk = 0, ctlMiss = []
  for (const x of interior) {
    const ip = interiorPoint(x.t.ring)
    if (!ip) { ctlMiss.push(x.i); continue }
    if (hostOf(ip.p) >= 0) ctlOk++; else ctlMiss.push(x.i)
  }
  o(`   CONTROL — interior tiles inside a bounded face: ${ctlOk} / ${interior.length}${ctlMiss.length ? `   ⚠️ misses: ${ctlMiss.join(',')}` : ''}`)

  // The fetch extent, for reading the shortfall honestly.
  let maxR = 0
  for (const s of faceStreets) for (const p of s.points) { const r = Math.hypot(p[0] - cen[0], p[1] - cen[1]); if (r > maxR) maxR = r }
  o(`   street graph reaches r=${maxR.toFixed(0)} m; boundary radius ${nb?.radius ?? '?'}`)

  // Dangling ends of the unclipped graph — the thing that keeps a region open.
  // Node degree over the same quantization extractFaces uses.
  {
    const Q = 1e4, key = (p) => Math.round(p[0] * Q) + ',' + Math.round(p[1] * Q)
    const deg = new Map()
    for (const s of faceStreets) for (let i = 0; i < s.points.length - 1; i++) {
      const a = key(s.points[i]), b = key(s.points[i + 1])
      if (a === b) continue
      deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1)
    }
    let d1 = 0, d1out = 0
    for (const [k, v] of deg) if (v === 1) { d1++; const [px, pz] = k.split(',').map(Number); if (Math.hypot(px / Q - cen[0], pz / Q - cen[1]) > (nb?.radius ?? Infinity) * 0.9) d1out++ }
    o(`   degree-1 chain ends: ${d1} total, ${d1out} at r > 0.9·radius`)
  }

  let closed = 0
  const open = []
  for (const x of rim) {
    const ip = interiorPoint(x.t.ring)
    if (!ip) { open.push({ i: x.i, why: 'no interior point (degenerate ring)', ip: null }); continue }
    let host = -1
    for (let k = 0; k < fr.length; k++) {
      const f = fr[k]
      if (ip.p[0] < f.bb[0] || ip.p[0] > f.bb[2] || ip.p[1] < f.bb[1] || ip.p[1] > f.bb[3]) continue
      if (inRing(ip.p, f.ring)) { host = k; break }
    }
    if (host >= 0) closed++
    else open.push({ i: x.i, ip })
  }

  o(`   ⇒ rim tiles that CLOSE on real streets alone: ${closed} / ${rim.length}`)
  if (open.length) {
    o(`   ⇒ OPEN (no bounded face contains them): ${open.length}`)
    for (const x of open) {
      if (!x.ip) { o(`      tile ${x.i}: ${x.why}`); continue }
      const t = tiles[x.i]
      // Direction: the midpoint of the tile's rim edges, not the interior point
      // (a perimeter tile is large; its pole of inaccessibility sits well inside).
      let sx = 0, sz = 0, n = 0, rmax = 0
      for (const p of t.ring) { const r = Math.hypot(p[0] - cen[0], p[1] - cen[1]); if (r > rmax) rmax = r }
      for (let k = 0; k < t.ring.length; k++) if (t.edges[k]?.skelId === BOUNDARY_SKEL) { const a = t.ring[k], b = t.ring[(k + 1) % t.ring.length]; sx += (a[0] + b[0]) / 2; sz += (a[1] + b[1]) / 2; n++ }
      const mx = n ? sx / n : x.ip.p[0], mz = n ? sz / n : x.ip.p[1]
      const nb_ = t.edges.filter(e => e.skelId === BOUNDARY_SKEL).length
      o(`      tile ${x.i}: ${compass(mx - cen[0], mz - cen[1])}  ring reaches r=${rmax.toFixed(0)} m  ·  ${nb_}/${t.edges.length} edges are __boundary__`)
    }
  }
}
