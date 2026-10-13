// side-vs-offset.mjs — do the gusset's undecided stations and its disagreements with the old drawn-water probe sit where
// the ① coast edge is off map.json's drawn water edge (Boz's (b))? READ-ONLY; the offset per station, set against all.
// Usage: node scratch/coast/side-vs-offset.mjs <scene> <slab dir> <side-diff.json (gusset-side-diff.mjs)>
import { readFileSync } from 'fs'
import { join } from 'path'
import { drawnWaterItems } from '../../cartograph/shore-armour.mjs'
const [scene, slab, diffPath] = process.argv.slice(2)
const root = new URL('../../', import.meta.url).pathname
const shape = JSON.parse(readFileSync(join(slab, 'shape.json'))), diff = JSON.parse(readFileSync(diffPath))
const rings = drawnWaterItems(JSON.parse(readFileSync(join(root, 'cartograph/data', scene, 'clean/map.json'))).layers?.water).flatMap(it => [it.outer, ...it.holes])
const C = 10, grid = new Map()
for (const r of rings) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1])
  for (let s = 0; s <= L + C; s += C / 2) { const t = L ? Math.min(1, s / L) : 0, k = Math.floor((a[0] + (b[0] - a[0]) * t) / C) + ',' + Math.floor((a[1] + (b[1] - a[1]) * t) / C); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([a, b]) } }
const off = ([x, z]) => { let best = Infinity; const cx = Math.floor(x / C), cz = Math.floor(z / C)
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const [a, b] of grid.get((cx + i) + ',' + (cz + j)) || []) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0; best = Math.min(best, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz)) }
  return best }
const seen = new Set(), all = []
for (const t of shape.tiles) for (const r of t.runs || []) { if (r.skelId !== '__water__') continue; const f = JSON.stringify(r.poly), b = JSON.stringify([...r.poly].reverse()), k = f < b ? f : b; if (seen.has(k)) continue; seen.add(k); for (const p of r.poly) all.push(off(p)) }
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * s.length))] }
const p90all = q(all, 0.9)
const show = (name, a) => { const d = a.map(w => off(w.at)); const far = d.filter(v => v > p90all).length, inf = d.filter(v => v === Infinity).length
  console.log(`  ${name.padEnd(13)} n ${String(d.length).padStart(5)} · offset p10 ${q(d, .1).toFixed(3)} · p50 ${q(d, .5).toFixed(3)} · p90 ${q(d, .9).toFixed(3)} · max ${q(d, 1).toFixed(3)} m · beyond all-stations p90 (${p90all.toFixed(3)} m): ${far} (${(100 * far / d.length).toFixed(1)}%)${inf ? ` · ${inf} with no water edge within 20 m` : ''}`) }
console.log(`${scene}: ① coast-run vertex → nearest map.json drawn-water edge`)
console.log(`  ${'all stations'.padEnd(13)} n ${String(all.length).padStart(5)} · offset p10 ${q(all, .1).toFixed(3)} · p50 ${q(all, .5).toFixed(3)} · p90 ${q(all, .9).toFixed(3)} · max ${q(all.filter(Number.isFinite), 1).toFixed(3)} m · beyond p90: 10% by definition`)
show('undecided', diff.undecided)
show('disagree', diff.disagree)
show('disagree in disc', diff.disagree.filter(w => w.inDisc))
