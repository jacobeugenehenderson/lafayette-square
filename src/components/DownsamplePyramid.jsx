/**
 * DownsamplePyramid — the shared blur LADDER (the gang, done right).
 *
 * ONE expensive downsample chain, paid once, exposing every RUNG so each
 * consumer takes the blur RADIUS it needs:
 *   - RomanceDoF — picks the level matching its circle-of-confusion → a real
 *                  focus pull (blur radius grows with distance from focus).
 *   - CustomBloom — high-passes in HDR + weights several levels → a glow with a
 *                   tight core and a wide halo.
 * Both SAMPLE the rungs; neither consumes the other's result. The earlier
 * version collapsed the whole pyramid into ONE blurred texture (a single fixed
 * radius), which starved both effects — DoF could only cross-fade opacity (a
 * veil, not a focus pull) and bloom could only smear one scale. Exposing the
 * ladder is the fix the audit pointed at.
 *
 * Level i is the full scene downsampled to res/2^(i+1): level 0 ≈ half-res (a
 * tight blur), level 7 ≈ a wide soft blur. A 13-tap Jimenez/COD kernel makes
 * each step smooth + firefly-resistant. The whole chain is the shared cost; the
 * per-consumer sampling is a handful of cheap fetches on tiny mips.
 *
 * Mounted as a raw Pass child of <EffectComposer> with needsSwap=false so the
 * main color buffer passes through untouched — this pass only publishes the
 * ladder textures to _pyramidRefs.levels for the consumers downstream.
 */

import { useMemo, forwardRef } from 'react'
import { Pass } from 'postprocessing'
import * as THREE from 'three'

// Number of rungs. 8 from half-res reaches a ~1/256-screen widest blur — plenty
// of radius range for both DoF and bloom. Consumers bind exactly this many
// samplers, so this is the single source of truth for the ladder height.
export const PYRAMID_LEVELS = 8

// Shared handle — the pass publishes its rung textures here each frame; the
// consumers (CustomBloom, RomanceDoF) read them in their per-frame update().
// One composer per page (Stage / Preview / production), so a module singleton
// is safe — same idiom as _dofRefs / _lampGlow. `current` is a STABLE array
// reference, repopulated each frame, so consumers can read it without nulls.
export const _pyramidRefs = {
  levels: { current: [] },
}

// 13-tap Jimenez/COD downsample — smooth, energy-preserving. On the FIRST level
// (uKaris=1) a partial Karis average (luma-weighted) tames thin bright sources
// (neon, lamps) so they don't alias into blocky chunks under DoF/bloom; deeper
// levels use the plain weights. Normal-mode output is byte-identical to the old
// kernel — the 5 box-groups recombine to the same weighted sum.
const downsampleFrag = /* glsl */`
  uniform sampler2D uInput;
  uniform vec2 uTexel;        // 1 / size of the SOURCE level being read
  uniform float uKaris;       // 1.0 on the first downsample only
  varying vec2 vUv;
  float kw(vec3 c) { return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
  void main() {
    vec2 t = uTexel;
    vec3 a = texture2D(uInput, vUv + t * vec2(-2.0,  2.0)).rgb;
    vec3 b = texture2D(uInput, vUv + t * vec2( 0.0,  2.0)).rgb;
    vec3 c = texture2D(uInput, vUv + t * vec2( 2.0,  2.0)).rgb;
    vec3 d = texture2D(uInput, vUv + t * vec2(-2.0,  0.0)).rgb;
    vec3 e = texture2D(uInput, vUv).rgb;
    vec3 f = texture2D(uInput, vUv + t * vec2( 2.0,  0.0)).rgb;
    vec3 g = texture2D(uInput, vUv + t * vec2(-2.0, -2.0)).rgb;
    vec3 h = texture2D(uInput, vUv + t * vec2( 0.0, -2.0)).rgb;
    vec3 i = texture2D(uInput, vUv + t * vec2( 2.0, -2.0)).rgb;
    vec3 j = texture2D(uInput, vUv + t * vec2(-1.0,  1.0)).rgb;
    vec3 k = texture2D(uInput, vUv + t * vec2( 1.0,  1.0)).rgb;
    vec3 l = texture2D(uInput, vUv + t * vec2(-1.0, -1.0)).rgb;
    vec3 m = texture2D(uInput, vUv + t * vec2( 1.0, -1.0)).rgb;
    // 5 box-groups (2x2 averages); they recombine to the original 13-tap weights.
    vec3 gA = (a + b + d + e) * 0.25;
    vec3 gB = (b + c + e + f) * 0.25;
    vec3 gC = (d + e + g + h) * 0.25;
    vec3 gD = (e + f + h + i) * 0.25;
    vec3 gE = (j + k + l + m) * 0.25;
    vec3 col;
    if (uKaris > 0.5) {
      // Karis partial average — down-weight bright groups so a thin bright source
      // (neon, a lamp) can't dominate the first downsample and alias into blocks
      // under DoF/bloom. Deeper levels keep the plain weights.
      float wA = kw(gA), wB = kw(gB), wC = kw(gC), wD = kw(gD), wE = kw(gE);
      float wSum = (wA + wB + wC + wD) * 0.125 + wE * 0.5;
      col = (gA * wA * 0.125 + gB * wB * 0.125 + gC * wC * 0.125 + gD * wD * 0.125 + gE * wE * 0.5) / max(wSum, 1e-5);
    } else {
      col = gE * 0.5 + (gA + gB + gC + gD) * 0.125;   // == the original 13-tap
    }
    // Guard non-finite / negative HDR texels so a bad scene pixel can't poison
    // the ladder (the dark-block root fix lives in treeAtlasMaterial; this is a
    // cheap net). NaN → 0 via the self-compare; negatives clamped to 0.
    col = max(vec3(
      (col.x != col.x) ? 0.0 : col.x,
      (col.y != col.y) ? 0.0 : col.y,
      (col.z != col.z) ? 0.0 : col.z
    ), vec3(0.0));
    gl_FragColor = vec4(col, 1.0);
  }
`

const downsampleVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

class DownsamplePyramidPass extends Pass {
  constructor() {
    super('DownsamplePyramid')
    // Side-resource: do not consume/replace the main color buffer.
    this.needsSwap = false
    this.targets = []
    this._w = 1
    this._h = 1

    // Self-managed fullscreen quad (PlaneGeometry(2,2) spans clip space with the
    // passthrough vertex) — independent of the base Pass's fullscreen plumbing.
    this.downMat = new THREE.ShaderMaterial({
      uniforms: {
        uInput: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uKaris: { value: 0.0 },
      },
      vertexShader: downsampleVert,
      fragmentShader: downsampleFrag,
      depthTest: false,
      depthWrite: false,
    })
    this._fsScene = new THREE.Scene()
    this._fsCamera = new THREE.Camera()
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.downMat)
    quad.frustumCulled = false
    this._fsScene.add(quad)
    this._fsQuad = quad
  }

  _makeTargets() {
    for (const t of this.targets) t.dispose()
    this.targets = []
    let w = this._w
    let h = this._h
    for (let i = 0; i < PYRAMID_LEVELS; i++) {
      w = Math.max(1, Math.floor(w / 2))
      h = Math.max(1, Math.floor(h / 2))
      this.targets.push(new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType,        // HDR — bright sources keep their energy
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer: false,
        generateMipmaps: false,
      }))
    }
    _pyramidRefs.levels.current = this.targets.map(t => t.texture)
  }

  setSize(width, height) {
    this._w = Math.max(1, width)
    this._h = Math.max(1, height)
    this._makeTargets()
  }

  render(renderer, inputBuffer) {
    if (this.targets.length === 0) this._makeTargets()
    const prev = renderer.getRenderTarget()
    let srcTex = inputBuffer.texture
    let srcW = this._w
    let srcH = this._h
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i]
      this.downMat.uniforms.uInput.value = srcTex
      this.downMat.uniforms.uTexel.value.set(1 / srcW, 1 / srcH)
      // Tame bright thin sources (neon, lamps) on the first THREE downsamples,
      // not just level 0. The thin bright neon survived the single level-0 Karis
      // and aliased into blocky chunks when DoF/bloom sampled the deeper low-res
      // mips — the "neon looks terrible in the blurred areas" de-block. Carrying
      // the luma-weighted down-weight into levels 1–2 keeps the bright source from
      // dominating those coarser mips. Levels 3+ keep the plain energy-preserving
      // weights. (2026-06-28 — neon de-block; the resolutionScale dial is gone.)
      this.downMat.uniforms.uKaris.value = (i < 3) ? 1.0 : 0.0

      renderer.setRenderTarget(t)
      renderer.render(this._fsScene, this._fsCamera)
      srcTex = t.texture
      srcW = t.width
      srcH = t.height
    }
    renderer.setRenderTarget(prev)
    _pyramidRefs.levels.current = this.targets.map(t => t.texture)
  }

  dispose() {
    for (const t of this.targets) t.dispose()
    this._fsQuad.geometry.dispose()
    this.downMat.dispose()
    super.dispose()
  }
}

export { DownsamplePyramidPass }

// React mount — a raw Pass child of <EffectComposer> (r3f adds any
// `instanceof Pass` child standalone, in JSX order). Place AFTER the scene
// render (and N8AO) and BEFORE the consumers (DoF, bloom) that sample it.
// Accepts (and ignores) legacy levels/radius/resolutionScale props so existing
// mount sites don't break; the ladder height is fixed at PYRAMID_LEVELS.
export const DownsamplePyramid = forwardRef(function DownsamplePyramid(_props, ref) {
  const pass = useMemo(() => new DownsamplePyramidPass(), [])
  return <primitive ref={ref} object={pass} dispose={null} />
})
