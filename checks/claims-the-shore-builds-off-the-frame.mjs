#!/usr/bin/env node
/**
 * claims-the-shore-builds-off-the-frame.mjs — THE SHORE'S STONE IS BUILT OFF THE FRAME, AND IT IS THE SAME STONE.
 *
 * ⛔ Found 2026-10-14 (Meridian's flight probe; Tern's measure; Boz's go). On Provincetown the flight from the movie into
 *    the plan had a 3,150 ms frame (phone) — ~3 s of `revetmentDrape` inside SlabRevetment's NEAR `useFrame`, which draped
 *    every 12 m chunk within reach in one frame (one reselect: up to 49 chunks, a chunk p90 250 ms in node). The
 *    exaggeration was not the trigger: it reaches the stone only through the shader's lift. SlabRevetment's own header
 *    had named it ("chunk generation is on the critical path … Prefetch … is still unbuilt").
 * ⭐ THE RULE, in three parts:
 *  1. PARITY — the worker's build (`revetmentBuild.js`: `loadRevetmentInit` reading the slab's own files, as the worker
 *     fetches them, then `makeRevetmentBuilder`, every message through a structured clone, as postMessage does) is BYTE-EQUAL to the in-frame composition it replaced (transcribed below from 68f85d55's
 *     SlabRevetment.jsx: the faces memo, the near loop, `groundRelative`), on the drawn ground (b0e65999), on Provincetown
 *     and Huron: every attribute array, the index, the bounds, and every stone.
 *     MUTATION: the worker given NO drawn ground (the field instead) must part from the reference — the parity can see
 *     which ground the stone stands on. And handed ANOTHER town's ground bin, the worker's load must REFUSE.
 *  2. NO HOLE — at every set of near chunks drawn, every chunk of a face is drawn by EXACTLY ONE layer (`farIndex`).
 *     MUTATION: the old rule (the far face hidden whole whenever any near chunk of it is drawn) must be caught.
 *  3. NO LONG FRAME (`--base=<Ward url>`): Meridian's probe (scratch/browse-hang/flight.mjs), Provincetown, phone and
 *     desktop: no long frame in the flight (`report.longFrames` empty, the probe's own threshold) and no program linked
 *     during it (`report.programs.new` empty). The probe writes into this run's own temp dir (`--out`), never Meridian's. RED at 926ac3a4 (3,150 ms · the stones' program linked mid-flight).
 *     Without `--base` this half is NOT RUN and the check says so and fails, unless `--node-only` is passed.
 *
 *   node checks/claims-the-shore-builds-off-the-frame.mjs [--node-only] [--base=http://localhost:5180] [--chunks=24]
 * Read-only. Exit 1 on a failure, 2 if a mutation is not caught.
 */
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { ROOT } from './_scenes.mjs'
import { makeRevetmentBuilder, loadRevetmentInit, farIndex } from '../src/lib/revetmentBuild.js'
import { makeDrawnGround, isDrawnGroundGroup, partsOrField } from '../src/lib/drawnGround.js'
import { makeElevationSampler, terrainIdentity } from '../src/lib/terrainCommon.js'
import { revetmentDrape, drapeGlobals } from '../src/lib/revetmentDrape.js'
import { shoreContext, chunkStones, CHUNK_M } from '../src/lib/shoreChunks.js'
import { revetmentFaces, toeFor } from '../src/lib/revetmentFromSlab.js'
import { MIN_ARMOUR_D50_M } from '../cartograph/shore-armour.mjs'
import { boulderPalette } from '../src/lib/boulderGeometry.js'

const arg = (n) => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const NODE_ONLY = process.argv.includes('--node-only'), BASE = arg('base'), N = +(arg('chunks') || 24)
const TOWNS = ['provincetown', 'huron']
const fails = [], mutants = []

// ── the slab, as the browser reads it ───────────────────────────────────────────────────────────────────────────────────
function slab(town) {
  const d = join(ROOT, 'public', 'baked', town), need = ['revetment.json', 'ground.json', 'ground.bin', 'terrain.json', 'terrain.bin']
  const missing = need.filter(f => !existsSync(join(d, f)))
  if (missing.length) throw new Error(`${town}: the slab at ${d} lacks ${missing.join(', ')}`)
  const ab = (f) => { const b = readFileSync(join(d, f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
  const meta = JSON.parse(readFileSync(join(d, 'terrain.json'), 'utf8'))
  return { doc: JSON.parse(readFileSync(join(d, 'revetment.json'), 'utf8')), manifest: JSON.parse(readFileSync(join(d, 'ground.json'), 'utf8')), bin: ab('ground.bin'),
    terrain: { width: meta.width, height: meta.height, bounds: meta.bounds, data: new Float32Array(ab('terrain.bin')) }, floorM: meta.bed?.visibleToM ?? 0 }
}

// ── THE REFERENCE: the in-frame composition, transcribed from 68f85d55:src/components/SlabRevetment.jsx ───────────────
function reference(S, paletteSize) {
  const rawAt = makeElevationSampler(S.terrain, 1).getElevationRaw
  const drawn = makeDrawnGround(S.manifest, S.bin, { groups: isDrawnGroundGroup, rawAt })          // BakedGround's
  const drawnGroundParts = (x, z) => partsOrField(drawn, rawAt, x, z)                             // utils/elevation's
  const drawnAt1 = (x, z) => { const g = drawnGroundParts(x, z); return g.raw + g.y }
  function groundRelative(built) {
    const g = built?.geometry
    if (!g) return built
    g.computeBoundingSphere(); g.computeBoundingBox()
    const p = g.attributes.position, raw = new Float32Array(p.count)
    for (let i = 0; i < p.count; i++) { raw[i] = drawnGroundParts(p.getX(i), p.getZ(i)).raw; p.setY(i, p.getY(i) - raw[i]) }
    g.setAttribute('aRaw', { array: raw, itemSize: 1, normalized: false })
    return built
  }
  const faces = revetmentFaces(S.doc).filter(f => f.anyArmour).map(f => {
    const waterY = f.levelM ?? 0
    const toeFloor = Math.max(S.floorM, f.lowM != null ? waterY - f.lowM + MIN_ARMOUR_D50_M : 0)
    const toeAt = toeFor(f, drawnAt1, toeFloor, waterY)
    f = { ...f, toeAt, berm: f.toeBerm, groundAt: drawnAt1, waterY }
    const G = drapeGlobals({ poly: f.poly, crestAt: f.crestAt, toeAt, berm: f.berm, octaves: 3 })
    const per = Math.max(4, Math.round(CHUNK_M / G.step))
    const ranges = []
    for (let i = 0; i < G.nAlong - 1; i += per) ranges.push([i, Math.min(G.nAlong - 1, i + per)])
    const ctx = shoreContext({ poly: f.poly, crestAt: f.crestAt, taperAt: f.taperAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, oversample: 10, paletteSize, seed: S.doc.seed })
    return { ...f, G, ranges, ctx }
  })
  const near = (fi, k) => { const f = faces[fi]; return groundRelative(revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, octaves: 3, globals: f.G, stations: f.ranges[k] })) }
  const stones = (fi, ci) => chunkStones(faces[fi].ctx, ci, 2).map(st => { const g = drawnGroundParts(st.p[0], st.p[2]); return { ...st, p: [st.p[0], st.p[1] - g.raw - g.y, st.p[2]], ground: g.raw, groundY: g.y } })
  return { faces, near, stones }
}

const bytesEq = (a, b) => a && b && a.constructor === b.constructor && a.length === b.length && Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength))
function sameChunk(ref, plain) {
  const g = ref?.geometry
  if (!g || !plain) return `${!g ? 'the reference' : 'the worker'} built nothing`
  for (const [n, a] of Object.entries(g.attributes)) if (!bytesEq(a.array, plain.attributes[n]?.array)) return `attribute ${n} differs`
  if (Object.keys(plain.attributes).length !== Object.keys(g.attributes).length) return 'the attribute sets differ'
  if (!bytesEq(g.index?.array, plain.index)) return 'the index differs'
  const b = g.boundingBox, s = g.boundingSphere
  if ([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].some((v, i) => v !== plain.box[i])) return 'the bounding box differs'
  if ([s.center.x, s.center.y, s.center.z, s.radius].some((v, i) => v !== plain.sphere[i])) return 'the bounding sphere differs'
  return null
}

// ── 1. PARITY, and its mutation ─────────────────────────────────────────────────────────────────────────────────────────
for (const town of TOWNS) {
  const S = slab(town), paletteSize = boulderPalette({ seed: S.doc.seed }).length
  const R = reference(S, paletteSize)
  // the component's half of the protocol: URLs, and what the bytes must turn out to be (from the drawn ground it holds)
  const source = makeDrawnGround(S.manifest, S.bin, { groups: isDrawnGroundGroup, rawAt: makeElevationSampler(S.terrain, 1).getElevationRaw }).source
  const dir = join(ROOT, 'public', 'baked', town), fileFetch = async (u) => { const p = u.startsWith('/') ? u : join(dir, u); const b = readFileSync(p)
    return { ok: true, status: 200, json: async () => JSON.parse(b.toString('utf8')), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } }
  const load = (ground) => structuredClone({ type: 'load', gen: 1, urls: { revetment: 'revetment.json', terrainBin: 'terrain.bin' },
    terrain: { width: S.terrain.width, height: S.terrain.height, bounds: S.terrain.bounds, identity: terrainIdentity(S.terrain) },
    ground, floorM: S.floorM, paletteSize })
  const drawnGround = { manifest: 'ground.json', bin: 'ground.bin', expect: { binBytes: source.bin.byteLength, groups: source.manifest.groups.map(g => g.id), cell: source.cell } }
  const W = makeRevetmentBuilder(), Wf = makeRevetmentBuilder()
  const meta = W(structuredClone(await loadRevetmentInit(load(drawnGround), fileFetch))).reply.faces
  Wf(structuredClone(await loadRevetmentInit(load(null), fileFetch)))
  // MUTATION: another town's ground bin under this town's name must be refused by the load
  const other = TOWNS.find(t => t !== town), refused = await loadRevetmentInit(load({ ...drawnGround, bin: join(ROOT, 'public', 'baked', other, 'ground.bin') }), fileFetch).then(() => null, e => e.message)
  console.log(`  ${refused ? '✅' : '⛔'} ${town}: MUTATION (${other}'s ground bin) ${refused ? 'refused by the load' : 'was LOADED'}`)
  if (!refused) mutants.push(`${town}: the worker's load stood the stone on another town's ground`)
  if (meta.length !== R.faces.length) { fails.push(`${town}: the worker built ${meta.length} face(s), the reference ${R.faces.length}`); continue }
  // N chunks spread over the whole shore, and the stone chunks beside them
  const all = meta.flatMap((f, fi) => f.at.map((_, k) => [fi, k])), pick = all.filter((_, i) => i % Math.max(1, Math.floor(all.length / N)) === 0)
  let ok = 0, parted = 0, stonesOk = 0
  for (const [fi, k] of pick) {
    const why = sameChunk(R.near(fi, k), W(structuredClone({ type: 'near', gen: 1, face: fi, k })).reply.plain)
    if (why) fails.push(`${town}: face ${fi} chunk ${k}: ${why}`); else ok++
    if (sameChunk(R.near(fi, k), Wf(structuredClone({ type: 'near', gen: 1, face: fi, k })).reply.plain)) parted++
    const ci = Math.min(meta[fi].stoneAt.length - 1, Math.floor(k * meta[fi].stoneAt.length / meta[fi].at.length))
    const ws = W(structuredClone({ type: 'stones', gen: 1, face: fi, ci })).reply.stones, rs = R.stones(fi, ci)
    if (JSON.stringify(ws) !== JSON.stringify(rs)) fails.push(`${town}: face ${fi} stone chunk ${ci}: the stones differ (${ws.length} vs ${rs.length})`); else stonesOk++
  }
  console.log(`  ${ok === pick.length && stonesOk === pick.length ? '✅' : '⛔'} ${town}: ${ok}/${pick.length} drape chunks and ${stonesOk}/${pick.length} stone chunks byte-equal to the in-frame build, through a structured clone`)
  console.log(`  ${parted ? '✅' : '⛔'} ${town}: MUTATION (the worker on the field, not the drawn ground) parts from the reference on ${parted}/${pick.length} chunk(s)`)
  if (!parted) mutants.push(`${town}: the parity cannot tell the drawn ground from the field`)
  // ── 2. NO HOLE, and its mutation ──
  let holes = 0, oldHoles = 0, faces = 0
  for (let fi = 0; fi < meta.length; fi++) {
    const far = W(structuredClone({ type: 'far', gen: 1, face: fi })).reply.plain
    if (!far) continue
    faces++
    const n = far.spans.length, sets = [new Set(), new Set(Array.from({ length: n }, (_, k) => k)), new Set(Array.from({ length: n }, (_, k) => k).filter(k => k % 3 === 1)), new Set([Math.floor(n / 2)])]
    for (const set of sets) {
      // which chunks the far index draws, read back off its triangles: each chunk's vertices are its own in the merged
      // geometry (offset per chunk), so a chunk is drawn exactly when its first triangle is in the index
      const idx = farIndex(far, set), tris = new Set(), drawnFar = new Set()
      for (let i = 0; i < idx.length; i += 3) tris.add(`${idx[i]},${idx[i + 1]},${idx[i + 2]}`)
      far.spans.forEach(([start, count], k) => { if (count && tris.has(`${far.index[start]},${far.index[start + 1]},${far.index[start + 2]}`)) drawnFar.add(k) })
      for (let k = 0; k < n; k++) { if (!far.spans[k][1]) continue; if (set.has(k) === drawnFar.has(k)) holes++ }
      const oldFarShown = set.size === 0                                            // the old rule: the whole face, or nothing
      for (let k = 0; k < n; k++) { if (!far.spans[k][1]) continue; if (!set.has(k) && !oldFarShown) oldHoles++ }
    }
  }
  console.log(`  ${holes ? '⛔' : '✅'} ${town}: over ${faces} far face(s) and four near sets each, ${holes} chunk(s) drawn by neither layer or by both`)
  console.log(`  ${oldHoles ? '✅' : '⛔'} ${town}: MUTATION (the old face-level rule) leaves ${oldHoles} chunk(s) drawn by neither`)
  if (holes) fails.push(`${town}: ${holes} chunk(s) drawn by neither layer or by both`)
  if (!oldHoles) mutants.push(`${town}: the coverage test cannot see the old rule's hole`)
}

// ── 3. NO LONG FRAME (the browser) ──────────────────────────────────────────────────────────────────────────────────────
if (BASE) {
  for (const device of ['phone', 'desktop']) {
    const runs = mkdtempSync(join(tmpdir(), 'shore-off-frame-'))
    const r = spawnSync(process.execPath, [join(ROOT, 'scratch/browse-hang/flight.mjs'), `--base=${BASE}`, '--town=provincetown', `--device=${device}`, `--out=${runs}`], { encoding: 'utf8', timeout: 300000 })
    const out = join(runs, `provincetown-${device}.json`)
    if (r.status !== 0 || !existsSync(out)) { fails.push(`flight (${device}): the probe failed — ${(r.stderr || r.stdout || '').slice(-300)}`); continue }
    const rep = JSON.parse(readFileSync(out, 'utf8')).report
    const long = rep.longFrames || [], linked = rep.programs?.new || []
    console.log(`  ${long.length ? '⛔' : '✅'} provincetown ${device}: ${long.length} long frame(s) in the flight${long.length ? ` (worst ${rep.worst} ms)` : ''}`)
    console.log(`  ${linked.length ? '⛔' : '✅'} provincetown ${device}: ${linked.length} program(s) linked during the flight${linked.length ? `: ${linked.map(s => s.split(',').at(-1)).join(' · ')}` : ''}`)
    if (long.length) fails.push(`provincetown ${device}: ${long.length} long frame(s), worst ${rep.worst} ms`)
    if (linked.length) fails.push(`provincetown ${device}: ${linked.length} program(s) linked in the flight`)
    rmSync(runs, { recursive: true, force: true })
  }
} else if (!NODE_ONLY) fails.push('the browser half was NOT RUN (pass --base=<the Ward serving this kit>, or --node-only to run the node half alone)')
else console.log('  ⚠️ the browser half was NOT RUN (--node-only): no claim is made about frames')

if (mutants.length) { console.error(`⛔ A MUTATION WAS NOT CAUGHT:\n   ${mutants.join('\n   ')}`); process.exit(2) }
console.log(fails.length ? `⛔ ${fails.length} failure(s):\n   ${fails.slice(0, 20).join('\n   ')}` : '✅ the shore is built off the frame, and it is the same stone')
process.exit(fails.length ? 1 : 0)
