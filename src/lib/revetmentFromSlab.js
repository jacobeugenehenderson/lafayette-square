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

/** The side of the walk the builders extrude toward. ⛔ Not a preference — read off
 *  `revetmentDrape.js`'s station normal. If that changes, this must change with it
 *  and the check above goes red, which is the point. */
export const BUILD_SIDE = 'left'

/**
 * crestAt(t) over a face's stations, t in 0..1 by arc length.
 * ⛔ Where the predicate says BARE the crest reads ZERO, so the builders emit
 * nothing. A bare stretch is an ABSENCE of stone, not a shorter wall, and it must
 * not be smoothed across — otherwise a beach grows a tapering wall at each end.
 */
function crestFnFor(stations, cum, total) {
  const n = stations.length
  return (t) => {
    const tt = Math.min(1, Math.max(0, t))
    let lo = 0, hi = n - 1
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] / total <= tt) lo = mid; else hi = mid }
    const span = (cum[hi] - cum[lo]) / total || 1
    const f = (tt - cum[lo] / total) / span
    const cl = stations[lo].armour ? (stations[lo].crest || 0) : 0
    const ch = stations[hi].armour ? (stations[hi].crest || 0) : 0
    return Math.max(0, cl * (1 - f) + ch * f)
  }
}

/**
 * @param doc the parsed `baked/<look>/revetment.json`
 * @returns [{ key, arcIndex, face, poly:[{x,z}], crestAt, lengthM, armouredM, anyArmour }]
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
      out.push({
        key: `${arc.index}:${face}`,
        arcIndex: arc.index,
        face,
        poly: st.map(s => ({ x: s.x, z: s.z })),
        stations: st,
        crestAt: crestFnFor(st, cum, total),
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
