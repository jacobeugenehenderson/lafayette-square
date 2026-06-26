/**
 * RomanceDoF — the two-focal depth-of-field (HANDOFF-real-dof.md).
 *
 * The focus model (Jacob, 2026-06-21) is genuinely TWO-FOCAL, not a single
 * plane:
 *   - NEAR plane sharp  — the "front row" by the camera (e.g. the park edge).
 *   - FAR plane sharp   — the Hero Object (the Arch) at ~infinity focus.
 *   - graded blur everywhere else — in front of the near plane AND through the
 *     mid-distance, easing back to sharp as depth reaches the Arch.
 * So CoC(dist) has TWO zeros with a hump between. Stock <DepthOfField> can't do
 * this (one focal plane → monotonic CoC → it would blur the Arch).
 *
 * ── Phase 2: blur from the SHARED pyramid (not a self-gather) ───────────────
 * The blur is no longer a per-pixel iris gather of the scene (expensive + crude
 * — "the old DoF looked like trash"). Instead this LERPS the sharp scene toward
 * the shared `DownsamplePyramid` (a smooth, wide, full-scene blur built once
 * and shared with bloom) by the CoC. One texture sample instead of ~36 taps:
 * cheap, smooth, and the whole point of the shared pyramid. Only the CoC
 * (two-focal, in METERS) is ours; the blur is free off the pyramid.
 * ⚠️ Must run AFTER the DownsamplePyramid pass in the composer (it samples its
 * texture via _pyramidRefs).
 *
 * Parameterization (the "Focus" channel):
 *   focus (m, near sharp plane) · blur (0..1 strength) · softness (band width).
 *   farFocus auto-derives from focus in the consumer (focus + 700 m).
 */

import { useMemo, forwardRef } from 'react'
import { Effect, EffectAttribute } from 'postprocessing'
import * as THREE from 'three'

import { _pyramidRefs } from './DownsamplePyramid.jsx'

// Distances are in METERS (view-space), NOT the [0,1] normalized depth — the
// scene's focal planes (park edge ~tens of m, Arch ~1050 m) are a tiny fraction
// of the near:1/far:60000 frustum, so a normalized [0,1] depth has no precision
// there. We work in real metres throughout.
const fragment = /* glsl */`
  #ifdef FRAMEBUFFER_PRECISION_HIGH
    uniform mediump sampler2D uBlurTex;   // the shared DownsamplePyramid
  #else
    uniform lowp sampler2D uBlurTex;
  #endif
  uniform float uNearFocus;   // m — near sharp plane (front row)
  uniform float uFarFocus;    // m — far sharp plane (the Arch / hero)
  uniform float uMaxBlur;     // 0..1 — max lerp strength toward the blur
  uniform float uSharpWidth;  // m — half-width of each sharp band
  uniform float uMidRange;    // m — distance over which blur ramps to full
  uniform float uLogDepth;    // 1.0 when logarithmicDepthBuffer is active
  uniform float uDebug;       // >0.5 → paint CoC/zones instead of the image

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

  // Two-focal circle-of-confusion, normalized [0,1]. Zero in both sharp bands
  // (near + far) and beyond the far plane (the Arch stays sharp to infinity);
  // a flat-topped hump between, plus a foreground ramp closer than the near band.
  float twoFocalCoC(float dist) {
    float nLo = uNearFocus - uSharpWidth;   // foreground edge of the near sharp band
    float nHi = uNearFocus + uSharpWidth;   // mid edge of the near sharp band
    float fLo = uFarFocus  - uSharpWidth;    // mid edge of the far sharp band
    if (dist < nLo) {
      // foreground: blur grows as you get closer than the near band
      return smoothstep(nLo, nLo - uMidRange, dist);
    } else if (dist <= nHi) {
      return 0.0;                            // near sharp band (front row)
    } else if (dist < fLo) {
      // mid: ramp up after the near band, ramp down before the far band → trapezoid hump
      float up   = smoothstep(nHi, nHi + uMidRange, dist);
      float down = smoothstep(fLo, fLo - uMidRange, dist);
      return min(up, down);
    }
    return 0.0;                              // far sharp band + beyond (the Arch)
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    float dist = depthToDistance(depth);
    float coc  = twoFocalCoC(dist);

    if (uDebug > 0.5) {
      // Verification paint: green = sharp (CoC 0), red = full blur, so the focal
      // banding is legible against the scene (front row + Arch should read green).
      outputColor = vec4(coc, 1.0 - coc, 0.0, 1.0);
      return;
    }

    // ── CoC-weighted lerp toward the shared pyramid blur ─────────────────────
    // The pyramid is a smooth, wide, full-scene blur (built once, shared with
    // bloom). Mixing the sharp scene toward it by the CoC gives a cheap, clean
    // defocus — no per-pixel gather. amt clamps to [0,1]; at the focal planes
    // (coc 0) it's fully sharp, deep in the blur hump it reaches the pyramid.
    vec3 blurred = texture2D(uBlurTex, uv).rgb;
    // Belt-and-suspenders guard on the shared pyramid sample. The ROOT fix for
    // the dark blocks is the tree-output sanitize (treeAtlasMaterial.js); this
    // stays as a defensive net. A channel is "bad" if NaN (x!=x), Inf/absurd, OR
    // NEGATIVE — a negative blur texel would drag the CoC lerp below 0 → black.
    // SELECT with a ternary (never mix(): mix(x,y,t)=x*(1-t)+y*t and NaN*0==NaN);
    // fall back to the SHARP input so a bad texel just reads in-focus, never dark.
    blurred = vec3(
      (blurred.x != blurred.x || blurred.x < 0.0 || abs(blurred.x) > 65000.0) ? inputColor.r : blurred.x,
      (blurred.y != blurred.y || blurred.y < 0.0 || abs(blurred.y) > 65000.0) ? inputColor.g : blurred.y,
      (blurred.z != blurred.z || blurred.z < 0.0 || abs(blurred.z) > 65000.0) ? inputColor.b : blurred.z
    );
    float amt = clamp(coc * uMaxBlur, 0.0, 1.0);
    outputColor = vec4(mix(inputColor.rgb, blurred, amt), inputColor.a);
  }
`

// Module-level refs the consumer's per-frame driver writes (same pattern as the
// other PostProcessing effects). farFocus is set from focus + 700 m by the
// driver; maxBlur is the 0..1 lerp strength (Phase 2 — no longer a UV radius).
export const _dofRefs = {
  nearFocus:  { current: 40 },
  farFocus:   { current: 1050 },
  maxBlur:    { current: 0.4 },
  sharpWidth: { current: 25 },
  midRange:   { current: 300 },
  debug:      { current: 0 },
}

class RomanceDoFEffect extends Effect {
  constructor() {
    super('RomanceDoF', fragment, {
      // CONVOLUTION → its own pass (keeps it isolated/measurable and avoids a
      // uniform-name clash with bloom's pyramid sampler in a merged pass);
      // DEPTH → the framework binds the depth buffer + passes `depth`.
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      uniforms: new Map([
        ['uBlurTex',    new THREE.Uniform(null)],
        ['uNearFocus',  new THREE.Uniform(40)],
        ['uFarFocus',   new THREE.Uniform(1050)],
        ['uMaxBlur',    new THREE.Uniform(0.4)],
        ['uSharpWidth', new THREE.Uniform(25)],
        ['uMidRange',   new THREE.Uniform(300)],
        ['uLogDepth',   new THREE.Uniform(0)],
        ['uDebug',      new THREE.Uniform(0)],
      ]),
    })
  }
  update(renderer) {
    // Bind the shared pyramid each frame (built by the DownsamplePyramid pass
    // earlier in the composer — DoF MUST be ordered after it).
    this.uniforms.get('uBlurTex').value    = _pyramidRefs.texture.current
    this.uniforms.get('uNearFocus').value  = _dofRefs.nearFocus.current
    this.uniforms.get('uFarFocus').value   = _dofRefs.farFocus.current
    this.uniforms.get('uMaxBlur').value    = _dofRefs.maxBlur.current
    this.uniforms.get('uSharpWidth').value = _dofRefs.sharpWidth.current
    this.uniforms.get('uMidRange').value   = _dofRefs.midRange.current
    this.uniforms.get('uDebug').value      = _dofRefs.debug.current
    // Decode-mode follows the actual canvas depth regime (LOG on desktop, LINEAR
    // on mobile) — read it live so the effect is correct on whichever host mounts it.
    this.uniforms.get('uLogDepth').value = renderer?.capabilities?.logarithmicDepthBuffer ? 1 : 0
  }
}

export const RomanceDoF = forwardRef((_, ref) => {
  const effect = useMemo(() => new RomanceDoFEffect(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})
