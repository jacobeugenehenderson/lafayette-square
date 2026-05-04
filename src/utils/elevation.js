// Thin compatibility shim — the canonical home for V_EXAG, the bilinear
// sampler, and displaceGeometry is `src/lib/terrainCommon.js`. This file
// constructs the runtime sampler against the vite-imported terrain.json
// and re-exports the bound functions so existing call sites keep working.
import terrainData from '../data/terrain.json'
import { makeElevationSampler, V_EXAG } from '../lib/terrainCommon.js'

export { V_EXAG }

const sampler = makeElevationSampler(terrainData)
export const { getElevation, getElevationRaw, displaceGeometry } = sampler
