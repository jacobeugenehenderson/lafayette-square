// why.mjs — for a point, which raw inputs hold it: how many of the step's mine paths (EvenOdd), acc's winding (NonZero),
// and which of the layers ABOVE (flatten dump groups, by region) paint it. Reads only.
//   node why.mjs <inputs dump> <HEAD flatten dump> <key> <x> <z>
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const C = createRequire('/Users/jacobhenderson/Desktop/lafayette-square.nosync/package.json')('clipper-lib')
const [fi, ft, key, xs, zs] = process.argv.slice(2), IN = JSON.parse(readFileSync(fi, 'utf8')), TR = JSON.parse(readFileSync(ft, 'utf8')), S = 1000
const pt = { X: Math.round(+xs * S), Y: Math.round(+zs * S) }, P = (a) => a.map(q => q.map(([X, Y]) => ({ X, Y })))
const { mine, acc } = IN[key]
let n = 0; for (const q of P(mine)) if (C.Clipper.PointInPolygon(pt, q) === 1) n++
let w = 0; for (const q of P(acc)) if (C.Clipper.PointInPolygon(pt, q) === 1) w += C.Clipper.Orientation(q) ? 1 : -1
const painted = []
for (const [g, items] of Object.entries(TR)) for (const it of items) { const o = Array.isArray(it) ? it : it.outer, hs = Array.isArray(it) ? [] : it.holes || []
  const path = (r) => r.map(([x, z]) => ({ X: Math.round(x * S), Y: Math.round(z * S) }))
  if (C.Clipper.PointInPolygon(pt, path(o)) === 1 && !hs.some(h => C.Clipper.PointInPolygon(pt, path(h)) === 1)) { painted.push(g); break } }
console.log(`${key} at (${xs}, ${zs}): in ${n} mine path(s) (EvenOdd ${n % 2 ? 'IN' : 'OUT'}) · acc winding ${w} (${w ? 'IN' : 'OUT'}) · the slab's flatten paints it in: ${painted.join(', ') || 'NOTHING'}`)
