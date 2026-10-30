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
//   4 · AFTER DECODE (revetment-far format 3, src/lib/farQuant.js; Jacob, 2026-10-29: "compress, fine normals"), off the bins
//       (the town's on disk; the planted shore's packed in memory by the bake's own functions):
//       a · each chunk decodes to its build on the town's grid, to the bit (positions snapped, normals through the octahedral
//           round trip, pins and index exact), and every built vertex is the WHOLE-FACE far build's, position and normal:
//           so the far drawn is the whole-face build up to the quantization. Max errors reported: position against the 1 mm
//           lattice (bound: half a step, plus f32's half ulp), normal in degrees;
//       b · every vertex two far chunks share decodes to the same bits in both (one grid, so the seam is 0 after decode);
//       c · at each boundary sampled, the near seated by drapeRelative on the town's grid meets the DECODED far: shared
//           vertices and normals to the bit, in-between ones on the decoded segment (residue reported).
// ⛔ No town found is RED: pass --slab=<dir holding <town>/>. The planted shore runs regardless.
// ⭐ MUTANTS (--mutants), on the planted shore, each must turn it RED: the near computing its own boundary row → 3 ·
// the far not through farRow → 3 · the 201-sample sizing back → 1 · the near's own fan at the boundary → 3 ·
// the trim by the near's keep → 3 · each lattice rounding its own count → 2 · the decode skipped (the u16 drawn as
// metres) → 4 · the near meeting the far before quantization → 4.
// ▶ node checks/claims-the-drape-meets-itself-on-one-line.mjs [--slab=<dir>] [--every=<n>] [--mutants]
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { revetmentFaces } from '../src/lib/revetmentFromSlab.js'
import { drapeChunks } from '../src/lib/shoreChunks.js'
import { prepareFaces, farChunksOf, buildFaceChunks, pack } from '../cartograph/bake-revetment-far.js'
import { FAR_FORMAT } from '../src/lib/revetmentFromSlab.js'
import { farSteps } from '../src/lib/farQuant.js'
import { MIN_ARMOUR_D50_M } from '../cartograph/shore-armour.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOME = join(ROOT, 'src/lib/revetmentDrape.js'), QHOME = join(ROOT, 'src/lib/farQuant.js')
const arg = (n, d) => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SLAB = arg('slab', join(ROOT, 'public/baked')), EVERY = +arg('every', '25'), DENSE = 1e6

// a copy of the module with one edit, its imports made absolute so it loads from the OS temp dir
const copyOf = (a, b, home = HOME) => { const src = readFileSync(home, 'utf8')
  if (!src.includes(a)) throw new Error(`⛔ mutant target gone from ${home.slice(ROOT.length + 1)}: ${JSON.stringify(a)}`)
  const out = join(mkdtempSync(join(tmpdir(), 'drape-')), home === HOME ? 'revetmentDrape.mjs' : 'farQuant.mjs')
  writeFileSync(out, src.replace(a, b).replace("from 'three'", `from '${import.meta.resolve('three')}'`)
    .replace("from './farQuant.js'", `from '${pathToFileURL(QHOME).href}'`)
    .replace("from './latticeNode.js'", `from '${pathToFileURL(join(ROOT, 'src/lib/latticeNode.js')).href}'`)
    .replace("from './lattice.js'", `from '${pathToFileURL(join(ROOT, 'src/lib/lattice.js')).href}'`)
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
  return { faces, parts, rawAt: (x, z) => parts(x, z).raw } }
/** The town's far table and bins as the player fetches them, or why not. */
const townBins = (t) => { const p = (f) => join(SLAB, t, f)
  if (!existsSync(p('revetment-far.json'))) return { why: 'no revetment-far.json' }
  const doc = JSON.parse(readFileSync(p('revetment-far.json'), 'utf8'))
  if (doc.version !== FAR_FORMAT) return { why: `revetment-far.json is format ${doc.version}, not ${FAR_FORMAT} ▶ re-run revetment-far for ${t}` }
  return { doc, bins: Object.fromEntries(['revetment-far.bin', 'revetment-far-unseen.bin'].map(n => [n, ab(readFileSync(p(n)))])) } }
/** The planted shore baked in memory by the bake's own functions (farChunksOf → farSteps → buildFaceChunks → pack). */
const plantedBins = (faces, parts) => {
  const built = faces.map(f => farChunksOf(f, parts)), step = farSteps(built.flatMap(b => b.fars.filter(Boolean)))
  const chunks = faces.flatMap((f, i) => buildFaceChunks({ ...f, toe: null }, parts, built[i], step)); for (const c of chunks) c.firstSeen = c.arrays ? 0 : null
  const { doc, bins } = pack(chunks, faces.map(f => ({ ...f, toe: null })), {}, step)
  return { doc, bins: Object.fromEntries(Object.entries(bins).map(([n, b]) => [n, ab(b)])) } }

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

/** 4 · after decode: the bins against the builds (bake-revetment-far.js#farChunksOf, the bake's own), the far against
 *  itself across chunks, and the near (module M) against the decoded far (module Q decodes). */
function judge4(M, Q, faces, parts, { doc, bins }, say, { sampleEvery = EVERY, label }) {
  const step = doc.quant?.step, rawAt = (x, z) => parts(x, z).raw
  const j = { chunks: 0, a: [], b: [], c: [], posErr: 0, slack: 0, nErr: 0, shared: 0, seams: 0, nearShared: 0, nearRes: 0 }
  if (!Array.isArray(step)) { say(false, `${label}: 4 · revetment-far.json has no quant.step — the bins cannot be decoded`); return j }
  const rowsOf = new Map(); for (const c of doc.chunks) rowsOf.set(`${c.face}#${c.k}`, c)
  const kf = (P, i) => `${P[i * 3]},${P[i * 3 + 1]},${P[i * 3 + 2]}`
  const ang = (a, i, b, k) => { const d = a[i] * b[k] + a[i + 1] * b[k + 1] + a[i + 2] * b[k + 2], l = Math.hypot(a[i], a[i + 1], a[i + 2]) * Math.hypot(b[k], b[k + 1], b[k + 2]); return Math.acos(Math.min(1, d / l)) * 180 / Math.PI }
  const round = (n, i) => { const o = new Float32Array(3); Q.octDecode(...Q.octEncode(n[i], n[i + 1], n[i + 2]), o, 0); return o }
  for (const f of faces) {
    const B = farChunksOf(f, parts)
    // the whole-face far build: what the chunks partition
    const whole = M.revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, globals: B.G1 })
    const W = whole?.stats?.tris ? M.drapeRelative(whole, rawAt) : null, wAt = new Map()
    if (W) for (let i = 0; i < W.rel.length / 3; i++) wAt.set(kf(W.rel, i), i)
    const dec = B.fars.map((F, k) => { if (!F) return null
      const c = rowsOf.get(`${f.key}#${k}`), where = `${label} ${f.key}#${k}`
      if (!c) { j.a.push(`${where}: built and not in the table`); return null }
      const bin = bins[c.bin]; if (!bin) { j.a.push(`${where}: its bin ${c.bin} is missing`); return null }
      const A = Q.decodeFarChunk(bin, c, step); j.chunks++
      let bad = null
      for (let i = 0; i < F.pos.length && !bad; i++) { const want = Math.fround(Q.snap(F.pos[i], step[i % 3])), e = Math.abs(A.pos[i] - F.pos[i])
        if (!Object.is(A.pos[i], want)) bad = `position ${Math.floor(i / 3)} decodes to ${A.pos[i]}, its build on the grid is ${want}`
        j.posErr = Math.max(j.posErr, e); j.slack = Math.max(j.slack, e - step[i % 3] / 2) }
      for (let i = 0; i < F.normal.length / 3 && !bad; i++) { const o = round(F.normal, i * 3)
        if (![0, 1, 2].every(c2 => Object.is(o[c2], A.normal[i * 3 + c2]))) bad = `normal ${i} is not its build's octahedral round trip`
        j.nErr = Math.max(j.nErr, ang(A.normal, i * 3, F.normal, i * 3)) }
      if (!bad && !(A.pin.length === F.pin.length && A.pin.every((x, i) => Object.is(x, F.pin[i])))) bad = 'its pins are not its build\'s'
      if (!bad && !(A.index.length === F.index.length && A.index.every((x, i) => x === F.index[i]))) bad = 'its index is not its build\'s'
      if (!bad && W) for (let i = 0; i < F.pos.length / 3 && !bad; i++) { const w = wAt.get(kf(F.pos, i))
        if (w == null) bad = `vertex ${i} is not a vertex of the whole-face far build`
        else if (![0, 1, 2].every(c2 => Object.is(W.normal[w * 3 + c2], F.normal[i * 3 + c2]))) bad = `vertex ${i}'s normal is not the whole-face build's` }
      if (bad) j.a.push(`${where}: ${bad}`)
      return { F, A, at: new Map(Array.from({ length: F.pos.length / 3 }, (_, i) => [kf(F.pos, i), i])) } })
    // b · far against far
    for (let k = 1; k < dec.length; k++) { const p = dec[k - 1], q = dec[k]; if (!p || !q) continue
      for (const [key, i] of q.at) { const h = p.at.get(key); if (h == null) continue
        j.shared++
        if (![0, 1, 2].every(c2 => Object.is(p.A.pos[h * 3 + c2], q.A.pos[i * 3 + c2]))) { j.b.push(`${label} ${f.key}: a vertex chunks ${k - 1} and ${k} share decodes apart`); break } } }
    // c · the near against the decoded far, at sampled boundaries
    if (B.G1.hMax < MIN_ARMOUR_D50_M) continue
    for (let k = 1; k < B.ranges.length; k += sampleEvery) {
      const p = dec[k - 1]; if (!p) continue
      const near = M.revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, globals: B.G3, stations: B.ranges[k].near, conform: B.G1 })
      const seam = near?.geometry?.userData.seams?.find(s => s.station === B.ranges[k].near[0]); if (!seam) continue
      const { rel, normal } = M.drapeRelative(near, rawAt, step), Fp = seam.far, where = `${label} ${f.key} boundary ${k}`
      const farIdx = (J) => p.at.get(`${Fp[J * 3]},${Math.fround(Fp[J * 3 + 1] - rawAt(Fp[J * 3], Fp[J * 3 + 2]))},${Fp[J * 3 + 2]}`)
      j.seams++
      for (let jj = 0; jj < seam.verts.length; jj++) { const v = seam.verts[jj]; if (v < 0) continue
        const J = Math.floor(jj / seam.r), w = (jj % seam.r) / seam.r, a = farIdx(J), b = w ? farIdx(J + 1) : a
        if (a == null || b == null) continue                     // a far vertex the far chunk does not draw
        if (!w) { j.nearShared++
          if (![0, 1, 2].every(c2 => Object.is(rel[v * 3 + c2], p.A.pos[a * 3 + c2]) && Object.is(normal[v * 3 + c2], p.A.normal[a * 3 + c2]))) { j.c.push(`${where}: near vertex ${jj} is not the decoded far vertex ${J}`); break }
          continue }
        for (let c2 = 0; c2 < 3; c2++) { const A0 = p.A.pos[a * 3 + c2], B0 = p.A.pos[b * 3 + c2]; j.nearRes = Math.max(j.nearRes, Math.abs(rel[v * 3 + c2] - (A0 + (B0 - A0) * w))) } }
    }
  }
  say(!j.a.length && j.chunks > 0, `${label}: 4a · ${j.chunks} far chunks decode to their builds on the grid (${step.map(x => (x * 1000).toFixed(3)).join(' × ')} mm), every vertex the whole-face build's · max position error ${(j.posErr * 1000).toFixed(3)} mm against the 1 mm lattice (${(j.slack * 1e6).toFixed(2)} µm past half a step: f32), normal ${j.nErr.toFixed(4)}°${j.a.length ? ` — ${j.a.length} failed, first ${j.a[0]}` : ''}`)
  say(!j.b.length && j.shared > 0, `${label}: 4b · ${j.shared} vertices two far chunks share decode to the same bits in both: the far's seam after decode is 0${j.b.length ? ` — ${j.b[0]}` : ''}`)
  say(!j.c.length && j.nearShared > 0 && j.posErr < 5e-4 && j.nErr < 0.01, `${label}: 4c · ${j.seams} near/far boundaries after decode: ${j.nearShared} shared vertices and normals the decoded far's to the bit, in-between residue ${j.nearRes.toExponential(2)} m${j.c.length ? ` — ${j.c[0]}` : ''}${j.posErr >= 5e-4 ? ' — a position error reaches half the 1 mm lattice' : ''}${j.nErr >= 0.01 ? ' — a normal error reaches 0.01°' : ''}`)
  return j
}

const M = await import(pathToFileURL(HOME).href)
const Q = await import(pathToFileURL(QHOME).href)
const bad = []
const say = (ok, what) => { console.log(`  ${ok ? '✅' : '⛔'} ${what}`); if (!ok) bad.push(what) }
console.log('── the drape meets itself on one line (revetmentDrape.js)')
const P = planted(), flatRaw = (x, z) => P[0].groundAt(x, z)
judge(M, P, flatRaw, say, { sampleEvery: 1, label: 'planted' })
// the planted ground in two parts (a raw and the drawn ground's own), so the band and the pins are not trivial
const plantedParts = (x, z) => ({ raw: 0.7 * P[0].groundAt(x, z), y: 0.3 * P[0].groundAt(x, z) })
const PB = plantedBins(P, plantedParts)
judge4(M, Q, P, plantedParts, PB, say, { sampleEvery: 1, label: 'planted' })
// the grid refuses past the kit's own rounding (NODE_BOUND), naming the chunk that sized it: a 100 km chunk planted beside a 25 m one
{ const c = (key, L) => ({ key, pos: new Float32Array([0, 0, 0, L, 1, L]), band: new Float32Array([0, 0, 0, L, 1, L]) })
  let why = ''; try { farSteps([c('short#0', 25), c('long#1', 1e5)]) } catch (e) { why = e.message }
  let fine = true; try { farSteps([c('short#0', 25)]) } catch { fine = false }
  say(why.includes('long#1') && why.includes('NODE_BOUND') && fine, `planted: 4 · the grid refuses a 100 km chunk by name (${why ? 'refused' : 'NOT refused'}) and sizes a 25 m one (${fine ? 'sized' : 'refused'})`) }
if (!towns.length) say(false, `no coastal town's slab under ${SLAB} (revetment.json + ground + terrain): only the planted shore was checked`)
for (const t of towns) { const { faces, parts, rawAt } = townFaces(t); judge(M, faces, rawAt, say, { label: t })
  const tb = townBins(t); if (tb.why) say(false, `${t}: 4 · ${tb.why}`); else judge4(M, Q, faces, parts, tb, say, { label: t }) }

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
  // after decode: each must turn judge 4 RED
  const MUT4 = [
    ['the decode skipped (the u16 drawn as metres)', 'P[i] = (origin[i % 3] + q[i]) * step[i % 3]', 'P[i] = q[i]', QHOME],
    ['the near meeting the far before quantization', 'p: p.map((x, a) => Math.fround(snap(x, step[a])))', 'p', HOME],
  ]
  let alive = 0
  for (const [name, a, b, home] of MUT4) {
    const mod = await copyOf(a, b, home), red = []
    try { judge4(home === HOME ? mod : M, home === QHOME ? mod : Q, P, plantedParts, PB, (ok) => { if (!ok) red.push(ok) }, { sampleEvery: 1, label: 'mutant' })
      console.log(`  mutant: ${name} → judge 4 ${red.length ? 'RED ✓' : 'GREEN ✗'}`); if (!red.length) alive++ }
    catch (e) { console.log(`  mutant: ${name} → threw (${e.message.split('\n')[0].slice(0, 120)}) — RED ✓`) }
  }
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
