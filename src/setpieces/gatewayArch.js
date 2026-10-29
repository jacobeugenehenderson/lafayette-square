/**
 * The Gateway Arch: where it stands on the globe. Pure, with no React or three, so the renderer
 * (`src/components/GatewayArch.jsx`), the plan silhouette (`src/cartograph/DesignerArch.jsx`) and the check
 * (`checks/claims-the-arch-stands-where-it-is.mjs`) read the SAME numbers.
 *
 * ⭐ THE ARCH IS A FACT OF THE WORLD, NOT OF A TOWN (BRIEF-the-arch-stands-where-it-is, Jacob 2026-10-28: "doubling the
 * size and height of the arch in its real spot so it's an actual presence"). Every Look that carries an `arch` block
 * projects these two feet through its OWN place, so its distance, bearing and real facing are derived, never typed.
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
