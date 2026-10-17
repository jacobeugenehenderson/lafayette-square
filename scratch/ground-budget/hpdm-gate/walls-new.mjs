// walls-new.mjs <before.raw> <after.raw> [r=1] — walls in AFTER with no wall in BEFORE within r metres (walls-dist.mjs --show
// output, centroids): the walls a simplification ADDED, by group, worst and sites. Read-only.
import { readFileSync } from 'fs'
const [a, b, r = 1] = process.argv.slice(2)
const rd = (f) => readFileSync(f, 'utf8').split('\n').filter(l => l.includes('rises')).map(l => { const m = l.match(/(\S+) at \((-?[\d.]+), (-?[\d.]+)\): rises ([\d.]+) m/); return { g: m[1], x: +m[2], z: +m[3], ex: +m[4] } })
const A = rd(a), B = rd(b), C = 2, grid = new Map()
for (const w of A) { const k = `${Math.floor(w.x / C)},${Math.floor(w.z / C)}`; (grid.get(k) || grid.set(k, []).get(k)).push(w) }
const near = (w) => { const cx = Math.floor(w.x / C), cz = Math.floor(w.z / C); for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) for (const v of grid.get(`${x},${z}`) || []) if (Math.hypot(v.x - w.x, v.z - w.z) <= +r) return true; return false }
const nw = B.filter(w => !near(w)).sort((p, q) => q.ex - p.ex), by = new Map(); for (const w of nw) by.set(w.g, (by.get(w.g) || 0) + 1)
console.log(`before ${A.length} wall(s) · after ${B.length} · after with no wall before within ${r} m: ${nw.length}${nw.length ? `, worst ${nw[0].ex.toFixed(2)} m · ${[...by].sort((p, q) => q[1] - p[1]).slice(0, 6).map(([g, n]) => `${g} ${n}`).join(' · ')}` : ''}`)
for (const w of nw.slice(0, 8)) console.log(`  ${w.g} at (${w.x}, ${w.z}): ${w.ex} m`)
const ex = nw.map(w => w.ex).sort((p, q) => p - q); if (ex.length) console.log(`  their excess: p50 ${ex[ex.length >> 1].toFixed(3)} · p90 ${ex[Math.floor(0.9 * ex.length)].toFixed(3)} · ≤ 7.8 mm ${ex.filter(e => e <= 0.0078).length}`)
