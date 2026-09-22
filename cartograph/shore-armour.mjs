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
 * ⭐ **THE WALK DIRECTION OF A SHORELINE ARC *IS* THE WET SIDE.**
 * A revetment is built on ONE face of its arc — the face toward the water — and
 * that face is decided by the arc's winding, not by anything in the tags. Reverse
 * the walk and the whole structure turns inside out: the wetted band paints
 * inland, the slope leans the wrong way, and the drape's triangles wind backwards
 * so its normals point DOWN and it renders as a dark ribbon with correct geometry
 * in the correct position.
 * ⚠️ MEASURED 2026-09-21 in the boulder probe, on a demo shore that happened to be
 * walked the wrong way. It was invisible in every oblique view and only showed when
 * a camera was put deliberately at the waterline — which is exactly the shape of
 * failure this kit calls the worst kind: plausible, and wrong.
 * ⛔ `shape.json`'s `__water__` runs have their own winding and NOBODY HAS CHECKED
 * IT AGAINST THIS ASSUMPTION. Before placing stone on a real shore, assert which
 * side of the arc the water is on — per arc, not per town, because a lake's arcs
 * need not agree with each other. ▶ The drape builder
 * (`src/lib/revetmentDrape.js`) normalises its own winding and REPORTS the flip in
 * `stats.flipped` rather than fixing it silently; a scene that needs the flip is
 * telling you its arcs are wound the other way, and that is a fact about the town,
 * not a rendering detail.
 */

/** Minimum armour stone, metres. Quarried armour below this washes out, so a
 *  "wall" shorter than one course of it is a kerb, not a revetment. */
export const MIN_ARMOUR_D50_M = 0.5

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
