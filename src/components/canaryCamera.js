/**
 * THE CANARY CAMERA — the shot for looking at ONE specimen.
 *
 * ⭐ ONE DEFINITION, TWO SURFACES. The Arborist's full monte
 * (`TreeDiorama.jsx`) and the Meteorologist's `CanaryScene` are the same
 * question — "how does this tree look, under this sky?" — so they get the same
 * camera. ⛔ Two copies would drift, and the drift would be invisible because
 * both would look plausible.
 *
 * ⚠ THE DEPENDENCY RUNS THIS WAY ROUND ON PURPOSE. This used to live in
 * `meteorologist/canaryCamera.js`, and the diorama imported it from there —
 * i.e. the surface being finished depended on the surface that is NOT (Jacob,
 * 2026-08-23: "I don't know why you're benchmarking to the meteorologist canary
 * when it's not finished. We should be talking in terms of finishing either it
 * or this and porting the remainder over to the other"). So the definition sits
 * here, in the shared components layer, and the Meteorologist re-exports it.
 * Finish it here; the canary scene inherits.
 *
 * Static by design — no keyframes, no motion. The operator scrubs the day and
 * the weather, not the camera. (The Hero shot's Catmull-Rom bounce is the
 * opposite thing: an establishing move for a neighbourhood.)
 *
 * ⚠ `position` encodes EYE HEIGHT and AZIMUTH, which are authored. The DISTANCE
 * is derived per specimen by whoever mounts it — this pose was authored for
 * "typical 12-18m broadleaves" and a canary may be a 25 m oak, so holding the
 * authored distance clips it. Derive distance; keep the eye on the ground.
 */
export const CANARY_GROUND_CAMERA = {
  // ~1.7 m above the ground, backed off, looking UP at the canopy — what a
  // person standing under the tree actually sees. The upward tilt is what puts
  // the horizon low and keeps the frame from filling with grass.
  position:   [-22, 1.7, 18],
  target:     [0, 8, 0],
  fov:        45,
  showGround: true,
  orbit:      true,
  lockDolly:  true,
}
