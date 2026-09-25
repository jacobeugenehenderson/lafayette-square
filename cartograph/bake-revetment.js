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
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeIfChanged } from './io.js'
import { requireExplicitMap } from './scene.js'
import { shoreArmourFor, wetSideOf, MIN_ARMOUR_D50_M, RIPRAP_REPOSE_DEG, TAG_REACH_M } from './shore-armour.mjs'
import { waterRuns, WATER_EDGE_SKEL } from './shoreRuns.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

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

/**
 * ⭐⭐ DO THE SLAB AND THE TERRAIN AGREE ABOUT WHETHER THIS TOWN HAS A COAST?
 *
 * Returns which of THREE states this scene is in — never a boolean, because the two
 * artifacts can disagree and that disagreement is a finding, not an answer:
 *   · 'build'         — the terrain datum is the water. Whatever the slab says, heights are
 *                       measured from the sea and the shoreline can be built.
 *   · 'inland'        — no water datum AND no shoreline in the slab. The two AGREE, nothing
 *                       is missing, nothing is stale. The only case where silence is right.
 *   · 'stale-terrain' — ⛔ the slab HAS a shoreline and the terrain does not know about it.
 *
 * ⛔ THE THIRD IS WHY THIS EXISTS. `bake-terrain` derives the datum from the scene's water
 * rings, so a terrain baked before the coast closed falls to `local minimum` and y = 0
 * becomes the lowest hole in the envelope instead of the sea. The old gate read the datum
 * ALONE and announced "this town has no coast" — asserting a fact about the town from a fact
 * about one stale file. On Provincetown that would have denied 122,204 m of Atlantic coast
 * and exited 0.
 *
 * ⭐ Kept as a pure function of the two observations so it can be tested exhaustively
 * without a baked town — the same shape `revetmentResponseKind` uses for the absent/
 * unverifiable split, and for the same reason: the interesting case is the one that is hard
 * to stage.
 *
 * @param {string|undefined} datum        `terrain.json`'s `datum` field
 * @param {number} waterRunCount          deduped `__water__` runs found in `shape.json`
 * @returns {'build'|'inland'|'stale-terrain'}
 */
/**
 * ⭐⭐ SPLIT A SHORELINE TRACE AT THE EDGE OF THE DRAWING.
 *
 * ⛔ THE DISC IS AUTHORITATIVE FOR ANY CONSUMER OF THE DRAWING — canon, and the reason is that
 * the circle is stamped LAST: what it excludes is not in the map. Shore beyond it is not
 * unarmoured, not refused and not a defect; it is OUTSIDE THE DRAWING, and the only honest
 * thing to do with it is COUNT it and say so.
 *
 * ⛔⛔ AND IT MUST NEVER BE PROBED. MEASURED on Provincetown, 2026-09-25: the heightfield spans
 * ±5,340 m (it follows the applied radius, 5290) while the coast ink still spans the OSM bb at
 * ±8,831 m, so **8% of shore vertices had no terrain under them at all** — a sample at
 * (8831, 5639) reads NaN. Those stations were being handed to `wetSideOf`, which cannot find
 * water in a heightfield that does not reach them, and the arc was then REFUSED as "not at a
 * water edge". ⭐ That is a false statement about the town: the shore is not dry there, it is
 * off the map. A refusal that is really an extent mismatch is the plausible-looking failure
 * this kit rates worst, and it is worse here than silence because it accuses the DATA.
 *
 * @returns {{ inside: number[][][], outsideM: number }} the runs within the disc, and the
 *          metres discarded — never merged into `refused`.
 */
export function clipTraceToDisc(trace, center, R) {
  if (!Array.isArray(trace) || trace.length < 2 || !Array.isArray(center) || !(R > 0)) {
    return { inside: trace && trace.length >= 2 ? [trace] : [], outsideM: 0 }
  }
  const d2 = (p) => (p[0] - center[0]) ** 2 + (p[1] - center[1]) ** 2
  const R2 = R * R
  const seg = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1])
  // the point where segment a→b crosses the circle, by bisection on the chord —
  // ⭐ good to a millimetre in ~20 steps and free of the quadratic's sign cases
  const cross = (a, b) => {
    let lo = 0, hi = 1
    for (let k = 0; k < 24; k++) {
      const m = (lo + hi) / 2
      const q = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m]
      if ((d2(q) <= R2) === (d2(a) <= R2)) lo = m; else hi = m
    }
    const m = (lo + hi) / 2
    return [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m]
  }
  const inside = []; let cur = null, outsideM = 0
  for (let i = 0; i < trace.length; i++) {
    const p = trace[i], within = d2(p) <= R2
    if (within) {
      if (!cur) { cur = []; if (i > 0) { const x = cross(trace[i - 1], p); cur.push(x); outsideM += seg(trace[i - 1], x) } }
      cur.push(p)
    } else {
      if (cur) { const x = cross(trace[i - 1], p); cur.push(x); outsideM += seg(x, p); inside.push(cur); cur = null }
      else if (i > 0) outsideM += seg(trace[i - 1], p)
    }
  }
  if (cur) inside.push(cur)
  return { inside: inside.filter(r => r.length >= 2), outsideM }
}

export function coastAgreement(datum, waterRunCount) {
  if (datum === 'water') return 'build'
  return waterRunCount > 0 ? 'stale-terrain' : 'inland'
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
  const shape = JSON.parse(readFileSync(shapePath, 'utf8'))
  const osm = JSON.parse(readFileSync(osmPath, 'utf8'))

  const raw = waterRuns(shape)   // every distinct __water__ run (shoreRuns.mjs)

  // ⭐⭐⭐ THE TWO ARTIFACTS MUST AGREE ABOUT WHETHER THIS TOWN HAS A COAST, AND WHEN THEY
  // DO NOT, THAT IS THE FINDING — NOT AN ANSWER.
  //
  // ⛔⛔ THIS GATE USED TO SAY SOMETHING IT COULD NOT KNOW. It read the terrain datum alone
  // and printed "this town has no coast. Nothing to build." But `terrain.json`'s datum is not
  // water and this town has no coast are DIFFERENT FACTS, and inferring the second from the
  // first is exactly the substitution Layer 0's second question forbids — in the one place
  // that decides whether a shoreline gets stone.
  // ⭐ MEASURED, 2026-09-24, on the town that exposed it: Provincetown's terrain was baked at
  // 17:48, BEFORE its coast closed, so `bake-terrain` found no water rings and fell to
  // `datum: "local minimum"` (baseElev −2.13 — y = 0 is the lowest hole in the envelope, not
  // the sea). Hours later the slab carried 420 `__water__` runs and 122,204 m of shoreline.
  // The old gate would have read the stale datum, announced that a town with 122 km of
  // Atlantic coast has none, built nothing, and EXITED 0. The operator sees a bare shore and
  // no reason — the plausible-looking success this kit rates worst.
  //
  // ⭐ So the two artifacts are read TOGETHER and there are three outcomes, not two:
  const agree = coastAgreement(tm.datum, raw.length)
  if (agree === 'inland') {
    // Both agree: no water datum, no shoreline in the slab. A genuinely inland town.
    // ⭐ Quiet is correct here and ONLY here — nothing is missing and nothing is stale.
    console.log(`[bake-revetment] scene=${scene}: terrain datum is "${tm.datum ?? 'unset'}" and the slab carries no ${WATER_EDGE_SKEL} runs — the two agree, this town is inland. Nothing to build.`)
    return { arcs: [], reason: 'no-coast' }
  }
  if (agree === 'stale-terrain') {
    // ⛔⛔ THE CONTRADICTION. The slab has a shoreline; the terrain does not know about it.
    // This is a STALE TERRAIN, not an absent coast, and it is unfixable from here — the
    // datum is decided by `bake-terrain`, which derives it from the scene's water rings.
    // ⛔ Refusing loudly is the whole point: a quiet return here is indistinguishable from
    // an inland town, and the operator would never learn which they had.
    const when = (p) => { try { return statSync(p).mtime.toISOString().replace('T', ' ').slice(0, 19) } catch { return '?' } }
    const shoreM = raw.reduce((a, t) => a + t.reduce((b, p, i) => i ? b + Math.hypot(p[0] - t[i-1][0], p[1] - t[i-1][1]) : 0, 0), 0)
    throw new Error(
      `bake-revetment: ${scene} — THE SLAB AND THE TERRAIN DISAGREE ABOUT THIS TOWN'S COAST.\n` +
      `   the slab HAS a shoreline: ${raw.length} ${WATER_EDGE_SKEL} run(s), ${Math.round(shoreM).toLocaleString()} m\n` +
      `     ${shapePath}  (written ${when(shapePath)})\n` +
      `   the terrain does NOT know about it: datum "${tm.datum ?? 'unset'}", baseElev ${tm.baseElev}\n` +
      `     ${tMetaPath}  (written ${when(tMetaPath)})\n` +
      `\n` +
      `   ⛔ This is a STALE TERRAIN, not a town without a coast. The datum is derived by\n` +
      `      bake-terrain from the scene's water rings; if the terrain was baked before the\n` +
      `      coast closed, y = 0 is the lowest hole in the envelope rather than the sea, and\n` +
      `      EVERY height-above-water in this town is measured from the wrong zero.\n` +
      `   ▶ Re-bake the terrain for this scene, then run this again.\n` +
      `   ⛔ Refusing rather than building: stone founded on the wrong datum would look\n` +
      `      plausible and be wrong everywhere, which is worse than no stone at all.`)
  }

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

  // ⭐ Reaching here means the datum IS water. A water-datum town with no shoreline in the
  // slab is its own case — the terrain found water, the slab froze none.
  if (!raw.length) {
    console.log(`[bake-revetment] scene=${scene}: no ${WATER_EDGE_SKEL} runs in the slab — this town has no shoreline.`)
    return { arcs: [], reason: 'no-shoreline' }
  }

  // ⭐ THE DISC — the edge of the drawing. Read from the town's own boundary, and ⛔ REFUSED
  // LOUDLY rather than defaulted: a missing radius would silently make the whole bb the
  // drawing, and shore outside the map would be reported as dry shore inside it.
  const bndPath = join(ROOT, 'cartograph', 'data', scene, 'neighborhood_boundary.json')
  if (!existsSync(bndPath)) throw new Error(`bake-revetment: ${scene} has no neighborhood_boundary.json — the disc is what says which shore is in the drawing, and without it every arc would be ruled as though the whole fetch were the map.`)
  const bnd = JSON.parse(readFileSync(bndPath, 'utf8'))
  const discC = Array.isArray(bnd.center) ? bnd.center : null
  const discR = Number.isFinite(bnd.radius) ? bnd.radius : NaN
  if (!discC || !(discR > 0)) throw new Error(`bake-revetment: ${scene}'s neighborhood_boundary.json has no usable center/radius (center=${JSON.stringify(bnd.center)}, radius=${bnd.radius}).`)

  const armourAt = shoreArmourFor(osm.ground || {})
  const arcs = [], refused = [], why = {}
  let ruledM = 0, armouredM = 0, refusedM = 0, outsideM = 0
  const outside = []

  // ⛔⛔ CLIP TO THE DRAWING BEFORE ANYTHING ELSE. Shore beyond the disc has no terrain under
  // it, so probing it asks a heightfield a question it cannot answer and then blames the
  // answer on the coast. It is COUNTED as outside and never ruled. (`clipTraceToDisc`.)
  const clipped = []
  for (let idx = 0; idx < raw.length; idx++) {
    const { inside, outsideM: cut } = clipTraceToDisc(raw[idx], discC, discR)
    if (cut > 0) { outsideM += cut; outside.push({ index: idx, outsideM: +cut.toFixed(1), keptRuns: inside.length }) }
    for (const run of inside) clipped.push(run)
  }

  for (let idx = 0; idx < clipped.length; idx++) {
    const trace = clipped[idx]
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

    // ⛔⛔ THE CREST IS READ LANDWARD, NOT AT THE STATION, AND THAT IS THE WHOLE
    // DIFFERENCE BETWEEN A WALL AND A PATCHWORK.
    // This used to be `heightAt(x, z)` — the terrain ON the shoreline arc. But an arc
    // sits AT the water, so the ground under it is ~0 BY CONSTRUCTION; the wall is what
    // stands BEHIND it. The harness that proved this geometry always knew (huron.js's
    // CREST_PROBE_M, with that sentence in its doc comment); the bake dropped it.
    // ⭐ MEASURED on huron, 2026-09-23 (▶ node scratch/boulder-crest-probe.mjs):
    //   crest AT the station : median 0.433 m → 46.7% of stations judged armoured
    //   crest ONE STEP inland: median 1.234 m → 62.6%
    // The threshold is MIN_ARMOUR_D50_M = 0.5 m, so a median of 0.433 m put nearly every
    // station within centimetres of the line and let GRID NOISE decide which side it fell
    // on. That is what punched 148 one-station holes through an otherwise continuous
    // wall, and it read to the operator as "still totally patchy". ⛔ It was never
    // flicker in the predicate — the predicate was being handed a number measured in the
    // wrong place.
    //
    // ⭐⭐ THE DISTANCE IS ONE TERRAIN GRID STEP, READ FROM THE TOWN'S OWN HEIGHTFIELD.
    // ⛔ It cannot come from the data: sweeping the probe outward raises the crest
    // monotonically forever (0 m → 0.433, 5 → 1.234, 10 → 1.591, 20 → 1.847), because
    // walking inland walks up the bank and then into the hinterland. There is no plateau
    // to find, so a "best" distance measured off this town would be a Class D constant —
    // correct for huron and meaningless for town #2.
    // ⇒ It comes from the INSTRUMENT'S RESOLUTION instead: one step is the minimum that
    // samples a DIFFERENT heightfield cell (probe shorter than a cell re-reads the
    // station's own, which is why 0 m and 2.5 m barely differ), and it is the
    // conservative end of the range `shore-armour.mjs` already reasons in — wetSideOf
    // bounds itself at 6 * gridM because "past a handful of grid cells you are no longer
    // describing a shore edge, you are describing the hinterland." Same currency, same
    // justification, and it scales to any town's grid without being told.
    //
    // ⛔ `both` GETS NO PROBE. An arc with water on both sides — a breakwater, a rubble
    // mound — has no landward: probing either way walks into water and would read ~0 and
    // disarm the structure. There the station IS the crest, which is what it was always
    // measuring correctly.
    const CREST_PROBE_M = gridM
    // ⛔⛔ SIGN, AND I HAD IT BACKWARDS ON THE FIRST CUT — caught only because the
    // census moved the WRONG WAY (height-armoured stations 747 → 159 instead of up).
    // wetSideOf names RIGHT of the walk as (-tz, tx). So water on the RIGHT means
    // landward is the LEFT, and vice versa: the sign is the OPPOSITE of the side name.
    const landSign = wet.side === 'right' ? -1 : wet.side === 'left' ? 1 : 0
    const stations = []
    for (let i = 0; i < path.length; i++) {
      const [x, z] = path[i]
      let crest
      if (!landSign) {
        crest = heightAt(x, z)
      } else {
        // wetSideOf names RIGHT of the walk as (-tz, tx); landward is away from the water.
        const a0 = path[Math.max(0, i - 1)], b0 = path[Math.min(path.length - 1, i + 1)]
        const tx = b0[0] - a0[0], tz = b0[1] - a0[1]
        const m = Math.hypot(tx, tz)
        if (!m) { crest = heightAt(x, z) }
        else {
          const nx = (-tz / m) * landSign, nz = (tx / m) * landSign
          const h = heightAt(x + nx * CREST_PROBE_M, z + nz * CREST_PROBE_M)
          // ⛔ Off-grid landward reads fall back to the station rather than to NaN: the
          // armour predicate has a named `no-height` verdict and must reach it honestly.
          crest = Number.isFinite(h) ? Math.max(0, h) : heightAt(x, z)
        }
      }
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
    // ⭐ How far LANDWARD the crest was sampled, stamped so a reader — and a check —
    // can tell what this artifact's heights actually mean. One grid step by ruling
    // (Jacob, 2026-09-23); see the long note at the station loop for why it cannot be
    // measured off the data. A value of 0 would mean the crest was read at the
    // waterline, which is the defect this replaced.
    crestProbeM: +gridM.toFixed(3),
    waterDatum: tm.datum,
    // ⭐ FOUR NUMBERS, NOT THREE. `outsideM` is shore the DRAWING does not contain — it is not
    // refused, not unarmoured, and not a defect, and folding it into any of those would be a
    // false statement about the town.
    totals: { ruledM: +ruledM.toFixed(1), armouredM: +armouredM.toFixed(1), refusedM: +refusedM.toFixed(1), outsideM: +outsideM.toFixed(1) },
    outside,
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
  // ⭐ Said on its own line and only when non-zero: merging it with `refused` would report the
  // edge of our own drawing as a fact about the town's shore.
  if (outsideM > 0) console.log(`  ⭐ ${(outsideM/1000).toFixed(2)} km of shoreline lies OUTSIDE THE DRAWING (beyond the ${Math.round(discR)} m disc) across ${outside.length} arc(s) — counted, not refused: the circle is stamped last and what it excludes is not in the map.`)
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
