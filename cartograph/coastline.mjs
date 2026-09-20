/**
 * coastline.mjs — THE COAST, AS A CLOSED RING, FOR ① TO EXCLUDE FROM THE bb.
 *
 * ⭐⭐⭐ (Jacob, 2026-09-20) "it is both; we see the difference between land and water, and
 * the geometry creates the water field and on the other side (land-ward side) closes the
 * rest of the LU polygons, especially the dead-ends."
 *
 * ⇒ The coast is COMBINED with the street ink and EXCLUDED from the bb in one move, so the
 * land faces come out bounded by the coast and the water comes out as a discrete positive
 * object to be shaded.
 *
 * ⭐⭐⭐ AND THE SHORELINE IS ALSO STROKED AS A TWO-SIDED CHAIN (Jacob, 2026-09-20): "the lake is
 * a discrete polygon made of shoreline and bb. The OTHER SIDE of the shoreline isn't necessarily
 * a continuous ring; it is separate, via the protopoly, from the lake."
 * ⇒ TWO objects, not one. The closed RING is the lake face (shoreline + bb). The open ARC is ink
 * — expanded at ε like any chain, so the landward boundary is the protopoly's own edge, ε off the
 * water, carrying a per-vertex `left`/`right` stamp. That articulation is what a slipway T's into,
 * exactly as a street T's into a street; without it the coast is one anonymous clip edge and
 * nothing can meet it.
 * ⛔ THE EARLIER "NOT STROKED" RULING WAS MEASURED ON THE CLOSED RING and stands for it (square →
 * filled, circle → annulus, Lake Erie → 3 pieces). Its own wording names the safe case — "the
 * stroke is only safe for OPEN polylines" — and `clipToRect` already yields exactly that: the
 * single longest run inside the bb, both ends ON the bb edge. ⇒ We stroke the ARC, never the ring.
 *
 * ⛔ THIS IS NOT THE DISC AND MUST NEVER BECOME IT. `RIBBONS §1` forbids the *circle* from
 * deciding block geometry because the circle is a render knob. A shoreline is ground truth
 * (`H-4`), so it closes faces — and the circle still stamps LAST, over the result, and the
 * radius remains the SSoT. An earlier attempt carved the disc up front and wrote the result
 * beside the radius; that inverted which one was the source of truth and is why this module
 * produces geometry and writes nothing.
 *
 * ⭐ WHAT THIS FILE IS NOT, because each was tried and measured: not a far-field closure (the
 * bb closes the arc, so no invented constant survives into the result), not a chain stroke
 * (fragments on a closed ring), and not a replacement boundary (that inverted the SSoT).
 */

/** ⭐ One definition of "this feature is water", so no two callers disagree. */
export const isWaterFeature = (f) => {
  const t = f?.tags || {}
  return t.natural === 'water' || t.natural === 'coastline' || !!t.water ||
         t.waterway === 'riverbank' || t.landuse === 'reservoir'
}

/**
 * ⭐⭐⭐ THE BB CLOSES THE COAST. Jacob, 2026-09-20: "the water should go to the edge of the
 * bb just like the roads and everything else."
 *
 * ⛔ WHY NOT THE INK FRAME, measured on Huron and it is decisive: `grown` is the bbox of all
 * ink, and Overpass returns WHOLE ways, so highway tails push it to ~20 km — while Erie's
 * fetched arc spans 13 km. The coast cannot reach that frame, and extending it along its end
 * tangents to get there drives it straight through land. (Tried: both frame-touching faces
 * came out carrying street ink, so the water could not be told from the exterior.)
 * ⭐ THE BB IS THE RIGHT RECTANGLE AND IT FITS: Huron's is a clean 9.9 km square and BOTH coast
 * endpoints lie outside it, so the arc genuinely crosses. The bb is also the honest bound —
 * it is the frozen data extent, not a render knob, so closing against it is not the circle
 * deciding geometry by another name.
 *
 * ⛔ WHICH SIDE: the disc centre is LAND — you do not pour a neighborhood in a lake. Water is
 * the side of the closed ring that does not contain it. Verified by the caller against the
 * buildings, which are on land by construction.
 */
const onRect = (p, R, e = 1e-6) =>
  Math.abs(p[0] - R.x0) < e || Math.abs(p[0] - R.x1) < e ||
  Math.abs(p[1] - R.z0) < e || Math.abs(p[1] - R.z1) < e
const inRect = (p, R) => p[0] >= R.x0 && p[0] <= R.x1 && p[1] >= R.z0 && p[1] <= R.z1

/** Where segment a→b crosses the rectangle edge, walking from inside to outside or back. */
function rectCross(a, b, R) {
  let best = null
  const cand = [
    [(R.x0 - a[0]) / (b[0] - a[0]), 'x0'], [(R.x1 - a[0]) / (b[0] - a[0]), 'x1'],
    [(R.z0 - a[1]) / (b[1] - a[1]), 'z0'], [(R.z1 - a[1]) / (b[1] - a[1]), 'z1'],
  ]
  for (const [t] of cand) {
    if (!(t >= 0 && t <= 1)) continue
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    if (p[0] < R.x0 - 1e-6 || p[0] > R.x1 + 1e-6 || p[1] < R.z0 - 1e-6 || p[1] > R.z1 + 1e-6) continue
    if (!best || t < best.t) best = { t, p }
  }
  return best?.p || null
}

/** The rectangle's four corners, walked from `from` to `to` in one of the two directions. */
function rectWalk(from, to, R, dir) {
  // parametrise the perimeter clockwise from the top-left
  const per = (p) => {
    if (Math.abs(p[1] - R.z0) < 1e-6) return (p[0] - R.x0)
    if (Math.abs(p[0] - R.x1) < 1e-6) return (R.x1 - R.x0) + (p[1] - R.z0)
    if (Math.abs(p[1] - R.z1) < 1e-6) return (R.x1 - R.x0) + (R.z1 - R.z0) + (R.x1 - p[0])
    return 2 * (R.x1 - R.x0) + (R.z1 - R.z0) + (R.z1 - p[1])
  }
  const L = 2 * ((R.x1 - R.x0) + (R.z1 - R.z0))
  const at = (u) => {
    u = ((u % L) + L) % L
    const w = R.x1 - R.x0, h = R.z1 - R.z0
    if (u <= w) return [R.x0 + u, R.z0]
    if (u <= w + h) return [R.x1, R.z0 + (u - w)]
    if (u <= 2 * w + h) return [R.x1 - (u - w - h), R.z1]
    return [R.x0, R.z1 - (u - 2 * w - h)]
  }
  const u0 = per(from), u1 = per(to)
  const span = dir > 0 ? ((u1 - u0) + L) % L : -(((u0 - u1) + L) % L)
  const out = []
  const steps = Math.max(2, Math.ceil(Math.abs(span) / 25))
  for (let i = 1; i < steps; i++) out.push(at(u0 + span * (i / steps)))
  out.push(at(u1))
  return out
}

const pointInRing = (pt, r) => {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > pt[1]) !== (r[j][1] > pt[1]) &&
        pt[0] < (r[j][0] - r[i][0]) * (pt[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside
  }
  return inside
}

/** Clip an open arc to the rectangle, keeping the single longest inside run. */
function clipToRect(arc, R) {
  const runs = []
  let cur = null
  for (let i = 0; i < arc.length; i++) {
    const p = arc[i], ins = inRect(p, R)
    if (ins) {
      if (!cur) { cur = []; if (i > 0) { const x = rectCross(arc[i - 1], p, R); if (x) cur.push(x) } }
      cur.push(p)
    } else if (cur) {
      const x = rectCross(arc[i - 1], p, R); if (x) cur.push(x)
      runs.push(cur); cur = null
    }
  }
  if (cur) runs.push(cur)
  runs.sort((a, b) => b.length - a.length)
  return runs[0] || null
}

/**
 * @returns {{ rings: number[][][], arcs: number[][][], report: string[] }}
 *          `rings` — CLOSED water rings (shoreline + bb), combined with the ink and excluded from
 *          the bb by ①: the lake, as a discrete polygon.
 *          `arcs` — the OPEN shoreline polylines those rings were closed from, for ① to expand at
 *          ε as two-sided ink. ⛔ Same coast, two objects; a caller that takes one and not the
 *          other gets a lake with no landward edge, or a landward edge with no lake.
 */
export function coastRings({ ground = {}, buildings = [], center, discR, bb }) {
  const report = []
  const rings = []
  const arcs = []
  let interior = 0, held = 0, far = 0
  if (!Array.isArray(center) || !(discR > 0) || !bb) return { rings, arcs, report }
  const R = bb

  for (const cat of Object.keys(ground)) for (const f of ground[cat]) {
    if (!isWaterFeature(f)) continue
    const pts = (f.coords || []).map(c => [c.x ?? c[0], c.z ?? c[1]])
    if (pts.length < 2) continue
    const name = f.tags?.name || f.tags?.natural || `osm${f.osmId}`
    const d = pts.map(p => Math.hypot(p[0] - center[0], p[1] - center[1]))
    if (!d.some(v => v <= discR * 1.25)) { far++; continue }
    // ⭐⭐ ONLY WATER THAT GOES ON BEYOND WHAT WE FETCHED IS A COAST. A body held WHOLE is a
    // feature inside the map, not the edge of the land. ⛔ Not a size threshold — that would
    // be a skip list wearing a number. Huron: 3 of its 4 rim-crossing bodies are GOLF HAZARDS.
    if (!f.clipped) { if (d.every(v => v <= discR)) interior++; else held++; continue }

    const inside = clipToRect(pts, R)
    if (!inside || inside.length < 2) { report.push(`    ⛔ coast "${name}" does not cross the bb — not applied`); continue }
    const A = inside[0], B = inside[inside.length - 1]
    if (!onRect(A, R) || !onRect(B, R)) {
      // ⛔ An END INSIDE the bb means the fetch stops mid-water: the arc cannot divide the
      // square, and closing it would invent a coastline we never acquired.
      report.push(`    ⛔ coast "${name}" ENDS INSIDE the bb — the fetch stops mid-coast, so it cannot close. Not applied.`)
      continue
    }
    const cands = [+1, -1].map(dir => inside.concat(rectWalk(B, A, R, dir)))
    const water = cands.filter(r => !pointInRing(center, r))
    if (water.length !== 1) { report.push(`    ⛔ coast "${name}": the disc centre does not separate the two sides — not applied`); continue }
    rings.push(water[0])
    // ⭐ The ARC, not the ring — the open polyline ① expands at ε. Its two ends sit ON the bb
    // edge, so the ink it becomes is cut by the frame rather than stopping in mid-air.
    arcs.push(inside)
    report.push(`    coast "${name}" — ${inside.length} pts in the bb, closed on the bb edge → ${water[0].length}-pt water ring, combined with the ink and excluded from the bb`)
  }

  if (interior) report.push(`    ⚠️ ${interior} water bod${interior === 1 ? 'y lies' : 'ies lie'} wholly inside the disc — a pond is not a coast, not applied`)
  if (held) report.push(`    ⚠️ ${held} closed water bod${held === 1 ? 'y crosses' : 'ies cross'} the rim but ${held === 1 ? 'is' : 'are'} held WHOLE by the fetch — not an edge of the land, not applied`)
  if (!rings.length) { report.push(`    (no coastline — ① is the street network alone, as always)`); return { rings, arcs, report } }

  // ⛔ VERIFY THE SIDE. Buildings are on land; any inside a water ring means it is inverted.
  let wet = 0
  for (const b of buildings) {
    const p = (b.coords || [])[0]; if (!p) continue
    const q = [p.x ?? p[0], p.z ?? p[1]]
    if (rings.some(r => pointInRing(q, r))) wet++
  }
  if (wet) {
    report.push(`    ⛔ ${wet} building footprint(s) fall INSIDE the water — the land/water sides are inverted. No coast applied.`)
    return { rings: [], arcs: [], report }
  }
  report.push(`    ✅ ${rings.length} water ring(s) + ${arcs.length} shoreline arc(s) to expand as ink; ${buildings.length} footprint(s) checked, none in the water`)
  return { rings, arcs, report }
}
