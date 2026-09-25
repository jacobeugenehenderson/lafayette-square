/**
 * shoreRuns.mjs — the shoreline as the slab stores it: every `__water__` run in
 * shape.json, deduped. One reader for every bake that needs the coast.
 *
 * A run appears on every tile that shares it, so runs are deduped by their WHOLE
 * polyline (either direction), never by tile index — the live pass and the frozen
 * artifact number tiles differently.
 * ▶ node checks/claims-coast-distance-is-the-coast.mjs
 */
export const WATER_EDGE_SKEL = '__water__'   // tileGround.js's id for the stroked coast

/** @returns {Array<Array<[number, number]>>} one polyline per distinct run */
export function waterRuns(shape) {
  const seen = new Set(), out = []
  for (const t of (shape?.tiles || [])) for (const r of (t.runs || [])) {
    if (r.skelId !== WATER_EDGE_SKEL || !Array.isArray(r.poly) || r.poly.length < 2) continue
    const fwd = JSON.stringify(r.poly), rev = JSON.stringify([...r.poly].reverse())
    const k = fwd < rev ? fwd : rev
    if (!seen.has(k)) { seen.add(k); out.push(r.poly.map(p => [p[0], p[1]])) }
  }
  return out
}
