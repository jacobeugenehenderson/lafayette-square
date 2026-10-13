// median-in-water.mjs — READ-ONLY: how much of a shore-median.json's regions lies OUTSIDE the drawn water (map.json, with
// its holes). Where the median lay inside it, the bed (PAINT_ORDER above 'shore') was already on top, so retiring the median
// changes no paint there. Usage: node scratch/coast/median-in-water.mjs <shore-median.json> <map.json>
import fs from 'fs'
import clipperLib from 'clipper-lib'
const W = new URL('../../', import.meta.url).pathname
const { drawnWaterItems } = await import(W + 'cartograph/shore-armour.mjs')
const [medPath, mapPath] = process.argv.slice(2)
const med = JSON.parse(fs.readFileSync(medPath)), map = JSON.parse(fs.readFileSync(mapPath))
const S = 1000, P = (r) => r.map(([x, z]) => ({ X: Math.round(x * S), Y: Math.round(z * S) }))
const C = clipperLib, area = (ps) => ps.reduce((t, p) => t + C.Clipper.Area(p), 0) / S / S
const union = (rings) => { const c = new C.Clipper(), o = new C.Paths(); c.AddPaths(rings, C.PolyType.ptSubject, true); c.Execute(C.ClipType.ctUnion, o, C.PolyFillType.pftEvenOdd, C.PolyFillType.pftEvenOdd); return o }
const items = drawnWaterItems(map.layers?.water)
const water = union(items.flatMap(it => [P(it.outer), ...(it.holes || []).map(P)]))
for (const k of ['seaward', 'landward']) {
  const m = union((med.regions?.[k] || []).flatMap(p => [P(p.outer), ...(p.holes || []).map(P)]))
  const c = new C.Clipper(), out = new C.Paths(); c.AddPaths(m, C.PolyType.ptSubject, true); c.AddPaths(water, C.PolyType.ptClip, true)
  c.Execute(C.ClipType.ctDifference, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero)
  console.log(`${k}: ${(area(m) / 1e4).toFixed(2)} ha · outside the drawn water ${area(out).toFixed(1)} m² in ${out.length} piece(s)`)
}
console.log(`drawn water: ${items.length} item(s), ${(area(water) / 1e4).toFixed(1)} ha`)
