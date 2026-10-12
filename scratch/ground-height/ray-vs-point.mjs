// ray-vs-point.mjs — at one point, for each owner candidate: the deformer's RAY reading (bandsAlong, crossing parity) beside
// POINT sampling along the SAME ray (every 1 mm, each class by its own point-in-polygon), and every painted ring edge the
// ray crosses in between. Where they disagree, the crossing list names the edge. READ-ONLY.
//   node scratch/ground-height/ray-vs-point.mjs <scene> <dump inputs.json> x,z [x,z ...]
import { readFileSync } from 'fs'
const R = new URL('../../', import.meta.url).pathname
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js')
const { buildDeformer } = await import(R + 'scratch/ground-height/groundDeformer.probe.mjs')
const { resolveWalkNorm, resolveLawnNorm } = await import(R + 'cartograph/curb-cut-norm.mjs')
const [scene, dumpP, ...pts] = process.argv.slice(2)
const dump = JSON.parse(readFileSync(dumpP)), T = loadSceneTerrain(scene)
const D = buildDeformer({ tiles: dump.tiles, bands: dump.bands, stencil: dump.stencil, raw: T.getElevationRaw,
  limits: { walkMax: resolveWalkNorm(scene).crossSlopeMax, lawnMax: resolveLawnNorm(scene).slopeMax ?? null, exag: T.exag, blend: T.stepM, sigma: T.stepM } })
const ringsOf = (items) => items.flatMap(it => Array.isArray(it?.[0]) && typeof it[0][0] === 'number' ? [it] : [it.outer, ...(it.holes || [])]).filter(r => r?.length >= 3)
const rings = { walk: ringsOf(dump.bands.walk), lawn: ringsOf(dump.bands.lawn), curb: ringsOf(dump.bands.curb), beyond: dump.stencil ? [dump.stencil] : [] }
for (const s of pts) { const [x, z] = s.split(',').map(Number)
  console.log(`(${x}, ${z})`)
  for (const c of D._owners(x, z).slice(0, +(process.env.K || 2))) {
    const ux = (x - c.px) / c.d, uz = (z - c.pz) / c.d, L = c.d + 0.3
    console.log(`  ${c.key} from (${c.px.toFixed(3)}, ${c.pz.toFixed(3)}) d ${c.d.toFixed(3)}`)
    console.log(`    RAY  : ${c.bands.filter(b => b.from < L).map(b => `${b.cls} ${b.from.toFixed(3)}-${b.to.toFixed(3)}`).join(' · ')}`)
    let last = null, out = []
    for (let t = 0.002; t <= L; t += 0.001) { const q = [c.px + ux * t, c.pz + uz * t]
      const k = !D._inClass ? '?' : (dump.stencil && !(() => { let cc = false; const r = dump.stencil; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > q[1]) !== (zj > q[1]) && q[0] < (xj - xi) * (q[1] - zi) / (zj - zi) + xi) cc = !cc } return cc })()) ? 'beyond'
        : ['walk', 'lawn', 'curb'].find(cl => D._inClass(cl, ...q)) || 'lot'
      if (k !== last) { out.push(`${k}@${t.toFixed(3)}`); last = k } }
    console.log(`    POINT: ${out.join(' · ')}`)
    // every ring edge the ray crosses up to L
    const X = []
    for (const [cls, rs] of Object.entries(rings)) for (const r of rs) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]
      const sx = b[0] - a[0], sz = b[1] - a[1], den = ux * sz - uz * sx; if (Math.abs(den) < 1e-12) continue
      const wx = a[0] - c.px, wz = a[1] - c.pz, t = (wx * sz - wz * sx) / den, v = (wx * uz - wz * ux) / den
      if (t > 0 && t <= L && v >= -1e-6 && v <= 1 + 1e-6) X.push({ t, cls, v, len: Math.hypot(sx, sz) }) }
    X.sort((p, q) => p.t - q.t)
    console.log(`    CROSSINGS: ${X.map(e => `${e.cls}@${e.t.toFixed(4)}${e.v < 1e-6 || e.v > 1 - 1e-6 ? '(vertex)' : ''}${e.len < 0.005 ? `(edge ${(e.len * 1000).toFixed(2)} mm)` : ''}`).join(' · ')}`)
  } }
