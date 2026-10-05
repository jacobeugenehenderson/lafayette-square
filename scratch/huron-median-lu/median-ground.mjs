// Forensic (Sward, 2026-10-04): what does Huron's baked ground mesh draw inside each tile?
// Reads public/baked/huron/{shape.json, ground.json, ground.bin}. Assigns each triangle by
// its centroid to the tile whose RING contains it; sums area per (tile, group). Coverage > 1
// means overlapping layers. Usage: node scratch/huron-median-lu/median-ground.mjs [tile ...]
import fs from 'fs'
const D = 'public/baked/huron/'
const shape = JSON.parse(fs.readFileSync(D + 'shape.json'))
const g = JSON.parse(fs.readFileSync(D + 'ground.json'))
const bin = fs.readFileSync(D + 'ground.bin')
const buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
const pip = (x, z, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins } return ins }
const bb = r => { let a = [Infinity, -Infinity, Infinity, -Infinity]; for (const [x, z] of r) { a[0] = Math.min(a[0], x); a[1] = Math.max(a[1], x); a[2] = Math.min(a[2], z); a[3] = Math.max(a[3], z) } return a }
const args = process.argv.slice(2).map(Number)
const want = args.length ? args : shape.tiles.map((t, i) => i).filter(i => shape.tiles[i].lu === 'verge')
const T = want.map(i => ({ i, t: shape.tiles[i], bb: bb(shape.tiles[i].ring), area: Math.abs(A(shape.tiles[i].ring)), by: {} }))
for (const grp of g.groups) {
  const P = new Float32Array(buf, grp.vertexByteOffset, grp.vertexCount * 3)
  const I = new Uint32Array(buf, grp.indexByteOffset, grp.indexCount)
  const key = grp.kind + ':' + grp.id
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3
    const cx = (P[a] + P[b] + P[c]) / 3, cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3
    for (const o of T) {
      if (cx < o.bb[0] || cx > o.bb[1] || cz < o.bb[2] || cz > o.bb[3]) continue
      if (!pip(cx, cz, o.t.ring)) continue
      const ar = Math.abs((P[b] - P[a]) * (P[c + 2] - P[a + 2]) - (P[c] - P[a]) * (P[b + 2] - P[a + 2])) / 2
      const e = o.by[key] || (o.by[key] = { tris: 0, m2: 0 }); e.tris++; e.m2 += ar
    }
  }
}
for (const o of T) {
  const sk = [...new Set(o.t.runs.map(r => r.skelId))]
  const sum = Object.values(o.by).reduce((s, e) => s + e.m2, 0)
  const water = Object.entries(o.by).filter(([k]) => k.startsWith('mat:water')).reduce((s, [, e]) => s + e.m2, 0)
  console.log(`tile ${o.i} lu=${o.t.lu} ring=${o.area.toFixed(0)} m² skels=${sk.join(',')}  drawn=${sum.toFixed(0)} m² (partition ${(sum - water).toFixed(0)}; coverage ${((sum - water) / o.area).toFixed(3)})`)
  for (const [k, e] of Object.entries(o.by).sort((a, b) => b[1].m2 - a[1].m2)) console.log(`   ${k.padEnd(28)} ${String(e.tris).padStart(6)} tris ${e.m2.toFixed(0).padStart(9)} m²`)
}
