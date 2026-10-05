// Forensic (Sward): (a) ground groups drawn (triangle centroid) inside the thin iA components of
// tiles 63/108/7/9 and the verge strips; (b) face:<lu> triangles whose centroid is in NO iA of a
// tile classed <lu> (the bake's "outside the class's own polygons" count, re-derived), per lu.
import fs from 'fs'
const D = 'public/baked/huron/'
const s = JSON.parse(fs.readFileSync(D + 'shape.json')), g = JSON.parse(fs.readFileSync(D + 'ground.json'))
const bin = fs.readFileSync(D + 'ground.bin'), buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
const pip = (x, z, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins } return ins }
const bb = r => { let a = [Infinity, -Infinity, Infinity, -Infinity]; for (const [x, z] of r) { a[0] = Math.min(a[0], x); a[1] = Math.max(a[1], x); a[2] = Math.min(a[2], z); a[3] = Math.max(a[3], z) } return a }
// even-odd over all iA rings of the tile (holes are negative rings inside the outer)
const inIA = (x, z, t) => { let n = 0; for (const r of t._ia) if (x >= r.bb[0] && x <= r.bb[1] && z >= r.bb[2] && z <= r.bb[3] && pip(x, z, r.r)) n++; return n % 2 === 1 }
s.tiles.forEach(t => { t._ia = t.iA.map(r => ({ r, bb: bb(r) })) })
const comps = []
for (const [ti, minA, maxA] of [[63, 1e4, 1e5], [108, 5e4, 2e5], [7, 0, 1e9], [9, 0, 1e9], [14, 0, 1e9], [22, 0, 1e9], [61, 0, 1e9], [148, 0, 1e9]])
  for (const r of s.tiles[ti].iA) { const a = A(r); if (a > minA && a < maxA) comps.push({ ti, r, bb: bb(r), a, by: {} }) }
const byLu = {}; s.tiles.forEach(t => (byLu[t.lu] ||= []).push(t))
const outside = {}
for (const grp of g.groups) {
  const key = grp.kind + ':' + grp.id
  const P = new Float32Array(buf, grp.vertexByteOffset, grp.vertexCount * 3), I = new Uint32Array(buf, grp.indexByteOffset, grp.indexCount)
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3
    const ar = Math.abs((P[b] - P[a]) * (P[c + 2] - P[a + 2]) - (P[c] - P[a]) * (P[b + 2] - P[a + 2])) / 2
    const cx = (P[a] + P[b] + P[c]) / 3, cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3
    for (const o of comps) if (cx >= o.bb[0] && cx <= o.bb[1] && cz >= o.bb[2] && cz <= o.bb[3] && pip(cx, cz, o.r)) { const e = o.by[key] ||= { tris: 0, m2: 0 }; e.tris++; e.m2 += ar }
    if (grp.kind === 'face' && byLu[grp.id] && !byLu[grp.id].some(t => inIA(cx, cz, t))) { const e = outside[key] ||= { tris: 0, m2: 0, max: 0 }; e.tris++; e.m2 += ar; e.max = Math.max(e.max, ar) }
  }
}
for (const o of comps) {
  console.log(`tile ${o.ti} (${s.tiles[o.ti].lu}) iA comp ${(o.a / 1e4).toFixed(2)} ha`)
  for (const [k, e] of Object.entries(o.by).sort((a, b) => b[1].m2 - a[1].m2)) if (e.m2 > 1) console.log(`   ${k.padEnd(28)} ${String(e.tris).padStart(5)} tris ${Math.round(e.m2).toString().padStart(7)} m²`)
}
console.log('face triangles with centroid in NO iA of a tile of their own class:')
for (const [k, e] of Object.entries(outside).sort((a, b) => b[1].m2 - a[1].m2)) console.log(`   ${k.padEnd(22)} ${String(e.tris).padStart(5)} tris ${Math.round(e.m2).toString().padStart(7)} m²  largest tri ${Math.round(e.max)} m²`)
