// claims-the-drape-meets-itself-on-one-line.mjs — WHERE THE NEAR STONE MEETS THE FAR, IS IT ONE LINE FROM ONE PRODUCER?
//
// Jacob, 2026-10-29: "another 'line getting measured twice' issue where we should ditch one of them and we should call them
// from the same place." (BRIEF-the-drape-sizes-one-nested-lattice.) Read off src/lib/revetmentDrape.js's own output, on a
// planted shore and on every coastal town's slab (public/baked/<town>/, with the drawn ground and the toe the bake uses):
//   1 · THE CREST'S EXACT MAXIMUM. drapeLattices' hMax (crestAt at revetmentFromSlab.js#crestAndEnds' crestBreaks) is at
//       least the densest sampling of crestAt (1e6 samples a face) and at most the tallest armoured station. Max excess reported.
//   2 · ONE NESTED LATTICE. Every octave's counts are octave 1's × 2^(o−1), along and across, and every far station is a near
//       station to the bit: the along-shore offset at every chunk boundary is 0 (max).
//   3 · ONE LINE. At each chunk boundary sampled, a near chunk (conform) beside the far chunk the far draws there:
//       a · the far chunk's row is farRow's: positions and normals, bit for bit;
//       b · the near's shared boundary vertices are the far's, positions and normals bit for bit;
//       c · its in-between ones lie on the far's segments, the normals are the far's unnormalized lerp, the ground pins
//           (drapeRaws) the far's lerped: residues reported, and the display height at exag 0 and 2;
//       d · the near draws exactly the boundary segments the far-side column draws (Zob: the far's DRAW decides, not keep).
// ⛔ No town found is RED: pass --slab=<dir holding <town>/>. The planted shore runs regardless.
// ⭐ MUTANTS (--mutants), on the planted shore, each must turn it RED: the near computing its own boundary row → 3 ·
// the far not through farRow → 3 · the 201-sample sizing back → 1 · the near's own fan at the boundary → 3 ·
// the trim by the near's keep → 3 · each lattice rounding its own count → 2.
// ▶ node checks/claims-the-drape-meets-itself-on-one-line.mjs [--slab=<dir>] [--every=<n>] [--mutants]
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { revetmentFaces } from '../src/lib/revetmentFromSlab.js'
import { drapeChunks } from '../src/lib/shoreChunks.js'
import { prepareFaces } from '../cartograph/bake-revetment-far.js'
import { MIN_ARMOUR_D50_M } from '../cartograph/shore-armour.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOME = join(ROOT, 'src/lib/revetmentDrape.js')
const arg = (n, d) => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SLAB = arg('slab', join(ROOT, 'public/baked')), EVERY = +arg('every', '25'), DENSE = 1e6

// a copy of the module with one edit, its imports made absolute so it loads from the OS temp dir
const copyOf = (a, b) => { const src = readFileSync(HOME, 'utf8')
  if (!src.includes(a)) throw new Error(`⛔ mutant target gone from revetmentDrape.js: ${JSON.stringify(a)}`)
  const out = join(mkdtempSync(join(tmpdir(), 'drape-')), 'revetmentDrape.mjs')
  writeFileSync(out, src.replace(a, b).replace("from 'three'", `from '${import.meta.resolve('three')}'`)
    .replace("from '../../cartograph/shore-armour.mjs'", `from '${pathToFileURL(join(ROOT, 'cartograph/shore-armour.mjs')).href}'`))
  return import(pathToFileURL(out).href) }

// ── the planted shore: a straight armoured run, and a 9 km face armoured for 20 m between 201-sample points ──
function planted() {
  // ⚠️ lengths that are no whole number of steps: a round length nests by coincidence and hides a lattice that rounds its own count
  const line = (L, armour) => { const st = []; for (let s = 0; s < L; s += 10) st.push({ x: s, z: 0, ...armour(s) }); st.push({ x: L, z: 0, ...armour(L) }); return st }
  const doc = { version: 1, material: { riprapReposeDeg: 34 }, arcs: [
    { index: 0, faces: ['left'], stations: line(307.7, () => ({ armour: true, crest: 2.5 })) },
    { index: 1, faces: ['left'], stations: line(9007.3, (s) => (s >= 4510 && s <= 4530 ? { armour: true, crest: 2 } : { armour: false, crest: 0 })) },
  ] }
  const groundAt = (x, z) => -0.4 + 0.3 * Math.sin(x / 7) + 0.2 * Math.cos(z / 5)
  return revetmentFaces(doc).map(f => ({ ...f, toeAt: null, berm: null, groundAt, waterY: 0 }))
}
const towns = existsSync(SLAB) ? readdirSync(SLAB).filter(t => ['revetment.json', 'ground.json', 'ground.bin', 'terrain.json', 'terrain.bin'].every(f => existsSync(join(SLAB, t, f)))) : []
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
const townFaces = (t) => { const rd = (f) => readFileSync(join(SLAB, t, f))
  const { faces, parts } = prepareFaces({ revetment: JSON.parse(rd('revetment.json')), terrainJson: JSON.parse(rd('terrain.json')), terrainBin: ab(rd('terrain.bin')), groundJson: JSON.parse(rd('ground.json')), groundBin: ab(rd('ground.bin')) })
  return { faces, rawAt: (x, z) => parts(x, z).raw } }

const key3 = (P, v) => `${P[v * 3]},${P[v * 3 + 1]},${P[v * 3 + 2]}`
const bitEq = (a, b) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]))

/** Every judge over a set of faces, with module M. */
function judge(M, faces, rawAt, say, { sampleEvery = EVERY, label }) {
  let j1 = { n: 0, bad: [], excess: 0 }, j2 = { n: 0, bad: [], off: 0 }
  const j3 = { n: 0, a: [], b: [], d: [], posRes: 0, nRes: 0, rawRes: 0, yRes: 0 }
  for (const f of faces) {
    const [G1, G3] = M.drapeLattices({ poly: f.poly, crestAt: f.crestAt, crestBreaks: f.crestBreaks, toeAt: f.toeAt, berm: f.berm, octaves: [M.FAR_OCTAVES, M.NEAR_OCTAVES] })
    // 1 · the crest's exact maximum
    let dense = 0; for (let k = 0; k <= DENSE; k++) dense = Math.max(dense, f.crestAt(k / DENSE))
    const top = Math.max(0, ...f.stations.filter(s => s.armour).map(s => s.crest || 0))
    j1.n++; j1.excess = Math.max(j1.excess, G1.hMax - dense)
    if (!(G1.hMax >= dense - 1e-9 && G1.hMax <= top + 1e-9)) j1.bad.push(`${f.key}: hMax ${G1.hMax.toFixed(4)} m, dense ${dense.toFixed(4)} m, tallest station ${top.toFixed(4)} m`)
    // 2 · one nested lattice, and every far station a near station
    const r = (G3.nAlong - 1) / (G1.nAlong - 1)
    j2.n++
    if (r !== G3.nest / G1.nest || (G3.nAcross - 1) !== (G1.nAcross - 1) * r) { j2.bad.push(`${f.key}: ${G1.nAlong}×${G1.nAcross} far, ${G3.nAlong}×${G3.nAcross} near, not nested ×${G3.nest}`); continue }
    const sAt = (G, i) => G.s0 + ((G.s1 - G.s0) * i) / (G.nAlong - 1)
    for (let I = 0; I < G1.nAlong; I++) { const d = Math.abs(sAt(G1, I) - sAt(G3, I * r)); if (d > j2.off) j2.off = d }
    if (j2.off !== 0) j2.bad.push(`${f.key}: a far station is ${j2.off} m off its near station`)
    // 3 · one line, at sampled boundaries
    if (G1.hMax < MIN_ARMOUR_D50_M) continue
    const chunks = drapeChunks(G1, G3)
    const args = { poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY }
    for (let k = 1; k < chunks.length; k += sampleEvery) {
      const I = chunks[k].far[0]
      const fr = M.farRow(G1, I, { ...args, noise: 'cellular', gather: M.DRAPE_DEFAULT_GATHER, uniform: false, seed: 99 })
      if (!fr) continue                                              // a bare station: nothing meets there
      const farBefore = M.revetmentDrape({ ...args, globals: G1, stations: chunks[k - 1].far })   // the visible far neighbour
      const near = M.revetmentDrape({ ...args, globals: G3, stations: chunks[k].near, conform: G1 })
      const FP = farBefore.geometry.attributes.position.array, FN = farBefore.geometry.attributes.normal.array, FI = farBefore.geometry.index.array
      const at = new Map(); for (let v = 0; v < FP.length / 3; v++) at.set(key3(FP, v), v)
      j3.n++
      const where = `${label} ${f.key} far station ${I}`
      // a · the far chunk's row is farRow's
      const farV = []
      for (let J = 0; J < G1.nAcross; J++) { const v = at.get(`${fr.pos[J * 3]},${fr.pos[J * 3 + 1]},${fr.pos[J * 3 + 2]}`); farV.push(v ?? -1)
        if (v != null && !bitEq(Array.from(FN.subarray(v * 3, v * 3 + 3)), Array.from(fr.normal.subarray(J * 3, J * 3 + 3)))) { j3.a.push(`${where}: far vertex ${J}'s normal is not farRow's`); break } }
      const farSeg = new Set()
      for (let t = 0; t < FI.length; t += 3) { const tri = [FI[t], FI[t + 1], FI[t + 2]]
        for (let J = 0; J + 1 < G1.nAcross; J++) if (farV[J] >= 0 && farV[J + 1] >= 0 && tri.includes(farV[J]) && tri.includes(farV[J + 1])) farSeg.add(J) }
      for (const J of farSeg) if (!fr.before[J]) { j3.a.push(`${where}: the far draws segment ${J} and farRow says it does not`); break }
      // b, c · the near's boundary row
      const seam = near.geometry.userData.seams?.find(s => s.station === chunks[k].near[0])
      const NP = near.geometry.attributes.position.array, NN = near.geometry.attributes.normal.array, NI = near.geometry.index.array
      if (!seam) { if (farSeg.size) j3.b.push(`${where}: the far draws ${farSeg.size} segment(s) here and the near chunk names no far row`); continue }
      const raws = M.drapeRaws(near, rawAt), farRaws = M.drapeRaws(farBefore, rawAt)
      for (let j = 0; j < G3.nAcross; j++) {
        const v = seam.verts[j]; if (v < 0) continue
        const J = Math.floor(j / r), w = (j % r) / r, p = Array.from(NP.subarray(v * 3, v * 3 + 3)), n = Array.from(NN.subarray(v * 3, v * 3 + 3))
        if (!w) {
          if (!bitEq(p, Array.from(fr.pos.subarray(J * 3, J * 3 + 3)))) { j3.b.push(`${where}: near vertex ${j} is not far vertex ${J}`); break }
          if (!bitEq(n, Array.from(fr.normal.subarray(J * 3, J * 3 + 3)))) { j3.b.push(`${where}: near vertex ${j}'s normal is not the far's`); break }
          continue
        }
        const A = fr.pos.subarray(J * 3, J * 3 + 3), B = fr.pos.subarray(J * 3 + 3, J * 3 + 6), An = fr.normal.subarray(J * 3, J * 3 + 3), Bn = fr.normal.subarray(J * 3 + 3, J * 3 + 6)
        for (let c = 0; c < 3; c++) { j3.posRes = Math.max(j3.posRes, Math.abs(p[c] - (A[c] + (B[c] - A[c]) * w))); j3.nRes = Math.max(j3.nRes, Math.abs(n[c] - (An[c] + (Bn[c] - An[c]) * w))) }
        const ra = farRaws[farV[J]], rb = farRaws[farV[J + 1]]
        if (ra != null && rb != null && farV[J] >= 0 && farV[J + 1] >= 0) {
          const rl = ra + (rb - ra) * w; j3.rawRes = Math.max(j3.rawRes, Math.abs(raws[v] - rl))
          for (const e of [0, 2]) { const yN = (p[1] - raws[v]) + raws[v] * e, yA = (A[1] - ra) + ra * e, yB = (B[1] - rb) + rb * e
            j3.yRes = Math.max(j3.yRes, Math.abs(yN - (yA + (yB - yA) * w))) }
        }
      }
      // d · the near draws the segments the far-side column draws
      const nearSeg = new Set(), vj = new Map(); seam.verts.forEach((v, j) => { if (v >= 0) vj.set(v, j) })
      for (let t = 0; t < NI.length; t += 3) { const js = [NI[t], NI[t + 1], NI[t + 2]].map(v => vj.get(v)).filter(j => j != null)
        for (const a of js) for (const b of js) if (b === a + 1) nearSeg.add(a) }
      const want = new Set(); for (const J of farSeg) for (let s = 0; s < r; s++) want.add(J * r + s)
      const miss = [...want].filter(j => !nearSeg.has(j)), extra = [...nearSeg].filter(j => !want.has(j))
      if (miss.length || extra.length) j3.d.push(`${where}: the near draws ${nearSeg.size} boundary segments, the far-side column ${want.size} (missing ${miss.length}, extra ${extra.length})`)
    }
  }
  say(!j1.bad.length && j1.n > 0, `${label}: 1 · hMax is the crest's exact maximum on ${j1.n} faces (max excess over 1e6 samples ${j1.excess.toExponential(2)} m)${j1.bad.length ? ` — ${j1.bad.length} wrong, first ${j1.bad[0]}` : ''}`)
  say(!j2.bad.length && j2.n > 0, `${label}: 2 · one nested lattice on ${j2.n} faces, every far station a near station (max along-offset ${j2.off} m)${j2.bad.length ? ` — ${j2.bad[0]}` : ''}`)
  const r3 = [...j3.a, ...j3.b, ...j3.d]
  say(!r3.length && j3.n > 0, `${label}: 3 · ${j3.n} boundaries: the far's row is farRow's, the near's shared vertices and normals are the far's to the bit, and it draws the far-side column's segments · residues in-between: position ${j3.posRes.toExponential(2)} m, normal ${j3.nRes.toExponential(2)}, pin ${j3.rawRes.toExponential(2)} m, height at exag 0 and 2 ${j3.yRes.toExponential(2)} m${r3.length ? ` — ${r3.length} failed, first ${r3[0]}` : ''}`)
  return { j1, j2, j3 }
}

const M = await import(pathToFileURL(HOME).href)
const bad = []
const say = (ok, what) => { console.log(`  ${ok ? '✅' : '⛔'} ${what}`); if (!ok) bad.push(what) }
console.log('── the drape meets itself on one line (revetmentDrape.js)')
const P = planted(), flatRaw = (x, z) => P[0].groundAt(x, z)
judge(M, P, flatRaw, say, { sampleEvery: 1, label: 'planted' })
if (!towns.length) say(false, `no coastal town's slab under ${SLAB} (revetment.json + ground + terrain): only the planted shore was checked`)
for (const t of towns) { const { faces, rawAt } = townFaces(t); judge(M, faces, rawAt, say, { label: t }) }

if (process.argv.includes('--mutants')) {
  console.log('── mutants, on the planted shore (each must turn it RED)')
  const MUT = [
    ['the near computes its own boundary row', 3, "sm = lo?.i === i ? lo : hi?.i === i ? hi : null", 'sm = null'],
    ['the far not through farRow', 3, 'live.push(stationRow(G, i, P, pos, keep, (i - i0) * nAcross))', 'live.push(stationRow(G, i, { ...P, seed: P.seed + 1 }, pos, keep, (i - i0) * nAcross))'],
    ['the 201-sample sizing back', 1, 'for (const t of crestBreaks) if (t >= t0 && t <= t1) hMax = Math.max(hMax, crestAt(t))', 'for (let k = 0; k <= 200; k++) hMax = Math.max(hMax, crestAt(t0 + (t1 - t0) * k / 200))'],
    ["the near's own fan at the boundary", 3, 'for (let c = 0; c < 3; c++) N[p * 3 + c] = w ?', 'for (let c = 0; c < 3 && false; c++) N[p * 3 + c] = w ?'],
    ["the trim by the near's keep", 3, 'const draws = by ? by[0].row[by[1]][Math.floor((j - 1) / by[0].r)] : keep[a] + keep[b] + keep[c] + keep[e] >= 3', 'const draws = (by ? stationRow(G, by[0].i, P, new Float32Array(nRows * nAcross * 3), keep, (by[0].i - bld0) * nAcross) : 0, keep[a] + keep[b] + keep[c] + keep[e] >= 3)'],
    ['each lattice rounding its own count', 2, 'const nest = 2 ** (o - 1), nAlong = (n1 - 1) * nest + 1', 'const nest = 2 ** (o - 1), nAlong = Math.round((s1 - s0) / (step1 / nest)) + 1'],
  ]
  let alive = 0
  for (const [name, want, a, b] of MUT) {
    const red = []
    try { const R = judge(await copyOf(a, b), P, flatRaw, (ok) => { if (!ok) red.push(ok) }, { sampleEvery: 1, label: 'mutant' })
      const hit = want === 1 ? R.j1.bad.length : want === 2 ? R.j2.bad.length : R.j3.a.length + R.j3.b.length + R.j3.d.length
      console.log(`  mutant: ${name} → judge ${want} ${hit ? 'RED ✓' : 'GREEN ✗'}`); if (!hit) alive++ }
    catch (e) { console.log(`  mutant: ${name} → threw (${e.message.split('\n')[0].slice(0, 120)}) — RED ✓`) }
  }
  if (alive) bad.push(`${alive} mutant(s) survived`)
}
console.log(bad.length ? `⛔ ${bad.length} failed` : '✅ the near meets the far on one line, from one producer, on one nested lattice')
process.exit(bad.length ? 1 : 0)
