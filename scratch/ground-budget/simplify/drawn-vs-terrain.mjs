// drawn-vs-terrain.mjs — where the DRAWN ground (BakedGround.jsx + terrainShader `baked`: y + aRaw × terrainExag, lit by
// aGrad.xy × E + aGrad.zw) departs from the terrain under it (terrainLoad.js getElevationRaw × E) by more than --lim.
// Per group: vertices over, triangles whose drawn vertical extent exceeds --lim (a wall), the bin's own sanity (offsets
// inside the bin, NaN), and the lighting normal's tilt from aGrad against the drawn face slope. Read-only.
//   node --max-old-space-size=8192 scratch/ground-budget/simplify/drawn-vs-terrain.mjs --slab=<dir> [--lim=0.5] [--show=8] [--mutate]
// --flat: the slab was baked against a FLAT terrain (scratch/ground-height/ab terrainLoad.flat.js: every sample 0), so its
//   terrain is 0. --at=x,z;x,z: for each point, the triangles whose centroid is within 3 m (xz) and the most any of them rises over its terrain.
// --mutate: lifts one vertex's aRaw by 2 × lim in memory and must then report it (the check seen to fail).
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const dir = arg('slab'), LIM = +(arg('lim') || 0.5), SHOW = +(arg('show') || 8), MUT = process.argv.includes('--mutate')
const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin))
const AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const FLAT = process.argv.includes('--flat'), T0 = loadSceneTerrain(gj.look), E = T0.exag
const T = FLAT ? { getElevationRaw: () => 0 } : T0
const AT = (arg('at') || '').split(';').filter(Boolean).map(p => p.split(',').map(Number)), atHit = AT.map(() => ({ n: 0, ex: -Infinity, g: '' })), AT_R = 3
if (!(E > 0)) throw new Error('drawn-vs-terrain: the town names no exaggeration')
let tot = { v: 0, vo: 0, t: 0, to: 0, nan: 0 }, worst = [], rows = []
let mutated = false, texN = 0
for (const g of gj.groups) {
  // ⚠️ THE TEXTURE PATH (a slab baked before the deformer, no aRaw): the shader lifts by the terrain field at the vertex
  // (terrainShader perVertex), so its terrain part is getElevationRaw there — drawnGround.js's own migration path
  const tex = g.rawByteOffset == null
  const ends = [g.vertexByteOffset + g.vertexCount * 12, g.indexByteOffset + g.indexCount * 4, ...(tex ? [] : [g.rawByteOffset + g.vertexCount * 4, g.gradByteOffset + g.vertexCount * 16])]
  if (ends.some(e => e > buf.byteLength)) throw new Error(`group ${g.id}: a section runs past the bin (${buf.byteLength} B)`)
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  const R = tex ? Float32Array.from({ length: g.vertexCount }, (_, v) => T.getElevationRaw(P[v * 3], P[v * 3 + 2])) : new Float32Array(AB, g.rawByteOffset, g.vertexCount)
  const G = tex ? new Float32Array(g.vertexCount * 4) : new Float32Array(AB, g.gradByteOffset, g.vertexCount * 4)
  if (tex) texN++
  if (MUT && !mutated && g.vertexCount > 10) { R[5] += 2 * LIM / E; mutated = `${g.id} v5` }
  const d = new Float32Array(g.vertexCount)
  let vo = 0, nan = 0, idxBad = 0
  for (let v = 0; v < g.vertexCount; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], h = y + R[v] * E, t = T.getElevationRaw(x, z) * E
    if (!Number.isFinite(h) || !Number.isFinite(t) || G.subarray(v * 4, v * 4 + 4).some(q => !Number.isFinite(q))) { nan++; continue }
    d[v] = h - t
    if (Math.abs(d[v]) > LIM) { vo++; worst.push([Math.abs(d[v]), `${g.id} v${v} (${x.toFixed(1)}, ${z.toFixed(1)}) drawn ${h.toFixed(2)} terrain ${t.toFixed(2)} y ${y.toFixed(3)}`]) }
  }
  let to = 0, gradOff = 0
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k], b = I[k + 1], c = I[k + 2]
    if (a >= g.vertexCount || b >= g.vertexCount || c >= g.vertexCount) { idxBad++; continue }
    for (let q = 0; q < AT.length; q++) { const [qx, qz] = AT[q], cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3, cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3
      if (Math.hypot(cx - qx, cz - qz) <= AT_R) { const hh = [a, b, c].map(v => P[v * 3 + 1] + R[v] * E), tt = [a, b, c].map(v => T.getElevationRaw(P[v * 3], P[v * 3 + 2]) * E), ex = (Math.max(...hh) - Math.min(...hh)) - (Math.max(...tt) - Math.min(...tt))
        atHit[q].n++; if (ex > atHit[q].ex) { atHit[q].ex = ex; atHit[q].g = g.id } } }
    const ha = P[a * 3 + 1] + R[a] * E, hb = P[b * 3 + 1] + R[b] * E, hc = P[c * 3 + 1] + R[c] * E
    if (Math.max(ha, hb, hc) - Math.min(ha, hb, hc) > LIM) {
      const span = Math.max(Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 2] - P[b * 3 + 2]), Math.hypot(P[b * 3] - P[c * 3], P[b * 3 + 2] - P[c * 3 + 2]), Math.hypot(P[c * 3] - P[a * 3], P[c * 3 + 2] - P[a * 3 + 2]))
      // a wall: more drawn rise than the terrain under it gives across the same span
      const tr = Math.max(...[a, b, c].map(v => T.getElevationRaw(P[v * 3], P[v * 3 + 2]) * E)) - Math.min(...[a, b, c].map(v => T.getElevationRaw(P[v * 3], P[v * 3 + 2]) * E))
      if ((Math.max(ha, hb, hc) - Math.min(ha, hb, hc)) - tr > LIM) { to++; worst.push([Math.max(ha, hb, hc) - Math.min(ha, hb, hc) - tr, `${g.id} tri ${k / 3} at (${P[a * 3].toFixed(1)}, ${P[a * 3 + 2].toFixed(1)}) rise ${(Math.max(ha, hb, hc) - Math.min(ha, hb, hc)).toFixed(2)} m over ${span.toFixed(2)} m, terrain rise ${tr.toFixed(2)}`]) }
    }
  }
  // lighting: the shader's normal slope |aGrad.xy·E + aGrad.zw| vs the steepest drawn slope of the incident faces is not
  // checked per face here — only the count of vertices whose shader slope exceeds 1 (a 45° tilt, a lit "wall")
  for (let v = 0; v < g.vertexCount; v++) if (Math.hypot(G[v * 4] * E + G[v * 4 + 2], G[v * 4 + 1] * E + G[v * 4 + 3]) > 1) gradOff++
  tot.v += g.vertexCount; tot.vo += vo; tot.t += I.length / 3; tot.to += to; tot.nan += nan
  if (vo || to || nan || idxBad || gradOff) rows.push(`${(g.kind + ':' + g.id).padEnd(30)} V ${g.vertexCount} over ${vo} · T ${I.length / 3} walls ${to} · NaN ${nan} · bad idx ${idxBad} · shader slope>1 ${gradOff}`)
}
console.log(`${dir} · look ${gj.look} · E ${E} · lim ${LIM} m${FLAT ? ' · FLAT terrain (0)' : ''}${texN ? ` · ${texN} group(s) on the TEXTURE path (lift = terrain field at the vertex; shader slope not read)` : ''}${mutated ? ` · MUTATED ${mutated}` : ''}`)
console.log(`vertices drawn > ${LIM} m off the terrain: ${tot.vo} of ${tot.v} · triangles rising > ${LIM} m more than their terrain: ${tot.to} of ${tot.t} · non-finite ${tot.nan}`)
for (const r of rows) console.log('  ' + r)
AT.forEach(([x, z], q) => console.log(`  at (${x}, ${z}) ≤ ${AT_R} m: ${atHit[q].n} triangle(s) · ${atHit[q].n ? `most rise over terrain ${atHit[q].ex.toFixed(2)} m (${atHit[q].g}) → ${atHit[q].ex > LIM ? 'WALL' : 'no wall'}` : 'no ground here'}`))
worst.sort((a, b) => b[0] - a[0]); for (const [, s] of worst.slice(0, SHOW)) console.log('   worst: ' + s)
