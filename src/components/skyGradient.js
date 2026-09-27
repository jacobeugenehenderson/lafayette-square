/**
 * ⛔⛔ BEFORE YOU EDIT THE GLSL IN THIS FILE — `docs/agents/AGENT-VALIDATION-SURFACES.md §0`.
 * A program that does not LINK is invisible, silent, and identical to a missing mesh: the
 * material exists, the mesh is in the tree, nothing throws, and the object is not there.
 * It is silent in every JS-side check — "module LOADS ✓" and "term present ✓" were both
 * reported throughout six rounds of wrong diagnosis on this very file (2026-09-20).
 * ▶ LOAD THE MODULE AND READ THE BROWSER CONSOLE. A green parse proves nothing, and a term
 *   being PRESENT says nothing about it being present ONCE.
 */
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

// ⭐ THE MILKY WAY — one function for the dome AND the water that reflects it (Jacob, 2026-09-27: "the milky way needs
// to reflect on the water too"). dir: normalized world direction; galPole / galCtr: the galactic north pole and centre
// as world directions for this town and moment (CelestialBodies, per frame, published on useSkyState.skyBands);
// gate: the milkyWay channel × how dark the sky is. Returns the colour to ADD.
// Rich, not bright: it swells and warms toward the galactic centre, breaks into star clouds, and a dark lane (the
// Great Rift) splits its plane; saturated, the long-exposure look — gold-orange core, magenta-violet clouds, deep blue arms.
export const MILKY_WAY_GLSL = /* glsl */`
float mwHash(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float mwNoise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mwHash(i+vec3(0,0,0)), mwHash(i+vec3(1,0,0)), f.x),
                 mix(mwHash(i+vec3(0,1,0)), mwHash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(mwHash(i+vec3(0,0,1)), mwHash(i+vec3(1,0,1)), f.x),
                 mix(mwHash(i+vec3(0,1,1)), mwHash(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float mwFbm(vec3 p){
  float a = 0.5, s = 0.0;
  for(int i = 0; i < 4; i++){ s += a * mwNoise(p); p *= 2.02; a *= 0.5; }
  return s;
}
vec3 milkyWayColor(vec3 dir, vec3 galPole, vec3 galCtr, float gate) {
  if (gate <= 0.001) return vec3(0.0);
  float gLat = asin(clamp(dot(dir, normalize(galPole)), -1.0, 1.0));
  float core = smoothstep(-0.3, 1.0, dot(dir, normalize(galCtr)));
  // A narrow, directional band (≈ ±6° at the core, thinner in the arms) — not a diffuse glow (Jacob, 2026-09-27).
  float band = exp(-gLat * gLat * mix(160.0, 70.0, core));
  float n = mwFbm(dir * 13.0);
  float clouds = 0.55 + 0.9 * n;
  float lane = mwFbm(dir * 31.0 + 7.0);
  float dust = 1.0 - 0.75 * smoothstep(0.45, 0.8, lane) * exp(-gLat * gLat * 900.0);
  float milk = band * clouds * dust * mix(0.12, 1.4, core * core);   // concentrated toward the core
  vec3 c = mix(vec3(0.10, 0.22, 0.95), vec3(0.75, 0.18, 0.70), smoothstep(0.35, 0.75, n));
  c = mix(c, vec3(1.00, 0.55, 0.18), core * core);
  return c * milk * gate * 0.12;
}
`
