// near-vs-far-box.mjs — how far the near layer (octaves 3) reaches past the far layer's (octaves 1) bounds, per chunk the
// far keeps: in XZ (metres) and in y at exag 1 (metres), and as multiples of the chunk's own block (d50For(hMax)) and its
// far lattice step. What a derived pad must cover. ▶ node scratch/far-shore/near-vs-far-box.mjs --look=provincetown
import { readFileSync } from 'node:fs'
import { prepareFaces, chunkRanges, FAR_OCTAVES, NEAR_OCTAVES } from '../../cartograph/bake-revetment-far.js'
import { revetmentDrape } from '../../src/lib/revetmentDrape.js'
const look = process.argv.find(a => a.startsWith('--look='))?.slice(7), dir = `public/baked/${look}`
const ab = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
const { faces } = prepareFaces({ revetment: JSON.parse(readFileSync(`${dir}/revetment.json`, 'utf8')), terrainJson: JSON.parse(readFileSync(`${dir}/terrain.json`, 'utf8')),
  terrainBin: ab(`${dir}/terrain.bin`), groundJson: JSON.parse(readFileSync(`${dir}/ground.json`, 'utf8')), groundBin: ab(`${dir}/ground.bin`) })
const box = (P) => { const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (let i = 0; i < P.length; i += 3) for (let c = 0; c < 3; c++) { b[c] = Math.min(b[c], P[i + c]); b[c + 3] = Math.max(b[c + 3], P[i + c]) } return b }
const rows = []
for (const f of faces) { const { G1, G3, ranges } = chunkRanges(f)
  for (const r of ranges) { if (r.far[1] <= r.far[0]) continue
    const a = (o, G, st) => revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, octaves: o, globals: G, stations: st })
    const d1 = a(FAR_OCTAVES, G1, r.far); if (!d1?.stats?.tris) continue
    const d3 = a(NEAR_OCTAVES, G3, r.near); if (!d3?.stats?.tris) continue
    const F = box(d1.geometry.attributes.position.array), N = box(d3.geometry.attributes.position.array)
    const xz = Math.max(F[0] - N[0], F[2] - N[2], N[3] - F[3], N[5] - F[5], 0), y = Math.max(F[1] - N[1], N[4] - F[4], 0)
    rows.push({ xz, y, blk: G1.blk, step1: G1.step }) } }
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
for (const [k, f] of [['xz m', r => r.xz], ['y m', r => r.y], ['xz / blk', r => r.xz / r.blk], ['y / blk', r => r.y / r.blk], ['xz / far step', r => r.xz / r.step1]])
  { const v = rows.map(f); console.log(`${look} ${k.padEnd(14)} median ${q(v, .5).toFixed(2)} · p99 ${q(v, .99).toFixed(2)} · max ${Math.max(...v).toFixed(2)}  (${rows.length} chunks)`) }
