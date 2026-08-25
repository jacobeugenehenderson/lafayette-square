/**
 * matcher.js — the tolerance engine (Forest Builder Stage 1B, §7).
 *
 *   matcher(dossier, partType, parts, rubric) → ranked WORKABLE options
 *
 * Given a dossier's `required` characteristics, filter + rank the parts of one
 * type into workable / stretch options, each explaining HOW CLOSE and WHICH AXES
 * ARE HARD vs nice-to-have — so the operator ratifies the pick or says "go get a
 * real one" (§7.2). The taste lives in rubric.json's hand-authored
 * similarityMatrices (enum hops) + percentage tolerances (scalars) — read, never
 * invented (§15.1, accepted). Generalizes leaf-pack-bindings.json (a leaf-only
 * proto-matcher) to all four part-types, tolerance-driven. Pure, no I/O.
 *
 * A `hard` axis out of tol drops an option workable→stretch; `soft` axes only
 * move the score. Unratified (provisional) tags are down-weighted + badged so a
 * match never silently rests on a guess (feedback_proxy_render_is_not_the_operator_eye).
 *
 * Matched axes = the ones a PART actually carries auto-tags for. leaf.ways /
 * leaf.face / leaf.season / overlay are recipe/authoring choices applied AFTER
 * pick (a pack can be arranged any way), so they don't filter part selection.
 */

// ⛔ HARDCODED AXIS IDS. Renaming an axis in rubric.json and not updating this list makes
// `axes` come back EMPTY — so `concrete` is false, every part scores 0, and readiness reports
// GAP for a species whose parts match perfectly. It does not throw. That is the third place
// axis ids are stored (dossiers · part-index · here) and it cost the longest to find during the
// 19→31 cutover. ▶ `node scratch/claims-axis-keys-resolve.mjs` covers all three now.
const MATCH_AXES = {
  // chassis.trunks joins the match axes — UNLIKE orientation and spread, which are
  // recorded-not-matched. A multi-stem chassis is genuinely different geometry, and it was
  // already matching under this part-type when it lived inside chassis.habit; dropping it
  // from MATCH_AXES would be a silent capability loss, not a neutral migration.
  chassis: ['chassis.habit', 'chassis.trunks', 'chassis.size'],
  bark: ['bark.texture'],
  // The 2026-08-24 split: leaf.silhouette conflated type/shape/margin, so a part must be
  // comparable on each. A part tagged on only one still matches — the others read as untagged,
  // which never disqualifies a SOFT axis (see compareAxis).
  leaf: ['leaf.type', 'leaf.shape', 'leaf.margin', 'leaf.arrangement', 'leaf.length', 'leaf.width'],
  overlay: ['overlay.type', 'overlay.fruit_type', 'overlay.appendage'],
}
const HARD_WEIGHT = 2, SOFT_WEIGHT = 1, PROVISIONAL_PENALTY = 0.85
// Closeness normalizer for enums. The tolerance test uses the rubric's far=9
// (unlisted pairs are out of tol); but for RANKING we use a tighter softFar so a
// one-hop habit miss (oval↔pyramidal) separates clearly from an exact hit instead
// of bunching near 1.0 and letting a few % of size dominate identity.
const ENUM_SOFT_FAR = 3

const axisKind = (rubric, axisId) => (rubric.axes.find(a => a.id === axisId) || {}).kind

function enumDistance(rubric, axisId, target, actual) {
  if (target == null || actual == null) return null // can't compare → handled by caller
  if (target === actual) return 0
  const m = rubric.similarityMatrices[axisId]
  const far = rubric.similarityMatrices.farDistance || 9
  if (!m) return far
  const d = (m[target] && m[target][actual]) ?? (m[actual] && m[actual][target]) ?? far
  return d
}

/** Per-axis comparison → {axis, required, actual, hard, withinTol, distance, provisional, closeness}. */
function compareAxis(rubric, axisId, reqSpec, tag) {
  const hard = reqSpec.hardness === 'hard'
  const actual = tag ? tag.value : null
  const provisional = !tag || tag.ratified === false
  const kind = axisKind(rubric, axisId)
  let distance, withinTol, closeness

  if (actual == null) {
    // untagged / null draft — can't satisfy; never disqualifies a soft axis.
    distance = null; withinTol = false; closeness = 0
  } else if (kind === 'enum') {
    distance = enumDistance(rubric, axisId, reqSpec.target, actual)
    withinTol = distance <= (reqSpec.tol ?? 0)
    closeness = Math.max(0, 1 - distance / ENUM_SOFT_FAR)
  } else if (kind === 'scalar') {
    const t = reqSpec.target
    distance = t ? Math.abs(actual - t) / t : Math.abs(actual - (t || 1))
    withinTol = distance <= (reqSpec.tol ?? 0.4)
    closeness = Math.max(0, 1 - distance)
  } else if (kind === 'ordinal') {
    const axis = rubric.axes.find(a => a.id === axisId)
    const order = axis ? axis.values : []
    distance = Math.abs(order.indexOf(reqSpec.target) - order.indexOf(actual))
    withinTol = distance <= (reqSpec.tol ?? 1)
    closeness = Math.max(0, 1 - distance / Math.max(1, order.length - 1))
  } else {
    // band/dual/curve — not part-filterable; treat as informational, not gating.
    distance = null; withinTol = true; closeness = 0.5
  }
  return { axis: axisId, required: reqSpec.target ?? null, actual, hard, withinTol, distance, provisional, closeness }
}

export function matchOne(rubric, dossier, part) {
  const axes = (MATCH_AXES[part.partType] || []).filter(a => dossier.required && dossier.required[a])
  const perAxis = axes.map(a => compareAxis(rubric, a, dossier.required[a], part.tags && part.tags[a]))
  // verdict: workable iff every HARD axis is withinTol AND the part offers at least
  // one CONCRETE match (a non-null axis within tol) — so a part with only null/
  // unknown tags (score 0) reads 'stretch', never an empty "workable".
  const hardPass = !perAxis.some(x => x.hard && !x.withinTol)
  const concrete = perAxis.some(x => x.withinTol && x.actual != null)
  const verdict = hardPass && concrete ? 'workable' : 'stretch'
  // score: weighted closeness, provisional-penalized.
  let wsum = 0, w = 0
  for (const x of perAxis) { const ww = x.hard ? HARD_WEIGHT : SOFT_WEIGHT; wsum += x.closeness * ww; w += ww }
  let score = w ? wsum / w : 0
  if (perAxis.some(x => x.provisional)) score *= PROVISIONAL_PENALTY
  return { partId: part.partId, source: part.source, verdict, score: +score.toFixed(3), provisional: perAxis.some(x => x.provisional), perAxis }
}

/** matcher(dossier, partType) → { partType, preselect, totalWorkable, options[] } */
export function matcher(rubric, dossier, partType, parts) {
  const pool = parts.filter(p => p.partType === partType)
  const options = pool.map(p => matchOne(rubric, dossier, p))
    .sort((a, b) => (a.verdict === b.verdict ? b.score - a.score : a.verdict === 'workable' ? -1 : 1))
  const workable = options.filter(o => o.verdict === 'workable')
  return {
    partType,
    preselect: workable.length === 1 ? workable[0].partId : null,
    totalWorkable: workable.length,
    options,
  }
}
