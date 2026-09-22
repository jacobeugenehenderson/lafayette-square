#!/usr/bin/env node
/**
 * bake-revetment.js — WHERE THE STONE GOES, and nothing more.
 *
 * ⭐⭐ THIS SHIPS AN INSTRUCTION, NOT A MESH. The revetment's geometry — the drape
 * and every boulder on it — is a deterministic function of the shoreline arc, the
 * crest above the water, and a seed. So the slab carries those and the player
 * builds what the camera can see. ⛔ Baking the mesh would put ~47 MB of drape and
 * ~33 MB of stone transforms into the slab for a town, to be downloaded in full and
 * mostly never looked at.
 *
 * ── WHY NOT A GROUND GROUP, since that was the first plan ────────────────────
 * ⛔ A ground group cannot carry this. Measured: every group in `ground.bin` is a
 * FLAT XZ polygon — `residential` is Y 0.0000 everywhere and `water:lake` is
 * 0.0680 everywhere — and all the relief comes from `patchTerrain` displacing it
 * in the shader from the terrain texture. There is no mechanism for baked 3-D
 * displacement, and a group that had it would be draped on top of terrain anyway.
 * The revetment is a gathered, craggy surface; that IS the feature. ⇒ It is not a
 * ground group, it is generated, and it uses the same chunked builder the stones
 * already use (`revetmentDrape.js`, proven identical to the eager build).
 *
 * ── WHAT DECIDES WHETHER A TOWN HAS ONE ─────────────────────────────────────
 * ⛔ Nothing here is a scene name or a list. A town gets a revetment when it has
 * a shoreline in its slab (`__water__` runs in `shape.json`) AND its terrain datum
 * is the water (`terrain.json#datum === 'water'`, which `bake-terrain` derives).
 * The second is not a formality: every crest in this file is read straight off the
 * heightfield, so it is only a height ABOVE THE WATER when the datum is the water.
 * On a town whose datum is the local minimum there is no coast, and this writes
 * nothing and says so.
 *
 * ── WHAT IS DECIDED HERE vs WHAT IS DECIDED IN THE PLAYER ───────────────────
 * HERE: which arcs exist, which face(s) of each carry stone, the crest at every
 * station, and whether each station is armoured. All of that reads the ground and
 * the map and cannot be re-derived at runtime without shipping both.
 * PLAYER: the mesh, the stones, and everything that varies with the camera.
 *
 *   node cartograph/bake-revetment.js --scene=<id> [--look=<id>]
 * Writes public/baked/<look>/revetment.json. Read-only apart from that file.
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeIfChanged } from './io.js'
import { requireExplicitMap } from './scene.js'
import { shoreArmourFor, wetSideOf, MIN_ARMOUR_D50_M, RIPRAP_REPOSE_DEG, TAG_REACH_M } from './shore-armour.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WATER_EDGE_SKEL = '__water__'          // tileGround.js's id for the stroked coast

/** Douglas–Peucker. Removes VERTICES; see the resample immediately after it. */
function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice()
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let far = -1, fd = tol
    const [ax, az] = pts[a], [bx, bz] = pts[b]
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz
    for (let i = a + 1; i < b; i++) {
      const [px, pz] = pts[i]
      const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0
      const d = Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
      if (d > fd) { fd = d; far = i }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

/** Walk a polyline at a fixed step. ⛔ NOT optional after `simplify`. */
function resample(pts, step) {
  if (pts.length < 2) return pts.slice()
  const out = [pts[0]]
  let carry = step
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i]
    let seg = Math.hypot(bx - ax, bz - az)
    let t = 0
    while (seg - t >= carry) {
      t += carry; carry = step
      out.push([ax + (bx - ax) * (t / seg), az + (bz - az) * (t / seg)])
    }
    carry -= seg - t
  }
  const last = pts[pts.length - 1]
  if (Math.hypot(out[out.length - 1][0] - last[0], out[out.length - 1][1] - last[1]) > step / 2) out.push(last)
  return out
}

export function bakeRevetment({ scene, look }) {
  const lookId = look || scene
  const shapePath = join(ROOT, 'public', 'baked', lookId, 'shape.json')
  const tMetaPath = join(ROOT, 'cartograph', 'data', scene, 'clean', 'terrain.json')
  const tBinPath = join(ROOT, 'cartograph', 'data', scene, 'clean', 'terrain.bin')
  const osmPath = join(ROOT, 'cartograph', 'data', scene, 'raw', 'osm.json')
  const outDir = join(ROOT, 'public', 'baked', lookId)
  const outPath = join(outDir, 'revetment.json')

  for (const [p, what] of [[shapePath, 'shape.json'], [tMetaPath, 'clean/terrain.json'],
                           [tBinPath, 'clean/terrain.bin'], [osmPath, 'raw/osm.json']]) {
    // ⛔ LOUD. A missing input is not "no revetment" — it is a pour that has not
    // happened, and answering it with an empty artifact would look like a town
    // that simply has no shoreline.
    if (!existsSync(p)) throw new Error(`bake-revetment: ${scene} has no ${what} (${p}). Pour the town first.`)
  }

  const tm = JSON.parse(readFileSync(tMetaPath, 'utf8'))
  if (tm.datum !== 'water') {
    console.log(`[bake-revetment] scene=${scene}: terrain datum is "${tm.datum ?? 'unset'}", not water — this town has no coast. Nothing to build.`)
    return { arcs: [], reason: 'no-water-datum' }
  }
  const shape = JSON.parse(readFileSync(shapePath, 'utf8'))
  const osm = JSON.parse(readFileSync(osmPath, 'utf8'))

  // The heightfield, already normalised so y = 0 IS the water (bake-terrain).
  const tb = readFileSync(tBinPath)
  const tf = new Float32Array(tb.buffer, tb.byteOffset, tb.length / 4)
  const stepX = (tm.bounds.maxX - tm.bounds.minX) / (tm.width - 1)
  const stepZ = (tm.bounds.maxZ - tm.bounds.minZ) / (tm.height - 1)
  const gridM = Math.min(stepX, stepZ)
  const heightAt = (x, z) => {
    const gx = Math.round((x - tm.bounds.minX) / stepX), gz = Math.round((z - tm.bounds.minZ) / stepZ)
    if (gx < 0 || gz < 0 || gx >= tm.width || gz >= tm.height) return NaN
    const v = tf[gz * tm.width + gx]
    return Number.isFinite(v) ? v : NaN
  }

  // ⛔ Each edge appears on the two tiles that share it; dedupe by shape, not by
  // tile index — the live pass and the frozen artifact number tiles differently.
  const seen = new Set(); const raw = []
  for (const t of (shape.tiles || [])) for (const r of (t.runs || [])) {
    if (r.skelId !== WATER_EDGE_SKEL || !Array.isArray(r.poly) || r.poly.length < 2) continue
    const k = `${r.poly.length}:${r.poly[0][0].toFixed(2)},${r.poly[0][1].toFixed(2)}`
    if (!seen.has(k)) { seen.add(k); raw.push(r.poly.map(p => [p[0], p[1]])) }
  }
  if (!raw.length) {
    console.log(`[bake-revetment] scene=${scene}: no ${WATER_EDGE_SKEL} runs in the slab — this town has no shoreline.`)
    return { arcs: [], reason: 'no-shoreline' }
  }

  const armourAt = shoreArmourFor(osm.ground || {})
  const arcs = [], refused = [], why = {}
  let ruledM = 0, armouredM = 0, refusedM = 0

  for (let idx = 0; idx < raw.length; idx++) {
    const trace = raw[idx]
    const len = trace.reduce((a, p, i) => i ? a + Math.hypot(p[0] - trace[i-1][0], p[1] - trace[i-1][1]) : 0, 0)

    // ⭐ THE WET SIDE VOTES ON THE UNTOUCHED TRACE. Simplifying first smooths away
    // the very asymmetry it is reading — measured: one jetty reads `both` raw and
    // `left` once simplified, i.e. its winding was being decided from a line that
    // had been smoothed. ⇒ Ask the ground before touching the geometry.
    const wet = wetSideOf(trace, heightAt, gridM)
    if (!wet.side) { refused.push({ index: idx, lengthM: +len.toFixed(1), why: wet.why }); refusedM += len; continue }

    // ⭐ Simplify for CURVATURE, then resample for SAMPLING — two different numbers.
    // Douglas–Peucker removes vertices and every reading below is per-vertex, so
    // simplifying alone silently stops sampling the ground. The tolerance is half
    // the grid step: a wiggle finer than the heightfield that supplies the crest
    // has no crest of its own.
    const path = resample(simplify(trace, gridM / 2), gridM)

    const stations = []
    for (let i = 0; i < path.length; i++) {
      const [x, z] = path[i]
      const crest = heightAt(x, z)
      const a = armourAt(x, z, crest)
      // ⛔ `why` is NOT emitted per station. It is a diagnostic string, the player
      // does not read it, and at ~5,000 stations a town it was 60% of the file.
      // The census is summarised below and `checks/` can re-derive any of it.
      stations.push({
        x: +x.toFixed(2), z: +z.toFixed(2),
        crest: Number.isFinite(crest) ? +crest.toFixed(3) : null,
        armour: a.armour, ...(a.dispute ? { dispute: a.dispute } : {}),
      })
      why[a.why] = (why[a.why] || 0) + 1
    }
    // ⭐ ARMOURED LENGTH BY HALF-ATTRIBUTION: each station owns half the segment on
    // either side of it. ⛔ Not "both endpoints armoured" (which undercounts every
    // transition — 7.03 km against 7.96 on huron) and not "either endpoint" (which
    // double-counts them, 8.89). Half-attribution is the only one of the three that
    // sums to the arc's own length when every station is armoured.
    // ⚠️ And it is a LENGTH because a per-vertex percentage moves with the
    // resampling and measures sampling as much as shore.
    let aM = 0
    for (let i = 0; i < stations.length; i++) {
      if (!stations[i].armour) continue
      if (i > 0) aM += Math.hypot(stations[i].x - stations[i-1].x, stations[i].z - stations[i-1].z) / 2
      if (i < stations.length - 1) aM += Math.hypot(stations[i+1].x - stations[i].x, stations[i+1].z - stations[i].z) / 2
    }
    ruledM += len; armouredM += aM
    arcs.push({
      index: idx,
      lengthM: +len.toFixed(1),
      armouredM: +aM.toFixed(1),
      // ⭐ 'both' is an ANSWER, not a refusal: a breakwater is armoured on two
      // faces and a sand bar on neither, and the predicate above ruled each
      // station either way. The player builds every face listed here.
      faces: wet.side === 'both' ? ['left', 'right'] : [wet.side],
      probeM: wet.probeM ?? null,
      stations,
    })
  }

  const out = {
    version: 1,
    look: lookId,
    scene,
    // ⛔ The seed is the whole of the stone's storage. Per look so two towns do not
    // wear the same rocks, and stable so a re-bake does not reshuffle a shore.
    seed: [...lookId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7),
    // The constants are STAMPED, not looked up at runtime: a slab must render the
    // same a year from now even if these move, and a reader should not have to
    // find the module to know what geometry was ruled.
    material: { minArmourD50M: MIN_ARMOUR_D50_M, riprapReposeDeg: RIPRAP_REPOSE_DEG, tagReachM: TAG_REACH_M },
    gridM: +gridM.toFixed(3),
    waterDatum: tm.datum,
    totals: { ruledM: +ruledM.toFixed(1), armouredM: +armouredM.toFixed(1), refusedM: +refusedM.toFixed(1) },
    // Why each station was ruled as it was — the census, not the per-station string.
    census: why,
    arcs,
    refused,
  }

  mkdirSync(outDir, { recursive: true })
  const wrote = writeIfChanged(outPath, JSON.stringify(out))
  const kb = (JSON.stringify(out).length / 1024).toFixed(0)
  console.log(`[bake-revetment] scene=${scene} look=${lookId}: ${arcs.length} arc(s) ruled, ${refused.length} refused`)
  console.log(`  ${(ruledM/1000).toFixed(2)} km ruled · ${(armouredM/1000).toFixed(2)} km armoured (${(100*armouredM/Math.max(1,ruledM)).toFixed(0)}%) · ${(refusedM/1000).toFixed(2)} km refused`)
  for (const r of refused) console.log(`  ⛔ refused arc #${r.index} (${r.lengthM} m): ${r.why}`)
  const total = Object.values(why).reduce((a, b) => a + b, 0)
  console.log(`  stations: ${Object.entries(why).sort((a,b)=>b[1]-a[1]).map(([k,v]) => `${k} ${v}`).join(' · ')}`)
  // ⛔ SAY IT RATHER THAN LET IT READ AS "bare". A station with no terrain beneath
  // it is one we cannot rule — the arc runs outside the baked heightfield — and it
  // takes no stone. That is the conservative direction, but it is a GAP, not a
  // finding, and a shore that is silently bare is exactly what this kit calls the
  // worst outcome.
  if (why['no-height']) {
    const pc = (100 * why['no-height'] / total).toFixed(1)
    console.warn(`  ⚠️ ${why['no-height']} station(s) (${pc}%) have NO TERRAIN beneath them — the arc leaves the baked heightfield.`)
    console.warn(`     They take no stone. That is a gap in coverage, not a ruling that the shore is bare.`)
  }
  console.log(`  ${wrote ? 'wrote' : 'unchanged'} ${outPath} (${kb} KB — no mesh, no transforms; the player builds both)`)
  return out
}

async function main() {
  const scene = requireExplicitMap('bake-revetment')
  let look = null
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--look=(.+)$/)
    if (m) look = m[1]
  }
  bakeRevetment({ scene, look })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
