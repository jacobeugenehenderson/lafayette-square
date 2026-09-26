import * as THREE from 'three'
import { lampGlow as _lampGlow } from '../preview/lampGlowState'
import { applyWeatherToShader } from '../lib/weather-uniforms.js'

/**
 * Reusable factory for the noise-based park grass material.
 *
 * Returns `{ material, shaderRef }`. The caller is responsible for driving
 * `shaderRef.current.uniforms.uSunAltitude` per frame; the factory only
 * builds the material and exposes the shader once it compiles.
 *
 * Options:
 *   - lampLightmap:  optional THREE.DataTexture lookup for night lamp glow.
 *                    When omitted, lamp glow is skipped.
 *   - clipMask / clipMin / clipSize: optional SVG-rasterized boundary
 *                    discard. The ribbon park face renders inside its own
 *                    geometry so it doesn't need a clip; LafayettePark's
 *                    big SVG-extent plane does.
 *   - color:         base albedo (defaults to '#2d5a2d').
 */
// The value noise + fBm every procedural surface shares (ground and set-piece masonry).
// ONE copy: the masonry imports it rather than re-typing it.
export const SURFACE_NOISE_GLSL = `float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
       float gNoise(vec2 p) {
         vec2 i = floor(p), f = fract(p);
         f = f * f * (3.0 - 2.0 * f);
         return mix(
           mix(gHash(i), gHash(i + vec2(1,0)), f.x),
           mix(gHash(i + vec2(0,1)), gHash(i + vec2(1,1)), f.x), f.y);
       }
       float gFBM(vec2 p) {
         float v = 0.0, a = 0.5;
         for (int i = 0; i < 5; i++) { v += a * gNoise(p); p *= 2.03; a *= 0.49; }
         return v;
       }`

export function makeGrassMaterial(opts = {}) {
  return makeGroundSurfaceMaterial({ ...opts, surface: 'grass' })
}

// ── Per-surface ALBEDO chunks. Each defines `vec3 grass` — the historical name of
// the shared albedo variable the common tail (sun, pool, contact shadow) works on.
// ⛔ The GRASS chunk is the CONTROL and must stay byte-identical: LS's park grass is
// the one surface an operator knows (`BRIEF-surface-lab §2`). It is the exact text
// that sat inline here before the factory took a `surface`. ──────────────────────
const GRASS_ALBEDO = `vec2 gp = vGrassPos.xz;

       float gn1 = gFBM(gp * 0.06);
       float gn2 = gFBM(gp * 0.15 + 42.0);
       float gn3 = gFBM(gp * 0.8 + 100.0);
       float gn4 = gFBM(gp * 0.025 + 200.0);
       // Fine blade detail (~25cm features) — makes grass read as grass
       // instead of painted green.
       float gnBlade = gFBM(gp * 4.0 + 17.0);
       float gnBladeFine = gNoise(gp * 12.0 + 71.0);

       vec3 gBase  = vec3(0.22, 0.40, 0.19);
       vec3 gLight = vec3(0.30, 0.50, 0.27);
       vec3 gDark  = vec3(0.15, 0.32, 0.13);
       vec3 gWarm  = vec3(0.26, 0.44, 0.17);
       vec3 gCool  = vec3(0.18, 0.38, 0.22);

       vec3 grass = mix(gBase, gLight, smoothstep(0.35, 0.65, gn1));
       grass = mix(grass, gDark, smoothstep(0.4, 0.7, gn2) * 0.35);
       grass = mix(grass, gWarm, smoothstep(0.55, 0.8, gn4) * 0.25);
       grass = mix(grass, gCool, smoothstep(0.2, 0.45, gn4) * 0.2);
       grass += (gn3 - 0.5) * 0.018;
       // Fine-scale detail layers so the grass has actual texture, not
       // smooth gradient. Stronger than the gn3 dust before.
       grass *= 0.85 + gnBlade * 0.30;
       grass += (gnBladeFine - 0.5) * 0.06;`

// ⭐ SAND — one rough B&W map, the field's recipe smoothed and smeared (Jacob, 2026-09-26): broad
// hummocks, the wind's streaks, and ripples whose crests run across the wind. It is read as COLOUR
// through the sand gradient map and as DEPTH (the ripples' height, lit by derivative bump).
// ⭐ THE DUNE STATE chooses its character (BRIEF-surface-lab §5): 0 at or below the town's own beach
// slope (derived, beachSlopeDeg), 1 at dry sand's repose angle (USGS 30–34°) — up the dunes the sand
// goes paler and drier; where a slip face stands at repose it is fresh avalanche sand, and no ripple
// survives on it. Off (state 0) unless both inputs are present.
// ⛔ ABSENT, not faked: ripples need a cited spacing + height and a wind (windFromDeg, authored); wet
// sand at the water line needs a cited width. BakedGround names each.
const SAND_ALBEDO = `vec2 gp = vGrassPos.xz;
       float sandSlopeDeg = degrees(acos(clamp(normalize(vWeatherWorldNormal).y, -1.0, 1.0)));
       float duneState = uDuneOn > 0.5
         ? clamp((sandSlopeDeg - uBeachSlopeDeg) / max(uReposeMin - uBeachSlopeDeg, 1e-3), 0.0, 1.0) : 0.0;
       // Wind-aligned coordinates (along, across); no wind → the map is isotropic.
       vec2 sq = uWindOn > 0.5 ? vec2(dot(gp, uWindTo), dot(gp, vec2(-uWindTo.y, uWindTo.x))) : gp;
       float sHum    = gFBM(gp * 0.04);                                              // hummocks
       float sStreak = uWindOn > 0.5 ? gFBM(vec2(sq.x * 0.06, sq.y * 0.7) + 9.0)   // smeared along the wind
                                     : gFBM(gp * 0.3 + 9.0);
       float sGrain  = mix(0.5, gNoise(gp * 9.0 + 57.0), 1.0 - smoothstep(0.1, 0.3, length(fwidth(gp)) * 9.0));
       // Ripples: crests across the wind, bent by the streaks; a gentle stoss and a steep lee.
       float rip = 0.5, ripAmt = 0.0;
       if (uRippleOn > 0.5 && uWindOn > 0.5) {
         float ph = (sq.x + (sStreak - 0.5) * uRippleM * 1.5) / uRippleM;
         float f = fract(ph);
         float aa = 1.0 - smoothstep(0.25, 0.5, fwidth(ph));
         rip = mix(0.5, f < 0.7 ? f / 0.7 : (1.0 - f) / 0.3, aa);
         ripAmt = 1.0 - smoothstep(0.75, 1.0, duneState);                          // none on a slip face
       }
       sandDH = vec2(dFdx(uRippleHM * (rip - 0.5) * ripAmt), dFdy(uRippleHM * (rip - 0.5) * ripAmt));
       float sandBW = clamp(0.45 * sHum + 0.35 * sStreak + 0.2 * sGrain + 0.35 * (rip - 0.5) * ripAmt, 0.0, 1.0);
       // Colour: the map through the sand ramp; drier and paler up the dunes; the crests (coarse) lighter.
       vec3 grass = surfRamp(0.15 + 0.55 * sandBW + 0.3 * duneState, uSandT, uSandC0, uSandC1, uSandC2, uSandC3);`

// The ripples' height as light — the same derivative bump as the field (three's perturbNormalArb).
const SAND_NORMAL = `
       {
         vec3 cSigX = dFdx(-vViewPosition), cSigY = dFdy(-vViewPosition);
         vec3 cR1 = cross(cSigY, normal), cR2 = cross(normal, cSigX);
         float cDet = dot(cSigX, cR1) * faceDirection;
         normal = normalize(abs(cDet) * normal - sign(cDet) * (sandDH.x * cR1 + sandDH.y * cR2));
       }`

// The lab's diagnostic view of the dune state (?dune=1) — drawn over the look, unchanged.
const SAND_STATE = `
       if (uDuneView > 0.5) {
         vec3 dv = vec3(0.5);                                                   // state absent
         if (uDuneOn > 0.5) {
           if (sandSlopeDeg <= uBeachSlopeDeg) dv = vec3(0.20, 0.45, 0.85);     // flat as the town's beach
           else if (sandSlopeDeg < uReposeMin) dv = mix(vec3(0.95, 0.85, 0.25), vec3(0.95, 0.45, 0.10), duneState);
           else if (sandSlopeDeg <= uReposeMax) dv = vec3(0.85, 0.10, 0.10);    // at repose: a slip face
           else dv = vec3(0.85, 0.10, 0.85);                                    // steeper than dry sand stands
         }
         grass = dv;
       }`
export const SAND_UNIFORMS = { uDuneView: { value: 0 } }
if (typeof window !== 'undefined') window.__duneView = SAND_UNIFORMS.uDuneView

// ⭐ ROW CROPS — the six-month field (BRIEF-field-shader). One scalar, the crop STATE `cropC` ∈ [0, 4]:
// 0 bare dirt · 1 tilled raised rows · 2 sprouts · 4 full plants. It rises from each field's planting
// day over `uGrowFrac` of its season, holds to harvest, and harvest plays the SAME states back.
// ⭐ ONE ROUGH GRAYSCALE MAP (`cropBW`) is the colour, the depth AND the distortion (Jacob, 2026-09-26):
//   · distortion — its mid-scale octave pushes the rows sideways (uRowDistort × the row spacing);
//   · depth      — cropBW × the cited ridge height is a height field, lit by derivative bump (CROP_NORMAL);
//   · colour     — two gradient maps read it: soil dark → light, plants their own green range.
// Rows run along the field's own long axis (baked per field) at the cited spacing; every octave finer
// than a pixel fades to its mean by fwidth, so far fields neither shimmer nor turn to corduroy.
// ⛔ No calendar for the town's state → uCropOn 0 → bare dirt, and BakedGround names the missing finding.
const RAMP_GLSL = `vec3 surfRamp(float t, vec4 T, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
         t = clamp(t, 0.0, 1.0);
         if (t <= T.x) return c0;
         if (t <= T.y) return mix(c0, c1, (t - T.x) / max(T.y - T.x, 1e-5));
         if (t <= T.z) return mix(c1, c2, (t - T.y) / max(T.z - T.y, 1e-5));
         if (t <= T.w) return mix(c2, c3, (t - T.z) / max(T.w - T.z, 1e-5));
         return c3;
       }`
// The field's geometry as functions of world XZ, so the parallax march and the final shade read the
// SAME map. Row space: field-local (u along the field's axis, v across) → the quilt patch → that
// patch's row direction → the distortion → the row phase.
const CROP_FUNCS_GLSL = `
       vec2 cropLocal(vec2 p) {
         vec2 d = p - vFieldAxis.zw;
         return vec2(dot(d, vFieldAxis.xy), dot(d, vec2(-vFieldAxis.y, vFieldAxis.x)));
       }
       // (hash A, hash B, metres to the patch border). No quilt → the field is one patch.
       vec3 cropPatch(vec2 uv) {
         if (uQuiltM <= 0.0) return vec3(vFieldExt.z, vFieldExt.w, 1e6);
         // A slight wander so patches are not ruled — enough to read hand-laid, not so much they read as roads.
         vec2 w = uv + (vec2(gNoise(uv * 0.004 + 3.0), gNoise(uv * 0.004 + 11.0)) - 0.5) * uQuiltM * 0.08;
         vec2 c = floor(w / uQuiltM), f = fract(w / uQuiltM);
         float border = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * uQuiltM;
         return vec3(gHash(c + vFieldExt.zw * 17.0), gHash(c * 1.7 + 5.3 + vFieldExt.zw * 9.0), border);
       }
       // Mostly along or across the field; now and then a diagonal patch.
       float cropAngle(float h) { return h < 0.5 ? 0.0 : (h < 0.85 ? 1.5707963 : (h < 0.93 ? 0.35 : -0.35)); }
       float cropRowPhase(vec2 p, vec2 uv, float a) {
         float rv = -sin(a) * uv.x + cos(a) * uv.y;
         float dist = (gNoise(p * 0.6 + 19.0) + 0.5 * gNoise(p * 1.3 + 7.0)) / 1.5 - 0.5;
         return (rv + dist * 2.0 * uRowDistort * uRowSpacingM) / uRowSpacingM;
       }
       // The bed: a flat-ish top (uBedFrac of the row), shoulders, a flat furrow floor. 1 = bed top.
       float cropProfile(float ph) {
         float x = abs(fract(ph + 0.5) - 0.5) * 2.0;          // 0 at the bed's centre, 1 mid-furrow
         float b = min(uBedFrac, 0.7);
         return (1.0 - smoothstep(b, max(b + 0.05, 0.8), x)) * (1.0 - 0.12 * (x / max(b, 0.05)) * step(x, b));
       }
       float cropClod(vec2 p) { return 0.6 * gNoise(p / uClodSizeM) + 0.4 * gNoise(p / uClodSizeM * 2.3 + 4.0); }
       // A pair of wheel ruts centred on distance c (m), at the tractor's gauge.
       float cropRuts(float d, float c) {
         float g = uTrackGaugeRows * uRowSpacingM * 0.5, w = 0.225 * uRowSpacingM;
         return max(1.0 - smoothstep(w * 0.6, w, abs(d - c + g)), 1.0 - smoothstep(w * 0.6, w, abs(d - c - g)));
       }`

const CROP_ALBEDO = `vec2 gp = vGrassPos.xz;
       float edgeD = vFieldEdge;
       // — the STATE, per quilt patch (each patch draws its own day inside the town's window) —
       vec3 pt0 = cropPatch(cropLocal(gp));
       float cropP = mix(uPlantMin, uPlantMax, pt0.x);
       float cropH = mix(uHarvMin, uHarvMax, pt0.y);
       float cropL = mod(cropH - cropP + 365.0, 365.0);
       float cropT = mod(uDoy - cropP + 365.0, 365.0);                    // days since planting
       float cropG = max(uGrowFrac * cropL, 1.0);
       float cropC = uCropOn < 0.5 ? 0.0
         : (cropT <= cropL ? 4.0 * clamp(cropT / cropG, 0.0, 1.0)
                           : 4.0 * (1.0 - clamp((cropT - cropL) / cropG, 0.0, 1.0)));
       float till   = clamp(cropC, 0.0, 1.0);
       float sprout = clamp(cropC - 1.0, 0.0, 1.0);
       float grow   = clamp((cropC - 2.0) * 0.5, 0.0, 1.0);
       // Rows under ~2 px fade to their mean; parallax runs only where a row is several px wide.
       float ph0 = cropRowPhase(gp, cropLocal(gp), cropAngle(pt0.x));
       float rowAA = 1.0 - smoothstep(0.25, 0.5, fwidth(ph0));
       float pomAmt = (1.0 - smoothstep(0.08, 0.2, fwidth(ph0))) * till * uPom;

       // — PARALLAX: march the view ray down through the height map to where it first hits —
       // ⚠️ The march is CHEAP by construction: along one pixel's ray only the row phase moves (linearly,
       // across the rows) and the clods; the patch, the distortion and the headland are held at the
       // pixel's own values. The full height function per step lost the GPU (2026-09-26, the lab tab).
       float hTop = uRidgeM + uClodHeightM * 0.5, hBot = -uClodHeightM * 0.5 - 0.5 * uRidgeM;
       if (pomAmt > 0.01) {
         float a0 = cropAngle(pt0.x);
         vec2 across = -sin(a0) * vFieldAxis.xy + cos(a0) * vec2(-vFieldAxis.y, vFieldAxis.x);
         float headW0 = uHeadlandRows * uRowSpacingM, gauge0 = uTrackGaugeRows * uRowSpacingM;
         float amp = uRidgeM * till * (uHasEdge > 0.5 ? smoothstep(headW0 - 0.3, headW0 + 0.3, edgeD) : 1.0)
                   * smoothstep(gauge0, gauge0 + 0.3, pt0.z);
         vec3 Vw = normalize(transpose(mat3(viewMatrix)) * vViewPosition);
         vec2 dirXZ = -Vw.xz / max(Vw.y, 0.08) * pomAmt;               // metres of XZ per metre down
         float span = hTop - hBot, dt = span / 10.0, t = 0.0;
         for (int i = 0; i < 10; i++) {
           vec2 p = gp + dirXZ * t;
           float h = amp * cropProfile(ph0 + dot(p - gp, across) / uRowSpacingM) + uClodHeightM * (gNoise(p / uClodSizeM) - 0.5);
           if (t >= hTop - h) break;
           t += dt;
         }
         float a = max(t - dt, 0.0), b = t;
         for (int i = 0; i < 3; i++) {
           float m = 0.5 * (a + b);
           vec2 p = gp + dirXZ * m;
           float h = amp * cropProfile(ph0 + dot(p - gp, across) / uRowSpacingM) + uClodHeightM * (gNoise(p / uClodSizeM) - 0.5);
           if (m >= hTop - h) b = m; else a = m;
         }
         gp = gp + dirXZ * b;
       }

       // — the B&W MAP at the point the eye actually sees —
       vec2 uv = cropLocal(gp);
       vec3 pt = cropPatch(uv);
       float ph = cropRowPhase(gp, uv, cropAngle(pt.x));
       float headW = uHeadlandRows * uRowSpacingM, gauge = uTrackGaugeRows * uRowSpacingM;
       float inBody = uHasEdge > 0.5 ? smoothstep(headW - 0.3, headW + 0.3, edgeD) : 1.0;
       float inPatch = smoothstep(gauge, gauge + 0.3, pt.z);
       float tilledHere = till * inBody * inPatch;
       float prof = mix((min(uBedFrac, 0.7) + 0.8) * 0.5, cropProfile(ph), rowAA);
       float ruts = max(uHasEdge > 0.5 ? cropRuts(edgeD, headW * 0.5) : 0.0, uQuiltM > 0.0 ? cropRuts(pt.z, 0.0) : 0.0);
       float clod = mix(0.5, cropClod(gp), 1.0 - smoothstep(0.15, 0.4, length(fwidth(gp)) / uClodSizeM));
       float cropHm = uRidgeM * prof * tilledHere + uClodHeightM * (clod - 0.5) - 0.5 * uRidgeM * ruts;
       float cropBW = clamp((cropHm - hBot) / (hTop - hBot), 0.0, 1.0);
       cropDH = vec2(dFdx(cropHm), dFdy(cropHm));

       // — COLOUR: soil ramp (crust light, turned soil dark, ruts packed dark), per-patch shift —
       float broad = gFBM(gp * 0.08);
       float patchTone = (pt.y - 0.5) * 0.4 * step(0.0, uQuiltM);
       float crustT = 0.35 + 0.45 * broad + 0.2 * clod;
       float turnT  = 0.85 * cropBW + 0.15 * broad;
       float soilT = mix(crustT, turnT, tilledHere) + patchTone;
       soilT = mix(soilT, 0.12 + 0.2 * clod, ruts);
       vec3 soil = surfRamp(soilT, uSoilT, uSoilC0, uSoilC1, uSoilC2, uSoilC3);
       // — the plants' own ramp: young light, mature deep; they grow on the bed tops —
       float leafN = gNoise(vec2(uv.x * 6.0, ph) + 5.0);
       vec3 leaf = surfRamp(mix(0.55 + 0.45 * clod, 0.10 + 0.55 * broad, grow) + patchTone,
                            uPlantT, uPlantC0, uPlantC1, uPlantC2, uPlantC3);
       // Plants stand in ONE line down the bed's centre; the canopy widens from that line as they grow
       // (xRow: 0 on the centre line, 1 mid-furrow). Far away, the mean cover stands in.
       float xRow = abs(fract(ph + 0.5) - 0.5) * 2.0;
       float crest = mix(1.0 - smoothstep(0.08, 0.16, xRow), 0.12, 1.0 - rowAA);
       float speck = step(1.0 - sprout * 0.6, leafN);
       float canopy = mix(1.0 - smoothstep(grow * 0.95, grow * 0.95 + 0.08, xRow), grow, 1.0 - rowAA);
       float cover = max(crest * speck * sprout, canopy * step(0.001, grow));
       cover *= inBody * inPatch * (1.0 - ruts);
       vec3 grass = mix(soil, leaf, clamp(cover, 0.0, 1.0));`

// DEPTH as light: the map's height perturbs the normal by its screen-space derivatives (three's
// bump-map math, `perturbNormalArb`), so the shared sun shades beds, furrows, clods and ruts alike.
const CROP_NORMAL = `
       {
         vec3 cSigX = dFdx(-vViewPosition), cSigY = dFdy(-vViewPosition);
         vec3 cR1 = cross(cSigY, normal), cR2 = cross(normal, cSigX);
         float cDet = dot(cSigX, cR1) * faceDirection;
         vec3 cGrad = sign(cDet) * (cropDH.x * cR1 + cropDH.y * cR2);
         normal = normalize(abs(cDet) * normal - cGrad);
       }`

// uPom: the parallax march on/off (the lab's A/B; 1 ships).
export const CROP_UNIFORMS = { uDoy: { value: 1 }, uPom: { value: 1 } }
if (typeof window !== 'undefined') window.__cropPom = CROP_UNIFORMS.uPom

// A gradient map's stops ({ t, color: '#rrggbb' }, the kit's one format — arborist/bake-look.js
// compileGradientLUT) → 4 stop positions + 4 sRGB colours. Fewer stops pad with the last; ⛔ more than
// 4, or a bad colour, is refused by name rather than trimmed into a different gradient.
function rampUniforms(u, name, stops) {
  const ok = Array.isArray(stops) && stops.length >= 1 && stops.length <= 4
    && stops.every(s => Number.isFinite(s?.t) && /^#[0-9a-f]{6}$/i.test(s?.color || ''))
  if (!ok) throw new Error(`⛔ crop ${name.toLowerCase()}Ramp: 1–4 stops of { t, color: '#rrggbb' } required, got ${JSON.stringify(stops)}`)
  const st = [...stops].sort((a, b) => a.t - b.t)
  while (st.length < 4) st.push({ t: 1, color: st[st.length - 1].color })
  u[`u${name}T`] = { value: new THREE.Vector4(...st.map(s => s.t)) }
  st.forEach((s, i) => {
    const h = parseInt(s.color.slice(1), 16)
    u[`u${name}C${i}`] = { value: new THREE.Vector3((h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255) }
  })
}

const ALBEDO = { grass: GRASS_ALBEDO, sand: SAND_ALBEDO + SAND_STATE, crop: CROP_ALBEDO }

/**
 * The ground-surface factory. `surface` picks the albedo chunk; every other socket —
 * weather, sun altitude, the lamp pool, contact shadow, clip, fade — is shared, so a
 * new surface inherits the whole environment by construction (`BRIEF-field-shader §4`:
 * extend the factory, never a parallel material). Which group gets which surface is
 * `cartograph/surfaces.mjs`.
 */
export function makeGroundSurfaceMaterial({
  surface = 'grass',
  lampLightmap = null, clipMask = null, clipMin = null, clipSize = null,
  color = '#2d5a2d',
  // Optional radial alpha fade — soft neighborhood-stencil edge.
  // { center: [x,z], inner, outer } ; alpha → 0 at outer.
  fade = null,
  // Baked lamp light-pool map (ground.poolmap.png). When provided, the warm
  // pool is sampled from it at world-XZ and scaled by the live TOD Pool value
  // (no night gate — the channel animates it). poolMin/poolSpan map world→UV.
  poolMap = null, poolMin = null, poolSpan = null, poolScale = 1,
  // Resolved surface params (cartograph/surfaces.mjs via context.json + the authored layer).
  surfaceParams = {},
  // Crop: whether the geometry carries the per-vertex field-edge distance (the headland).
  fieldEdge = false,
} = {}) {
  if (!ALBEDO[surface]) throw new Error(`⛔ makeGroundSurfaceMaterial: no albedo for surface "${surface}" (have ${Object.keys(ALBEDO).join(', ')})`)
  const shaderRef = { current: null }
  const material = new THREE.MeshStandardMaterial({ roughness: 0.92, color })
  if (fade) material.transparent = true

  material.onBeforeCompile = (shader) => {
    // Phase 7c (Tempest, 2026-05-20): snow accumulates on top-facing
    // grass; wet barely shows on grass so the wet uniform contributes
    // little here. Inject FIRST so our injection of <color_fragment>
    // appears before the grass shader's own replacement of the same
    // chunk (later replace() calls operate on the modified string).
    applyWeatherToShader(shader)
    shader.uniforms.uSunAltitude = { value: 0.5 }
    shader.uniforms.uClipMap   = { value: clipMask }
    shader.uniforms.uClipMin   = { value: clipMin || new THREE.Vector2(0, 0) }
    shader.uniforms.uClipSize  = { value: clipSize || new THREE.Vector2(1, 1) }
    shader.uniforms.uHasClip   = { value: clipMask ? 1.0 : 0.0 }
    shader.uniforms.uLampMap   = { value: lampLightmap }
    shader.uniforms.uHasLamp   = { value: lampLightmap ? 1.0 : 0.0 }
    shader.uniforms.uLampGlow = _lampGlow.grassUniform
    // Baked lamp light-pool map — warm pool on the ground, sampled at
    // world-XZ, scaled by the live TOD Pool value (uPool = poolUniform).
    shader.uniforms.uPoolMap   = { value: poolMap }
    shader.uniforms.uHasPool   = { value: poolMap ? 1.0 : 0.0 }
    shader.uniforms.uPoolMin   = { value: new THREE.Vector2(poolMin?.[0] ?? 0, poolMin?.[1] ?? 0) }
    shader.uniforms.uPoolSpan  = { value: new THREE.Vector2(poolSpan?.[0] ?? 1, poolSpan?.[1] ?? 1) }
    shader.uniforms.uPoolScale = { value: poolScale }
    shader.uniforms.uPool      = _lampGlow.poolUniform
    shader.uniforms.uShadowStr = { value: 0.5 }   // contact-shadow (G) strength
    if (surface === 'sand') {
      const rep = surfaceParams?.reposeDeg?.reposeDeg ?? surfaceParams?.reposeDeg   // a finding's range
      const beach = surfaceParams?.beachSlopeDeg
      const on = Number.isFinite(beach) && Number.isFinite(rep?.min) && Number.isFinite(rep?.max)
      shader.uniforms.uDuneOn = { value: on ? 1 : 0 }
      shader.uniforms.uBeachSlopeDeg = { value: on ? beach : 0 }
      shader.uniforms.uReposeMin = { value: on ? rep.min : 0 }
      shader.uniforms.uReposeMax = { value: on ? rep.max : 0 }
      shader.uniforms.uDuneView = SAND_UNIFORMS.uDuneView
      const wind = surfaceParams?.windFromDeg
      const windOn = Number.isFinite(wind)
      // World: +x east, -z north. Blowing FROM bearing B → blowing TO (-sin B, +cos B).
      shader.uniforms.uWindOn = { value: windOn ? 1 : 0 }
      shader.uniforms.uWindTo = { value: new THREE.Vector2(windOn ? -Math.sin(wind * Math.PI / 180) : 1, windOn ? Math.cos(wind * Math.PI / 180) : 0) }
      const rs = surfaceParams?.rippleSpacingM, rh = surfaceParams?.rippleHeightM
      const ripOn = Number.isFinite(rs) && rs > 0 && Number.isFinite(rh)
      shader.uniforms.uRippleOn = { value: ripOn ? 1 : 0 }
      shader.uniforms.uRippleM  = { value: ripOn ? rs : 1 }
      shader.uniforms.uRippleHM = { value: ripOn ? rh : 0 }
      rampUniforms(shader.uniforms, 'Sand', surfaceParams?.sandRamp)
    }
    if (surface === 'crop') {
      // Resolved by the context bake (surfaces.mjs SURFACES.crop). Absent calendar → bare dirt.
      const cal = surfaceParams?.calendar
      const on = Number.isFinite(cal?.plantingDoy?.min) && Number.isFinite(cal?.harvestDoy?.max)
      const IN = 0.0254
      shader.uniforms.uCropOn   = { value: on ? 1 : 0 }
      shader.uniforms.uPlantMin = { value: on ? cal.plantingDoy.min : 0 }
      shader.uniforms.uPlantMax = { value: on ? cal.plantingDoy.max : 0 }
      shader.uniforms.uHarvMin  = { value: on ? cal.harvestDoy.min : 0 }
      shader.uniforms.uHarvMax  = { value: on ? cal.harvestDoy.max : 0 }
      // Both are authored with a neutral default, so a resolved surface always carries them; with
      // nothing resolved the calendar is off too and neither is read.
      shader.uniforms.uGrowFrac = { value: Number.isFinite(surfaceParams?.growFrac) ? surfaceParams.growFrac : 0 }
      for (const [u, k] of [['uHeadlandRows', 'headlandRows'], ['uTrackGaugeRows', 'trackGaugeRows'], ['uBedFrac', 'bedFrac'],
        ['uClodSizeM', 'clodSizeM'], ['uClodHeightM', 'clodHeightM'], ['uQuiltM', 'quiltM']]) {
        // Authored with defaults in surfaces.mjs, which BakedGround always lays under the resolved values.
        if (!Number.isFinite(surfaceParams?.[k])) throw new Error(`⛔ crop: authored param "${k}" is missing or not a number (${surfaceParams?.[k]})`)
        shader.uniforms[u] = { value: surfaceParams[k] }
      }
      shader.uniforms.uHasEdge = { value: fieldEdge ? 1 : 0 }
      // Absent spacing / ridge → no rows at all (spacing ∞, ridge 0), never a stand-in number.
      const sp = surfaceParams?.rowSpacingIn?.rowSpacing_in, rh = surfaceParams?.ridgeHeightIn?.ridgeHeightMin_in
      shader.uniforms.uRowSpacingM = { value: Number.isFinite(sp) ? sp * IN : 1e9 }
      shader.uniforms.uRidgeM = { value: Number.isFinite(rh) ? rh * IN : 0 }
      shader.uniforms.uRowDistort = { value: Number.isFinite(surfaceParams?.rowDistort) ? surfaceParams.rowDistort : 0 }
      rampUniforms(shader.uniforms, 'Soil', surfaceParams?.soilRamp)
      rampUniforms(shader.uniforms, 'Plant', surfaceParams?.plantRamp)
      shader.uniforms.uDoy = CROP_UNIFORMS.uDoy
      shader.uniforms.uPom = CROP_UNIFORMS.uPom
    }
    shader.uniforms.uLampColor = _lampGlow.colorUniform  // pool colour = lamp colour
    shader.uniforms.uFadeCenter = { value: new THREE.Vector2(fade?.center?.[0] ?? 0, fade?.center?.[1] ?? 0) }
    shader.uniforms.uFadeInner  = { value: fade?.inner ?? 0 }
    shader.uniforms.uFadeOuter  = { value: fade?.outer ?? 0 }
    shader.uniforms.uHasFade    = { value: fade ? 1.0 : 0.0 }
    shaderRef.current = shader

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vGrassPos;${surface === 'crop' ? '\n       attribute vec4 aFieldAxis; attribute vec4 aFieldExt; attribute float aFieldEdge; varying vec4 vFieldAxis; varying vec4 vFieldExt; varying float vFieldEdge;' : ''}`
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vGrassPos = (modelMatrix * vec4(position, 1.0)).xyz;${surface === 'crop' ? '\n       vFieldAxis = aFieldAxis; vFieldExt = aFieldExt; vFieldEdge = aFieldEdge;' : ''}`
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform float uSunAltitude;
       uniform sampler2D uClipMap;
       uniform vec2 uClipMin;
       uniform vec2 uClipSize;
       uniform float uHasClip;
       uniform sampler2D uLampMap;
       uniform float uHasLamp;
       uniform float uLampGlow;
       uniform sampler2D uPoolMap;
       uniform float uHasPool;
       uniform vec2 uPoolMin;
       uniform vec2 uPoolSpan;
       uniform float uPoolScale;
       uniform float uPool;
       uniform float uShadowStr;
       uniform vec3 uLampColor;
       uniform vec2 uFadeCenter;
       uniform float uFadeInner;
       uniform float uFadeOuter;
       uniform float uHasFade;
       ${surface === 'sand' ? 'uniform float uDuneOn; uniform float uBeachSlopeDeg; uniform float uReposeMin; uniform float uReposeMax; uniform float uDuneView; uniform float uWindOn; uniform vec2 uWindTo; uniform float uRippleOn; uniform float uRippleM; uniform float uRippleHM; uniform vec4 uSandT; uniform vec3 uSandC0; uniform vec3 uSandC1; uniform vec3 uSandC2; uniform vec3 uSandC3; vec2 sandDH = vec2(0.0);\n       ' + RAMP_GLSL : ''}
       ${surface === 'crop' ? 'uniform float uCropOn; uniform float uDoy; uniform float uPom; uniform float uPlantMin; uniform float uPlantMax; uniform float uHarvMin; uniform float uHarvMax; uniform float uGrowFrac; uniform float uHeadlandRows; uniform float uTrackGaugeRows; uniform float uBedFrac; uniform float uClodSizeM; uniform float uClodHeightM; uniform float uQuiltM; uniform float uHasEdge; uniform float uRowSpacingM; uniform float uRidgeM; uniform float uRowDistort; uniform vec4 uSoilT; uniform vec3 uSoilC0; uniform vec3 uSoilC1; uniform vec3 uSoilC2; uniform vec3 uSoilC3; uniform vec4 uPlantT; uniform vec3 uPlantC0; uniform vec3 uPlantC1; uniform vec3 uPlantC2; uniform vec3 uPlantC3; varying vec4 vFieldAxis; varying vec4 vFieldExt; varying float vFieldEdge; vec2 cropDH = vec2(0.0);\n       ' + RAMP_GLSL : ''}
       varying vec3 vGrassPos;

       ${SURFACE_NOISE_GLSL}${surface === 'crop' ? CROP_FUNCS_GLSL : ''}`
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       ${ALBEDO[surface]}

       float dayBright = smoothstep(-0.12, 0.3, uSunAltitude);
       float brightness = mix(0.7, 1.0, dayBright);
       vec3 nightTint = vec3(0.6, 0.7, 1.0);
       grass = mix(grass * nightTint, grass, dayBright) * brightness;

       // Lamp light pool — baked ring profile (dark center → bright soft
       // ring → 0), summed across lamps, sampled at world-XZ and scaled by
       // the live TOD Pool value. No night gate: the Pool channel is
       // manually animated, so it owns when the pool shows.
       if (uHasPool > 0.5) {
         vec2 poolUV = (vGrassPos.xz - uPoolMin) / uPoolSpan;
         if (poolUV.x >= 0.0 && poolUV.x <= 1.0 && poolUV.y >= 0.0 && poolUV.y <= 1.0) {
           vec4 gfx = texture2D(uPoolMap, poolUV);
           // G — contact shadow (tree + lamp bases): darken the albedo DIRECTLY
           // so the ring reads in daytime (not just ambient like aoMap).
           grass *= (1.0 - gfx.g * uShadowStr);
           // R — lamp light pool in the LAMP'S colour, scaled by the live TOD Pool value.
           grass += uLampColor * gfx.r * uPoolScale * uPool;
         }
       }

       diffuseColor.rgb = pow(grass, vec3(2.2));`
    )

    if (surface === 'crop' || surface === 'sand') shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>', `#include <normal_fragment_maps>${surface === 'crop' ? CROP_NORMAL : SAND_NORMAL}`)

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       if (uHasClip > 0.5) {
         vec2 clipUV = (vGrassPos.xz - uClipMin) / uClipSize;
         float mask = texture2D(uClipMap, clipUV).r;
         if (mask < 0.5) discard;
       }
       if (uHasFade > 0.5) {
         float dFade = length(vGrassPos.xz - uFadeCenter);
         gl_FragColor.a *= 1.0 - smoothstep(uFadeInner, uFadeOuter, dFade);
       }`
    )
  }

  // Unique cache key so this grass program doesn't collapse onto any
  // other patched-terrain material's compiled shader (three caches by
  // customProgramCacheKey; without a unique key here the procedural-
  // grass shader can silently get replaced by an earlier-compiled
  // plain-MeshStandardMaterial program from the same scene).
  material.customProgramCacheKey = () =>
    `${surface === 'grass' ? '' : surface + '-'}grass-${fade ? `f${fade.inner}-${fade.outer}` : 'nf'}-${clipMask ? 'clip' : 'noclip'}-${lampLightmap ? 'lamp' : 'nolamp'}-${poolMap ? 'pool' : 'nopool'}-wx1`

  return { material, shaderRef }
}
