// far-bake-vs-runtime.mjs — the baked far chunks (cartograph/bake-revetment-far.js, dry run) against the player's own
// far build (SlabRevetment.jsx's far useFrame: the whole face at FAR_OCTAVES, then groundRelative): the same triangles,
// position for position (y − raw) and raw for raw; plus the bins' gzip weight. ▶ node scratch/far-shore/far-bake-vs-runtime.mjs --look=<id>
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { bakeRevetmentFar, prepareFaces, FAR_OCTAVES } from '../../cartograph/bake-revetment-far.js'
import { drapeGlobals, revetmentDrape } from '../../src/lib/revetmentDrape.js'
const look = process.argv.find(a => a.startsWith('--look='))?.slice(7), dir = `public/baked/${look}`
const ab = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
const { doc, bins } = bakeRevetmentFar({ look, dryRun: true })
for (const [n, b] of Object.entries(bins)) console.log(`  ${n}: gzip ${(gzipSync(b).length / 1e6).toFixed(2)} MB`)
const { faces, parts } = prepareFaces({ revetment: JSON.parse(readFileSync(`${dir}/revetment.json`, 'utf8')), terrainJson: JSON.parse(readFileSync(`${dir}/terrain.json`, 'utf8')),
  terrainBin: ab(`${dir}/terrain.bin`), groundJson: JSON.parse(readFileSync(`${dir}/ground.json`, 'utf8')), groundBin: ab(`${dir}/ground.bin`) })
const tri = (P, R, I, t) => [0, 1, 2].map(c => { const v = I[t + c]; return `${P[v * 3]},${P[v * 3 + 1]},${P[v * 3 + 2]},${R[v]}` }).sort().join('|')
let bad = 0
for (const f of faces) {
  const G = drapeGlobals({ poly: f.poly, crestAt: f.crestAt, octaves: FAR_OCTAVES })
  const d = revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, octaves: FAR_OCTAVES, globals: G })
  const want = []
  if (d?.stats?.tris) { const P = new Float32Array(d.geometry.attributes.position.array), R = new Float32Array(P.length / 3)
    for (let i = 0; i < R.length; i++) { const raw = parts(P[i * 3], P[i * 3 + 2]).raw; P[i * 3 + 1] = P[i * 3 + 1] - raw; R[i] = raw }
    const I = d.geometry.index.array; for (let t = 0; t < I.length; t += 3) want.push(tri(P, R, I, t)) }
  const got = []
  for (const c of doc.chunks.filter(c => c.face === f.key)) { const b = bins[c.bin], o = c.offsets, v = c.vertexCount
    const P = new Float32Array(b.buffer, b.byteOffset + o.pos, v * 3), R4 = new Float32Array(b.buffer, b.byteOffset + o.pin, v * 4), R = R4.filter((_, i) => i % 4 === 1), I = new Uint32Array(b.buffer, b.byteOffset + o.index, c.indexCount)
    for (let t = 0; t < I.length; t += 3) got.push(tri(P, R, I, t)) }
  want.sort(); got.sort()
  if (want.join('\n') !== got.join('\n')) { bad++; console.log(`  ⛔ ${f.key}: runtime ${want.length} tris, baked ${got.length}`) }
}
console.log(bad ? `⛔ ${bad} faces differ` : `✅ ${look}: every face's baked chunks are the player's far build, triangle for triangle (position y − raw, raw)`)
