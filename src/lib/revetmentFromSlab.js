/**
 * revetmentFromSlab.js — TURN THE BAKED INSTRUCTION INTO SOMETHING BUILDABLE.
 *
 * `bake-revetment.js` ships an INSTRUCTION, not a mesh: per arc, the stations
 * along the shore, the crest above the water at each, whether each is armoured,
 * and which FACE(S) carry stone. This module is the one place that turns that
 * document into the `{ poly, crestAt }` pair every builder here takes
 * (`revetmentDrape.js`, `shoreChunks.js`).
 *
 * ⛔⛔ ONE PLACE, DELIBERATELY. The player and any check must agree about
 * orientation or the check proves nothing about what renders. That is why this is
 * a pure module with no three.js and no React in it: `checks/` imports exactly
 * what the map draws.
 *
 * ═══ THE ORIENTATION RULE, AND IT IS THE WHOLE REASON THIS FILE EXISTS ═══
 *
 * ⭐ THE BUILDERS PLACE STONE TOWARD **LEFT OF THE WALK**, and that is traced, not
 * assumed: `revetmentDrape.js` builds its station normal as `n = (uz, −ux)` for an
 * along-walk unit `(ux, uz)`, and extrudes the slope along `+n`. `wetSideOf`
 * (`cartograph/shore-armour.mjs`) names RIGHT of the walk as `(−tz, tx)`. Those are
 * negatives of one another, so the drape's `+n` is the LEFT.
 *
 * ⇒ A face stamped `left` is built on the trace AS WRITTEN. A face stamped
 * `right` is built on the REVERSED trace, which turns its water into the left.
 *
 * ⛔ GET THIS BACKWARDS AND NOTHING LOOKS BROKEN. The stone lands in the right
 * place with the right footprint; only the slope leans inland, the wetted band
 * paints the dry side, and the drape's normals point down. It is invisible in
 * every oblique view and shows only from a camera at the waterline — the failure
 * this kit rates worst, because it is plausible.
 * ⇒ ▶ `node checks/claims-the-revetment-builds-on-the-wet-face.mjs` asserts this
 * against the town's own heightfield rather than against this comment. A comment
 * asserting a winding has already been measured false here once
 * (`shore-armour.mjs`: *"the walk direction IS the wet side"*, dead within hours).
 */
import { d50For } from './shoreChunks.js'
import { MIN_ARMOUR_D50_M } from '../../cartograph/shore-armour.mjs'

/** The side of the walk the builders extrude toward. ⛔ Not a preference — read off
 *  `revetmentDrape.js`'s station normal. If that changes, this must change with it
 *  and the check above goes red, which is the point. */
export const BUILD_SIDE = 'left'

/**
 * crestAt(t) over a face's stations, t in 0..1 by arc length — and WHERE THE ARMOUR ENDS.
 * ⛔ Where the predicate says BARE there is no wall: a bare stretch is an ABSENCE of stone,
 * not a shorter wall, and it is not interpolated across.
 *
 * ⭐⭐ BUT A HEAP DOES NOT END IN A CUT (Jacob, 2026-09-26: "revetment still just abruptly
 * stops"). RULED: wherever armour ends the heap ends as a dumped heap does — slumping at
 * riprap's angle of repose in PLAN as well as in section, a quarter-cone into the sand. The
 * end's run is that station's own crest / tan(repose), from the material constant the slab
 * stamps (`material.riprapReposeDeg`) — no length is chosen anywhere.
 *   · a HARD→SOFT change inside the arc: the heap slumps OUTWARD from the last armoured
 *     station, over the bare side, to nothing at crest / tan(repose).
 *   · an ARC TIP that is armoured: the drawn shore stops there, so there is nothing to
 *     slump onto — the heap's toe is the tip and it rises INWARD at the same angle.
 * Both builders read this one function (the drape and `shoreChunks.js`), so the taper is
 * written once. `taperAt(t)` (1 on the wall, falling to 0 at the toe) is what the stone
 * placer thins and shrinks by. ▶ `node checks/claims-the-revetment-ends-as-a-heap.mjs`
 */
export function crestAndEnds(stations, cum, total, tanRepose) {
  const n = stations.length
  const H = (i) => stations[i].armour ? Math.max(0, stations[i].crest || 0) : 0
  const on = (i) => stations[i].armour && H(i) > 0
  // Every place the armour stops, with the direction the heap slumps (+1 = toward larger s).
  const ends = []
  for (let i = 0; i < n; i++) {
    if (!on(i)) continue
    if (i === 0) ends.push({ s: cum[0], H: H(0), dir: +1, tip: true })          // toe at the tip, rising inward
    else if (!on(i - 1)) ends.push({ s: cum[i], H: H(i), dir: -1, tip: false })  // slumps back over the bare side
    if (i === n - 1) ends.push({ s: cum[n - 1], H: H(i), dir: -1, tip: true })
    else if (!on(i + 1)) ends.push({ s: cum[i], H: H(i), dir: +1, tip: false })
  }
  for (const e of ends) e.run = e.H / tanRepose
  const interior = ends.filter(e => !e.tip), tips = ends.filter(e => e.tip)
  const locate = (s) => {
    let lo = 0, hi = n - 1
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid }
    return lo
  }
  // Returns [crest, taper]. taper = 1 on the wall; within an end's run, crest / that end's H.
  const eval_ = (t) => {
    const s = Math.min(1, Math.max(0, t)) * total
    const lo = locate(s), hi = Math.min(n - 1, lo + 1)
    let c = 0, f = 0
    if (on(lo) && on(hi)) {
      const span = cum[hi] - cum[lo] || 1
      const k = (s - cum[lo]) / span
      c = H(lo) * (1 - k) + H(hi) * k; f = 1
    } else {
      // Off the wall: the tallest slump that reaches here from an interior end.
      for (const e of interior) {
        const d = (s - e.s) * e.dir
        if (d < 0 || d > e.run) continue
        const h = e.H - d * tanRepose
        if (h > c) { c = h; f = h / e.H }
      }
    }
    // An armoured tip: the toe is the tip, so the wall is capped by the cone rising inward —
    // all the way until it meets the wall (where the wall rises inward, the cone runs on at the
    // same angle; stopping it at the tip station's own run would leave a step).
    for (const e of tips) {
      const d = (s - e.s) * e.dir
      if (d < 0) continue
      const cap = d * tanRepose
      if (cap < c) { c = cap; f = Math.min(f, cap / e.H) }
    }
    return [Math.max(0, c), Math.max(0, Math.min(1, f))]
  }
  // ⭐ WHERE crestAt CAN PEAK, so the drape sizes its lattice from the crest's exact maximum and never samples for it
  // (revetmentDrape.js#drapeLattices; BRIEF-the-drape-sizes-one-nested-lattice, Boz's ruling A). crestAt is piecewise linear
  // in s: a MAX of the wall's lerp and the interior ends' slumps, then a MIN with the tip cones. A max of linear pieces kinks
  // DOWNWARD, so its peaks are where a piece ends: the stations, each end's s and s ± run, and the range's two ends. The MIN
  // kinks UPWARD where a cone crosses a piece, between stations: cap ∩ wall, cap ∩ slump and cap ∩ cap. All of them, as t
  // in 0…1, evaluated by the caller through crestAt itself. ⛔ Not the bound max_i H(i): it over-sizes the stone wherever a
  // tip cone caps the tallest station (Zob). ▶ node checks/claims-the-drape-meets-itself-on-one-line.mjs (the dense gate)
  const S = [0, total]
  for (let i = 0; i < n; i++) S.push(cum[i])
  for (const e of ends) S.push(e.s, e.s + e.run, e.s - e.run)
  for (const e of tips) {
    const g = e.dir * tanRepose                                   // the cone's slope in s
    for (let i = 0; i + 1 < n; i++) {
      if (!(on(i) && on(i + 1))) continue
      const span = cum[i + 1] - cum[i]; if (!(span > 0)) continue
      const a = (H(i + 1) - H(i)) / span
      if (a === g) continue
      const s = (a * cum[i] - H(i) - g * e.s) / (a - g)          // H(i) + a·(s − cum[i]) = g·(s − e.s)
      if (s >= cum[i] && s <= cum[i + 1]) S.push(s)
    }
    for (const q of interior) {
      if (q.dir === -e.dir) continue                              // the slump and the cone are parallel
      S.push((q.H + tanRepose * (q.dir * q.s + e.dir * e.s)) / (tanRepose * (q.dir + e.dir)))   // q.H − q.dir·tan·(s − q.s) = g·(s − e.s)
    }
    // …and cap ∩ cap: on a face shorter than its two tips' runs the cones meet in the middle, below every station
    // (huron 88:left and 94:right, found by the dense gate)
    for (const q of tips) if (q !== e && q.dir !== e.dir) S.push((e.dir * e.s - q.dir * q.s) / (e.dir - q.dir))   // e.dir·(s − e.s) = q.dir·(s − q.s)
  }
  const crestBreaks = S.filter(s => Number.isFinite(s)).map(s => Math.min(1, Math.max(0, s / total)))
  return { crestAt: (t) => eval_(t)[0], taperAt: (t) => eval_(t)[1], ends, crestBreaks }
}

/**
 * @param doc the parsed `baked/<look>/revetment.json`
 * @returns [{ key, arcIndex, face, poly:[{x,z}], crestAt, crestBreaks, taperAt, ends, lengthM, armouredM, anyArmour }]
 *          one entry per FACE — a two-faced arc yields two, which is the case a
 *          single-face reader silently half-builds.
 */
export function revetmentFaces(doc) {
  if (!doc || doc.version !== 1) {
    // ⛔ Loud. A slab from a future baker must not be read with today's assumptions
    // and drawn anyway; that is a stale artifact rendering, which this kit treats
    // as the same class as a fallback.
    throw new Error(`revetmentFromSlab: unsupported revetment.json version ${doc && doc.version}`)
  }
  // ⭐ The slope is the one the slab was ruled with, stamped in it — never looked up here.
  const repose = doc.material?.riprapReposeDeg
  if (!(repose > 0 && repose < 90)) throw new Error(`revetmentFromSlab: revetment.json carries no material.riprapReposeDeg (${repose}) — the heap's ends cannot be shaped`)
  const tanRepose = Math.tan((repose * Math.PI) / 180)
  const out = []
  for (const arc of doc.arcs || []) {
    for (const face of arc.faces || []) {
      // ⛔ The station list is the TRACE's order. `face` names which side of that
      // walk the water is on, so `right` is built on the reverse. See the header.
      const st = face === BUILD_SIDE ? arc.stations : [...arc.stations].reverse()
      if (st.length < 2) continue
      const cum = new Float64Array(st.length)
      for (let i = 1; i < st.length; i++) {
        cum[i] = cum[i - 1] + Math.hypot(st[i].x - st[i - 1].x, st[i].z - st[i - 1].z)
      }
      const total = cum[st.length - 1] || 1
      const { crestAt, taperAt, ends, crestBreaks } = crestAndEnds(st, cum, total, tanRepose)
      out.push({
        key: `${arc.index}:${face}`,
        arcIndex: arc.index,
        face,
        poly: st.map(s => ({ x: s.x, z: s.z })),
        stations: st,
        crestAt,
        crestBreaks,
        taperAt,
        ends,
        tanRepose,
        toeBerm: doc.material?.toeBerm ?? null,
        // The high water its crests are measured from (bake-revetment `levelM`); null on an artifact from before the
        // levels, whose crests are above the terrain's zero.
        levelM: Number.isFinite(arc.levelM) ? arc.levelM : null,
        lowM: Number.isFinite(arc.lowM) ? arc.lowM : null,   // the LOW level: the toe runs down past it
        lengthM: total,
        armouredM: arc.armouredM ?? 0,
        anyArmour: st.some(s => s.armour),
      })
    }
  }
  return out
}

/**
 * ⭐⭐ THE TOWN'S MANIFEST SAYS WHETHER IT HAS A SHORE; THE LOADER ASKS ONLY FOR WHAT IT NAMES (2026-10-28, the inland
 * HPDM player measured by Ward: every cold load logged "FAILED to load revetment.json — manifest names no
 * revetment.json"). `bake-revetment` writes nothing for a town with no shoreline, and `bake-manifest` (the Bake's last
 * step) lists every file the slab holds in `files`. So:
 *   · the manifest names no `revetment.json` → the town has no revetment: nothing is fetched and nothing is said.
 *   · it names one → fetched; anything but the JSON artifact is a FAILURE, refused by name (the manifest said it is
 *     there, so a 404 or vite's 200-HTML index is not an absence — the old three-state guess is no longer needed).
 *   · there is no manifest → said by name, and nothing is drawn: absence is never a guess.
 * ⛔ The loader never asks for a file to learn whether it exists: on a published town a name the manifest does not
 * carry cannot even be resolved (slabNames.js#shaOf throws), which is the bug this replaced.
 * Pure (the fetch and the voice are handed in), so the check drives exactly what the map runs.
 *   ▶ node checks/claims-a-missing-revetment-is-not-a-shoreless-town.mjs
 * @param manifest  the town's manifest (slabUrl.js#slabManifest), or null
 * @param fetchFile (rel) => Promise<Response>   @param say (message) => void, for a refusal
 * @returns the revetment document, or null
 */
export async function loadRevetment(look, { manifest, fetchFile, say }) {
  if (!manifest) { say(`[revetment] ⛔ ${look}: the slab has no manifest.json — whether it has a shore is unknown, and none is drawn. ▶ node cartograph/bake-manifest.mjs --town=${look}`); return null }
  if (!manifest.files?.['revetment.json']) return null   // inland: the manifest names none
  try {
    const r = await fetchFile('revetment.json')
    const ct = String(r.headers?.get?.('content-type') || '').toLowerCase()
    if (!r.ok || !ct.includes('json')) throw new Error(`HTTP ${r.status} '${ct || 'no content-type'}' — not the artifact`)
    return await r.json()
  } catch (e) {
    say(`[revetment] ⛔ ${look}: its manifest names revetment.json, and it FAILED to load — ${e?.message || e}. No shore is drawn.`)
    return null
  }
}

/**
 * THE FAR SHORE, BAKED (cartograph/bake-revetment-far.js): its table and the seen chunks' bin, or null for a town the
 * manifest gives no revetment. ⛔ A town whose manifest names revetment.json but not revetment-far.json/.bin is a slab
 * baked before the far shore was: it is SAID, and no shore is drawn — the player never builds the far layer itself.
 * Never-seen chunks are in revetment-far-unseen.bin, fetched after the reveal (`loadRevetmentFarUnseen`).
 */
export async function loadRevetmentFar(look, { manifest, fetchFile, say }) {
  if (!manifest?.files?.['revetment.json']) return null
  const want = ['revetment-far.json', 'revetment-far.bin', 'revetment-far-unseen.bin'].filter(f => !manifest.files[f])
  if (want.length) { say(`[revetment] ⛔ ${look}: its manifest names revetment.json but not ${want.join(', ')} — the far shore was never baked for this slab, and no shore is drawn. ▶ run the Bake's revetment-far step for ${look} (node cartograph/bake-revetment-far.js --look=${look} --scene=<its scene>) and publish the slab`); return null }
  try {
    const [j, b] = await Promise.all([fetchFile('revetment-far.json'), fetchFile('revetment-far.bin')])
    if (!j.ok || !b.ok) throw new Error(`HTTP ${j.status} / ${b.status}`)
    return { far: await j.json(), bins: { 'revetment-far.bin': await b.arrayBuffer() } }
  } catch (e) { say(`[revetment] ⛔ ${look}: its far shore FAILED to load — ${e?.message || e}. No shore is drawn.`); return null }
}
/** A baked chunk's box [x0, y0, z0, x1, y1, z1] over exaggerations eLo…eHi. Its stored box is [x0, z0, x1, z1, rel0, rel1, raw0,
 *  raw1]: each vertex is lifted to rel + raw × exag (the ground-relative part and the drawn raw, as patchTerrain draws it), so
 *  at exag e it lies within rel0…rel1 plus raw0·e…raw1·e. ⭐ ONE FUNCTION for what is drawn and what is chosen: three's culling
 *  (eLo 0 … eHi the town's ceiling) and the overhead selection (eLo = eHi = the live exaggeration). */
export function chunkBox(box, eLo, eHi) {
  const [x0, z0, x1, z1, rel0, rel1, raw0, raw1] = box
  const lo = Math.min(raw0 * eLo, raw0 * eHi, raw1 * eLo, raw1 * eHi), hi = Math.max(raw0 * eLo, raw0 * eHi, raw1 * eLo, raw1 * eHi)
  return [x0, rel0 + lo, z0, x1, rel1 + hi, z1]
}
/** The never-seen chunks' bin, after the reveal. ⛔ Its failure is said: those chunks stay undrawn, by name. */
export async function loadRevetmentFarUnseen(look, { fetchFile, say }) {
  try { const b = await fetchFile('revetment-far-unseen.bin'); if (!b.ok) throw new Error(`HTTP ${b.status}`); return await b.arrayBuffer() }
  catch (e) { say(`[revetment] ⛔ ${look}: revetment-far-unseen.bin FAILED to load — ${e?.message || e}. The shore the movie never sees stays undrawn.`); return null }
}

/**
 * ⭐ THE TOE RESTS ON THE BED (Jacob, 2026-09-27, looking at the clear shallows: "the rocks need to extend further
 * into the water … the harsh cutoff on the bottom"). The heap was built to a toe AT the water surface, when the water
 * was an opaque sheet over a flat bottom; now the shallows are clear and the bottom is a sloping bed, so the stone
 * visibly stopped at the waterline. A dumped heap runs on down at its angle of repose until it lands on the bottom.
 * Per station: walk the face on below the water (u > 1, the same slope) until it meets the ground under it, or until
 * it is deeper than the bottom can be seen (`floorM`, the town's visibility depth) — past that nothing shows.
 * Returns toeAt(t) ≥ 1, the face parameter of the toe (1 = the waterline), interpolated along the face like its crest.
 * ⭐ Two halves (BRIEF-the-far-shore, 2026-10-29): the WALK (toeStations, which reads the ground: 493 ms at mount on
 * provincetown) and the INTERPOLATION (toeAlong). The far bake runs the walk and ships its per-station toe in full
 * doubles; the player reads it back through toeFromBaked, which is the same interpolation, so the two cannot drift.
 */
export function toeFor(face, groundAt, floorM, waterY = 0) {
  const toe = toeStations(face, groundAt, floorM, waterY)
  return toe ? toeAlong(face, toe) : () => 1
}
/** The baked toe (revetment-far.json, one per station, full doubles) read back as toeAt(t): toeFor's own interpolation. */
export function toeFromBaked(face, toe) {
  if (!Array.isArray(toe) || toe.length !== face.stations.length) throw new Error(`revetmentFromSlab: face ${face.key}'s baked toe has ${toe?.length} stations, the face ${face.stations.length} — re-bake revetment-far`)
  return toeAlong(face, toe)
}
/** toeFor's WALK: per station, the face parameter of the toe (≥ 1), or null when there is no bed to walk to (no floor,
 *  no ground, fewer than two stations: toeAt is then 1 everywhere). */
export function toeStations(face, groundAt, floorM, waterY = 0) {
  // With a toe berm the slope comes down onto the berm's TOP (the bed plus `stonesHigh` of its stones, but never above
  // the water — a toe berm is submerged), so the heap and its berm are one continuous shape; without one, onto the bed.
  const bermH = (h) => (face.toeBerm ? face.toeBerm.stonesHigh * d50For(h) : 0)
  const st = face.stations, n = st.length
  if (!(floorM > 0) || typeof groundAt !== 'function' || n < 2) return null
  const cum = stationArc(st)
  const total = cum[n - 1] || 1, tan = face.tanRepose
  const toe = new Float64Array(n).fill(1)
  for (let i = 0; i < n; i++) {
    const h = face.crestAt(cum[i] / total)
    if (!(h >= MIN_ARMOUR_D50_M)) continue           // no stone below one course of armour, so no toe to find
    const a = st[Math.max(0, i - 1)], b = st[Math.min(n - 1, i + 1)], L = Math.hypot(b.x - a.x, b.z - a.z) || 1
    const nx = (b.z - a.z) / L, nz = -(b.x - a.x) / L          // the face's waterward normal, as the drape builds it
    // ⛔ BOUNDED: at most 200 steps down the face. A near-zero crest (a heap's end) made uMax enormous and the walk
    // hung the page before the ground loaded (Jacob, 2026-09-27: "everything flooded with flat blue").
    const run = h / tan, uMax = 1 + floorM / h, du = Math.max((uMax - 1) / 200, Math.min(0.05, 0.5 / run))
    let u = 1
    while (u < uMax) {
      const un = u + du, x = st[i].x + nx * un * run, z = st[i].z + nz * un * run, y = waterY + h * (1 - un)
      if (y <= (face.toeBerm ? Math.min(waterY, groundAt(x, z) + bermH(h)) : groundAt(x, z))) break
      u = un
    }
    toe[i] = u
  }
  return toe
}
const stationArc = (st) => { const cum = new Float64Array(st.length)
  for (let i = 1; i < st.length; i++) cum[i] = cum[i - 1] + Math.hypot(st[i].x - st[i - 1].x, st[i].z - st[i - 1].z)
  return cum }
/** toeFor's INTERPOLATION, over the face's own arc length: the one copy, for the walk's result and the baked one alike. */
function toeAlong(face, toe) {
  const cum = stationArc(face.stations), n = cum.length, total = cum[n - 1] || 1
  return (t) => {
    const s = Math.max(0, Math.min(1, t)) * total
    let i = 1; while (i < n - 1 && cum[i] < s) i++
    const f = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1])
    return toe[i - 1] + (toe[i] - toe[i - 1]) * Math.max(0, Math.min(1, f))
  }
}
