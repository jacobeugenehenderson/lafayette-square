/**
 * revetmentBuild.js — EVERYTHING THE SHORE'S STONE COSTS TO BUILD, AS PURE DATA IN AND OUT (2026-10-14).
 *
 * ⭐ ONE BUILDER, RUN OFF THE FRAME. `SlabRevetment` used to drape each 12 m chunk inside `useFrame`, every chunk within
 * reach in one frame: on Provincetown's flight into the plan that was ~3 s of script in one frame (Meridian's profile,
 * 2026-10-14). It now runs HERE, in a worker (`src/workers/revetment.worker.js`), and the component only chooses which
 * chunks are near and adopts what comes back. The inputs are DATA — the slab's `revetment.json`, the terrain field, and
 * the drawn ground's own bytes (`drawnGround.js#source`) — because a closure cannot cross a thread: the worker rebuilds
 * the same `partsAt` from the same bin, so the stone stands on exactly the ground the slab draws.
 * ▶ node checks/claims-the-shore-builds-off-the-frame.mjs — this builder's output, through a structured clone, against
 *   the in-frame composition it replaced, byte for byte, on Provincetown and Huron.
 *
 * ⛔ NOT A SECOND IMPLEMENTATION: `revetmentFromSlab.js`, `revetmentDrape.js` and `shoreChunks.js` do all the work, as
 * before; this module is only the composition the component used to hold (its faces memo, its near loop, its far layer
 * and `groundRelative`), moved so a worker can run it.
 */
import { revetmentDrape, drapeGlobals } from './revetmentDrape.js'
import { shoreContext, chunkStones, CHUNK_M } from './shoreChunks.js'
import { revetmentFaces, toeFor } from './revetmentFromSlab.js'
import { MIN_ARMOUR_D50_M } from '../../cartograph/shore-armour.mjs'
import { makeDrawnGround, partsOrField, isDrawnGroundGroup } from './drawnGround.js'
import { makeElevationSampler, terrainIdentity } from './terrainCommon.js'

/** The near layer's detail. */
export const NEAR_OCTAVES = 3

/** ⭐ THE FAR LAYER'S RESOLUTION, and it is measured, not chosen by taste.
 *  ▶ node scratch/boulder-farfield-cost.mjs · node scratch/boulder-lod-deviation.mjs
 *  Octaves 1 builds the WHOLE armoured shore of huron for ~23.5k triangles, against
 *  ~441k at the near layer's octaves 3 — and its median deviation from that near
 *  surface is at or below the measurement's own noise floor, i.e. the two are the
 *  same shape and differ only in detail. Octaves 2 halves the remaining deviation
 *  for 4x the triangles, which buys ~2 px at the swap distance while several hundred
 *  BOULDERS appear at the same moment. Not worth it. ⛔ Octaves 0 is identical to 1
 *  by construction (lamMin = lam0 / 2^max(0, octaves-1)), so 1 is the floor. */
export const FAR_OCTAVES = 1

let _saidNoBerm = false
let _saidNoLevel = false

/** The ground a worker reads: the drawn ground rebuilt from its own bytes, else (before it has loaded) the field. */
export function groundFrom({ terrain, ground }) {
  const rawAt = makeElevationSampler(terrain, 1).getElevationRaw
  const drawn = ground ? makeDrawnGround(ground.manifest, ground.bin, { rawAt, cell: ground.cell }) : null
  return (x, z) => partsOrField(drawn, rawAt, x, z)
}

/**
 * The buildable faces and their chunk lattices — the component's faces memo, verbatim.
 * ⚠️ `drapeGlobals` is ARC-GLOBAL on purpose: every chunk of a face derives its vertices from the same lattice, which is
 * what makes the seam exact rather than approximately exact.
 * @param partsAt (x, z) → { raw, y }: the drawn ground's two parts · @param floorM how deep the bottom shows
 *        (terrainBed().visibleToM) · @param paletteSize the boulder palette's length
 */
export function revetmentFacesFor(doc, { partsAt, floorM, paletteSize }) {
  if (!doc) return []
  // The DRAWN ground at exaggeration 1 — what the revetment is built against, so the stone meets the ground the slab
  // draws, never the field under it (BRIEF-the-ground-knows-its-height §4.5).
  const drawnAt1 = (x, z) => { const g = partsAt(x, z); return g.raw + g.y }
  return revetmentFaces(doc).filter(f => f.anyArmour).map(f => {
    if (f.levelM == null && !_saidNoLevel) { _saidNoLevel = true; console.warn('[SlabRevetment] ⛔ this revetment.json predates the water levels — its heaps stand on the terrain\'s zero, not the town\'s high water. ▶ re-bake the revetment') }
    const waterY = f.levelM ?? 0
    // ⭐ The heap runs on below the water to rest on the bed, down to where the bottom stops showing: the toe runs down
    // to the bed, at least one course below the LOW level (so it stays under water at low tide), and no shallower than
    // the depth the bottom can be seen to.
    const toeFloor = Math.max(floorM, f.lowM != null ? waterY - f.lowM + MIN_ARMOUR_D50_M : 0)
    const toeAt = toeFor(f, drawnAt1, toeFloor, waterY)
    if (!f.toeBerm && !_saidNoBerm) { _saidNoBerm = true; console.warn('[SlabRevetment] ⛔ this revetment.json carries no material.toeBerm — the heaps have no toe berm. ▶ re-bake the revetment') }
    f = { ...f, toeAt, berm: f.toeBerm, groundAt: drawnAt1, waterY }
    const G = drapeGlobals({ poly: f.poly, crestAt: f.crestAt, toeAt, berm: f.berm, octaves: NEAR_OCTAVES })
    const per = Math.max(4, Math.round(CHUNK_M / G.step))
    const ranges = []
    for (let i = 0; i < G.nAlong - 1; i += per) ranges.push([i, Math.min(G.nAlong - 1, i + per)])
    // Where each drape chunk sits, so the camera can pick by distance instead of by walking the whole arc every time.
    const at = ranges.map(([a, b]) => {
      const m = f.poly[Math.min(f.poly.length - 1, Math.round(((a + b) / 2 / (G.nAlong - 1)) * (f.poly.length - 1)))]
      return m || f.poly[0]
    })
    const ctx = shoreContext({ poly: f.poly, crestAt: f.crestAt, taperAt: f.taperAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, oversample: 10, paletteSize, seed: doc.seed })
    // Where each STONE chunk sits (its own lattice, `CHUNK_M` along the arc).
    const n = ctx.nChunks
    const stoneAt = Array.from({ length: n }, (_, ci) => f.poly[Math.min(f.poly.length - 1, Math.round(((ci + 0.5) / n) * (f.poly.length - 1)))])
    return { ...f, G, ranges, at, ctx, stoneAt }
  })
}

/** How far from the camera the DETAILED drape and the stones are built, metres.
 *  ⛔ A BUDGET, not a look: it sets how much work one camera move can trigger.
 *  ⛔⛔ AND IT IS NO LONGER WHERE THE WALL ENDS. It used to gate both loops with
 *  nothing beyond it, so the revetment did not degrade at distance — it VANISHED,
 *  which is the one thing Jacob's close-inspection ruling forbids ("never an LOD
 *  that degrades to nothing"). Nobody decided that; the radius was inherited from
 *  the harness, which only ever looked at one arc from close up, and it was simply
 *  the only mechanism present. The far layer (`FAR_OCTAVES`) is the other half. */
export const NEAR_RADIUS_M = 90

/** ⭐ WHAT LIES WITHIN REACH OF (x, z), nearest first — the near lane's ONE rule, read by `SlabRevetment` on every reselect
 *  and by checks/claims-the-shore-builds-off-the-frame.mjs to find where a town's own camera path crosses the shore.
 *  Distance is in plan (x, z), to each face's drape-chunk stations (`at`) and stone-chunk stations (`stoneAt`).
 *  @param faces faceMeta[] · @returns [{ type: 'near', face, k } | { type: 'stones', face, ci }] */
export function withinReach(faces, x, z) {
  const out = []
  for (const [fi, f] of faces.entries()) {
    f.at.forEach((p, k) => { const d = Math.hypot(p.x - x, p.z - z); if (d <= NEAR_RADIUS_M) out.push({ d, req: { type: 'near', face: fi, k } }) })
    f.stoneAt.forEach((p, ci) => { const d = Math.hypot(p.x - x, p.z - z); if (d <= NEAR_RADIUS_M) out.push({ d, req: { type: 'stones', face: fi, ci } }) })
  }
  return out.sort((a, b) => a.d - b.d).map(o => o.req)
}

/** What the selecting thread needs of a face: where its drape and stone chunks sit. Plain data. */
export const faceMeta = (f) => ({ key: f.key, at: f.at.map(p => ({ x: p.x, z: p.z })), stoneAt: f.stoneAt.map(p => ({ x: p.x, z: p.z })) })

/**
 * ⭐ THE DRAPE, GROUND-RELATIVE (Argon, 2026-10-07), as plain arrays. Each vertex's drawn TERRAIN part moves out of the
 * geometry into an `aRaw` attribute and the shader's baked lift (aRaw × uExag — the ground's own law), so the stone rides
 * the live exaggeration like the drawn ground beneath it; the ground's own unexaggerated part stays in the geometry. The
 * bounds are taken first, from the drawn exag-1 positions. `revetmentDrape` itself stays absolute: the checks read real
 * heights.
 */
export function groundRelativePlain(built, partsAt) {
  const g = built?.geometry
  if (!g) return null
  g.computeBoundingSphere(); g.computeBoundingBox()
  const p = g.attributes.position, raw = new Float32Array(p.count)
  for (let i = 0; i < p.count; i++) { raw[i] = partsAt(p.getX(i), p.getZ(i)).raw; p.setY(i, p.getY(i) - raw[i]) }
  const attributes = {}
  for (const [name, a] of Object.entries(g.attributes)) attributes[name] = { array: a.array, itemSize: a.itemSize, normalized: a.normalized }
  attributes.aRaw = { array: raw, itemSize: 1, normalized: false }
  const b = g.boundingBox, s = g.boundingSphere
  return { attributes, index: g.index ? g.index.array : null, box: [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z], sphere: [s.center.x, s.center.y, s.center.z, s.radius], tris: built.stats?.tris ?? 0 }
}

/** One near drape chunk (`k` of the face's `ranges`), ground-relative, plain. */
export function nearChunk(f, k, partsAt) {
  return groundRelativePlain(revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, octaves: NEAR_OCTAVES, globals: f.G, stations: f.ranges[k] }), partsAt)
}

/**
 * THE FAR LAYER of one face — the whole armoured face, coarse — built CHUNK BY CHUNK on its own lattice, one far chunk per
 * near chunk, and merged into one geometry with each chunk's index span recorded (`spans[k] = [start, count]`), so the
 * component can draw the far layer EXCEPT where the near layer is drawn (`farIndex`). ⛔ It used to be hidden for the
 * whole face whenever any near chunk of it was drawn, so the rest of a long face (up to ~10 km) drew nothing at all —
 * and a half-built near set showed a hole. ▶ checks/claims-the-shore-builds-off-the-frame.mjs (no chunk is ever neither).
 * Far chunk k spans the far stations from floor to ceil of near chunk k's, so neighbours share their end station and a
 * far chunk reaches over its near neighbour's edge by under one far step rather than short of it.
 */
export function farFace(f, partsAt) {
  const FG = drapeGlobals({ poly: f.poly, crestAt: f.crestAt, octaves: FAR_OCTAVES })
  const r = (FG.nAlong - 1) / (f.G.nAlong - 1)
  const parts = f.ranges.map(([a, b]) => {
    const fa = Math.floor(a * r), fb = Math.min(FG.nAlong - 1, Math.max(fa + 1, Math.ceil(b * r)))
    return groundRelativePlain(revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, octaves: FAR_OCTAVES, globals: FG, stations: [fa, fb] }), partsAt)
  })
  return mergePlain(parts)
}

/** Several plain geometries as one, with each part's index span — positions concatenated, indices offset (Uint32). */
export function mergePlain(parts) {
  const live = parts.filter(p => p && p.index && p.tris)
  if (!live.length) return null
  const names = Object.keys(live[0].attributes)
  const attributes = {}
  for (const n of names) {
    const { itemSize, normalized, array } = live[0].attributes[n]
    const out = new array.constructor(live.reduce((s, p) => s + p.attributes[n].array.length, 0))
    let o = 0; for (const p of live) { out.set(p.attributes[n].array, o); o += p.attributes[n].array.length }
    attributes[n] = { array: out, itemSize, normalized }
  }
  const index = new Uint32Array(live.reduce((s, p) => s + p.index.length, 0)), spans = []
  let vo = 0, io = 0
  for (const p of parts) {
    if (!(p && p.index && p.tris)) { spans.push([io, 0]); continue }
    for (let i = 0; i < p.index.length; i++) index[io + i] = p.index[i] + vo
    spans.push([io, p.index.length]); io += p.index.length; vo += p.attributes.position.array.length / 3
  }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (const p of live) for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d], p.box[d]); hi[d] = Math.max(hi[d], p.box[d + 3]) }
  const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], rad = Math.hypot(hi[0] - c[0], hi[1] - c[1], hi[2] - c[2])
  return { attributes, index, spans, box: [...lo, ...hi], sphere: [...c, rad], tris: index.length / 3 }
}

/** The far layer's index with the chunks the near layer draws left out: every chunk is drawn by exactly one layer. */
export function farIndex(far, nearDrawn) {
  let n = 0
  far.spans.forEach(([, count], k) => { if (!nearDrawn.has(k)) n += count })
  const out = new Uint32Array(n)
  let o = 0
  far.spans.forEach(([start, count], k) => { if (!nearDrawn.has(k)) { out.set(far.index.subarray(start, start + count), o); o += count } })
  return out
}

/** The stones of stone chunk `ci`, ground-relative: the drawn ground's two parts ride along as `ground` + `groundY` (the
 *  lift's aGround). ⭐ margin 2 is MEASURED, not chosen: at margin 1 four stones go missing at a seam, at 2 the two
 *  windows resolve identically. */
export function stoneChunk(f, ci, partsAt) {
  return chunkStones(f.ctx, ci, 2).map(st => { const g = partsAt(st.p[0], st.p[2]); return { ...st, p: [st.p[0], st.p[1] - g.raw - g.y, st.p[2]], ground: g.raw, groundY: g.y } })
}

/**
 * ⭐ THE WORKER READS THE SLAB ITSELF, off the main thread. A postMessage of Provincetown's ground bin (56 MB) and terrain
 * (18 MB) cost the main thread ~42 ms (node's structured clone, 2026-10-14) — and they cannot be TRANSFERRED: BakedGround
 * draws through views on that very bin. So the component sends URLs — the ones BakedGround and `fetchTerrain` fetched,
 * resolved by `slabUrl` — and what the bytes must turn out to be; the worker fetches them and REFUSES, loudly, if they are
 * not the ground and the terrain the main thread draws (`terrainIdentity`; the bin's length and the sampled groups). A stone
 * stood on a different ground than the one under it would be a plausible-looking wrong shore.
 * @param m { gen, urls: { revetment, terrainBin }, terrain: { width, height, bounds, identity } | { …, data } (inline when
 *   the town has no terrain), ground: null | { manifest: url, bin: url, expect: { binBytes, groups: [id], cell } }, floorM,
 *   paletteSize } · @param fetchFn the fetch to read with (the check passes one that reads files)
 * @returns the `init` message `makeRevetmentBuilder` takes
 */
export async function loadRevetmentInit(m, fetchFn = fetch) {
  const get = async (url, how) => { const r = await fetchFn(url); if (!r.ok) throw new Error(`revetment worker: ${url} answered HTTP ${r.status}`); return r[how]() }
  const T = m.terrain
  const [doc, tbin] = await Promise.all([get(m.urls.revetment, 'json'), T.data ? null : get(m.urls.terrainBin, 'arrayBuffer')])
  const terrain = T.data ? { width: T.width, height: T.height, bounds: T.bounds, data: T.data } : { width: T.width, height: T.height, bounds: T.bounds, data: new Float32Array(tbin) }
  if (!T.data && terrainIdentity(terrain) !== T.identity) throw new Error(`revetment worker: ⛔ the terrain at ${m.urls.terrainBin} is ${terrainIdentity(terrain)}, the main thread draws ${T.identity} — refusing to stand the stone on another ground`)
  let ground = null
  if (m.ground) {
    const [gm, bin] = await Promise.all([get(m.ground.manifest, 'json'), get(m.ground.bin, 'arrayBuffer')])
    const groups = gm.groups.filter(isDrawnGroundGroup), E = m.ground.expect
    if (bin.byteLength !== E.binBytes || groups.map(g => g.id).join('|') !== E.groups.join('|'))
      throw new Error(`revetment worker: ⛔ the ground at ${m.ground.bin} (${bin.byteLength} bytes, ${groups.length} sampled group(s)) is not the ground the main thread draws (${E.binBytes} bytes, ${E.groups.length}) — refusing to stand the stone on another ground`)
    ground = { manifest: { groups, bbox: gm.bbox }, bin, cell: E.cell }
  }
  return { type: 'init', gen: m.gen, doc, terrain, ground, floorM: m.floorM, paletteSize: m.paletteSize }
}

/**
 * The worker's whole state machine, as a function of messages — so the check can run it on the main thread of node, through
 * the same structured clone a postMessage applies.
 *   { type: 'init', gen, doc, terrain, ground, floorM, paletteSize } → { type: 'faces', gen, faces: [faceMeta] }
 *   { type: 'near', gen, face, k }  → { type: 'near', gen, face, k, plain }
 *   { type: 'far', gen, face }      → { type: 'far', gen, face, plain }
 *   { type: 'stones', gen, face, ci } → { type: 'stones', gen, face, ci, stones }
 * @returns { reply, transfer } — `transfer` lists the reply's ArrayBuffers, moved back rather than copied.
 */
export function makeRevetmentBuilder() {
  let S = null
  const buffers = (plain) => plain ? [...new Set([...Object.values(plain.attributes).map(a => a.array.buffer), ...(plain.index ? [plain.index.buffer] : [])])] : []
  return function handle(m) {
    if (m.type === 'init') {
      const partsAt = groundFrom(m)
      const faces = revetmentFacesFor(m.doc, { partsAt, floorM: m.floorM, paletteSize: m.paletteSize })
      S = { gen: m.gen, partsAt, faces }
      return { reply: { type: 'faces', gen: m.gen, faces: faces.map(faceMeta) }, transfer: [] }
    }
    if (!S || m.gen !== S.gen) return { reply: { type: 'stale', gen: m.gen, req: m }, transfer: [] }
    const f = S.faces[m.face]
    if (m.type === 'near') { const plain = nearChunk(f, m.k, S.partsAt); return { reply: { type: 'near', gen: m.gen, face: m.face, k: m.k, plain }, transfer: buffers(plain) } }
    if (m.type === 'far') { const plain = farFace(f, S.partsAt); return { reply: { type: 'far', gen: m.gen, face: m.face, plain }, transfer: buffers(plain) } }
    if (m.type === 'stones') return { reply: { type: 'stones', gen: m.gen, face: m.face, ci: m.ci, stones: stoneChunk(f, m.ci, S.partsAt) }, transfer: [] }
    throw new Error(`revetmentBuild: unknown message ${m.type}`)
  }
}
