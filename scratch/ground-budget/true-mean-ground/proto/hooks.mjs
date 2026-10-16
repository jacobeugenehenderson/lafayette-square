const SB = new URL('./shoreBand.mjs', import.meta.url).href
const EDITS = {
  '/cartograph/terrainLoad.js': [
    ['export function loadSceneTerrain(scene) {', `import { wrapTerrain as __wrapShore } from '${SB}'\nexport function loadSceneTerrain(scene) { const __t = __loadSceneTerrain0(scene); return __t && __wrapShore(__t) }\nfunction __loadSceneTerrain0(scene) {`],
  ],
  '/cartograph/groundConformity.js': [
    ['sampler, band,', 'sampler, band, shore: refine?.shore ? { ...refine.shore, minEdgeSq: refine.shore.minEdge * refine.shore.minEdge } : null,'],
    ['inBand(pol, v0, v1, v2) && terrainDev(pol.sampler, v0, v1, v2) > pol.band.tol)',
     'inBand(pol, v0, v1, v2) && terrainDev(pol.sampler, v0, v1, v2) > pol.band.tol)\n          || (pol.shore && longest > pol.shore.minEdgeSq && pol.shore.inside((PX[v0] + PX[v1] + PX[v2]) / 3, (PZ[v0] + PZ[v1] + PZ[v2]) / 3) && terrainDev(pol.sampler, v0, v1, v2) > pol.shore.tol)'],
  ],
  '/cartograph/bake-ground.js': [
    ['maxEdge: refineMaxEdge, band: tideBand }', 'maxEdge: refineMaxEdge, band: tideBand, shore: __shorePolicy(deformTerrain.exag) }'],
    ["import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'", `import { shorePolicy as __shorePolicy } from '${SB}'\nimport { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'`],
  ],
}
export async function load(url, context, next) {
  const r = await next(url, context)
  const key = Object.keys(EDITS).find(k => url.endsWith(k))
  if (!key) return r
  let src = String(r.source)
  for (const [a, b] of EDITS[key]) {
    const n = src.split(a).length - 1
    if (n !== 1) throw new Error(`⛔ [shore-band proto] ${key}: expected the text once, found it ${n} time(s): ${a.slice(0, 80)}`)
    src = src.replace(a, b)
  }
  console.warn(`  ⚠️ [shore-band proto] ${key} rewritten in memory (${EDITS[key].length} edit(s))`)
  return { ...r, source: src, shortCircuit: true }
}
