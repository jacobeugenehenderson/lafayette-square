// Thin compatibility shim — the canonical home for V_EXAG, the bilinear
// sampler, and displaceGeometry is `src/lib/terrainCommon.js`. Terrain
// payload arrives via terrainShader.js's top-level-await of terrain.bin;
// this module re-uses that already-decoded Float32Array so the binary
// isn't parsed twice.
import { width, height, bounds, data } from './terrainShader.js'
import { makeElevationSampler, V_EXAG } from '../lib/terrainCommon.js'

export { V_EXAG }

const sampler = makeElevationSampler({ width, height, bounds, data })
export const { getElevation, getElevationRaw, displaceGeometry } = sampler
