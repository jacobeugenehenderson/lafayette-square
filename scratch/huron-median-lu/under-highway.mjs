// Forensic (Sward): which ground groups draw (triangle centroid) inside the highway envelope
// shape.json highway[outer] MINUS its holes, and inside the holes. Also mat:highway's total area.
import fs from 'fs'
const D = 'public/baked/huron/'
const shape = JSON.parse(fs.readFileSync(D + 'shape.json')), g = JSON.parse(fs.readFileSync(D + 'ground.json'))
const bin = fs.readFileSync(D + 'ground.bin'), buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
const pip = (x, z, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins } return ins }
const H = Object.values(shape.highway), outer = H.filter(r => A(r) > 0), holes = H.filter(r => A(r) < 0)
const out = { pavement: {}, hole: {} }, total = {}
for (const grp of g.groups) {
  const P = new Float32Array(buf, grp.vertexByteOffset, grp.vertexCount * 3), I = new Uint32Array(buf, grp.indexByteOffset, grp.indexCount)
  const key = grp.kind + ':' + grp.id
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3
    const ar = Math.abs((P[b] - P[a]) * (P[c + 2] - P[a + 2]) - (P[c] - P[a]) * (P[b + 2] - P[a + 2])) / 2
    total[key] = (total[key] || 0) + ar
    const cx = (P[a] + P[b] + P[c]) / 3, cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3
    if (!outer.some(r => pip(cx, cz, r))) continue
    const where = holes.some(h => pip(cx, cz, h)) ? 'hole' : 'pavement'
    const e = out[where][key] || (out[where][key] = { tris: 0, m2: 0 }); e.tris++; e.m2 += ar
  }
}
console.log('mat:highway total', Math.round(total['mat:highway']), 'm²; envelope outer', outer.map(r => Math.round(A(r))), 'holes', holes.map(r => Math.round(-A(r))))
for (const w of ['pavement', 'hole']) { console.log(w); for (const [k, e] of Object.entries(out[w]).sort((a, b) => b[1].m2 - a[1].m2)) console.log(`   ${k.padEnd(28)} ${String(e.tris).padStart(6)} tris ${Math.round(e.m2).toString().padStart(8)} m²`) }
