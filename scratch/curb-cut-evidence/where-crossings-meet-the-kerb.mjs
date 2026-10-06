#!/usr/bin/env node
// READ-ONLY PROBE — BRIEF-corner-ramps-and-kerb §3 step 2 (Sill, 2026-10-06). Where does an OSM crossing way meet
// the FROZEN curb ring, and where along a corner arc's span does it land?
//   crossing   = raw/osm.json ground.highway, footway=crossing
//   road node  = the ONE interior vertex whose exact lon/lat is a vertex of a road way (a shared OSM node)
//   the kerb   = each half of the crossing (road node → each end), walked outward; the FIRST frozen iaFull ring
//                edge it crosses. A half that ends short is extended along its OWN last segment, and the reach
//                that took is binned — never a nearest-ring search.
//   the span   = an edge whose two ends carry the same licensed `iaArc` (the painter's own `inC` rule)
// Prints counts only.  node scratch/curb-cut-evidence/where-crossings-meet-the-kerb.mjs <scene>…
import { readFileSync } from 'fs'

const ROAD = new Set(['motorway','trunk','primary','secondary','tertiary','unclassified','residential','service','living_street',
  'motorway_link','trunk_link','primary_link','secondary_link','tertiary_link','road','busway'])
const k = c => c.lon + ',' + c.lat
const xz = c => [c.x, c.z]
const inc = (o, key, by = 1) => { o[key] = (o[key] || 0) + by }
function segX(a, b, c, d) {      // a→b against c→d: t along a→b, u along c→d
  const r = [b[0]-a[0], b[1]-a[1]], s = [d[0]-c[0], d[1]-c[1]], den = r[0]*s[1] - r[1]*s[0]
  if (Math.abs(den) < 1e-12) return null
  const q = [c[0]-a[0], c[1]-a[1]], t = (q[0]*s[1] - q[1]*s[0]) / den, u = (q[0]*r[1] - q[1]*r[0]) / den
  return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? { t, u } : null
}
const bin = (r, edges) => { for (const e of edges) if (r < e) return `<${e}`; return `>${edges[edges.length - 1]}` }

for (const scene of process.argv.slice(2)) {
  const osm = JSON.parse(readFileSync(`cartograph/data/${scene}/raw/osm.json`, 'utf8')).ground.highway
  const tiles = JSON.parse(readFileSync(`public/baked/${scene}/shape.json`, 'utf8')).tiles
  const G = 20, grid = new Map(), edges = []
  tiles.forEach((t, ti) => (t?.iaFull || []).forEach((ring, si) => {
    const arc = t.iaArc?.[si], mark = t.iaCorner?.[si], jx = t.iaJunction?.[si], n = ring.length
    const lic = new Set(); if (arc) for (let q = 0; q < n; q++) if (arc[q] != null && mark?.[q]) lic.add(arc[q])
    const inArc = q => !!arc && arc[q] != null && arc[q] === arc[(q + 1) % n] && lic.has(arc[q])
    const recs = []
    for (let q = 0; q < n; q++) { const a = ring[q], b = ring[(q + 1) % n]
      recs.push({ a, b, len: Math.hypot(b[0]-a[0], b[1]-a[1]), inArc: inArc(q) }) }
    // each arc span: its edges' running position and total length (s0, L, junction class)
    for (let q = 0; q < n; q++) {
      if (!recs[q].inArc || recs[(q - 1 + n) % n].inArc) continue
      const span = []; for (let i = q, c = 0; c < n && recs[i].inArc; c++, i = (i + 1) % n) span.push(i)
      let s = 0; for (const i of span) { recs[i].s0 = s; s += recs[i].len }
      for (const i of span) Object.assign(recs[i], { L: s, arcKey: `${ti}|${si}|${q}`, jx: jx?.[q], legs: Number.isInteger(jx?.[q]) ? (t.junctions?.[jx[q]]?.legs || []).map(l => l?.skelId) : [] })
    }
    // a leg edge: its distance along the ring to the nearest arc tangent (either way), for the off-arc landings
    for (let q = 0; q < n; q++) {
      if (recs[q].inArc) continue
      let f = 0, b = 0, F = Infinity, B = Infinity
      for (let i = (q + 1) % n, c = 0; c < n; c++, i = (i + 1) % n) { if (recs[i].inArc) { F = f; break } f += recs[i].len }
      for (let i = (q - 1 + n) % n, c = 0; c < n; c++, i = (i - 1 + n) % n) { if (recs[i].inArc) { B = b; break } b += recs[i].len }
      Object.assign(recs[q], { toF: F, toB: B })
    }
    for (const e of recs) {
      const id = edges.push(e) - 1
      for (let x = Math.floor(Math.min(e.a[0], e.b[0]) / G); x <= Math.floor(Math.max(e.a[0], e.b[0]) / G); x++)
        for (let z = Math.floor(Math.min(e.a[1], e.b[1]) / G); z <= Math.floor(Math.max(e.a[1], e.b[1]) / G); z++)
          (grid.get(x + ',' + z) || grid.set(x + ',' + z, []).get(x + ',' + z)).push(id)
    }
  }))
  const firstHit = (P, Q) => {
    const ids = new Set()
    for (let x = Math.floor(Math.min(P[0], Q[0]) / G); x <= Math.floor(Math.max(P[0], Q[0]) / G); x++)
      for (let z = Math.floor(Math.min(P[1], Q[1]) / G); z <= Math.floor(Math.max(P[1], Q[1]) / G); z++)
        for (const id of grid.get(x + ',' + z) || []) ids.add(id)
    let best = null
    for (const id of ids) { const h = segX(P, Q, edges[id].a, edges[id].b); if (h && (!best || h.t < best.t)) best = { ...h, e: edges[id] } }
    return best
  }
  const nearPour = P => { for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++)
    if (grid.get((Math.floor(P[0] / G) + dx) + ',' + (Math.floor(P[1] / G) + dz))) return true; return false }

  const rn = new Map(); for (const w of osm) if (ROAD.has(w.tags?.highway)) for (const c of w.coords) (rn.get(k(c)) || rn.set(k(c), new Set()).get(k(c))).add(w.osmId)
  const skelOf = new Map(); for (const st of JSON.parse(readFileSync(`cartograph/data/${scene}/clean/skeleton.json`, 'utf8')).streets) for (const id of st.sources || []) (skelOf.get(id) || skelOf.set(id, new Set()).get(id)).add(st.id)
  const T = { crossings: 0, oneNode: 0, halvesInPour: 0, outsidePour: 0, reach: {}, noKerb30: 0, onLeg: 0, onArc: 0 }
  const legOff = {}, arcPos = {}, arcClass = {}, perArc = new Map()
  for (const w of osm) {
    if (w.tags?.footway !== 'crossing') continue
    T.crossings++
    const C = w.coords, inner = C.map((c, i) => i).filter(i => i > 0 && i < C.length - 1 && rn.has(k(C[i])))
    if (inner.length !== 1) continue
    T.oneNode++
    const m = inner[0]
    if (!nearPour(xz(C[m]))) { T.outsidePour += 2; continue }
    for (const half of [C.slice(0, m + 1).reverse(), C.slice(m)]) {
      T.halvesInPour++
      let hit = null
      for (let i = 0; i + 1 < half.length && !hit; i++) hit = firstHit(xz(half[i]), xz(half[i + 1]))
      if (hit) inc(T.reach, '0')
      else {
        const A = xz(half[half.length - 2]), B = xz(half[half.length - 1]), L = Math.hypot(B[0]-A[0], B[1]-A[1]) || 1
        const far = [B[0] + (B[0]-A[0]) / L * 30, B[1] + (B[1]-A[1]) / L * 30]
        hit = firstHit(B, far)
        if (!hit) { T.noKerb30++; continue }
        inc(T.reach, bin(hit.t * 30, [1, 2, 4, 8, 30]))
      }
      const e = hit.e
      if (!e.inArc) { T.onLeg++; const off = Math.min(e.toF + (1 - hit.u) * e.len, e.toB + hit.u * e.len); inc(legOff, bin(off, [1, 2, 4, 8, 16])); continue }
      T.onArc++
      { const crossed = new Set([...rn.get(k(C[m]))].flatMap(id => [...(skelOf.get(id) || [])])); inc(T.legAgree = T.legAgree || {}, !crossed.size ? 'crossed road not in skeleton' : !e.legs.length ? 'arc has no junction legs' : e.legs.some(l => crossed.has(l)) ? 'crossed road IS a leg' : 'crossed road is NOT a leg') }
      const f = (e.s0 + hit.u * e.len) / e.L
      inc(arcPos, f < 1 / 3 || f > 2 / 3 ? 'outer thirds' : 'middle third')
      inc(arcClass, e.jx === 'bend' ? 'bend' : Number.isInteger(e.jx) ? 'junction' : 'unknown')
      const P = perArc.get(e.arcKey) || perArc.set(e.arcKey, []).get(e.arcKey); P.push(f)
    }
  }
  const pattern = {}
  for (const fs of perArc.values()) {
    const mid = fs.filter(f => f >= 1 / 3 && f <= 2 / 3).length, lo = fs.filter(f => f < 1 / 3).length, hi = fs.filter(f => f > 2 / 3).length
    inc(pattern, mid && !lo && !hi ? `middle only ×${fs.length}` : !mid && lo && hi ? 'both ends' : !mid ? `one end ×${fs.length}` : 'mixed')
  }
  console.log(`${scene}: ${JSON.stringify(T)}`)
  console.log(`   arc landings: ${JSON.stringify(arcPos)} · by corner: ${JSON.stringify(arcClass)} · per arc: ${JSON.stringify(pattern)}`)
  console.log(`   leg landings, distance along the kerb to the nearest arc tangent (m): ${JSON.stringify(legOff)}`)
}
