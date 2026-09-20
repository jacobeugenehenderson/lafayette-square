/**
 * landBoundary.mjs — THE LAND STOPS AT THE WATER.
 *
 * ⭐⭐⭐ THE RULING THIS BUILDS (Jacob, 2026-09-19): "water doesn't matter; it's the
 * shoreline." We are NOT drawing water. The lake does not need to render. The LAND
 * needs to STOP. So this does not add a water layer, a colour or an owner class — it
 * subtracts the water from the boundary the disc already is, and everything
 * downstream keeps working on a boundary exactly as before, only a different shape.
 *
 * `ORIENTATION`: "the rim is an EDGE OF THE DRAWING, never an absence." A shoreline is
 * the same kind of edge. Shore edges come out carrying `__boundary__` like every other
 * rim edge, resolve to no measure, `depthAt` → 0, land-use floods to them, and no curb
 * is built on them — which is already the ruled behaviour at the map edge.
 *
 * ── WHY LAND COMES OUT SIMPLE, AND WHERE IT DOES NOT ────────────────────────────
 * A shoreline that CROSSES THE RIM cuts the disc into land and water, both touching
 * the rim ⇒ land is a SIMPLE CONCAVE POLYGON. No hole. That is the case this handles,
 * and it is the case the ruling is about.
 * ⛔ A water body wholly INSIDE the disc (a pond) would make land a polygon WITH A
 * HOLE, and `boundaryPolyXZ` is a flat [x,z] array that CANNOT EXPRESS ONE. This
 * refuses that case loudly rather than dropping the hole and drawing a pond as lawn.
 *
 * ── WHICH SIDE IS THE WATER ─────────────────────────────────────────────────────
 * ⛔ THE HARD QUESTION, AND IT IS NOT ANSWERABLE FROM THE ARC ALONE. A clipped
 * shoreline is an open curve; it has no interior. OSM's outer-ring winding would
 * answer it, but we hold 17 of Lake Erie's 1,223 members — the winding of a fragment
 * is not the winding of the ring, and betting on it is a guess that fails silently.
 *
 * ⭐ THE ANSWER IS STRUCTURAL, NOT STATISTICAL: THE DISC CENTRE IS LAND. The disc is
 * centred on the neighborhood, and you do not pour a neighborhood in a lake. So water
 * is the side that does NOT contain the centre. One rule, no threshold, no tag, and
 * true in any town.
 * ⛔ AND IT IS VERIFIED, not assumed: every building footprint must survive the carve.
 * A building in the water means the side was chosen wrong, and this refuses instead of
 * returning a plausible map. (Measured on Huron: 0 of 4,307 footprints over water.)
 */
import clipperLib from 'clipper-lib'
const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
const S = 100   // clipper integer scale, 1 cm

/**
 * ⭐ ONE DEFINITION OF "THIS IS WATER", exported so the carve and any probe cannot
 * drift apart into two answers about the same feature.
 */
export const WATER_TAGS = (f) => {
  const t = f?.tags || {}
  return t.natural === 'water' || t.natural === 'coastline' || !!t.water ||
         t.waterway === 'riverbank' || t.landuse === 'reservoir'
}

const toC = (p) => ({ X: Math.round((p[0] ?? p.x) * S), Y: Math.round((p[1] ?? p.z) * S) })
const fromC = (p) => [p.X / S, p.Y / S]
const xz = (p) => [p[0] ?? p.x, p[1] ?? p.z]

function ringArea(r) {
  let a = 0
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] }
  return a / 2
}
function pointInRing(pt, r) {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > pt[1]) !== (r[j][1] > pt[1]) &&
        pt[0] < (r[j][0] - r[i][0]) * (pt[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside
  }
  return inside
}
const segInt = (a, b, c, d) => {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b)
}

/**
 * Close an OPEN shoreline arc into the polygon covering the water side.
 * Both endpoints must lie outside the disc, so the closure can be made in the far
 * field where it cannot interfere with the part of the arc that matters.
 * Returns { poly, why } — poly null when it cannot be done safely.
 */
function closeArcToWaterSide(arc, center, discR) {
  const [cx, cz] = center
  const distC = (p) => Math.hypot(p[0] - cx, p[1] - cz)
  const E0 = arc[0], E1 = arc[arc.length - 1]
  if (distC(E0) <= discR || distC(E1) <= discR) {
    return { poly: null, why: `a shoreline endpoint lies INSIDE the disc (${distC(E0).toFixed(0)} m, ${distC(E1).toFixed(0)} m vs R ${discR}) — the arc does not span the disc, so the land/water split is undefined here` }
  }
  // Far field: beyond everything, so the closing sweep cannot cut the coast.
  let far = discR
  for (const p of arc) far = Math.max(far, distC(p))
  far *= 1.5
  const ang = (p) => Math.atan2(p[1] - cz, p[0] - cx)
  const a1 = ang(E1), a0 = ang(E0)
  const build = (dir) => {
    const path = arc.map(p => [p[0], p[1]])
    path.push([cx + far * Math.cos(a1), cz + far * Math.sin(a1)])
    let t = a1
    const span = dir > 0 ? ((a0 - a1) + 2 * Math.PI) % (2 * Math.PI) : -(((a1 - a0) + 2 * Math.PI) % (2 * Math.PI))
    const steps = Math.max(8, Math.ceil(Math.abs(span) / 0.05))
    for (let i = 1; i <= steps; i++) { t = a1 + span * (i / steps); path.push([cx + far * Math.cos(t), cz + far * Math.sin(t)]) }
    path.push([cx + far * Math.cos(a0), cz + far * Math.sin(a0)])
    return path
  }
  // ⛔ The closure must not cut the coastline. If it does, the far field was not far
  // enough or the coast doubles back — either way, refuse rather than carve a lie.
  const crosses = (poly) => {
    const n = arc.length
    for (let i = n; i + 1 < poly.length; i++)
      for (let j = 0; j + 1 < n - 1; j++)
        if (segInt(poly[i], poly[i + 1], arc[j], arc[j + 1])) return true
    return false
  }
  const cands = [build(+1), build(-1)]
  const ok = cands.filter(p => !crosses(p))
  if (!ok.length) return { poly: null, why: 'both closures of the shoreline cross the coastline itself' }
  // Water is the side WITHOUT the disc centre.
  const water = ok.filter(p => !pointInRing([cx, cz], p))
  if (water.length !== 1) {
    return { poly: null, why: `the disc centre is ${water.length === 0 ? 'inside BOTH candidate sides' : 'outside both'} — the centre-is-land rule cannot pick a water side` }
  }
  return { poly: water[0], why: null }
}

/**
 * Subtract water from the disc.
 * @returns {{ boundary:number[][]|null, carved:boolean, report:string[], refusal:string|null }}
 */
export function carveWaterFromBoundary({ discPoly, waterFeatures, center, discR, buildings = [] }) {
  const report = []
  const disc = discPoly.map(xz)
  const waters = []
  const interior = []
  const straddling = []

  for (const f of waterFeatures) {
    const arc = (f.coords || []).map(xz)
    if (arc.length < 3) continue
    const name = f.tags?.name || f.tags?.natural || f.tags?.water || `osm${f.osmId}`
    if (f.isClosed && !f.clipped) {
      // ⭐⭐ ONLY WATER THAT BOUNDS THE NEIGHBORHOOD IS CARVED, and that is the ruling,
      // not an optimisation: "water doesn't matter; it's the shoreline." A body must
      // CROSS THE RIM to be a boundary. A pond wholly inside the disc is a FEATURE —
      // it does not stop the land, and making it stop the land would be inventing an
      // edge the operator never asked for.
      const d = arc.map(p => Math.hypot(p[0] - center[0], p[1] - center[1]))
      const anyIn = d.some(v => v <= discR), allIn = d.every(v => v <= discR)
      if (!anyIn) continue                       // wholly outside — irrelevant, silently
      if (!allIn) {
        // ⭐⭐⭐ A CLOSED BODY STRADDLING THE RIM IS NOT A SHORELINE, AND THIS IS THE
        // DISTINCTION THE WHOLE MODULE TURNS ON. It is not about size — a threshold
        // here would be the skip list wearing a number. It is about whether the water
        // GOES ON BEYOND WHAT WE KNOW: a body that arrives `clipped` extends past the
        // fetch envelope, which is what "the edge of the world" means. A body we hold
        // ENTIRELY is a feature inside the map, and the rim already stops the land
        // there.
        // ⛔ Measured on Huron: three of the four rim-crossing bodies are GOLF COURSE
        // WATER HAZARDS. Carving them sliced 0.13 and 0.01 km² slivers of land off
        // between pond and rim and split the hood into 3 pieces. Lake Erie alone
        // carves clean. ⇒ Crossing the rim was the wrong test; being clipped is the
        // right one.
        straddling.push(name)
        continue
      }
      {
        // ⛔ NOT SILENT. It is not carved, and the reason is said out loud, because the
        // operator seeing an uncarved pond deserves to know it was a decision. Drawing
        // it is a different job (`ROADMAP H-8`) and is deliberately not this one.
        interior.push(name)
        continue
      }
      continue
    }
    // Open / clipped: a shoreline.
    const { poly, why } = closeArcToWaterSide(arc, center, discR)
    if (!poly) {
      return { boundary: null, carved: false, report,
        refusal: `"${name}" is an open shoreline this cannot resolve: ${why}.` }
    }
    waters.push(poly); report.push(`  ${name}: open shoreline (${arc.length} verts) closed on the far field and carved`)
  }

  if (straddling.length) {
    // ⛔ LOUD, because this is where a real boundary could hide. If a town's bounding
    // lake happens to fit inside the fetch envelope it lands here and the land will
    // NOT stop at it — that is a visible wrong and the operator is told, not left to
    // find it.
    report.push(`  ⚠️ ${straddling.length} CLOSED water bod${straddling.length === 1 ? 'y crosses' : 'ies cross'} the rim and ${straddling.length === 1 ? 'was' : 'were'} NOT carved — held whole by the fetch, so not an edge of the world: ${straddling.slice(0, 6).join(', ')}${straddling.length > 6 ? ` +${straddling.length - 6} more` : ''}`)
    report.push(`     ⛔ If one of those IS what bounds this town, the land will not stop at it. Check before trusting the boundary.`)
  }
  if (interior.length) {
    report.push(`  ⚠️ ${interior.length} water bod${interior.length === 1 ? 'y lies' : 'ies lie'} WHOLLY INSIDE the disc and ${interior.length === 1 ? 'was' : 'were'} NOT carved — a pond is not a boundary. Drawing them is H-8, not this: ${interior.slice(0, 6).join(', ')}${interior.length > 6 ? ` +${interior.length - 6} more` : ''}`)
  }
  if (!waters.length) return { boundary: null, carved: false, report, refusal: null }

  const c = new Clipper()
  c.AddPath(disc.map(toC), PolyType.ptSubject, true)
  for (const w of waters) c.AddPath(w.map(toC), PolyType.ptClip, true)
  const out = []
  c.Execute(ClipType.ctDifference, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  const rings = out.map(p => p.map(fromC)).filter(r => r.length > 2)
  if (!rings.length) {
    return { boundary: null, carved: false, report,
      refusal: 'the carve removed the ENTIRE disc — every part of this neighborhood reads as water. The water side was almost certainly chosen wrong.' }
  }
  // ⛔ One ring only. Several means the water split the hood into islands, and a flat
  // [x,z] boundary can carry exactly one of them — which would silently delete the rest.
  if (rings.length > 1) {
    const areas = rings.map(r => Math.abs(ringArea(r))).sort((a, b) => b - a)
    return { boundary: null, carved: false, report,
      refusal: `the carve split the land into ${rings.length} disconnected pieces (${areas.map(a => (a / 1e6).toFixed(2)).join(', ')} km²). boundaryPolyXZ holds ONE ring, so keeping the largest would silently delete the others.` }
  }
  const land = rings[0]

  // ⛔ THE VERIFICATION, AND IT IS THE REASON TO BELIEVE THE SIDE WAS RIGHT.
  // Buildings are on land. Any footprint outside the carved boundary but inside the
  // original disc means we removed land, not water.
  let lost = 0
  for (const b of buildings) {
    const p = xz((b.coords || [])[0] || [])
    if (!Number.isFinite(p[0])) continue
    if (Math.hypot(p[0] - center[0], p[1] - center[1]) > discR) continue
    if (!pointInRing(p, land)) lost++
  }
  if (lost) {
    return { boundary: null, carved: false, report,
      refusal: `${lost} building footprint(s) inside the disc fall OUTSIDE the carved land boundary. Buildings are on land by construction, so the water side was chosen wrong — refusing rather than returning a map with the town in the lake.` }
  }
  const area0 = Math.abs(ringArea(disc)), area1 = Math.abs(ringArea(land))
  report.push(`  land ${(area1 / 1e6).toFixed(2)} km² of ${(area0 / 1e6).toFixed(2)} km² disc — ${(100 * (1 - area1 / area0)).toFixed(1)}% carved as water; ${buildings.length} footprint(s) checked, 0 lost`)
  return { boundary: land, carved: true, report, refusal: null }
}
