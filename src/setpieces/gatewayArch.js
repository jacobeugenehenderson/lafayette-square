/**
 * The Gateway Arch: where it stands on the globe. Pure, with no React or three, so the renderer
 * (`src/components/GatewayArch.jsx`), the plan silhouette (`src/cartograph/DesignerArch.jsx`) and the check
 * (`checks/claims-the-arch-stands-where-it-is.mjs`) read the SAME numbers.
 *
 * ⭐ THE ARCH IS A FACT OF THE WORLD, NOT OF A TOWN (BRIEF-the-arch-stands-where-it-is, Jacob 2026-10-28: "it's just
 * placed in its correct geographic center"). Every Look that carries an `arch` block projects these two feet through
 * its OWN place, so its distance and bearing (and the facing of a Look that authors no rotation) are derived.
 * It stands off the disc, on no building of the town, so it is geo-anchored, not building-bound (the set-piece slot,
 * SetPiece.jsx, is for a set-piece that stands on one of the town's buildings).
 *
 * SOURCE: OpenStreetMap relation 12813920 ("Gateway Arch", building:shape=arch, height=192, wikidata Q45234), its one
 * outer way 951594314 (113 distinct nodes), fetched 2026-10-28 from api.openstreetmap.org/api/0.6/relation/12813920/full.
 * Each foot is the mean of the 24 footprint nodes more than 60 m from the footprint's centroid along its principal axis
 * (the legs are 16.5 m thick across it). © OpenStreetMap contributors, ODbL 1.0. ⛔ Never fetched at runtime.
 */
import { projectorOf } from '../lib/townPlace.js'

export const GATEWAY_ARCH = Object.freeze({
  source: 'OpenStreetMap relation 12813920 (way 951594314), fetched 2026-10-28',
  attribution: '© OpenStreetMap contributors, ODbL 1.0',
  feet: Object.freeze([
    Object.freeze({ lat: 38.6252997, lon: -90.1846872 }),   // the north foot
    Object.freeze({ lat: 38.6239378, lon: -90.1852425 }),   // the south foot
  ]),
})

// Its shape: the NPS catenary, y = A − B·cosh(C·x), in metres. Base at y = 0, its span along local +X.
export const ARCH_A = 211.5
export const ARCH_B = 20.96
export const ARCH_C = 0.03292
export const PEAK_HEIGHT = ARCH_A - ARCH_B
export const HALF_SPAN = Math.acosh(ARCH_A / ARCH_B) / ARCH_C

/**
/**
 * How the Arch is drawn: its site, and the Look's own controls (skyLightChannels.js#ARCH_FLAT_DEFAULTS), which are
 * unchanged (Jacob, 2026-10-28: "the arch can keep all the height, foot, rotation, scale controls it already has, it's
 * just placed in its correct geographic center"; registry r-the-arch-is-geo-anchored-with-an-authored-presence).
 * ⛔ It PIVOTS AT THE APEX, deliberately: `scale` grows it from the top, so it gets wider AND THICKER (at true proportions
 * it reads thin) while the feet sink, and `footFade` dissolves the legs (the feet aren't modelled; it hides the ground
 * seam). Its height is the authored `yOffset`: the apex stands at yOffset + PEAK_HEIGHT whatever the scale. `rotation`
 * is authored; a Look that authors none faces it as it really stands. One definition for the 3D Arch, the plan
 * silhouette and the check.
 */
export function archPose(site, arch) {
  return {
    x: site.x, z: site.z,
    y: arch.yOffset + PEAK_HEIGHT * (1 - arch.scale),
    rotation: Number.isFinite(arch.rotation) ? arch.rotation : site.facing,
    scale: arch.scale,
  }
}

/**
 * Where the Arch stands in a town's frame: `{ x, z }` the midpoint of its feet (local metres, x east, z south) and
 * `facing`, the rotation about +Y that lays the geometry's span (local +X, GatewayArch.jsx#createArchGeometry) along
 * the line between its feet. Throws by name with no usable frame: it is never placed by a guess.
 */
export function archSite(place) {
  if (![place?.lat, place?.lon, place?.lonToMeters, place?.latToMeters].every(Number.isFinite)) {
    throw new Error('[gatewayArch] ⛔ no town frame { lat, lon, lonToMeters, latToMeters } — the Arch cannot be placed')
  }
  const project = projectorOf(place)
  const [n, s] = GATEWAY_ARCH.feet.map(f => project(f.lon, f.lat))
  // three's rotation.y = θ carries local +X to world (cos θ, 0, −sin θ)
  return { x: (n[0] + s[0]) / 2, z: (n[1] + s[1]) / 2, facing: Math.atan2(-(n[1] - s[1]), n[0] - s[0]) }
}

/**
 * Where the specular highlight sits along the Arch, `t` ∈ [0, 1] (the geometry's `aCurveParam`: 0 at the −X foot, 1 at
 * the +X foot). ⭐ It MOVES WITH THE VIEWER (Jacob, 2026-10-28: "it's hard to make it look dynamic" — that is what makes
 * brushed steel read as specular), derived, with no town in it: a mirror highlight sits where the surface normal is the
 * half-vector H between the light and the eye. In the Arch's plane the catenary's outward normal at x is
 * (B·C·sinh(C·x), 1), so the highlight is where B·C·sinh(C·x) = H_span / H_up, held to the span (its ends are the feet).
 * H pointing down (light and eye both below the curve's horizon) puts it at the foot it leans toward.
 * @param light  unit vector toward the sun/moon (world)   @param eye  the camera's world position
 * @param pose   archPose(…)   @returns t
 */
export function glintAt(light, eye, pose) {
  const s = Math.sin(pose.rotation), c = Math.cos(pose.rotation)
  // the eye direction from the Arch's middle (half its drawn height above the base)
  const midY = pose.y + PEAK_HEIGHT * pose.scale / 2
  let vx = eye.x - pose.x, vy = eye.y - midY, vz = eye.z - pose.z
  const vl = Math.hypot(vx, vy, vz) || 1
  vx /= vl; vy /= vl; vz /= vl
  const hx = light.x + vx, hy = light.y + vy, hz = light.z + vz
  const span = hx * c - hz * s   // H along the span: local +X is world (cos r, 0, −sin r)
  let x
  if (hy > 0) x = Math.asinh(span / (hy * ARCH_B * ARCH_C)) / ARCH_C
  else x = Math.sign(span) * HALF_SPAN
  x = Math.max(-HALF_SPAN, Math.min(HALF_SPAN, x))
  return (x + HALF_SPAN) / (2 * HALF_SPAN)
}
