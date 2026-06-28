/**
 * RomanceDoF — single-focal depth-of-field with a gentle HERO pocket.
 *
 * The model (Jacob, 2026-06-26 — supersedes the old two-focal one, which read
 * backwards: pushing Focus out blurred the NEAR field because everything closer
 * than the focal plane was "foreground"):
 *   - SHARP from the camera out to the near focus distance (`focus`).
 *   - Beyond it, blur GROWS with distance up to `blur` (the mid/far melts) —
 *     this is the LoD cover: far leaf detail can taper invisibly in the blur.
 *   - The HERO (the Arch) sits in its own gentle pocket: near the Arch's
 *     distance the blur eases to `heroBlur` (a LITTLE soft, like IRL), so the
 *     hero isn't tack-sharp nor fully melted with the mid-field in front of it.
 *
 * ── Variable RADIUS off the shared ladder ───────────────────────────────────
 * Real DoF's defining property: the blur RADIUS grows with distance from focus.
 * The shared DownsamplePyramid exposes its full LADDER of blur levels (level 0 =
 * tight, level 7 = wide); the blur AMOUNT selects WHICH rung — more blur → wider
 * level. A virtual rung "0" = the sharp input, so at amount 0 it's perfectly
 * sharp and the blur widens smoothly. Two taps/pixel (the straddling rungs).
 *
 * ⚠️ Must run AFTER the DownsamplePyramid pass in the composer (it samples its
 * ladder via _pyramidRefs.levels).
 *
 * Parameterization (the "Focus" channel):
 *   focus (m, near sharp distance) · blur (0..1, mid/far melt) ·
 *   heroBlur (0..1, the Arch's softening) · softness (transition width).
 *   heroDist (the Arch's distance) is set by the driver from the baked arch.
 */

import { useMemo, forwardRef } from 'react'
import { Effect, EffectAttribute } from 'postprocessing'
import * as THREE from 'three'

import { _pyramidRefs, PYRAMID_LEVELS } from './DownsamplePyramid.jsx'

// Distances are in METERS (view-space), NOT the [0,1] normalized depth — the
// scene's focal planes (park edge ~tens of m, Arch ~1250 m) are a tiny fraction
// of the near:1/far:60000 frustum, so a normalized [0,1] depth has no precision
// there. We work in real metres throughout.
const fragment = /* glsl */`
  #ifdef FRAMEBUFFER_PRECISION_HIGH
    uniform mediump sampler2D uLevel0;
    uniform mediump sampler2D uLevel1;
    uniform mediump sampler2D uLevel2;
    uniform mediump sampler2D uLevel3;
    uniform mediump sampler2D uLevel4;
    uniform mediump sampler2D uLevel5;
    uniform mediump sampler2D uLevel6;
    uniform mediump sampler2D uLevel7;
  #else
    uniform lowp sampler2D uLevel0;
    uniform lowp sampler2D uLevel1;
    uniform lowp sampler2D uLevel2;
    uniform lowp sampler2D uLevel3;
    uniform lowp sampler2D uLevel4;
    uniform lowp sampler2D uLevel5;
    uniform lowp sampler2D uLevel6;
    uniform lowp sampler2D uLevel7;
  #endif
  uniform float uNearFocus;   // m — near sharp distance (sharp from camera to here)
  uniform float uMaxBlur;     // 0..1 — how much the mid/far melts
  uniform float uHeroBlur;    // 0..1 — the Arch's own gentle softening
  uniform float uHeroDist;    // m — the Arch's distance (centre of the hero pocket)
  uniform float uSharpWidth;  // m — near-edge feather
  uniform float uMidRange;    // m — distance over which blur ramps to full
  uniform float uLogDepth;    // 1.0 when logarithmicDepthBuffer is active
  uniform float uDebug;       // >0.5 → paint the blur amount instead of the image

  // Constant-index ladder access (dynamic sampler indexing is undefined in GLSL).
  vec3 sampleLevel(int idx, vec2 uv) {
    if (idx <= 0) return texture2D(uLevel0, uv).rgb;
    if (idx == 1) return texture2D(uLevel1, uv).rgb;
    if (idx == 2) return texture2D(uLevel2, uv).rgb;
    if (idx == 3) return texture2D(uLevel3, uv).rgb;
    if (idx == 4) return texture2D(uLevel4, uv).rgb;
    if (idx == 5) return texture2D(uLevel5, uv).rgb;
    if (idx == 6) return texture2D(uLevel6, uv).rgb;
    return texture2D(uLevel7, uv).rgb;
  }

  // Decode the framework 'depth' to a camera-space distance in metres.
  // Under logarithmicDepthBuffer three.js writes gl_FragDepth = log2(1+w) / log2(far+1),
  // where w = gl_Position.w ≈ camera distance. Invert it; else use the standard helper.
  float depthToDistance(float d) {
    if (uLogDepth > 0.5) {
      return exp2(d * log2(cameraFar + 1.0)) - 1.0;
    }
    #ifdef PERSPECTIVE_CAMERA
      return -perspectiveDepthToViewZ(d, cameraNear, cameraFar);
    #else
      return mix(cameraNear, cameraFar, d);
    #endif
  }

  // Single-focal blur amount [0,1] with a gentle hero pocket. Sharp from the
  // camera out to the near plane; beyond it the blur grows with distance to
  // uMaxBlur (the mid/far melts). Near the Arch's distance it eases to uHeroBlur
  // so the hero reads a LITTLE soft, not tack-sharp nor fully melted.
  float blurAmount(float dist) {
    // Single-focal: SHARP from the camera out to the near plane, then blur grows
    // with distance up to uMaxBlur (the mid/far melts — the LoD cover).
    float nearEdge = uNearFocus + uSharpWidth;
    float melt = smoothstep(nearEdge, nearEdge + uMidRange, dist) * uMaxBlur;
    // HERO pocket: near the hero's distance, ease the blur toward uHeroBlur (a
    // little soft, like IRL) instead of the full far melt. Now testable — DoF is
    // confirmed live in the Hero shot (the gate was disabling it before).
    float band = uMidRange + uSharpWidth;            // hero pocket half-width
    float prox = 1.0 - smoothstep(0.0, band, abs(dist - uHeroDist));
    return mix(melt, uHeroBlur, prox);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    float dist = depthToDistance(depth);
    float amt  = clamp(blurAmount(dist), 0.0, 1.0);

    // Sky + stars sit at the far plane (they render depthWrite OFF, so their
    // pixels keep the cleared depth = 1.0). Hold them at INFINITY FOCUS — sharp,
    // not the far melt — so the bright sky reads as a crisp backdrop and stars
    // stay as points. Real geometry writes depth < 1.0 and still melts normally.
    if (depth >= 0.9999) amt = 0.0;

    if (uDebug > 0.5) {
      // Verification paint: green = sharp (0), red = full blur. Near field green,
      // mid/far red, the Arch a softer green pocket.
      outputColor = vec4(amt, 1.0 - amt, 0.0, 1.0);
      return;
    }

    // ── Pick the blur RADIUS from the ladder by the blur amount (2 taps) ──────
    // Virtual rung 0 = the SHARP input (radius 0); rung k = ladder level k-1
    // (widening). lod = where on that extended ladder this pixel sits; sample the
    // two straddling rungs and lerp → a smooth, continuously-widening blur for 2
    // fetches/pixel. uMaxBlur / uHeroBlur are already folded into amt.
    float lod = amt * float(${PYRAMID_LEVELS});
    float loF = floor(lod);
    int   lo  = int(loF);
    float f   = lod - loF;
    vec3 a = (lo <= 0) ? inputColor.rgb : sampleLevel(lo - 1, uv);  // nearer rung
    vec3 b = sampleLevel(lo, uv);                                    // farther rung (level lo)
    outputColor = vec4(mix(a, b, f), inputColor.a);
  }
`

// Module-level refs the consumer's per-frame driver writes (same pattern as the
// other PostProcessing effects). heroDist is set from the baked arch distance by
// the driver; maxBlur / heroBlur are the 0..1 blur amounts.
export const _dofRefs = {
  nearFocus:  { current: 120 },
  maxBlur:    { current: 0.6 },
  heroBlur:   { current: 0.15 },
  heroDist:   { current: 1250 },
  sharpWidth: { current: 25 },
  midRange:   { current: 300 },
  debug:      { current: 0 },
}

class RomanceDoFEffect extends Effect {
  constructor() {
    super('RomanceDoF', fragment, {
      // CONVOLUTION → its own pass (keeps it isolated/measurable); DEPTH → the
      // framework binds the depth buffer + passes `depth`.
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      uniforms: new Map([
        ['uLevel0',     new THREE.Uniform(null)],
        ['uLevel1',     new THREE.Uniform(null)],
        ['uLevel2',     new THREE.Uniform(null)],
        ['uLevel3',     new THREE.Uniform(null)],
        ['uLevel4',     new THREE.Uniform(null)],
        ['uLevel5',     new THREE.Uniform(null)],
        ['uLevel6',     new THREE.Uniform(null)],
        ['uLevel7',     new THREE.Uniform(null)],
        ['uNearFocus',  new THREE.Uniform(120)],
        ['uMaxBlur',    new THREE.Uniform(0.6)],
        ['uHeroBlur',   new THREE.Uniform(0.15)],
        ['uHeroDist',   new THREE.Uniform(1250)],
        ['uSharpWidth', new THREE.Uniform(25)],
        ['uMidRange',   new THREE.Uniform(300)],
        ['uLogDepth',   new THREE.Uniform(0)],
        ['uDebug',      new THREE.Uniform(0)],
      ]),
    })
  }
  update(renderer) {
    // Bind the shared ladder each frame (built by the DownsamplePyramid pass
    // earlier in the composer — DoF MUST be ordered after it). Fall back to the
    // smallest bound level if a rung is missing so a sampler is never null.
    const levels = _pyramidRefs.levels.current
    const u = this.uniforms
    for (let i = 0; i < 8; i++) {
      u.get('uLevel' + i).value = levels[i] ?? levels[levels.length - 1] ?? null
    }
    u.get('uNearFocus').value  = _dofRefs.nearFocus.current
    u.get('uMaxBlur').value    = _dofRefs.maxBlur.current
    u.get('uHeroBlur').value   = _dofRefs.heroBlur.current
    u.get('uHeroDist').value   = _dofRefs.heroDist.current
    u.get('uSharpWidth').value = _dofRefs.sharpWidth.current
    u.get('uMidRange').value   = _dofRefs.midRange.current
    u.get('uDebug').value      = _dofRefs.debug.current
    // Decode-mode follows the actual canvas depth regime (LOG on desktop, LINEAR
    // on mobile) — read it live so the effect is correct on whichever host mounts it.
    u.get('uLogDepth').value = renderer?.capabilities?.logarithmicDepthBuffer ? 1 : 0
  }
}

export const RomanceDoF = forwardRef((_, ref) => {
  const effect = useMemo(() => new RomanceDoFEffect(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})
