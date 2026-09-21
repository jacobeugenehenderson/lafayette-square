/**
 * skyGradient — THE SKY'S COLOUR, AS ONE FUNCTION, FOR EVERYTHING THAT REFLECTS IT.
 *
 * ⭐⭐ WHY THIS FILE EXISTS. The dome's colour was written once, inside
 * `GradientSky`'s fragment shader, and nothing else could ask it a question. So
 * when the water needed to know "what colour is the sky in THAT direction?" the
 * only options were to copy the maths (which drifts the first time someone edits
 * one) or to fake it with a hand-placed light (which is what the project did, for
 * years — see the `floorDir` excision, 2026-09-20). ⛔ ONE DERIVATION OF ONE
 * FACT: the dome and the lake now evaluate the SAME function, so a town graded
 * warm gets warm water with nobody wiring anything.
 *
 * ⭐⭐⭐ AND THE HOLE IT FILLS IS BIGGER THAN WATER. This project has never had
 * INDIRECT SPECULAR anywhere — no envMap, no `scene.environment`, no PMREM. The
 * fixed fill lights were not only faking a hotspot on the lake; they were
 * standing in for the entire missing reflected-sky layer on every shiny surface
 * in every town. Removing them was right and it exposed a kit-wide gap. This is
 * the first honest indirect specular in the kit, and water is only its first
 * consumer.
 *
 * ⛔ THE SUN'S DISC IS DELIBERATELY NOT IN HERE. `skyDomeColor` returns the bands
 * plus the BROAD glow — the halo, the wide horizon scatter, the warm side of the
 * sky — and stops. The tight core disc stays in the dome's own shader.
 * ⇒ Jacob, on the matte lake: "they just shouldn't have any localized hotspots."
 * A reflected sun DISC is a localized hotspot; a reflected sun-brightened SKY is
 * the shimmer he is asking for. ⭐ And that split is not a compromise, it is the
 * physics: the sky really is brighter near the sun, so the broad shimmer
 * strengthens toward the sun's azimuth and fades away from it all by itself —
 * which a uniform ambient term can never do. The sharp path on the water stays
 * the bodies' job, where the invariant says it belongs: ONLY THE SUN AND THE MOON
 * HAVE A SPECULAR LOBE.
 */

/**
 * GLSL. Inject once into any fragment shader that needs the sky's colour, then
 * call `skyDomeColor(dir, …)` with a NORMALIZED world-space direction.
 *
 * ⚠️ The band uniforms are the operator's authored sky, resolved per frame by
 * `GradientSky` and published on `useSkyState` — a consumer reads those, it does
 * not re-resolve the grid.
 */
export const SKY_GRADIENT_GLSL = /* glsl */`
// ⭐ The three scatter terms, as functions, because the DOME uses them again
// downstream (the moon's horizon wash reads skyHorizonProximity; the sunset
// boost reads the halo and the wide scatter). ⛔ Duplicating them back into the
// dome's main() would be two copies of one formula, which is the drift this
// whole file exists to prevent — the caller asks for them instead.
float skyHorizonProximity(float h) { return 1.0 - abs(h); }
float skyHaloGlow(float sunDot) { return sunDot > 0.0 ? exp(16.0 * log(sunDot)) : 0.0; }
float skyWideScatter(float sunDot, float h) {
  float hp = skyHorizonProximity(h);
  return pow(max(0.0, sunDot), 3.0) * hp * hp;
}

vec3 skyDomeColor(
  vec3 dir, vec3 bandHorizon, vec3 bandLow, vec3 bandMid, vec3 bandHigh,
  float turbidity, vec3 sunDir, float sunAlt, vec3 sunGlowColor
) {
  float h = dir.y;

  // ── The operator-authored "juice" — 4 bands, horizon → low → mid → zenith.
  // ⛔ Lifted VERBATIM from the dome (the exponents and the smoothstep edges are
  // the painter's, not a physical model — see GradientSky's note on why the
  // Preetham baseline was removed in 2026-05-20). Do not "improve" them here:
  // this function IS the dome, and a change to it changes the sky.
  float hn = pow(max(0.0, h), 0.65 * (1.0 + turbidity * 0.4));
  float t1 = smoothstep(0.0,  0.12, hn);
  float t2 = smoothstep(0.10, 0.32, hn);
  float t3 = smoothstep(0.30, 0.65, hn);
  vec3 col = mix(bandHorizon, bandLow, t1);
  col = mix(col, bandMid, t2);
  col = mix(col, bandHigh, t3);

  // ── The BROAD glow only. No core disc: see this file's header.
  float sunDot = dot(dir, sunDir);
  float haloGlow = skyHaloGlow(sunDot);
  float wideScatter = skyWideScatter(sunDot, h);
  float twilightBoost = smoothstep(-0.15, 0.05, sunAlt) * (1.0 - smoothstep(0.05, 0.35, sunAlt));
  float sunVis = smoothstep(-0.12, 0.0, sunAlt);
  col += sunGlowColor * sunVis * (haloGlow * (0.25 + twilightBoost * 0.4)
                                + wideScatter * (0.15 + twilightBoost * 0.35));

  // Warm the horizon on the sun's side.
  float horizonWarm = pow(max(0.0, sunDot), 2.0) * (1.0 - abs(h)) * sunVis * 0.12;
  col += vec3(0.15, 0.08, 0.02) * horizonWarm;

  return col;
}
`

/**
 * Schlick's Fresnel for an air/water interface.
 * ⭐ F0 = 0.02 is water's normal-incidence reflectance — a measured constant of
 * the material, not a dial. It is what makes the FAR half of a lake read as sky
 * and the NEAR half read as water, for one dot product, with no authoring.
 */
export const FRESNEL_GLSL = /* glsl */`
float waterFresnel(vec3 N, vec3 V) {
  float c = clamp(1.0 - max(0.0, dot(N, V)), 0.0, 1.0);
  float c2 = c * c;
  return 0.02 + 0.98 * (c2 * c2 * c);
}
`
