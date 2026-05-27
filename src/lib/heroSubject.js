/**
 * Hero-subject resolver — the SINGLE shared resolver every camera uses.
 *
 * The Hero shot frames around one designated object and keeps it centered no
 * matter where the camera moves (the consumer re-locks its look-at target to
 * this point every frame). The operator's designation is `{kind, id}`; this
 * turns it into the 3D point the camera locks onto.
 *
 * Pure + dependency-free (no React, no store) so EVERY camera instantiation —
 * Stage (CartographApp), production (`Scene.jsx`), Preview (`PreviewApp`), and
 * any future one — resolves identically. The hero target is a deliberate
 * RUNTIME input, not a baked value (bake-scene.js SC.5, "category 3 hardwire"):
 * the slab carries the designation, the camera resolves it at render time.
 *
 * Sources (pass what the environment has):
 *   - `slabIndex`  — the render-scoped buildings index (`useSlabBuildingIndex`,
 *                    `{ byId: Map(id → { footprint, baseY, centroidY, … }) }`).
 *                    Production + Preview resolve `building`/`landmark` from
 *                    HERE — the slab owns spatial identity; never reach into
 *                    `src/data/buildings` (production no longer renders from it).
 *   - `buildings`  — live `src/data/buildings`; the Stage-only fallback, since
 *                    Stage renders the live `LafayetteScene` and mounts no slab.
 *   - `archValues` — `scene.arch.values` (production/Preview) or the cartograph
 *                    store's `arch.values` (Stage): `{distance,bearingX,bearingZ,scale}`.
 *
 * Doctrine: project_camera_framing_slab_contract — no camera may hardcode a
 * pose the slab authors, and no camera re-derives the subject differently.
 */
export const FALLBACK_HERO_SUBJECT = [400, 45, -100]

// Footprint-centroid XZ + mid-building Y (half the local rooftop height) — the
// slab analog of the live path's [position, size[1]/2, position]. Terrain lift
// (aCentroidY × uExag) is applied per-vertex in the shader, not here, matching
// the live path which also aims in pre-terrain local Y.
function pointFromIndexEntry(e) {
  const fp = e?.footprint
  if (!fp || fp.length < 1) return FALLBACK_HERO_SUBJECT
  let sx = 0, sz = 0
  for (const [x, z] of fp) { sx += x; sz += z }
  return [sx / fp.length, (e.baseY ?? 20) * 0.5, sz / fp.length]
}

export function resolveHeroSubject(subject, { slabIndex, buildings, archValues } = {}) {
  if (Array.isArray(subject)) return subject       // already a resolved point
  if (!subject) return FALLBACK_HERO_SUBJECT
  if (subject.kind === 'arch') {
    // Arch lives at distance × bearing (the `arch` channel), not the legacy
    // GatewayArch.jsx constants. Mid-height ≈ scale × 35 for the catenary.
    const a = archValues
    if (!a) return FALLBACK_HERO_SUBJECT
    return [a.distance * a.bearingX, a.scale * 35, a.distance * a.bearingZ]
  }
  if (subject.kind === 'building' || subject.kind === 'landmark') {
    // Slab path (production/Preview): resolve from the render-scoped index.
    if (slabIndex) {
      const e = slabIndex.byId?.get(subject.id)
      return e ? pointFromIndexEntry(e) : FALLBACK_HERO_SUBJECT
    }
    // Live fallback (Stage authoring renders the live LafayetteScene).
    const b = buildings?.find(x => x.id === subject.id)
    if (!b || !b.position) return FALLBACK_HERO_SUBJECT
    const halfH = (b.size?.[1] ?? 10) / 2
    return [b.position[0], halfH, b.position[2]]
  }
  return FALLBACK_HERO_SUBJECT
}
