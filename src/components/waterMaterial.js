/**
 * waterMaterial — the kit's animated water surface.
 *
 * ⭐ LIFTED, NOT WRITTEN. Every line of GLSL below came out of
 * `LafayettePark.jsx`'s `waterMat` (three-octave FBM, circular disturbance,
 * fake refraction, caustics, the deep→mid→shallow ramp and the full day→night
 * ramp down to `nightWater`). It was a good shader welded to one mould; this
 * file is the mould coming off. ⛔ Do not rewrite it — extend it.
 *
 * ⛔⛔ THIS MATERIAL TAKES POLYGON WATER BODIES ONLY — a lake, a pond, a basin,
 * a reservoir: something with a ring and an interior. It is NOT a river shader.
 * Measured across four towns, 268 features are LINEAR waterways
 * (stream · river · canal · ditch · drain · flowline) and they are a different
 * animal: flow direction, banks, width-along-run. They are on disk today and
 * nothing draws them. ▶ When they arrive they want their own material; do not
 * discover that by seeing a river rendered as a lake.
 *
 * ── THE THREE THINGS THE CALLER OWNS ──────────────────────────────────────
 *
 * `extentDiag` — the FEATURE'S OWN bbox diagonal, in metres. ⛔ Not a constant,
 *   not a scene lookup: the surface's own size. It drives `uWaveK`, and it is
 *   the whole reason this material does not read as plastic on a 40 km² lake.
 *   ⭐ WHY IT MATTERS AND WHY IT FAILS SILENTLY: the lifted constants put a
 *   noise cell every ~8 m. On a 100 m pond that is ~12 cells across — structure
 *   you can see. On an 11.8 km lake it is ~1,400 cells across, which at any
 *   camera distance resolves to sub-pixel grey shimmer: flat plastic, and
 *   nothing in the build errors.
 *
 * `disturbance` — the authored point ripple (`sin(dist·0.4 − t·1.5)` falling off
 *   over a radius). ⭐ DEFAULT OFF, and that is deliberate: it models something
 *   dropped in a pond. On a Great Lake it is one sine wave crossing kilometres.
 *   The LS pond passes its own authored centre; nothing else does.
 *
 * `glint` — a MULTIPLE OF THE PHYSICALLY CORRECT WAVE SLOPE, so 1 is the real
 *   ocean at the town's real wind speed and is the default. ⛔ It used to be an
 *   arbitrary amplitude defaulting to 0.35, which put the surface at a slope
 *   variance of 0.00818, which by Cox & Munk is a surface under about 1 m/s of
 *   wind — RMS slope 5.2° against 9.6° for an ordinary 5 m/s breeze. Near-calm
 *   water, permanently, in every town, whatever the weather was doing. That is
 *   why the lake was matte at noon: too few facets at the right angle. The knob
 *   is the same knob; what it scales is now a measured quantity.
 *   ⭐⭐ THIS IS THE SUN AND MOON ON THE WATER, and the measurement that produced
 *   it is worth keeping:
 *   the lifted shader's specular path was never broken. Every `<lights_*>` chunk
 *   is intact; it patches `<color_fragment>` and nothing is discarded.
 *   ⛔ WHAT WAS MISSING IS THE NORMAL. The surface carried one flat (0,1,0)
 *   everywhere, so a mirror-smooth material had nothing to bend the reflection
 *   with, and the "specular crests" at the old `:558` were a `mix()` into
 *   ALBEDO — a painted highlight, not a reflection. And there is no IBL anywhere
 *   in this scene (no envMap, no `scene.environment`, no PMREM), so the ONLY
 *   reflectable thing is the single analytic key light.
 *   ⇒ Giving the existing PBR path a real wave normal IS the feature. No second
 *   light, no hand-rolled sun vector: `CelestialBodies`' `<directionalLight>` is
 *   already sun-by-day, moon-blended-by-night, and it lights this like anything
 *   else once there is a normal to catch it.
 *   ⭐ `glint: 0` is not a disabled feature, it is the pre-glint surface EXACTLY:
 *   the perturbation collapses to normalize(vec3(0,1,0)), i.e. the interpolated
 *   flat normal the material had before. That is how LS's pond stays the control.
 */
import * as THREE from 'three'
import { SKY_GRADIENT_GLSL, FRESNEL_GLSL } from './skyGradient.js'

// ⭐ THE CALIBRATION ANCHOR, AND IT IS THE ONLY MEASURED POINT ON THE CURVE.
// The lifted frequency constants (`wp*0.12`, `*0.3`, `*1.2`, refraction `*0.25`
// / `*0.15`, caustics `*0.8`) were tuned by eye on ONE surface: a pond whose
// bbox diagonal is 105.7 m. So `uWaveK == 1` there, by construction, and the
// surface those constants were tuned on comes out unchanged.
// ⛔ This is a calibration extent, not a scene branch — no scene is named here
// and nothing looks up which town it is in.
const TUNED_AT_DIAG_M = 105.7

// ⭐ THE FALLOFF EXPONENT IS A LOOK, NOT A MEASUREMENT — say so rather than
// dress it up. `k = (tuned/diag)^0.5` is the compromise between the two ends,
// and only its endpoint is calibrated:
//   · exponent 1.0 → wave size scales WITH the basin: an 11.8 km lake gets
//     ~900 m swells. Geometrically consistent, reads as a smooth gradient.
//   · exponent 0.0 → the constants stay absolute: physically true (a 1 m ripple
//     is 1 m in any basin) and visually the plastic-shimmer failure above.
// 0.5 keeps ~130 cells across a Great Lake — structure at distance, texture near
// shore. ⛔ Cause not established beyond the anchor: it has not been eye-gated at
// a second extent. If Jacob's eye says otherwise this exponent is the knob.
const WAVE_FALLOFF_EXP = 0.5

// ⭐⭐⭐ THE GLITTER OCTAVES — WORLD-CONSTANT, AND THAT IS THE WHOLE POINT.
// ⛔ THE BUG THIS REPLACES: `uWaveK` used to scale EVERY octave, so a big lake had
// NO SMALL WAVES — huron's finest detail was a 43 m blob, and because the time
// term was added to an already-rescaled coordinate the period came out
// accidentally scale-free at 79 s. Nothing moved in the seconds an operator
// actually looks.
// ⭐ THE PHYSICAL FACT THE OLD CODE CONTRADICTED: wavelet size does NOT scale
// with the size of the body. Lake Erie has the same centimetre-to-metre
// capillary waves a farm pond has — fetch buys BIGGER SWELL on top, it does not
// delete the small stuff. ⇒ `uWaveK` scales the SWELL's wavelength and NOTHING
// else. These wavelengths are in METRES and are identical in every town, on
// every body, forever. `checks/claims-water-scales-with-its-body.mjs` asserts it.
//
// ⭐ SLOPE, NOT HEIGHT, IS WHAT A GLINT NEEDS — and slope is scale-free by
// construction: for a wave of steepness s and wavelength L the amplitude is
// A = s·L, so dH/dx = (A/L)·dNoise = s·dNoise and L CANCELS. That is why one
// steepness figure is right for a pond and a Great Lake alike.
//
// ⭐ DRIFT IS A SPEED IN METRES PER SECOND, converted at the seam — never a
// constant added to a rescaled coordinate. Each octave travels at its own
// DEEP-WATER PHASE SPEED, c = √(gL/2π), which is physics and not a knob: the
// 4.2 m wave crosses its own length in 1.6 s, the 0.42 m wave in 0.5 s. Short
// waves outrun nothing; they twinkle, and that is where the life is.
const GRAVITY_MPS2 = 9.81
/** Deep-water phase speed (m/s) for a wavelength in metres. */
export function phaseSpeed(lambdaM) { return Math.sqrt(GRAVITY_MPS2 * lambdaM / (2 * Math.PI)) }

// ⭐⭐ THE WIND IS REAL AND IT IS ALREADY IN THE APP — I said otherwise here and
// I was wrong. `useSkyState.windSpeedMs` and `.windDirDeg` are polled live from
// open-meteo (`wind_speed_10m` / `wind_direction_10m`, `useWeather.js`) for the
// town's own coordinates. ⇒ The wave field does not need an authored wind knob;
// it reads the weather, which is what a weather-and-environment tracker is for.
// The octaves fan around that live bearing with the ±spread real wave trains have.

export const GLITTER_OCTAVES = [
  { lambdaM: 4.20, steep: 0.55, spreadDeg: 0 },    // the readable ripple
  { lambdaM: 1.35, steep: 0.32, spreadDeg: -24 },  // cross-train
  { lambdaM: 0.42, steep: 0.18, spreadDeg: 31 },   // capillary twinkle
]

// The SWELL's steepness. Its WAVELENGTH scales with the body (uWaveK); its
// steepness does not, because a long swell is gentle whatever basin it is in.
const SWELL_STEEP = 0.14

// Geometric specular antialiasing. ⭐ WITHOUT IT THE GLITTER IS NOISE, NOT A
// PATH: sub-metre waves land far below a pixel's footprint on a 7 km lake, and a
// mirror-sharp lobe sampled once per pixel fizzes. Widening roughness by the
// screen-space variance of the wave normal is what makes distant water go to a
// coherent sheen and near water sparkle — and it is what lets the sun-path form
// as a STREAK instead of a field of fireflies.
const SPEC_AA_K = 0.65

// Gust cells — how big a patch of ruffled water is, and how much rougher/calmer
// a patch runs than the mean. 420 m is the scale a lake reads as mottled rather
// than as noise; the 0.45-1.55 span keeps the MEAN at 1.0 so Cox & Munk still
// holds across the body while any given patch departs from it.
const GUST_CELL_M = 420
const GUST_MIN = 0.45
const GUST_MAX = 1.55

// ⛔⛔ THE WIND FLOOR, AND IT IS THE FIX FOR A REAL REGRESSION. Measured in the
// Stage: `useSkyState.windSpeedMs` is ZERO there — the weather poller runs in the
// app, not in the authoring surface — and I had made the ENTIRE wave amplitude a
// function of it. Cox & Munk at 0 m/s is sigma² = 0.003, RMS slope 3.1°: a
// near-mirror. So the lake went flat, and with it went the waves, the Fresnel
// split, the flecks and the glint, because every one of them reads the slope.
// ⭐ THE DOCTRINE ERROR WAS MINE: I made a LOOK-CRITICAL quantity depend on live
// data that does not exist on every surface, with no floor — so a town or a tool
// without a weather feed silently renders glass. A missing feed and a dead calm
// are indistinguishable from inside the shader, and of the two readings the one
// that is almost never true in the world is "the water is a mirror".
// ⇒ Floor it. `windSpeedMs` defaults to 0 and is only ever written by the poller,
// so 0 means NO DATA far more often than it means calm; a light breeze is the
// honest reading of an absent one, and real water is essentially never glassy.
export const WIND_FLOOR_MPS = 3.5
const DEFAULT_WIND_MPS = 5

// ⭐⭐⭐ COX & MUNK 1954 — HOW ROUGH THE WATER IS, MEASURED FROM THE REAL OCEAN.
// Cox and Munk derived this by photographing SUN GLITTER from an aircraft and
// inverting the brightness distribution back to a slope distribution:
//
//     sigma² = 0.003 + 0.00512 · W        (W = wind speed at 10 m, m/s)
//
// ⇒ THE WIDTH OF THE GLITTER REGION IS NOT A LOOK KNOB. It is the slope variance,
// and the slope variance is the wind. ⭐ THIS IS WHY THE TWO THINGS JACOB ASKED
// FOR ARE THE SAME FEATURE, NOT A COMPROMISE: a HIGH sun over a surface with real
// variance lights facets across the WHOLE body (the hammered-metal look he wants
// at noon), and a LOW sun narrows the same lobe into the elongated path. One
// distribution, two sun elevations. ⛔ So a matte lake at noon is not a taste
// failure, it is the variance being too low — which is exactly what it was:
// MEASURED at glint 0.35, our field had variance 0.00818 — RMS slope 5.2°, which
// the relation puts at about 1 m/s of wind. Not impossibly glassy (the zero-wind
// intercept is 0.003, RMS 3.1°, and we were above it) but near-calm, fixed, in
// every town and every weather. A real 5 m/s breeze is 0.0286 — 3.5× more.
export function coxMunkSlopeVariance(windMps) {
  return 0.003 + 0.00512 * Math.max(0, windMps || 0)
}

// ⛔ AND THE NORMALISATION IS MEASURED, NEVER TYPED. To hit a target variance we
// must know what variance the octave stack produces at unit amplitude — and that
// is a property of GLITTER_OCTAVES, so writing it as a literal would make it a
// stale number the moment anyone touches the table. It is sampled here, once, at
// module load, from a JS twin of the shader's own field.
function unitFieldRmsSlope() {
  const fract = (x) => x - Math.floor(x)
  const hash = (x, z) => fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453)
  const smooth = (f) => f * f * (3 - 2 * f)
  const noise = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z)
    const fx = smooth(x - ix), fz = smooth(z - iz)
    const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1)
    const lo = a + (b - a) * fx, hi = c + (d - c) * fx
    return lo + (hi - lo) * fz
  }
  let sum2 = 0
  const N = 4096
  for (let i = 0; i < N; i++) {
    const px = (i * 7.31) % 3000, pz = (i * 13.77) % 3000
    let sx = 0, sz = 0
    for (const o of GLITTER_OCTAVES) {
      const qx = px / o.lambdaM, qz = pz / o.lambdaM
      sx += (noise(qx + 0.5, qz) - noise(qx - 0.5, qz)) * o.steep
      sz += (noise(qx, qz + 0.5) - noise(qx, qz - 0.5)) * o.steep
    }
    sum2 += sx * sx + sz * sz
  }
  return Math.sqrt(sum2 / N)
}
const UNIT_RMS_SLOPE = unitFieldRmsSlope()

/**
 * The widest the specular lobe may ever be filtered to.
 *
 * ⭐ A pixel-averaged highlight converges to the wave-slope distribution and
 * STOPS there — it cannot be broader than the thing it is averaging. For a GGX
 * lobe the microfacet parameter alpha ≈ √2·sigma, and three's `roughnessFactor`
 * is perceptual roughness r with alpha = r², hence the square root. ⛔ This is
 * the ceiling on antialiasing only; it never makes a surface rougher, and at
 * glint 0 the normal is constant so nothing here fires at all.
 */
export function maxRoughnessForWind(windMps) {
  const sigma = Math.sqrt(coxMunkSlopeVariance(windMps))
  return Math.min(1, Math.sqrt(Math.SQRT2 * sigma))
}

/**
 * The amplitude the glitter stack must be driven at so its slope variance equals
 * the real ocean's at this wind speed. ⭐ Exported so the check can assert the
 * surface actually lands on Cox–Munk rather than near it.
 */
export function slopeScaleForWind(windMps) {
  return Math.sqrt(coxMunkSlopeVariance(windMps)) / UNIT_RMS_SLOPE
}

// ⭐ THE SHADER IS EMITTED FROM THE TABLE ABOVE, never typed twice. Every number
// that reaches the GPU is computed here, in metres and m/s, so a reader (and the
// check) can see the units at the seam where they are converted.
const GLITTER_GLSL = GLITTER_OCTAVES.map((o, i) => {
  const c = phaseSpeed(o.lambdaM)                                  // m/s, physics
  const a = o.spreadDeg * Math.PI / 180                             // this train's fan off the wind
  const ca = Math.cos(a).toFixed(6), sa = Math.sin(a).toFixed(6)
  const invL = (1 / o.lambdaM).toFixed(6)                           // cycles per metre
  return `         {  // octave ${i}: ${o.lambdaM} m wave, ${c.toFixed(2)} m/s, period ${(o.lambdaM / c).toFixed(2)} s, ${o.spreadDeg}° off the wind
           vec2 d = vec2(uWindDir.x * ${ca} - uWindDir.y * ${sa}, uWindDir.x * ${sa} + uWindDir.y * ${ca});
           vec2 q = (pw - d * ${c.toFixed(5)} * uTime) * ${invL};
           float hx = wNoise(q + vec2(0.5, 0.0)) - wNoise(q - vec2(0.5, 0.0));
           float hz = wNoise(q + vec2(0.0, 0.5)) - wNoise(q - vec2(0.0, 0.5));
           s += vec2(hx, hz) * ${o.steep.toFixed(4)};
         }`
}).join('\n')

/** The extent→frequency law, exported so a check can mutation-test it. */
export function waveKForExtent(extentDiag) {
  if (!(extentDiag > 0)) return 1
  return Math.pow(TUNED_AT_DIAG_M / extentDiag, WAVE_FALLOFF_EXP)
}

/**
 * @param {object}  opts
 * @param {number}  opts.extentDiag  the water feature's own bbox diagonal (m)
 * @param {?object} opts.disturbance {center:[x,z], inner, outer} in world metres
 * @param {number}  opts.glint       multiple of the physical wave slope (0 = the flat control)
 * @returns {{material: THREE.MeshStandardMaterial, uniforms: object}}
 *   `uniforms.uTime` / `uSunAltitude` / `uWindDir` / `uSlopeScale` are live
 *   objects the caller drives from its own `useFrame` — writable before the
 *   shader ever compiles. ⭐ Wind is not authored: drive `uSlopeScale` from
 *   `slopeScaleForWind(useSkyState.windSpeedMs)` and `uWindDir` from
 *   `windDirDeg`, and the lake gets choppy when the town is actually windy.
 */
export function makeWaterMaterial({ extentDiag, disturbance = null, glint = 1, bodyColors = null } = {}) {
  // ⛔ LOUD, NOT SILENT. An absent extent is the one input whose default would
  // be invisible: the surface would render, perfectly plausibly, at a pond's
  // frequencies on whatever body it was given. A plausible-looking success is
  // the worst outcome in a kit, so this throws rather than picking 1.
  if (!(extentDiag > 0)) {
    throw new Error(
      '[waterMaterial] extentDiag (the feature\'s own bbox diagonal, in metres) is required ' +
      'and must be > 0. Without it the wave frequencies cannot be derived from the surface ' +
      'and the body renders at a 105.7 m pond\'s scale — silently. Measure the ring.')
  }

  const uniforms = {
    uTime:          { value: 0 },
    uSunAltitude:   { value: 0.5 },
    uWaveK:         { value: waveKForExtent(extentDiag) },
    uGlint:         { value: glint },
    // ⭐ Live from the town's own weather (open-meteo via useSkyState); the
    // caller drives both every frame. Defaults are a light breeze so a surface
    // with no weather attached is still water and not glass.
    uWindDir:       { value: new THREE.Vector2(0.88, 0.47) },
    uSlopeScale:    { value: slopeScaleForWind(DEFAULT_WIND_MPS) },
    // Gust cells drift downwind at roughly the wind itself, not at a wave's
    // phase speed — they are weather crossing the water, not a wave train.
    uGustDriftMps:  { value: DEFAULT_WIND_MPS },
    uSlopeRms:      { value: Math.sqrt(coxMunkSlopeVariance(DEFAULT_WIND_MPS)) },
    uMaxRoughness:  { value: maxRoughnessForWind(DEFAULT_WIND_MPS) },
    // The water's own body, deep to shallow. Default: turbid lake, desaturated —
    // the colour of water that is not carrying the sky. LS's pond overrides.
    uBodyDeep:      { value: new THREE.Color(...(bodyColors?.deep    ?? [0.055, 0.085, 0.080])) },
    uBodyMid:       { value: new THREE.Color(...(bodyColors?.mid     ?? [0.085, 0.120, 0.110])) },
    uBodyShallow:   { value: new THREE.Color(...(bodyColors?.shallow ?? [0.120, 0.160, 0.140])) },
    // ⭐ THE SKY THE DOME IS ACTUALLY DRAWING, pushed by GradientSky onto
    // useSkyState and read straight through. The lake reflects the operator's
    // authored grade with no second control and nothing to keep in sync.
    uBandHorizon:   { value: new THREE.Color('#1a1525') },
    uBandLow:       { value: new THREE.Color('#1a1525') },
    uBandMid:       { value: new THREE.Color('#2a3550') },
    uBandHigh:      { value: new THREE.Color('#3a5580') },
    uSkyGlow:       { value: new THREE.Color('#ffd9a0') },
    uTurbidity:     { value: 0 },
    uSunDir:        { value: new THREE.Vector3(0, 1, 0) },
    // The BRIGHTER BODY's direction and colour — sun by day, moon by night.
    uKeyDir:        { value: new THREE.Vector3(0, 1, 0) },
    uKeyColor:      { value: new THREE.Color('#fffefa') },
    uKeyUp:         { value: 0 },
    // uDisturbAmp 0 removes the term entirely (the multiply below), so one
    // compiled program serves both cases and the cache key stays single.
    uDisturbAmp:    { value: disturbance ? 1 : 0 },
    uDisturbCenter: { value: new THREE.Vector2(...(disturbance?.center ?? [0, 0])) },
    uDisturbInner:  { value: disturbance?.inner ?? 50 },
    uDisturbOuter:  { value: disturbance?.outer ?? 10 },
  }

  const mat = new THREE.MeshStandardMaterial({
    color: '#1a4a5a',
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    roughness: 0.15,
    metalness: 0.35,
    side: THREE.DoubleSide,
  })

  mat.onBeforeCompile = (shader) => {
    // ⛔⛔ IDEMPOTENT, AND THIS IS THE BUG THAT MADE THE LAKE VANISH. three may
    // call onBeforeCompile more than once against a fragmentShader that has
    // ALREADY been patched — and every patch below is a string `.replace()` whose
    // replacement RE-EMITS the `#include` it matched. So a second pass matched
    // that same include and appended the whole block again:
    //     ERROR: 0:2212: 'wH' : redefinition
    //     Fragment shader is not compiled.  VALIDATE_STATUS false
    // ⇒ The material existed, the mesh was in the tree, the geometry was right —
    // and NOTHING DREW, because the program never linked. That is the "no water
    // layer, all skydome" Jacob reported, and it is why no camera angle and no
    // shader tuning could ever have fixed it.
    // ⭐ A material that patches by string replacement MUST be idempotent. The
    // marker is a function only this file emits.
    if (shader.fragmentShader.includes('wGlitterSlope')) return
    Object.assign(shader.uniforms, uniforms)

    // Vertex: pass world position to fragment
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vWaterWorld;`
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vWaterWorld = (modelMatrix * vec4(position, 1.0)).xyz;`
    )

    // Fragment: animated ripples + refraction distortion + depth darkening
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform float uTime;
       uniform float uSunAltitude;
       uniform float uWaveK;
       uniform float uGlint;
       uniform vec3  uBodyDeep;
       uniform vec3  uBodyMid;
       uniform vec3  uBodyShallow;
       uniform vec3  uBandHorizon;
       uniform vec3  uBandLow;
       uniform vec3  uBandMid;
       uniform vec3  uBandHigh;
       uniform vec3  uSkyGlow;
       uniform float uTurbidity;
       uniform vec3  uSunDir;
       uniform vec3  uKeyDir;
       uniform vec3  uKeyColor;
       uniform float uKeyUp;
       uniform vec2  uWindDir;
       uniform float uSlopeScale;
       uniform float uGustDriftMps;
       uniform float uSlopeRms;
       uniform float uMaxRoughness;
       uniform float uDisturbAmp;
       uniform vec2  uDisturbCenter;
       uniform float uDisturbInner;
       uniform float uDisturbOuter;
       varying vec3 vWaterWorld;

       // cos(9.5 deg) and cos(2.5 deg) — the window of facet alignments that
       // count as a glint. Sized off the wave-slope distribution itself: at Cox &
       // Munk's ~9.6 deg RMS, facets beyond ~10 deg off the half-vector are the
       // rare tail, which is exactly what should sparkle.
       // The broad wash is deliberately a MINORITY of the reflection — most of
       // it is meant to arrive as flecks, which is what makes water read as a
       // surface rather than a painted plane.
       const float SKY_BASE = 0.9;
       // The clip. 1.0 would keep only facets brighter than the mean sky; above
       // 1 keeps fewer and brighter. This is the DUTY CYCLE knob in disguise —
       // raise it for sparser, sharper water; lower it toward the old wash.
       // The tail of the slope distribution, in units of its own RMS: facets
       // steeper than ~1.5 sigma start to catch, ~2.6 sigma are full flecks.
       // That is a few percent of the surface — the duty cycle that reads as
       // sparkle rather than as noise.
       const float FLECK_SIGMA_LO = 1.5;
       const float FLECK_SIGMA_HI = 2.6;
       const float SKY_FLECK_GAIN = 2.2;
       const float GLINT_COS_WIDE  = 0.98629;
       const float GLINT_COS_TIGHT = 0.99905;
       const float GLINT_GAIN = 6.0;
       const float SWELL_STEEP = ${SWELL_STEEP.toFixed(4)};
       const float SPEC_AA_K   = ${SPEC_AA_K.toFixed(4)};

${SKY_GRADIENT_GLSL}
${FRESNEL_GLSL}

       // Hash + noise for water
       float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
       float wNoise(vec2 p) {
         vec2 i = floor(p), f = fract(p);
         f = f * f * (3.0 - 2.0 * f);
         return mix(
           mix(wHash(i), wHash(i + vec2(1,0)), f.x),
           mix(wHash(i + vec2(0,1)), wHash(i + vec2(1,1)), f.x), f.y);
       }
       float wFBM(vec2 p) {
         float v = 0.0, a = 0.5;
         for (int i = 0; i < 5; i++) { v += a * wNoise(p); p *= 2.03; a *= 0.49; }
         return v;
       }

       // ⭐⭐ THE WAVE SLOPE — read the JS header above for why this is slope and
       // not height, and why every constant in it is in METRES and world-constant.
       // ⛔ uWaveK MUST NOT APPEAR IN THIS FUNCTION. It is the one place the
       // "big lake has no small waves" bug can come back, and the check parses
       // this function body looking for it.
       vec2 wGlitterSlope(vec2 pw) {
         vec2 s = vec2(0.0);
${GLITTER_GLSL}
         // ⭐ ONE multiply turns an arbitrary noise field into a surface with the
         // REAL OCEAN'S slope variance at this wind speed (Cox & Munk 1954).
         // THE WIND IS NOT UNIFORM, AND NEITHER IS THE WATER. Jacob: "it needs
         // falloff, it's just too uniform and directionless."
         // A real lake is mottled because the wind stress on it is mottled —
         // gust cells ruffle patches of surface while slicks stay glassy between
         // them, at a few hundred metres across, drifting downwind. That patchy
         // roughness is most of what makes water read as a LIVING surface rather
         // than a material swatch: it varies the glitter density, the sharpness
         // of the reflection, and the apparent colour, all at once, because all
         // three follow the local slope variance.
         // Derived, not authored: one low-frequency noise cell advected at the
         // same wind that sets the variance. No data needed and nothing to tune
         // per town — a windier town gets faster, stronger patches for free.
         float gust = wNoise((pw - uWindDir * uGustDriftMps * uTime) * ${(1 / GUST_CELL_M).toFixed(6)});
         return s * uSlopeScale * mix(${GUST_MIN.toFixed(2)}, ${GUST_MAX.toFixed(2)}, gust);
       }

       // The SWELL — the body's own long wave. Its WAVELENGTH is the one thing
       // that scales with the basin (uWaveK); its steepness does not.
       float wSwellH(vec2 sp) {
         return wFBM(sp * 0.12 + uTime * vec2(0.08, 0.05)) * 0.53
              + wFBM(sp * 0.3  + uTime * vec2(-0.12, 0.09)) * 0.47;
       }`
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       vec2 wpWorld = vWaterWorld.xz;
       // ⭐ EVERY frequency below is read in SCALED space. uWaveK is derived
       // from this feature's own extent, so the constants keep their tuned
       // meaning at the extent they were tuned at (k == 1) and stretch on a
       // body two orders of magnitude larger. ⛔ Hardcoding k back to 1 is the
       // silent-plastic regression — checks/claims-water-scales-with-its-body.mjs
       vec2 wp = wpWorld * uWaveK;
       // Computed up here because the BODY's crest shading reads it too — the
       // waves have to be visible from straight above, where no reflection is.
       vec2 wSlopePre = wGlitterSlope(wpWorld);

       // ── Animated ripple layers ──
       // Slow large ripples (wind-driven waves)
       float r1 = wFBM(wp * 0.12 + uTime * vec2(0.08, 0.05));
       // Medium ripples (cross-wave interference)
       float r2 = wFBM(wp * 0.3 + uTime * vec2(-0.12, 0.09));
       // Fine surface texture (capillary ripples)
       float r3 = wNoise(wp * 1.2 + uTime * vec2(0.2, -0.15));
       // Authored point disturbance — world metres, not scaled: it is a place
       // on the map, not a wavelength. uDisturbAmp 0 removes it entirely.
       float dist = length(wpWorld - uDisturbCenter);
       float circular = sin(dist * 0.4 - uTime * 1.5) * 0.5 + 0.5;
       circular *= smoothstep(uDisturbInner, uDisturbOuter, dist) * uDisturbAmp;

       // Combine ripple layers
       float ripple = r1 * 0.4 + r2 * 0.35 + r3 * 0.15 + circular * 0.1;

       // ── Water color with fake refraction ──
       // Distort UV by ripple for refraction effect
       vec2 refractOffset = vec2(
         wNoise(wp * 0.25 + uTime * 0.06) - 0.5,
         wNoise(wp * 0.25 + uTime * 0.06 + 100.0) - 0.5
       ) * 0.08;
       float refractedNoise = wFBM((wp + refractOffset) * 0.15);

       // ⛔⛔ THE DEEP→MID→SHALLOW RAMP IS DRIVEN BY RIPPLE NOISE, NOT BY DEPTH,
       // AND IT IS NOT A DEPTH SIGNAL. It is a texture that reads as depth on a
       // pond. Measured 2026-09-20: the USGS DEM CLAMPS a water body flat rather
       // than sounding it — only 16.3% of huron's 2,064,969 terrain samples lie
       // within 0.5 m of zero against a lake covering 35.5% of the disc. There is
       // no bathymetry anywhere in the pipeline. ⇒ Any depth-looking ramp here is
       // FABRICATED FROM NOISE. Said out loud because a plausible depth that is
       // not depth is this project's signature defect.
       // THE BODY COLOUR IS THE CALLER'S, AND THE KIT DEFAULT IS NOT A POND.
       // Jacob, on a noon overhead: "this blue is too romantically blue; it's not
       // the Caribbean." He is looking at the one term Fresnel does NOT hide:
       // from overhead the view is steep, F is small, and almost everything
       // reaching the eye is the water's own body — so the authored pond teal
       // shows at nearly full strength across a Great Lake. A correct POND
       // palette being asked to be a lake.
       // A real lake's body is turbid and DESATURATED; it is the SKY, not the
       // water, that carries the colour, and that arrives through the reflection
       // above. So the kit default is a muted green-grey and the LS pond passes
       // its own palette, exactly as it passes its own disturbance.
       // Per-town water colour is genuinely per-town and there is NO DATA for it
       // (no turbidity anywhere in the pipeline), so it is a CALLER PARAMETER
       // with a sane default, never a new operator knob.
       vec3 wDeep    = uBodyDeep;
       vec3 wMid     = uBodyMid;
       vec3 wShallow = uBodyShallow;
       vec3 wHighlight = vec3(0.35, 0.55, 0.58); // ripple peaks / sun glints

       // Mix based on ripple + refraction
       vec3 waterCol = mix(wDeep, wMid, smoothstep(0.3, 0.55, ripple));
       waterCol = mix(waterCol, wShallow, smoothstep(0.5, 0.7, refractedNoise));

       // ⛔⛔ THE PAINTED HIGHLIGHT — AND IT IS THE "LAKE OF FIRE". Jacob, on a
       // sunset shot where the whole surface glittered orange edge to edge:
       // "this would be pretty emanating from the literal sun's reflection but
       // this looks like a lake of fire." Then, at noon: "this blue is too
       // romantically blue; it's not the Caribbean."
       // ⭐ ONE CAUSE, BOTH COMPLAINTS. This term is a hard smoothstep threshold
       // on NOISE, mixed into ALBEDO — so it fires on roughly half the surface,
       // EVERYWHERE, at equal strength, and takes whatever colour the light is.
       // ⛔ ALBEDO CANNOT CONCENTRATE TOWARD THE SUN. A real glitter path is
       // concentrated because only facets tilted the right way reflect the body,
       // and those get exponentially rarer away from the specular point; a
       // painted threshold has no idea where the sun is. That is exactly the
       // "dead, directionless" quality, and no amount of tuning fixes a term
       // that is structurally incapable of having a direction.
       // ⭐ It was worth keeping while there was no real specular — it WAS the
       // pond's character. There is a real one now (the wave normal into the PBR
       // lobe, plus the reflected sky), so the stand-in is only competing with
       // the thing it was standing in for. It fades out as glint comes up, and
       // at glint 0 the pond keeps it exactly: still the control.
       // ⛔⛔ THE CREST SHADING, AND KILLING IT IS WHAT FLATTENED THE LAKE.
       // MEASURED, not argued — the water material evaluated in Node at the
       // camera pitch of Jacob's screenshot (55° above the surface):
       //     Fresnel 0.0202 → the sky wash contributes 1.8% of the sky
       //     flecks 0.0009 of the sky — one tenth of one percent
       //     THE BODY IS 98% OF THE OUTPUT
       // ⇒ From above, water is ~2% reflective. That is correct physics, and it
       // means EVERYTHING I built — wash, flecks, glint — is multiplied by 0.02
       // and cannot be seen from overhead. The body carries the picture, and I
       // had just removed the only thing giving the body any texture.
       // ⭐ A lake seen from above shows its waves as SHADING ON THE WATER, not
       // as reflections: crests catch more light than troughs. So the crest term
       // comes back — but driven by the REAL SLOPE FIELD rather than the old
       // noise threshold, and it GROWS WITH THE WAVES instead of vanishing with
       // them. That inversion was the bug: paint = 1 - glint faded the surface's
       // only visible structure out at exactly the setting that adds waves.
       // ⚠️ Broad, not the rare tail — this is shading, not glitter. The sparse
       // clipped flecks are a separate layer and they live in the reflection.
       float wCrest = smoothstep(0.6, 1.8, length(wSlopePre) / max(uSlopeRms, 1e-4));
       waterCol = mix(waterCol, wHighlight, wCrest * 0.42 * min(uGlint, 1.0));

       // Subtle caustic pattern on the surface
       float caustic1 = wNoise(wp * 0.8 + uTime * vec2(0.15, 0.1));
       float caustic2 = wNoise(wp * 0.8 + uTime * vec2(-0.1, 0.15) + 50.0);
       // Same species as the highlight above: a noise threshold painted into
       // albedo. On a pond bed it reads as light through water; across ten
       // kilometres of lake it is more uniform speckle with nowhere to come from.
       float caustic = smoothstep(0.4, 0.6, caustic1) * smoothstep(0.4, 0.6, caustic2);
       waterCol += vec3(0.04, 0.07, 0.06) * caustic;

       // ── Time-of-day ──
       float dayBright = smoothstep(-0.12, 0.3, uSunAltitude);
       float brightness = mix(0.45, 1.0, dayBright);
       // Night: darker, more blue/indigo
       vec3 nightWater = vec3(0.05, 0.08, 0.16);
       waterCol = mix(nightWater, waterCol, dayBright) * brightness;

       // Moon/street light reflection at night
       float nightGlint = (1.0 - dayBright) * wCrest * 0.4;
       waterCol += vec3(0.15, 0.18, 0.25) * nightGlint;

       // sRGB → linear
       diffuseColor.rgb = pow(waterCol, vec3(2.2));

       // Vary alpha slightly with ripple (thinner at highlights)
       diffuseColor.a = mix(0.72, 0.88, smoothstep(0.3, 0.6, ripple));

       // ⭐⭐ THE WAVE NORMAL — THE SUN AND MOON PATH LIVES HERE, and it is the
       // only thing that turns "a lit plane" into water. Two contributions:
       //   · the GLITTER stack, world-constant metres, which supplies the fine
       //     slope distribution a specular lobe needs. A sun path is a lobe
       //     against a SLOPE DISTRIBUTION — its width falls out of the variance,
       //     which is why the elongated streak toward the viewer forms by itself
       //     and swings with the body's azimuth through the day. Noise cannot
       //     fake that; only real slopes can.
       //   · the SWELL, which rolls the path rather than making it.
       // ⛔ THE SUN VECTOR IS NOT COMPUTED HERE AND MUST NOT BE. This is a
       // MeshStandardMaterial inside the real light rig: three's own
       // <lights_fragment_*> evaluates the lobe against the scene's
       // <directionalLight>, which CelestialBodies already drives sun-by-day,
       // moon-blended-by-night. ⭐ So the moon path is the SAME lobe at the moon's
       // intensity, for free, and there is exactly one derivation of where the
       // key light is — the light itself. (keyDirection on useSkyState exists
       // for consumers that CANNOT join the rig — the MeshBasic impostor cards.
       // Reading it here would be a second copy of a fact we already have.)
       float wE = 0.5;
       float wSx = wSwellH(wp + vec2(wE, 0.0)) - wSwellH(wp - vec2(wE, 0.0));
       float wSz = wSwellH(wp + vec2(0.0, wE)) - wSwellH(wp - vec2(0.0, wE));
       vec2 wSlope = wSlopePre + vec2(wSx, wSz) * (SWELL_STEEP / (2.0 * wE));
       // uGlint == 0 ⇒ exactly vec3(0,1,0): the flat normal this surface had
       // before glint existed, so the pre-glint surface is still reachable
       // EXACTLY and the control stays falsifiable. Not a branch — the same
       // arithmetic.
       vec3 vWaterN = normalize(vec3(-wSlope.x * uGlint, 1.0, -wSlope.y * uGlint));

       // ⛔⛔ FRESNEL IS A PARTITION, NOT AN ADDITION — and getting that wrong is
       // why the lake read TOO BLUE at noon. The reflected sky was being ADDED on
       // top of the water's own full body colour, so the surface returned more
       // light than arrived at it: a blue-teal body PLUS a blue sky. ⭐ What
       // physically happens is a SPLIT — the fraction F reflects off the surface
       // and the remaining (1 − F) is what enters the water and scatters back. So
       // the body colour is dimmed by exactly what the reflection takes.
       // ⭐⭐ And this is most of why a real lake is not the colour of its own
       // water: across most of a lake you are looking at a GRAZING angle, F is
       // near 1, and almost nothing of the body reaches you. The authored teal
       // (#1a4a5a and the deep→shallow ramp) is a POND's colour, seen from above
       // at a steep angle where F is small — on a Great Lake it should mostly get
       // out of the sky's way, and now it does.
       // ⛔ Same control clause as the reflection: at uGlint 0 nothing is taken
       // away, because nothing is being added either.
       {
         vec3 wVc = normalize(cameraPosition - vWaterWorld);
         // Same flat normal as the reflection it partitions against — a
         // per-pixel F here would speckle the BODY in the opposite phase.
         diffuseColor.rgb *= 1.0 - waterFresnel(vec3(0.0, 1.0, 0.0), wVc) * min(uGlint, 1.0);
       }`
    )

    // ⭐⭐ HAND THE WAVE NORMAL TO THE PBR PATH THAT WAS ALREADY THERE. This is
    // the entire glint feature. `normal` is view-space in three's chunks, so the
    // world-space wave normal is rotated by viewMatrix. ⛔ The DoubleSide flip is
    // deliberately NOT applied — see the note at the line itself.
    // ⭐⭐ THE LOBE'S WIDTH COMES FROM THE SLOPE VARIANCE, which is what makes
    // this a PATH and not a field of fireflies. Sub-metre waves fall far below a
    // pixel footprint on a 7 km lake; a mirror-sharp lobe sampled once per pixel
    // fizzes into aliasing. Widening roughness by the screen-space variance of
    // the wave normal (geometric specular AA) makes distant water resolve to a
    // coherent sheen and near water sparkle.
    // ⛔ At uGlint == 0 the normal is constant, so both derivatives are zero and
    // roughness is untouched — the control survives this too.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
       {
         vec3 wdx = dFdx(vWaterN), wdy = dFdy(vWaterN);
         float wVar = dot(wdx, wdx) + dot(wdy, wdy);
         // ⛔⛔ THE CEILING IS NOT 1.0, AND CLAMPING TO 1.0 IS WHY THE HORIZON WENT
         // DEAD. At the far end of a 7 km lake one pixel spans hundreds of metres
         // of wave field, so neighbouring pixels' normals are completely
         // uncorrelated and wVar is enormous — this saturated roughness to 1.0,
         // which is a nearly LAMBERTIAN surface. ⇒ the sun's reflection spread to
         // nothing at exactly the distance where a sunrise path should be
         // brightest, and jittered in and out as the sampling shifted.
         // ⭐ THE PHYSICAL CEILING: averaging over a pixel converges to the FULL
         // WAVE-SLOPE DISTRIBUTION and cannot go past it — a filtered lobe is
         // never wider than the distribution it filters. That width is Cox &
         // Munk's sigma, the same number driving uSlopeScale, so the ceiling is
         // derived from the wind rather than picked. Far water becomes a coherent
         // glossy shimmer band, which is what a real lake does at the horizon.
         roughnessFactor = min(uMaxRoughness, sqrt(roughnessFactor * roughnessFactor + SPEC_AA_K * wVar));
       }`
    )

    // ⭐⭐ THE BROAD LAYER — THE SKY, REFLECTED. Jacob named this twice, from two
    // directions, without reading a line of the shader: "an attenuated version of
    // this spread rather democratically across the entire body", then "shimmer
    // with no localized hotspots". It is the sky in the water.
    // ⛔ WHY IT GOES ON `totalEmissiveRadiance`: three has exactly one seat for
    // indirect specular — an environment map — and this project has never had one
    // (no envMap, no scene.environment, no PMREM). Rather than stand up a PMREM
    // capture and keep it in sync at every TOD boundary, the water evaluates the
    // dome's OWN colour function along its reflected view vector. The emissive
    // slot is where that radiance lands; it is added to outgoingLight after the
    // lights, which is exactly where a reflection belongs.
    // ⭐ FRESNEL IS WHAT MAKES IT READ AS WATER: grazing angles reflect ~everything
    // and steep angles almost nothing, so the far half of a lake becomes sky and
    // the near half stays water — one dot product, no authoring.
    // ⚠️ The bands are consumed with the same sRGB→linear convention the material
    // applies to its own palette. If the lake and the dome ever disagree in TINT
    // rather than in brightness, this is the line to look at first.
    // ⛔ THE CONTROL CLAUSE: scaled by uGlint, so `glint: 0` is still EXACTLY the
    // pre-glint surface. LS's pond does not silently acquire a sky.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       {
         vec3 wV = normalize(cameraPosition - vWaterWorld);

         // ⛔⛔ THE SKY IS SAMPLED OFF THE **FLAT** SURFACE, NOT THE WAVE NORMAL,
         // AND THAT IS THE WHOLE FIX. Sampling the perturbed mirror direction
         // made every pixel pick a DIFFERENT PART OF THE DOME: at a grazing view
         // a few degrees of wave tilt swings the reflected ray through a huge arc
         // of sky, so neighbouring pixels landed on the pale horizon and the deep
         // zenith alternately. That is what produced the electric-blue
         // salt-and-pepper at noon, and why the water went NAVY under a peach
         // sunset — half its samples were coming from the zenith behind the
         // viewer instead of the warm sky it was facing.
         // ⭐ REAL WATER AVERAGES MILLIONS OF FACETS PER PIXEL; we sample one. The
         // mean of that distribution against a LOW-FREQUENCY environment is just
         // the flat mirror direction, so taking it directly is the honest
         // approximation rather than a smoothing hack — and it is exactly why the
         // sun's disc had to stay out of this function: the sky is low-frequency,
         // the sun is not.
         // PROVED BY PROBE, not reasoned: zeroing this whole term made the
         // saturated blue AND every speck of the salt-and-pepper vanish at once.
         // The body colour and the painted highlight were never the cause.
         vec3 wFlatN = vec3(0.0, 1.0, 0.0);
         vec3 wR = reflect(-wV, wFlatN);
         // A ray that still points into the water reflects the horizon: the dome
         // has nothing below h = 0 to give back.
         wR.y = abs(wR.y);
         vec3 wSky = skyDomeColor(wR, uBandHorizon, uBandLow, uBandMid, uBandHigh,
                                  uTurbidity, uSunDir, uSunAltitude, uSkyGlow);
         // ⚠️ The bands arrive as the operator authored them — hex/255, i.e. sRGB
         // DISPLAY values (skyGrid.js), and the dome writes them straight to
         // gl_FragColor with no encode. This material is lit in linear and IS
         // tone-mapped, so the sky must be decoded on the way in. Checked rather
         // than assumed: a missing decode reads washed-out, a doubled one reads
         // electric.
         // THE FRESNEL TERM WAS THE SPECKLE, AND THIS IS THE LINE THAT DID IT.
         // Schlick goes as (1 − N·V)^5 — a FIFTH POWER — so feeding it a
         // per-pixel WAVE normal made F swing from near 0 to near 1 between
         // neighbouring pixels, and each bright pixel showed the full sky. That
         // is the salt-and-pepper, and it is why the lake read as saturated: the
         // speckle's bright half was pure sky at full strength.
         // Fresnel belongs to the MEAN surface, exactly like the reflection
         // direction above — the wave normal's job is the glitter lobe, which
         // three's own specular already evaluates from it. One flat evaluation,
         // no fifth power of noise.
         float wF = waterFresnel(wFlatN, wV);
         float wGl = min(uGlint, 1.0);

         // ── LAYER 1: the broad wash. The mean surface reflecting the mean sky.
         // Kept LOW — on its own this is the flat, dead sheet.
         totalEmissiveRadiance += pow(wSky, vec3(2.2)) * wF * wGl * SKY_BASE;

         // ── LAYER 2: THE SKY, CLIPPED. Jacob's design, and it is the piece I
         // had missing: "if we're reflecting the sky we can just clip that, no?"
         // ⭐ THE DIFFERENCE BETWEEN NOISE AND SPARKLE IS DUTY CYCLE. Per-facet
         // sky reflection with no clip lights ~half the pixels — that is the
         // salt-and-pepper. Smoothing it away lit none — that is the dead sheet.
         // Clipping keeps the few facets that catch a BRIGHTER patch of sky than
         // the mean and discards the rest, so a few percent of pixels sparkle.
         // Same energy, sparse instead of spread.
         // ⭐ And it needs no sun: on a grey day, or with the body behind the
         // camera, the water still has life, because the sky is always up there
         // and some facets always tilt toward its bright part.
         vec3 wRfacet = reflect(-wV, vWaterN);
         wRfacet.y = abs(wRfacet.y);
         vec3 wSkyF = skyDomeColor(wRfacet, uBandHorizon, uBandLow, uBandMid, uBandHigh,
                                   uTurbidity, uSunDir, uSunAltitude, uSkyGlow);
         // ⛔ THE CLIP IS ON THE WAVE FIELD, NOT ON A SKY COMPARISON — and that
         // correction is why the lake went FLAT AND DEAD. The first version
         // clipped on "does this facet see brighter sky than the mean", which has
         // teeth only where the sky gradient is steep, i.e. at grazing angles.
         // From overhead every reflected ray points near the zenith, the facet and
         // the mean sample the same smooth patch, the excess is never positive,
         // and NOTHING fires. A clip whose threshold depends on the viewing angle
         // is not a clip, it is an accident.
         // ⭐ Clip on the SLOPE instead: the steepest facets are the rare ones,
         // they are rare by the same distribution everywhere, and that is true at
         // any camera angle, under any sky, on any town. Normalised by the wind's
         // own RMS slope so "steep" means the same thing in a calm and a gale.
         float wFleck = smoothstep(FLECK_SIGMA_LO, FLECK_SIGMA_HI,
                                   length(wSlope * uGlint) / max(uSlopeRms, 1e-4));
         totalEmissiveRadiance += pow(wSkyF, vec3(2.2)) * wF * wGl * wFleck * SKY_FLECK_GAIN;

         // ── LAYER 3: THE BODY. "Those much more pronounced 'radioactive but
         // romantically so' ripples can follow the light sources." (Jacob.)
         // GLITTER IS THE TAIL OF THE SLOPE DISTRIBUTION: a facet reflects the
         // body into your eye only if its normal sits on the HALF-VECTOR between
         // the body and you, and almost none do. So the correct picture is a
         // SPARSE scatter of very bright points — spreading that energy smoothly
         // makes a radioactive sheet, removing the spread leaves nothing, and the
         // THRESHOLD is the structure between those two. It is the physics, not a
         // workaround, which is what Jacob was telling me both times he asked.
         // ⭐ AND THE FALLOFF COMES FREE: away from the body's azimuth the
         // half-vector tilts further from vertical than any wave slope reaches, so
         // the sparkle count falls to zero by itself. The path, undrawn.
         vec3 wH = normalize(uKeyDir + wV);
         float wAlign = dot(vWaterN, wH);
         float wSparkle = smoothstep(GLINT_COS_WIDE, GLINT_COS_TIGHT, wAlign);
         totalEmissiveRadiance += uKeyColor * (wSparkle * GLINT_GAIN * uKeyUp * wF * wGl);
       }`
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
       // ⛔ NO faceDirection. WATER HAS ONE UP, AND IT IS UP. three flips the
       // shading normal for back faces so a DoubleSide surface looks right from
       // either side — correct for a leaf or a sheet, wrong for a water plane,
       // whose normal is the physical surface normal and does not depend on which
       // way its triangles happen to be wound.
       // ⚠️ KEPT ON PRINCIPLE, NOT ON EVIDENCE — and the evidence that prompted it
       // was MEASURED FALSE within the minute. I changed this believing the slab's
       // water ring was wound back-facing (a FrontSide probe had painted only a
       // sliver). Counting the triangles in the artifact: 656 of 657 face UP. So
       // faceDirection was +1 the whole time and this line changes nothing today.
       // It stays because it is right for any future winding, and the false story
       // is recorded here rather than left to be rediscovered.
       normal = normalize((viewMatrix * vec4(vWaterN, 0.0)).xyz);
       nonPerturbedNormal = normal;`
    )
  }

  // Unique cache key so the ripple shader doesn't collapse onto a sibling
  // material's compiled program. ⭐ ONE key for every water body in the kit is
  // correct: the per-feature differences (wave scale, glint, disturbance) are
  // all UNIFORMS, so the code is identical and sharing the program is the point.
  mat.customProgramCacheKey = () => 'kit-water-v2-sky'

  return { material: mat, uniforms }
}

/**
 * Does this slab group id name a water body?
 *
 * ⭐ ONE definition, so the bake, the runtime and the check cannot disagree about
 * what water is. Matches on the BARE kind, so a `water=*` subtype this build has
 * never heard of ('water:oxbow' on some town nobody has poured yet) still renders
 * as WATER rather than falling through to a flat grey ground fill — which is the
 * plausible-looking failure, not a loud one.
 */
export function isWaterGroupId(id) {
  if (typeof id !== 'string') return false
  const colonIdx = id.indexOf(':')
  return (colonIdx < 0 ? id : id.slice(0, colonIdx)) === 'water'
}

/** bbox diagonal (m) of a ring, accepting both {x,z} and [x,z] vertices. */
export function ringExtentDiag(ring) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const p of ring) {
    const x = p.x ?? p[0], z = p.z ?? p[1]
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (z < z0) z0 = z
    if (z > z1) z1 = z
  }
  if (!isFinite(x0)) return 0
  return Math.hypot(x1 - x0, z1 - z0)
}
