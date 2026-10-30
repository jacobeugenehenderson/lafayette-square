/**
 * bake-revetment-far.js — THE FAR SHORE, BAKED: the revetment's far layer and its overhead band, chunked and classed by
 * what the movie sees. (BRIEF-the-far-shore-is-not-built-at-load; Jacob's rulings 2026-10-29.)
 *
 * ⭐ WHY A MESH HERE, WHEN bake-revetment.js SHIPS AN INSTRUCTION. That decision stands and is about the NEAR layer: the
 * drape at octaves 3 over a whole shore is 76.5 MB on provincetown and 401 MB on huron (▶ scratch/far-shore/oct3-weight.mjs),
 * camera-dependent and mostly never seen. The FAR layer is the whole armoured shore at octaves 1 and does not depend on
 * the camera at all, yet the player built it in a frame loop at load: one 3.2 s task on provincetown's cold load (Ward's
 * profile). Its weight is quantized (format 3, src/lib/farQuant.js; Jacob 2026-10-29: "compress, fine normals"); the bake
 * prints each bin's MB, raw and as stored (brotli: scripts/slab-wire.mjs, what a visitor downloads).
 *
 * ⭐ THE SAME BYTES THE PLAYER BUILT. Every piece is the runtime's own function on the runtime's own inputs: the look's
 * slab (the ground, terrain and revetment.json the player fetches), `revetmentFaces` → `toeFor` → `drapeLattices` /
 * `revetmentDrape` at FAR_OCTAVES, groundAt = the DRAWN ground at exag 1 made as BakedGround makes it, then ground-relative
 * (position y − the drawn raw, the raw shipped as the vertex's pin), so the stone rides the live exaggeration exactly as
 * before. Off the drawn mesh the drawn ground is the field (elevation.js#drawnGroundParts, `offMesh`); so it is here.
 *
 * ⭐ ONE NESTED LATTICE, CHUNKED ON FAR STATIONS (BRIEF-the-drape-sizes-one-nested-lattice). One drapeLattices call per
 * face sizes the far and the near, nested (every far vertex is a near vertex), and shoreChunks.js#drapeChunks cuts both on
 * far stations, the player's own cut. So far chunks partition the face's quads, the player hides the ONE far chunk a near
 * chunk replaces (never the whole face: it once emptied a 33 km face past 90 m), and a near chunk meets its neighbours on
 * the far's own rows (revetmentDrape.js#farRow). A chunk with no triangles (all bare) is not written.
 *
 * ⭐ CLASSED BY THE MOVIE (Jacob: "the entire back of Provincetown is never seen"). Each chunk's bounding sphere is tested
 * against the movie's poses through src/preview/heroFrustum.js, the tree bake's own test (no occlusion, the guarded
 * frustum: it errs toward seen, the safe side for load order). `firstSeen` is the path parameter of the first pose that
 * sees it, or null. Seen chunks are written to revetment-far.bin in firstSeen order; never-seen ones to
 * revetment-far-unseen.bin, which the player fetches after the reveal. Neither is ever dropped.
 *
 * ⭐ THE BAND, the overhead tier (Jacob: it "could stand in for stones … when the map shifts down to seeing the full
 * shoreline at once"). Per chunk, the far chunk's own triangles laid flat on the drawn ground: x and z the far mesh's,
 * y the drawn ground's OWN part there (a raised kerb's), with the same raw pin, so it lies on the ground at every
 * exaggeration. ⛔ It is the overhead drawing, never a stand-in for a far chunk that failed: a failure fails this bake.
 *
 * The toe: `toeFor`'s walk (`toeStations`) reads the ground per station (493 ms at mount on provincetown); its result
 * ships per face in full doubles (it also feeds the near drape and the stones, so it is never rounded), and the player
 * reads it back through `toeFromBaked`, toeFor's own interpolation.
 *
 * Writes (public/baked/<look>/): revetment-far.json (the table), revetment-far.bin, revetment-far-unseen.bin.
 *   ⭐ FORMAT 3, QUANTIZED (Jacob, 2026-10-29: "compress, fine normals"; src/lib/farQuant.js): per chunk, at its offset, each
 *   array 4-byte aligned: pin f32×4·v (aDrawnRaw: has 1, raw, 0, 0, exact) · far position u16×3·v · far normal oct16×2·v ·
 *   band position u16×3·v · band normal oct16×2·v (up) · index u16 (u32 past 65,536 vertices; one index for both: the band
 *   is the far chunk's triangles, flat). Positions sit at the chunk's own integer origin on ONE grid for the town (the
 *   table's quant.step), so a vertex two chunks share decodes to the same float in both, and the near snaps its shared row
 *   to the same grid (revetmentDrape.js#drapeRelative). The grid is sized on every far chunk, so they are built first.
 * A town with no revetment.json has no shore: nothing is written and any earlier output is removed.
 * ▶ node bake-revetment-far.js --look=<id> --scene=<id> [--dry-run]
 */
import { readFileSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { encodeBytesSync } from '../scripts/slab-wire.mjs'
import { writeIfChanged } from './io.js'
import { assertBakeTarget } from './bake-target.js'
import { requireExplicitMap } from './scene.js'
import { makeDrawnGround } from '../src/lib/drawnGround.js'
import { makeElevationSampler, sceneExagOf } from '../src/lib/terrainCommon.js'
import { revetmentFaces, toeStations, toeFromBaked, chunkBox, FAR_FORMAT } from '../src/lib/revetmentFromSlab.js'
import { drapeLattices, revetmentDrape, drapeRelative, FAR_OCTAVES, NEAR_OCTAVES } from '../src/lib/revetmentDrape.js'
import { FAR_ARRAYS, farSteps, encodeFarChunk, decodePositions } from '../src/lib/farQuant.js'
import { CHUNK_M, drapeChunks } from '../src/lib/shoreChunks.js'
import { MIN_ARMOUR_D50_M, d50For } from './shore-armour.mjs'
import { isWaterGroupId } from '../src/components/waterMaterial.js'
import { heroPoses, heroHalfAngles, poseBasis, projectSphere, insideFrustum, HERO_POSES, HERO_SEEN_GUARD } from '../src/preview/heroFrustum.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const readAB = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16)

/** Every armoured face as the player prepares it (SlabRevetment.jsx `faces`), with the drawn ground as `parts`. */
export function prepareFaces({ revetment, terrainJson, terrainBin, groundJson, groundBin }) {
  const T = makeElevationSampler({ ...terrainJson, data: new Float32Array(terrainBin) }, 1)
  const D = makeDrawnGround(groundJson, groundBin, { groups: g => !isWaterGroupId(g.id) && g.partition !== false, rawAt: T.getElevationRaw })
  const parts = (x, z) => { const p = D.partsAt(x, z); return p ? { raw: p.raw, y: p.y } : { raw: T.getElevationRaw(x, z), y: 0, offMesh: true } }
  const drawnAt1 = (x, z) => { const g = parts(x, z); return g.raw + g.y }
  const floorM = terrainJson.bed?.visibleToM ?? 0
  const faces = revetmentFaces(revetment).filter(f => f.anyArmour).map(f => {
    const waterY = f.levelM ?? 0
    const toeFloor = Math.max(floorM, f.lowM != null ? waterY - f.lowM + MIN_ARMOUR_D50_M : 0)
    const toe = toeStations(f, drawnAt1, toeFloor, waterY)
    const toeAt = toe ? toeFromBaked(f, Array.from(toe)) : () => 1
    return { ...f, toe: toe ? Array.from(toe) : null, toeAt, berm: f.toeBerm, groundAt: drawnAt1, waterY }
  })
  return { faces, parts }
}

/** A face's two lattices (one drapeLattices call, so the far is sized with the toe and berm the near is) and its chunks,
 *  cut on far stations (shoreChunks.js#drapeChunks, the player's own cut). */
export function chunkRanges(f) {
  const [G1, G3] = drapeLattices({ poly: f.poly, crestAt: f.crestAt, crestBreaks: f.crestBreaks, toeAt: f.toeAt, berm: f.berm, octaves: [FAR_OCTAVES, NEAR_OCTAVES] })
  return { G1, G3, ranges: drapeChunks(G1, G3) }
}

/** A face's far chunks as built, before quantization: per range, the far mesh ground-relative (revetmentDrape.js#drapeRelative,
 *  the player's own step; the far meets nothing, so no grid yet) with its pins and its band, or null where the far keeps
 *  nothing. ⭐ Built first for every face: the town's grid (farQuant.js#farSteps) is sized on all of them. */
export function farChunksOf(f, parts) {
  const { G1, G3, ranges } = chunkRanges(f)
  const fars = ranges.map((r, k) => {
    const d = revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, globals: G1, stations: r.far })
    if (!d?.stats?.tris) return null
    const { rel, normal, raws } = drapeRelative(d, (x, z) => parts(x, z).raw), v = rel.length / 3
    const pin = new Float32Array(v * 4), band = new Float32Array(v * 3), up = new Float32Array(v * 3)
    for (let i = 0; i < v; i++) {
      const x = rel[i * 3], z = rel[i * 3 + 2]
      pin[i * 4] = 1; pin[i * 4 + 1] = raws[i]
      band[i * 3] = x; band[i * 3 + 1] = parts(x, z).y; band[i * 3 + 2] = z; up[i * 3 + 1] = 1
    }
    return { key: `${f.key}#${k}`, tris: d.stats.tris, pos: rel, normal, pin, band, bandNormal: up, index: new Uint32Array(d.geometry.index.array) }
  })
  return { G1, G3, ranges, fars }
}

/** Every near chunk of one face: its INFO (bounds, stone size, what each layer keeps there) and, where the far layer keeps
 *  anything, its far mesh and band, encoded on the town's grid. ⭐ The info is the near layer's index, written for EVERY near
 *  chunk (Zob, 2026-10-29): an octave-1 chunk can keep nothing where octave 3 keeps stone, so the far table cannot stand in for it.
 *  ⭐ BOUNDS FROM WHAT IS DRAWN: the near as the player seats it (on the far's decoded row) and the far as decoded, each
 *  split as the player lifts it (y − raw, and raw), so a box at any exaggeration is one function of these numbers
 *  (src/lib/revetmentFromSlab.js#chunkBox). */
export function buildFaceChunks(f, parts, built, step, onChunk = null, done = 0) {
  const { G1, G3, ranges, fars } = built
  const rawAt = (x, z) => parts(x, z).raw
  const out = []
  ranges.forEach((r, k) => {
    onChunk?.(done + out.length + 1)
    const B = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, rel0: Infinity, rel1: -Infinity, raw0: Infinity, raw1: -Infinity }
    const take = (rel, rawOf) => { for (let i = 0; i < rel.length / 3; i++) { const x = rel[i * 3], z = rel[i * 3 + 2], y = rel[i * 3 + 1], raw = rawOf(i)
      if (x < B.x0) B.x0 = x; if (x > B.x1) B.x1 = x; if (z < B.z0) B.z0 = z; if (z > B.z1) B.z1 = z
      if (y < B.rel0) B.rel0 = y; if (y > B.rel1) B.rel1 = y; if (raw < B.raw0) B.raw0 = raw; if (raw > B.raw1) B.raw1 = raw } }
    // the near layer, as the player builds it there (octaves 3, meeting the far on far rows): its bounds and its triangle count
    const near = revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, globals: G3, stations: r.near, conform: G1 })
    const nearTris = near?.stats?.tris || 0
    if (nearTris) { const { rel, raws } = drapeRelative(near, rawAt, step); take(rel, (i) => raws[i]) }
    let far = null
    if (fars[k]) {
      const e = encodeFarChunk(fars[k], step)
      take(decodePositions(e.arrays.pos, e.origin.pos, step), (i) => e.arrays.pin[i * 4 + 1])
      far = { tris: fars[k].tris, ...e }
    }
    // ⭐ the stone a chunk carries is sized by its TALLEST station (shore-armour.mjs#d50For), never its middle: a chunk bare at
    // the middle and armoured at an end would otherwise read small and want a closer camera (Zob, 2026-10-29)
    let hMax = 0
    for (let i = r.near[0]; i <= r.near[1]; i++) hMax = Math.max(hMax, f.crestAt(i / (G3.nAlong - 1)))
    out.push({ face: f.key, k: r.k, near: r.near, far: r.far, d50: d50For(hMax), nearTris, farTris: far?.tris || 0,
      box: (nearTris || far) ? [B.x0, B.z0, B.x1, B.z1, B.rel0, B.rel1, B.raw0, B.raw1] : null, arrays: far?.arrays || null, origin: far?.origin || null })
  })
  return out
}

/** firstSeen per chunk ∈ [0, 1] (the path parameter of the first pose whose guarded frustum holds its bounding sphere), or null. */
export function classByMovie(chunks, scene, maxExag) {
  if (!Array.isArray(scene?.heroKeyframes) || !scene.heroKeyframes.length) throw new Error('bake-revetment-far: scene.json has no heroKeyframes — the movie\'s order cannot be known. ▶ bake the scene')
  const poses = heroPoses(scene.heroKeyframes, scene.heroMotion, HERO_POSES, 'bake-revetment-far')
  const { vHalf, hHalf } = heroHalfAngles(scene.heroKeyframes)
  const bases = poses.map(({ p, q }) => poseBasis(p, q))
  for (const c of chunks) {
    if (!c.arrays) { c.firstSeen = null; continue }      // only far meshes are ordered; the info of every chunk ships in the table
    const [x0, y0, z0, x1, y1, z1] = chunkBox(c.box, 0, maxExag), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, R = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2
    const k = bases.findIndex(B => insideFrustum(projectSphere(B, cx, cy, cz, R), hHalf, vHalf, HERO_SEEN_GUARD))
    c.firstSeen = k < 0 ? null : (poses.length === 1 ? 0 : k / (poses.length - 1))
  }
}

/** The two bins and the table. Chunks are laid out seen-first by firstSeen (ties by face, then chunk), unseen after. */
export function pack(chunks, faces, meta, step) {
  const meshes = chunks.filter(c => c.arrays)
  const seen = meshes.filter(c => c.firstSeen != null).sort((a, b) => a.firstSeen - b.firstSeen || (a.face < b.face ? -1 : a.face > b.face ? 1 : a.k - b.k))
  const unseen = meshes.filter(c => c.firstSeen == null).sort((a, b) => (a.face < b.face ? -1 : a.face > b.face ? 1 : a.k - b.k))
  const bins = {}, table = []
  for (const [name, list] of [['revetment-far.bin', seen], ['revetment-far-unseen.bin', unseen]]) {
    const parts = []; let off = 0
    for (const c of list) {
      const A = c.arrays, at = {}
      for (const [key] of FAR_ARRAYS) {
        at[key] = off; parts.push(Buffer.from(A[key].buffer, A[key].byteOffset, A[key].byteLength)); off += A[key].byteLength
        const pad = (4 - (off % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad }   // every array 4-byte aligned
      }
      table.push({ face: c.face, k: c.k, firstSeen: c.firstSeen, tris: c.farTris, bin: name, vertexCount: A.pin.length / 4, indexCount: A.index.length, offsets: at, origin: c.origin })
    }
    bins[name] = Buffer.concat(parts, off)
  }
  const doc = { version: FAR_FORMAT, ...meta, farOctaves: FAR_OCTAVES, nearOctaves: NEAR_OCTAVES, chunkM: CHUNK_M,
    quant: { step, bits: 16, normals: 'oct16' },   // farQuant.js: the town's grid, per axis (m)
    movie: { poses: HERO_POSES, guard: HERO_SEEN_GUARD },
    faces: faces.map(f => ({ key: f.key, stations: f.stations.length, toe: f.toe })),
    // ⭐ EVERY near chunk (the near layer's index), meshes or not; box = [x0, z0, x1, z1, rel0, rel1, raw0, raw1] or null (nothing built)
    info: chunks.map(c => ({ face: c.face, k: c.k, near: c.near, far: c.far, d50: c.d50, nearTris: c.nearTris, farTris: c.farTris, box: c.box })),
    chunks: table }
  return { doc, bins }
}

export function bakeRevetmentFar({ look, scene, dryRun = false } = {}) {
  assertBakeTarget('bake-revetment-far', look, scene)
  const dir = join(ROOT, 'public', 'baked', look)
  const outs = ['revetment-far.json', 'revetment-far.bin', 'revetment-far-unseen.bin'].map(f => join(dir, f))
  const revPath = join(dir, 'revetment.json')
  if (!existsSync(revPath)) {
    console.log(`[bake-revetment-far] ${look}: no revetment.json — no shore, nothing to build`)
    if (!dryRun) for (const p of outs) if (existsSync(p)) { unlinkSync(p); console.log(`  removed stale ${p}`) }
    return null
  }
  const need = ['ground.json', 'ground.bin', 'terrain.json', 'terrain.bin', 'scene.json'].map(f => join(dir, f))
  const missing = need.filter(p => !existsSync(p))
  if (missing.length) throw new Error(`bake-revetment-far: ${look} has a revetment.json but not ${missing.map(p => p.slice(dir.length + 1)).join(', ')} — the far shore cannot be built against the ground the player draws`)
  const t0 = performance.now()
  const { faces, parts } = prepareFaces({ revetment: JSON.parse(readFileSync(revPath, 'utf8')), terrainJson: JSON.parse(readFileSync(need[2], 'utf8')),
    terrainBin: readAB(need[3]), groundJson: JSON.parse(readFileSync(need[0], 'utf8')), groundBin: readAB(need[1]) })
  // ⭐ [progress] <what> <i>/<n>: the Bake's modal shows a real fraction (serve.js#runStep). The near chunks are the cost.
  const built = faces.map(f => farChunksOf(f, parts))
  const step = farSteps(built.flatMap(b => b.fars.filter(Boolean)))
  const total = built.reduce((s, b) => s + b.ranges.length, 0)
  const chunks = []
  faces.forEach((f, i) => chunks.push(...buildFaceChunks(f, parts, built[i], step, (n) => { if (n % 100 === 0 || n === total) console.log(`[progress] near and far chunks ${n}/${total}`) }, chunks.length)))
  const sceneJson = JSON.parse(readFileSync(need[4], 'utf8'))
  classByMovie(chunks, sceneJson, Math.max(1, sceneExagOf(sceneJson)))
  // ⭐ scene.json as the Bake step declares it (pourSteps.mjs#sceneForReaders): without the bakedAt stamp written after this
  // step, so the record names the file that is served
  const unstamped = { ...sceneJson }; delete unstamped.bakedAt
  const meta = { look, from: { ...Object.fromEntries(['revetment.json', 'ground.bin', 'terrain.bin'].map(f => [f, sha(join(dir, f))])),
    'scene.json': createHash('sha256').update(JSON.stringify(unstamped)).digest('hex').slice(0, 16) } }
  const { doc, bins } = pack(chunks, faces, meta, step)
  const ms = performance.now() - t0
  const seen = doc.chunks.filter(c => c.firstSeen != null), tris = (l) => l.reduce((s, c) => s + c.tris, 0)
  const nearOnly = doc.info.filter(c => c.nearTris && !c.farTris)
  console.log(`  near index: ${doc.info.length} chunks · ${nearOnly.length} keep stone near and NOTHING far (${nearOnly.reduce((s, c) => s + c.nearTris, 0).toLocaleString()} near tris) · ${doc.info.filter(c => !c.box).length} keep nothing at either`)
  console.log(`[bake-revetment-far] ${look}: ${faces.length} armoured faces → ${doc.chunks.length} chunks, ${tris(doc.chunks).toLocaleString()} tris in ${ms.toFixed(0)} ms`)
  console.log(`  movie: ${seen.length} chunks seen (${tris(seen).toLocaleString()} tris, first at ${seen[0]?.firstSeen ?? '—'}), ${doc.chunks.length - seen.length} never (${tris(doc.chunks.filter(c => c.firstSeen == null)).toLocaleString()} tris)`)
  for (const [name, b] of Object.entries(bins)) console.log(`  ${name}: ${(b.length / 1e6).toFixed(2)} MB, ${(encodeBytesSync(b).length / 1e6).toFixed(2)} MB as stored (br)`)
  console.log(`  grid (format ${FAR_FORMAT}): ${step.map(s => (s * 1000).toFixed(3)).join(' × ')} mm a step, so a position is within half of it`)
  console.log(`  reads: ${Object.keys(meta.from).concat(['ground.json', 'terrain.json']).join(', ')} (public/baked/${look}/)`)
  if (dryRun) { console.log('  DRY RUN — nothing written'); return { doc, bins } }
  writeIfChanged(outs[0], JSON.stringify(doc))
  writeIfChanged(outs[1], bins['revetment-far.bin']); writeIfChanged(outs[2], bins['revetment-far-unseen.bin'])
  console.log(`  wrote ${outs.map(p => p.slice(ROOT.length + 1)).join(', ')}`)
  return { doc, bins }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const scene = requireExplicitMap('bake-revetment-far')   // one resolver: --scene= OR CARTOGRAPH_SCENE
  try { bakeRevetmentFar({ look: arg('look'), scene, dryRun: process.argv.includes('--dry-run') }) }
  catch (e) { console.error(`⛔ ${e.message}`); process.exit(1) }
}
