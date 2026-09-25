/**
 * bake-labels.js — bake per-scene street labels into the slab.
 *
 * The street NAMES are imported during intake (OSM `name` tags → skeleton →
 * ribbons); this bakes them into a scene artifact so the player reads its OWN
 * labels per-look, instead of the runtime recomputing them from a static
 * (LS-only) src/data/ribbons.json import. Retires the streetLabels.js
 * "deferred-to-producer" hardwire — every town gets its names for free.
 *
 * The bake slims to "gate + emit geometry": it no longer PLACES a single label
 * point per street. It emits each named street chain as a **hood-clipped
 * polyline** carrying the chain's `widthM`; the shared runtime layout module
 * (src/lib/streetLabels.js → SceneLabel) does the placement — repeat, size-law,
 * fit/abbreviate, and camera-distance LOD — so Designer + player never drift and
 * a long street reads labelled wherever you're actually looking. The boundary
 * gate stays here: each polyline is clipped to its in-hood portion(s) so the
 * runtime lays out on whatever geometry it's handed.
 *
 * Reads : cartograph/data/<scene>/clean/ribbons.json  (named street geometry)
 *         cartograph/data/<scene>/neighborhood_boundary.json  (the hood gate)
 * Writes: public/baked/<scene>/labels.json  → { version, count, labels: [
 *           { name, widthM, points:[[x,z]…] } ] }  — named polylines the runtime
 *           layout module consumes.
 *
 * Run: node cartograph/bake-labels.js --scene <id>
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeMembership } from './neighborhood-membership.mjs'
import { requireExplicitMap } from './scene.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ⛔ NO CLASS IS HIDDEN FROM LABELS. A named highway gets its name on the map
// like any street (Jacob, 2026-09-23: "not all our towns are going to be
// walkable. Walking is aspirational and optimal for us."). A class list stood
// here as a "labels encourage walking" rule — do not restore it. The one thing
// never labelled is a name the skeleton made up, and the street says so itself:
// `synthetic` (below). ▶ node checks/claims-no-label-is-a-made-up-name.mjs

function parseArgs() {
  const a = {}
  for (let i = 2; i < process.argv.length; i++) {
    const k = process.argv[i]
    if (!k.startsWith('--')) continue
    const eq = k.indexOf('=')
    if (eq >= 0) a[k.slice(2, eq)] = k.slice(eq + 1)             // --scene=x
    else { a[k.slice(2)] = process.argv[i + 1]; i++ }           // --scene x
  }
  return a
}

// Boundary crossing between an inside point and an outside point, found by
// bisecting the membership predicate (we only have isInside(), not the raw
// polygon — and membership is a composite of polygon ∪ activate − exclusions,
// so bisecting the predicate is the general clip). ~24 iterations ≈ sub-mm on a
// hood-scale segment.
function bisectBoundary(inX, inZ, outX, outZ, isInside) {
  let ax = inX, az = inZ, bx = outX, bz = outZ
  for (let i = 0; i < 24; i++) {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2
    if (isInside(mx, mz)) { ax = mx; az = mz } else { bx = mx; bz = mz }
  }
  return [ax, az]
}

// Clip a polyline to the in-hood portion(s) of the membership region. Returns an
// array of polylines (a chain can enter/exit the hood more than once). With no
// gate, the whole chain passes through as one piece. Boundary crossings are
// interpolated so a clipped piece ends exactly at the hood edge, not at the last
// interior vertex.
function clipToHood(points, isInside) {
  if (!isInside) return points.length >= 2 ? [points.map(p => [p[0], p[1]])] : []
  const pieces = []
  let cur = null
  let prev = null, prevIn = false
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const pIn = isInside(p[0], p[1])
    if (i === 0) {
      if (pIn) { cur = [[p[0], p[1]]] }
    } else {
      if (prevIn && pIn) {
        cur.push([p[0], p[1]])
      } else if (prevIn && !pIn) {
        cur.push(bisectBoundary(prev[0], prev[1], p[0], p[1], isInside))
        if (cur.length >= 2) pieces.push(cur)
        cur = null
      } else if (!prevIn && pIn) {
        cur = [bisectBoundary(p[0], p[1], prev[0], prev[1], isInside), [p[0], p[1]]]
      }
      // !prevIn && !pIn → the segment may still tunnel through a thin lobe of
      // the hood, but street segments are short relative to the hood; the
      // midpoint gate the previous bake used had the same blind spot. Skip.
    }
    prev = p; prevIn = pIn
  }
  if (cur && cur.length >= 2) pieces.push(cur)
  return pieces
}

// Emit each named street chain as hood-clipped polyline(s), carrying the chain's
// measured pavement width. Placement (repeat / size-law / fit / LOD) is the
// runtime layout module's job — the bake is now gate + geometry only.
const r2 = n => Math.round(n * 100) / 100
function computeLabels(ribbons, keepPoint) {
  const labels = []
  for (const st of ribbons.streets || []) {
    if (!st.name || !st.points || st.points.length < 2) continue
    // A name the skeleton made up (`primary 90`) is an id, not a place. The
    // skeleton says so on the street; this reads the flag, never a class list.
    if (st.synthetic) continue
    const m = st.measure || {}
    const widthM = (m.left?.pavementHW || 0) + (m.right?.pavementHW || 0) || null
    for (const piece of clipToHood(st.points, keepPoint)) {
      const pts = piece.map(([x, z]) => [r2(x), r2(z)])
      // Drop degenerate zero-length pieces (coincident points after rounding).
      let len = 0
      for (let i = 0; i < pts.length - 1; i++) len += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
      if (len === 0) continue
      labels.push({ name: st.name, widthM: widthM == null ? null : r2(widthM), points: pts })
    }
  }
  return labels
}

function main() {
  const args = parseArgs()
  // ⛔ Was: `args.scene || process.env.CARTOGRAPH_SCENE || 'lafayette-square'` — a
  // literal-LS fallback in a writer. One resolver now (scene.js), which reads the
  // --scene= flag AND CARTOGRAPH_SCENE, and refuses when neither names a scene.
  const scene = requireExplicitMap('bake-labels')
  const look = args.look || scene   // read from data/<scene>; write to baked/<look>
  // Poured scenes carry clean/ribbons.json; the legacy LS default scene keeps its
  // ribbons at src/data/ribbons.json (predates the per-scene convention).
  let ribbonsPath = join(ROOT, 'cartograph', 'data', scene, 'clean', 'ribbons.json')
  if (!existsSync(ribbonsPath)) ribbonsPath = join(ROOT, 'src', 'data', 'ribbons.json')
  const boundaryPath = join(ROOT, 'cartograph', 'data', scene, 'neighborhood_boundary.json')
  if (!existsSync(ribbonsPath)) { console.error(`[bake-labels] no ribbons for scene ${scene}`); process.exit(1) }
  const ribbons = JSON.parse(readFileSync(ribbonsPath, 'utf-8'))

  // Gate to the neighborhood proper (the SAME boundary trees + lamps test) —
  // replaces streetLabels.js's four hardcoded LS corridors with the generic hood.
  let keepPoint = null
  if (existsSync(boundaryPath)) {
    const m = makeMembership(boundaryPath)
    keepPoint = (x, z) => m.isInside(x, z)
  } else {
    console.warn('[bake-labels] no neighborhood_boundary.json — labelling ALL named streets (ungated)')
  }

  // ⛔ A ribbons.json from before the skeleton stamped `synthetic` would label
  // its made-up names. Spot one by the skeleton's own naming (`<highway> <n>`)
  // and stop — re-running skeleton.js is the fix, not a filter here.
  const unflagged = (ribbons.streets || []).filter(st =>
    !st.synthetic && st.highway && new RegExp(`^${st.highway} \\d+$`).test(st.name || ''))
  if (unflagged.length) {
    console.error(`[bake-labels] ⛔ ${unflagged.length} street(s) carry a skeleton-made name but no \`synthetic\` flag — ${scene}'s skeleton.json predates the \`synthetic\` stamp, and its ribbons inherit that:`)
    console.error(`  ${unflagged.slice(0, 6).map(st => st.name).join(' · ')}${unflagged.length > 6 ? ' …' : ''}`)
    console.error(`  ▶ Re-run skeleton.js --scene=${scene}, then pour (the Bake runs pipeline + promote-ribbons for every OSM town; it never re-runs skeleton.js). Nothing was written.`)
    process.exit(1)
  }
  const labels = computeLabels(ribbons, keepPoint)

  // ⛔⛔ THE STYLE TRAVELS WITH THE ARTIFACT, AND THIS IS A BUG FIX (2026-09-05).
  // Placement is computed at RUNTIME by labelLayout.js from two style fields —
  // `sizeK` and `letterSpacing` — and `useLabelPlacements` was reading both out
  // of the CARTOGRAPH STORE, which only Cartograph ever hydrates from
  // design.json. So the Designer laid out at the authored style and the player
  // laid out at store DEFAULTS. Measured on lafayette-square: sizeK 0.7 vs 1
  // (43% larger type) and letterSpacing 0.04 vs 0.05 — different sizes mean
  // different fit gating, different abbreviation and different repeat spacing,
  // so the rendered labels were not the ones the operator had approved.
  // ⚠️ useLabelPlacements.js asserted in its own header that the two "never
  // drift". They did, silently, because nothing compared them.
  // ⭐ So the two layout inputs are baked next to the geometry they lay out.
  // Doctrine: slab-is-the-contract — the runtime reads the artifact, never an
  // authoring store it does not fill.
  let style = {}
  try {
    const designPath = join(ROOT, 'public', 'looks', look, 'design.json')
    if (existsSync(designPath)) {
      const d = JSON.parse(readFileSync(designPath, 'utf-8'))
      const L = d.labels || {}
      // Only the fields that affect LAYOUT. Colour, weight, halo and case are
      // render-time and are read from the Look at draw; baking them here would
      // create a second source for them.
      if (L.sizeK != null) style.sizeK = L.sizeK
      if (L.letterSpacing != null) style.letterSpacing = L.letterSpacing
    }
  } catch (e) { console.warn('[bake-labels] design.json unreadable, baking Auto style:', e.message) }

  const outDir = join(ROOT, 'public', 'baked', look)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'labels.json')
  writeFileSync(outPath, JSON.stringify({ version: 3, scene, look, count: labels.length, style, labels }))
  console.log(`[bake-labels] scene=${scene} look=${look}: ${labels.length} street labels → ${outPath}`)
  console.log(`  layout style: ${JSON.stringify(style)}${Object.keys(style).length ? '' : '  (Auto — design.json set neither sizeK nor letterSpacing)'}`)
  if (labels.length) console.log('  e.g. ' + labels.slice(0, 8).map(l => l.name).join(' · '))
}
main()
