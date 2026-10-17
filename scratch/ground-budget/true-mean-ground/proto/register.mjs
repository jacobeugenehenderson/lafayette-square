// register.mjs — overnight job 4 (Boz): a SCRATCH PROTOTYPE of Phase B's shore band in the ground bake, not the build.
// `node --import ./register.mjs bake-ground.js …` rewrites three production modules IN MEMORY ONLY (nothing on disk changes):
//   · cartograph/terrainLoad.js#loadSceneTerrain → its sampler's heights + the band's 1 m residual inside the band (shoreBand.mjs)
//   · cartograph/groundConformity.js → a second band policy, `shore`: split where the triangle's centroid is a band cell,
//     its edge is longer than the band's 1 m cell, and the terrain bends more than the band's tolerance
//   · cartograph/bake-ground.js → hands every adaptive group that shore policy (beside the tide band, unchanged)
// Every rewrite must find its exact text, or the bake refuses (a prototype that silently did nothing would be a lie).
import { register } from 'node:module'
register(new URL('./hooks.mjs', import.meta.url))
