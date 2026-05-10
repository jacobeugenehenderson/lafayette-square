// mergeLiveRibbons — overlays Survey/Measure store edits onto a baked
// ribbons artifact (toy-ribbons.json or src/data/ribbons.json).
//
// Static ribbons own structural data: chain points, IX positions, face
// rings, skelIds. The live store owns operator intent: measure values,
// caps, couplers, segmentMeasures, anchor, smooth, disabled. The V2
// Designer overlay merges the two before building geometry; the bake's
// V2 path reads ribbons.json which derive.js has already merged, so it
// skips this step.
//
// Returns a NEW ribbons object — does not mutate inputs. Streets that
// don't have a live counterpart pass through unchanged.

import { subdividePolyline } from '../cartograph/streetProfiles.js'

const pointsNearlyEqual = (a, b, eps = 0.5) =>
  a && b && Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps

export function mergeLiveRibbons(staticRibbons, liveCenterlines) {
  if (!staticRibbons) return staticRibbons
  if (!Array.isArray(liveCenterlines) || liveCenterlines.length === 0) {
    return staticRibbons
  }

  // Key live entries by id (skelId) first, name as fallback. Divided roads
  // emit multiple same-name chains; id keys keep edits from leaking across
  // sibling carriageways.
  const liveById = new Map()
  const liveByName = new Map()
  for (const cl of liveCenterlines) {
    if (!cl) continue
    if (cl.id) liveById.set(cl.id, cl)
    if (cl.name && !liveByName.has(cl.name)) liveByName.set(cl.name, cl)
  }
  const lookup = (st) =>
    (st.skelId && liveById.get(st.skelId)) || liveByName.get(st.name) || null

  const mergedStreets = (staticRibbons.streets || []).map(st => {
    const live = lookup(st)
    if (!live) return st
    const merged = { ...st }
    if (live.disabled) merged.disabled = true
    if (live.measure?.left && live.measure?.right) {
      merged.measure = {
        left: { ...live.measure.left },
        right: { ...live.measure.right },
        symmetric: live.measure.symmetric,
      }
    }
    if (live.couplers && live.couplers.length) merged.couplers = live.couplers
    if (live.segmentMeasures) merged.segmentMeasures = live.segmentMeasures
    if (live.smooth && live.smooth > 0) {
      merged.points = subdividePolyline(st.points, live.smooth)
    }
    if (live.anchor) merged.anchor = live.anchor
    if (live.capStart !== undefined || live.capEnd !== undefined) {
      // Caps apply only to the ribbon segment whose terminal actually
      // matches the centerline's terminal — prevents chain-split segments
      // from each growing a spurious cap at their interior junctions.
      const cLive = live.points
      const stFirst = st.points[0], stLast = st.points[st.points.length - 1]
      const cFirst = cLive && cLive[0]
      const cLast = cLive && cLive[cLive.length - 1]
      const applyStart = live.capStart !== undefined && pointsNearlyEqual(stFirst, cFirst)
      const applyEnd   = live.capEnd   !== undefined && pointsNearlyEqual(stLast,  cLast)
      if (applyStart || applyEnd) {
        merged.capEnds = {
          start: applyStart ? (live.capStart ?? null) : (st.capEnds?.start ?? null),
          end:   applyEnd   ? (live.capEnd   ?? null) : (st.capEnds?.end   ?? null),
        }
        // Mirror to the live-store-shape fields the V2 helper also reads.
        merged.capStart = merged.capEnds.start
        merged.capEnd   = merged.capEnds.end
      }
    }
    return merged
  })

  return {
    ...staticRibbons,
    streets: mergedStreets,
  }
}
