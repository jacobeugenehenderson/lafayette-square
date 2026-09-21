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
 *   variance of 0.00818 — below Cox & Munk's zero-wind intercept, i.e. glassier
 *   than dead calm, which is why the lake was matte at noon. The knob is the same
 *   knob; what it scales is now a measured quantity.
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

// ⚠️ Only used when nothing drives the wind — a light breeze, so a body with no
// weather feed attached is still WATER and not a mirror. The live value comes
// from the weather.
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
// MEASURED at glint 0.35, our field had variance 0.00818 (RMS slope 5.2°), below
// Cox–Munk's zero-wind intercept and equivalent to about 1 m/s. Glassy. A real
// 5 m/s breeze is 0.0286 — three and a half times more.
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
export function makeWaterMaterial({ extentDiag, disturbance = null, glint = 1 } = {}) {
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
       uniform vec2  uWindDir;
       uniform float uSlopeScale;
       uniform float uDisturbAmp;
       uniform vec2  uDisturbCenter;
       uniform float uDisturbInner;
       uniform float uDisturbOuter;
       varying vec3 vWaterWorld;

       const float SWELL_STEEP = ${SWELL_STEEP.toFixed(4)};
       const float SPEC_AA_K   = ${SPEC_AA_K.toFixed(4)};

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
         return s * uSlopeScale;
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
       vec3 wDeep    = vec3(0.06, 0.18, 0.25);  // dark teal depths
       vec3 wMid     = vec3(0.10, 0.28, 0.32);  // mid-water
       vec3 wShallow = vec3(0.14, 0.38, 0.38);  // lighter edges
       vec3 wHighlight = vec3(0.35, 0.55, 0.58); // ripple peaks / sun glints

       // Mix based on ripple + refraction
       vec3 waterCol = mix(wDeep, wMid, smoothstep(0.3, 0.55, ripple));
       waterCol = mix(waterCol, wShallow, smoothstep(0.5, 0.7, refractedNoise));

       // Specular-like highlights on ripple crests. ⭐ PAINTED, not reflected —
       // kept because it is half the pond's character, but it is albedo. The
       // real reflection is the normal below.
       float highlight = smoothstep(0.62, 0.78, ripple) * smoothstep(0.5, 0.7, r1);
       waterCol = mix(waterCol, wHighlight, highlight * 0.6);

       // Subtle caustic pattern on the surface
       float caustic1 = wNoise(wp * 0.8 + uTime * vec2(0.15, 0.1));
       float caustic2 = wNoise(wp * 0.8 + uTime * vec2(-0.1, 0.15) + 50.0);
       float caustic = smoothstep(0.4, 0.6, caustic1) * smoothstep(0.4, 0.6, caustic2);
       waterCol += vec3(0.04, 0.07, 0.06) * caustic;

       // ── Time-of-day ──
       float dayBright = smoothstep(-0.12, 0.3, uSunAltitude);
       float brightness = mix(0.45, 1.0, dayBright);
       // Night: darker, more blue/indigo
       vec3 nightWater = vec3(0.05, 0.08, 0.16);
       waterCol = mix(nightWater, waterCol, dayBright) * brightness;

       // Moon/street light reflection at night
       float nightGlint = (1.0 - dayBright) * highlight * 0.4;
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
       vec2 wSlope = wGlitterSlope(wpWorld) + vec2(wSx, wSz) * (SWELL_STEEP / (2.0 * wE));
       // uGlint == 0 ⇒ exactly vec3(0,1,0): the flat normal this surface had
       // before glint existed, so the pre-glint surface is still reachable
       // EXACTLY and the control stays falsifiable. Not a branch — the same
       // arithmetic.
       vec3 vWaterN = normalize(vec3(-wSlope.x * uGlint, 1.0, -wSlope.y * uGlint));`
    )

    // ⭐⭐ HAND THE WAVE NORMAL TO THE PBR PATH THAT WAS ALREADY THERE. This is
    // the entire glint feature. `normal` is view-space in three's chunks, so the
    // world-space wave normal is rotated by viewMatrix; `faceDirection` carries
    // the DoubleSide flip the chunk would have applied to vNormal.
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
         roughnessFactor = min(1.0, sqrt(roughnessFactor * roughnessFactor + SPEC_AA_K * wVar));
       }`
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
       normal = normalize((viewMatrix * vec4(vWaterN, 0.0)).xyz) * faceDirection;
       nonPerturbedNormal = normal;`
    )
  }

  // Unique cache key so the ripple shader doesn't collapse onto a sibling
  // material's compiled program. ⭐ ONE key for every water body in the kit is
  // correct: the per-feature differences (wave scale, glint, disturbance) are
  // all UNIFORMS, so the code is identical and sharing the program is the point.
  mat.customProgramCacheKey = () => 'kit-water-v1'

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
