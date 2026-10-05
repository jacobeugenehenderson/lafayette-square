// Forensic (Sward): render the BAKED ground mesh (public/baked/huron/ground.bin) in a world window,
// each group a flat colour, with the shape.json highway envelope (black) + tile rings (thin grey) on top.
// Usage: node scratch/huron-median-lu/mesh-window.mjs cx cz halfM out.png
import fs from 'fs'; import sharp from 'sharp'
const D = 'public/baked/huron/'
const [cx, cz, h, out] = [+process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]]
const g = JSON.parse(fs.readFileSync(D + 'ground.json')), s = JSON.parse(fs.readFileSync(D + 'shape.json'))
const bin = fs.readFileSync(D + 'ground.bin'), buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const W = 1400, k = W / (2 * h), X = x => ((x - cx + h) * k).toFixed(1), Z = z => ((z - cz + h) * k).toFixed(1)
const COL = { 'face:agricultural': '#e8c800', 'face:verge': '#8fe08f', 'mat:asphalt': '#444', 'mat:highway': '#ff00ff', 'face:greenhouse': '#e07ad0', 'face:recreation': '#3a8a2a', 'face:underived': '#f22', 'mat:curb': '#ccc', 'mat:sidewalk': '#bbb' }
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}"><rect width="100%" height="100%" fill="#fff"/>`
const seen = {}
for (const grp of g.groups) {
  const key = grp.kind + ':' + grp.id
  const P = new Float32Array(buf, grp.vertexByteOffset, grp.vertexCount * 3), I = new Uint32Array(buf, grp.indexByteOffset, grp.indexCount)
  const col = COL[key] || (key.startsWith('mat:treelawn') ? '#0a0' : '#09f')
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3
    if (Math.max(P[a], P[b], P[c]) < cx - h || Math.min(P[a], P[b], P[c]) > cx + h || Math.max(P[a + 2], P[b + 2], P[c + 2]) < cz - h || Math.min(P[a + 2], P[b + 2], P[c + 2]) > cz + h) continue
    seen[key] = (seen[key] || 0) + 1
    svg += `<polygon points="${X(P[a])},${Z(P[a + 2])} ${X(P[b])},${Z(P[b + 2])} ${X(P[c])},${Z(P[c + 2])}" fill="${col}" fill-opacity="0.75" stroke="#000" stroke-opacity="0.15" stroke-width="0.3"/>`
  }
}
for (const t of s.tiles) svg += `<polygon points="${t.ring.map(p => X(p[0]) + ',' + Z(p[1])).join(' ')}" fill="none" stroke="#06c" stroke-width="1" stroke-dasharray="4 3"/>`
for (const r of Object.values(s.highway)) svg += `<polygon points="${r.map(p => X(p[0]) + ',' + Z(p[1])).join(' ')}" fill="none" stroke="#000" stroke-width="2"/>`
svg += '</svg>'
await sharp(Buffer.from(svg)).png().toFile(out); console.log(out, seen)
