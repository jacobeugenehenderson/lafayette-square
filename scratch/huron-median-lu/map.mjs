// Forensic (Sward): SVG/PNG of Huron's frozen tiles coloured by tile.lu, the highway envelope
// (black), its holes (red), runs on motorway* skels (blue), tile indices labelled.
import fs from 'fs'; import sharp from 'sharp'
const s = JSON.parse(fs.readFileSync('public/baked/huron/shape.json'))
const C = { agricultural: '#d9c34a', greenhouse: '#e07ad0', recreation: '#6ea03e', residential: '#5a8a3a', commercial: '#a87d3e', verge: '#9be29b', underived: '#ff2020', industrial: '#8e7060', cemetery: '#777', park: '#2f7', parking: '#555', institutional: '#7e8aa8', vacant: '#aa8', island: '#0ff' }
const xs = s.tiles.flatMap(t => t.ring.map(p => p[0])), zs = s.tiles.flatMap(t => t.ring.map(p => p[1]))
const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
const W = 3000, k = W / (x1 - x0), H = Math.ceil((z1 - z0) * k)
const P = r => r.map(p => `${((p[0] - x0) * k).toFixed(1)},${((p[1] - z0) * k).toFixed(1)}`).join(' ')
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>`
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
s.tiles.forEach(t => { svg += `<polygon points="${P(t.ring)}" fill="${C[t.lu] || '#000'}" stroke="#333" stroke-width="0.6"/>` })
for (const r of Object.values(s.highway)) svg += `<polygon points="${P(r)}" fill="none" stroke="${A(r) > 0 ? '#000' : '#f00'}" stroke-width="${A(r) > 0 ? 1.2 : 2.5}"/>`
s.tiles.forEach(t => t.runs.filter(r => /motorway/.test(r.skelId)).forEach(r => { svg += `<polyline points="${P(r.poly)}" fill="none" stroke="#00f" stroke-width="2"/>` }))
s.tiles.forEach((t, i) => { const c = t.ring.reduce((a, p) => [a[0] + p[0] / t.ring.length, a[1] + p[1] / t.ring.length], [0, 0]); if (Math.abs(A(t.ring)) > 5e4 || t.lu === 'verge') svg += `<text x="${((c[0] - x0) * k).toFixed(0)}" y="${((c[1] - z0) * k).toFixed(0)}" font-size="${Math.abs(A(t.ring)) > 5e5 ? 30 : 14}" fill="#000">${i}</text>` })
svg += '</svg>'
const out = process.argv[2] || 'scratch/huron-median-lu/map.png'
await sharp(Buffer.from(svg)).png().toFile(out); console.log(out, W, H)
