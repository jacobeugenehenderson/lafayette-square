// gusset-fixture.mjs — cut a check fixture from a real slab: coast stations whose water side today's drawn-water probe
// (half a terrain step) could not decide, with their run, the carrying tile's iaFull and the drawn water, all clipped to
// a box around each station, inside the town's disc (inside the box a point-in-ring test reads exactly as on the whole rings).
// Usage: node scratch/coast/gusset-fixture.mjs <scene> <slab dir> <out.json> [boxM=25]
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import clipperLib from 'clipper-lib'
import { drawnWaterTest, drawnWaterItems } from '../../cartograph/shore-armour.mjs'
const [scene, slab, out, boxArg] = process.argv.slice(2), BOX = Number(boxArg || 25), S = 1000
const root = new URL('../../', import.meta.url).pathname
const shape = JSON.parse(readFileSync(join(slab, 'shape.json')))
const items = drawnWaterItems(JSON.parse(readFileSync(join(root, 'cartograph/data', scene, 'clean/map.json'))).layers?.water)
const disc = JSON.parse(readFileSync(join(root, 'cartograph/data', scene, 'neighborhood_boundary.json')))
const inDisc = ([x, z]) => Math.hypot(x - disc.center[0], z - disc.center[1]) <= disc.radius - BOX   // the drawn town, not the fetch envelope
const wetAt = drawnWaterTest(items), probe = shape.gusset.stepM / 2
const sideAt = (p, i, d) => { const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)], tx = b[0] - a[0], tz = b[1] - a[1], m = Math.hypot(tx, tz)
  return m ? [wetAt(p[i][0] - tz / m * d, p[i][1] + tx / m * d), wetAt(p[i][0] + tz / m * d, p[i][1] - tx / m * d)] : [false, false] }
const clip = (rings, c) => { const cl = new clipperLib.Clipper(), o = new clipperLib.Paths()
  cl.AddPaths(rings.map(r => r.map(([x, z]) => ({ X: Math.round(x * S), Y: Math.round(z * S) }))), clipperLib.PolyType.ptSubject, true)
  cl.AddPath([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({ X: Math.round((c[0] + u * BOX) * S), Y: Math.round((c[1] + v * BOX) * S) })), clipperLib.PolyType.ptClip, true)
  cl.Execute(clipperLib.ClipType.ctIntersection, o, clipperLib.PolyFillType.pftEvenOdd, clipperLib.PolyFillType.pftNonZero)
  return o.map(p => p.map(q => [q.X / S, q.Y / S])) }
const want = { never: null, at1m: null }
for (const t of shape.tiles) for (const r of t.runs || []) {
  if (r.skelId !== '__water__') continue
  const p = r.poly
  for (let i = 1; i + 2 < p.length; i++) {
    if (!inDisc(p[i])) continue
    const [l, rr] = sideAt(p, i, probe); if (l !== rr) continue
    const [l1, r1] = sideAt(p, i, 1), dec1 = l1 !== r1
    const k = dec1 ? 'at1m' : 'never'; if (want[k]) continue
    const c = p[i], win = p.slice(i - 1, i + 3), water = clip(items.flatMap(it => [it.outer, ...it.holes]), c)
    // keep only a station the clipped water, read as the check reads it (bare rings), still cannot decide
    const cw = drawnWaterTest(water), a2 = p[i - 1], b2 = p[i + 1], ux = b2[0] - a2[0], uz = b2[1] - a2[1], um = Math.hypot(ux, uz)
    if (cw(c[0] - uz / um * probe, c[1] + ux / um * probe) !== cw(c[0] + uz / um * probe, c[1] - ux / um * probe)) continue
    want[k] = { at: c, kind: l ? 'water on both sides at the probe' : 'water on neither side at the probe', run: win, station: 1,
                iaFull: clip(t.iaFull, c), water }
  }
}
const fx = { from: `${scene} plan-B shape.json, 2026-10-13 (scratch/coast/gusset-fixture.mjs)`, probeM: probe, boxM: BOX, cases: Object.values(want).filter(Boolean) }
writeFileSync(out, JSON.stringify(fx))
for (const c of fx.cases) console.log(`${c.kind} @ ${c.at.map(v => v.toFixed(2)).join(',')} · iaFull ${c.iaFull.length} ring(s) · water ${c.water.length} ring(s)`)
