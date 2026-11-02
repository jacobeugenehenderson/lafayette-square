/**
 * revetmentNear.js — the near layer's stones, built ONCE per chunk, and the near set's identity.
 *
 * ⭐ WHY (Usher, 2026-11-02; BRIEF-a-frame-budget-for-every-shot): SlabRevetment's near layer reselects on every camera move
 * past RESELECT_M / RESELECT_RAD, i.e. nearly every frame of a flight. The drape was cached per chunk (`f.cache`); the stones
 * were not: every reselect re-ran chunkStones → resolveWindow (five chunks of candidates pooled, sorted and settled) and a
 * drawn-ground read per stone, then handed React new arrays. Profiled at 4× on the Home → Society flight: 1.3–1.8 s of a
 * 1.8–2.4 s frame on Huron and Provincetown (▶ scratch/frame-budget/usher/spike-analyse.mjs).
 *
 * A stone chunk is a PURE function of the face (its shore context: poly, crest, toe, berm, the drawn ground at exag 1, the
 * seed) and the drawn ground's parts at each stone. So it is built once and kept on the face, beside the drape's cache.
 * ⭐ WHAT CLEARS IT: exactly what rebuilds the faces (SlabRevetment's `faces` memo on [doc, palette, groundGen]): a town
 * switch or a re-bake (doc), the terrain reloading (onTerrainReload) and the drawn ground re-pointing (onDrawnGround,
 * which setDrawnGround fires on every set). Nothing else may: the exaggeration is the shader's (the stones are
 * ground-relative), and the tide is a uniform.
 * ⭐ AND IT IS BOUNDED BY THE WINDOW, never by a count (Zob's condition, 2026-11-02): measured on Huron, the whole shore once is
 * 3,739 stone chunks and 1.1 M stones at ~71 KB a chunk (464 B a stone), so a session that toured it would hold ~265 MB. The
 * cache keeps the stone chunks of the CURRENT near set and the one BEFORE it (`retainStones`): a camera crossing a chunk
 * boundary and back builds nothing twice, and the bound is two near sets, whatever the town. The shore's own candidate memo
 * (shoreChunks.js, ~168 KB a chunk on Huron, unbounded before) is kept to the same window (shoreChunks.js#retainCandidates).
 * ▶ node checks/claims-a-reselect-reuses-what-it-built.mjs [--mutants]
 */
import { chunkStones, shoreContext, retainCandidates } from './shoreChunks.js'

/** The context a stone chunk is settled in, chunks on each side (shoreChunks.js#chunkStones). ⭐ MEASURED, not chosen: at 1
 *  four stones go missing at a seam, at 2 the two windows resolve identically (SlabRevetment, 2026-10-29). */
export const STONE_MARGIN = 2

/** A face's stone context: the shore every stone chunk of it is resolved against (shoreChunks.js#shoreContext), from the
 *  face as SlabRevetment seats it (its toe, berm, drawn ground at exag 1 and water) and the town's palette size and seed.
 *  ⭐ One construction, read by the player and by the check, so neither restates the other. */
export const stoneContext = (f, { paletteSize, seed }) => shoreContext({ poly: f.poly, crestAt: f.crestAt, taperAt: f.taperAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, oversample: 10, paletteSize, seed })

/** The stones of stone chunk `ci` of face `f`, ground-relative (`p` less the drawn ground's two parts, which ride along as
 *  `ground` + `groundY`, the instanced lift's aGround), built once and kept in `f.stones`. `partsAt(x, z)` is the drawn
 *  ground's parts (elevation.js#drawnGroundParts in the player). ⛔ A face without its `stones` map is a face built by
 *  another path: said, never a fresh map that would silently cache nothing across reselects. */
export function stonesOf(f, ci, partsAt) {
  if (!(f.stones instanceof Map)) throw new Error(`[revetment] ⛔ face ${f.key} carries no stones cache — it was not built by SlabRevetment's faces`)
  const hit = f.stones.get(ci)
  if (hit) return hit
  const out = []
  for (const st of chunkStones(f.ctx, ci, STONE_MARGIN)) { const g = partsAt(st.p[0], st.p[2]); out.push({ ...st, p: [st.p[0], st.p[1] - g.raw - g.y, st.p[2]], ground: g.raw, groundY: g.y }) }
  f.stones.set(ci, out)
  return out
}

/** Keep, in each face's `stones`, only the chunks of the current near set (`now`) and the previous one (`before`), each a
 *  list of [face, ci], and in its candidate memo only what their windows read; the rest are dropped. Faces that are not `faces` (a set from before the faces were rebuilt) keep nothing. */
export function retainStones(faces, now, before = []) {
  const keep = new Map(faces.map(f => [f, new Set()]))
  for (const [f, ci] of now) keep.get(f)?.add(ci)
  for (const [f, ci] of before) keep.get(f)?.add(ci)
  for (const f of faces) {
    for (const ci of [...f.stones.keys()]) if (!keep.get(f).has(ci)) f.stones.delete(ci)
    // ⭐ the candidates too: only those the kept chunks' windows read (one bounded policy for the shore's memory)
    retainCandidates(f.ctx, keep.get(f), STONE_MARGIN)
  }
}

/** The near set's identity: the drawn drape chunks and the stone chunks, in the order they are built. Two reselects with
 *  the same signature draw the same thing, so the second hands React nothing. */
export const nearSignature = (drapeKeys, stoneKeys) => `${drapeKeys.join(',')}|${stoneKeys.join(',')}`
