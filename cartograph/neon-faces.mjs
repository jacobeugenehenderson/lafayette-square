/**
 * neon-faces.mjs — where each PLACE's neon goes on its building (BRIEF-neon-reads-at-every-distance §3.3, Argon
 * 2026-10-06). Neon belongs to a place, not a building: the bake ships, per building, the stretches of wall a place
 * can light, and the player (src/lib/neonPlaces.js) joins an open place to one by its address.
 *
 *   faces     [{ key, pts, y }]     — an ADDRESS's stretch: the face its address point marks, among the faces toward
 *                                     the address's own street (an address names the street its entrance faces). A point
 *                                     marks the face and the order of the entrances along it, NOT the door
 *                                     (BRIEF-building-detail-stoops-and-facades §2), so addresses sharing one face
 *                                     split it at the midpoints between their points, in their order along it.
 *   frontage  [{ street, pts, y }]  — the building's face toward each named street it fronts: for a place with no
 *                                     face evidence, its own street's frontage (the player counts every such use).
 *
 * A FACE is a run of the footprint whose turns are under FACE_TURN — the wall reads as one plane. `pts` are on the
 * wall, in footprint order (the player offsets them outward and knows the winding from the footprint). `y` is the eave
 * the stretch sits under: one per building today; a stepped roof gives each stretch its own.
 * Keys are src/lib/addressKey.js — the one canonical form the player matches against.
 */
import { addressKey, addressParts, streetKey, streetLoose } from '../src/lib/addressKey.js'

// ⭐ The turn (radians) at which the wall stops being one face — an angle, so it means the same on every town and scale.
const FACE_TURN = 20 * Math.PI / 180
const r2 = (v) => Math.round(v * 100) / 100

function pointInRing(x, z, ring) {
  let o = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j]
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) o = !o
  }
  return o
}

/** The footprint as faces: [{ pts: [[x,z]…], nx, nz, len }] — each a run of edges under FACE_TURN, outward normal. */
export function facesOf(fp) {
  const n = fp.length
  if (n < 3) return []
  // outward sign: probe the first edge's midpoint (robust to either winding — NeonBands.jsx#detectOutwardSign)
  const ex0 = fp[1][0] - fp[0][0], ez0 = fp[1][1] - fp[0][1], l0 = Math.hypot(ex0, ez0) || 1
  const ws = pointInRing((fp[0][0] + fp[1][0]) / 2 + ez0 / l0 * 0.01, (fp[0][1] + fp[1][1]) / 2 - ex0 / l0 * 0.01, fp) ? -1 : 1
  const edge = (i) => { const a = fp[i], b = fp[(i + 1) % n]; const ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez) || 1; return { a, b, L, nx: ws * ez / L, nz: -ws * ex / L } }
  const edges = Array.from({ length: n }, (_, i) => edge(i))
  const turnAt = (i) => { const p = edges[(i - 1 + n) % n], q = edges[i]; return Math.acos(Math.max(-1, Math.min(1, p.nx * q.nx + p.nz * q.nz))) }
  const breaks = []
  for (let i = 0; i < n; i++) if (turnAt(i) >= FACE_TURN) breaks.push(i)
  if (!breaks.length) breaks.push(0)                    // a smooth outline (a round tower) is one face
  const faces = []
  for (let k = 0; k < breaks.length; k++) {
    const s = breaks[k], e = breaks[(k + 1) % breaks.length]
    const count = ((e - s + n) % n) || n
    const pts = [], idx = []
    for (let j = 0; j <= count; j++) pts.push(fp[(s + j) % n])
    for (let j = 0; j < count; j++) idx.push((s + j) % n)
    let nx = 0, nz = 0, len = 0
    for (const i of idx) { nx += edges[i].nx * edges[i].L; nz += edges[i].nz * edges[i].L; len += edges[i].L }
    const nl = Math.hypot(nx, nz) || 1
    faces.push({ pts, nx: nx / nl, nz: nz / nl, len })
  }
  return faces
}

/** Closest point on a polyline: { d, s (arc length), x, z }. */
function closestOn(pts, x, z) {
  let best = { d: Infinity, s: 0, x: 0, z: 0 }, acc = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]
    const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez, L = Math.sqrt(L2) || 0
    const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)) : 0
    const cx = ax + ex * t, cz = az + ez * t, d = Math.hypot(x - cx, z - cz)
    if (d < best.d) best = { d, s: acc + L * t, x: cx, z: cz }
    acc += L
  }
  return best
}

/** The sub-polyline between arc lengths s0..s1. */
function slice(pts, s0, s1) {
  const out = []
  let acc = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]
    const L = Math.hypot(bx - ax, bz - az)
    const lo = Math.max(s0, acc), hi = Math.min(s1, acc + L)
    if (hi > lo && L > 0) {
      const at = (s) => [ax + (bx - ax) * (s - acc) / L, az + (bz - az) * (s - acc) / L]
      if (!out.length) out.push(at(lo))
      out.push(at(hi))
    }
    acc += L
  }
  return out.map(([x, z]) => [r2(x), r2(z)])
}

/**
 * The named streets as a nearest-facing index. `streets` = [{ name, synthetic?, points: [{x,z}…] }] (the skeleton's).
 * nearestFacing(x, z, nx, nz) → { street, d } — the nearest street point lying in front of the face (on its outward
 * side), or null when none does.
 */
export function streetIndex(streets, cell = 50) {
  const segs = [], grid = new Map(), key = (i, j) => `${i},${j}`
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const s of streets) {
    // ⛔ A `synthetic` name is the skeleton's label for an unnamed way ("motorway_link 48") — no place is addressed on
    // it, and as a frontage it steals the face in front of it from the street the place IS on.
    const k = s.synthetic ? null : streetKey(s.name)
    if (!k || !(s.points?.length >= 2)) continue
    for (let i = 0; i < s.points.length - 1; i++) {
      const a = s.points[i], b = s.points[i + 1], id = segs.length
      segs.push({ k, ax: a.x, az: a.z, bx: b.x, bz: b.z })
      for (let gi = Math.floor(Math.min(a.x, b.x) / cell); gi <= Math.floor(Math.max(a.x, b.x) / cell); gi++)
        for (let gj = Math.floor(Math.min(a.z, b.z) / cell); gj <= Math.floor(Math.max(a.z, b.z) / cell); gj++) {
          const g = key(gi, gj); if (!grid.has(g)) grid.set(g, []); grid.get(g).push(id)
        }
      x0 = Math.min(x0, a.x, b.x); x1 = Math.max(x1, a.x, b.x); z0 = Math.min(z0, a.z, b.z); z1 = Math.max(z1, a.z, b.z)
    }
  }
  const maxRing = Math.ceil(Math.max(x1 - x0, z1 - z0) / cell) + 1
  return {
    size: segs.length,
    nearestFacing(x, z, nx, nz) {
      const ci = Math.floor(x / cell), cj = Math.floor(z / cell)
      let best = null
      const seen = new Set()
      for (let ring = 0; ring <= maxRing; ring++) {
        if (best && (ring - 1) * cell > best.d) break
        for (let gi = ci - ring; gi <= ci + ring; gi++) for (let gj = cj - ring; gj <= cj + ring; gj++) {
          if (Math.max(Math.abs(gi - ci), Math.abs(gj - cj)) !== ring) continue
          for (const id of grid.get(key(gi, gj)) || []) {
            if (seen.has(id)) continue
            seen.add(id)
            const s = segs[id], ex = s.bx - s.ax, ez = s.bz - s.az, L2 = ex * ex + ez * ez
            const t = L2 ? Math.max(0, Math.min(1, ((x - s.ax) * ex + (z - s.az) * ez) / L2)) : 0
            const px = s.ax + ex * t, pz = s.az + ez * t
            if ((px - x) * nx + (pz - z) * nz <= 0) continue   // behind the face
            const d = Math.hypot(px - x, pz - z)
            if (!best || d < best.d) best = { street: s.k, d }
          }
        }
      }
      return best
    },
  }
}

/**
 * One building's neon stretches. `footprint` [[x,z]…] as baked · `y` its eave · `points` the address points the
 * address join found for it ({address, x, z}: inside its footprint or its parcel) · `streets` a streetIndex.
 */
export function neonFacesFor({ footprint, y, points, streets }) {
  const faces = facesOf(footprint)
  if (!faces.length) return { faces: [], frontage: [] }

  // ── each face labelled by the street in front of it; per street, the face nearest it is the frontage ──
  const byStreet = new Map()
  const label = faces.map(() => null)
  if (streets?.size) for (const [fi, face] of faces.entries()) {
    const half = face.len / 2   // the face's midpoint, by arc length
    let acc = 0, mx = face.pts[0][0], mz = face.pts[0][1]
    for (let i = 0; i < face.pts.length - 1; i++) {
      const [ax, az] = face.pts[i], [bx, bz] = face.pts[i + 1], L = Math.hypot(bx - ax, bz - az)
      if (acc + L >= half && L > 0) { const t = (half - acc) / L; mx = ax + (bx - ax) * t; mz = az + (bz - az) * t; break }
      acc += L
    }
    const hit = streets.nearestFacing(mx, mz, face.nx, face.nz)
    if (!hit) continue
    label[fi] = hit.street
    const cur = byStreet.get(hit.street)
    if (!cur || hit.d < cur.d) byStreet.set(hit.street, { d: hit.d, face })
  }
  // ── address faces ──
  const onFace = faces.map(() => new Map())        // face → key → [arc positions]
  for (const p of points || []) {
    const key = addressKey(p.address)
    if (!key) continue
    const inside = pointInRing(p.x, p.z, footprint)
    // ⭐ An address names the street its entrance faces: the point marks a face AMONG those toward its own street;
    // only a building that fronts no such street takes the nearest face. (A parcel point can lie nearer the rear.)
    const own = streetLoose(addressParts(p.address).street)
    const toward = faces.map((_, f) => label[f] && streetLoose(label[f]) === own)
    const anyToward = toward.some(Boolean)
    let best = null
    for (let f = 0; f < faces.length; f++) {
      if (anyToward && !toward[f]) continue
      const c = closestOn(faces[f].pts, p.x, p.z)
      // a point outside the building marks the face that faces it; one inside, the nearest wall
      if (!inside && (p.x - c.x) * faces[f].nx + (p.z - c.z) * faces[f].nz < 0) continue
      if (!best || c.d < best.c.d) best = { f, c }
    }
    if (!best) for (let f = 0; f < faces.length; f++) { if (anyToward && !toward[f]) continue; const c = closestOn(faces[f].pts, p.x, p.z); if (!best || c.d < best.c.d) best = { f, c } }
    const m = onFace[best.f]
    if (!m.has(key)) m.set(key, [])
    m.get(key).push(best.c.s)
  }
  const out = []
  faces.forEach((face, f) => {
    const keys = [...onFace[f].entries()].map(([key, ss]) => ({ key, s: ss.reduce((a, b) => a + b, 0) / ss.length })).sort((a, b) => a.s - b.s)
    keys.forEach((k, i) => {
      const s0 = i === 0 ? 0 : (keys[i - 1].s + k.s) / 2
      const s1 = i === keys.length - 1 ? face.len : (k.s + keys[i + 1].s) / 2
      const pts = slice(face.pts, s0, s1)
      if (pts.length >= 2) out.push({ key: k.key, pts, y: r2(y) })
    })
  })

  const frontage = [...byStreet.entries()].map(([street, { face }]) => ({ street, pts: face.pts.map(([x, z]) => [r2(x), r2(z)]), y: r2(y) }))
  return { faces: out, frontage }
}
