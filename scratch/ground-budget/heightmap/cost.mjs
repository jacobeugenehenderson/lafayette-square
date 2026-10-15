// cost.mjs <scene> <refineTol m|-> [coastLandW coastWaterW] — step 5b/5c from residual-by-distance's outputs. READ-ONLY.
// (b) bytes of a 1 m record: over all land (what (a) gives for ① and LU, whose residual does not fall with distance), and over
//     a coast band read off the curve (widths passed in, read by eye from the summary — stated in the report). Two layouts:
//     Float32 heights (4 B/cell) and an int16 mm residual over the coarse grid (2 B/cell); patches = whole 5 m node boxes.
// (c) 1 m cells whose real detail |r1| exceeds the deformer's refineTol: the vertices a mesh would need to carry it.
import { readFileSync, statSync } from 'fs'
const [scene, tolA, cwL, cwW] = process.argv.slice(2)
const J = JSON.parse(readFileSync(new URL(`./${scene}.json`, import.meta.url)))
const root = new URL('../../../', import.meta.url).pathname
const tj = JSON.parse(readFileSync(`${root}cartograph/data/${scene}/clean/terrain.json`)), NN = tj.width * tj.height
const bin = readFileSync(new URL(`./${scene}.nodemin.bin`, import.meta.url)), F = (k) => new Float32Array(bin.buffer, bin.byteOffset + k * NN * 4, NN)
const coastD = F(2), land = new Uint8Array(bin.buffer, bin.byteOffset + 3 * NN * 4, NN)
const cellsPerNode = ((tj.bounds.maxX - tj.bounds.minX) / (tj.width - 1)) * ((tj.bounds.maxZ - tj.bounds.minZ) / (tj.height - 1))
const MB = (b) => (b / 1e6).toFixed(1) + ' MB'
const terrainBin = statSync(`${root}public/baked/${scene}/terrain.bin`).size, groundBin = statSync(`${root}public/baked/${scene}/ground.bin`).size
const gj = JSON.parse(readFileSync(`${root}public/baked/${scene}/ground.json`)); const servedV = gj.groups.reduce((a, g) => a + g.vertexCount, 0)
console.log(`\n=== ${scene} · served terrain.bin ${MB(terrainBin)} · served ground.bin ${MB(groundBin)} (${servedV.toLocaleString()} V) · coarse nodes ${NN.toLocaleString()} (${cellsPerNode.toFixed(2)} m² each)`)
const landNodes = land.reduce((a, b) => a + b, 0)
console.log(`  (b) ALL LAND at 1 m: ${J.landCells.toLocaleString()} cells → ${MB(J.landCells * 4)} Float32 · ${MB(J.landCells * 2)} int16 residual · as node patches ${landNodes.toLocaleString()} × ${cellsPerNode.toFixed(0)} cells → ${MB(landNodes * cellsPerNode * 2)} int16 + the coarse grid ${MB(terrainBin)}`)
if (cwL) { let n = 0; for (let i = 0; i < NN; i++) if ((land[i] && coastD[i] < +cwL) || (!land[i] && coastD[i] < +cwW)) n++
  console.log(`  (b) COAST BAND (land ${cwL} m, water ${cwW} m, read off the curve): ${n.toLocaleString()} node patches → ${MB(n * cellsPerNode * 4)} Float32 · ${MB(n * cellsPerNode * 2)} int16 · beside the coarse grid ${MB(terrainBin)}`) }
if (tolA && tolA !== '-') { const tol = +tolA, { NB, HB, KINDS, H1, N } = J
  const lowEdge = (h) => h === 0 ? 0 : Math.pow(10, (h - 1) / 30 - 4)
  const per = KINDS.map((k, ki) => { let o = 0, n = 0; for (let b = 0; b < NB; b++) { n += N[ki * NB + b]; for (let h = 0; h < HB; h++) if (lowEdge(h) >= tol) o += H1[(ki * NB + b) * HB + h] } return [k, o, n] })
  const tot = per.reduce((a, p) => a + p[1], 0)
  console.log(`  (c) 1 m cells with |r1| ≥ refineTol ${(tol * 1000).toFixed(1)} mm (a lower bound: whole histogram bins only): ${tot.toLocaleString()} = ${(tot / servedV).toFixed(1)}× the served slab's vertices`)
  for (const [k, o, n] of per) if (n) console.log(`      ${k.padEnd(12)} ${o.toLocaleString().padStart(12)} of ${n.toLocaleString()} (${(100 * o / n).toFixed(1)}%)`)
  if (cwL) { const ki = KINDS.indexOf('coast-land'), kw = KINDS.indexOf('coast-water'); let o = 0
    for (const [kk, W] of [[ki, +cwL], [kw, +cwW]]) for (let b = 0; b < Math.round(W / J.BIN); b++) for (let h = 0; h < HB; h++) if (lowEdge(h) >= tol) o += H1[(kk * NB + b) * HB + h]
    console.log(`      inside the coast band (nearest line = coast): ${o.toLocaleString()}`) } }
