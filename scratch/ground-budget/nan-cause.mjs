// nan-cause.mjs — WHERE DOES THE DEFORMER'S NaN COME FROM? READ-ONLY (Tern, 2026-10-13; Brace's nan-probe found it).
// Builds the deformer from a bake dump (deform.json, as bake-ground hands it) and asks heightAt at given points. Run with an
// instrumented groundDeformer swapped in (SWAP_MAP) that records, where the profile's absorption is non-finite, the
// stations it interpolated between (globalThis.__NAN).
//   SWAP_MAP=… node --import ./scratch/kerb-cut/swap.mjs scratch/ground-budget/nan-cause.mjs <dump dir> x,z [x,z ...]
import { readFileSync } from 'fs'
const R = new URL('../../', import.meta.url).pathname
const [dump, ...pts] = process.argv.slice(2)
const meta = JSON.parse(readFileSync(dump + '/meta.json', 'utf8'))
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js'), T = loadSceneTerrain(meta.scene)
const { runKind } = await import(R + 'cartograph/lineHeight.mjs'), { ribbonsPathOf } = await import(R + 'cartograph/scene.js')
const bridgeIds = new Set((JSON.parse(readFileSync(ribbonsPathOf(meta.scene), 'utf8')).streets || []).filter(s => s?.gradeSeparated).map(s => s.skelId ?? s.name))
const A = JSON.parse(readFileSync(dump + '/deform.json', 'utf8'))
for (const t of A.tiles) for (const run of t.runs || []) if (!Array.isArray(run.h)) run.noLine = runKind(run, bridgeIds)
const { buildDeformer } = await import(R + 'cartograph/groundDeformer.mjs')
const D = buildDeformer({ ...A, raw: T.getElevationRaw })
for (const p of pts) { const [x, z] = p.split(',').map(Number); globalThis.__NAN = null
  const h = D.heightAt(x, z)
  console.log(`(${x}, ${z}) heightAt ${h} · owner ${D.ownerAt?.(x, z)}${globalThis.__NAN ? ` · NON-FINITE ABSORPTION: ${JSON.stringify(globalThis.__NAN)}` : ''}`) }
