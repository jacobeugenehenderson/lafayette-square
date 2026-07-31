// spurOutline.js — ASSERT THE DEAD-END SPUR BEFORE POLYGONIZATION.
//
// ⭐ THE SEQUENCE IS THE WHOLE POINT (Jacob, 2026-07-30).
// The failure mode this replaces was: walk the centreline graph → get a ring with a
// zero-width slit in it → try to carve width back into the ring afterwards. That is
// post-processing a bad polygon, and every awkwardness (exceptions in the walk,
// "compensating" the asphalt) came from the wrong order.
//
// Instead: the spur is asserted as a OPEN U — down one curb, around
// the cap, back up the other curb — and THEN polygonization runs. The face walk finds
// no pendant edge anywhere, so it has nothing to double back over; the enclosing block
// simply closes AROUND a notch that already has width. Nothing is carved, and
// `extractFaces` needs no dead-end special case at all.
//
// ⚠️ IT IS NOT CLOSED BY THIS FILE, AND THAT IS THE FAILURE MODE. What is emitted is an
// OPEN U with a free end either side of the mouth. Those ends land on the through
// street's centreline, and the FACE WALK closes the notch — its fourth side is the
// stretch of through-centreline between the two landings. So closure is a property of
// the graph, not of the stroke. When a landing fails to splice, nothing closes the U: it
// floats inside the block instead of bounding it, and because asserting a spur also TRIMS
// ITS CENTRELINE AWAY, that street loses its road outright (south-jefferson-avenue-0/-8 —
// the 2026-06 pendant-prune failure exactly). Hence the detect-and-roll-back pass in
// derive.js: never trust the closure, verify it after the walk.
//
// ⭐ AND THE SECOND MOUTH CORNER FALLS OUT (POLYGON-FIRST §2.1 Check 5 — "the one that
// matters"). The two curbs do not rejoin the through street at one point; they land on
// it at TWO distinct points, road-width apart. Two genuine corners, one per side, so
// every leg is bounded corner→cap like any other leg on the map. The registry does not
// have to detect the corner — the construction creates it.
//
// ⭐ IDENTITY IS CARRIED THROUGH, NEVER RECOVERED (§C6). Every segment laid down here is
// emitted as its own face-street carrying the spur's `skelId`, so `extractFaces` tags the
// frozen edge from the stroke itself. Nothing downstream reads identity back off ring
// geometry — that is the anti-pattern that produced the retired walk-ordinal coupler.
//
// Doctrine: `PREBAKE §4.0` — "blocks = boundary − stroked roads". The road is SUBTRACTED;
// a spur's interior is ROAD, not a block. The notch face this emits is tagged `road: true`
// so the freeze can keep it out of the block list.
//
// ⛔ The 2026-06 pendant-prune (`28f88566`, reverted `dd4ddb6d`) deleted dead-end roads
// because asphalt is tile-sourced and it removed the tile. This is the OPPOSITE move — it
// gives the spur real width rather than deleting it — but the revert's render evidence is
// what must not regress: `scratch/spur-asphalt-truth.mjs`, 43 of 50 spurs render at full
// road width today.

const EPS = 1e-9

const norm = (vx, vz) => { const L = Math.hypot(vx, vz) || 1; return [vx / L, vz / L] }
const vkey = (p) => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4)

// Offset an open polyline by `d` on its measure-RIGHT side (the (-dz, dx) perp of the
// point-order tangent — the convention pinned at innerSideSign). Negative d = LEFT.
// Segments are offset independently then rejoined at the miter of consecutive offsets;
// a degenerate miter (near-reversal) falls back to the segment endpoint average.
export function offsetPolyline(pts, d) {
  if (pts.length < 2) return pts.map(p => [p[0], p[1]])
  const segs = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const [tx, tz] = norm(b[0] - a[0], b[1] - a[1])
    const nx = -tz * d, nz = tx * d
    segs.push([[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz]])
  }
  const out = [segs[0][0]]
  for (let i = 1; i < segs.length; i++) {
    const [p1, p2] = segs[i - 1], [p3, p4] = segs[i]
    const r = [p2[0] - p1[0], p2[1] - p1[1]]
    const s = [p4[0] - p3[0], p4[1] - p3[1]]
    const den = r[0] * s[1] - r[1] * s[0]
    if (Math.abs(den) < 1e-9) { out.push(p2); continue }        // collinear — keep the joint
    const t = ((p3[0] - p1[0]) * s[1] - (p3[1] - p1[1]) * s[0]) / den
    const x = [p1[0] + r[0] * t, p1[1] + r[1] * t]
    // A miter that shoots far past the joint means a near-reversal; clamp to the average.
    const lim = Math.abs(d) * 8 + 1
    out.push(Math.hypot(x[0] - p2[0], x[1] - p2[1]) > lim ? [(p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2] : x)
  }
  out.push(segs[segs.length - 1][1])
  return out
}

// ⭐ THE END COUPLER — the existing name for this thing (`SECTION §6.3`, Jacob 2026-07-22):
// "the cap is an end COUPLER, not a corner. Its two shoulders are corners in the
// LANE-SWITCH sense, not the bending sense." The ribbon folds, not the chain — it runs up
// one side of the spur and back down the other, and the coupler is what carries it round.
// "The bulb has no halves": ONE continuous semicircle carrying ONE cross-section — never
// split between the two legs (that split was built once and was wrong).
//
// ⚠️ OPEN DEFECT — this implementation averages the two radii, which the doctrine
// explicitly forbids: "a road may be authored with different pavementHW per side
// (Nicholson Place = left 2.50 m, right 6.70 m), so any dead-end detector keyed on 'both
// shoulders at the same radius' is WRONG BY CONSTRUCTION." Averaging silently symmetrises
// an asymmetric spur. It also does not taper DEPTH across the shoulders, which the coupler
// is required to do ("starts and ends with possibly different widths"). Both are owed
// before this ships; neither is addressed here.
export function endCoupler(tip, from, to, kind, steps = 8) {
  if (kind !== 'round') return []
  const r = (Math.hypot(from[0] - tip[0], from[1] - tip[1]) + Math.hypot(to[0] - tip[0], to[1] - tip[1])) / 2
  let a0 = Math.atan2(from[1] - tip[1], from[0] - tip[0])
  let a1 = Math.atan2(to[1] - tip[1], to[0] - tip[0])
  // sweep the SHORT way that passes over the tip's outward side
  let sweep = a1 - a0
  while (sweep <= -Math.PI) sweep += 2 * Math.PI
  while (sweep > Math.PI) sweep -= 2 * Math.PI
  const pts = []
  for (let i = 1; i < steps; i++) {
    const a = a0 + sweep * (i / steps)
    pts.push([tip[0] + Math.cos(a) * r, tip[1] + Math.sin(a) * r])
  }
  return pts
}

// Where does the curb line, extended, meet the geometry the spur hangs off?
// Returns the intersection nearest the mouth, or null.
// ⚠️ Returns the INDEX into incidentSegs, not a copy of the segment. Returning
// `[p3, p4]` built a fresh array, so the caller's identity test against the original
// never matched and the landing was never spliced into the through chain — leaving both
// curbs dangling and the spur absent from every face (the 2026-06 prune's failure mode,
// reproduced exactly).
function landOn(curbA, curbB, mouth, incidentSegs, reach) {
  const r = [curbB[0] - curbA[0], curbB[1] - curbA[1]]
  let best = null, bd = Infinity
  for (let si = 0; si < incidentSegs.length; si++) {
    const p3 = incidentSegs[si][0], p4 = incidentSegs[si][1]
    const s = [p4[0] - p3[0], p4[1] - p3[1]]
    const den = r[0] * s[1] - r[1] * s[0]
    if (Math.abs(den) < 1e-9) continue
    const t = ((p3[0] - curbA[0]) * s[1] - (p3[1] - curbA[1]) * s[0]) / den
    const u = ((p3[0] - curbA[0]) * r[1] - (p3[1] - curbA[1]) * r[0]) / den
    if (u < -EPS || u > 1 + EPS) continue                      // must land ON the segment
    const x = [curbA[0] + r[0] * t, curbA[1] + r[1] * t]
    const d = Math.hypot(x[0] - mouth[0], x[1] - mouth[1])
    if (d > reach) continue                                    // implausibly far — not this mouth
    if (d < bd) { bd = d; best = { pt: x, segIdx: si } }
  }
  return best
}

/**
 * Rewrite `faceStreets` so every dead-end spur is a width-bearing outline.
 *
 * @param faceStreets  the polylines about to be polygonized ({points, skelId, ...})
 * @param tips         [{ skelId, end, at }] — the dead ends, from junctionMap's
 *                     pendant-tip nodes. NOT re-derived here: the network is the source.
 * @param measureOf    skelId → { left:{pavementHW}, right:{pavementHW} }
 * @param capOf        (skelId, end) → 'round' | 'blunt' | 'none'
 * @returns { faceStreets, spurs, skipped }  — `spurs` records each asserted outline so the
 *          freeze can identify the notch face and tag it road.
 */
export function assertSpurOutlines(faceStreets, tips, measureOf, capOf) {
  const out = faceStreets.map(s => ({ ...s, points: s.points.map(p => [p[0], p[1]]) }))
  const spurs = [], skipped = []

  // Vertex degree over the polylines as they will actually be walked.
  const deg = new Map()
  for (const s of out) {
    const p = s.points
    for (let i = 0; i < p.length; i++) {
      const k = vkey(p[i])
      const inc = (i === 0 || i === p.length - 1) ? 1 : 2
      deg.set(k, (deg.get(k) || 0) + inc)
    }
  }

  for (const tip of tips) {
    const si = out.findIndex(s => (s.skelId || s.name) === tip.skelId)
    if (si < 0) { skipped.push({ ...tip, why: 'chain not in the face-walk input' }); continue }
    const s = out[si]
    const p = s.points
    const atStart = Math.hypot(p[0][0] - tip.at[0], p[0][1] - tip.at[1]) < 0.5
    const atEnd = Math.hypot(p[p.length - 1][0] - tip.at[0], p[p.length - 1][1] - tip.at[1]) < 0.5
    if (!atStart && !atEnd) { skipped.push({ ...tip, why: 'tip is not an endpoint of the walked polyline' }); continue }

    // Walk in from the tip to the first vertex the spur SHARES with other geometry —
    // that is the MOUTH. Degree ≥ 3 is not sufficient: a spur that ends in an L-corner
    // against one other street has degree 2 there (henrietta-place), and testing ≥3
    // walked straight past it to the far end and skipped the spur entirely.
    const shared = new Set()
    for (const q of out) {
      if (q === s) continue
      for (const v of q.points) shared.add(vkey(v))
    }
    const isMouth = (v) => (deg.get(vkey(v)) || 0) >= 3 || shared.has(vkey(v))
    let mi = -1
    if (atStart) { for (let i = 1; i < p.length; i++) if (isMouth(p[i])) { mi = i; break } }
    else { for (let i = p.length - 2; i >= 0; i--) if (isMouth(p[i])) { mi = i; break } }
    if (mi < 0) { skipped.push({ ...tip, why: 'chain touches nothing — isolated stub, no geometry to land on' }); continue }

    // The tail, in CHAIN POINT ORDER (so measure-right stays measure-right).
    const tail = atStart ? p.slice(0, mi + 1) : p.slice(mi)
    if (tail.length < 2) { skipped.push({ ...tip, why: 'tail shorter than one segment' }); continue }
    const m = measureOf(tip.skelId) || {}
    const hwR = m.right?.pavementHW || 0
    const hwL = m.left?.pavementHW || 0
    if (hwR <= 0.05 || hwL <= 0.05) { skipped.push({ ...tip, why: 'no pavement half-width on one side' }); continue }

    const rightLine = offsetPolyline(tail, hwR)
    const leftLine = offsetPolyline(tail, -hwL)
    // Index of the tip end / mouth end within the offset lines (they mirror `tail`).
    const tipIdx = atStart ? 0 : tail.length - 1
    const mouthIdx = atStart ? tail.length - 1 : 0
    const mouth = tail[mouthIdx]

    // Everything else incident at the mouth — including this chain's own continuation
    // past it (the 6 same-chain mouths, POLYGON-FIRST §2.1). The curbs land on THAT.
    const incident = []
    for (let k = 0; k < out.length; k++) {
      const q = out[k].points
      for (let i = 0; i < q.length - 1; i++) {
        const onTail = k === si && (atStart ? (i < mi) : (i >= mi))
        if (onTail) continue
        if (Math.hypot(q[i][0] - mouth[0], q[i][1] - mouth[1]) > 120 &&
            Math.hypot(q[i + 1][0] - mouth[0], q[i + 1][1] - mouth[1]) > 120) continue
        incident.push({ k, i, seg: [q[i], q[i + 1]] })
      }
    }
    const segsOnly = incident.map(x => x.seg)
    const reach = (hwL + hwR) * 6 + 4
    // The landing ray must run toward the MOUTH end of the curb, not the tip end.
    // `mouthIdx` is len-1 when the tip is at 'start' and 0 when it is at 'end' — these
    // were the wrong way round, which is harmless on a straight two-point tail (the
    // infinite line is the same) but aims the ray off the far end of any bent spur.
    const kL = atStart
      ? [leftLine[leftLine.length - 2], leftLine[leftLine.length - 1]]
      : [leftLine[1], leftLine[0]]
    const kR = atStart
      ? [rightLine[rightLine.length - 2], rightLine[rightLine.length - 1]]
      : [rightLine[1], rightLine[0]]
    const landL = landOn(kL[0], kL[1], mouth, segsOnly, reach)
    const landR = landOn(kR[0], kR[1], mouth, segsOnly, reach)
    if (!landL || !landR) { skipped.push({ ...tip, why: `curb does not reach the mouth geometry (${!landL ? 'left' : 'right'})` }); continue }

    // ⛔ The landings must stay on their own sides. Where a spur meets its cross street
    // very obliquely the two curbs can cross, which turns the outline inside out: the
    // "notch" then winds the wrong way and the surrounding BLOCK is what reads as road
    // (south-jefferson-avenue-8 came out as a 136,000 m² road face). Verify against the
    // tail's own tangent at the mouth and skip rather than emit an inverted spur.
    // measure-RIGHT is (-dz, dx) of the POINT-ORDER tangent, so the tangent has to be
    // taken in point order — not "outward from the mouth". `tail` runs tip→mouth when the
    // tip is at 'start' and mouth→tip when it is at 'end', so the two cases differ; using
    // one direction for both inverted the test on every 'end' tip and rejected 25 sound
    // spurs (simpson-place among them, already verified correct).
    const [mtx, mtz] = atStart
      ? norm(mouth[0] - tail[mouthIdx - 1][0], mouth[1] - tail[mouthIdx - 1][1])
      : norm(tail[mouthIdx + 1][0] - mouth[0], tail[mouthIdx + 1][1] - mouth[1])
    const sideOf = (q) => (-mtz) * (q[0] - mouth[0]) + mtx * (q[1] - mouth[1])   // >0 ⇒ measure-right
    if (!(sideOf(landR.pt) > 0 && sideOf(landL.pt) < 0)) {
      skipped.push({ ...tip, why: 'curb landings cross — oblique mouth would invert the outline' })
      continue
    }

    // Splice both landings into whichever polyline they hit, so the graph SHARES the
    // node — without that, the curbs dangle and no face closes around them. Locate the
    // insertion point by the segment's own endpoint arrays (stable under a prior splice
    // shifting indices), and reuse an existing vertex when the landing coincides with one.
    for (const L of [landL, landR]) {
      if (!L || L.segIdx == null) continue
      const hit = incident[L.segIdx]
      const q = out[hit.k].points
      let at = -1
      for (let i = 0; i < q.length - 1; i++) if (q[i] === hit.seg[0] && q[i + 1] === hit.seg[1]) { at = i; break }
      if (at < 0) continue
      if (Math.hypot(q[at][0] - L.pt[0], q[at][1] - L.pt[1]) < 1e-6) { L.pt = q[at]; continue }
      if (Math.hypot(q[at + 1][0] - L.pt[0], q[at + 1][1] - L.pt[1]) < 1e-6) { L.pt = q[at + 1]; continue }
      q.splice(at + 1, 0, L.pt)
    }

    // Rebuild the two curbs with the landing as their mouth-end vertex.
    const leftOut = leftLine.map(q => [q[0], q[1]])
    const rightOut = rightLine.map(q => [q[0], q[1]])
    leftOut[mouthIdx] = landL.pt
    rightOut[mouthIdx] = landR.pt

    // The cap, tip end of left → tip end of right.
    const cap = endCoupler(tail[tipIdx], leftOut[tipIdx], rightOut[tipIdx], capOf(tip.skelId, tip.end))
    const capLine = [leftOut[tipIdx], ...cap, rightOut[tipIdx]]

    // TRIM the centreline tail — its job is done, and leaving it in would re-create the
    // pendant the whole construction exists to remove.
    if (atStart) out[si].points = p.slice(mi)
    else out[si].points = p.slice(0, mi + 1)
    const dead = out[si].points.length < 2
    if (dead) out[si].points = []

    // Emit each side as its OWN face-street carrying the spur's identity, in chain point
    // order — so extractFaces' forward/reversed convention tags the block-facing edge
    // 'right' on the right curb and 'left' on the left curb, with no post-hoc relabelling.
    out.push({ ...s, points: leftOut, skelId: s.skelId || s.name, spurSide: 'left', spurOf: tip.skelId })
    out.push({ ...s, points: rightOut, skelId: s.skelId || s.name, spurSide: 'right', spurOf: tip.skelId })
    if (capLine.length >= 2) out.push({ ...s, points: capLine, skelId: s.skelId || s.name, spurCap: true, spurOf: tip.skelId })

    spurs.push({
      skelId: tip.skelId, end: tip.end, mouth: [mouth[0], mouth[1]], tip: [tail[tipIdx][0], tail[tipIdx][1]],
      landL: [landL.pt[0], landL.pt[1]], landR: [landR.pt[0], landR.pt[1]],
      hwL, hwR, cap: capOf(tip.skelId, tip.end), trimmedWhole: dead,
    })
  }

  return { faceStreets: out.filter(s => s.points.length >= 2), spurs, skipped }
}
