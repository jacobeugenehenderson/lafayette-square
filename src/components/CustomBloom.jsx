/**
 * CustomBloom — a thin bloom that samples the shared DownsamplePyramid.
 *
 * Replaces `@react-three/postprocessing`'s `<Bloom>`. Stock `BloomEffect` owns
 * a PRIVATE bright-pass + mip pyramid (`MipmapBlurPass`, sealed) — it can't
 * share. This bloom samples our standalone `DownsamplePyramid` instead, so the
 * one downsample serves bloom now and DoF in Phase 2 (sharing the pyramid,
 * never the result — CHANNEL-ECONOMY-FORENSIC §2 #2).
 *
 * ── The mechanism shift (the eye-gate) ─────────────────────────────────────
 * Stock bloom is threshold→blur (knee on the sharp scene, THEN its private
 * pyramid). The shared pyramid is a full-scene blur (DoF needs the darks), so
 * this bloom is blur→threshold: it applies the SAME knee
 * `smoothstep(threshold, threshold+smoothing, luminance)` as the library's
 * LuminanceMaterial, but to the BLURRED pyramid. The knobs keep their meaning;
 * the look shifts subtly (small bright sources spread+dim before the knee, so
 * they bloom weaker) → re-tune the `bloom` channel in Stage at the eye-gate.
 * See HANDOFF-real-dof Phase 1.
 *
 * ── API parity (so the channel wiring is untouched) ────────────────────────
 * The two driver sites (PostProcessing.jsx, PreviewPostFx.jsx) set
 * `bloom.intensity`, `bloom.luminanceMaterial.threshold`, and
 * `.luminanceMaterial.smoothing` off the `bloom` channel each frame. This
 * effect exposes those exact accessors (backed by its uniforms), so neither
 * driver changes. The one-tree-program Bloom constraint is about the tree
 * MATERIAL (untouched here) — the bloom PASS swaps safely.
 */

import { useMemo, forwardRef } from 'react'
import { Effect, BlendFunction } from 'postprocessing'
import * as THREE from 'three'

import { _pyramidRefs } from './DownsamplePyramid.jsx'

const fragment = /* glsl */`
  #ifdef FRAMEBUFFER_PRECISION_HIGH
    uniform mediump sampler2D uPyramid;
  #else
    uniform lowp sampler2D uPyramid;
  #endif
  uniform float uIntensity;
  uniform float uThreshold;
  uniform float uSmoothing;
  uniform float uWarmCool;   // 0 cool · 0.5 neutral · 1 warm

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 b = texture2D(uPyramid, uv).rgb;
    // NaN/Inf guard (2026-06-26, FIXED): a single non-finite foliage texel in the
    // HDR scene propagates through the Karis mip pyramid — black squares at low
    // levels, growing to whole-screen flashes as levels rise. The prior guard
    // used mix(vec3(0), b, equal(b,b)), but mix is x*(1-t)+y*t and NaN*0.0==NaN,
    // so a NaN channel survived (→ propagated to black through the SCREEN blend).
    // SELECT with a ternary instead (no arithmetic on the poisoned channel): a
    // bad texel contributes ZERO bloom (SCREEN with 0 = unchanged scene).
    b = vec3(
      (b.x != b.x || abs(b.x) > 60000.0) ? 0.0 : b.x,
      (b.y != b.y || abs(b.y) > 60000.0) ? 0.0 : b.y,
      (b.z != b.z || abs(b.z) > 60000.0) ? 0.0 : b.z
    );
    // NEGATIVE guard (2026-06-26 — the actual root of the black blocks): the
    // pyramid carries negative HDR texels over the canopy; with this SCREEN
    // blend a negative b makes (1-b) > 1 → result < 0 → clamps to PURE BLACK
    // (hard-edged blobs at the zero-crossing). Negative "light" is meaningless;
    // clamp to 0 so a poisoned texel contributes no bloom instead of black.
    b = max(b, vec3(0.0));
    // Same soft knee as the library's LuminanceMaterial, applied to the BLURRED
    // pyramid (blur→threshold). Knobs keep their meaning; see header.
    float l = dot(b, vec3(0.2126, 0.7152, 0.0722));
    float knee = smoothstep(uThreshold, uThreshold + uSmoothing, l);

    // Warm↔Cool tint of the glow, luminance-preserving (0.5 = neutral → no
    // change, existing Looks untouched). Recovers the cool look the full-scene
    // blur→threshold mechanism muddied/warmed. Same photo-tint axis as FilmGrade.
    float bias = (uWarmCool - 0.5) * 2.0;
    vec3 warmTint = vec3(1.10, 1.00, 0.84);
    vec3 coolTint = vec3(0.84, 0.94, 1.12);
    vec3 tint = bias >= 0.0 ? mix(vec3(1.0), warmTint, bias) : mix(vec3(1.0), coolTint, -bias);
    vec3 tb = b * tint;
    float lumOut = dot(tb, vec3(0.2126, 0.7152, 0.0722));
    b = tb * (l / max(lumOut, 1e-4));   // renormalize → preserve glow brightness

    outputColor = vec4(b * knee * uIntensity, inputColor.a);
  }
`

class CustomBloomEffect extends Effect {
  constructor({ intensity = 0.5, threshold = 0.85, smoothing = 0.4, warmCool = 0.5 } = {}) {
    super('CustomBloom', fragment, {
      // SCREEN — matches the current LS bloom (PostProcessing.jsx passed
      // blendFunction={BlendFunction.SCREEN}). NOT convolution: it samples its
      // own pyramid uniform, never inputBuffer neighbours.
      blendFunction: BlendFunction.SCREEN,
      uniforms: new Map([
        ['uPyramid',   new THREE.Uniform(null)],
        ['uIntensity', new THREE.Uniform(intensity)],
        ['uThreshold', new THREE.Uniform(threshold)],
        ['uSmoothing', new THREE.Uniform(smoothing)],
        ['uWarmCool',  new THREE.Uniform(warmCool)],
      ]),
    })

    // ── API-parity shim with @react-three/postprocessing's <Bloom> ──────────
    // Stable object so `bloom.luminanceMaterial` reads/writes the uniforms; the
    // drivers set `.threshold` / `.smoothing` on it each frame.
    const u = this.uniforms
    this._luminanceMaterial = {
      get threshold() { return u.get('uThreshold').value },
      set threshold(v) { u.get('uThreshold').value = v },
      get smoothing() { return u.get('uSmoothing').value },
      set smoothing(v) { u.get('uSmoothing').value = v },
    }
  }

  get luminanceMaterial() { return this._luminanceMaterial }

  get intensity() { return this.uniforms.get('uIntensity').value }
  set intensity(v) { this.uniforms.get('uIntensity').value = v }

  get warmCool() { return this.uniforms.get('uWarmCool').value }
  set warmCool(v) { this.uniforms.get('uWarmCool').value = v }

  update(/* renderer, inputBuffer, deltaTime */) {
    // Bind the shared pyramid each frame (it's rebuilt by the DownsamplePyramid
    // pass earlier in the composer). A null/black handle SCREEN-blends to a
    // no-op, so first-frame mount order is safe.
    this.uniforms.get('uPyramid').value = _pyramidRefs.texture.current
  }
}

export { CustomBloomEffect }

export const CustomBloom = forwardRef(function CustomBloom(_, ref) {
  const effect = useMemo(() => new CustomBloomEffect(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})
