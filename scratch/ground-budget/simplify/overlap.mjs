// overlap.mjs — does a group cover the same xz twice? For every vertex of a group, how many of the group's OWN
// triangles contain it (strictly inside, not as a corner), and how far apart their drawn heights are. Read-only.
//   node scratch/ground-budget/simplify/overlap.mjs <slab dir> <group id> [exag]
import { readFileSync } from 'fs'
import { join } from 'path'
const [dir, id, ex] = process.argv.slice(2), E = +(ex || 1)
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), b = readFileSync(join(dir, gj.bin)), AB = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
const g = gj.groups.find(g => g.id === id)
const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount), R = new Float32Array(AB, g.rawByteOffset, g.vertexCount)
const C = 4, grid = new Map(), nt = I.length / 3
for (let t = 0; t < nt; t++) { const xs = [0, 1, 2].map(k => P[I[3 * t + k] * 3]), zs = [0, 1, 2].map(k => P[I[3 * t + k] * 3 + 2])
  for (let gx = Math.floor(Math.min(...xs) / C); gx <= Math.floor(Math.max(...xs) / C); gx++) for (let gz = Math.floor(Math.min(...zs) / C); gz <= Math.floor(Math.max(...zs) / C); gz++) { const k = gx * 100000 + gz; (grid.get(k) || grid.set(k, []).get(k)).push(t) } }
const h = (t, x, z) => { const a = I[3 * t], bb = I[3 * t + 1], c = I[3 * t + 2]
  const d = (P[bb * 3] - P[a * 3]) * (P[c * 3 + 2] - P[a * 3 + 2]) - (P[c * 3] - P[a * 3]) * (P[bb * 3 + 2] - P[a * 3 + 2]); if (d === 0) return null
  const wa = ((P[bb * 3] - x) * (P[c * 3 + 2] - z) - (P[c * 3] - x) * (P[bb * 3 + 2] - z)) / d, wb = ((P[c * 3] - x) * (P[a * 3 + 2] - z) - (P[a * 3] - x) * (P[c * 3 + 2] - z)) / d, wc = 1 - wa - wb
  const e = 1e-6; if (wa < e || wb < e || wc < e) return null
  return (R[a] * wa + R[bb] * wb + R[c] * wc) * E + P[a * 3 + 1] * wa + P[bb * 3 + 1] * wb + P[c * 3 + 1] * wc }
let covered = 0, spreadBig = 0, maxSpread = 0, worst = null
for (let v = 0; v < g.vertexCount; v++) { const x = P[v * 3], z = P[v * 3 + 2], own = R[v] * E + P[v * 3 + 1]
  const L = (grid.get(Math.floor(x / C) * 100000 + Math.floor(z / C)) || []).map(t => h(t, x, z)).filter(y => y != null)
  if (!L.length) continue; covered++
  const s = Math.max(...L.map(y => Math.abs(y - own))); if (s > 0.0078) spreadBig++; if (s > maxSpread) { maxSpread = s; worst = [x, z, L.length] } }
console.log(`${id}: V ${g.vertexCount} · vertices strictly inside another of the group's own triangles ${covered} · of those, the covering triangle's height differs from the vertex's own by > 7.8 mm: ${spreadBig} · max ${(maxSpread * 1000).toFixed(1)} mm at ${worst}`)
