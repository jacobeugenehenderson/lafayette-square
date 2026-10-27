/**
 * THE ROAD'S PAINT — the centre stripe's KIND and the EDGE LINES, chosen the way the style guide chooses everything
 * (`cartograph/STYLE-GUIDE.md` §18; BRIEF-the-ink-is-owned-by-its-labels §3a–§3c): the town's style picks the form,
 * data SELECTS among the forms and never measures, and the operator overrides any of it. One home, read by the pour
 * (which selects) and by the ground (which draws).
 *
 * THE KINDS (Jacob, 2026-10-25: "stripe kinds look right" — MUTCD's centreline family, `mutcd-11r1` §3B.01 ¶04–¶05):
 *   centre  'none' · 'broken' (single broken yellow) · 'double-solid' (double solid yellow) · 'solid-broken'
 *           (solid + broken yellow; `solid` names the side of the centreline, in the street's point order, that is solid)
 *   edge    'yellow' (the LEFT edge of a one-way roadway, §3B.09 ¶03) · 'white' (the RIGHT edge, ¶02) ·
 *           'parking' (white, at the parking lane's depth: `measure[side].parking`)
 * ⛔ A single solid yellow centre line is not a kind: §3B.01 ¶05, "shall not be used".
 *
 * THE LADDER (each street prints the rung that decided it): authored → data → town norm → kit house style.
 *   · grade-separated: EXCLUDED, outside the vocabulary (Boz, 2026-10-25): its paint is the off-the-ground family's
 *     (STYLE-GUIDE §10). Not a kind, and never 'none'.
 *   · the TYPE decides whether it is marked at all (the vocabulary's `marking` column, `streetClass.js`): a type the
 *     house style leaves unmarked stays unmarked unless the data says `lane_markings=yes` (Jacob, 2026-10-25: "no
 *     residential stripes"). `lane_markings=no` unmarks anything.
 *   · centre, a two-way street: `overtaking=no` → double-solid · `overtaking=yes` → broken · exactly one of
 *     `overtaking:forward|backward=no` → solid-broken, solid on that direction's side · `lanes:forward ≠ lanes:backward`
 *     with three lanes → solid-broken, solid on the two-lane side (§3B.01 ¶08) · four or more lanes → double-solid
 *     (¶06, a Standard) · else the town norm · else the type's house style (Jacob: "double yellow OK for default").
 *     A one-way has no centre line (¶01: a centre line separates OPPOSING traffic).
 *   · edges: a one-way roadway (a divided carriageway is one) of a marked type takes both, yellow left and white right
 *     (Jacob, 2026-10-25: "both lines default"); a town norm may drop them (§3B.10 ¶05: edges may be omitted where curbs
 *     or parking delineate the roadway). A two-way street takes none by default.
 * ⛔ Width and traffic volume are NEVER read: data selects, it never measures (STYLE-GUIDE §0). That is why §3B.02's
 *   width/ADT warrant drops out and only its class half survives, as the type's house style.
 *
 * Forward-relative tags are read in the street's POINT order: the pour reverses a `oneway=-1` way into travel order at
 * intake (`streetClass.js#travelOrdered`), and a two-way way a weld flipped is flipped back per source way here, by the
 * exact vertex identity `skeleton.js#carryWays` already records — never by geometry.
 */
import { CLASSES } from './streetClass.js'

export const CENTRE_KINDS = ['none', 'broken', 'double-solid', 'solid-broken']
export const EDGE_KINDS = ['yellow', 'white', 'parking']
// the centre a marked street takes when nothing selects one (Jacob, 2026-10-25: "double yellow OK for default otherwise")
const MARKED_DEFAULT = 'double-solid'

// ⭐ THE KIT'S HOUSE LOOK FOR THE PAINT — dimensions chosen for the close camera, INFORMED by mutcd-11r1 §3A.04, never
// imported as truth (STYLE-GUIDE §0): a normal line is 4–6 in (¶02 A); a double line's space is at most twice a line
// (¶03); a broken line is 10 ft of line in 40 (¶06). `edgeInset` (the kerb face to an edge line) has no permitted
// source and is a look, Jacob's to change. A town norm (`norms.json` → `markings.look`, metres) overrides any of them;
// the pour freezes the result into `ribbons.json` (`markingLook`), which the ground reads.
const IN = 0.0254, FT = 0.3048
export const MARKING_LOOK = { line: 4 * IN, gap: 4 * IN, dash: 10 * FT, space: 30 * FT, edgeInset: 1 * FT }

const SWAP = { left: 'right', right: 'left', forward: 'backward', backward: 'forward' }
const NO_PARKING = new Set(['no', 'none', 'no_parking', 'no_stopping', 'separate', 'fire_lane'])
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 && String(n) === String(v).trim() ? n : null }
// one way's paint tags, in its own node order. `null` = the way does not say.
export function wayMarkings(t = {}) {
  const yn = (v) => v === 'yes' || v === 'no' ? v : null
  const park = (side) => {
    for (const k of [`parking:${side}`, `parking:lane:${side}`, 'parking:both', 'parking:lane:both']) {
      const v = t[k]; if (v == null) continue
      return NO_PARKING.has(v) ? false : true
    }
    if (t[`parking:${side}:orientation`] || t['parking:both:orientation']) return true
    return null
  }
  return {
    laneMarkings: yn(t.lane_markings), lanes: int(t.lanes), lanesForward: int(t['lanes:forward']), lanesBackward: int(t['lanes:backward']),
    overtaking: yn(t.overtaking), overtakingForward: yn(t['overtaking:forward']), overtakingBackward: yn(t['overtaking:backward']),
    parkingLeft: park('left'), parkingRight: park('right'),
  }
}
// the same tags read the other way along the way (a way a weld laid against the street's point order)
const flip = (m) => ({ ...m, lanesForward: m.lanesBackward, lanesBackward: m.lanesForward, overtakingForward: m.overtakingBackward,
  overtakingBackward: m.overtakingForward, parkingLeft: m.parkingRight, parkingRight: m.parkingLeft })

/**
 * A chain's paint tags, in its POINT order: each field the vote of its source ways, weighted by the segments each made
 * (`segmentWays`), a way read in the direction it runs along the chain (`dirOf(osmId)`: +1 · −1 · null unknown).
 * A field the ways disagree on, tie for tie, is `null` and named in `split`; a forward-relative field of a way whose
 * direction along the chain is unknown is left out and counted (`undirected`).
 */
const FORWARD_RELATIVE = new Set(['lanesForward', 'lanesBackward', 'overtakingForward', 'overtakingBackward', 'parkingLeft', 'parkingRight'])
export function chainMarkings(segmentWays, waysTags, dirOf) {
  const votes = {}, split = [], undirected = new Set()
  for (const r of segmentWays || []) {
    if (r.ways.length !== 1) continue                                  // a segment across a way joint votes for neither
    const id = r.ways[0], d = dirOf(id), m0 = wayMarkings(waysTags[id] || {}), m = d === -1 ? flip(m0) : m0
    for (const [k, v] of Object.entries(m)) {
      if (v == null) continue
      if (FORWARD_RELATIVE.has(k) && d == null) { undirected.add(id); continue }
      const tally = votes[k] ||= new Map(); tally.set(v, (tally.get(v) || 0) + (r.to - r.from))
    }
  }
  const out = {}
  for (const k of Object.keys(wayMarkings({}))) {
    const t = votes[k]; if (!t) { out[k] = null; continue }
    const best = [...t.entries()].sort((a, b) => b[1] - a[1])
    if (best.length > 1 && best[0][1] === best[1][1]) { out[k] = null; split.push(k) } else out[k] = best[0][0]
  }
  return { ...out, ...(split.length && { split }), ...(undirected.size && { undirected: [...undirected] }) }
}

/**
 * THE LADDER for one street. `street` carries `class` · `oneway` · `gradeSeparated` · `markings` (the pour's, above) ·
 * `skelId`; `norm` is the town's `norms.json` `markings` (or null); `authored` the operator's override for this street
 * ({ centre, edges }) or null. → { centre: { kind, rung, why, solid? }, edges: { kind: { left, right } | null, rung, why } }
 * or { excluded: 'grade-separated' }. ⛔ A street of a class with no `marking` column REFUSES by name.
 */
export function selectMarkings(street, { norm = null, authored = null } = {}) {
  if (street.gradeSeparated) return { excluded: 'grade-separated' }
  const style = CLASSES[street.class]?.marking
  if (!style) throw new Error(`⛔ selectMarkings: ${street.skelId} is class "${street.class}", which has no \`marking\` style in the vocabulary (streetClass.js) — refusing to guess its paint`)
  const m = street.markings || {}
  const oneway = !!street.oneway
  const unmarked = m.laneMarkings === 'no' ? 'lane_markings=no'
    : (!style.marked && m.laneMarkings !== 'yes') ? `type ${street.class} is unmarked` : null
  const centre = (() => {
    if (authored?.centre) return { kind: authored.centre, rung: 'authored', why: 'Survey', ...(authored.solid && { solid: authored.solid }) }
    if (oneway) return { kind: 'none', rung: 'data', why: 'one-way (no opposing traffic)' }
    if (unmarked) return { kind: 'none', rung: m.laneMarkings === 'no' ? 'data' : 'house', why: unmarked }
    if (m.overtaking === 'no') return { kind: 'double-solid', rung: 'data', why: 'overtaking=no' }
    if (m.overtaking === 'yes') return { kind: 'broken', rung: 'data', why: 'overtaking=yes' }
    const fNo = m.overtakingForward === 'no', bNo = m.overtakingBackward === 'no'
    if (fNo !== bNo) return { kind: 'solid-broken', rung: 'data', why: `overtaking:${fNo ? 'forward' : 'backward'}=no`, solid: fNo ? 'right' : 'left' }
    const f = m.lanesForward, b = m.lanesBackward
    if (f != null && b != null && f + b === 3 && f !== b) return { kind: 'solid-broken', rung: 'data', why: `lanes ${f}+${b}`, solid: f > b ? 'right' : 'left' }
    const lanes = f != null && b != null ? f + b : m.lanes
    if (lanes != null && lanes >= 4) return { kind: 'double-solid', rung: 'data', why: `${lanes} lanes` }
    if (norm?.centre) return { kind: norm.centre, rung: 'norm', why: 'norms.json markings.centre' }
    // a type the house leaves unmarked that the data says IS marked (lane_markings=yes) takes the kit's marked default
    if (!style.marked) return { kind: MARKED_DEFAULT, rung: 'data', why: 'lane_markings=yes on an unmarked type' }
    return { kind: style.centre, rung: 'house', why: `type ${street.class}` }
  })()
  if (!CENTRE_KINDS.includes(centre.kind)) throw new Error(`⛔ selectMarkings: ${street.skelId}'s centre kind "${centre.kind}" (${centre.rung}) is not one of ${CENTRE_KINDS.join(' · ')}`)
  const edges = (() => {
    if (authored?.edges !== undefined) return { kind: authored.edges, rung: 'authored', why: 'Survey' }
    if (!oneway) return { kind: null, rung: 'house', why: 'two-way' }
    if (unmarked) return { kind: null, rung: m.laneMarkings === 'no' ? 'data' : 'house', why: unmarked }
    if (norm && norm.edges === false) return { kind: null, rung: 'norm', why: 'norms.json markings.edges = false (§3B.10 ¶05)' }
    // a one-way runs in travel order (intake), so its LEFT side in point order is the driver's left
    return { kind: { left: 'yellow', right: 'white' }, rung: 'data', why: 'one-way roadway' }
  })()
  return { centre, edges }
}

/**
 * THE PARKING DEPTH of one side (m, the kerb → the parking edge, inside pavementHW): the type's house parking lane
 * (`CLASSES[cls].section.parking`) where the data does not say otherwise; 0 where it says there is none. The data
 * selects PRESENCE only; the depth is the type's. ⛔ It never reaches pavementHW (the curb): `classSection` builds that
 * from the same row, independently, and nothing here writes it.
 * → { parking, rung, why } · a side the data says has parking on a type with no parking lane is 0, named.
 */
export function parkingSeed(cls, markings, side) {
  const row = CLASSES[cls]?.section
  const d = row?.parking || 0
  const said = markings?.[side === 'left' ? 'parkingLeft' : 'parkingRight']
  if (said === false) return { parking: 0, rung: 'data', why: `parking:${side} says none` }
  if (said === true && !(d > 0)) return { parking: 0, rung: 'house', why: `parking:${side} tagged, but type ${cls} has no parking lane` }
  return { parking: +d.toFixed(3), rung: said === true ? 'data' : 'house', why: said === true ? `parking:${side}` : `type ${cls}` }
}
