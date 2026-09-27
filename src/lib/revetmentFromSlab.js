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
  return { crestAt: (t) => eval_(t)[0], taperAt: (t) => eval_(t)[1], ends }
}

/**
 * @param doc the parsed `baked/<look>/revetment.json`
 * @returns [{ key, arcIndex, face, poly:[{x,z}], crestAt, taperAt, ends, lengthM, armouredM, anyArmour }]
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
      const { crestAt, taperAt, ends } = crestAndEnds(st, cum, total, tanRepose)
      out.push({
        key: `${arc.index}:${face}`,
        arcIndex: arc.index,
        face,
        poly: st.map(s => ({ x: s.x, z: s.z })),
        stations: st,
        crestAt,
        taperAt,
        ends,
        tanRepose,
        toeBerm: doc.material?.toeBerm ?? null,
        lengthM: total,
        armouredM: arc.armouredM ?? 0,
        anyArmour: st.some(s => s.armour),
      })
    }
  }
  return out
}

/**
 * ⭐⭐ IS THIS TOWN'S REVETMENT ABSENT, OR DID THE LOAD FAIL? THEY ARE NOT THE SAME, AND
 * THE DEV SERVER CANNOT TELL THEM APART — so this returns which of THREE states it is,
 * never a boolean, and never silence.
 *
 * ⛔ THE HOLE THIS CLOSES (Marram, 2026-09-24). `bake-revetment` writes nothing for a town
 * with no shoreline, so a 404 is NORMAL and most towns give one. But vite serves its HTML
 * index with **status 200** for a missing file, so in dev:
 *   · `status === 404` is never true — the "absent is normal" branch NEVER RAN
 *   · `r.ok` is true, `r.json()` throws on HTML, and the LOUD branch fired on the
 *     ordinary case, logging "FAILED to load" for every town that simply has no coast
 * Both branches were inverted, and the direction matters: a real load failure became
 * indistinguishable from a normal absence. ⛔ That is Layer 0's second question failing
 * inside the one place it must not — the thing that decides whether to draw a shore.
 *
 * ⛔ AND THE FIX IS NOT "ALSO TREAT A PARSE ERROR AS ABSENT." That swallows a genuinely
 * corrupt artifact, which is the same bug with a wider mouth. The decidable fact is that a
 * JSON artifact must come back AS JSON: if the body is HTML, the response is not the
 * artifact at all, whatever its status says.
 *
 * ⭐ SO ABSENCE IS THREE-STATE, the same shape `intake-rows.mjs` already uses for an input
 * well — present / verified-absent / unverifiable. A server that answers 200-HTML for a
 * missing file cannot VERIFY absence, and saying "no revetment" on its word would be a
 * guess wearing a fact's clothes. It reports `unverifiable` and the caller says so out loud.
 *
 * @returns {'present'|'absent'|'unverifiable'|'failed'}
 */
export function revetmentResponseKind(status, contentType) {
  const ct = String(contentType || '').toLowerCase()
  if (status === 404) return 'absent'                 // the server knows, and said so
  if (status < 200 || status >= 300) return 'failed'  // loud — never a silent no-coast
  if (ct.includes('json')) return 'present'
  // 2xx that is not JSON. In dev this is vite's index.html standing in for a missing
  // file; in production it is a misconfigured server. ⛔ Either way it is NOT the
  // artifact, and either way absence is a GUESS here — so it is not claimed.
  return 'unverifiable'
}

/**
 * ⭐ THE TOE RESTS ON THE BED (Jacob, 2026-09-27, looking at the clear shallows: "the rocks need to extend further
 * into the water … the harsh cutoff on the bottom"). The heap was built to a toe AT the water surface, when the water
 * was an opaque sheet over a flat bottom; now the shallows are clear and the bottom is a sloping bed, so the stone
 * visibly stopped at the waterline. A dumped heap runs on down at its angle of repose until it lands on the bottom.
 * Per station: walk the face on below the water (u > 1, the same slope) until it meets the ground under it, or until
 * it is deeper than the bottom can be seen (`floorM`, the town's visibility depth) — past that nothing shows.
 * Returns toeAt(t) ≥ 1, the face parameter of the toe (1 = the waterline), interpolated along the face like its crest.
 */
export function toeFor(face, groundAt, floorM, waterY = 0) {
  // With a toe berm the slope comes down onto the berm's TOP (the bed plus `stonesHigh` of its stones, but never above
  // the water — a toe berm is submerged), so the heap and its berm are one continuous shape; without one, onto the bed.
  const bermH = (h) => (face.toeBerm ? face.toeBerm.stonesHigh * d50For(h) : 0)
  const st = face.stations, n = st.length
  if (!(floorM > 0) || typeof groundAt !== 'function' || n < 2) return () => 1
  const cum = new Float64Array(n)
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(st[i].x - st[i - 1].x, st[i].z - st[i - 1].z)
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
  return (t) => {
    const s = Math.max(0, Math.min(1, t)) * total
    let i = 1; while (i < n - 1 && cum[i] < s) i++
    const f = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1])
    return toe[i - 1] + (toe[i] - toe[i - 1]) * Math.max(0, Math.min(1, f))
  }
}
