/**
 * CustomBloom — a thin bloom that samples the shared DownsamplePyramid ladder.
 *
 * Replaces `@react-three/postprocessing`'s `<Bloom>`. Stock `BloomEffect` owns a
 * PRIVATE bright-pass + mip pyramid (sealed) — it can't share. This bloom reads
 * the standalone `DownsamplePyramid` instead, so the one downsample serves bloom
 * and DoF (sharing the LADDER, never each other's result).
 *
 * ── The mechanism (HDR high-pass across SCALES, not a luminance gate) ───────
 * Bloom is light scattering — a glow that sits ON the bright sources, dark
 * staying dark. The first cut applied a luminance smoothstep gate to ONE
 * collapsed full-scene blur, which (a) thresholded AFTER the blur, so a lamp's
 * energy was diluted into its surroundings before the gate and broad midtones
 * (sky, sunlit walls) drifted over it → a flat warm WASH, and (b) had only one
 * blur scale, so no core+halo shape. This version fixes both off the shared
 * ladder:
 *   • HDR soft-knee high-pass (Unity/Karis) on EACH rung — keeps the bright
 *     cores (energy survives the energy-conserving downsample) and lets midtones
 *     fall away; no binary gate, no wash.
 *   • Sums several rungs — the tight rungs give the bright core, the wide rungs
 *     give the soft halo → real multi-scale glow.
 * `uThreshold` = the HDR floor, `uSmoothing` = the soft-knee width. Mechanism
 * shifted → re-tune the `bloom` channel in Stage at the eye-gate.
 *
 * ── API parity (so the channel wiring is untouched) ────────────────────────
 * The driver sites (PostProcessing.jsx, PreviewPostFx.jsx) set `bloom.intensity`,
 * `bloom.luminanceMaterial.threshold`, `.luminanceMaterial.smoothing`, and
 * `bloom.warmCool` off the `bloom` channel each frame. This effect exposes those
 * exact accessors (backed by its uniforms), so neither driver changes. The
 * one-tree-program Bloom constraint is about the tree MATERIAL (untouched here)
 * — the bloom PASS swaps safely.
 */

import { useMemo, forwardRef } from 'react'
import { Effect, BlendFunction } from 'postprocessing'
import * as THREE from 'three'

import { _pyramidRefs, PYRAMID_LEVELS } from './DownsamplePyramid.jsx'

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
  uniform float uIntensity;
  uniform float uThreshold;
  uniform float uSmoothing;
  uniform float uWarmCool;   // 0 cool · 0.5 neutral · 1 warm

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

  // HDR soft-knee high-pass on one rung — hue-preserving contribution factor.
  // Bright (HDR > floor) keeps ~all its energy; midtones near the floor ramp in
  // softly; below the floor → 0. (Unity/Karis prefilter curve.)
  vec3 highPass(vec3 c) {
    c = max(c, vec3(0.0));
    float b    = max(c.x, max(c.y, c.z));
    float knee = uThreshold * uSmoothing + 1e-5;
    float soft = clamp(b - uThreshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-5);
    float contribution = max(soft, b - uThreshold) / max(b, 1e-5);
    return c * contribution;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // SUM the high-passed rungs (do NOT average). A small light's energy lives
    // only in the FINE rungs — downsampling a point thins its energy, while a
    // broad bright area (the sky) stays bright at every rung. Averaging across
    // all rungs diluted the point-lights and let the always-bright sky dominate
    // ("the effect gets used up in the sky"); summing restores the bright core
    // (fine rungs) + the soft halo (wide rungs).
    vec3 glow = vec3(0.0);
    for (int i = 0; i < ${PYRAMID_LEVELS}; i++) {
      glow += highPass(sampleLevel(i, uv));
    }

    // Hue-preserving compression (Reinhard on luminance) — the very-luminous sky
    // rolls off to a soft halation while dim lights stay ~linear, so the sky and
    // the small lights land in the same visual range and BOTH read. No gating.
    float gl = dot(glow, vec3(0.2126, 0.7152, 0.0722));
    glow *= (gl > 1e-5) ? ((gl / (1.0 + gl)) / gl) : 1.0;

    // Warm↔Cool tint of the glow, luminance-preserving (0.5 = neutral → no
    // change, existing Looks untouched). Optional artistic tint — the HDR
    // high-pass no longer warms the glow, so this isn't a patch over a wash.
    float bias = (uWarmCool - 0.5) * 2.0;
    vec3 warmTint = vec3(1.10, 1.00, 0.84);
    vec3 coolTint = vec3(0.84, 0.94, 1.12);
    vec3 tint = bias >= 0.0 ? mix(vec3(1.0), warmTint, bias) : mix(vec3(1.0), coolTint, -bias);
    float lIn  = dot(glow, vec3(0.2126, 0.7152, 0.0722));
    vec3  tg   = glow * tint;
    float lOut = dot(tg, vec3(0.2126, 0.7152, 0.0722));
    glow = tg * (lIn / max(lOut, 1e-4));

    outputColor = vec4(glow * uIntensity, inputColor.a);
  }
`

class CustomBloomEffect extends Effect {
  constructor({ intensity = 0.5, threshold = 0.85, smoothing = 0.4, warmCool = 0.5 } = {}) {
    super('CustomBloom', fragment, {
      // ADD — the correct blend for an HDR bloom. This runs BEFORE tone-mapping,
      // where the scene carries values > 1. SCREEN (x + y − x·y) is an LDR (0..1)
      // op: on an HDR-bright pixel (the sky) it DARKENS — screen(2.0, glow) = 1.5
      // < 2.0 — which muddied/"used up" the sky. Additive glow tone-maps right.
      // NOT convolution: samples the shared ladder uniforms, never neighbours.
      blendFunction: BlendFunction.ADD,
      uniforms: new Map([
        ['uLevel0',    new THREE.Uniform(null)],
        ['uLevel1',    new THREE.Uniform(null)],
        ['uLevel2',    new THREE.Uniform(null)],
        ['uLevel3',    new THREE.Uniform(null)],
        ['uLevel4',    new THREE.Uniform(null)],
        ['uLevel5',    new THREE.Uniform(null)],
        ['uLevel6',    new THREE.Uniform(null)],
        ['uLevel7',    new THREE.Uniform(null)],
        ['uIntensity', new THREE.Uniform(intensity)],
        ['uThreshold', new THREE.Uniform(threshold)],
        ['uSmoothing', new THREE.Uniform(smoothing)],
        ['uWarmCool',  new THREE.Uniform(warmCool)],
      ]),
    })

    // ── API-parity shim with @react-three/postprocessing's <Bloom> ──────────
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
    // Bind the shared ladder each frame (rebuilt by the DownsamplePyramid pass
    // earlier in the composer). A null/black handle SCREEN-blends to a no-op, so
    // first-frame mount order is safe.
    const levels = _pyramidRefs.levels.current
    const u = this.uniforms
    for (let i = 0; i < 8; i++) {
      u.get('uLevel' + i).value = levels[i] ?? levels[levels.length - 1] ?? null
    }
  }
}

export { CustomBloomEffect }

export const CustomBloom = forwardRef(function CustomBloom(_, ref) {
  const effect = useMemo(() => new CustomBloomEffect(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})
