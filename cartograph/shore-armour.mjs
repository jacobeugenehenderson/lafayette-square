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
 * ⇒ ⛔ Do not look for the rule. **Sample both sides and ask the DRAWN WATER**, which
 * is what `wetSideOf` below does — derived, per arc, no authoring, and it travels.
 * ⭐ Ruled 2026-09-26 (Jacob): *"The drawn water's edge IS the mapped shoreline, and the
 * revetment sits on it."* It used to ask the lidar; see `wetSideOf`.
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

// ⛔ EVERY BUCKET, READ BY TAG. The fetch files each feature under ONE bucket (its highest-priority tag), so a
// structure's tag says nothing about where it sits: measured 2026-09-27, 84 of provincetown's 93 over-water
// structures are NOT in `man_made` (78 under `highway`, the West End Breakwater under `surface`). Reading only
// `man_made` and `other` missed that breakwater entirely. A feature is found by what it IS, wherever it was filed.
const pick = (ground, table, closedOnly = false) => {
  const out = [], seen = new Set()
  for (const bucket of Object.values(ground || {})) {
    if (!Array.isArray(bucket)) continue
    for (const f of bucket) {
      if (!Array.isArray(f?.coords) || f.coords.length < 2 || seen.has(f)) continue
      if (closedOnly && !f.isClosed) continue
      if (Object.entries(table).some(([key, values]) => values.includes(f.tags?.[key]))) { out.push(f); seen.add(f) }
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
 * ⭐ THE DRAWN WATER, as a point test — the SAME rings the ground bake paints as the water
 * face (`clean/map.json#layers.water`, which `bake-ground.js` pushes as `water` / `water:*`
 * and whose complement ① carves as land). Inside ANY ring is water, because that is what the
 * slab draws: each ring is its own filled face.
 * @param rings  [[[x,z], …], …]
 * @returns (x, z) => boolean
 */
export function drawnWaterTest(rings) {
  const R = (rings || []).filter(r => Array.isArray(r) && r.length >= 3).map(r => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1] }
    return { r, x0, x1, z0, z1 }
  })
  return function inWater(x, z) {
    for (const { r, x0, x1, z0, z1 } of R) {
      if (x < x0 || x > x1 || z < z0 || z > z1) continue
      let inside = false
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        if ((r[i][1] > z) !== (r[j][1] > z) &&
            x < (r[j][0] - r[i][0]) * (z - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside
      }
      if (inside) return true
    }
    return false
  }
}

/**
 * Which side of this arc is the water on? ⛔ Derived by sampling the DRAWN WATER, never
 * assumed from winding — see the note above, where the convention was measured false.
 *
 * ⭐⭐ RULED 2026-09-26 (Jacob): *"The drawn water's edge IS the mapped shoreline, and the
 * revetment sits on it."* A `__water__` arc is struck from the same coast ring the ground
 * paints as water, so the water is beside it BY CONSTRUCTION, and the question "is this at
 * the water?" is answered by the drawing, not by the lidar.
 * ⛔ This SUPERSEDES `r-coast-trust-the-lidar` (2026-09-25) for where stone may go. That
 * version asked the heightfield whether either side reached y <= 0, and declined any arc where
 * neither did as "not at the water per the lidar" — Provincetown declined 42 km of its drawn
 * shore that way, and the drawing then showed water meeting land with nothing between them.
 * The lidar still sets the stone's crest and toe (`bake-revetment.js`); it no longer decides
 * whether the shore is a shore. Retired text: `cartograph/_archive/revetment-trust-the-lidar-RETIRED-2026-09-26.md`.
 *
 * @param poly     [[x,z], …] one arc, in local metres
 * @param inWater  (x, z) => boolean — `drawnWaterTest(rings)`. ⛔ Must return a BOOLEAN: a
 *                 caller still passing a heightfield gets a loud throw, not a quiet answer.
 * @param gridM    the terrain grid's step, metres — the station spacing the stone is placed
 *                 at, so the finest shore feature the revetment can express. ⛔ Required.
 * @returns { side: 'left'|'right'|'both'|null, kind, probeM, samples, why }
 *          ⛔ side === null means REFUSE this arc, loudly, and `kind` NAMES the predicate:
 *             'too-few-vertices' · 'stub' · 'ink-without-water'. It does not mean "pick one".
 *          ⭐ side === 'both' means drawn water on two faces — a breakwater, a jetty, a bar.
 *            It is an ANSWER: build on both faces and let `shoreArmourFor` rule on each.
 *
 * ⭐ IT STILL SWEEPS OUTWARD FROM ONE GRID STEP, for the reason it always did: the arc is ①'s
 * ε-stroke of the coast, and where a street meets the shore the stroke walks round the street
 * end, a few metres off the water ring. The nearest distance that answers wins.
 * ⛔ `ink-without-water` is NOT "not at the water": it says the slab carries shoreline ink with
 * no drawn water beside it, i.e. the drawing and the ink disagree — a pour defect, named.
 */
export function wetSideOf(poly, inWater, gridM) {
  if (typeof inWater !== 'function') throw new Error('wetSideOf: inWater must be (x, z) => boolean — the drawn-water test (drawnWaterTest)')
  if (!(gridM > 0)) throw new Error(`wetSideOf: gridM is required (got ${gridM}) — it is the terrain grid's own step, never a default`)
  if (!Array.isArray(poly) || poly.length < 3) {
    return { side: null, kind: 'too-few-vertices', samples: 0, why: 'arc has fewer than 3 vertices' }
  }
  let len = 0
  for (let i = 1; i < poly.length; i++) len += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1])

  // Stone is placed one station per grid step; an arc shorter than two carries none.
  if (len < 2 * gridM) {
    return { side: null, kind: 'stub', samples: 0, why: `arc is ${len.toFixed(1)} m — shorter than two stone stations (${(2 * gridM).toFixed(0)} m)` }
  }
  // Six cells: past that you are describing the hinterland, not the arc's own edge.
  const maxProbe = 6 * gridM
  let most = 0
  for (let probeM = gridM; probeM <= maxProbe + 1e-9; probeM += gridM) {
    let n = 0, rWet = 0, lWet = 0
    for (let i = 1; i < poly.length - 1; i++) {
      const tx = poly[i + 1][0] - poly[i - 1][0], tz = poly[i + 1][1] - poly[i - 1][1]
      const m = Math.hypot(tx, tz)
      if (!m) continue
      const nx = -tz / m, nz = tx / m          // right of the walk, +x east / +z south
      const r = inWater(poly[i][0] + nx * probeM, poly[i][1] + nz * probeM)
      const l = inWater(poly[i][0] - nx * probeM, poly[i][1] - nz * probeM)
      if (typeof r !== 'boolean' || typeof l !== 'boolean') {
        throw new Error(`wetSideOf: inWater returned ${typeof r}/${typeof l}, not a boolean — is a heightfield being passed where the drawn water belongs?`)
      }
      n++; if (r) rWet++; if (l) lWet++
    }
    if (!n) continue
    most = Math.max(most, rWet / n, lWet / n)
    const rAt = rWet / n > 0.6, lAt = lWet / n > 0.6
    if (rAt !== lAt) return { side: rAt ? 'right' : 'left', probeM, samples: n, why: `drawn water at ${+probeM.toFixed(2)} m` }
    // ⭐ 'both' IS AN ANSWER, NOT A REFUSAL (ruled 2026-09-21): two faces, the predicate rules each.
    if (rAt && lAt) return { side: 'both', probeM, samples: n, why: `drawn water on BOTH sides at ${+probeM.toFixed(2)} m — two faces; the armour predicate rules on each` }
  }
  return { side: null, kind: 'ink-without-water', probeM: maxProbe, samples: 0,
           why: `drawn water beside at most ${(100 * most).toFixed(0)}% of this arc on either side within ${+maxProbe.toFixed(1)} m — the slab's shoreline ink and the drawn water DISAGREE here (a pour defect, not a dry shore)` }
}
