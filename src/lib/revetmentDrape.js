/**
 * revetmentDrape.js — THE FOIL. One continuous surface, shrink-wrapped onto the
 * revetment's shell and made craggy by noise, instead of N individual stones.
 *
 * ⭐ JACOB'S PROPOSAL, 2026-09-21: *"I almost think of a big piece of aluminum
 * foil draped over the area: using a noise mesh we could shrink the foil into a
 * bumpy, craggy continuous surface that could be cheaper than individual
 * geometry."* This module is that, built to be MEASURED against the instanced
 * path (`boulderGeometry.js` + `InstancedBoulders.jsx`), not instead of it.
 *
 * ⭐⭐ THE NOISE CHOICE IS THE WHOLE BALL GAME, AND IT IS MEASURABLE BY EYE:
 *   · `fbm`      — smooth fractal. Gives LUMPY GROUND or scree. There is no edge
 *                  anywhere in it, because fBm is C¹ continuous by construction,
 *                  and stone is made of edges.
 *   · `cellular` — Worley/Voronoi. ⭐ The cell partition IS the block partition.
 *                  Each cell takes its own height, so the cell BOUNDARY is a
 *                  step, and a step in a flat-shaded mesh is a crease with a
 *                  shadow in it. That shadow is what sells stacked stone.
 * Both are here and switchable so the comparison is a button, not an argument.
 *
 * ⭐⭐⭐ NORMAL-DISPLACED vs GATHERED — AND THIS IS THE WHOLE TECHNIQUE.
 * A sheet pushed along its own normal is a HEIGHTFIELD ON A SLOPE: every point
 * still maps 1:1 to the shell, so it can never overhang and its outline stays
 * smooth. That is the version that fails at a grazing angle, and it is here as
 * `gather: 0` — the CONTROL, not the proposal.
 * ⭐ GATHERING is Jacob's actual idea: *"the drape is gathered and deformed."*
 * Crumpled foil has MORE SHEET than the surface it covers, so it must buckle.
 * Here each vertex is pulled TANGENTIALLY toward its Worley cell's site, so
 * material piles up at the cell centres and the sheet has to pleat where two
 * cells pull apart. Those pleats are real geometric troughs with real
 * self-occlusion — a broken outline, which normal displacement cannot produce at
 * any amplitude.
 * ⛔⛔⛔ WHAT THIS MECHANISM CANNOT DO, AND IT IS THE MOST VALUABLE THING THE PROBE
 * PRODUCED — read this before trying to make it crumple. **A fixed-connectivity grid
 * displaced by a noise field cannot buckle, because nothing in the construction
 * preserves the sheet's arc length**, so there is no excess material that has to go
 * somewhere. That is a statement about the CONSTRUCTION, not about parameters, and it
 * is why tuning cannot reach it. MEASURED 2026-09-21, and the numbers are printed by
 * `stats` on every build so any later attempt can be scored against the same two:
 *   · SHEET AREA 304 m² over a ~300 m² footprint — an area ratio of ~1.0. Gathered
 *     foil has substantially MORE sheet than the surface it covers; this has none.
 *   · 0.8% of faces point below the horizon (2.0% at five octaves, 0.1% at two) — so
 *     effectively NO OVERHANGS, so no sky between stones, so it reads as a patterned
 *     SURFACE and never as OBJECTS.
 *   · Sweeping `gather` 0.6 → 0 moves the area ratio by ~1% and the downward fraction
 *     by 0.1 points. ⭐ The gain being irrelevant is the falsification that settles it.
 * ⇒ Real buckling needs a different mechanism — an inextensible relaxation that keeps
 * the metric, or shells cut and stacked as separate surfaces. ⛔ That is a DIFFERENT
 * PROBE and it was deliberately not started here. Do not reopen it by turning a knob.
 *
 * ⛔ SELF-INTERSECTION IS EXPECTED AND IS NOT A BUG. A gathered sheet passes
 * through itself; this is opaque static stone, and overlapping folds read as
 * blocks resting on each other. Do not smooth it out — smoothing it out is
 * throwing the effect away.
 *
 * ⛔ NO AUTHORED PARAMETERS. Block size comes from the crest height by the same
 * rule the instanced path uses, and the slope is `RIPRAP_REPOSE_DEG`. The mesh
 * RESOLUTION is the one genuinely free number and it is a budget, not a look: it
 * is set by the cell size so that a block always spans several quads.
 *
 * ⭐ RELATION TO THE KIT'S EXISTING DRAPE, stated precisely because the loose
 * version is wrong: `src/utils/terrainShader.js#patchTerrain` displaces at RENDER
 * time in the vertex shader, from a heightfield texture, so the ground can rise
 * and fall with `terrainExag`. This displaces ONCE, into vertex positions, which
 * is what a slab wants — flat, dumb, fast, and no per-frame work. Same idea, and
 * ⛔ not the same code path; do not describe this as "calling patchTerrain".
 */

import * as THREE from 'three'
import { RIPRAP_REPOSE_DEG, MIN_ARMOUR_D50_M } from '../../cartograph/shore-armour.mjs'

const TAN_REPOSE = Math.tan((RIPRAP_REPOSE_DEG * Math.PI) / 180)

/** The macro masses of a revetment are a few armour stones across — that is what a
 *  dumped heap looks like, and it is a property of how stone piles, not of a town. */
const MACRO_WAVELENGTHS_PER_BLOCK = 4
/** …and they are about one stone deep. Amplitude below this and the wall is a ramp;
 *  far above it and the "wall" is a mountain range. */
const MACRO_AMPLITUDE_PER_BLOCK = 0.85
/** ⭐ Nyquist plus one. Two vertices per wavelength can REPRESENT an octave; three
 *  can represent it without the outline visibly faceting. ⛔ This is the number the
 *  whole vertex budget hangs on — it is not a quality dial. */
const VERTS_PER_WAVELENGTH = 3
/** ⭐ ONE default for the tangential gain, exported so no caller can restate it and
 *  drift. The harness once carried its own 0.35 against this 0.6 and the drape was
 *  being judged at half the gain it was built for. */
export const DRAPE_DEFAULT_GATHER = 0.6
/** How far past the nominal crest/toe the sheet is BUILT, in band fractions. The
 *  mesh is wider than the band so the band's edge can be cut out of it. */
const U_LO = -0.35, U_HI = 1.35
/** How far the band's own half-width wanders, in band fractions — the long field. */
const EDGE_WANDER = 0.22
/** …and the stone-scale raggedness of the boundary itself. */
const EDGE_RAGGED = 0.14
/** …and its wavelength, in BLOCKS. ⛔ Must stay well above the mesh step or the trim
 *  cannot resolve it — see the comb-teeth receipt at the contour. */
const EDGE_RAGGED_BLOCKS = 4.5
const d50For = h => Math.max(MIN_ARMOUR_D50_M, Math.min(1.5, h * 0.45))

const hash3 = (i, j, k, s = 0) => {
  let n = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(k | 0, 0x9e3779b9) ^ Math.imul(s, 0x85ebca6b)
  n = Math.imul(n ^ (n >>> 15), 0x2545f491)
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296
}
const smooth = t => t * t * (3 - 2 * t)
function valueNoise3(x, y, z, s) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z)
  const fx = smooth(x - i), fy = smooth(y - j), fz = smooth(z - k)
  const L = (a, b, t) => a + (b - a) * t
  const c = (di, dj, dk) => hash3(i + di, j + dj, k + dk, s)
  return L(
    L(L(c(0, 0, 0), c(1, 0, 0), fx), L(c(0, 1, 0), c(1, 1, 0), fx), fy),
    L(L(c(0, 0, 1), c(1, 0, 1), fx), L(c(0, 1, 1), c(1, 1, 1), fx), fy), fz)
}
function fbm3(x, y, z, s, oct = 4) {
  let v = 0, a = 1, n = 0, f = 1
  for (let o = 0; o < oct; o++) { v += a * (valueNoise3(x * f, y * f, z * f, s + o * 7919) - 0.5); n += a; a *= 0.5; f *= 2.07 }
  return v / n
}

/**
 * Worley cell lookup on a jittered grid. Returns the nearest cell's random
 * height and the distance to its site, both of which the displacement needs:
 * the height makes the block, the distance rounds its top.
 * ⭐ It is the NEAREST-CELL SWITCH that makes the edge. Interpolating between
 * cells (which is what F2−F1 smoothing would do) sands the edge back off and
 * you are looking at fBm again with extra steps.
 */
function worley(x, y, z, seed) {
  const ci = Math.floor(x), cj = Math.floor(y), ck = Math.floor(z)
  let best = Infinity, bh = 0, bdx = 0, bdy = 0, bdz = 0
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
    const i = ci + di, j = cj + dj, k = ck + dk
    const sx = i + hash3(i, j, k, seed + 1)
    const sy = j + hash3(i, j, k, seed + 2)
    const sz = k + hash3(i, j, k, seed + 3)
    const dx = x - sx, dy = y - sy, dz = z - sz
    const d2 = dx * dx + dy * dy + dz * dz
    if (d2 < best) { best = d2; bh = hash3(i, j, k, seed + 4); bdx = dx; bdy = dy; bdz = dz }
  }
  return { d: Math.sqrt(best), h: bh, dx: bdx, dy: bdy, dz: bdz }
}

/**
 * ⭐⭐ THE SAME CELLS, BUT IN THE SHEET'S OWN PARAMETER SPACE (along-shore metres,
 * down-slope metres). ⛔ MEASURED FAILURE, 2026-09-21: gathering toward cells
 * scattered in 3D WORLD space does not pleat the sheet, it SHREDS it — neighbouring
 * vertices get pulled to sites that are far apart and perpendicular to the sheet,
 * and the quads between them stretch into long thin fins with sky showing through.
 * It is a broken silhouette, but it is broken in the way a torn flag is, not a
 * heap of rock. Cells on the SURFACE keep every pull in the sheet, so the gather
 * piles material at block centres and the quads spanning a boundary become the
 * steep-walled GAP between two blocks, which is the read we want.
 */
function worley2(x, y, seed) {
  const ci = Math.floor(x), cj = Math.floor(y)
  let best = Infinity, bh = 0, bdx = 0, bdy = 0
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const i = ci + di, j = cj + dj
    const sx = i + 0.15 + 0.7 * hash3(i, j, 0, seed + 1)
    const sy = j + 0.15 + 0.7 * hash3(i, j, 0, seed + 2)
    const dx = x - sx, dy = y - sy
    const d2 = dx * dx + dy * dy
    if (d2 < best) { best = d2; bh = hash3(i, j, 0, seed + 4); bdx = dx; bdy = dy }
  }
  return { d: Math.sqrt(best), h: bh, dx: bdx, dy: bdy }
}


// ── THE FIELD IS THE FORM ──────────────────────────────────────────────────────
// ⭐⭐ RULED BY JACOB, 2026-09-21: *"I am thinking of macro distortions from noise
// displacement; fractal noise can have big and small areas, sharp and soft; lots of
// detail but totally procedural."* ⛔ So this is NOT a smooth shell with roughness
// added. The derived shell (the `__water__` arc · the per-vertex crest · the repose
// angle) is only the ENVELOPE. Everything from boulder-scale masses down to grain
// is one fractal field across its octaves.
//
// ⭐⭐⭐ AND THAT IS WHAT SETTLES THE VERTEX BUDGET, rather than trading against it:
// the octave that breaks the SILHOUETTE is the LONGEST one, and a long wavelength
// needs the FEWEST vertices to represent — about 3 per wavelength, not "as fine as
// we can afford". ⇒ the mesh step is set by the shortest wavelength we want IN THE
// OUTLINE; every octave above that belongs to the shader's normals.

/** Signed value noise in [-0.5, 0.5]. */
const sn = (x, y, z, s) => valueNoise3(x, y, z, s) - 0.5
/** Ridged: sharp creases and edges — freshly-quarried, angular rock. */
const ridged = (x, y, z, s) => 0.5 - Math.abs(2 * sn(x, y, z, s))

/**
 * The displacement field, as a WORLD VECTOR. Three decorrelated components, so the
 * offset has a tangential part as well as a normal one — ⭐ which is where the
 * folds and overhangs come from. A purely normal-aligned field cannot overhang at
 * any amplitude, and `tangential: 0` is exactly that control.
 *
 * @param lam0    the longest wavelength, metres (the macro masses)
 * @param amp0    its amplitude, metres
 * @param octaves how many octaves the GEOMETRY carries. ⭐ The rest are the
 *                shader's job; this number is the probe's headline.
 * @param uniform true = one sharpness and one amplitude everywhere (THE CONTROL —
 *                it is what makes a noise surface read as a TEXTURE)
 */
function fieldAt(x, y, z, { lam0, amp0, octaves, seed, uniform, cellAt = 1 }) {
  // ⭐ DOMAIN WARP — displace the field's own input by another, longer field. It is
  // what stops it reading as noise and starts it reading as geology: strata bend
  // and masses lean instead of sitting in an isotropic mush.
  const wf = 1 / (lam0 * 3)
  const wa = lam0 * 0.35
  const wx = x + wa * sn(x * wf, y * wf, z * wf, seed + 811)
  const wy = y + wa * sn(x * wf, y * wf, z * wf, seed + 812)
  const wz = z + wa * sn(x * wf, y * wf, z * wf, seed + 813)

  // ⭐ "BIG AND SMALL AREAS, SHARP AND SOFT" — two very-low-frequency modulators, so
  // the character itself varies ALONG the shore: angular broken rock in one stretch,
  // worn stone in another, chunky here and fine there. ⛔ One setting everywhere is
  // the failure mode; `uniform` pins them to show it.
  const mf = 1 / (lam0 * 6)
  const sharp = uniform ? 0.5 : valueNoise3(x * mf, y * mf, z * mf, seed + 401)
  const chunk = uniform ? 1.0 : 0.55 + 1.05 * valueNoise3(x * mf * 1.7, y * mf * 1.7, z * mf * 1.7, seed + 402)

  let ox = 0, oy = 0, oz = 0
  let f = 1 / lam0, a = amp0 * chunk
  for (let o = 0; o < octaves; o++) {
    // Each octave is a blend of soft (rolling, worn) and ridged (creased, angular).
    const comp = (sd) => (1 - sharp) * sn(wx * f, wy * f, wz * f, sd) + sharp * ridged(wx * f, wy * f, wz * f, sd)
    ox += a * comp(seed + o * 131 + 1)
    oy += a * comp(seed + o * 131 + 2)
    oz += a * comp(seed + o * 131 + 3)
    f *= 2.0; a *= 0.52
  }
  // ⭐ ONE CELLULAR OCTAVE AT BLOCK SCALE, layered into the stack rather than
  // replacing it. Worley's partition is what makes blocks read AS blocks; the
  // fractal stack above is what stops the whole wall reading as one repeated cell.
  const w = worley(x / cellAt, y / cellAt, z / cellAt, seed + 909)
  const cell = cellAt * 0.22 * ((w.h - 0.5) * 1.4 + (0.55 - Math.min(0.55, w.d)))
  return { ox, oy, oz, cell, sharp, chunk }
}

/**
 * Build the drape.
 *
 * @param poly      [{x,z}] shoreline; right-hand normal points at the water
 * @param crestAt   (t 0..1) => metres of wall above the water plane
 * @param waterY    the water plane
 * @param noise     'cellular' | 'fbm'
 * @param quadsPerBlock  how many quads span one block. ⛔⛔ THIS IS THE REAL COST
 *                  OF THE GATHERED DRAPE AND IT IS NOT FREE: you cannot gather a
 *                  coarse mesh — buckling needs vertices to fold with. Measured
 *                  in the harness, ▶ see the resolution sweep in the report.
 * @param gather    0 = normal displacement only (the control, smooth outline);
 *                  0.5–0.8 = pleated. ⛔ Not an authored knob — the harness sweeps
 *                  it to find where the read changes; the shipped value would be
 *                  a single constant like the repose angle.
 * @param tRange    [t0,t1] fraction of the shoreline to cover (the harness uses
 *                  this to put two approaches on one shore, side by side)
 * @returns { geometry, stats }
 */
export function revetmentDrape({ poly, crestAt, waterY = 0, noise = 'cellular', octaves = 3, gather = DRAPE_DEFAULT_GATHER, uniform = false, faceted = false, tRange = [0, 1], seed = 99 } = {}) {
  // ── the spine, resampled at the resolution the blocks need ──────────────────
  const segs = []
  let total = 0
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i]
    const L = Math.hypot(b.x - a.x, b.z - a.z)
    if (L < 1e-9) continue
    segs.push({ a, b, L, s0: total }); total += L
  }
  // Block size is set by the tallest crest in range — one resolution for the
  // strip, because a mesh with a varying step is a mesh with seams.
  let hMax = 0
  for (let k = 0; k <= 200; k++) {
    const t = tRange[0] + (tRange[1] - tRange[0]) * (k / 200)
    hMax = Math.max(hMax, crestAt(t))
  }
  const blk = d50For(hMax)
  // ⭐⭐ THE VERTEX BUDGET, DERIVED RATHER THAN CHOSEN. The macro masses are several
  // stones across; each further octave halves the wavelength. The shortest octave
  // the GEOMETRY carries is lam0 / 2^(octaves-1), and representing a wavelength
  // needs ~`VERTS_PER_WAVELENGTH` vertices — 3, not "as many as we can afford".
  // ⛔ Everything above that octave is the shader's, and costs no vertices at all.
  const lam0 = blk * MACRO_WAVELENGTHS_PER_BLOCK
  const amp0 = blk * MACRO_AMPLITUDE_PER_BLOCK
  const lamMin = lam0 / Math.pow(2, Math.max(0, octaves - 1))
  const step = lamMin / VERTS_PER_WAVELENGTH

  const at = (s) => {
    const sg = segs.find(g => s < g.s0 + g.L) || segs[segs.length - 1]
    const f = (s - sg.s0) / sg.L
    const ux = (sg.b.x - sg.a.x) / sg.L, uz = (sg.b.z - sg.a.z) / sg.L
    return { x: sg.a.x + (sg.b.x - sg.a.x) * f, z: sg.a.z + (sg.b.z - sg.a.z) * f, nx: uz, nz: -ux, t: s / total }
  }

  const s0 = tRange[0] * total, s1 = tRange[1] * total
  const nAlong = Math.max(2, Math.round((s1 - s0) / step) + 1)
  // Across: the slope face is h/tan(repose) long in plan, so its run varies with
  // the crest. The grid is parameterised on u (0 = crest, 1 = toe) and the
  // spacing in metres therefore varies along the shore — correct, because the
  // face really is wider where the wall is taller.
  // ⭐⭐ THE DOMAIN IS WIDER THAN THE BAND, ON PURPOSE. u now runs U_LO…U_HI, past
  // both the crest and the toe, and the actual edge is TRIMMED out of it by a noise
  // contour below. ⛔ THE EDGE MUST BE WHERE THE STONE RUNS OUT, NOT WHERE THE MESH
  // ENDS — a constant-width offset from the shore arc is the beaded-necklace failure
  // rotated 90°: mechanical regularity along the length instead of in the spacing.
  // (Jacob, 2026-09-21: *"if the edges were less mechanically sharp they would
  // likely work better."*) This outranks any amount of surface detail, because a
  // ruled line is wrong at every distance and in every render.
  const span = U_HI - U_LO
  const nAcross = Math.max(3, Math.round(Math.hypot(hMax / TAN_REPOSE, hMax) * span / step) + 1)

  const pos = new Float32Array(nAlong * nAcross * 3)
  const keep = new Uint8Array(nAlong * nAcross)
  const idx = []
  const inv = 1 / blk

  for (let i = 0; i < nAlong; i++) {
    const st = at(s0 + ((s1 - s0) * i) / (nAlong - 1))
    const h = crestAt(st.t)
    const run = h / TAN_REPOSE
    // The face's own length and its down-slope unit vector — the sheet's second
    // axis. ⛔ Using the PLAN run here instead would squash the cells wherever the
    // wall is tall, i.e. exactly where the stone is most visible.
    const faceLen = Math.hypot(run, h) || 1
    const ux = -st.nz, uz = st.nx                  // along-shore unit (n is the right-hand normal)
    const adx = (st.nx * run) / faceLen, ady = -h / faceLen, adz = (st.nz * run) / faceLen
    for (let j = 0; j < nAcross; j++) {
      const u = U_LO + span * (j / (nAcross - 1))       // 0 crest … 1 toe, and past both
      // ── the smooth shell: a ruled surface from crest to toe at the angle of repose
      // ⛔⛔ AND IT MUST NOT KEEP CLIMBING PAST THE CREST. The domain runs past u=0 so
      // the edge can be trimmed out of it — but extending the SLOPE backwards puts
      // sheet up in the air, leaning landward over the yard with nothing beneath it.
      // ⭐ MEASURED, and it is the defect I chased through two wrong suspects: at a
      // grazing angle those flaps are the "blades" I blamed first on the tangential
      // gather and then on the trim. Both were innocent (no triangle in the mesh has
      // an edge over 0.56 m). Above the crest the stone lies FLAT on the bank, which
      // is what the measured ground does — nearly level, then a drop at the line.
      const uu = Math.max(0, u)                    // the slope face only
      const over = Math.max(0, -u) * run           // …and a flat apron behind the crest
      let x = st.x + st.nx * (uu * run - over)
      let y = waterY + h * (1 - uu)
      let z = st.z + st.nz * (uu * run - over)
      // ── the shell's own normal, analytically: the slope face leans waterward
      const cosR = Math.cos(Math.atan(1 / TAN_REPOSE))
      const ny = Math.cos(Math.atan(TAN_REPOSE))         // ≈ 0.82 at 35°
      const nh = Math.sin(Math.atan(TAN_REPOSE))         // ≈ 0.57
      let vnx = st.nx * nh, vny = ny, vnz = st.nz * nh
      void cosR
      let d = 0, gx = 0, gy = 0, gz = 0
      // ── THE FIELD. ⛔ Not "the shell plus roughness" — the shell is the envelope
      // and this is the form. `octaves` is how much of it the GEOMETRY carries.
      // ⛔ NO PIN. The displacement used to be clamped to zero at u=0 and u=1,
      // which is precisely what ruled the edge straight. It now carries past the
      // nominal band and the boundary is decided by `keep` below.
      const pin = 1
      if (noise === 'cellular') {
        const F = fieldAt(x, y, z, { lam0, amp0, octaves, seed, uniform, cellAt: blk })
        // Split the vector into its normal and tangential parts so the tangential
        // gain can be turned OFF — that is the control for "do the low octaves
        // alone produce the overhangs, or is a separate gather needed?"
        const dn = F.ox * vnx + F.oy * vny + F.oz * vnz
        const tx = F.ox - dn * vnx, ty = F.oy - dn * vny, tz = F.oz - dn * vnz
        const g = gather * pin              // tangential gain (0 = normal-only control)
        gx = tx * g; gy = ty * g; gz = tz * g
        d = (dn + F.cell) * pin
      } else {
        // fBm only, no cellular octave, no modulation, no warp — the plain control.
        const amp = blk * 0.55
        d = pin * (amp * 1.6 * fbm3(x / lam0, y / lam0, z / lam0, seed, 4)
          + amp * 0.22 * fbm3(x * 5 / lam0, y * 5 / lam0, z * 5 / lam0, seed + 31, 2))
      }
      x += vnx * d + gx; y += vny * d + gy; z += vnz * d + gz
      const o = (i * nAcross + j) * 3
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z
      // ⭐ THE EDGE, AS A CONTOUR OF TWO FIELDS. A long one makes the band's own
      // half-width WANDER (the toe and the crest are not parallel to the arc); a
      // short one makes the boundary RAGGED at stone scale, so it ends the way a
      // heap of rock ends rather than the way a ribbon does.
      const sArc = s0 + ((s1 - s0) * i) / (nAlong - 1)
      const wob = (f, sd) => sn(sArc * f, 0.5, 0.5, seed + sd)
      // ⛔⛔ THE RAGGED TERM'S WAVELENGTH IS A NYQUIST CONSTRAINT, NOT A TASTE —
      // MEASURED FAILURE 2026-09-21. It was first written at ~1 block (0.9 m) while
      // the mesh step at 3 octaves is 0.28 m, so the boundary flipped in and out
      // faster than whole quads could follow: alternate columns were dropped and the
      // band came apart into COMB TEETH — long parallel blades that I nearly
      // misdiagnosed as the tangential gather tearing the sheet. ⭐ It is not: the
      // gather was innocent, and sweeping it 0.6→0.15 barely moved the picture,
      // which is the tell that the suspect was wrong. The boundary field must be
      // several blocks long so the trim can resolve it.
      const crestEdge = 0.0 - EDGE_WANDER * (0.5 + wob(1 / (lam0 * 2.5), 71)) - EDGE_RAGGED * wob(1 / (blk * EDGE_RAGGED_BLOCKS), 72)
      const toeEdge = 1.0 + EDGE_WANDER * (0.5 + wob(1 / (lam0 * 2.2), 73)) + EDGE_RAGGED * wob(1 / (blk * EDGE_RAGGED_BLOCKS * 0.85), 74)
      keep[i * nAcross + j] = (u >= crestEdge && u <= toeEdge) ? 1 : 0
      if (i && j) {
        const a = (i - 1) * nAcross + (j - 1), b = (i - 1) * nAcross + j, c = i * nAcross + (j - 1), e = i * nAcross + j
        // ⛔ A quad survives only if ALL FOUR corners are inside the contour, so the
        // boundary is a staircase of whole quads at stone scale — an edge, not a
        // feathered fade. A fade would read as fog, which is the plausible-looking
        // wrong answer here.
        // ⛔ 3-of-4, not 4-of-4. Requiring all four corners punches a hole for every
        // single boundary vertex and shreds the edge into teeth; 3-of-4 lets the
        // boundary staircase instead of perforating.
        if (keep[a] + keep[b] + keep[c] + keep[e] >= 3) idx.push(a, c, b, b, c, e)
      }
    }
  }

  // ⛔ COMPACT. The grid is built wider than the band so the edge can be cut out of
  // it; the trimmed-away vertices are still sitting in `pos` and would ship in the
  // slab as bytes nothing references. Remap to only what the index uses.
  const remap = new Int32Array(nAlong * nAcross).fill(-1)
  const packed = []
  const idx2 = new Array(idx.length)
  for (let k = 0; k < idx.length; k++) {
    const v = idx[k]
    if (remap[v] < 0) { remap[v] = packed.length / 3; packed.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) }
    idx2[k] = remap[v]
  }

  let geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(packed), 3))
  geo.setIndex(idx2)
  // ⭐⭐ INDEXED OR NOT IS A 3× SLAB-BYTES DECISION, MEASURED: flat shading needs
  // per-face normals, which means un-indexing, which TRIPLES the vertex count —
  // the triangle count does not move, so a triangle-only budget cannot see it. An
  // indexed strip with smooth normals stores one vertex per grid point instead of
  // six, and the FACETING comes back from the shader (`revetmentMaterial`, which
  // rebuilds the normal from screen-space derivatives anyway).
  // ⛔ So `faceted: true` is a 3× slab cost for a look the shader already provides.
  // ⛔ FLAT SHADING IS LOAD-BEARING, NOT A STYLE. Smooth normals average the cell
  // step away and the drape goes straight back to looking like dunes. Non-indexed
  // triples the vertex count and leaves the TRIANGLE count untouched, which is
  // the count that matters here.
  // ⛔⛔ WINDING FOLLOWS THE WALK DIRECTION, AND THAT IS A REAL TRAP. The quad order
  // above is fixed, so reversing the shoreline's direction turns the whole sheet
  // inside out: normals point DOWN, the lit face becomes the hidden one, and the
  // revetment renders as a dark ribbon with correct geometry and correct position.
  // ⭐ MEASURED — it happened the moment the harness's demo shore was walked the
  // other way to put the water on the correct side. A revetment's outward face is
  // knowable (it is the one pointing up and waterward), so normalise to it — and
  // ⛔ SAY SO IN `stats` rather than fixing it silently, because a scene that needed
  // the flip is telling you its arc is wound the other way and that may matter
  // somewhere this module cannot see.
  let flipped = false
  {
    const P = geo.attributes.position.array, I = geo.index.array
    let sum = 0
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2]
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
      sum += uz * vx - ux * vz          // the y component of u × v
    }
    if (sum < 0) {
      flipped = true
      for (let k = 0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t }
    }
  }

  if (faceted) geo = geo.toNonIndexed()
  geo.computeVertexNormals()
  geo.computeBoundingSphere()

  const tris = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3

  // ⭐⭐ THE TWO NUMBERS THAT ANSWER "IS THIS STONE OR A PATTERNED SURFACE", and they
  // are counted off the triangles rather than judged by eye:
  //   · AREA RATIO — crumpled foil has substantially MORE sheet than the surface it
  //     covers. That is what "gathered" MEANS. A ratio near 1 is a bumpy sheet.
  //   · DOWNWARD-FACING FRACTION — an overhang is a face whose normal points below
  //     the horizon. No overhangs ⇒ no sky between stones ⇒ no objects.
  // ⛔ Measured 2026-09-21 at every setting this probe can reach: ratio 1.0–1.2 and
  // 0.1–2.0% downward. It is NOT buckling. Reported so nobody has to take the eye's
  // word for it, and so a later attempt can be scored against the same two numbers.
  let nDown = 0, area = 0, nTri = 0
  {
    const P = geo.attributes.position.array, I = geo.index.array
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2]
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const L = Math.hypot(nx, ny, nz)
      if (L < 1e-12) continue
      area += L / 2; nTri++
      if (ny / L < 0) nDown++
    }
  }
  const length = s1 - s0
  return {
    geometry: geo,
    stats: {
      tris, length, nAlong, nAcross, blockSize: blk, step, gather, noise, uniform,
      octaves, lam0, amp0, lamMin,
      trisPer100m: Math.round((tris / Math.max(1e-6, length)) * 100),
      faceted,
      kept: keep.reduce((a, b) => a + b, 0), gridVerts: keep.length,
      flipped,
      sheetArea: area, downwardPct: nTri ? (100 * nDown) / nTri : 0,
      bytes: geo.attributes.position.array.byteLength
           + geo.attributes.normal.array.byteLength
           + (geo.index ? geo.index.array.byteLength : 0),
    },
  }
}
