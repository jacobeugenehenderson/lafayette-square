/**
 * lightingState — module-scoped scalar multipliers for the canonical
 * scene lights in StageSky.jsx (CelestialBodies). LightingPump in
 * CartographApp resolves the 4 lighting channels each frame; StageSky
 * reads these multipliers at light-mount time / per frame.
 *
 * Defaults = 1.0 (no modulation; current behavior preserved).
 */

export const lighting = {
  ambient: 1.0,
  hemi:    1.0,
  dirSun:  1.0,
  dirMoon: 1.0,
}
