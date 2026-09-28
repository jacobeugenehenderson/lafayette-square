/**
 * Camera transition SSOT — the single source of truth for how the 3D camera
 * MOVES between shots, so production / cartograph Stage / Preview transition
 * IDENTICALLY (Jacob, 2026-06-21: "the camera settings and behaviors should be
 * identical for the 3D environments, all pulling from the SSOT").
 *
 * Canonical = production's polished values (Jacob ratified 2026-06-21): the
 * render-conformance arc (2026-05-26) deliberately slowed Hero→Browse to 2400ms
 * ("1.5s read as abrupt for the overhead") and added a SMOOTH up-vector tilt
 * into overhead. Those improvements never reached Stage/Preview (still stale at
 * 1500ms + a hard up-vector snap); they now adopt these.
 *
 * Durations are keyed by the shot being ENTERED (the dominant Hero↔Browse pair
 * is what matters; Street is production-only). The smooth up-vector is delivered
 * by createCameraTween's up-lerp (cameraTween.js) — set `up` on from/to.
 */

// ms, keyed by the entered shot.
export const SHOT_TRANSITION_MS = {
  hero:   2500,  // Browse → Hero
  browse: 2400,  // Hero → Browse (the deliberate slow — the romance beat)
  street: 1500,  // Browse → Street
  // An in-plan move — the plan re-framing its places (<Town frameKey>) or turning to a new heading (<Town
  // planHeading>). 1200 ms: the old player's flyTo, its only in-plan move (Scene.jsx). Not a shot: named here so no
  // app or component carries the number.
  frame:  1200,
}

// Duration for a transition INTO `enteringShot`. Default matches the legacy
// non-hero fallback so any unlisted shot behaves as before.
export function transitionMs(enteringShot) {
  return SHOT_TRANSITION_MS[enteringShot] ?? 1500
}
