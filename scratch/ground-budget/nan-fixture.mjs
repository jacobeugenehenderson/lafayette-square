// nan-fixture.mjs — CUT THE DEFORMER'S NaN SITE OUT OF A BAKE DUMP, as a check fixture (Tern, 2026-10-13).
// From a dump (deform.json: the deformer's own input), keeps the named tiles, every band polygon within REACH of them, the
// disc, the limits, and the terrain grid under them (a patch of terrain.bin with the full grid's frame, so the check samples
// it through the real `makeElevationSampler`). Line-less runs are stamped with their kind (`runKind`), as the bake does.
// The points it was cut for travel with it.
// CROP=<m> keeps only the bands and the terrain within that many metres of the points (the tiles stay whole: the deformer
// needs its rings); outside the patch the sampler reads 0, which is finite.
//   [CROP=150] node scratch/ground-budget/nan-fixture.mjs <dump dir> <out.json> <tile,tile,...> x,z [x,z ...]
import { readFileSync, writeFileSync } from 'fs'
const R = new URL('../../', import.meta.url).pathname
const [dump, out, tileList, ...pts] = process.argv.slice(2)
const meta = JSON.parse(readFileSync(dump + '/meta.json', 'utf8'))
const { mapTerrainPaths } = await import(R + 'cartograph/terrainLoad.js')
const { runKind } = await import(R + 'cartograph/lineHeight.mjs'), { ribbonsPathOf } = await import(R + 'cartograph/scene.js')
const bridgeIds = new Set((JSON.parse(readFileSync(ribbonsPathOf(meta.scene), 'utf8')).streets || []).filter(s => s?.gradeSeparated).map(s => s.skelId ?? s.name))
const A = JSON.parse(readFileSync(dump + '/deform.json', 'utf8'))
const keep = tileList.split(',').map(Number), tiles = keep.map(i => A.tiles[i])
for (const t of tiles) for (const run of t.runs || []) if (!Array.isArray(run.h)) run.noLine = runKind(run, bridgeIds)
// the reach: the deformer looks out to min(REACH, 60) + blend from ②; take 80 m + blend, generously
const M = 80 + A.limits.blend, crop = Number(process.env.CROP) || 0
let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
const box = crop ? pts.map(p => p.split(',').map(Number)) : tiles.flatMap(t => t.ring)
for (const [x, z] of box) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z) }
const pad = crop || M; x0 -= pad; z0 -= pad; x1 += pad; z1 += pad
const touches = (p) => (p.outer || []).some(([x, z]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)
const bands = Object.fromEntries(Object.entries(A.bands).map(([k, list]) => [k, list.filter(touches)]))
const P = mapTerrainPaths(meta.scene), TJ = JSON.parse(readFileSync(P.json, 'utf8')), buf = readFileSync(P.bin)
const data = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4), { width, height, bounds } = TJ
const gx = (x) => ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * (width - 1), gz = (z) => ((z - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * (height - 1)
const i0 = Math.max(0, Math.floor(gx(x0)) - 1), i1 = Math.min(width - 1, Math.ceil(gx(x1)) + 1), j0 = Math.max(0, Math.floor(gz(z0)) - 1), j1 = Math.min(height - 1, Math.ceil(gz(z1)) + 1)
const patch = []; for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) patch.push(+data[j * width + i])
const fx = { from: `${dump} (${meta.scene}, tol ${meta.refineTol}) · tiles ${keep.join(', ')}${crop ? ` · bands and terrain within ${crop} m of the points` : ''} · cut by scratch/ground-budget/nan-fixture.mjs`, scene: meta.scene,
  points: pts.map(p => p.split(',').map(Number)), deform: { tiles, bands, stencil: A.stencil, limits: A.limits },
  terrain: { width, height, bounds, patch: { i0, j0, w: i1 - i0 + 1, h: j1 - j0 + 1, data: patch } } }
writeFileSync(out, JSON.stringify(fx))
console.log(`wrote ${out}: ${tiles.length} tiles, bands ${Object.entries(bands).map(([k, l]) => `${k} ${l.length}`).join(' · ')}, terrain patch ${fx.terrain.patch.w}×${fx.terrain.patch.h}, ${(JSON.stringify(fx).length / 1e6).toFixed(2)} MB`)
