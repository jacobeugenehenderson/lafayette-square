/**
 * farQuant.js — THE FAR SHORE'S BYTES, revetment-far.json format 3 (Jacob, 2026-10-29: "compress, fine normals").
 * Written by cartograph/bake-revetment-far.js, decoded by SlabRevetment.jsx, and the near drape's seam is snapped by it
 * (revetmentDrape.js#drapeRelative): one module, so what is written, what is drawn and what the near meets are one code.
 *
 * ⭐ POSITIONS: 16 bits an axis, each chunk at its own integer origin on ONE GRID FOR THE TOWN (`step`, per axis, in the
 * table's `quant`; the largest chunk extent on that axis over Q_SPAN steps). A vertex two far chunks share is the same
 * float in both builds, so it rounds to the same grid point in both, and a near chunk meeting the far snaps its shared
 * row to that grid too: ONE quantization on both sides of every edge, so the seam stays exact after decode.
 * ⛔ Not each chunk's own bounds as its grid: a vertex two chunks share would round two ways and open the seam by up to a step.
 * ⭐ NORMALS: octahedral, 2 × int16. PINS: f32 × 4 as before (the drawn raw rides exact). INDEX: u16 when a chunk has at
 * most 65,536 vertices, else u32. Every array starts 4-byte aligned. Error bounds: ▶ node checks/claims-the-drape-meets-itself-on-one-line.mjs
 */

import { NODE_BOUND } from './latticeNode.js'
import { CLIP_SCALE } from './lattice.js'

/** The 16-bit range, and the span a chunk's extent may take on it: round() of an extent of S steps takes S + 1 values. */
export const Q_MAX = 65535
const Q_SPAN = Q_MAX - 1
const OCT = 32767

/** Per chunk, in its bin: the arrays in order, their element type and per-vertex size (the index's type is `indexType`). */
export const FAR_ARRAYS = [['pin', Float32Array, 4], ['pos', Uint16Array, 3], ['normal', Int16Array, 2], ['band', Uint16Array, 3], ['bandNormal', Int16Array, 2], ['index', null, 1]]
export const indexType = (vertexCount) => (vertexCount <= Q_MAX + 1 ? Uint16Array : Uint32Array)

/** The town's grid: per axis, the largest extent of any chunk's far or band positions over Q_SPAN. `chunks` are
 *  [{ key, pos, band }] (Float32, ground-relative, as drawn before quantization). ⛔ An axis flat in every chunk has no grid.
 *  ⛔ REFUSED when the grid rounds coarser than the kit's own rounding (Zob, 2026-10-29): its half-diagonal past NODE_BOUND
 *  (the 1 mm lattice's, latticeNode.js), named by the chunks that sized it. One long chunk would otherwise coarsen every chunk, silently. */
export function farSteps(chunks) {
  const ext = [0, 0, 0], by = [null, null, null]
  for (const c of chunks) for (const P of [c.pos, c.band]) for (let a = 0; a < 3; a++) {
    let lo = Infinity, hi = -Infinity
    for (let i = a; i < P.length; i += 3) { if (P[i] < lo) lo = P[i]; if (P[i] > hi) hi = P[i] }
    if (hi - lo > ext[a]) { ext[a] = hi - lo; by[a] = c.key }
  }
  if (ext.some(e => !(e > 0))) throw new Error(`farQuant: the far chunks have no extent on axis ${ext.findIndex(e => !(e > 0))} — no grid can be sized`)
  const step = ext.map(e => e / Q_SPAN), half = Math.hypot(...step) / 2, bound = NODE_BOUND / CLIP_SCALE
  if (half > bound) throw new Error(`farQuant: the town's grid rounds a position by up to ${(half * 1000).toFixed(3)} mm, past the kit's ${(bound * 1000).toFixed(3)} mm (NODE_BOUND) — sized by ${[0, 1, 2].map(a => `${'xyz'[a]} ${ext[a].toFixed(1)} m in chunk ${by[a]}`).join(', ')}. ▶ a chunk that long is the defect: shoreChunks.js#drapeChunks`)
  return step
}

/** A position on the grid: the decode of its encode, the same arithmetic (round(v/s) is the chunk's origin + its q). */
export const snap = (v, s) => (Math.round(v / s) || 0) * s   // || 0: a decode makes +0, never −0

export function encodePositions(P, step) {
  const origin = [0, 1, 2].map(a => { let o = Infinity; for (let i = a; i < P.length; i += 3) o = Math.min(o, Math.round(P[i] / step[a])); return o })
  const q = new Uint16Array(P.length)
  for (let i = 0; i < P.length; i++) {
    const n = Math.round(P[i] / step[i % 3]) - origin[i % 3]
    if (!(n >= 0 && n <= Q_MAX)) throw new Error(`farQuant: a position spans ${n} steps from its chunk's origin on axis ${i % 3}, past 16 bits — the grid was sized on other chunks`)
    q[i] = n
  }
  return { q, origin }
}
export function decodePositions(q, origin, step) {
  const P = new Float32Array(q.length)
  for (let i = 0; i < q.length; i++) P[i] = (origin[i % 3] + q[i]) * step[i % 3]
  return P
}

/** Octahedral, y up: (x, z) over the L1 norm, the lower half folded out. → [u, w] in −OCT…OCT. */
export function octEncode(x, y, z) {
  const l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1
  let u = x / l, w = z / l
  if (y < 0) { const fu = (1 - Math.abs(w)) * (u < 0 ? -1 : 1), fw = (1 - Math.abs(u)) * (w < 0 ? -1 : 1); u = fu; w = fw }
  return [Math.round(u * OCT) || 0, Math.round(w * OCT) || 0]   // || 0: −0 is what an int16 stores as 0, so the near's row is the bin's
}
/** → the unit normal, written into out at o. */
export function octDecode(qu, qw, out, o) {
  let x = qu / OCT, z = qw / OCT
  const y = 1 - Math.abs(x) - Math.abs(z)
  if (y < 0) { const fx = (1 - Math.abs(z)) * (x < 0 ? -1 : 1), fz = (1 - Math.abs(x)) * (z < 0 ? -1 : 1); x = fx; z = fz }
  const l = Math.hypot(x, y, z)
  out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l
}
export function encodeNormals(N) {
  const E = new Int16Array((N.length / 3) * 2)
  for (let i = 0; i < N.length / 3; i++) { const [u, w] = octEncode(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); E[i * 2] = u; E[i * 2 + 1] = w }
  return E
}
export function decodeNormals(E) {
  const N = new Float32Array((E.length / 2) * 3)
  for (let i = 0; i < E.length / 2; i++) octDecode(E[i * 2], E[i * 2 + 1], N, i * 3)
  return N
}

/** One far chunk, encoded: `far` is { pos, normal, pin, band, bandNormal, index } (Float32 / Uint32, as built).
 *  → { arrays (in FAR_ARRAYS' types), origin: { pos, band } }. */
export function encodeFarChunk(far, step) {
  const pos = encodePositions(far.pos, step), band = encodePositions(far.band, step), v = far.pin.length / 4
  return { origin: { pos: pos.origin, band: band.origin },
    arrays: { pin: far.pin, pos: pos.q, normal: encodeNormals(far.normal), band: band.q, bandNormal: encodeNormals(far.bandNormal), index: indexType(v).from(far.index) } }
}

/** One far chunk of a bin, decoded to what the player draws: { pos, normal, pin, band, bandNormal, index }.
 *  `c` is its table row (vertexCount, indexCount, offsets, origin), `step` the table's quant.step. */
export function decodeFarChunk(bin, c, step) {
  const v = c.vertexCount, o = c.offsets, view = (T, at, n) => new T(bin, at, n)
  return {
    pin: view(Float32Array, o.pin, v * 4),
    pos: decodePositions(view(Uint16Array, o.pos, v * 3), c.origin.pos, step),
    normal: decodeNormals(view(Int16Array, o.normal, v * 2)),
    band: decodePositions(view(Uint16Array, o.band, v * 3), c.origin.band, step),
    bandNormal: decodeNormals(view(Int16Array, o.bandNormal, v * 2)),
    index: view(indexType(v), o.index, c.indexCount),
  }
}
