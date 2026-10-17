// inspect.mjs — what the input slab holds, per group: V, T, boundary vertices, xz twins inside a group, and whether a
// position shared across groups carries the same raw and y on both sides. Read-only.
//   node scratch/ground-budget/simplify/inspect.mjs <slab dir>
import { readFileSync } from 'fs'
import { join } from 'path'
const dir = process.argv[2]
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8'))
const b = readFileSync(join(dir, gj.bin)), AB = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
console.log(dir, 'bytes', b.byteLength)
const key = (x, z) => x + ',' + z
const at = new Map()   // xz → [{gi, v}]
let VT = 0, TT = 0
gj.groups.forEach((g, gi) => {
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  const R = g.rawByteOffset != null ? new Float32Array(AB, g.rawByteOffset, g.vertexCount) : null
  const ec = new Map()
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], c = I[t + (k + 1) % 3]; const e = a < c ? a * 4194304 + c : c * 4194304 + a; ec.set(e, (ec.get(e) || 0) + 1) }
  const bnd = new Set(); let nonManifold = 0
  for (const [e, n] of ec) { if (n === 1) { bnd.add(Math.floor(e / 4194304)); bnd.add(e % 4194304) } if (n > 2) nonManifold++ }
  const seen = new Map(); let twins = 0, twinsDy = 0
  for (let v = 0; v < g.vertexCount; v++) { const k = key(P[v * 3], P[v * 3 + 2]); if (seen.has(k)) { twins++; if (P[seen.get(k) * 3 + 1] !== P[v * 3 + 1]) twinsDy++ } else seen.set(k, v)
    ;(at.get(k) || at.set(k, []).get(k)).push({ gi, v, y: P[v * 3 + 1], r: R ? R[v] : null }) }
  VT += g.vertexCount; TT += g.indexCount / 3
  console.log(`${g.kind}:${g.id}`.padEnd(34), 'ro', String(g.renderOrder).padStart(2), g.partition ? 'P' : '-', g.vertical ? 'vert' : '    ',
    'V', String(g.vertexCount).padStart(7), 'T', String(g.indexCount / 3).padStart(7), 'bnd', String(bnd.size).padStart(6), 'xzTwins', twins, 'dy', twinsDy, 'nonManifoldEdges', nonManifold,
    'raw', R ? 'y' : 'n', 'grad', g.gradByteOffset != null ? 'y' : 'n', g.fieldByteOffset != null ? 'FIELD' : '')
})
let shared = 0, dr = 0, dy = 0, maxDr = 0, maxDy = 0
for (const [, L] of at) { const gs = new Set(L.map(l => l.gi)); if (gs.size < 2) continue; shared++
  const r0 = L[0].r, y0 = L[0].y; let a = 0, c = 0
  for (const l of L) { if (l.r != null && r0 != null) a = Math.max(a, Math.abs(l.r - r0)); c = Math.max(c, Math.abs(l.y - y0)) }
  if (a > 0) dr++; if (c > 0) dy++; maxDr = Math.max(maxDr, a); maxDy = Math.max(maxDy, c) }
console.log('total V', VT, 'T', TT, '| xz positions in ≥2 groups', shared, '· raw differs', dr, `(max ${maxDr})`, '· y differs', dy, `(max ${maxDy})`)
