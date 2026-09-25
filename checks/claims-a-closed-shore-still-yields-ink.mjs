// claims-a-closed-shore-still-yields-ink.mjs — DOES A SHORE THAT CLOSES STILL GET AN EDGE?
//
// ⭐⭐ THE INVARIANT: every water RING that leaves the frame must hand back at least one
// shoreline ARC. The ring is the water's face; the arcs are the two-sided ink ① expands so
// land can close against the shore. A ring with no arc is a water body with NO EDGE —
// the land runs to the clip rectangle, which carries one owner and no landward side.
//
// ⛔⛔ WHY THIS EXISTS. `coastline.mjs` has two producers and they read a shore differently:
//   · an OPEN chain (a lake's `clipped` boundary) — the arc IS the clipped run
//   · a CLOSED chain (an ocean coast, welded from `natural=coastline` fragments into a ring)
// The closed path used to `continue` before ever computing arcs, on the reasoning that a
// closed ring must not be stroked. ⭐ TRUE OF THE RING, FALSE OF ITS CLIP: `clipToRect` on a
// ring yields OPEN polylines, which is precisely the safe case. Provincetown poured a water
// face with **0 arcs** — and nothing anywhere said so, because a ring is a perfectly
// plausible-looking result. `bake-revetment` reads `__water__` runs and only those, so the
// whole shore silently had no revetment, no wet-sand band, nothing to T into.
//
// ⛔ AND THE TRAP THIS CHECK IS REALLY FOR: "take the longest run." Provincetown's ring
// yields FIVE maximal inside-runs; the two longest are 62,969 m and 55,145 m. A
// longest-wins rule loses half the town's coast and a coverage number beside it still
// reads fine. So the assertion is not "some ink" — it is **every** maximal run, counted
// against the ring's own crossings of the frame.
//
// ⭐ IT ASKS THE PRODUCER, never a baked artifact: a town can fail this before it has ever
// been baked, which is the only order that helps town #2.
//
// ⭐ MUTATION TEST — each of these must turn it RED:
//   1. in `coastline.mjs`, drop the `for (const run of runs)` push  → ring with no arc
//   2. keep only `runs[0]`, or sort-by-length and keep one          → fewer arcs than crossings
//   3. make `closedRunsInRect` non-cyclic (start at index 0)        → a seam-split extra run
//
//   node checks/claims-a-closed-shore-still-yields-ink.mjs                 # every town with OSM
//   node checks/claims-a-closed-shore-still-yields-ink.mjs provincetown    # just that one
// Read-only. Exits 1 if any town's water ring has no ink, or fewer arcs than the ring crosses out.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { coastRings, closedRunsInRect } from '../cartograph/coastline.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'cartograph', 'data')
const only = process.argv[2] || null
let failed = false, withWater = 0, checked = 0

const towns = readdirSync(DATA, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
  .filter(t => !only || t === only).sort()

for (const t of towns) {
  const dir = join(DATA, t)
  const osmP = join(dir, 'raw', 'osm.json'), geoP = join(dir, 'geography.json'), nbP = join(dir, 'neighborhood.json')
  if (![osmP, geoP, nbP].every(existsSync)) continue
  const osm = JSON.parse(readFileSync(osmP, 'utf8'))
  const geo = JSON.parse(readFileSync(geoP, 'utf8'))
  const nb = JSON.parse(readFileSync(nbP, 'utf8'))
  const bx = osm.bbox
  if (!bx || !(nb.radius > 0)) continue
  checked++

  // The same world transform `derive.js` builds its bb from — ⛔ not a re-derivation of it.
  const w2l = (lo, la) => [(lo - geo.lon) * geo.lonToMeters, -(la - geo.lat) * geo.latToMeters]
  const a = w2l(bx.minLon, bx.maxLat), b = w2l(bx.maxLon, bx.minLat)
  const bb = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) }

  const r = coastRings({ ground: osm.ground || {}, buildings: osm.buildings || [], center: [0, 0], discR: nb.radius, bb })
  const rings = r.rings || [], arcs = r.arcs || []
  if (!rings.length) { console.log(`  · ${t.padEnd(24)} no water — nothing to assert`); continue }
  withWater++

  // ⭐ THE EXPECTED ARC COUNT IS A PROPERTY OF THE GEOMETRY, NOT A NUMBER TYPED HERE.
  // Ask each ring how many maximal inside-runs it has; the producer must have emitted
  // that many.
  //
  // ⛔⛔ AND IT ONLY MEANS ANYTHING FOR A RING THAT STRADDLES THE FRAME. A ring that came
  // back from the OPEN path is already `clipToRect`'d — it lies wholly inside the bb by
  // construction, so this test reports 0 crossings for it and the count proves nothing.
  // ⭐ So a 0 here is NOT "expected zero arcs"; it is "this ring cannot be counted this
  // way," and it must not be printed beside the verdict as though it had been checked.
  // (Huron reads exactly this way, and an earlier cut of this check printed
  // `(expected 0)` next to a PASS — a number standing where an assertion should be, which
  // is the failure `claims-the-armoured-shore-is-never-empty` already shipped once.)
  let expect = 0, straddling = 0
  for (const ring of rings) {
    const first = ring[0], last = ring[ring.length - 1]
    const closed = ring.length > 2 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1
    if (!closed) continue
    const n = closedRunsInRect(ring, bb).length
    if (!n) continue                    // wholly inside the frame ⇒ not countable, not "zero"
    straddling++
    expect += n
  }

  // ⛔⛔ AND THIS ONE ASKS THE OUTPUT ALONE — no shared code with the producer.
  // The crossing count above imports `closedRunsInRect`, the SAME function the producer
  // splits with, so the two agree with themselves forever: a splitter that cut a run at
  // the array seam emitted 5 arcs, the check expected 5, and it passed GREEN on damage.
  //
  // ⭐ THE INDEPENDENT FACT: A RUN IS MAXIMAL BECAUSE THE FRAME CUT IT, SO ITS ENDS ARE AT
  // THE FRAME. An arc that ends in the open interior was cut by something else — an array
  // seam, an off-by-one, a length filter — and that end is an endpoint MINTED in open
  // water, a dead end the shore does not have (`clip mints endpoints`).
  // ⛔ AND THE TOLERANCE IS DERIVED FROM THE ARC, NOT A METRE CONSTANT: the last vertex
  // before the frame can be up to one step short of it, and coastline vertex spacing
  // varies by two orders of magnitude between towns and within one ring. A typed
  // threshold here would be a constant whose value happened to be right for Provincetown.
  //
  // ⚠️ AND IT IS A BOUND, NOT A TIGHT TEST — say so rather than overclaim. The true
  // tolerance is the step from the arc's last vertex to the NEXT RING vertex, the one
  // outside the frame; the arcs alone cannot see that vertex. The arc's own LONGEST step
  // is a sound upper bound on it (Provincetown: true step 75 m, endpoint-local step 51 m —
  // so the local step FAILS the correct output, which is how this check first went red on
  // a good producer; longest step 643 m, which passes it and still rejects the seam split
  // at 5,763 m). ⛔ A producer that emitted giant bogus steps would inflate its own
  // tolerance. That is a different defect and this check does not claim to catch it.
  //
  // ⚠️ WHAT THIS DELIBERATELY DOES **NOT** ASSERT: that two arcs never share an endpoint.
  // I wrote that first and it is FALSE. Provincetown's ring leaves the frame along a spit
  // and returns to its own neck — ring index 74 and index 208 are the same coordinate,
  // with 133 out-of-frame vertices between them — so two maximal runs meeting at a point
  // is real geometry, not a split. The distinguishing fact is WHERE the joint is, which is
  // why this measures distance to the frame and not coincidence between arcs.
  const strays = []
  for (let i = 0; i < arcs.length; i++) {
    const A = arcs[i]
    const dEdge = (p) => Math.min(p[0] - bb.x0, bb.x1 - p[0], p[1] - bb.z0, bb.z1 - p[1])
    let tol = 0
    for (let k = 1; k < A.length; k++) tol = Math.max(tol, Math.hypot(A[k][0] - A[k-1][0], A[k][1] - A[k-1][1]))
    for (const [end, pt] of [['start', A[0]], ['end', A[A.length - 1]]]) {
      const d = dEdge(pt)
      if (d > tol) strays.push({ i, end, pt, d, tol })
    }
  }

  const why = `${rings.length} ring(s) → ${arcs.length} arc(s)`
  if (!arcs.length) {
    console.error(`  ⛔ ${t.padEnd(24)} WATER WITH NO INK — ${why}. The land has nothing to close against; bake-revetment sees no __water__ run and the shore builds nothing.`)
    failed = true
  } else if (straddling && arcs.length < expect) {
    console.error(`  ⛔ ${t.padEnd(24)} INK LOST — ${why}, but its ring(s) cross the frame ${expect} time(s). ${expect - arcs.length} maximal run(s) were dropped; that is shoreline the town will silently not have.`)
    failed = true
  } else if (strays.length) {
    console.error(`  ⛔ ${t.padEnd(24)} INK CUT IN OPEN WATER — ${why}, but ${strays.length} arc end(s) do not reach the frame: ${strays.map(v => `#${v.i} ${v.end} at (${Math.round(v.pt[0])}, ${Math.round(v.pt[1])}) is ${Math.round(v.d)} m inside it, ${Math.round(v.tol)} m of local step`).join(' · ')}. A maximal run ends where the frame cut it; one that stops short was cut by something else, and that end is a MINTED ENDPOINT the shore does not have.`)
    failed = true
  } else {
    const m = arcs.map(A => { let L = 0; for (let i = 1; i < A.length; i++) L += Math.hypot(A[i][0] - A[i-1][0], A[i][1] - A[i-1][1]); return L })
    const crossed = straddling ? `, ${expect} frame-crossing(s) all emitted` : `, crossings not countable (pre-clipped ring) — only "has ink" asserted`
    console.log(`  ✅ ${t.padEnd(24)} ${why}${crossed} · ${Math.round(m.reduce((s, x) => s + x, 0)).toLocaleString()} m of ink, shortest ${Math.round(Math.min(...m))} m`)
  }
}

console.log(`\n${failed ? '⛔ RED' : '✅ GREEN'} — ${checked} town(s) with OSM, ${withWater} with water.`)
if (!withWater) console.warn('⚠️ NO TOWN HAS WATER — this check asserted nothing. That is not a pass.')
process.exit(failed ? 1 : 0)
