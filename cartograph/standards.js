/**
 * Cartograph — Street geometry standards
 *
 * Every dimension here is a knob. Values are in meters.
 * Based on City of St. Louis standards, AASHTO, MUTCD, ADA.
 *
 * To customize for a different city, swap this file.
 */

import { CLASSES, classOf, classSection, LOCAL_SECTION } from '../src/cartograph/streetClass.js'
import { KIT_CURB_WIDTH } from '../src/cartograph/streetProfiles.js'

const FT = 0.3048 // feet to meters

export const STANDARDS = {

  // ── Street cross-section ─────────────────────────────────────────
  // ⭐ Not here: a street's carriageway is its CLASS's section (`src/cartograph/streetClass.js`), read by
  // `getStreetSpec` below. The `streets` table that stood here (residential / secondary / primary / service,
  // with its own 7 ft parking and 18" gutter) was the third copy of the cross-section (AUDIT §8); it is gone.

  // ── Curb ──────────────────────────────────────────────────────────
  curb: {
    width:    KIT_CURB_WIDTH,   // the kit's 6" on top — its one home is streetProfiles.js
  },

  // ── Sidewalk zone ─────────────────────────────────────────────────
  // ⭐ the local class row's (`streetClass.js#LOCAL_SECTION`) — the kit's one home, 5 ft each
  treeLawn: {
    width:  LOCAL_SECTION.treelawn,
  },

  sidewalk: {
    width:  LOCAL_SECTION.sidewalk,
  },

  // ── Intersection geometry ─────────────────────────────────────────
  intersection: {
    curbReturnRadius:  LOCAL_SECTION.cornerR, // curb fillet radius at corners — the local row's 15 ft, the kit's one home
    crosswalkWidth:     8 * FT, // between outer edges
    stopBarOffset:      4 * FT, // from crosswalk edge
    stopBarWidth:      18 * 0.0254, // 18" wide
  },

  // ── Pavement markings ────────────────────────────────────────────
  markings: {
    centerlineWidth:    4 * 0.0254,   // 4" yellow stripe
    centerlineDash:     3.048,         // 10 ft dash
    centerlineGap:      9.144,         // 30 ft gap
    edgeLineWidth:      4 * 0.0254,   // 4" white line
    crosswalkStripeWidth: 12 * 0.0254, // 12" continental stripes
    crosswalkStripeGap:   12 * 0.0254, // 12" gaps between stripes
  },

  // ── Building setback ─────────────────────────────────────────────
  setback: {
    residential:  17.5 * FT,   // 15–20 ft typical in Lafayette Sq
    commercial:    0,           // build-to-line in commercial
  },

  // ── Alleys ───────────────────────────────────────────────────────
  alley: {
    rowWidth:  15 * FT,         // 15 ft ROW
    pavedWidth: 15 * FT,        // typically full-width paved
  },

  // ── Pedestrian / paths ──────────────────────────────────────────
  footway: {
    width:       5 * FT,         // standard sidewalk width
    crossingWidth: 8 * FT,       // crosswalk width at intersections
  },

  path: {
    width:       4 * FT,         // informal path
  },

  cycleway: {
    width:       5 * FT,         // bike lane / cycle track
  },

  steps: {
    width:       5 * FT,         // stairway width
    treadDepth: 11 * 0.0254,    // 11" tread
  },
}

/**
 * The cross-section spec of one OSM way, from its CLASS's section (`streetClass.js` `classSection`), configured
 * by its own `lanes` and `oneway`, then dressed by the tags that SELECT a style: a cycle lane or track adds a
 * 5 ft lane; perpendicular or diagonal parking takes an 18 ft stall.
 * ⛔ No residential default: an unclassifiable way refuses (`classOf`), and a swept (highway) class throws — its
 * section is `streetProfiles#highwaySection` (H-3).
 */
export function getStreetSpec(tags) {
  const cls = classOf(tags).class
  if (CLASSES[cls].swept) throw new Error(`⛔ getStreetSpec: a ${cls} has no class constant — its section is highwaySection (H-3)`)
  const n = parseInt(tags.lanes, 10)
  const sec = classSection(cls, { lanes: n > 0 ? n : null, oneway: tags.oneway === 'yes' })
  const row = CLASSES[cls].section
  // A fixed-width class (no lanes) is one carriageway of `halfWidth` each side: two "lanes" of it.
  const spec = row.lane
    ? { lanes: sec.lanesAssumed, laneWidth: row.lane, parkingWidth: row.parking, gutterWidth: 0, class: cls }
    : { lanes: 2, laneWidth: sec.pavementHW, parkingWidth: 0, gutterWidth: 0, class: cls }

  // Cycleway adds width
  const cyc = tags.cycleway || tags['cycleway:left'] || tags['cycleway:right'] || tags['cycleway:both']
  if (cyc === 'lane' || cyc === 'track') {
    spec.cyclewayWidth = 5 * FT   // 5 ft bike lane
  } else if (cyc === 'shared_lane') {
    spec.cyclewayWidth = 0         // sharrows don't add width, but we mark them
    spec.sharrows = true
  } else {
    spec.cyclewayWidth = 0
  }

  // Parking orientation — perpendicular/diagonal stalls are much wider than parallel
  const pLeft  = tags['parking:left:orientation']
  const pRight = tags['parking:right:orientation']
  if (pLeft === 'perpendicular' || pLeft === 'diagonal' ||
      pRight === 'perpendicular' || pRight === 'diagonal') {
    spec.parkingWidth = 18 * FT   // 18 ft nose-in stall
  }

  spec.oneway = tags.oneway === 'yes'

  return spec
}

/**
 * Compute total half-width from centerline to each edge.
 * Returns { pavement, curb, treeLawn, sidewalk, propertyLine }
 * Each value is the distance from centerline to that edge.
 */
export function crossSection(spec) {
  const halfLanes = (spec.lanes / 2) * spec.laneWidth
  const cycleWidth = spec.cyclewayWidth || 0
  const pavement = halfLanes + spec.parkingWidth + cycleWidth + spec.gutterWidth

  const curb = pavement // curb sits at pavement edge
  const treeLawnOuter = curb + STANDARDS.treeLawn.width
  const sidewalkOuter = treeLawnOuter + STANDARDS.sidewalk.width

  return {
    centerline: 0,
    laneEdge: halfLanes,
    cyclewayEdge: halfLanes + cycleWidth,
    parkingEdge: halfLanes + cycleWidth + spec.parkingWidth,
    pavement,                    // = curb face
    curb: pavement + STANDARDS.curb.width,
    treeLawnOuter,
    sidewalkOuter,               // = property line (approx)
    hasCycleway: cycleWidth > 0,
    hasSharrows: spec.sharrows || false,
  }
}
