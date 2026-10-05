// Forensic (Sward): render the FROZEN ① (cartograph/data/huron/clean/ribbons.json protopolygon) in a window:
// one block's ring filled (yellow), every other block outlined (grey), skeleton chain centrelines (blue,
// motorways red, labelled by id), the shape.json highway outline H (black).
// Usage: node scratch/huron-median-lu/block-window.mjs <blockK> cx cz halfM out.png
import fs from 'fs'; import sharp from 'sharp'
const [K, cx, cz, h, out] = [+process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5], process.argv[6]]
const P = JSON.parse(fs.readFileSync('cartograph/data/huron/clean/ribbons.json')).protopolygon
const sk = JSON.parse(fs.readFileSync('cartograph/data/huron/clean/skeleton.json'))
const H = Object.values(JSON.parse(fs.readFileSync('public/baked/huron/shape.json')).highway)
const W = 1400, k = W / (2 * h), X = x => ((x - cx + h) * k).toFixed(1), Z = z => ((z - cz + h) * k).toFixed(1)
const pts = r => r.map(p => `${X(p[0] ?? p.x)},${Z(p[1] ?? p.z)}`).join(' ')
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}"><rect width="100%" height="100%" fill="#fff"/>`
P.blocks.forEach((b, i) => { svg += `<polygon points="${pts(b)}" fill="${i === K ? '#f2d64b' : 'none'}" stroke="#888" stroke-width="1"/>` })
for (const r of H) svg += `<polygon points="${pts(r)}" fill="none" stroke="#000" stroke-width="2"/>`
for (const s of sk.streets) {
  const inWin = s.points.some(p => Math.abs(p.x - cx) < h && Math.abs(p.z - cz) < h); if (!inWin) continue
  const hw = /motorway|trunk/.test(s.highway)
  svg += `<polyline points="${pts(s.points)}" fill="none" stroke="${hw ? '#d00' : '#06f'}" stroke-width="${hw ? 2.5 : 1.5}"/>`
  for (const p of [s.points[0], s.points[s.points.length - 1]]) if (Math.abs(p.x - cx) < h && Math.abs(p.z - cz) < h) svg += `<circle cx="${X(p.x)}" cy="${Z(p.z)}" r="5" fill="${hw ? '#d00' : '#06f'}"/>`
  const m = s.points[Math.floor(s.points.length / 2)]
  const lab = s.points.find(p => Math.abs(p.x - cx) < h * 0.9 && Math.abs(p.z - cz) < h * 0.9) || m
  svg += `<text x="${X(lab.x)}" y="${Z(lab.z)}" font-size="16" fill="${hw ? '#a00' : '#036'}">${s.id}${s.gradeSeparated ? '(gs)' : ''}</text>`
}
svg += '</svg>'
await sharp(Buffer.from(svg)).png().toFile(out); console.log(out)
