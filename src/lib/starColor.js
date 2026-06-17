// Star spectral color — the single source of truth.
//
// Maps a star's B–V color index (`ci` in bright_stars.json) to an approximate
// RGB, a Ballesteros-style piecewise fit. Blue-hot (bv < 0) → white (~0.0) →
// yellow (~0.6, Sun-like) → orange (~1.0) → deep red (bv > 1.6, e.g. Betelgeuse).
//
// Used by BOTH the main catalog star field (`CelestialBodies`) and the
// constellation overlay nodes/lines (`PlanetariumOverlay`) so the drawn figures
// carry the *real* stars' temperature colors — the sky is informative, not
// decorative. ONE copy on purpose; do not fork the ladder (the values below are
// the canonical mapping — if they change, every star recolors together).
export function bvToRGB(bv, out) {
  let r, g, b
  if (bv < -0.2) { r = 0.55; g = 0.65; b = 1.0 }
  else if (bv < 0.0) { r = 0.7 + bv; g = 0.75 + bv * 0.5; b = 1.0 }
  else if (bv < 0.4) { r = 0.9 + bv * 0.25; g = 0.92 + bv * 0.1; b = 1.0 - bv * 0.5 }
  else if (bv < 0.8) { r = 1.0; g = 0.95 - (bv - 0.4) * 0.35; b = 0.8 - (bv - 0.4) * 0.6 }
  else if (bv < 1.2) { r = 1.0; g = 0.81 - (bv - 0.8) * 0.3; b = 0.56 - (bv - 0.8) * 0.4 }
  else if (bv < 1.6) { r = 1.0; g = 0.69 - (bv - 1.2) * 0.25; b = 0.4 - (bv - 1.2) * 0.2 }
  else { r = 1.0; g = 0.55; b = 0.3 }
  if (out) { out[0] = r; out[1] = g; out[2] = b; return out }
  return [r, g, b]
}
