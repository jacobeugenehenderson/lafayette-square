/**
 * coastFile.mjs — the coast's artifact (clean/coast.json, written by bake-coast.mjs) and its ONE reader, in a module with
 * no import but fs and path, so a reader (the pour, the terrain, their checks) does not take bake-coast.mjs's lidar
 * reader into its import closure — and with it the network.
 */
import fs from 'fs'
import { join } from 'path'
import { coastSignBreaks } from '../src/lib/coastSign.js'   // pure, no import of its own: the sign rule as ONE predicate
export { coastSignBreaks }

export const COAST_FILE = 'coast.json'

/**
 * The town's coast as ① takes it: { coast: false } for an inland town, else { coast: true, rings, holes, arcs, doc }.
 * `rings` are every body's outer (positive signed area) and its holes (negative), in order; `holes` counts the latter.
 * ⛔ No coast.json REFUSES by name — never OSM's coast in its place (BRIEF-the-shore-is-one-line §1: no fallback).
 * ⛔ A coast traced on another square (a re-fetch since) REFUSES: its arcs end on edges that are no longer the frame.
 * ⛔ An outer not wound positive, or a hole not wound negative, REFUSES: ①'s nonzero fill reads the sign.
 * @param cleanDir  cartograph/data/<scene>/clean
 * @param bb        the frame the reader closes against (geography.mjs#localBB), compared to the square traced on
 */
export function readCoast(cleanDir, bb, who) {
  const p = join(cleanDir, COAST_FILE)
  if (!fs.existsSync(p)) throw new Error(`[${who}] ⛔ no ${p} — the coast is the lidar's (bake-coast.mjs), and there is no other source. ▶ the Bake's 'coast' step, or node cartograph/bake-coast.mjs --scene=<id>`)
  const doc = JSON.parse(fs.readFileSync(p, 'utf8'))
  if (!doc || typeof doc.coast !== 'boolean') throw new Error(`[${who}] ⛔ ${p} carries no coast verdict — not a bake-coast artifact`)
  const S = doc.square
  if (!bb || !S || ['x0', 'x1', 'z0', 'z1'].some(k => !(Math.abs(S[k] - bb[k]) < 1e-6)))
    throw new Error(`[${who}] ⛔ ${p} was traced on the square ${JSON.stringify(S)} and this frame is ${JSON.stringify(bb)} — the fetch moved since the coast was baked. ▶ re-run bake-coast`)
  if (!doc.coast) return { coast: false, why: doc.why, doc }
  const rings = [], arcs = doc.arcs || []
  let holes = 0
  // ⛔ THE SIGN IS THE ISLAND (Zob, 2026-10-26): ① subtracts water nonzero, so a hole wound positive sums to +2 inside its
  // outer and reads as WATER, silently. Every reader downstream leans on it, so it is refused here, at the one door.
  ;(doc.water || []).forEach((b, bi) => {
    // the one predicate (src/lib/coastSign.js), per body: its outer at depth 0 (positive), its islands at depth 1 (negative)
    for (const x of coastSignBreaks([b.outer, ...(b.holes || [])])) {
      if (x.i === 0) throw new Error(`[${who}] ⛔ ${p}: water body ${bi}'s outer is not wound positive — ① would read it as land. ▶ re-run bake-coast`)
      throw new Error(`[${who}] ⛔ ${p}: an island of water body ${bi} (at ${x.at.map(Math.round).join(', ')}) is not wound negative — ① would read it as water. ▶ re-run bake-coast`) }
    rings.push(b.outer); for (const h of b.holes || []) { rings.push(h); holes++ }
  })
  return { coast: true, rings, holes, arcs, doc }
}

/**
 * The terrain grid's cells under `rings` (local metres): a scanline fill, EVEN-ODD over every ring at once, so a hole is
 * an island. One copy: bake-terrain digs its bed under it and the shore check reads the same cells.
 * @returns Uint8Array (width × height, row-major by z), 1 = under the water
 */
export function maskOf(rings, width, height, bounds) {
  const stepX = (bounds.maxX - bounds.minX) / (width - 1), stepZ = (bounds.maxZ - bounds.minZ) / (height - 1)
  const mask = new Uint8Array(width * height)
  for (let j = 0; j < height; j++) {
    const z = bounds.minZ + stepZ * j, xs = []
    for (const ring of rings) for (let k = 0, n = ring.length; k < n; k++) {
      const a = ring[k], b = ring[(k + 1) % n]
      if ((a[1] > z) === (b[1] > z)) continue
      xs.push(a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
    }
    if (xs.length < 2) continue
    xs.sort((m, n) => m - n)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - bounds.minX) / stepX)), i1 = Math.min(width - 1, Math.floor((xs[k + 1] - bounds.minX) / stepX))
      for (let i = i0; i <= i1; i++) mask[j * width + i] = 1
    }
  }
  return mask
}

/** Mapped lines that hold water (man_made=dyke · embankment=yes · waterway=dam), drawn into the grid in half-cell steps (an 8-connected line a 4-way fill cannot cross). */
export function heldCells(osmGround, grid) {
  const { W, H, x0, z0, step } = grid
  const held = new Uint8Array(W * H)
  let n = 0
  for (const bucket of Object.values(osmGround || {})) {
    if (!Array.isArray(bucket)) continue
    for (const f of bucket) {
      const t = f?.tags || {}
      if (!(t.man_made === 'dyke' || t.embankment === 'yes' || t.waterway === 'dam')) continue
      const c = (f.coords || []).filter(q => Number.isFinite(q.x) && Number.isFinite(q.z))
      for (let m = 1; m < c.length; m++) {
        const L = Math.hypot(c[m].x - c[m - 1].x, c[m].z - c[m - 1].z), steps = Math.max(1, Math.ceil(L / (step / 2)))
        for (let u = 0; u <= steps; u++) {
          const i = Math.round((c[m - 1].x + (c[m].x - c[m - 1].x) * u / steps - x0) / step)
          const j = Math.round((c[m - 1].z + (c[m].z - c[m - 1].z) * u / steps - z0) / step)
          if (i >= 0 && j >= 0 && i < W && j < H && !held[j * W + i]) { held[j * W + i] = 1; n++ }
        }
      }
    }
  }
  return { held, n }
}


/**
 * ①'S WATER FACE, the one read after the mint (BRIEF-the-shore-is-one-line §3 step 2a): the rings tileGround froze as
 * map.json `layers.ribbons.protopolygon.waterRings` (built from the coast the mint was given). ①'s coast IS the high-water
 * mark (Jacob, 2026-10-25), so every reader after the mint takes the water from here, never from coast.json, coastline.mjs
 * or a copy. A ① given no coast carries null: []. ⛔ A ① frozen before the field existed refuses, never reads as none. ⛔ A map.json with no frozen ① refuses: the water is unknown.
 * @param map  a parsed clean/map.json
 */
export function waterFace(map, who) {
  const proto = map?.layers?.ribbons?.protopolygon
  if (!proto) throw new Error(`[${who}] ⛔ map.json carries no frozen ① (layers.ribbons.protopolygon) — the water face is unknown. ▶ re-pour`)
  const r = proto.waterRings
  if (r === undefined) throw new Error(`[${who}] ⛔ the frozen ① predates its water face (no waterRings field) — a coastal town would read as "no coast". ▶ re-pour`)
  if (r === null) return []                                  // the mint was given no coast
  if (!Array.isArray(r)) throw new Error(`[${who}] ⛔ ①'s waterRings is not a list of rings`)
  return r.filter(ring => Array.isArray(ring) && ring.length >= 3)
}

/**
 * ①'s water face as HOLED polygons, [{ outer, holes }]: each outer (positive signed area) with the holes (negative) that lie
 * inside it. ⭐ An island is a hole (BRIEF-the-shore-is-one-line §3 step 5), so a reader that fills each ring on its own
 * paints the island as water: every filled draw takes these, never the rings one by one. ⛔ A hole inside no outer refuses.
 */
export function faceAsPolygons(rings, who) {
  const area = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2
  const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
  const outers = rings.filter(r => area(r) > 0).map(r => ({ outer: r, holes: [], a: area(r) })).sort((p, q) => p.a - q.a)
  for (const h of rings.filter(r => area(r) < 0)) {
    const o = outers.find(o => inRing(h[0][0], h[0][1], o.outer))              // the smallest outer holding it
    if (!o) throw new Error(`[${who}] ⛔ ①'s water face has a hole inside no water ring (at ${h[0].map(Math.round).join(', ')})`)
    o.holes.push(h)
  }
  return outers.map(({ outer, holes }) => ({ outer, holes }))
}

/**
 * ⛔ A COAST RING MUST BE SIMPLE (Boz's ruling, 2026-10-26, after Huron's ground refused an antenna on the lake's arc): no
 * two of its edges meet except adjacent ones at their shared vertex, and no adjacent pair folds back along itself. The
 * violations, [{ kind: 'cross' | 'touch' | 'fold' | 'acute' | 'degenerate', a, b, at }] (edge indices; `at` the meeting point), so a refusal names each one.
 * Edges are bucketed on a grid of the ring's own median edge length: exact, not sampled.
 */
export function ringViolations(ring, acuteAt = null) {
  const n = ring.length, out = []
  if (n < 3) return [{ kind: 'degenerate', a: 0, b: 0, at: ring[0] || [0, 0] }]
  // ⛔ AND NO VERTEX ① CANNOT OUTLINE: `acuteAt(o, prev, next)` is the mint's own predicate (tileGround.js#outlineCorner at
  // INK_EPS), passed in so this module stays free of the mint; a hairpin can be simple and still acute (Zob, Boz 10-26).
  if (acuteAt) for (let i = 0; i < n; i++) { const bad = acuteAt(ring[i], ring[(i - 1 + n) % n], ring[(i + 1) % n]); if (bad) out.push({ kind: bad, a: (i - 1 + n) % n, b: i, at: ring[i] }) }
  const E = (i) => [ring[i], ring[(i + 1) % n]]
  const len = Array.from({ length: n }, (_, i) => { const [p, q] = E(i); return Math.hypot(q[0] - p[0], q[1] - p[1]) }).sort((a, b) => a - b)
  const G = Math.max(len[n >> 1], 1e-6), cells = new Map()
  for (let i = 0; i < n; i++) { const [p, q] = E(i)
    for (let gx = Math.floor(Math.min(p[0], q[0]) / G); gx <= Math.floor(Math.max(p[0], q[0]) / G); gx++)
      for (let gz = Math.floor(Math.min(p[1], q[1]) / G); gz <= Math.floor(Math.max(p[1], q[1]) / G); gz++) {
        const k = `${gx},${gz}`; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i) } }
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const on = (p, q, r) => Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1])
  const seen = new Set()
  for (const list of cells.values()) for (let s = 0; s < list.length; s++) for (let t = s + 1; t < list.length; t++) {
    const a = Math.min(list[s], list[t]), b = Math.max(list[s], list[t]), key = a * n + b
    if (seen.has(key)) continue; seen.add(key)
    const [p1, p2] = E(a), [q1, q2] = E(b), adjacent = b === a + 1 || (a === 0 && b === n - 1)
    const d1 = cr(q1, q2, p1), d2 = cr(q1, q2, p2), d3 = cr(p1, p2, q1), d4 = cr(p1, p2, q2)
    if (adjacent) {                                          // shared vertex: only a fold (collinear, turning back) is a meeting
      const [v, u, w] = b === a + 1 ? [p2, p1, q2] : [p1, p2, q1]
      if (cr(v, u, w) === 0 && (u[0] - v[0]) * (w[0] - v[0]) + (u[1] - v[1]) * (w[1] - v[1]) > 0) out.push({ kind: 'fold', a, b, at: v })
      continue
    }
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      const t0 = d1 / (d1 - d2); out.push({ kind: 'cross', a, b, at: [p1[0] + (p2[0] - p1[0]) * t0, p1[1] + (p2[1] - p1[1]) * t0] })
    } else if ((d1 === 0 && on(q1, q2, p1)) || (d2 === 0 && on(q1, q2, p2)) || (d3 === 0 && on(p1, p2, q1)) || (d4 === 0 && on(p1, p2, q2)))
      out.push({ kind: 'touch', a, b, at: d1 === 0 ? p1 : d2 === 0 ? p2 : d3 === 0 ? q1 : q2 })   // two parts of the ring meet at a point
  }
  return out
}

/**
 * ⛔ AND NO TWO COAST RINGS MEET (Boz's ruling, 2026-10-27): every ring of every body is judged against every other, since a
 * hole's edge across its body's outer, or one body's across another's, is the same antenna as a ring crossing itself. The
 * meetings, [{ kind: 'cross' | 'touch', ra, a, rb, b, at }] (ring and edge indices). Same exact grid as ringViolations.
 */
export function ringsMeet(rings) {
  const edges = rings.flatMap((ring, r) => ring.map((p, i) => [r, i, p, ring[(i + 1) % ring.length]]))
  if (!edges.length) return []
  const len = edges.map(([, , p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1])).sort((a, b) => a - b)
  const G = Math.max(len[len.length >> 1], 1e-6), cells = new Map(), out = [], seen = new Set()
  edges.forEach(([, , p, q], e) => {
    for (let gx = Math.floor(Math.min(p[0], q[0]) / G); gx <= Math.floor(Math.max(p[0], q[0]) / G); gx++)
      for (let gz = Math.floor(Math.min(p[1], q[1]) / G); gz <= Math.floor(Math.max(p[1], q[1]) / G); gz++) {
        const k = `${gx},${gz}`; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(e) } })
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const on = (p, q, r) => Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1])
  for (const list of cells.values()) for (let s = 0; s < list.length; s++) for (let t = s + 1; t < list.length; t++) {
    const x = Math.min(list[s], list[t]), y = Math.max(list[s], list[t]), [ra, a, p1, p2] = edges[x], [rb, b, q1, q2] = edges[y]
    if (ra === rb || seen.has(x * edges.length + y)) continue; seen.add(x * edges.length + y)
    const d1 = cr(q1, q2, p1), d2 = cr(q1, q2, p2), d3 = cr(p1, p2, q1), d4 = cr(p1, p2, q2)
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      const t0 = d1 / (d1 - d2); out.push({ kind: 'cross', ra, a, rb, b, at: [p1[0] + (p2[0] - p1[0]) * t0, p1[1] + (p2[1] - p1[1]) * t0] })
    } else if ((d1 === 0 && on(q1, q2, p1)) || (d2 === 0 && on(q1, q2, p2)) || (d3 === 0 && on(p1, p2, q1)) || (d4 === 0 && on(p1, p2, q2)))
      out.push({ kind: 'touch', ra, a, rb, b, at: d1 === 0 ? p1 : d2 === 0 ? p2 : d3 === 0 ? q1 : q2 })
  }
  return out
}
