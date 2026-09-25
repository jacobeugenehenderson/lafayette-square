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
 * @returns {{ rings: number[][][], arcs: number[][][], meta: object[], report: string[] }}
 *          `rings` — CLOSED water rings (shoreline + bb), combined with the ink and excluded from
 *          the bb by ①: the lake, as a discrete polygon.
 *          `meta`  — ⭐⭐ PARALLEL TO `rings`, pushed in the same statement: `{subtype, name}` off
 *          the feature's own tags. OSM refines `natural=water` with a `water=*` SUBTYPE and a
 *          pond is not a lake is not a settling basin — measured on huron, 18 of its bodies are
 *          `water=pond` against 2 `water=lake`. ⛔ A subtype discarded at bake time is
 *          unrecoverable without re-pouring every town, so it travels even though nothing
 *          consumes it yet. Cheap now, expensive forever later.
 *          `arcs` — the OPEN shoreline polylines those rings were closed from, for ① to expand at
 *          ε as two-sided ink. ⛔ Same coast, two objects; a caller that takes one and not the
 *          other gets a lake with no landward edge, or a landward edge with no lake.
 */
/**
 * ⭐⭐⭐ A SEA IS NOT A LAKE, AND OSM MODELS THEM DIFFERENTLY. THIS IS THAT DIFFERENCE.
 *
 * A LAKE is a closed polygon or relation, so a fetch that cannot close it inside the
 * envelope marks it `clipped` — that is Lake Erie, and it is why huron has water.
 * A SEA is the GLOBAL COASTLINE: `natural=coastline` OPEN WAYS, arbitrarily fragmented,
 * with no polygon anywhere and nothing to clip. ⛔ Provincetown fetches 26 such ways for
 * Cape Cod Bay and every one of them died at the `clipped` gate, so the whole 157 km² disc
 * baked as ONE land-use face called "beach".
 * ⇒ Weld the fragments into maximal chains first, and the sea arrives at the same door the
 * lake does.
 *
 * ⛔ WELDED BY SHARED ENDPOINT, NOT BY PROXIMITY. OSM ways that continue one another share
 * a NODE, so their endpoints are bit-identical after projection; joining anything merely
 * NEAR another end would bridge a river mouth or a harbour entrance and close water that
 * is genuinely open. The tolerance below exists for float noise, not for gaps.
 */
const WELD_EPS_M = 0.05

export function weldCoastlines(feats) {
  const key = (p) => `${Math.round(p[0] / WELD_EPS_M)},${Math.round(p[1] / WELD_EPS_M)}`
  const open = feats.map(f => ({ pts: (f.coords || []).map(c => [c.x ?? c[0], c.z ?? c[1]]), src: [f] }))
                    .filter(c => c.pts.length >= 2)
  let merged = true
  while (merged) {
    merged = false
    outer:
    for (let i = 0; i < open.length; i++) {
      for (let j = i + 1; j < open.length; j++) {
        const A = open[i], B = open[j]
        const a0 = key(A.pts[0]), a1 = key(A.pts[A.pts.length - 1])
        const b0 = key(B.pts[0]), b1 = key(B.pts[B.pts.length - 1])
        let joined = null
        if (a1 === b0) joined = A.pts.concat(B.pts.slice(1))
        else if (a1 === b1) joined = A.pts.concat([...B.pts].reverse().slice(1))
        else if (a0 === b1) joined = B.pts.concat(A.pts.slice(1))
        else if (a0 === b0) joined = [...B.pts].reverse().concat(A.pts.slice(1))
        if (!joined) continue
        // ⛔ Keep the SOURCES so the report can name what a chain was made of; a chain
        // that turns out wrong must be traceable to its ways.
        open[i] = { pts: joined, src: A.src.concat(B.src) }
        open.splice(j, 1)
        merged = true
        break outer
      }
    }
  }
  return open
}

/**
 * Maximal runs of consecutive vertices lying inside the rect, for a CLOSED ring.
 * ⭐ Cyclic: a run that spans the array seam is ONE run, not two. Provincetown's ring
 * starts mid-water, so a non-cyclic reader would split its longest arc in half and report
 * six runs where there are five.
 */
export function closedRunsInRect(pts, R) {
  const inside = (p) => p[0] >= R.x0 && p[0] <= R.x1 && p[1] >= R.z0 && p[1] <= R.z1
  const n = pts.length
  const flag = pts.map(inside)
  if (flag.every(Boolean)) return []          // wholly inside ⇒ nothing to clip
  if (!flag.some(Boolean)) return []          // wholly outside ⇒ nothing in frame
  // Start at a vertex that is OUTSIDE, so the first run cannot be a seam-split fragment.
  let s0 = flag.findIndex(v => !v)
  const runs = []
  let cur = null
  for (let k = 0; k < n; k++) {
    const i = (s0 + k) % n
    if (flag[i]) { (cur ??= []).push(pts[i]) }
    else if (cur) { runs.push(cur); cur = null }
  }
  if (cur) runs.push(cur)
  return runs
}

export function coastRings({ ground = {}, buildings = [], center, discR, bb }) {
  const report = []
  const rings = []
  const arcs = []
  const meta = []
  let interior = 0, held = 0, far = 0
  if (!Array.isArray(center) || !(discR > 0) || !bb) return { rings, arcs, meta, report }
  const R = bb

  // ⭐ Coastline ways are welded FIRST and enter as chains; every other water feature
  // enters as itself. One list, one loop, one set of rules — a sea must not get its own
  // code path or the two will drift and only one town will ever exercise each.
  const coastWays = [], others = []
  for (const cat of Object.keys(ground)) for (const f of ground[cat]) {
    if (!isWaterFeature(f)) continue
    if (f.tags?.natural === 'coastline') coastWays.push(f); else others.push(f)
  }
  const chains = weldCoastlines(coastWays)
  if (coastWays.length) {
    report.push(`    welded ${coastWays.length} natural=coastline way(s) → ${chains.length} chain(s)` +
                ` (longest ${Math.max(...chains.map(c => c.pts.length))} pts)`)
  }
  const candidates = [
    ...chains.map(c => ({
      __pts: c.pts,
      // ⭐ A welded chain IS clipped by construction when it leaves the envelope — see the
      // gate below, which now computes that rather than trusting a flag only the relation
      // path ever sets.
      tags: { natural: 'coastline', name: c.src[0]?.tags?.name || null },
      osmId: c.src[0]?.osmId, __src: c.src,
    })),
    ...others,
  ]
  for (const f of candidates) {
    const pts = f.__pts || (f.coords || []).map(c => [c.x ?? c[0], c.z ?? c[1]])
    if (pts.length < 2) continue
    const name = f.tags?.name || f.tags?.natural || `osm${f.osmId}`
    const d = pts.map(p => Math.hypot(p[0] - center[0], p[1] - center[1]))
    if (!d.some(v => v <= discR * 1.25)) { far++; continue }
    // ⭐⭐ ONLY WATER THAT GOES ON BEYOND WHAT WE FETCHED IS A COAST. A body held WHOLE is a
    // feature inside the map, not the edge of the land. ⛔ Not a size threshold — that would
    // be a skip list wearing a number. Huron: 3 of its 4 rim-crossing bodies are GOLF HAZARDS.
    // ⛔⛔ THIS GATE USED TO READ `if (!f.clipped)`, AND THAT IS WHY A SEA COULD NOT DRAW.
    // The INTENT is right and unchanged: only water that goes on BEYOND WHAT WE FETCHED is
    // a coast; a body held whole is a feature inside the map, not the edge of the land.
    // ⛔ But `clipped` is a flag the FETCH sets, and it only ever sets it on a RELATION ring
    // it could not close. An open `natural=coastline` way is never marked, so the ocean was
    // judged "held whole" — 26 ways, and Cape Cod Bay baked as land use.
    // ⭐⭐ SO THE GATE ASKS WHAT THE TAG MEANS, and `natural=coastline` means exactly one
    // thing: THIS IS THE LAND/WATER BOUNDARY. It is a fragment of a globally continuous
    // line by definition — there is no such thing as a coastline "held whole by the fetch"
    // — so it is always a coast and needs no flag. Everything else still needs `clipped`,
    // unchanged, so every relation that worked before works identically.
    //
    // ⛔ A FIRST CUT WIDENED THIS TO "any vertex outside the bb" AND IT WAS WRONG, caught
    // by diffing every town against HEAD rather than by testing the town I was fixing:
    // Overpass returns WHOLE ways, so a pond near the edge sticks out without being
    // truncated. huron gained a 281-pt pond and ALTADENA — an inland town with no coast at
    // all — gained Arroyo Seco and a 21-pt pond. ⇒ "sticks out of the frame" is not
    // "continues beyond the world", and conflating them made a stream into a sea.
    const leaves = f.clipped === true || f.tags?.natural === 'coastline'
    if (!leaves) { if (d.every(v => v <= discR)) interior++; else held++; continue }

    // ⭐⭐⭐ A WELDED COASTLINE CAN ARRIVE ALREADY CLOSED, AND THEN IT IS THE ANSWER.
    // Provincetown's 26 ways weld into ONE ring of 5,315 points: the coast wraps the whole
    // hook and meets itself inside the fetch. ⛔ Feeding that to `clipToRect` chops it to
    // "the longest run inside the bb" and closes THAT against the rectangle — which is not
    // the bay at all, and the buildings check caught it (22 footprints in the water).
    // ⭐ The machinery below is written for an OPEN arc, and says so; the canon's own
    // "we stroke the ARC, never the ring" assumes the coast arrives open. A closed chain is
    // functionally a LAKE ring, so it takes the lake's treatment: the ring IS the water
    // face, used whole, with no bb closure invented around it.
    // ⛔ WHICH SIDE IS WATER IS MEASURED, NOT ASSUMED — a closed coastline may enclose the
    // sea (a bay) or the land (an island), and OSM's land-on-the-left winding is a
    // convention this project has already been burned trusting. Buildings are ground truth:
    // MEASURED on Provincetown, the ring encloses 0 of 4,841 footprints, so its interior is
    // water. An island ring would enclose nearly all of them and is rejected here by name
    // rather than silently inverted.
    const closed = pts.length > 3 &&
      Math.abs(pts[0][0] - pts[pts.length - 1][0]) < WELD_EPS_M &&
      Math.abs(pts[0][1] - pts[pts.length - 1][1]) < WELD_EPS_M
    if (closed) {
      const bPts = buildings.map(b => { const q = (b.coords || [])[0]; return q ? [q.x ?? q[0], q.z ?? q[1]] : null }).filter(Boolean)
      const within = bPts.filter(q => pointInRing(q, pts)).length
      if (bPts.length && within > bPts.length * 0.5) {
        report.push(`    ⛔ closed coast "${name}" encloses ${within}/${bPts.length} buildings — that ring is LAND (an island), not water. Not applied.`)
        continue
      }
      if (within) {
        // ⚠️ A handful inside is a pier, a breakwater or a spit building, not an inversion.
        report.push(`    ⚠️ closed coast "${name}": ${within} footprint(s) sit inside the water ring — piers or spits, not an inversion`)
      }
      rings.push(pts)
      meta.push({ subtype: f.tags?.water || null, name: f.tags?.name || null })

      // ⭐⭐⭐ THE RING IS THE FACE; THE BB-CLIP OF IT IS THE INK. TWO OBJECTS FROM ONE CHAIN.
      // ⛔ The ring itself must never be stroked — measured, and the canon is explicit:
      // square → filled, circle → annulus, Erie → 3 pieces. But `clipToRect` yields OPEN
      // polylines, which is precisely the case the same ruling names as safe. So the closed
      // ring gives the water face, and its clipped runs give the two-sided shoreline ink ①
      // expands at ε. That is Jacob's H-4 wording — "the lake is a discrete polygon made of
      // shoreline and bb; the OTHER SIDE is separate, via the protopoly" — reaching a ring
      // that happens to close inside the frame.
      //
      // ⛔⛔ EVERY RUN, NOT THE LONGEST. Provincetown's ring yields FIVE maximal inside-runs:
      // 62,969 m · 55,145 m · 7,824 m · 104 m · 104 m. A "take the longest" rule — which is
      // what I first proposed — would have thrown away 55 km of shoreline, nearly half the
      // town's coast, and nothing would have said so.
      // ⭐ AND THE FLOOR IS THE ONE THIS FILE ALREADY USES: two points, the same test the
      // open path applies at `inside.length < 2`. ⛔ I nearly invented a metre threshold to
      // drop the two 104 m stubs — but they are real shoreline where the ring crosses the bb
      // corner and comes back, not noise, and a new constant would have been a taste
      // dressed as a rule.
      const runs = closedRunsInRect(pts, R)
      for (const run of runs) if (run.length >= 2) arcs.push(run)
      if (!runs.length) {
        // ⛔ A ring wholly inside the frame clips to NOTHING, so this shore gets a water face
        // and no ink at all: the land closes against the clip edge, which carries one owner
        // and no landward side. That is the island/small-lake case, it is survivable, and it
        // must be LOUD — ① prints the same refusal downstream and neither should be silent.
        report.push(`    ⛔ closed coast "${name}" lies WHOLLY INSIDE the bb — it clips to no arc, so this shore has a water face but NO two-sided ink. Nothing can T into it.`)
      }
      report.push(`    coast "${name}" — CLOSED chain of ${pts.length} pts used whole as the water face (${within} building(s) inside) → ${runs.length} clipped arc(s) as ink`)
      continue
    }

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
    // ⛔ SAME STATEMENT SITE AS THE RING IT DESCRIBES. The alignment is local and visible
    // here; recovering it later by index across a freeze boundary is the positional coupling
    // this project has already lost twice.
    meta.push({ subtype: f.tags?.water || null, name: f.tags?.name || null })
    // ⭐ The ARC, not the ring — the open polyline ① expands at ε. Its two ends sit ON the bb
    // edge, so the ink it becomes is cut by the frame rather than stopping in mid-air.
    arcs.push(inside)
    report.push(`    coast "${name}" — ${inside.length} pts in the bb, closed on the bb edge → ${water[0].length}-pt water ring, combined with the ink and excluded from the bb`)
  }

  if (interior) report.push(`    ⚠️ ${interior} water bod${interior === 1 ? 'y lies' : 'ies lie'} wholly inside the disc — a pond is not a coast, not applied`)
  if (held) report.push(`    ⚠️ ${held} closed water bod${held === 1 ? 'y crosses' : 'ies cross'} the rim but ${held === 1 ? 'is' : 'are'} held WHOLE by the fetch — not an edge of the land, not applied`)
  if (!rings.length) { report.push(`    (no coastline — ① is the street network alone, as always)`); return { rings, arcs, meta, report } }

  // ⛔ VERIFY THE SIDE. Buildings are on land; any inside a water ring means it is inverted.
  let wet = 0
  for (const b of buildings) {
    const p = (b.coords || [])[0]; if (!p) continue
    const q = [p.x ?? p[0], p.z ?? p[1]]
    if (rings.some(r => pointInRing(q, r))) wet++
  }
  if (wet) {
    report.push(`    ⛔ ${wet} building footprint(s) fall INSIDE the water — the land/water sides are inverted. No coast applied.`)
    return { rings: [], arcs: [], meta: [], report }
  }
  report.push(`    ✅ ${rings.length} water ring(s) + ${arcs.length} shoreline arc(s) to expand as ink; ${buildings.length} footprint(s) checked, none in the water`)
  return { rings, arcs, meta, report }
}
