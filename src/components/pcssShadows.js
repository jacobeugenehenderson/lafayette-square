/**
 * PCSS — contact-hardening soft shadows whose penumbra and sample count change WITHOUT recompiling anything.
 *
 * ⛔ WHY THIS REPLACES drei's <SoftShadows> (Strobe, 2026-10-06, BRIEF-hero-arrival-perf). drei bakes `size` and
 * `samples` into `THREE.ShaderChunk` as literals and, whenever either changes, calls its `reset()`: it disposes EVERY
 * material in the scene and runs `renderer.compile`, on the effect's cleanup and again on its mount. The `shadow`
 * channel is time-of-day keyed in every town, so one step of the time slider measured 882 material disposes and 96
 * program links (LS), a 3–4 s frame on huron. ▶ node checks/claims-a-slider-step-compiles-nothing.mjs
 *
 * ⭐ HOW. The chunk is installed ONCE, at import, before any program compiles, with drei's own PCSS (its Vogel-disk
 * blocker search and filter, `focus` 0.35) reading the two numbers at run time. They ride the one value three already
 * uploads to every lit material's `getShadow()` without a recompile: the light's `shadow.radius` (`shadowRadius`).
 * `setPcss` stamps them there, encoded as `samples · 256 + sizeTexels`:
 *   - sizeTexels is on a half-texel grid and under penumbraBudgetTexels(samples) ≤ 48, so it never reaches 256;
 *   - every value is exact in float32, so the shader decodes it exactly;
 *   - a radius under 256 (three's default 1, i.e. no <StageShadows> mounted: the Grove's captures, a phone) is NOT
 *     PCSS: getShadow falls through to three's own filter, exactly the render drei's absence gave.
 * The stamp lives on `LightShadow.prototype` (an accessor), so it reaches every shadow-casting light in every canvas,
 * whenever it is made, with no scene walk and nothing per frame. It is global, as drei's chunk was.
 * Samples run as a loop to the authored maximum (the Samples slider's own max, skyLightChannels.js#SHADOW_FIELDS)
 * and break at the stamped count: the same samples, in the same order, as drei's unrolled loop.
 * ⛔ Under `?csm=1` none of this installs: the cascades own the shadow chunk (PostProcessing.jsx#StageShadows).
 */
import * as THREE from 'three'
import { CSM_ENABLED } from './CascadedShadows.jsx'
import { SHADOW_FIELDS } from '../cartograph/skyLightChannels.js'

const TAG = 256
/** The most samples the shader's loop runs: the Samples slider's max, read from the field, never restated. */
export const PCSS_MAX_SAMPLES = SHADOW_FIELDS.find((f) => f.key === 'samples').max
const FOCUS = 0.35   // drei's `focus`, as StageShadows always passed it

const pcss = `
#define PCSS_MAX_SAMPLES ${PCSS_MAX_SAMPLES}
#define RGB_NOISE_FUNCTION(uv) (randRGB(uv))
vec3 randRGB(vec2 uv) {
  return vec3(
    fract(sin(dot(uv, vec2(12.75613, 38.12123))) * 13234.76575),
    fract(sin(dot(uv, vec2(19.45531, 58.46547))) * 43678.23431),
    fract(sin(dot(uv, vec2(23.67817, 78.23121))) * 93567.23423)
  );
}
vec3 lowPassRandRGB(vec2 uv) {
  vec3 result = vec3(0);
  result += RGB_NOISE_FUNCTION(uv + vec2(-1.0, -1.0));
  result += RGB_NOISE_FUNCTION(uv + vec2(-1.0,  0.0));
  result += RGB_NOISE_FUNCTION(uv + vec2(-1.0, +1.0));
  result += RGB_NOISE_FUNCTION(uv + vec2( 0.0, -1.0));
  result += RGB_NOISE_FUNCTION(uv + vec2( 0.0,  0.0));
  result += RGB_NOISE_FUNCTION(uv + vec2( 0.0, +1.0));
  result += RGB_NOISE_FUNCTION(uv + vec2(+1.0, -1.0));
  result += RGB_NOISE_FUNCTION(uv + vec2(+1.0,  0.0));
  result += RGB_NOISE_FUNCTION(uv + vec2(+1.0, +1.0));
  result *= 0.111111111;
  return result;
}
vec3 highPassRandRGB(vec2 uv) {
  return RGB_NOISE_FUNCTION(uv) - lowPassRandRGB(uv) + 0.5;
}
vec2 vogelDiskSample(int sampleIndex, int sampleCount, float angle) {
  const float goldenAngle = 2.399963f;
  float r = sqrt(float(sampleIndex) + 0.5f) / sqrt(float(sampleCount));
  float theta = float(sampleIndex) * goldenAngle + angle;
  return vec2(cos(theta), sin(theta)) * r;
}
float penumbraSize( const in float zReceiver, const in float zBlocker ) {
  return (zReceiver - zBlocker) / zBlocker;
}
float findBlocker(sampler2D shadowMap, vec2 uv, float compare, float angle, int samples, float size) {
  float texelSize = 1.0 / float(textureSize(shadowMap, 0).x);
  float blockerDepthSum = float(${FOCUS});
  float blockers = 0.0;
  for (int i = 0; i < PCSS_MAX_SAMPLES; i++) {
    if (i >= samples) break;
    vec2 offset = (vogelDiskSample(i, samples, angle) * texelSize) * 2.0 * size;
    float depth = unpackRGBAToDepth( texture2D( shadowMap, uv + offset));
    if (depth < compare) {
      blockerDepthSum += depth;
      blockers++;
    }
  }
  if (blockers > 0.0) return blockerDepthSum / blockers;
  return -1.0;
}
float vogelFilter(sampler2D shadowMap, vec2 uv, float zReceiver, float filterRadius, float angle, int samples, float size) {
  float texelSize = 1.0 / float(textureSize(shadowMap, 0).x);
  float shadow = 0.0f;
  for (int i = 0; i < PCSS_MAX_SAMPLES; i++) {
    if (i >= samples) break;
    vec2 offset = (vogelDiskSample(i, samples, angle) * texelSize) * (1.0 + filterRadius * size);
    shadow += step( zReceiver, unpackRGBAToDepth( texture2D( shadowMap, uv + offset ) ) );
  }
  return shadow * 1.0 / float(samples);
}
// radius = samples · ${TAG} + sizeTexels (pcssShadows.js#setPcss).
float PCSS (sampler2D shadowMap, vec4 coords, float radius) {
  int samples = int(floor(radius / ${TAG}.0));
  float size = radius - float(samples) * ${TAG}.0;
  vec2 uv = coords.xy;
  float zReceiver = coords.z;
  float angle = highPassRandRGB(gl_FragCoord.xy).r * PI2;
  float avgBlockerDepth = findBlocker(shadowMap, uv, zReceiver, angle, samples, size);
  if (avgBlockerDepth == -1.0) return 1.0;
  float penumbraRatio = penumbraSize(zReceiver, avgBlockerDepth);
  return vogelFilter(shadowMap, uv, zReceiver, 1.25 * penumbraRatio, angle, samples, size);
}`

// The stamp: while a <StageShadows> holds one, every LightShadow reads it as its radius; otherwise its own.
let stamp = null
if (!CSM_ENABLED) {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment
  const PCF = '#if defined( SHADOWMAP_TYPE_PCF )'
  if (!chunk.includes('#ifdef USE_SHADOWMAP') || !chunk.includes(PCF) || !chunk.includes('float shadowRadius')) {
    throw new Error('[pcssShadows] ⛔ three\'s shadowmap_pars_fragment no longer has the seams PCSS installs at (getShadow(…, shadowRadius, …) and its PCF branch). Re-read the chunk before upgrading three.')
  }
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk
    .replace('#ifdef USE_SHADOWMAP', '#ifdef USE_SHADOWMAP\n' + pcss)
    .replace(PCF, `if ( shadowRadius >= ${TAG}.0 ) return PCSS( shadowMap, shadowCoord, shadowRadius );\n${PCF}`)
  // three does not export LightShadow; every light's shadow (directional, spot) is a subclass of it.
  const lightShadow = Object.getPrototypeOf(Object.getPrototypeOf(new THREE.DirectionalLight().shadow))
  if (lightShadow?.constructor?.name !== 'LightShadow') throw new Error('[pcssShadows] ⛔ could not reach three\'s LightShadow prototype to stamp the penumbra on.')
  Object.defineProperty(lightShadow, 'radius', {
    configurable: true,
    get() { return stamp ? stamp.radius : this._ownRadius },
    // A copy taken while stamped reads the stamp; it must not keep it as its own radius.
    set(v) { if (!(v >= TAG)) this._ownRadius = v },
  })
}

let warned = false
/** Stamp the penumbra (texels) and sample count on every shadow-casting light. Returns the token `clearPcss` takes. */
export function setPcss(sizeTexels, samples) {
  if (CSM_ENABLED) return null
  if (!(samples >= 1 && samples <= PCSS_MAX_SAMPLES) || !(sizeTexels > 0 && sizeTexels < TAG)) {
    if (!warned) { warned = true; console.error(`[pcssShadows] ⛔ penumbra ${sizeTexels} texels × ${samples} samples is outside what the shader carries (samples 1–${PCSS_MAX_SAMPLES}, penumbra under ${TAG} texels). Shadows fall back to three's own filter until it is in range.`) }
    stamp = null
    return null
  }
  stamp = { radius: samples * TAG + sizeTexels }
  return stamp
}

/** Take a stamp off (its <StageShadows> unmounted); a newer stamp stays. */
export function clearPcss(token) {
  if (token && stamp === token) stamp = null
}
