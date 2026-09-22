/**
 * shore-armour.mjs — IS THIS STRETCH OF SHORE A WALL?
 *
 * ⭐⭐ THE ONE QUESTION A PROCEDURAL REVETMENT CANNOT DERIVE FROM GEOMETRY ALONE,
 * and the answer Jacob ruled on 2026-09-21: **derive it from LU and OSM**, which
 * this town already carries, rather than authoring it. ⛔ There is no knob here
 * and there must not be one — `BRIEF-boulder-revetment §6`: *"I am not eager to
 * add more user controls, if a true procedural option is a good one."*
 *
 * ⛔⛔ NEITHER SOURCE IS SUFFICIENT ALONE, AND THAT IS THE WHOLE DESIGN. Measured
 * on huron against 1 m lidar (▶ `node scratch/huron-shore-transect/lu-and-osm.mjs`):
 *   · a structure tag predicts a shore several times taller than none — real signal
 *   · but the structure tags are SILENT on most of the shoreline
 *   · and `natural=beach` measures TALLER than `barrier=retaining_wall`, so height
 *     cannot tell sand from stone either
 * ⇒ Three reads, ORDERED, finest gesture first.
 *
 * ⭐⭐ THE ORDER IS THE KIT'S OWN, NOT AN INVENTION. 17.5% of huron's shoreline
 * carries a hard tag AND a soft land use within reach, so "print the conflict and
 * let a human decide" would hand back a sixth of the coast. It is not a conflict:
 * a park with a seawall HAS a seawall, and the structure is the more specific
 * statement about that spot. This is exactly `ORIENTATION`'s membership rule —
 * *"the formula is ORDERED, and the finest gesture wins"* — applied to the shore.
 *
 * ⛔ WHAT DOES DESERVE TO BE PRINTED is EVIDENCE DISAGREEING WITH GEOMETRY: a
 * tagged seawall where the ground is flat, or a tagged beach with a wall behind
 * it. One of the two sources is wrong there and only a person can say which. That
 * is a far smaller and far more useful population than tag co-occurrence.
 *
 * ⭐ TWO MATERIAL CONSTANTS, NAMED AS SUCH, WITH UNITS. Neither is a town's value
 * and neither is authored — they are properties of rock, so they travel to town
 * #2 unchanged. ⛔ That is what separates them from `CLAUDE.md`'s Class D (a
 * constant with no unit, or a unit stable only because something else is fixed).
 */

/**
 * ⛔⛔ AND WHOEVER PLACES STONE FROM THESE ARCS MUST READ THIS FIRST:
 * ⭐ **WHICH SIDE OF A SHORELINE ARC IS WET IS NOT A CONVENTION. MEASURE IT.**
 *
 * A revetment is built on ONE face of its arc — the face toward the water. Get it
 * backwards and the whole structure turns inside out: the wetted band paints
 * inland, the slope leans the wrong way, and the drape's triangles wind backwards
 * so its normals point DOWN and it renders as a dark ribbon with correct geometry
 * in the correct position. ⚠️ It is invisible in every oblique view and only shows
 * from a camera at the waterline — plausible, and wrong, which is the worst kind.
 *
 * ⛔⛔ THIS COMMENT USED TO SAY *"the walk direction IS the wet side"*. **MEASURED
 * FALSE on huron's own arcs, 2026-09-21**, hours after it was written, by the check
 * that now guards it. Of 14 `__water__` arcs: **9 have the water on the LEFT of the
 * walk, 1 on the RIGHT, 3 are too short to tell and 1 has no terrain under it.**
 * ▶ `node checks/claims-the-shore-knows-which-side-is-wet.mjs`
 * ⇒ There is no per-town convention to adopt, and **a per-town flip would be wrong
 * on at least one real arc.** Nor does the run's own `side` stamp predict it — arcs
 * stamped `left` appear in both camps.
 *
 * ⭐ **WHY IT CANNOT BE A CONVENTION, which is the part worth keeping:** an arc is
 * OPEN ink, not a ring (`coastline.mjs`: we stroke the ARC, never the ring), so it
 * has no orientation to inherit. And a stretch of bank between a river and a lake
 * has water on BOTH sides, where "the wet side" is not defined by winding at all.
 * ⇒ ⛔ Do not look for the rule. **Sample both sides and ask the ground**, which is
 * what `wetSideOf` below does — derived, per arc, no authoring, and it travels.
 *
 * ⚠️ AND MOST OF THESE ARCS ARE STUBS: 5 of huron's 14 are under 10 m long. They
 * cannot carry a revetment and must be REFUSED by name, not quietly skipped.
 */

/** Minimum armour stone, metres. Quarried armour below this washes out, so a
 *  "wall" shorter than one course of it is a kerb, not a revetment. */
export const MIN_ARMOUR_D50_M = 0.5

/** ⭐ RULED 2026-09-21 (Jacob): a tall face is STILL RIPRAP. huron's arc #3 is a
 *  genuine ~9.2 m step down to the water with a flat terrace behind it — 2.5× the
 *  tallest wall in the 1 m lidar survey — and the question was whether dumped stone
 *  is the right structure at that height or whether it becomes an engineered wall.
 *  Jacob: *"treat it as riprap."* ⛔ So there is NO height cap and no exclusion; a
 *  tall stretch takes the full `crest / tan(REPOSE)` band like any other.
 *  ⚠️ THE CONSEQUENCE IS GEOMETRIC AND IT IS NOT OPTIONAL: that band is ~13 m wide,
 *  and **a revetment cannot follow a curve tighter than its own width — the real
 *  structure could not either.** So a consumer must simplify the shoreline arc to
 *  the scale of the BAND, not merely to the scale of the heightfield, or the ribbon
 *  folds through itself on the inside of a bend. ⛔ Not a constant: derive it from
 *  the local crest, floored at the terrain grid. */

/** Angle of repose of dumped riprap, degrees — what sets the revetment's slope.
 *  ⛔ Measured 2026-09-21: the ground landward of huron's shore is nearly FLAT
 *  (median 0.07 m rise per metre) and then drops at the line, so the BANK cannot
 *  supply a slope. It has to come from the stone. */
export const RIPRAP_REPOSE_DEG = 35

/** How far a tag reaches to speak for a point on the shore, metres. Mapping is
 *  not surveying: a way drawn along a seawall sits a few metres off the water. */
export const TAG_REACH_M = 12

/** Built things at a water's edge that ARE the wall. */
export const HARD_TAGS = {
  barrier: ['retaining_wall', 'wall'],
  man_made: ['breakwater', 'groyne'],
}

/** Shores that are soft by nature, and land uses that keep them that way. ⛔ Not
 *  a skip list: these are positive statements the map makes about the ground. */
export const SOFT_TAGS = {
  natural: ['beach', 'sand', 'wetland', 'reef', 'mud', 'shingle'],
}
export const SOFT_LU = {
  leisure: ['park', 'nature_reserve', 'garden'],
  natural: ['wood', 'scrub', 'grassland', 'scree', 'heath'],
}

const segDist = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}
const nearAny = (feats, x, z, reach) => {
  for (const f of feats) {
    const c = f.coords
    for (let i = 1; i < c.length; i++) {
      if (segDist(x, z, c[i - 1].x, c[i - 1].z, c[i].x, c[i].z) <= reach) return f
    }
  }
  return null
}
const containing = (feats, x, z) => {
  for (const f of feats) {
    const C = f.coords
    let inside = false
    for (let i = 0, j = C.length - 1; i < C.length; j = i++) {
      if ((C[i].z > z) !== (C[j].z > z) &&
          x < (C[j].x - C[i].x) * (z - C[i].z) / (C[j].z - C[i].z) + C[i].x) inside = !inside
    }
    if (inside) return f
  }
  return null
}

const pick = (ground, table, closedOnly = false) => {
  const out = []
  for (const [key, values] of Object.entries(table)) {
    for (const f of (ground[key] || [])) {
      if (!Array.isArray(f?.coords) || f.coords.length < 2) continue
      if (closedOnly && !f.isClosed) continue
      if (values.includes(f.tags?.[key])) out.push(f)
    }
  }
  // `man_made` may still be unbucketed on a town fetched before that landed —
  // look in `other` too rather than silently seeing nothing. ⛔ Absence of a
  // bucket is not absence of the feature.
  for (const [key, values] of Object.entries(table)) {
    for (const f of (ground.other || [])) {
      if (!Array.isArray(f?.coords) || f.coords.length < 2) continue
      if (closedOnly && !f.isClosed) continue
      if (values.includes(f.tags?.[key])) out.push(f)
    }
  }
  return out
}

/**
 * Build the predicate for one town.
 * @param ground  the raw fetch's `ground` buckets
 * @returns (x, z, heightAboveWater) => { armour, why, dispute }
 */
export function shoreArmourFor(ground) {
  const hard = pick(ground, HARD_TAGS)
  const softTag = pick(ground, SOFT_TAGS)
  const softLu = pick(ground, SOFT_LU, true)

  return function armourAt(x, z, height) {
    const h = Number.isFinite(height) ? height : NaN
    const hardHit = nearAny(hard, x, z, TAG_REACH_M)
    const softHit = nearAny(softTag, x, z, TAG_REACH_M) || containing(softLu, x, z)

    // ① The finest gesture: someone mapped a built thing here.
    if (hardHit) {
      const what = Object.values(HARD_TAGS).flat().find(v => Object.values(hardHit.tags).includes(v))
      // ⛔ The map says wall and the ground says flat. One of them is wrong and
      // only a person can say which — so SAY SO. Still armoured: the tag is the
      // more specific claim, and a silent drop would be the worse failure.
      // ⚠️ BUT ONLY FOR SHORE-ATTACHED STRUCTURES. A breakwater or a groyne stands
      // IN the water, so flat ground beneath it is the expected reading, not a
      // disagreement — on huron that one distinction is the difference between 213
      // disputes and a handful. A report that cries wolf on its commonest case
      // trains people to skip it, which is worse than not reporting at all.
      const attached = what === 'retaining_wall' || what === 'wall'
      const dispute = attached && h < MIN_ARMOUR_D50_M
        ? `tagged ${what} but the ground rises only ${h.toFixed(2)} m here`
        : null
      return { armour: true, why: 'structure-tag', dispute }
    }
    // ② The map says this shore is soft.
    if (softHit) {
      const dispute = h >= 2 * MIN_ARMOUR_D50_M
        ? `mapped as soft shore but the ground rises ${h.toFixed(2)} m here`
        : null
      return { armour: false, why: 'soft-shore', dispute }
    }
    // ③ Nobody said. The ground decides, and the floor is one course of armour.
    if (!Number.isFinite(h)) return { armour: false, why: 'no-height', dispute: 'no terrain under this shore vertex' }
    return { armour: h >= MIN_ARMOUR_D50_M, why: h >= MIN_ARMOUR_D50_M ? 'height' : 'below-one-course', dispute: null }
  }
}

/**
 * Which side of this arc is the water on? ⛔ Derived by sampling the ground, never
 * assumed from winding — see the note above, where the convention was measured false.
 *
 * @param poly      [[x,z], …] one arc, in local metres
 * @param heightAt  (x, z) => metres relative to the water plane (NaN off-grid)
 * @param gridM     the terrain grid's own step, in metres — the finest thing it can say
 * @returns { side: 'left'|'right'|'both'|null, probeM, right, left, samples, why }
 *          ⛔ side === null means REFUSE this arc, loudly. It does not mean "pick one".
 *          ⭐ side === 'both' means water on two faces — a breakwater, a jetty, a bar.
 *            It is an ANSWER: build on both faces and let `shoreArmourFor` rule on each.
 *
 * ⭐⭐ IT SWEEPS OUTWARD RATHER THAN PROBING AT ONE DISTANCE, and that is not a
 * refinement — a single probe distance is a constant that is correct for one town.
 * Measured on huron: a 539 m arc runs along a spit ~16-20 m wide. At 2-8 m out BOTH
 * sides are still on the spit and read the same; at 12 m the water appears. An 8 m
 * probe refuses it and a 20 m probe would blur an ordinary shore by sampling deep
 * inland. ⇒ Sweep out from the grid's own resolution and take the FIRST distance
 * that answers — the nearest reading wins, which is this kit's rule everywhere else.
 *
 * ⭐ AND THE TEST IS PHYSICAL, NOT A THRESHOLD: the wet side is the side that
 * REACHES THE WATER PLANE. Water is at the plane by definition — that is what the
 * datum means since bake-terrain started deriving it — so "which side is water" is
 * "which side is at y <= 0", not "which side is lower by some margin".
 */
export function wetSideOf(poly, heightAt, gridM = 5) {
  if (!Array.isArray(poly) || poly.length < 3) {
    return { side: null, samples: 0, why: 'arc has fewer than 3 vertices' }
  }
  let len = 0
  for (let i = 1; i < poly.length; i++) len += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1])

  // ⛔ THE BOUND IS DERIVED, AND IT IS NOT A TASTE SETTING. Past a handful of grid
  // cells you are no longer describing a shore edge, you are describing the
  // hinterland — and the heightfield cannot resolve a shore feature finer than its
  // own step anyway. Six cells is the width of the widest spit the grid can still
  // call a spit; beyond that, refusing is the honest answer.
  const maxProbe = 6 * gridM
  if (len < 2 * gridM) {
    return { side: null, samples: 0, why: `arc is ${len.toFixed(1)} m — shorter than the terrain can resolve (${(2 * gridM).toFixed(0)} m)` }
  }

  let lastRight = NaN, lastLeft = NaN, lastN = 0
  for (let probeM = gridM; probeM <= maxProbe; probeM += gridM) {
    let rSum = 0, lSum = 0, n = 0, rWet = 0, lWet = 0
    for (let i = 1; i < poly.length - 1; i++) {
      const tx = poly[i + 1][0] - poly[i - 1][0], tz = poly[i + 1][1] - poly[i - 1][1]
      const m = Math.hypot(tx, tz)
      if (!m) continue
      const nx = -tz / m, nz = tx / m          // right of the walk, +x east / +z south
      const hr = heightAt(poly[i][0] + nx * probeM, poly[i][1] + nz * probeM)
      const hl = heightAt(poly[i][0] - nx * probeM, poly[i][1] - nz * probeM)
      if (!Number.isFinite(hr) || !Number.isFinite(hl)) continue
      rSum += hr; lSum += hl; n++
      // AT the water plane, with one armour course of slack for the grid's own noise.
      if (hr <= MIN_ARMOUR_D50_M) rWet++
      if (hl <= MIN_ARMOUR_D50_M) lWet++
    }
    if (!n) continue
    lastRight = rSum / n; lastLeft = lSum / n; lastN = n
    // The first distance at which one side is decisively at the water and the other
    // is not. ⛔ Both-at-water is a bank between two waters — a real case, and one
    // this function must refuse rather than pick a face for.
    const rAt = rWet / n > 0.6, lAt = lWet / n > 0.6
    if (rAt !== lAt) {
      return { side: rAt ? 'right' : 'left', probeM, right: lastRight, left: lastLeft, samples: n, why: `water reached at ${probeM} m` }
    }
    if (rAt && lAt) {
      // ⭐⭐ 'both' IS AN ANSWER, NOT A REFUSAL — ruled 2026-09-21 after measuring what
      // huron's only such arc actually is. A breakwater or a rubble mound genuinely
      // has water on two sides and is armoured on both faces; a sand bar has water
      // on two sides and is armoured on neither. ⛔ THE SIDE-FINDER MUST NOT DECIDE
      // THAT — it reports both faces and `shoreArmourFor` rules on each one, which
      // is the predicate that already exists and already knows the difference.
      // ⚠️ Returning null here made the pipeline STOP on a case it could answer, and
      // the caller would then have had to invent a rule the kit already has.
      return { side: 'both', probeM, right: lastRight, left: lastLeft, samples: n,
               why: `water on BOTH sides at ${probeM} m — two faces; the armour predicate rules on each` }
    }
  }
  if (!lastN) return { side: null, samples: 0, why: 'no terrain under either side of this arc' }
  return { side: null, probeM: maxProbe, right: lastRight, left: lastLeft, samples: lastN,
           why: `neither side reaches the water within ${maxProbe} m — this arc is not at a water edge` }
}
