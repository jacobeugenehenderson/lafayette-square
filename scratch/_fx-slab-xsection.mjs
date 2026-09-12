// ⛔ READS THE SHIPPED SLAB, restates nothing. At a given point, marches inward along a normal and
// reports the MATERIAL SEQUENCE with depths — the ribbon's actual cross-section as built.
// ▶ node scratch/_fx-slab-xsection.mjs <slabdir> <x> <z> [nx nz]
import { loadSlab } from './_fx-live-slab.mjs'
const [dir, xs, zs] = process.argv.slice(2)
const slab = loadSlab(dir)
const CLASS = [['curb', ['mat:curb']], ['walk', ['mat:sidewalk']],
  ['grass', [...slab.groups.keys()].filter(k => k.startsWith('mat:treelawn'))],
  ['road', ['mat:asphalt', 'mat:median', 'mat:alley']]]
// spatial grid over the triangles we care about
const CELL = 4, idx = new Map()
const tri = []
for (const [cls, keys] of CLASS) for (const k of keys) { const g = slab.groups.get(k); if (!g) continue
  for (let t = 0; t < g.idx.length; t += 3) {
    const P = []; for (let m = 0; m < 3; m++) { const b = g.idx[t + m] * g.cpv; P.push([g.pos[b], g.pos[b + 2]]) }
    const id = tri.length; tri.push({ cls, P })
    const xs2 = P.map(p => p[0]), zs2 = P.map(p => p[1])
    for (let cx = Math.floor(Math.min(...xs2) / CELL); cx <= Math.floor(Math.max(...xs2) / CELL); cx++)
      for (let cz = Math.floor(Math.min(...zs2) / CELL); cz <= Math.floor(Math.max(...zs2) / CELL); cz++) {
        const key = cx + '|' + cz; (idx.get(key) || idx.set(key, []).get(key)).push(id) } } }
const inTri = (P, x, y) => { const [a, b, c] = P
  const d = (b[1]-c[1])*(a[0]-c[0]) + (c[0]-b[0])*(a[1]-c[1]); if (!d) return false
  const u = ((b[1]-c[1])*(x-c[0]) + (c[0]-b[0])*(y-c[1]))/d, v = ((c[1]-a[1])*(x-c[0]) + (a[0]-c[0])*(y-c[1]))/d
  return u >= -1e-9 && v >= -1e-9 && u + v <= 1 + 1e-9 }
export const matAt = (x, z) => {
  const ids = idx.get(Math.floor(x/CELL) + '|' + Math.floor(z/CELL)) || []
  for (const i of ids) if (inTri(tri[i].P, x, z)) return tri[i].cls
  return '-' }
if (xs !== undefined) {
  const X = +xs, Z = +zs
  console.log(`materials on a 0.25 m grid around (${X}, ${Z}):`)
  for (let dz = -6; dz <= 6; dz++) {
    let row = ''
    for (let dx = -6; dx <= 6; dx++) { const m = matAt(X + dx*0.5, Z + dz*0.5)
      row += ({ curb:'C', walk:'W', grass:'g', road:'.', '-':' ' })[m] }
    console.log('  ' + row) }
}
