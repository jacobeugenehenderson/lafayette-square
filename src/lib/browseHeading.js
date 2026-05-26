/**
 * Browse screen-orientation — the cosmetic "Heading" the operator sets in
 * Stage (Hero & Horizon panel). Purely a viewing preference: all spatial data
 * is compass-frame, this only rotates which way the screen is oriented in the
 * overhead Browse shot (camera `up` vector). Per doctrine
 * `project_compass_only_camera_heading` + `SLAB-CONTRACT.md §9.4` (cosmetic
 * screen orientation is the consumer's camera.up concern, never a geometry
 * rotation).
 *
 * deg 0 → [0, 0, -1] (compass-N up on screen), matching SHOTS.browse.up.
 * Shared by Stage (StageApp), Preview (ShotCamera), and production
 * (Scene.jsx CameraRig) so all three read the authored `scene.browseHeading`
 * identically. Pure; no React, no store.
 */
export function browseUpFromHeading(deg) {
  const r = deg * Math.PI / 180
  return [Math.sin(r), 0, -Math.cos(r)]
}
