/**
 * huron.js — THE HARNESS ON A REAL SHORELINE.
 *
 * ⭐ Everything here is READ from artifacts already on disk. ⛔ Nothing bakes,
 * nothing writes, and no `cartograph/bake-*.js` is touched: the point is to find
 * out what a real shore does to this geometry BEFORE anyone commits to a slab
 * schema. A demo curve has no tight bends, no river mouth, no harbour, and no arcs
 * running off the bounding box; huron has all four.
 *
 * WHAT IT READS
 *   · `public/baked/huron/shape.json` — runs with `skelId === '__water__'`.
 *     ⛔ DEDUPE IS NOT OPTIONAL: every shoreline edge appears on TWO tiles, so the
 *     raw run list double-counts. Keyed on vertex count + first point.
 *   · `cartograph/data/huron/clean/terrain.{json,bin}` — Float32 heightfield.
 *     ⭐ `datum: "water"` means **y = 0 IS THE LAKE**: an elevation is already a
 *     height above the water plane, and ground below the lake is negative by
 *     design. ⛔ Do not subtract a water level from it a second time.
 *   · `cartograph/data/huron/raw/osm.json` — the `ground` buckets, for the
 *     armour predicate. ⚠️ huron's fetch predates `man_made` bucketing, so
 *     breakwaters/groynes sit in `ground.other`; `shore-armour.mjs`'s `pick()`
 *     already looks there, which is why this still works.
 *
 * ⭐⭐ THE WINDING IS RULED AND COMES FROM `wetSideOf` (`cartograph/shore-armour.mjs`).
 * ⛔ The harness crutch that used to live here — *"the higher side is landward"* —
 * is DELETED, not kept beside it. It was wrong exactly where the answer is hard:
 * on huron it dissents on three arcs, two of which `wetSideOf` REFUSES as too short
 * for the terrain to resolve, and one (#4) where the water genuinely is on the right.
 * A crutch that is only wrong on the non-obvious cases is worse than no crutch.
 * ⛔ AND A REFUSAL IS AN ANSWER: an arc `wetSideOf` will not rule on is not rendered
 * with a guess. It is reported, with its reason, and left out.
 */

import { shoreArmourFor, wetSideOf, MIN_ARMOUR_D50_M, RIPRAP_REPOSE_DEG } from '../../shore-armour.mjs'

/** How far landward to sample for the crest. A shoreline arc sits AT the water, so
 *  the terrain on it is ~0 by construction; the wall is what stands behind it. */
export const CREST_PROBE_M = 6

/** huron's heightfield step, metres: 7179 m across 1437 samples. ⛔ Passed to
 *  `wetSideOf` so its probe sweep is in units of what the terrain can actually
 *  resolve, rather than a distance that happens to work on one town. */
export const TERRAIN_GRID_M = 5

/** ⭐⭐ THE ARC IS SIMPLIFIED BEFORE ANYTHING IS BUILT ON IT, and the tolerance is
 *  DERIVED: half the heightfield's step. The crest that drives every dimension of
 *  this construction is read from a 5 m grid, so a shoreline wiggle finer than that
 *  has no crest of its own — carrying it into the geometry is carrying noise and
 *  calling it coastline.
 *  ⛔ MEASURED, and it is why no new construction was written: on the raw trace 6 of
 *  huron's 7 ruled arcs make the revetment band fold through itself (minimum turn
 *  radii of 0.6 and 0.8 m — a shore does not turn inside one armour stone; an OSM
 *  trace does). Simplifying drops that to ONE, keeps 99.7% of the arc length and
 *  27% of the vertices. ▶ node scratch/boulder-huron-input.mjs
 *  ⭐ `SKELETON.md §0.1`: scaffolding is a symptom — suspect the input. The first
 *  instinct here was medial-axis offsetting and swept-solid booleans, against an
 *  input nobody had simplified. */
export const SIMPLIFY_TOL_M = TERRAIN_GRID_M / 2

/** ⛔⛔ AND THEN RESAMPLE. Simplifying alone was WRONG and I caught it by re-running
 *  the arc table: Douglas–Peucker removes VERTICES, and every downstream reading —
 *  the crest, the armour predicate, `wetSideOf`'s own vote — is taken PER VERTEX. So
 *  a simplified arc silently stopped sampling the terrain: arc #13's armoured share
 *  fell 48% → 26% and its median crest halved, arc #4 collapsed to a 2-point straight
 *  line and `wetSideOf` refused it outright. ⭐ THE TOLERANCE IS FOR CURVATURE; THE
 *  STEP IS FOR SAMPLING, and they are different numbers. Simplify to drop trace
 *  noise, then resample the smooth path at the grid's own step so the terrain is
 *  read as densely as it can be read. */
function resample(pts, step) {
  if (pts.length < 2 || !(step > 0)) return pts
  const out = [pts[0]]
  let carry = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const L = Math.hypot(b.x - a.x, b.z - a.z)
    if (L < 1e-9) continue
    for (let d = step - carry; d < L; d += step) {
      const f = d / L
      out.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f })
    }
    carry = (carry + L) % step
  }
  out.push(pts[pts.length - 1])
  return out
}

/**
 * Douglas–Peucker, with the tolerance supplied per vertex so a caller CAN vary it.
 * ⚠️ Nothing varies it today: a band-derived tolerance was built and removed once the
 * fold class it existed for was shown not to exist (see the receipt at the call
 * site). The per-vertex form stays because it costs nothing and the next caller with
 * a real reason to vary tolerance should not have to rewrite the traversal.
 * @param tolAt (i) => metres, the tolerance AT that vertex.
 */
function simplifyVarying(pts, tolAt) {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let worst = -1, wi = -1
    const ax = pts[a].x, az = pts[a].z, dx = pts[b].x - ax, dz = pts[b].z - az
    const L2 = dx * dx + dz * dz
    for (let i = a + 1; i < b; i++) {
      const t = L2 ? Math.max(0, Math.min(1, ((pts[i].x - ax) * dx + (pts[i].z - az) * dz) / L2)) : 0
      const d = Math.hypot(pts[i].x - (ax + t * dx), pts[i].z - (az + t * dz))
      if (d > worst) { worst = d; wi = i }
    }
    // The deviation is judged against the tolerance where the deviation IS — a tall
    // stretch tolerates a wide chord, a low one does not.
    if (wi >= 0 && worst > tolAt(wi)) { keep[wi] = 1; stack.push([a, wi], [wi, b]) }
  }
  return pts.filter((_, i) => keep[i])
}
const simplify = (pts, tol) => simplifyVarying(pts, () => tol)

const TAN_REPOSE = Math.tan((RIPRAP_REPOSE_DEG * Math.PI) / 180)

const BASE = {
  shape: '/baked/huron/shape.json',
  terrainMeta: '/cartograph/data/huron/clean/terrain.json',
  terrainBin: '/cartograph/data/huron/clean/terrain.bin',
  osm: '/cartograph/data/huron/raw/osm.json',
}

/** Bilinear sampler, deliberately identical in convention to
 *  `src/lib/terrainCommon.js#makeElevationSampler` — ⛔ a second convention here
 *  would put the stone on a different ground than the one that renders. */
function sampler(meta, data) {
  const { width, height, bounds } = meta
  const spanX = bounds.maxX - bounds.minX, spanZ = bounds.maxZ - bounds.minZ
  return function elevAt(x, z) {
    const gx = ((x - bounds.minX) / spanX) * (width - 1)
    const gz = ((z - bounds.minZ) / spanZ) * (height - 1)
    const gx0 = Math.max(0, Math.min(width - 2, Math.floor(gx)))
    const gz0 = Math.max(0, Math.min(height - 2, Math.floor(gz)))
    const fx = Math.max(0, Math.min(1, gx - gx0))
    const fz = Math.max(0, Math.min(1, gz - gz0))
    const e00 = data[gz0 * width + gx0] || 0
    const e10 = data[gz0 * width + (gx0 + 1)] || 0
    const e01 = data[(gz0 + 1) * width + gx0] || 0
    const e11 = data[(gz0 + 1) * width + (gx0 + 1)] || 0
    return (e00 * (1 - fx) + e10 * fx) * (1 - fz) + (e01 * (1 - fx) + e11 * fx) * fz
  }
}

/** Unique `__water__` arcs. ⛔ The dedupe is the whole reason the count is 14 and
 *  not ~28 — an edge belongs to the tile on each side of it. */
export function waterArcs(shape) {
  const seen = new Map()
  for (const t of shape.tiles || []) {
    for (const r of t.runs || []) {
      if (r.skelId !== '__water__' || !Array.isArray(r.poly) || r.poly.length < 2) continue
      const k = `${r.poly.length}:${r.poly[0][0].toFixed(3)},${r.poly[0][1].toFixed(3)}`
      if (!seen.has(k)) seen.set(k, { poly: r.poly, sides: new Set([r.side]), segOrd: r.segOrd })
      else seen.get(k).sides.add(r.side)
    }
  }
  return [...seen.values()].map((v, i) => {
    // ⛔ RAW HERE, ON PURPOSE. The tolerance is derived from the CREST, and the
    // crest needs the terrain and the arc's own orientation — neither of which
    // exists yet. Simplification happens in `loadHuronShore`, after `wetSideOf`.
    const raw = v.poly.map(p => ({ x: p[0], z: p[1] }))
    const poly = raw
    let len = 0
    for (let j = 1; j < poly.length; j++) len += Math.hypot(poly[j].x - poly[j - 1].x, poly[j].z - poly[j - 1].z)
    return { id: i, poly, raw, len, verts: poly.length, rawVerts: raw.length, sides: [...v.sides], flip: false }
  })
}

/** Per-vertex crest height and armour verdict for one arc. */
export function profileArc(arc, elevAt, armourAt) {
  const poly = arc.flip ? [...arc.poly].reverse() : arc.poly
  const n = poly.length
  const out = { t: new Float32Array(n), crest: new Float32Array(n), armour: new Uint8Array(n), why: [], land: 0, water: 0 }
  let acc = 0
  const cum = new Float32Array(n)
  for (let i = 1; i < n; i++) { acc += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].z - poly[i - 1].z); cum[i] = acc }
  const total = acc || 1
  for (let i = 0; i < n; i++) {
    const a = poly[Math.max(0, i - 1)], b = poly[Math.min(n - 1, i + 1)]
    const dx = b.x - a.x, dz = b.z - a.z
    const L = Math.hypot(dx, dz) || 1
    const nx = dz / L, nz = -dx / L          // right-hand normal = the wet side, by convention
    const p = poly[i]
    // ⭐ Sample BOTH sides. The landward one is the crest; the waterward one is a
    // check that the arc really is a shoreline and not an inland line.
    const hWater = elevAt(p.x + nx * CREST_PROBE_M, p.z + nz * CREST_PROBE_M)
    const hLand = elevAt(p.x - nx * CREST_PROBE_M, p.z - nz * CREST_PROBE_M)
    out.water += hWater; out.land += hLand
    const crest = Math.max(0, hLand)
    out.t[i] = cum[i] / total
    out.crest[i] = crest
    const v = armourAt ? armourAt(p.x, p.z, crest) : { armour: crest >= MIN_ARMOUR_D50_M, why: 'height' }
    out.armour[i] = v.armour ? 1 : 0
    out.why.push(v.why)
  }
  out.land /= n; out.water /= n
  return out
}

/**
 * The oriented polylines this arc should be BUILT on: one for an ordinary shore,
 * TWO for a bank between two waters. ⭐ One definition, so no call site has to
 * remember the two-faced case — forgetting it is silent and asymmetric.
 */
export function arcFaces(arc) {
  const fwd = arc.flip ? [...arc.poly].reverse() : arc.poly
  return arc.twoFaced ? [fwd, [...fwd].reverse()] : [fwd]
}

/** crestAt(t) for the drape/stone builders, interpolated from the profile. */
export function crestFn(prof) {
  return (t) => {
    const n = prof.t.length
    const tt = Math.min(1, Math.max(0, t))
    let lo = 0, hi = n - 1
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (prof.t[mid] <= tt) lo = mid; else hi = mid }
    const span = prof.t[hi] - prof.t[lo] || 1
    const f = (tt - prof.t[lo]) / span
    // ⛔ Where the predicate says BARE, the crest is reported as zero so the
    // builders emit nothing — the bare stretch is an absence of stone, not a
    // shorter wall, and it must not be smoothed across.
    const cl = prof.armour[lo] ? prof.crest[lo] : 0
    const ch = prof.armour[hi] ? prof.crest[hi] : 0
    return cl * (1 - f) + ch * f
  }
}

async function getJSON(url, fetcher) { return fetcher ? fetcher.json(url) : (await fetch(url)).json() }
async function getBin(url, fetcher) { return fetcher ? fetcher.bin(url) : (await fetch(url)).arrayBuffer() }

/**
 * @param fetcher optional { json(url), bin(url) } so this module can be driven
 *        from node (▶ `scratch/boulder-huron-arcs.mjs`) as well as the browser.
 *        ⭐ That is what lets the per-arc diagnosis be a CHECK rather than a
 *        screenshot — the channel that misled this probe repeatedly.
 */
export async function loadHuronShore({ fetcher = null, withArmour = true } = {}) {
  const [shape, meta, binBuf] = await Promise.all([
    getJSON(BASE.shape, fetcher),
    getJSON(BASE.terrainMeta, fetcher),
    getBin(BASE.terrainBin, fetcher),
  ])
  const data = new Float32Array(binBuf)
  if (data.length !== meta.width * meta.height) {
    throw new Error(`huron terrain: ${data.length} samples for a ${meta.width}×${meta.height} grid — the .bin and .json disagree`)
  }
  const elevAt = sampler(meta, data)
  let armourAt = null
  if (withArmour) {
    const osm = await getJSON(BASE.osm, fetcher)
    armourAt = shoreArmourFor(osm.ground || {})
  }
  const arcs = waterArcs(shape)
  for (const a of arcs) {
    const verdict = wetSideOf(a.poly.map(p => [p.x, p.z]), elevAt, TERRAIN_GRID_M)
    a.wet = verdict
    // ⛔ SIGN CHECKED EMPIRICALLY, NOT REASONED. `wetSideOf`'s right-hand normal is
    // (−tz, tx); this harness's builders take (uz, −ux) as waterward. Those are
    // OPPOSITE, and a sign I merely argued for is a sign I would get wrong. So the
    // mapping below is verified per arc by `profileArc`, which reports the mean
    // terrain on each side: after the flip, landward must read HIGHER than waterward.
    // ▶ `node scratch/boulder-huron-arcs.mjs` prints the check per arc.
    a.refused = verdict.side === null
    a.refusedWhy = verdict.side === null ? verdict.why : null
    // ⭐⭐ `'both'` IS A RULING, NOT A REFUSAL — a bank between two waters has TWO
    // faces and the armour predicate rules on each. ⛔ I had it as a refusal, which
    // is how `wetSideOf` used to report it; treating it as single-faced would armour
    // one side of a jetty and leave the other bare, which is worse than either
    // answer. On huron it is 4,860 m — arc #11 (4,750 m) and arc #10 (110 m).
    a.twoFaced = verdict.side === 'both'
    a.flip = verdict.side === 'right'
    const p0 = profileArc(a, elevAt, null)
    a.landMean = p0.land
    a.waterMean = p0.water
    a.sideCheck = a.refused ? 'refused' : (p0.land > p0.water ? 'ok' : 'INVERTED')

    // ⭐⭐ THE ORDER IS THE WHOLE POINT, so it is written out:
    //   ① wetSideOf on the RAW arc → which side is wet
    //   ② profile the raw arc → crest per raw vertex
    //   ③ band = crest / tan(repose) → the tolerance AT each vertex
    //   ④ simplify with that varying tolerance → the curve the structure can follow
    //   ⑤ RESAMPLE at the grid step → the terrain is read as densely as it can be
    // ⛔ ⑤ is not optional and it is the correction from last pass: DP removes
    // VERTICES and every downstream reading is per-vertex, so simplifying alone
    // silently stops sampling the terrain. The tolerance is for CURVATURE; the step
    // is for SAMPLING; they are different numbers. A band-derived tolerance
    // simplifies some stretches far harder than the old constant did, so this
    // matters more now, not less.
    const oriented = a.flip ? [...a.poly].reverse() : a.poly
    // ⛔⛔ THE TOLERANCE IS THE GRID FLOOR, AND A BAND-DERIVED ONE WAS BUILT HERE AND
    // THEN REMOVED. The reasoning for it was sound — a revetment cannot follow a
    // curve tighter than its own width — but it was solving a problem that DOES NOT
    // EXIST. This probe reported "7 of 14 arcs fold" from a MINIMUM-TURN-RADIUS test.
    // ⭐⭐ WHY THAT TEST LIED, AND THE NARROW VERSION IS THE ONE THAT MATTERS:
    // circumradius measures THE POLYLINE. On a SMOOTH curve it is sampling-INDEPENDENT
    // — the vertex turn angle shrinks in proportion to the spacing and the two cancel
    // (a 50 m circle reads 50.0 m sampled at 20, 10, 5, 2, 1 and 0.5 m). ⛔ On a NOISY
    // trace the angle does NOT shrink with spacing, so the reading collapses toward
    // the JITTER AMPLITUDE instead of the coast's curvature. The metric was not
    // broken in general; it was faithfully reporting the wobble of an unsimplified
    // OSM trace. ⚠️ Do not carry away "circumradius measures sampling" — that would
    // reject a sound metric somewhere it works.
    // ⭐ Re-measured with the honest test (`bandFolds`, band self-overlap in metres),
    // the RAW trace folds on 0 of 9 arcs and so does the simplified one — including
    // arc #3 at its full 13.2 m band. ▶ node scratch/boulder-fold-truth.mjs
    // ⇒ The tight-bend class was never real. Keeping machinery motivated only by it
    // would be carrying a fix for a phantom. What survives on its own merits is the
    // FLOOR: a wiggle finer than the heightfield that supplies the crest has no crest
    // of its own.
    const simplified = simplify(oriented, SIMPLIFY_TOL_M)
    const finalPoly = resample(simplified, TERRAIN_GRID_M / 2)
    a.rawVerts = a.poly.length
    a.poly = a.flip ? [...finalPoly].reverse() : finalPoly
    a.verts = a.poly.length
    a.simplifiedTo = simplified.length
    a.tol = SIMPLIFY_TOL_M
    let L = 0
    for (let i = 1; i < a.poly.length; i++) L += Math.hypot(a.poly[i].x - a.poly[i - 1].x, a.poly[i].z - a.poly[i - 1].z)
    a.rawLen = a.len
    a.len = L
  }
  return { arcs, elevAt, armourAt, meta, waterY: 0 }
}

/**
 * ⭐⭐ DOES THE BAND FOLD THROUGH ITSELF? — and this replaces a BROKEN INSTRUMENT.
 *
 * ⛔ THE OLD TEST WAS "minimum turn radius < band width", and it reported the TRACE'S
 * JITTER rather than the coast's curvature. ⚠️ The narrow statement is the one to
 * keep: circumradius measures the polyline, and on a SMOOTH curve it is
 * sampling-independent — a 50 m circle reads 50.0 m at every spacing from 20 m down
 * to 0.5 m. Add 0.3 m of jitter and the same measurement reads 44.9 / 33.7 / 17.1 /
 * 4.0 / 1.2 / 0.5 m as the spacing tightens: it collapses once the spacing approaches
 * the noise amplitude. ⛔ So it is not "circumradius measures sampling" — that
 * generalisation would reject a sound metric where it works.
 * ⭐ THE TELL THAT SENT ME BACK TO THE INSTRUMENT: switching to a tolerance that
 * strictly STRAIGHTENS the curve made the fold count go UP. A fix cannot make the
 * thing it fixes worse. ⚠️ Every fold figure this probe reported before this function
 * was measured with that instrument and does not stand.
 *
 * ⭐ THE HONEST TEST IS THE FAILURE ITSELF, in metric units: the band from vertex i
 * and the band from vertex j overlap when they are FAR APART ALONG THE ARC but CLOSE
 * IN SPACE. That is local-feature-size vs offset distance, it is what actually makes
 * a swept ribbon self-intersect, and it does not care how densely the line is sampled.
 *
 * @param poly   [{x,z}] oriented
 * @param bandAt (i) => the band half-width at vertex i, metres
 * @returns { folds, worst, pairs } — `worst` is the deepest overlap found
 */
export function bandFolds(poly, bandAt) {
  const n = poly.length
  if (n < 3) return { folds: false, worst: 0, pairs: 0 }
  const cum = new Float64Array(n)
  let maxBand = 0
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].z - poly[i - 1].z)
  for (let i = 0; i < n; i++) maxBand = Math.max(maxBand, bandAt(i))
  if (maxBand <= 0) return { folds: false, worst: 0, pairs: 0 }
  const cell = maxBand
  const grid = new Map()
  const key = (cx, cz) => cx * 73856093 ^ cz * 19349663
  for (let i = 0; i < n; i++) {
    const k = key(Math.floor(poly[i].x / cell), Math.floor(poly[i].z / cell))
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(i)
  }
  let pairs = 0, worst = 0
  for (let i = 0; i < n; i++) {
    const bi = bandAt(i)
    if (bi <= 0) continue
    const cx = Math.floor(poly[i].x / cell), cz = Math.floor(poly[i].z / cell)
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const arr = grid.get(key(cx + dx, cz + dz))
      if (!arr) continue
      for (const j of arr) {
        if (j <= i) continue
        const bj = bandAt(j)
        if (bj <= 0) continue
        const reach = Math.max(bi, bj)
        // ⛔ Far along the arc — otherwise this fires on every neighbour, which is
        // the band overlapping ITSELF along its own length, i.e. not a fold at all.
        if (cum[j] - cum[i] <= 2 * reach) continue
        const d = Math.hypot(poly[i].x - poly[j].x, poly[i].z - poly[j].z)
        if (d < reach) { pairs++; worst = Math.max(worst, reach - d) }
      }
    }
  }
  return { folds: pairs > 0, worst, pairs }
}
