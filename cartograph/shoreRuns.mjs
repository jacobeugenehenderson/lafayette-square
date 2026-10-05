/**
 * shoreRuns.mjs — the shoreline as the slab stores it: every `__water__` run in
 * shape.json, deduped. One reader for every bake that needs the coast.
 *
 * A run appears on every tile that shares it, so runs are deduped by their WHOLE
 * polyline (either direction), never by tile index — the live pass and the frozen
 * artifact number tiles differently.
 * ▶ node checks/claims-coast-distance-is-the-coast.mjs
 */
export const WATER_EDGE_SKEL = '__water__'   // tileGround.js's id for the stroked coast

/** @returns {Array<Array<[number, number]>>} one polyline per distinct run */
export function waterRuns(shape) {
  const seen = new Set(), out = []
  for (const t of (shape?.tiles || [])) for (const r of (t.runs || [])) {
    if (r.skelId !== WATER_EDGE_SKEL || !Array.isArray(r.poly) || r.poly.length < 2) continue
    const fwd = JSON.stringify(r.poly), rev = JSON.stringify([...r.poly].reverse())
    const k = fwd < rev ? fwd : rev
    if (!seen.has(k)) { seen.add(k); out.push(r.poly.map(p => [p[0], p[1]])) }
  }
  return out
}

// ── Shared by every bake that walks the shore (bake-revetment, bake-shore-median); moved here from bake-revetment.js
// 2026-10-04 so a second walker reads the shore the same way without inheriting the revetment's own inputs. ──

/** Walk a polyline at a fixed step. ⛔ NOT optional after `simplify`. */
export function resample(pts, step) {
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
