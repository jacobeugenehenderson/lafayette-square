// Splice probe: the coast arcs and water rings as the mint receives them (remint.mjs's coastRings call); at named arc
// vertices, the turn and the nearest water-ring vertex.   CARTOGRAPH_SCENE=<s> node scratch/splice/coast.mjs --data=<root> idx…
import fs from 'fs'; import { join } from 'path'
const scene = process.env.CARTOGRAPH_SCENE, root = process.argv.find(a => a.startsWith('--data='))?.slice(7) || '.'
const D = (p) => join(root, 'cartograph/data', scene, p)
const { wgs84ToLocal } = await import('../../cartograph/config.js'), { coastRings } = await import('../../cartograph/coastline.mjs')
const osm = JSON.parse(fs.readFileSync(D('raw/osm.json'), 'utf8')), bnd = JSON.parse(fs.readFileSync(D('neighborhood_boundary.json'), 'utf8'))
const bx = osm.bbox, a = wgs84ToLocal(bx.minLon, bx.maxLat), b = wgs84ToLocal(bx.maxLon, bx.minLat)
const bb = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) }
const o = console.log; console.log = console.warn = () => {}
const C = coastRings({ ground: osm.ground || {}, buildings: osm.buildings || [], center: bnd.center || null, discR: bnd.radius || 0, bb }); console.log = o
console.log(`${C.arcs.length} arc(s) [${C.arcs.map(x => x.length)}] · ${C.rings.length} water ring(s) [${C.rings.map(x => x.length)}]`)
for (const s of process.argv.slice(2).filter(x => !x.startsWith('--'))) { const [ai, vi] = s.includes(':') ? s.split(':').map(Number) : [0, +s], P = C.arcs[ai], i = vi
  const t = Math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0]) - Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0])
  let best = [Infinity]; C.rings.forEach((r, k) => r.forEach((q, j) => { const d = Math.hypot(q[0] - P[i][0], q[1] - P[i][1]); if (d < best[0]) best = [d, k, j] }))
  console.log(`arc ${ai} v${i} (${P[i].map(v => v.toFixed(4))}) turn ${(Math.atan2(Math.sin(t), Math.cos(t)) * 180 / Math.PI).toFixed(1)}° segs ${Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]).toFixed(3)}/${Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]).toFixed(3)} m · nearest water vertex ${(best[0] * 1000).toFixed(3)} mm (ring ${best[1]} v${best[2]})`) }
