// marram-tree-seating.mjs — ARE THE TREES SEATED ON THE GROUND AS IT IS DRAWN?
// ▶ node scratch/marram-tree-seating.mjs [--looks=huron,lafayette-square]
//
// Rendered geometry, reconstructed on the CPU exactly as the GPU builds it (no browser):
//   ground at (x,z) = the drawn triangle's barycentric blend of its VERTEX lifts, each
//                     lift = the RUNTIME terrain (public/baked/<look>/terrain.*) at the
//                     vertex — groundSampler.groundRawAt against the runtime heightfield.
//   tree base       = aGroundRaw = tree-anchors.json[i] when its placementKey + length
//                     bind (InstancedTrees' gate), else the smooth field (treeGroundRaw).
// Both are RAW (pre-exag); the shader multiplies both by the SAME live uExag, so the
// signed error in metres at exag e is e × (tree − ground). Reported at e = 1.
// ⭐ Ground NORMALS enter neither number: the normals A/B (uTerrainNormals) writes only
// objectNormal, so this error is identical with it at 1 and at 0 by construction.
// Writes nothing.
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { makeElevationSampler } from '../src/lib/terrainCommon.js'
import { makeGroundSampler } from '../cartograph/groundSampler.js'

const looks = (process.argv.find(a => a.startsWith('--looks=')) || '--looks=huron,lafayette-square').split('=')[1].split(',')
const readAB = p => { const u = readFileSync(p); return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) }
const loadTerrain = dir => {
  const j = JSON.parse(readFileSync(join(dir, 'terrain.json'), 'utf8'))
  const b = readFileSync(join(dir, 'terrain.bin'))
  return { ...j, data: new Float32Array(b.buffer, b.byteOffset, j.width * j.height) }
}
const q = (a, f) => { const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(f * s.length))] }
const stamp = p => existsSync(p) ? statSync(p).mtime.toTimeString().slice(0, 8) : 'absent'
const key = trees => { let h = 2166136261 >>> 0; for (const t of trees) { const k = `${t.x.toFixed(3)},${t.z.toFixed(3)}`; for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 } } return h.toString(16).padStart(8, '0') }

for (const look of looks) {
  const B = join('public/baked', look), C = join('cartograph/data', look, 'clean')
  console.log(`\n══ ${look} ══`)
  console.log(`   mtimes: ground.json ${stamp(join(B, 'ground.json'))} · tree-anchors ${stamp(join(B, 'tree-anchors.json'))} · trees ${stamp(join(B, 'trees.json'))} · runtime terrain ${stamp(join(B, 'terrain.bin'))} · clean terrain ${stamp(join(C, 'terrain.bin'))}`)
  const TR = loadTerrain(B)                              // what the RUNTIME lifts by
  const TC = existsSync(join(C, 'terrain.bin')) ? loadTerrain(C) : null   // what the ANCHOR bake read
  const same = TC && TC.width === TR.width && TC.height === TR.height && TC.baseElev === TR.baseElev && Buffer.compare(Buffer.from(TC.data.buffer, TC.data.byteOffset, TC.data.byteLength), Buffer.from(TR.data.buffer, TR.data.byteOffset, TR.data.byteLength)) === 0
  let maxd = 0; if (TC && !same && TC.width === TR.width) for (let i = 0; i < TR.data.length; i++) maxd = Math.max(maxd, Math.abs(TR.data[i] - TC.data[i]))
  console.log(`   runtime vs anchor-bake terrain: ${same ? 'IDENTICAL' : `⛔ DIFFER (${TR.width}×${TR.height} base ${TR.baseElev} vs ${TC?.width}×${TC?.height} base ${TC?.baseElev}${maxd ? `, max |Δ| ${maxd.toFixed(2)} m` : ''})`}`)
  const step = (TR.bounds.maxX - TR.bounds.minX) / (TR.width - 1)

  const sR = makeElevationSampler(TR, 1)
  const gj = JSON.parse(readFileSync(join(B, 'ground.json'), 'utf8'))
  const ground = makeGroundSampler(gj, readAB(join(B, gj.bin)), sR)
  const trees = JSON.parse(readFileSync(join(B, 'trees.json'), 'utf8')).instances || []
  const ad = existsSync(join(B, 'tree-anchors.json')) ? JSON.parse(readFileSync(join(B, 'tree-anchors.json'), 'utf8')) : null
  const k = key(trees)
  const bound = ad && ad.anchors?.length === trees.length && (ad.placementKey == null || ad.placementKey === k)
  console.log(`   ${trees.length} placements · anchors ${ad ? ad.anchors.length : 'absent'} · placementKey ${ad?.placementKey ?? '—'} vs ${k} → ${bound ? 'BOUND (runtime uses them)' : '⛔ NOT BOUND (runtime falls back to the smooth field)'}`)

  const err = [], errSmooth = [], rows = []
  for (let i = 0; i < trees.length; i++) {
    const t = trees[i]
    const drawn = ground.groundRawAt(t.x, t.z)
    const smooth = sR.getElevationRaw(t.x, t.z)
    const base = bound ? ad.anchors[i] : smooth
    const gx = (sR.getElevationRaw(t.x + step, t.z) - sR.getElevationRaw(t.x - step, t.z)) / (2 * step)
    const gz = (sR.getElevationRaw(t.x, t.z + step) - sR.getElevationRaw(t.x, t.z - step)) / (2 * step)
    const slope = Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI
    err.push(base - drawn); errSmooth.push(smooth - drawn); rows.push({ i, e: base - drawn, slope, t })
  }
  const abs = err.map(Math.abs)
  console.log(`   ⭐ tree base − DRAWN ground (m, exag 1): |err| p50 ${q(abs, .5).toFixed(3)} · p95 ${q(abs, .95).toFixed(3)} · p99 ${q(abs, .99).toFixed(3)} · max ${q(abs, 1).toFixed(2)}`)
  console.log(`      signed: min ${q(err, 0).toFixed(2)} (buried) · max ${q(err, 1).toFixed(2)} (floating) · >0.25 m off: ${abs.filter(a => a > 0.25).length} · >1 m: ${abs.filter(a => a > 1).length}`)
  const absS = errSmooth.map(Math.abs)
  console.log(`   smooth field − DRAWN ground (what an unanchored tree would get): p50 ${q(absS, .5).toFixed(3)} · p95 ${q(absS, .95).toFixed(3)} · max ${q(absS, 1).toFixed(2)}`)
  for (const [lo, hi] of [[0, 2], [2, 5], [5, 10], [10, 20], [20, 90]]) {
    const b = rows.filter(r => r.slope >= lo && r.slope < hi)
    if (b.length) console.log(`      slope ${String(lo).padStart(2)}–${String(hi).padEnd(2)}°: n ${String(b.length).padStart(6)} · |err| p95 ${q(b.map(r => Math.abs(r.e)), .95).toFixed(3)} · max ${q(b.map(r => Math.abs(r.e)), 1).toFixed(2)} m`)
  }
  const worst = rows.sort((a, b) => Math.abs(b.e) - Math.abs(a.e)).slice(0, 5)
  for (const w of worst) console.log(`      worst: #${w.i} ${w.t.species ?? ''} (${w.t.x.toFixed(1)}, ${w.t.z.toFixed(1)}) err ${w.e.toFixed(2)} m at slope ${w.slope.toFixed(1)}°`)
}
