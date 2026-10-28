// sceneStreets.js — ONE skeleton chain, merged with the operator's overlay, the legacy centerlines and the scene's ribbons, into
// the street the Designer's store holds (`centerlineData.streets`). Pure, so a check can plant a street and read what reaches
// `measureModel.js#chainMeasure` (Boz, 2026-10-28). Called by useCartographStore.js's scene loader, once per skeleton chain.
//   s: the skeleton chain · ov: its overlay entry (skelId-keyed) · legacy: its by-name legacy centerlines entry (only when no
//   overlay) · rb: its ribbons street (skelId-keyed)
export function mergeSceneStreet(s, ov, legacy, rb) {
  // derive.js OWNS divided-carriageway geometry — it auto-detects
  // anchor/innerSign/pairId AND computes the 3a per-side widths, all
  // forwarded via ribbons.json. The pre-divided legacy centerlines.json
  // has ONE undivided by-name entry per road (e.g. "South Jefferson
  // Avenue" 9.16/7.72, "Lafayette Avenue" 10.56) that, matched by NAME,
  // would stamp the WHOLE-ROAD width onto each carriageway → carriageways
  // overrun the median gap → the malformed/annihilated median that loads
  // on refresh and only clears via revert-to-skeleton (it bypasses legacy).
  // So for a divided carriageway the ribbons baseline WINS over legacy.
  const isDividedCarriageway = /carriageway/.test(rb?.phase?.role || '')
  const legacyMeasure = isDividedCarriageway ? undefined : legacy?.measure
  const legacySegMeasures = isDividedCarriageway ? undefined : legacy?.segmentMeasures
  // Prefer ribbons.json's points + intersections over skeleton's.
  // derive.js INSERTS extra vertices at every detected IX, so a
  // chain that has 21 points in skeleton can have 34 in ribbons.json
  // (the IX-vertex insertions split each segment). MeasureOverlay
  // reads centerlineData; V2 reads ribbons.json. If centerlineData
  // uses skeleton's 21-point polyline, segI / natural-segment math
  // diverges from V2's 34-point math — drag a handle and the
  // override lands on the wrong segment. Use ribbons.json's points
  // when available so both consumers walk the same polyline.
  const rbPoints = rb?.points
  const points = (rbPoints && rbPoints.length >= 2)
    ? rbPoints.map(p => Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z])
    : (s.points || []).map(p => [p.x, p.z])
  const rbIntersections = rb?.intersections
  return {
    id: s.id,
    name: s.name,
    // ⭐ the street's CLASS and LANES, from the skeleton that classed it (streetClass.js): chainMeasure's seed when no measure
    // reaches it. ⛔ Not copied, every street with no overlay or ribbon measure threw "carries no class" (LS, 2026-10-28).
    class: s.class,
    lanes: s.lanes,
    type: s.highway || 'residential',
    oneway: !!s.oneway,
    points,
    // [curve-primitive] sparse, self-contained curve segments (HANDOFF-curve-
    // primitive-skeleton.md). `points` above is their DENSE tessellation (smooth
    // navy + ix parity); `segments` is the sparse companion the editor draws as
    // "few nodes (≈2 with tangents)". Undefined on straight chains → legacy node
    // display off `points`.
    segments: rb?.segments,
    divided: !!s.divided,
    // IX vertex indices on this chain. Indices reference `points`
    // above — must come from the SAME source the points came from
    // (ribbons.json's intersections.ix index into ribbons' point
    // array). Falling back to skeleton's intersections only if we
    // had to fall back to skeleton's points too.
    intersections: rbPoints && rbPoints.length >= 2 && Array.isArray(rbIntersections)
      ? rbIntersections.map(ix => ({ ix: ix.ix, withStreets: ix.withStreets }))
      : (Array.isArray(s.intersections)
        ? s.intersections.map(ix => ({ ix: ix.ix, withStreets: ix.withStreets }))
        : []),
    // Operator can hide individual chains (echo hunting, suppress OSM
    // junk centerlines). Hidden chains still appear in Measure (dim,
    // re-selectable) so you can toggle them back on.
    disabled: !!ov?.disabled,
    // Measure resolution: operator overlay > legacy centerlines.json >
    // derive.js's ribbons.json baseline. The third tier was missing,
    // so chains the operator hadn't touched ended up with `undefined`
    // measure on the live store — MeasureOverlay's sideBoundaries
    // returns [] for an undefined side and renders no handles, even
    // though the chain became selectable + translucent. V2 already
    // does this fallback inside mergeLiveRibbons; this keeps the
    // live store's per-chain measure consistent with what V2 sees.
    measure: ov?.measure ?? legacyMeasure ?? rb?.measure,
    // [E1] Provenance for the save guard: only persist a measure that
    // the operator actually owns (came from overlay) or that diverges
    // from the baked baseline. Without this, every chain loads a truthy
    // measure (rb?.measure) and _saveOverlay re-broadcasts the BASELINE
    // into overlay.json wholesale — the shadow that buried the
    // survey/seed width base (all 220 LS chains had overlay measures).
    _measureFromOverlay: !!ov?.measure,
    _baselineMeasure: rb?.measure,
    segmentMeasures: ov?.segmentMeasures ?? legacySegMeasures,
    // Effective cap = overlay (operator) > legacy (centerlines.json) >
    // ribbons.json (what derive.js actually rendered). The fallback
    // chain keeps the Survey dropdown in sync with the viewer when an
    // overlay/legacy entry is missing or stripped of caps. `null` from
    // an overlay or legacy entry is an explicit "no cap" and wins over
    // any underlying ribbons.json default — only `undefined` falls
    // through.
    capStart: ov && 'capStart' in ov ? ov.capStart
      : legacy && 'capStart' in legacy ? legacy.capStart
      : rb?.capEnds?.start ?? null,
    capEnd: ov && 'capEnd' in ov ? ov.capEnd
      : legacy && 'capEnd' in legacy ? legacy.capEnd
      : rb?.capEnds?.end ?? null,
    // Baseline = ribbons.json default. Save logic uses this to detect
    // operator overrides to null (suppressing an auto cap).
    _baselineCapStart: rb?.capEnds?.start ?? null,
    _baselineCapEnd: rb?.capEnds?.end ?? null,
    couplers: ov?.couplers ?? s.couplers ?? [],
    smooth: ov?.smooth ?? 0,
    // Anchor: operator override wins; otherwise auto-detected from
    // derive's divided-pair pass. innerSign and pairId always come
    // from auto-detection (geometric, not operator intent).
    anchor: ov?.anchor ?? rb?.anchor ?? 'center',
    _autoAnchor: rb?.anchor ?? 'center',
    innerSign: rb?.innerSign ?? 0,
    pairId: rb?.pairId ?? null,
    _skeleton: s,
    _legacyMatched: !!legacy,
  }
}
