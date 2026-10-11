// owner-meet.mjs — where do two owners' bands MEET, and with what height gap? (the band decides, Jacob 2026-10-11)
// Rebuild the deformer from the bake's dumped inputs; over every ped triangle of a baked slab (curb · treelawn:* ·
// sidewalk), resolve each vertex's owner and D; an edge whose two ends have different owners is a meeting; its fall at
// the ceiling, E·|ΔD| / length, against the walk limit. READ-ONLY.
//   node scratch/ground-height/owner-meet.mjs <scene> <dump inputs.json> <slab dir>
import { readFileSync } from 'fs'
import { join } from 'path'
const R = new URL('../../', import.meta.url).pathname
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js')
const { buildDeformer } = await import(R + (process.env.NEARER ? 'scratch/ground-height/groundDeformer.nearer.mjs' : 'cartograph/groundDeformer.mjs'))
const { resolveWalkNorm, resolveLawnNorm } = await import(R + 'cartograph/curb-cut-norm.mjs')
const [scene, dumpP, dir] = process.argv.slice(2)
const dump = JSON.parse(readFileSync(dumpP)), T = loadSceneTerrain(scene), E = T.exag, lim = resolveWalkNorm(scene).crossSlopeMax
const D = buildDeformer({ tiles: dump.tiles, bands: dump.bands, stencil: dump.stencil, raw: T.getElevationRaw,
  limits: { walkMax: lim, lawnMax: resolveLawnNorm(scene).slopeMax ?? null, exag: E, blend: T.stepM, sigma: T.stepM } })
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'))), gb = readFileSync(join(dir, 'ground.bin')), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const edges = new Map(), t0 = Date.now()
let nV = 0
const vk = (x, z) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`
const at = new Map()
const get = (x, z) => { const k = vk(x, z); let r = at.get(k); if (!r) { r = { v: D.heightAt(x, z), o: D.ownerAt(x, z), x, z }; at.set(k, r); nV++ } return r }
for (const g of gj.groups) {
  if (!(g.id === 'curb' || g.id === 'sidewalk' || g.id.startsWith('treelawn'))) continue
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  for (let i = 0; i < I.length; i += 3) for (const [a, b] of [[I[i], I[i + 1]], [I[i + 1], I[i + 2]], [I[i + 2], I[i]]]) {
    const A = get(P[a * 3], P[a * 3 + 2]), B = get(P[b * 3], P[b * 3 + 2])
    if (A.o == null || B.o == null || A.o === B.o) continue
    const L = Math.hypot(A.x - B.x, A.z - B.z); if (L < 1e-6) continue
    const k = [vk(A.x, A.z), vk(B.x, B.z)].sort().join('|'); if (edges.has(k)) continue
    edges.set(k, { fall: E * Math.abs(A.v - B.v) / L, gap: E * Math.abs(A.v - B.v), L, g: g.id, o: [A.o, B.o].sort().join(' ⟷ '), at: [A.x, A.z] })
  }
}
const all = [...edges.values()], over = all.filter(e => e.fall > lim)
console.log(`${nV} ped vertices resolved in ${((Date.now() - t0) / 1000).toFixed(0)}s · ${all.length} edges where the owner changes · ${over.length} of them fall more than the walk limit across the change`)
const q = (a, p) => a.length ? a[Math.floor(p * (a.length - 1))] : NaN
const gaps = over.map(e => e.gap).sort((a, b) => a - b)
console.log(`  their height gap: p50 ${(q(gaps, .5) * 100).toFixed(1)} cm · p90 ${(q(gaps, .9) * 100).toFixed(1)} cm · max ${(gaps.at(-1) * 100).toFixed(1)} cm · over 5 cm ${gaps.filter(g => g > 0.05).length} · over 25 cm ${gaps.filter(g => g > 0.25).length}`)
const by = new Map(); for (const e of over) { const s = by.get(e.o) || { n: 0, max: 0, at: e.at }; s.n++; if (e.gap > s.max) { s.max = e.gap; s.at = e.at } by.set(e.o, s) }
console.log(`  ${by.size} owner pairs; the largest gaps:`)
for (const [o, s] of [...by].sort((a, b) => b[1].max - a[1].max).slice(0, 12)) console.log(`    ${o}: ${s.n} edge(s), gap up to ${(s.max * 100).toFixed(1)} cm at (${s.at.map(v => v.toFixed(1))})`)
console.log('stats', JSON.stringify(D.stats))
