/**
 * bake-revetment-far.js — THE FAR SHORE, BAKED: the revetment's far layer and its overhead band, chunked and classed by
 * what the movie sees. (BRIEF-the-far-shore-is-not-built-at-load; Jacob's rulings 2026-10-29.)
 *
 * ⭐ WHY A MESH HERE, WHEN bake-revetment.js SHIPS AN INSTRUCTION. That decision stands and is about the NEAR layer: the
 * drape at octaves 3 over a whole shore is 76.5 MB on provincetown and 401 MB on huron (▶ scratch/far-shore/oct3-weight.mjs),
 * camera-dependent and mostly never seen. The FAR layer is the whole armoured shore at octaves 1 and does not depend on
 * the camera at all, yet the player built it in a frame loop at load: one 3.2 s task on provincetown's cold load (Ward's
 * profile). Its baked weight is ~1.2 MB gzip there and ~3.7 MB on huron (accepted, Jacob 2026-10-29).
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
 *   Per chunk, in its bin at its offset, 4-byte aligned, each array a view the player mounts as it stands: far position
 *   f32×3·v · far normal f32×3·v · pin f32×4·v (aDrawnRaw: has 1, raw, 0, 0, as groundRelative wrote it) · band position
 *   f32×3·v · band normal f32×3·v (up) · index u32·n (one index for both: the band is the far chunk's triangles, flat).
 * A town with no revetment.json has no shore: nothing is written and any earlier output is removed.
 * ▶ node bake-revetment-far.js --look=<id> --scene=<id> [--dry-run]
 */
import { readFileSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { writeIfChanged } from './io.js'
import { assertBakeTarget } from './bake-target.js'
import { requireExplicitMap } from './scene.js'
import { makeDrawnGround } from '../src/lib/drawnGround.js'
import { makeElevationSampler, sceneExagOf } from '../src/lib/terrainCommon.js'
import { revetmentFaces, toeStations, toeFromBaked, chunkBox } from '../src/lib/revetmentFromSlab.js'
import { drapeLattices, revetmentDrape, drapeRaws, FAR_OCTAVES, NEAR_OCTAVES } from '../src/lib/revetmentDrape.js'
import { CHUNK_M, drapeChunks } from '../src/lib/shoreChunks.js'
import { MIN_ARMOUR_D50_M, d50For } from './shore-armour.mjs'
import { isWaterGroupId } from '../src/components/waterMaterial.js'
import { heroPoses, heroHalfAngles, poseBasis, projectSphere, insideFrustum, HERO_POSES, HERO_SEEN_GUARD } from '../src/preview/heroFrustum.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export const FAR_FORMAT = 1
/** The arrays of a chunk, in their order in its bin (the player reads them by `offsets[name]`). */
export const FAR_ARRAYS = ['pos', 'normal', 'pin', 'band', 'bandNormal', 'index']

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

/** Every near chunk of one face: its INFO (bounds, stone size, what each layer keeps there) and, where the far layer keeps
 *  anything, its far mesh and band. ⭐ The info is the near layer's index, written for EVERY near chunk (Zob, 2026-10-29):
 *  an octave-1 chunk can keep nothing where octave 3 keeps stone, so the far table cannot stand in for it.
 *  ⭐ BOUNDS FROM WHAT IS BUILT: both layers' own vertices, each split as the player lifts it (y − raw, and raw), so a box
 *  at any exaggeration is one function of these numbers (src/lib/revetmentFromSlab.js#chunkBox). */
export function buildFaceChunks(f, parts, onChunk = null, done = 0) {
  const { G1, G3, ranges } = chunkRanges(f)
  const rawAt = (x, z) => parts(x, z).raw
  const out = []
  for (const r of ranges) {
    onChunk?.(done + out.length + 1)
    const B = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, rel0: Infinity, rel1: -Infinity, raw0: Infinity, raw1: -Infinity }
    const take = (P, rawOf) => { for (let i = 0; i < P.length / 3; i++) { const x = P[i * 3], z = P[i * 3 + 2], raw = rawOf(i, x, z), rel = P[i * 3 + 1] - raw
      if (x < B.x0) B.x0 = x; if (x > B.x1) B.x1 = x; if (z < B.z0) B.z0 = z; if (z > B.z1) B.z1 = z
      if (rel < B.rel0) B.rel0 = rel; if (rel > B.rel1) B.rel1 = rel; if (raw < B.raw0) B.raw0 = raw; if (raw > B.raw1) B.raw1 = raw } }
    // the near layer, as the player builds it there (octaves 3, meeting the far on far rows): its bounds and its triangle count
    const near = revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, globals: G3, stations: r.near, conform: G1 })
    const nearTris = near?.stats?.tris || 0
    if (nearTris) { const raw = drapeRaws(near, rawAt); take(near.geometry.attributes.position.array, (i) => raw[i]) }
    let far = null
    const d = revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, globals: G1, stations: r.far })
    if (d?.stats?.tris) {
      const g = d.geometry, P = g.attributes.position.array, v = P.length / 3, raw = drapeRaws(d, rawAt)
      const pos = new Float32Array(P), pin = new Float32Array(v * 4), band = new Float32Array(v * 3), up = new Float32Array(v * 3)
      for (let i = 0; i < v; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]
        pin[i * 4] = 1; pin[i * 4 + 1] = raw[i]; pos[i * 3 + 1] = y - raw[i]
        band[i * 3] = x; band[i * 3 + 1] = parts(x, z).y; band[i * 3 + 2] = z; up[i * 3 + 1] = 1
      }
      take(P, (i) => pin[i * 4 + 1])
      far = { tris: d.stats.tris, arrays: { pos, normal: new Float32Array(g.attributes.normal.array), pin, band, bandNormal: up, index: new Uint32Array(g.index.array) } }
    }
    // ⭐ the stone a chunk carries is sized by its TALLEST station (shore-armour.mjs#d50For), never its middle: a chunk bare at
    // the middle and armoured at an end would otherwise read small and want a closer camera (Zob, 2026-10-29)
    let hMax = 0
    for (let i = r.near[0]; i <= r.near[1]; i++) hMax = Math.max(hMax, f.crestAt(i / (G3.nAlong - 1)))
    out.push({ face: f.key, k: r.k, near: r.near, far: r.far, d50: d50For(hMax), nearTris, farTris: far?.tris || 0,
      box: (nearTris || far) ? [B.x0, B.z0, B.x1, B.z1, B.rel0, B.rel1, B.raw0, B.raw1] : null, arrays: far?.arrays || null })
  }
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
export function pack(chunks, faces, meta) {
  const meshes = chunks.filter(c => c.arrays)
  const seen = meshes.filter(c => c.firstSeen != null).sort((a, b) => a.firstSeen - b.firstSeen || (a.face < b.face ? -1 : a.face > b.face ? 1 : a.k - b.k))
  const unseen = meshes.filter(c => c.firstSeen == null).sort((a, b) => (a.face < b.face ? -1 : a.face > b.face ? 1 : a.k - b.k))
  const bins = {}, table = []
  for (const [name, list] of [['revetment-far.bin', seen], ['revetment-far-unseen.bin', unseen]]) {
    const parts = []; let off = 0
    for (const c of list) {
      const A = c.arrays, at = {}
      for (const key of FAR_ARRAYS) { at[key] = off; parts.push(Buffer.from(A[key].buffer, A[key].byteOffset, A[key].byteLength)); off += A[key].byteLength }
      table.push({ face: c.face, k: c.k, firstSeen: c.firstSeen, tris: c.farTris, bin: name, vertexCount: A.pin.length / 4, indexCount: A.index.length, offsets: at })
    }
    bins[name] = Buffer.concat(parts, off)
  }
  const doc = { version: FAR_FORMAT, ...meta, farOctaves: FAR_OCTAVES, nearOctaves: NEAR_OCTAVES, chunkM: CHUNK_M,
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
  const total = faces.reduce((s, f) => s + chunkRanges(f).ranges.length, 0)
  const chunks = []
  for (const f of faces) chunks.push(...buildFaceChunks(f, parts, (n) => { if (n % 100 === 0 || n === total) console.log(`[progress] near and far chunks ${n}/${total}`) }, chunks.length))
  const sceneJson = JSON.parse(readFileSync(need[4], 'utf8'))
  classByMovie(chunks, sceneJson, Math.max(1, sceneExagOf(sceneJson)))
  // ⭐ scene.json as the Bake step declares it (pourSteps.mjs#sceneForReaders): without the bakedAt stamp written after this
  // step, so the record names the file that is served
  const unstamped = { ...sceneJson }; delete unstamped.bakedAt
  const meta = { look, from: { ...Object.fromEntries(['revetment.json', 'ground.bin', 'terrain.bin'].map(f => [f, sha(join(dir, f))])),
    'scene.json': createHash('sha256').update(JSON.stringify(unstamped)).digest('hex').slice(0, 16) } }
  const { doc, bins } = pack(chunks, faces, meta)
  const ms = performance.now() - t0
  const seen = doc.chunks.filter(c => c.firstSeen != null), tris = (l) => l.reduce((s, c) => s + c.tris, 0)
  const nearOnly = doc.info.filter(c => c.nearTris && !c.farTris)
  console.log(`  near index: ${doc.info.length} chunks · ${nearOnly.length} keep stone near and NOTHING far (${nearOnly.reduce((s, c) => s + c.nearTris, 0).toLocaleString()} near tris) · ${doc.info.filter(c => !c.box).length} keep nothing at either`)
  console.log(`[bake-revetment-far] ${look}: ${faces.length} armoured faces → ${doc.chunks.length} chunks, ${tris(doc.chunks).toLocaleString()} tris in ${ms.toFixed(0)} ms`)
  console.log(`  movie: ${seen.length} chunks seen (${tris(seen).toLocaleString()} tris, first at ${seen[0]?.firstSeen ?? '—'}), ${doc.chunks.length - seen.length} never (${tris(doc.chunks.filter(c => c.firstSeen == null)).toLocaleString()} tris)`)
  for (const [name, b] of Object.entries(bins)) console.log(`  ${name}: ${(b.length / 1e6).toFixed(2)} MB`)
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
