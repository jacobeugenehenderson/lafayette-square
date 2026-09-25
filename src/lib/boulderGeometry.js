/**
 * boulderGeometry.js — PROCEDURAL ROCK. Three generators, one seed, no assets.
 *
 * ⭐ WHY PROCEDURAL AND NOT A LIBRARY (ruled 2026-09-21, Jacob): *"I have thought
 * we'd do procedural boulders, as they're random and natural."* The tree doctrine
 * — you pick from ~241, you never grow one — is deliberately NOT extended to rock.
 * A stone has no species, no canopy, no bark rubric: it has a size, a silhouette
 * and a rest pose, all three of which a hash can supply.
 *
 * ⛔ NO AUTHORED PARAMETERS. Every knob below has a default that is a property of
 * ROCK, not of a town, and every call site passes a SEED rather than a setting.
 * A seed is not a control: it is the position the stone happens to sit at.
 *
 * ⭐⭐ THE ONE THING INSTANCING CANNOT DO, STATED UP FRONT SO NOBODY DISCOVERS IT
 * LATE: an `InstancedMesh` draws ONE geometry N times. So "every boulder unique"
 * is false and cannot be made true at this cost. What you get is
 *   (a few unique shapes) × (free rotation) × (free non-uniform scale) × (free tint)
 * and the perceptual work is done by (b)(c)(d), not by (a). Measured on the
 * harness: a dozen shapes is already past the point where the eye can find the
 * repeat, because no two instances share an orientation. ⛔ Raising the shape
 * count costs a DRAW CALL each, which is the expensive axis; raising the rotation
 * and scale variance costs nothing at all. Spend there.
 *
 * ▶ See them: http://localhost:5173/lab.html?look=huron&at=revetment   (vite is already running; ⛔ do not start another)
 */

import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// ── Determinism ───────────────────────────────────────────────────────────────
// mulberry32: 32-bit, no dependency, identical on every machine. ⛔ Never Math.random()
// in here — a boulder that moves between bakes is a boulder that cannot be checked.
export function rng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Integer hash of a world position → a seed. The brief's "position-seeded noise". */
export function seedAt(x, z, salt = 0) {
  let h = Math.imul(Math.round(x * 1000) ^ 0x85ebca6b, 0xcc9e2d51)
  h = Math.imul((h >>> 13) ^ Math.round(z * 1000), 0x1b873593)
  h = Math.imul((h >>> 11) ^ (salt | 0), 0x85ebca6b)
  return (h ^ (h >>> 16)) >>> 0
}

// 3D value noise. Continuous in POSITION, which is the load-bearing property:
// `IcosahedronGeometry` is non-indexed, so the same corner appears in several
// triangles as separate vertices. A displacement that is a pure function of
// position moves those copies identically and the seam cannot open. ⛔ A
// per-vertex random would tear the mesh into confetti and it would look like a
// shading bug, not a topology bug.
const h3 = (i, j, k, s) => {
  let n = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(k, 0x9e3779b9) ^ Math.imul(s, 0x85ebca6b)
  n = Math.imul(n ^ (n >>> 15), 0x2545f491)
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296
}
const smooth = t => t * t * (3 - 2 * t)
function valueNoise3(x, y, z, s) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z)
  const fx = smooth(x - i), fy = smooth(y - j), fz = smooth(z - k)
  const L = (a, b, t) => a + (b - a) * t
  const c = (di, dj, dk) => h3(i + di, j + dj, k + dk, s)
  return L(
    L(L(c(0, 0, 0), c(1, 0, 0), fx), L(c(0, 1, 0), c(1, 1, 0), fx), fy),
    L(L(c(0, 0, 1), c(1, 0, 1), fx), L(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  )
}
function fbm(x, y, z, s, octaves = 3) {
  let v = 0, amp = 1, norm = 0, f = 1
  for (let o = 0; o < octaves; o++) {
    v += amp * (valueNoise3(x * f, y * f, z * f, s + o * 7919) - 0.5)
    norm += amp; amp *= 0.5; f *= 2.1
  }
  return v / norm      // ≈ −0.5 … +0.5
}

// ── Rest pose ─────────────────────────────────────────────────────────────────
// A boulder that has been dumped, weathered or placed lies on its broad face.
// Every generator flattens in Y for that reason, not for a look: an un-flattened
// stone reads as a ball, and a field of balls reads as bubbles. These are the
// aspect ratios of quarried armour stone, which is specified by BLOCKINESS —
// the ratio of longest to shortest axis, conventionally kept under 3.
const restAxes = (r) => ({
  x: 1,
  y: 0.44 + r() * 0.30,      // 0.44 … 0.74 of the long axis
  z: 0.66 + r() * 0.32,      // 0.66 … 0.98
})

function applyAxes(geo, a) {
  geo.scale(a.x, a.y, a.z)
  // Re-centre on the bounding box so the instance transform's origin is the
  // stone's middle. ⛔ Without this the anisotropic scale walks the centroid and
  // a rotated instance appears to orbit its own position.
  geo.computeBoundingBox()
  const c = new THREE.Vector3()
  geo.boundingBox.getCenter(c)
  geo.translate(-c.x, -c.y, -c.z)
  return geo
}

/** Normalise so the geometry's longest horizontal axis is exactly 1 m.
 *  ⭐ This is what lets the caller think in D50 (median stone diameter, metres)
 *  and set size with a plain scalar scale. Without it every generator has its own
 *  private idea of "1" and a size in metres means nothing. */
function unitise(geo) {
  geo.computeBoundingBox()
  const s = geo.boundingBox.getSize(new THREE.Vector3())
  const d = Math.max(s.x, s.z) || 1
  geo.scale(1 / d, 1 / d, 1 / d)
  return geo
}

// ── ① CONVEX HULL OF A JITTERED POINT CLOUD — quarried armour stone ───────────
/**
 * Angular, flat-faced, sharp-edged: what comes off a blast face and what a
 * revetment is actually built from. The hull is doing the work — a spiky point
 * cloud becomes a blocky solid because every concave spike is discarded.
 *
 * ⭐ MEASURED, not estimated: `points` 12/16/20/26/32 → 20/26/34/40/40 tris. It
 * SATURATES around 40 — past ~24 points the radius jitter drops the extras
 * inside the hull and they cost nothing and add nothing. ⛔ So `points` is not an
 * unbounded detail dial; asking for a 200-tri hull rock by raising it does not
 * work, and that is a property of the method, not a bug.
 */
export function boulderHull({ seed = 1, points = 20, roughness = 0.42 } = {}) {
  const r = rng(seed)
  const pts = []
  // Fibonacci sphere for the base directions (even coverage, no pole clumping),
  // then jitter BOTH the direction and the radius. Direction jitter is what
  // breaks the hull's tell-tale regularity; radius jitter is what makes some
  // faces large and some small.
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < points; i++) {
    const y = 1 - (i / (points - 1)) * 2
    const rad = Math.sqrt(Math.max(0, 1 - y * y))
    const th = golden * i + r() * 0.9
    const jitter = 0.35
    const v = new THREE.Vector3(
      Math.cos(th) * rad + (r() - 0.5) * jitter,
      y + (r() - 0.5) * jitter,
      Math.sin(th) * rad + (r() - 0.5) * jitter,
    )
    if (v.lengthSq() < 1e-6) continue
    v.normalize().multiplyScalar(1 - roughness * r())
    pts.push(v)
  }
  const geo = new ConvexGeometry(pts)   // already non-indexed with per-face normals
  applyAxes(geo, restAxes(r))
  return unitise(geo)
}

// ── ② NOISE-DISPLACED ICOSPHERE — weathered fieldstone / glacial erratic ──────
/**
 * Rounded, lumpy, no sharp edge anywhere: a stone that has been in the water or
 * under ice. ⛔ This is NOT what a revetment is made of — dumped riprap is
 * angular by specification, because rounded stone rolls out. It is here because
 * a shoreline that is ALL freshly-quarried block reads as a gravel pile, and
 * because the comparison is the honest answer to "can noise displacement make
 * rock" — it can make a boulder, but not an armour stone.
 *
 * MEASURED: detail 0/1/2 → 20/80/180 tris (welded). detail 1 is the knee — 0 is
 * visibly an icosahedron, 2 buys smoothness the silhouette never shows.
 */
export function boulderNoise({ seed = 1, detail = 1, amplitude = 0.30, frequency = 1.6 } = {}) {
  const r = rng(seed)
  let geo = new THREE.IcosahedronGeometry(1, detail)
  const p = geo.attributes.position
  const v = new THREE.Vector3()
  // Two octaves' worth of scale: the low band makes the silhouette lopsided, the
  // high band makes the surface lumpy. One band alone gives either a potato or a
  // golf ball, and both read as fake.
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n = fbm(v.x * frequency, v.y * frequency, v.z * frequency, seed, 3)
    const big = fbm(v.x * 0.55, v.y * 0.55, v.z * 0.55, seed ^ 0x5bf03635, 1)
    v.multiplyScalar(1 + amplitude * n + 0.34 * big)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  // Weld before normals: the icosphere ships non-indexed, so an unwelded
  // computeVertexNormals() gives per-face normals and the stone facets like a
  // disco ball at every detail level. Welding is also a ~3× vertex-count cut.
  geo = mergeVertices(geo, 1e-5)
  geo.computeVertexNormals()
  applyAxes(geo, restAxes(r))
  return unitise(geo)
}

// ── ③ HALF-SPACE INTERSECTION — fractured block, the big-flat-face rock ───────
/**
 * The rock as the INTERSECTION of a handful of random half-spaces: literally how
 * a block comes off a jointed face, cleaved along planes. It gives what neither
 * of the others gives — a few BIG flat faces meeting at long straight arrises —
 * and that is the read that says "cut stone" rather than "lump".
 *
 * ⭐ Cheapest of the three by a wide margin (MEASURED: 5/7/9/12/16
 * planes → 32/36/36/40/52 tris)
 * because its triangle budget is spent on faces you can see rather than on
 * tessellation you cannot.
 *
 * ⛔ Boundedness is not optional: six axis planes are seeded first so the
 * intersection can never be an open (infinite) region. A random normal set CAN
 * fail to enclose the origin, and the failure mode is a hull that explodes to the
 * far clip plane — silent, plausible-looking garbage. This is the loud-failure
 * rule applied to geometry: the construction is made incapable of it.
 */
export function boulderFractured({ seed = 1, planes = 9, bias = 0.30 } = {}) {
  const r = rng(seed)
  const P = []   // {n: Vector3 (unit), d: number}  half-space  n·x ≤ d
  const push = (nx, ny, nz, d) => P.push({ n: new THREE.Vector3(nx, ny, nz).normalize(), d })
  for (const ax of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    push(ax[0], ax[1], ax[2], 0.80 + r() * 0.30)
  }
  for (let i = 0; i < planes; i++) {
    const z = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(Math.max(0, 1 - z * z))
    // `bias` pulls some planes in close, which is what carves the large faces.
    push(Math.cos(t) * s, z, Math.sin(t) * s, 0.62 + r() * (1.0 - bias))
  }
  // Every triple of planes meets at one point (unless near-parallel). Keep the
  // points that satisfy every OTHER plane — those are the polyhedron's corners.
  const verts = []
  const A = new THREE.Matrix3()
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) for (let k = j + 1; k < P.length; k++) {
    const a = P[i].n, b = P[j].n, c = P[k].n
    const det = a.dot(new THREE.Vector3().crossVectors(b, c))
    if (Math.abs(det) < 1e-6) continue
    A.set(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z).invert()
    const v = new THREE.Vector3(P[i].d, P[j].d, P[k].d).applyMatrix3(A)
    let inside = true
    for (let m = 0; m < P.length && inside; m++) if (P[m].n.dot(v) > P[m].d + 1e-6) inside = false
    if (inside) verts.push(v)
  }
  // ⛔ Fail loudly. Four non-coplanar points is the minimum for a solid; fewer
  // means the plane set degenerated and there is no rock. Returning a sphere here
  // would be a fallback, and a fallback in a generator is a lie that renders.
  if (verts.length < 4) throw new Error(`boulderFractured: seed ${seed} produced a degenerate solid (${verts.length} corners)`)
  const geo = new ConvexGeometry(verts)
  applyAxes(geo, restAxes(r))
  return unitise(geo)
}

/** The three, by name, for the harness and for any caller that wants a mix. */
export const GENERATORS = {
  fractured: boulderFractured,
  hull: boulderHull,
  noise: boulderNoise,
}

/**
 * A PALETTE: `count` distinct unit-sized geometries drawn from the generators in
 * the given mix. This is the unit of cost — ⭐ **one palette entry = one draw
 * call**, no matter how many stones are placed on it. Choose the count by draw
 * call budget, never by how varied you want the shore to look; variety comes
 * from the transform.
 */
export function boulderPalette({ count = 12, seed = 1337, mix = ['fractured', 'fractured', 'hull', 'noise'] } = {}) {
  const r = rng(seed)
  const out = []
  for (let i = 0; i < count; i++) {
    const kind = mix[i % mix.length]
    const s = (seed + i * 2654435761) >>> 0
    const geo = kind === 'noise'
      ? boulderNoise({ seed: s, detail: 1, amplitude: 0.26 + r() * 0.16 })
      : kind === 'hull'
        ? boulderHull({ seed: s, points: 16 + Math.floor(r() * 10) })
        : boulderFractured({ seed: s, planes: 7 + Math.floor(r() * 6) })
    geo.userData.kind = kind
    geo.userData.seed = s
    geo.userData.tris = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3
    out.push(geo)
  }
  return out
}

/** Triangles in a geometry — the honest count, indexed or not. */
export const triCount = g => (g.index ? g.index.count : g.attributes.position.count) / 3
