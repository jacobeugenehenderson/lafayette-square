/**
 * coastFile.mjs — the coast's artifact (clean/coast.json, written by bake-coast.mjs) and its ONE reader, in a module with
 * no import but fs and path, so a reader (the pour, the terrain, their checks) does not take bake-coast.mjs's lidar
 * reader into its import closure — and with it the network.
 */
import fs from 'fs'
import { join } from 'path'

export const COAST_FILE = 'coast.json'

/**
 * The town's coast as ① takes it: { coast: false } for an inland town, else { coast: true, rings, holes, arcs, doc }.
 * `rings` are every body's outer (positive signed area) and its holes (negative), in order; `holes` counts the latter.
 * ⛔ No coast.json REFUSES by name — never OSM's coast in its place (BRIEF-the-shore-is-one-line §1: no fallback).
 * ⛔ A coast traced on another square (a re-fetch since) REFUSES: its arcs end on edges that are no longer the frame.
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
  for (const b of doc.water || []) { rings.push(b.outer); for (const h of b.holes || []) { rings.push(h); holes++ } }
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
 * or a copy. An inland town's ① carries none: []. ⛔ A map.json with no frozen ① refuses: the water is unknown.
 * @param map  a parsed clean/map.json
 */
export function waterFace(map, who) {
  const proto = map?.layers?.ribbons?.protopolygon
  if (!proto) throw new Error(`[${who}] ⛔ map.json carries no frozen ① (layers.ribbons.protopolygon) — the water face is unknown. ▶ re-pour`)
  const r = proto.waterRings
  if (r == null) return []
  if (!Array.isArray(r)) throw new Error(`[${who}] ⛔ ①'s waterRings is not a list of rings`)
  return r.filter(ring => Array.isArray(ring) && ring.length >= 3)
}
