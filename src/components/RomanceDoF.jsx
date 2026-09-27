/**
 * RomanceDoF — depth of field focused on WHAT THE CAMERA IS LOOKING AT, sized RELATIVE to it.
 *
 * ⭐ The model (Jacob, 2026-09-27: "get rid of the actual meters and make it relative" · noon's tilt-shift): the
 * sharp plane sits at the focus point (picked, or the camera's aim), and blur grows with the RELATIVE distance from it
 * — IN FRONT AND BEHIND — up to `blur`. So the same numbers frame a 1-km town and a 10-km one alike, and a narrow
 * sharp zone gives the miniature ("dollhouse") look.
 * ⛔ Replaces the 2026-06-26 model (sharp from the camera out to a focus in METRES, then a far melt): a constant
 *   that fitted one town's camera, which smeared Provincetown's whole hero frame (CLAUDE.md Layer 0, Class D).
 *
 * ── Variable RADIUS off the shared ladder ───────────────────────────────────
 * The blur AMOUNT selects which rung of the shared DownsamplePyramid ladder to read (level 0 tight … 7 wide); a
 * virtual rung "0" is the sharp input. Two taps/pixel (the straddling rungs).
 * ⚠️ Must run AFTER the DownsamplePyramid pass in the composer (it samples its ladder via _pyramidRefs.levels).
 *
 * Parameterization (the "Focus" channel): blur (0..1, the most) · heroBlur (0..1, the
 * softness AT the focal plane) · softness (how deep the sharp zone is, and how gently it melts).
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
  uniform float uFocusDist;   // m — the sharp plane (focus × the aim point's view depth), set per frame
  uniform float uMaxBlur;     // 0..1 — the most blur, far from the plane
  uniform float uHeroBlur;    // 0..1 — softness AT the plane
  uniform float uZone;        // the sharp zone's half-depth, as a fraction of the focal distance
  uniform float uRamp;        // how far past it (same unit) the blur reaches full
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

  // Blur by RELATIVE distance from the focal plane, in front and behind: 0 = on the plane.
  float blurAmount(float dist) {
    float rel = abs(dist - uFocusDist) / max(uFocusDist, 1.0);
    // Softness at focus never exceeds Blur: at Blur 0 the effect is OFF, and the plane is never softer than the
    // field around it (it was — the picked subject blurred while the rest stayed sharp, 2026-09-27).
    return mix(min(uHeroBlur, uMaxBlur), uMaxBlur, smoothstep(uZone, uZone + uRamp, rel));
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

// Module-level refs the per-frame driver (dofDriver.js) writes — same pattern as the other PostProcessing effects.
export const _dofRefs = {
  focusDist:  { current: 1000 },
  maxBlur:    { current: 0 },
  heroBlur:   { current: 0 },
  zone:       { current: 0.2 },
  ramp:       { current: 0.5 },
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
        ['uFocusDist',  new THREE.Uniform(1000)],
        ['uMaxBlur',    new THREE.Uniform(0)],
        ['uHeroBlur',   new THREE.Uniform(0)],
        ['uZone',       new THREE.Uniform(0.2)],
        ['uRamp',       new THREE.Uniform(0.5)],
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
    u.get('uFocusDist').value  = _dofRefs.focusDist.current
    u.get('uMaxBlur').value    = _dofRefs.maxBlur.current
    u.get('uHeroBlur').value   = _dofRefs.heroBlur.current
    u.get('uZone').value       = _dofRefs.zone.current
    u.get('uRamp').value       = _dofRefs.ramp.current
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
