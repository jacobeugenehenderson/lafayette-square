// Forensic (Sward): one baked tile (public/baked/huron/shape.json) — ring outline (black), each iA component
// filled its own colour, skeleton chains (blue; motorways red), H outline (dark grey).
// Usage: node scratch/huron-median-lu/tile-ia.mjs <tile> cx cz halfM out.png
import fs from 'fs'; import sharp from 'sharp'
const [T, cx, cz, h, out] = [+process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5], process.argv[6]]
const s = JSON.parse(fs.readFileSync('public/baked/huron/shape.json')), sk = JSON.parse(fs.readFileSync('cartograph/data/huron/clean/skeleton.json'))
const W = 1400, k = W / (2 * h), X = x => ((x - cx + h) * k).toFixed(1), Z = z => ((z - cz + h) * k).toFixed(1)
const pts = r => r.map(p => `${X(p[0] ?? p.x)},${Z(p[1] ?? p.z)}`).join(' ')
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
const C = ['#f2d64b', '#f08080', '#80c0f0', '#a0e0a0', '#d0a0f0']
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}"><rect width="100%" height="100%" fill="#fff"/>`
const t = s.tiles[T]
t.iA.forEach((r, i) => { svg += `<polygon points="${pts(r)}" fill="${A(r) > 0 ? C[i % C.length] : '#fff'}" stroke="#555" stroke-width="0.8"/>` })
svg += `<polygon points="${pts(t.ring)}" fill="none" stroke="#000" stroke-width="2"/>`
for (const r of Object.values(s.highway)) svg += `<polygon points="${pts(r)}" fill="none" stroke="#444" stroke-width="1.2"/>`
for (const st of sk.streets) { if (!st.points.some(p => Math.abs(p.x - cx) < h && Math.abs(p.z - cz) < h)) continue
  const hw = /motorway|trunk/.test(st.highway); svg += `<polyline points="${pts(st.points)}" fill="none" stroke="${hw ? '#d00' : '#06f'}" stroke-width="1.5"/>`
  const lab = st.points.find(p => Math.abs(p.x - cx) < h * 0.9 && Math.abs(p.z - cz) < h * 0.9); if (lab) svg += `<text x="${X(lab.x)}" y="${Z(lab.z)}" font-size="15" fill="#036">${st.id}</text>` }
svg += '</svg>'
await sharp(Buffer.from(svg)).png().toFile(out); console.log(out, t.iA.map(r => (A(r) / 1e4).toFixed(2)))
