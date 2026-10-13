// Does a deformer's heightAt return NaN at given points? With explain() and the owner there (Brace, 2026-10-13).
//   node scratch/ground-budget/nan-probe.mjs <dump> <groundDeformer.mjs> <lineHeight.mjs> x,z [x,z ...]
import { readFileSync } from 'fs'
import { resolve } from 'path'
const R = new URL('../../', import.meta.url).pathname
const [dump, def, lhp, ...pts] = process.argv.slice(2)
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js'), meta = JSON.parse(readFileSync(dump + '/meta.json', 'utf8')), T = loadSceneTerrain(meta.scene)
const { runKind } = await import(resolve(lhp)), { ribbonsPathOf } = await import(R + 'cartograph/scene.js')
const bridgeIds = new Set((JSON.parse(readFileSync(ribbonsPathOf(meta.scene), 'utf8')).streets || []).filter(s => s?.gradeSeparated).map(s => s.skelId ?? s.name))
const A = JSON.parse(readFileSync(dump + '/deform.json', 'utf8')); for (const t of A.tiles) for (const run of t.runs || []) if (!Array.isArray(run.h)) run.noLine = runKind(run, bridgeIds)
const { buildDeformer } = await import(resolve(def)), D = buildDeformer({ ...A, raw: T.getElevationRaw })
for (const p of pts) { const [x, z] = p.split(',').map(Number), h = D.heightAt(x, z), ex = D.explain?.(x, z)
  console.log(`(${x}, ${z}) heightAt ${h} · raw ${T.getElevationRaw(x, z).toFixed(3)} · owner ${D.ownerAt?.(x, z)} · explain ${JSON.stringify(ex)?.slice(0, 260)}`) }
