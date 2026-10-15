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
 *  3. NO LONG FRAME (`--base=<a Ward dev server on this kit>`), by this check's own probe (checks/lib/shoreFlightProbe.mjs —
 *     Meridian's flight.mjs plumbing, checked in), on Provincetown and Huron, phone and desktop, on each town's OWN HERO PATH
 *     (Jacob, 2026-10-15): the span where the path comes within the near lane's reach of the shore, found above from the slab,
 *     never a hand-picked camera. Two legs (Boz, 2026-10-15), each against the page's own frame at rest:
 *     · 'movie' — back into the movie with its clock set just before the span, and through it;
 *     · 'plan'  — back into the movie before the span's nearest pose, and at it the tap into the plan (the flight in which
 *       Provincetown's phone had its 3,150 ms frame at 926ac3a4).
 *     The clock is placed by a PROBE-ONLY hook on MovieCamera's random start (the Ward exposes no start-phase input; the probe's
 *     header says why) — a hook the product never runs.
 *     In each: no long frame (longer than two frames at rest — the Ward's Society check's rule) and no program linked.
 *     Over the run: NO SECOND DOWNLOAD — every slab file the worker requests that the page also requested comes from the HTTP
 *     cache or a 304, never a body over the wire; the renderer's peak resident memory and the far layer's arrival, REPORTED.
 *     NO VERDICT (a failure to check, never a pass): a page that rests at over two of its display's frames, a leg whose camera
 *     never came within reach of the shore (measured from the camera itself), or one that built no near stone.
 *     ⛔ Not yet seen RED in the browser (2026-10-15): the run against 926ac3a4's in-frame build is owed before this half is trusted.
 *     Without `--base` this half is NOT RUN and the check says so and fails, unless `--node-only` is passed.
 *
 *   node checks/claims-the-shore-builds-off-the-frame.mjs [--node-only | --browser-only] [--base=http://localhost:5180] [--chunks=24]
 * Read-only. Exit 1 on a failure, 2 if a mutation is not caught.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { shoreFlight, reachIndex } from './lib/shoreFlightProbe.mjs'
import { ROOT } from './_scenes.mjs'
import { makeRevetmentBuilder, loadRevetmentInit, farIndex, withinReach, NEAR_RADIUS_M } from '../src/lib/revetmentBuild.js'
import { heroKeyframeAnim, heroCycleSec, assertKeyframesAimed, assertHeroMotion } from '../src/preview/heroAnim.js'
import { makeDrawnGround, isDrawnGroundGroup, partsOrField } from '../src/lib/drawnGround.js'
import { makeElevationSampler, terrainIdentity } from '../src/lib/terrainCommon.js'
import { revetmentDrape, drapeGlobals } from '../src/lib/revetmentDrape.js'
import { shoreContext, chunkStones, CHUNK_M } from '../src/lib/shoreChunks.js'
import { revetmentFaces, toeFor } from '../src/lib/revetmentFromSlab.js'
import { MIN_ARMOUR_D50_M } from '../cartograph/shore-armour.mjs'
import { boulderPalette } from '../src/lib/boulderGeometry.js'

const arg = (n) => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const NODE_ONLY = process.argv.includes('--node-only'), BROWSER_ONLY = process.argv.includes('--browser-only'), BASE = arg('base'), N = +(arg('chunks') || 24)
const TOWNS = ['provincetown', 'huron']
// --town= / --device= narrow the BROWSER half to one run, so each can be launched under its own memory gate; the node half always runs both towns
const ONLY_TOWN = arg('town'), ONLY_DEVICE = arg('device')
if (ONLY_TOWN && !TOWNS.includes(ONLY_TOWN)) throw new Error(`--town=${ONLY_TOWN}: not one of ${TOWNS.join(', ')}`)
if (ONLY_DEVICE && !['phone', 'desktop'].includes(ONLY_DEVICE)) throw new Error(`--device=${ONLY_DEVICE}: not phone or desktop`)
const fails = [], mutants = [], shore = {}

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

// ── where the town's OWN camera path crosses its shore ────────────────────────────────────────────────────────────────────
// ⭐ Jacob's ruling (2026-10-15, via Boz): the verdict is the hero movie each town already has, never a hand-picked camera.
// The authored path (scene.json heroKeyframes + heroMotion) played on MovieCamera's clock, one cycle at STEP_S, and at each pose
// the near lane's own rule (`withinReach`): a SPAN is a run of clock seconds in which anything is within reach. Clock seconds
// are MovieCamera's (its `motion.speed || 1` times the wall clock), so the probe can set the clock on them.
const STEP_S = 0.25
function shoreSpans(town, faces, reachM = NEAR_RADIUS_M, reach = (x, z) => withinReach(faces, x, z).length > 0) {
  const scene = JSON.parse(readFileSync(join(ROOT, 'public', 'baked', town, 'scene.json'), 'utf8'))
  const K = assertKeyframesAimed(scene.heroKeyframes, town), M = assertHeroMotion(K, scene.heroMotion, town)
  if (K.length < 2) throw new Error(`${town}: the hero shot is static (${K.length} key) — there is no path to cross the shore`)
  const cycle = heroCycleSec(M), speed = M.speed || 1, near = reachIndex(faces.flatMap(f => [...f.at, ...f.stoneAt].map(p => [p.x, p.z])), reachM)
  const pos = { set(x, y, z) { this.x = x; this.z = z } }, spans = []
  let cur = null, disagree = 0
  for (let c = 0; c < cycle; c += STEP_S) {
    heroKeyframeAnim(c, K, M, pos, null)
    const d = near(pos.x, pos.z), inside = reach(pos.x, pos.z)
    if (inside !== Number.isFinite(d)) disagree++
    if (inside) { if (!cur) cur = { from: c, to: c, nearestM: d, at: c }; cur.to = c; if (d < cur.nearestM) { cur.nearestM = d; cur.at = c } }
    else if (cur) { spans.push(cur); cur = null }
  }
  if (cur) spans.push(cur)
  return { spans, cycle, speed, disagree }
}

// ── 1. PARITY, and its mutation ─────────────────────────────────────────────────────────────────────────────────────────
for (const town of TOWNS) {
  const S = slab(town), paletteSize = boulderPalette({ seed: S.doc.seed }).length
  const R = BROWSER_ONLY ? null : reference(S, paletteSize)
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
  if (BROWSER_ONLY) {   // the faces and the spans only: parity and coverage hold two towns' references at once, the memory a browser run needs
    const sp = shoreSpans(town, meta); shore[town] = { ...sp, stations: meta.flatMap(f => [...f.at, ...f.stoneAt].map(p => [p.x, p.z])) }
    console.log(`  ⓘ ${town}: the hero cycle (${sp.cycle} s on the clock) crosses the shore's reach (${NEAR_RADIUS_M} m) in ${sp.spans.length} span(s)`)
    if (!sp.spans.length) fails.push(`${town}: the hero path never comes within reach of the shore — there is nothing to measure the frames on (NOT a pass)`)
    continue
  }
  Wf(structuredClone(await loadRevetmentInit(load(null), fileFetch)))
  // MUTATION: another town's ground bin under this town's name must be refused by the load
  const other = TOWNS.find(t => t !== town), refused = await loadRevetmentInit(load({ ...drawnGround, bin: join(ROOT, 'public', 'baked', other, 'ground.bin') }), fileFetch).then(() => null, e => e.message)
  console.log(`  ${refused ? '✅' : '⛔'} ${town}: MUTATION (${other}'s ground bin) ${refused ? 'refused by the load' : 'was LOADED'}`)
  if (!refused) mutants.push(`${town}: the worker's load stood the stone on another town's ground`)
  if (meta.length !== R.faces.length) { fails.push(`${town}: the worker built ${meta.length} face(s), the reference ${R.faces.length}`); continue }
  // the camera path's spans across the shore, and the probe's reach index against the near lane's own rule at every pose
  { const sp = shoreSpans(town, meta), half = shoreSpans(town, meta, NEAR_RADIUS_M / 2)
    shore[town] = { ...sp, stations: meta.flatMap(f => [...f.at, ...f.stoneAt].map(p => [p.x, p.z])) }
    console.log(`  ${sp.disagree ? '⛔' : '✅'} ${town}: the probe's reach index agrees with the near lane's rule (withinReach) at every pose of the hero cycle (${Math.round(sp.cycle / STEP_S)} poses; ${sp.disagree} disagree)`)
    if (sp.disagree) fails.push(`${town}: the probe's reach index disagrees with withinReach at ${sp.disagree} pose(s)`)
    console.log(`  ${half.disagree ? '✅' : '⛔'} ${town}: MUTATION (the index at half the reach) disagrees at ${half.disagree} pose(s)`)
    if (!half.disagree) mutants.push(`${town}: the reach agreement cannot see a wrong radius`)
    console.log(`  ⓘ ${town}: the hero cycle (${sp.cycle} s on the clock) crosses the shore's reach (${NEAR_RADIUS_M} m) in ${sp.spans.length} span(s): ${sp.spans.map(x => `${x.from.toFixed(1)}–${x.to.toFixed(1)} s (nearest ${x.nearestM.toFixed(1)} m at ${x.at.toFixed(1)} s)`).join(' · ') || 'none'}`)
    if (!sp.spans.length) fails.push(`${town}: the hero path never comes within reach of the shore — there is nothing to measure the frames on (NOT a pass)`) }
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
// Each town's LONGEST span. 'movie' sets the clock MOVIE_LEAD_S before it and plays to its end; 'plan' sets the clock PLAN_LEAD_S
// before the span's nearest pose — time for the flight back into the movie to land and two seconds of rest — and taps into the
// plan at it.
const MOVIE_LEAD_S = 8, PLAN_LEAD_S = 10
if (BASE) {
  for (const town of TOWNS.filter(t => !ONLY_TOWN || t === ONLY_TOWN)) for (const device of ['phone', 'desktop'].filter(d => !ONLY_DEVICE || d === ONLY_DEVICE)) {
    const sh = shore[town]
    if (!sh?.spans.length) { fails.push(`${town} ${device}: no span of the hero path to fly — the browser half is NOT RUN for it`); continue }
    const span = sh.spans.reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a)), clock = { cycleSec: sh.cycle, speed: sh.speed }
    let rep
    try { rep = await shoreFlight({ base: BASE, town, device, stations: sh.stations, reachM: NEAR_RADIUS_M,
      movie: { ...clock, seedSec: span.from - MOVIE_LEAD_S, endSec: span.to + 1 }, plan: { ...clock, seedSec: span.at - PLAN_LEAD_S, tapSec: span.at } }) }
    catch (e) { fails.push(`${town} ${device}: the probe failed — ${e.message}`); continue }
    const at = `${town} ${device}`
    console.log(`  ⓘ ${at}: the span ${span.from.toFixed(1)}–${span.to.toFixed(1)} s on the clock, nearest ${span.nearestM.toFixed(1)} m at ${span.at.toFixed(1)} s`)
    for (const L of rep.legs) {
      if (L.error) { console.log(`  ⛔ ${at} leg '${L.name}': NOT MEASURED — ${L.error}`); fails.push(`${at} leg '${L.name}': not measured (${L.error})`); continue }
      const long = L.longFrames, linked = L.programs.new, worst = long.length ? Math.max(...long.map(f => f.ms)) : null
      const what = L.name === 'movie' ? `leg 'movie' (Esc back into the movie, then through the span; ${L.ms} ms, camera nearest the shore ${L.reach.nearestM == null ? '—' : Number.isFinite(L.reach.nearestM) ? L.reach.nearestM.toFixed(1) + ' m' : 'beyond reach'})`
        : `leg 'plan' (the tap into the plan at ${L.reach.atTapM == null ? '—' : Number.isFinite(L.reach.atTapM) ? L.reach.atTapM.toFixed(1) + ' m' : 'beyond reach'} from the shore)`
      if (!L.verdict) console.log(`  ⚠️ ${at} ${what}: NO VERDICT on frames — ${L.noVerdict}; ${long.length} frame(s) over ${L.budget} ms${worst ? `, worst ${worst} ms` : ''}, recorded only`)
      else console.log(`  ${long.length ? '⛔' : '✅'} ${at} ${what}: ${L.frames} frame(s), ${long.length} long (> ${L.budget} ms, two frames at ${L.interval} ms at rest; display ${L.display} ms)${worst ? ` — worst ${worst} ms` : ''}`)
      console.log(`  ${linked.length ? '⛔' : '✅'} ${at} leg '${L.name}': ${linked.length} program(s) linked during it`)
      for (const p of linked) console.log(`      ${p.name} #${p.id} [${p.custom}] — against the same name before the leg: ${p.vsBefore.join(' · ')}`)
      console.log(`  ⓘ ${at} leg '${L.name}': ${L.adopted.drapes} near drape(s) adopted, up to ${L.adopted.stonesMax} stone(s) mounted (${L.adopted.groups} shore group(s), one left the scene ${L.adopted.regrouped} time(s); at most ${L.adopted.castMax} shadow-casting and ${L.adopted.plainMax} other mesh(es) under them)${long.length ? ` · self time in the long frames: ${L.selfLong.slice(0, 8).join(' · ')}` : ''}`)
      if (!L.verdict) fails.push(`${at} leg '${L.name}': NO VERDICT on frames (${L.noVerdict})`)
      else if (long.length) fails.push(`${at} leg '${L.name}': ${long.length} long frame(s), worst ${worst} ms`)
      if (linked.length) fails.push(`${at} leg '${L.name}': ${linked.length} program(s) linked`)
    }
    // a worker request for a file the page also requested: from the cache, or a 304 — never a body over the wire
    const pageUrls = new Set(rep.net.filter(r => r.from === 'page').map(r => r.url))
    const reread = rep.net.filter(r => r.from === 'worker' && pageUrls.has(r.url))
    const downloaded = reread.filter(r => !(r.fromDiskCache || r.fromMemoryCache || r.wireStatus === 304 || r.status === 304))
    const own = rep.workers.filter(u => /revetment\.worker/.test(u)), slabFiles = rep.net.filter(r => r.from === 'worker' && /revetment\.worker/.test(r.worker || '') && /\.(json|bin)(\?|$)/.test(r.url)).map(r => r.url.split('/').pop().split('?')[0])
    console.log(`  ${!own.length || !reread.length ? '⛔' : downloaded.length ? '⛔' : '✅'} ${at}: ${rep.workers.length} worker(s), ${own.length} the revetment's; it read the slab files ${slabFiles.join(', ') || 'none'}; ${reread.length} request(s) for files the page had read, ${downloaded.length} downloaded again${downloaded.length ? `: ${downloaded.map(r => `${r.url.split('/').pop()} ${r.bytes} B (wire ${r.wireStatus})`).join(' · ')}` : ''}`)
    console.log(`  ⓘ ${at}: at the end the shore draws ${rep.revetment.far} far mesh(es), ${rep.revetment.near} near drape(s), ${rep.revetment.stones} stone(s); primer ${rep.revetment.primer ? 'mounted' : 'NOT mounted'} · the far layer (${rep.far?.faces ?? 0} face(s)) first drew at reveal ${rep.far?.first == null ? '—' : (rep.far.first >= 0 ? '+' : '') + rep.far.first} ms, complete at reveal ${rep.far?.complete == null ? '—' : (rep.far.complete >= 0 ? '+' : '') + rep.far.complete} ms · other workers: ${rep.workers.filter(u => !/revetment\.worker/.test(u)).map(u => u.split('/').pop().split('?')[0].slice(0, 40)).join(', ') || 'none'}`)
    console.log(`  ⓘ ${at}: the renderer's peak resident memory ${rep.rssPeakMB} MB${rep.errors.length ? ` · page errors: ${rep.errors.slice(0, 3).join(' · ')}` : ''}`)
    if (!own.length || !reread.length) fails.push(`${at}: no worker read the slab — the second-download question is NOT answered`)
    if (downloaded.length) fails.push(`${at}: the worker downloaded ${downloaded.length} file(s) the page already held`)
  }
} else if (!NODE_ONLY) fails.push('the browser half was NOT RUN (pass --base=<the Ward serving this kit>, or --node-only to run the node half alone)')
else console.log('  ⚠️ the browser half was NOT RUN (--node-only): no claim is made about frames')

if (BASE && (ONLY_TOWN || ONLY_DEVICE)) console.log(`  ⚠️ the browser half ran ${ONLY_TOWN || 'both towns'} on ${ONLY_DEVICE || 'both devices'} only`)
if (BROWSER_ONLY) console.log('  ⚠️ the node half was NOT RUN (--browser-only): no claim is made about parity or coverage')
if (mutants.length) { console.error(`⛔ A MUTATION WAS NOT CAUGHT:\n   ${mutants.join('\n   ')}`); process.exit(2) }
console.log(fails.length ? `⛔ ${fails.length} failure(s):\n   ${fails.slice(0, 20).join('\n   ')}` : BROWSER_ONLY ? '✅ the shore is built off the frame (the browser half; parity and coverage not run)' : '✅ the shore is built off the frame, and it is the same stone')
process.exit(fails.length ? 1 : 0)
