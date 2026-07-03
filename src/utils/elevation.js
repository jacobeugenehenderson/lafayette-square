// Thin compatibility shim — the canonical home for V_EXAG, the bilinear
// sampler, and displaceGeometry is `src/lib/terrainCommon.js`. Terrain
// payload arrives via terrainShader.js's top-level-await of terrain.bin;
// this module re-uses that already-decoded Float32Array so the binary
// isn't parsed twice.
import { currentTerrain, onTerrainReload } from './terrainShader.js'
import { makeElevationSampler, V_EXAG } from '../lib/terrainCommon.js'

export { V_EXAG }

// Terrain is now loaded per-lookId and can be re-pointed live (authoring Stage
// switching installations), so the CPU sampler must rebuild on reload. Held in
// a mutable ref behind stable wrapper functions — same names + signatures as
// before, so every consumer is untouched; they just read the live heightfield.
let sampler = makeElevationSampler(currentTerrain())
onTerrainReload(() => { sampler = makeElevationSampler(currentTerrain()) })

export const getElevation    = (x, z) => sampler.getElevation(x, z)
export const getElevationRaw = (x, z) => sampler.getElevationRaw(x, z)
export const displaceGeometry = (geometry) => sampler.displaceGeometry(geometry)
