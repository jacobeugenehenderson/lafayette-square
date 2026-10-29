// seam.mjs — Zob's C7 seam: where a near chunk (octaves 3) is drawn beside a far chunk (octaves 1), their along-shore
// boundaries sit on two lattices. At each boundary of each near chunk: the near chunk ends at its station b; the far
// neighbour starts at far station farAt(b) (cartograph/bake-revetment-far.js#chunkRanges). The signed along-shore
// offset (metres): > 0 the far neighbour starts past the near end (a GAP), < 0 before it (an OVERLAP). Per face's far
// step too, since the worst case is half a far step. ▶ node scratch/far-shore/seam.mjs --look=provincetown
import { readFileSync } from 'node:fs'
import { prepareFaces, chunkRanges } from '../../cartograph/bake-revetment-far.js'
const look = process.argv.find(a => a.startsWith('--look='))?.slice(7), dir = `public/baked/${look}`
const ab = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
const { faces } = prepareFaces({ revetment: JSON.parse(readFileSync(`${dir}/revetment.json`, 'utf8')), terrainJson: JSON.parse(readFileSync(`${dir}/terrain.json`, 'utf8')),
  terrainBin: ab(`${dir}/terrain.bin`), groundJson: JSON.parse(readFileSync(`${dir}/ground.json`, 'utf8')), groundBin: ab(`${dir}/ground.bin`) })
const off = [], steps = []
for (const f of faces) { const { G1, G3, ranges } = chunkRanges(f)
  const sN = (i) => G3.s0 + (G3.s1 - G3.s0) * i / (G3.nAlong - 1), sF = (i) => G1.s0 + (G1.s1 - G1.s0) * i / (G1.nAlong - 1)
  for (const r of ranges) { off.push(sF(r.far[1]) - sN(r.near[1]), sN(r.near[0]) - sF(r.far[0])); steps.push(G1.step) } }
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const abs = off.map(Math.abs)
console.log(`${look}: ${off.length} chunk boundaries · |offset| median ${q(abs, .5).toFixed(3)} m, p95 ${q(abs, .95).toFixed(3)} m, max ${Math.max(...abs).toFixed(3)} m · gaps ${off.filter(x => x > 1e-6).length}, overlaps ${off.filter(x => x < -1e-6).length}, exact ${off.filter(x => Math.abs(x) <= 1e-6).length} · far step median ${q(steps, .5).toFixed(2)} m (bound: half of it)`)
