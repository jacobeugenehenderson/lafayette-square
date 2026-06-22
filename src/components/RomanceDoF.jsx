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
 * this (one focal plane → monotonic CoC → it would blur the Arch), so this is a
 * custom CONVOLUTION|DEPTH effect. The 41-tap disk gather is the proven stock
 * `BokehEffect` kernel; ONLY the CoC computation is ours (two-focal, in METERS).
 *
 * ⚠️ STATUS: first cut — NOT yet wired into the shared PostProcessing stack.
 * Mount behind a flag in Preview and verify the DEPTH first (uDebug=1 paints the
 * CoC/zones) BEFORE trusting the blur — desktop runs logarithmicDepthBuffer, and
 * the framework's `depth` is the raw (log-encoded) buffer value, so we decode it
 * ourselves (uLogDepth). See the verify steps in HANDOFF-real-dof Phase 2.
 *
 * Parameterization (the "Focus" channel — to be wired in Phase 3):
 *   nearFocus (m) · farFocus (m, auto = hero distance) · maxBlur · sharpWidth (m).
 */

import { useMemo, forwardRef } from 'react'
import { Effect, EffectAttribute } from 'postprocessing'
import * as THREE from 'three'

// Distances are in METERS (view-space), NOT the [0,1] normalized depth — the
// scene's focal planes (park edge ~tens of m, Arch ~1050 m) are a tiny fraction
// of the near:1/far:60000 frustum, so a normalized [0,1] depth has no precision
// there. We work in real metres throughout.
const fragment = /* glsl */`
  uniform float uNearFocus;   // m — near sharp plane (front row)
  uniform float uFarFocus;    // m — far sharp plane (the Arch / hero)
  uniform float uMaxBlur;     // max blur radius in UV (~0.004–0.02)
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

    vec2 aspectCorrection = vec2(1.0, aspect);
    vec2 b = vec2(coc * uMaxBlur);           // UV blur radius for this fragment
    vec2 b9 = b * 0.9, b7 = b * 0.7, b4 = b * 0.4;

    // Proven 41-tap concentric-disk gather (from postprocessing BokehEffect).
    vec4 color = inputColor;
    color += texture2D(inputBuffer, uv + (vec2( 0.0,  0.4 ) * aspectCorrection) * b);
    color += texture2D(inputBuffer, uv + (vec2( 0.15, 0.37) * aspectCorrection) * b);
    color += texture2D(inputBuffer, uv + (vec2( 0.29, 0.29) * aspectCorrection) * b);
    color += texture2D(inputBuffer, uv + (vec2(-0.37, 0.15) * aspectCorrection) * b);
    color += texture2D(inputBuffer, uv + (vec2( 0.40, 0.0 ) * aspectCorrection) * b);
    color += texture2D(inputBuffer, uv + (vec2( 0.37,-0.15) * aspectCorrection) * b);
    color += texture2D(inputBuffer, uv + (vec2( 0.29,-0.29) * aspectCorrection) * b);
    color += texture2D(inputBuffer, uv + (vec2(-0.15,-0.37) * aspectCorrection) * b);
    color += texture2D(inputBuffer, uv + (vec2( 0.0, -0.4 ) * aspectCorrection) * b);
    color += texture2D(inputBuffer, uv + (vec2(-0.15, 0.37) * aspectCorrection) * b);
    color += texture2D(inputBuffer, uv + (vec2(-0.29, 0.29) * aspectCorrection) * b);
    color += texture2D(inputBuffer, uv + (vec2( 0.37, 0.15) * aspectCorrection) * b);
    color += texture2D(inputBuffer, uv + (vec2(-0.4,  0.0 ) * aspectCorrection) * b);
    color += texture2D(inputBuffer, uv + (vec2(-0.37,-0.15) * aspectCorrection) * b);
    color += texture2D(inputBuffer, uv + (vec2(-0.29,-0.29) * aspectCorrection) * b);
    color += texture2D(inputBuffer, uv + (vec2( 0.15,-0.37) * aspectCorrection) * b);
    color += texture2D(inputBuffer, uv + (vec2( 0.15, 0.37) * aspectCorrection) * b9);
    color += texture2D(inputBuffer, uv + (vec2(-0.37, 0.15) * aspectCorrection) * b9);
    color += texture2D(inputBuffer, uv + (vec2( 0.37,-0.15) * aspectCorrection) * b9);
    color += texture2D(inputBuffer, uv + (vec2(-0.15,-0.37) * aspectCorrection) * b9);
    color += texture2D(inputBuffer, uv + (vec2(-0.15, 0.37) * aspectCorrection) * b9);
    color += texture2D(inputBuffer, uv + (vec2( 0.37, 0.15) * aspectCorrection) * b9);
    color += texture2D(inputBuffer, uv + (vec2(-0.37,-0.15) * aspectCorrection) * b9);
    color += texture2D(inputBuffer, uv + (vec2( 0.15,-0.37) * aspectCorrection) * b9);
    color += texture2D(inputBuffer, uv + (vec2( 0.29, 0.29) * aspectCorrection) * b7);
    color += texture2D(inputBuffer, uv + (vec2( 0.40, 0.0 ) * aspectCorrection) * b7);
    color += texture2D(inputBuffer, uv + (vec2( 0.29,-0.29) * aspectCorrection) * b7);
    color += texture2D(inputBuffer, uv + (vec2( 0.0, -0.4 ) * aspectCorrection) * b7);
    color += texture2D(inputBuffer, uv + (vec2(-0.29, 0.29) * aspectCorrection) * b7);
    color += texture2D(inputBuffer, uv + (vec2(-0.4,  0.0 ) * aspectCorrection) * b7);
    color += texture2D(inputBuffer, uv + (vec2(-0.29,-0.29) * aspectCorrection) * b7);
    color += texture2D(inputBuffer, uv + (vec2( 0.0,  0.4 ) * aspectCorrection) * b7);
    color += texture2D(inputBuffer, uv + (vec2( 0.29, 0.29) * aspectCorrection) * b4);
    color += texture2D(inputBuffer, uv + (vec2( 0.4,  0.0 ) * aspectCorrection) * b4);
    color += texture2D(inputBuffer, uv + (vec2( 0.29,-0.29) * aspectCorrection) * b4);
    color += texture2D(inputBuffer, uv + (vec2( 0.0, -0.4 ) * aspectCorrection) * b4);
    color += texture2D(inputBuffer, uv + (vec2(-0.29, 0.29) * aspectCorrection) * b4);
    color += texture2D(inputBuffer, uv + (vec2(-0.4,  0.0 ) * aspectCorrection) * b4);
    color += texture2D(inputBuffer, uv + (vec2(-0.29,-0.29) * aspectCorrection) * b4);
    color += texture2D(inputBuffer, uv + (vec2( 0.0,  0.4 ) * aspectCorrection) * b4);
    outputColor = color / 41.0;
  }
`

// Module-level refs the consumer's per-frame driver writes (same pattern as the
// other PostProcessing effects). farFocus is expected to be set from the resolved
// hero-subject distance by the driver (auto-anchor to the Arch).
export const _dofRefs = {
  nearFocus:  { current: 40 },
  farFocus:   { current: 1050 },
  maxBlur:    { current: 0.01 },
  sharpWidth: { current: 25 },
  midRange:   { current: 300 },
  debug:      { current: 0 },
}

class RomanceDoFEffect extends Effect {
  constructor() {
    super('RomanceDoF', fragment, {
      // CONVOLUTION → its own pass (it samples inputBuffer neighbours); DEPTH →
      // the framework binds the depth buffer + passes `depth` to mainImage.
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      uniforms: new Map([
        ['uNearFocus',  new THREE.Uniform(40)],
        ['uFarFocus',   new THREE.Uniform(1050)],
        ['uMaxBlur',    new THREE.Uniform(0.01)],
        ['uSharpWidth', new THREE.Uniform(25)],
        ['uMidRange',   new THREE.Uniform(300)],
        ['uLogDepth',   new THREE.Uniform(0)],
        ['uDebug',      new THREE.Uniform(0)],
      ]),
    })
  }
  update(renderer) {
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
