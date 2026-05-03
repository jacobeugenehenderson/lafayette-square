/**
 * skyState — module-scoped band uniforms for the canonical sky shader
 * (StageSky.jsx GradientSky).  CartographApp's SkyPump resolves the
 * per-Look sky-gradient channel each frame and writes RGB tuples here;
 * GradientSky's useFrame copies them into its ShaderMaterial uniforms,
 * applying weather/planetarium modifiers on top.  Mirrors the
 * lampGlowState / neonState pattern.
 *
 * Defaults match the canonical shader's "deep night" so an unmounted
 * pump still produces sensible output (degenerates to night color).
 */

export const sky = {
  // Each is a [r, g, b] float triple in [0..1].  Updated in place.
  bandHorizonRGB: [0.10, 0.08, 0.14],
  bandLowRGB:    [0.06, 0.06, 0.09],
  bandMidRGB:    [0.03, 0.03, 0.06],
  bandHighRGB:   [0.02, 0.02, 0.03],
  sunGlowRGB:    [0.00, 0.00, 0.00],
  // Set true after the first SkyPump tick so consumers know authored
  // values are present (vs initial defaults). Lets GradientSky fall
  // back to its hardcoded keyframe ladder until the pump is alive.
  hasAuthored: false,
}
