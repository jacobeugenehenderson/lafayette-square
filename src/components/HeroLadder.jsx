/**
 * HeroLadder — a small blur ladder of the HERO OBJECT ALONE, so depth of field can take it back out of the shared blur.
 *
 * ⭐ Why (Jacob, 2026-09-27: "the edge pixels are still dragged away" · "what if we … recorded a separate ladder for the
 * hero object alone?"). DoF reads the shared DownsamplePyramid — a blur of the WHOLE image, kept single for its
 * computation weight — so the background beside the sharp hero read a blur with the hero smeared into it: a halo.
 * This ladder holds only the hero: premultiplied (rgb·m, m), m = 1 on the hero's pixels. RomanceDoF subtracts it from
 * the shared rung and divides out the coverage: (shared − hero.rgb) / (1 − hero.a) is the background alone. Exact —
 * the same 13-tap kernel and the SAME Karis weights as the shared ladder (they are read off the shared image), so the
 * subtraction cancels to rounding, and a multicoloured hero cancels as cleanly as the granite monument.
 * ⭐ The hero's pixels: inside its projected box (dofFocus.box) AND in focus (the same blur law) — a tree standing in
 * front of it is out of focus and stays out. Each level is scissored to that box grown by the level's reach, so the
 * cost is the hero's patch of the screen, not the screen. Desktop-only and mounted only when DoF is on, like DoF.
 * Bloom keeps reading the shared ladder unchanged, so the hero still glows.
 */
import { forwardRef, useMemo } from 'react'
import * as THREE from 'three'
import { Pass } from 'postprocessing'
import { _pyramidRefs } from './DownsamplePyramid.jsx'
import { _dofRefs, _heroLadderRefs, DOF_BLUR_GLSL, HERO_LEVELS } from './RomanceDoF.jsx'

const vert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`
const frag = /* glsl */`
  #define PERSPECTIVE_CAMERA
  #include <packing>
  uniform sampler2D uHero;       // the hero ladder's previous level (premultiplied), unused on level 0
  uniform sampler2D uShared;     // the SHARED image at this step (the scene on level 0, then the shared ladder)
  uniform sampler2D uDepth;
  uniform vec2 uTexel;
  uniform float uFirst, uKaris, uPackedDepth, cameraNear, cameraFar;
  uniform vec4 uRect;            // the hero's box on screen, uv (x0, y0, x1, y1)
  uniform float uLogDepth, uFocusDist, uMaxBlur, uHeroBlur, uZone, uRamp;
  uniform vec2 uTanHalf;
  uniform vec3 uUpView;
  ${DOF_BLUR_GLSL}
  varying vec2 vUv;
  float depthAt(vec2 uv) { return uPackedDepth > 0.5 ? unpackRGBAToDepth(texture2D(uDepth, uv)) : texture2D(uDepth, uv).r; }
  vec4 heroTap(vec2 uv) {
    if (uFirst < 0.5) return texture2D(uHero, uv);
    if (any(lessThan(uv, uRect.xy)) || any(greaterThan(uv, uRect.zw))) return vec4(0.0);
    float inFocus = 1.0 - step(0.02, clamp(blurAmount(depthToDistance(depthAt(uv)), uv), 0.0, 1.0) / max(uMaxBlur, 1e-4));
    return vec4(texture2D(uShared, uv).rgb * inFocus, inFocus);
  }
  float kw(vec3 c) { return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
  vec3 sh(vec2 uv) { return texture2D(uShared, uv).rgb; }
  void main() {
    vec2 t = uTexel;
    vec2 oA = vec2(-2.0, 2.0), oB = vec2(0.0, 2.0), oC = vec2(2.0, 2.0), oD = vec2(-2.0, 0.0), oF = vec2(2.0, 0.0);
    vec2 oG = vec2(-2.0, -2.0), oH = vec2(0.0, -2.0), oI = vec2(2.0, -2.0);
    vec4 a = heroTap(vUv + t * oA), b = heroTap(vUv + t * oB), c = heroTap(vUv + t * oC), d = heroTap(vUv + t * oD);
    vec4 e = heroTap(vUv), f = heroTap(vUv + t * oF), g = heroTap(vUv + t * oG), h = heroTap(vUv + t * oH), i = heroTap(vUv + t * oI);
    vec4 j = heroTap(vUv + t * vec2(-1.0, 1.0)), k = heroTap(vUv + t * vec2(1.0, 1.0));
    vec4 l = heroTap(vUv + t * vec2(-1.0, -1.0)), m = heroTap(vUv + t * vec2(1.0, -1.0));
    vec4 gA = (a + b + d + e) * 0.25, gB = (b + c + e + f) * 0.25, gC = (d + e + g + h) * 0.25, gD = (e + f + h + i) * 0.25;
    vec4 gE = (j + k + l + m) * 0.25;
    vec4 col;
    if (uKaris > 0.5) {
      // The SHARED ladder's weights, read off the shared image at the same taps, so the subtraction is exact.
      vec3 sA = (sh(vUv + t * oA) + sh(vUv + t * oB) + sh(vUv + t * oD) + sh(vUv)) * 0.25;
      vec3 sB = (sh(vUv + t * oB) + sh(vUv + t * oC) + sh(vUv) + sh(vUv + t * oF)) * 0.25;
      vec3 sC = (sh(vUv + t * oD) + sh(vUv) + sh(vUv + t * oG) + sh(vUv + t * oH)) * 0.25;
      vec3 sD = (sh(vUv) + sh(vUv + t * oF) + sh(vUv + t * oH) + sh(vUv + t * oI)) * 0.25;
      vec3 sE = (sh(vUv + t * vec2(-1.0, 1.0)) + sh(vUv + t * vec2(1.0, 1.0)) + sh(vUv + t * vec2(-1.0, -1.0)) + sh(vUv + t * vec2(1.0, -1.0))) * 0.25;
      float wA = kw(sA), wB = kw(sB), wC = kw(sC), wD = kw(sD), wE = kw(sE);
      float wSum = (wA + wB + wC + wD) * 0.125 + wE * 0.5;
      col = (gA * wA * 0.125 + gB * wB * 0.125 + gC * wC * 0.125 + gD * wD * 0.125 + gE * wE * 0.5) / max(wSum, 1e-5);
    } else {
      col = gE * 0.5 + (gA + gB + gC + gD) * 0.125;
    }
    gl_FragColor = max(col, vec4(0.0));
  }
`

class HeroLadderPass extends Pass {
  constructor() {
    super('HeroLadder')
    this.needsSwap = false
    this.needsDepthTexture = true
    this.targets = []
    this._w = 1; this._h = 1
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uHero: { value: null }, uShared: { value: null }, uDepth: { value: null }, uTexel: { value: new THREE.Vector2() },
        uFirst: { value: 1 }, uKaris: { value: 1 }, uPackedDepth: { value: 0 }, cameraNear: { value: 1 }, cameraFar: { value: 60000 },
        uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
        uLogDepth: { value: 0 }, uFocusDist: { value: 1000 }, uTanHalf: { value: new THREE.Vector2(0.2, 0.2) },
        uUpView: { value: new THREE.Vector3(0, 1, 0) }, uMaxBlur: { value: 0 }, uHeroBlur: { value: 0 },
        uZone: { value: 0.2 }, uRamp: { value: 0.5 },
      },
      vertexShader: vert, fragmentShader: frag, depthTest: false, depthWrite: false,
    })
    this._scene = new THREE.Scene(); this._cam = new THREE.Camera()
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat)
    quad.frustumCulled = false
    this._scene.add(quad)
  }
  setDepthTexture(depthTexture, depthPacking) {
    this.mat.uniforms.uDepth.value = depthTexture
    this.mat.uniforms.uPackedDepth.value = depthPacking === THREE.RGBADepthPacking ? 1 : 0
  }
  _makeTargets() {
    for (const t of this.targets) t.dispose()
    this.targets = []
    let w = this._w, h = this._h
    for (let i = 0; i < HERO_LEVELS; i++) {
      w = Math.max(1, Math.floor(w / 2)); h = Math.max(1, Math.floor(h / 2))
      this.targets.push(new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, generateMipmaps: false,
      }))
    }
    _heroLadderRefs.levels.current = this.targets.map(t => t.texture)
  }
  setSize(width, height) { this._w = Math.max(1, width); this._h = Math.max(1, height); this._makeTargets() }
  render(renderer, inputBuffer) {
    if (!this.targets.length) this._makeTargets()
    const rect = _dofRefs.heroRect.current            // null = no hero (nothing picked, or off screen)
    _heroLadderRefs.on.current = !!rect && _dofRefs.maxBlur.current > 0
    if (!_heroLadderRefs.on.current) return
    const shared = _pyramidRefs.levels.current || []
    const u = this.mat.uniforms
    u.uLogDepth.value = renderer.capabilities.logarithmicDepthBuffer ? 1 : 0
    u.cameraNear.value = _dofRefs.near.current; u.cameraFar.value = _dofRefs.far.current
    u.uFocusDist.value = _dofRefs.focusDist.current
    u.uTanHalf.value.copy(_dofRefs.tanHalf.current); u.uUpView.value.copy(_dofRefs.upView.current)
    u.uMaxBlur.value = _dofRefs.maxBlur.current; u.uHeroBlur.value = _dofRefs.heroBlur.current
    u.uZone.value = _dofRefs.zone.current; u.uRamp.value = _dofRefs.ramp.current
    u.uRect.value.set(rect[0], rect[1], rect[2], rect[3])
    const prev = renderer.getRenderTarget(), prevClear = renderer.getClearAlpha(), prevColor = renderer.getClearColor(new THREE.Color())
    renderer.setClearColor(0x000000, 0)
    let hero = null, sharedSrc = inputBuffer.texture, sw = this._w, sh = this._h
    this.targets.forEach((t, i) => {
      // Scissor to the hero's box grown by this level's reach (the 13-tap kernel reaches 2 source texels a level).
      const reach = Math.pow(2, i + 3) / Math.max(this._w, 1), reachY = Math.pow(2, i + 3) / Math.max(this._h, 1)
      const x0 = Math.max(0, Math.floor((rect[0] - reach) * t.width)), x1 = Math.min(t.width, Math.ceil((rect[2] + reach) * t.width))
      const y0 = Math.max(0, Math.floor((rect[1] - reachY) * t.height)), y1 = Math.min(t.height, Math.ceil((rect[3] + reachY) * t.height))
      renderer.setRenderTarget(t)
      t.scissorTest = false; renderer.clear(true, false, false)
      t.scissor.set(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)); t.scissorTest = true
      renderer.setRenderTarget(t)
      u.uHero.value = hero; u.uShared.value = sharedSrc
      u.uTexel.value.set(1 / sw, 1 / sh); u.uFirst.value = i === 0 ? 1 : 0; u.uKaris.value = i < 3 ? 1 : 0
      renderer.render(this._scene, this._cam)
      t.scissorTest = false
      hero = t.texture; sharedSrc = shared[i] ?? sharedSrc; sw = t.width; sh = t.height
    })
    renderer.setRenderTarget(prev); renderer.setClearColor(prevColor, prevClear)
    _heroLadderRefs.levels.current = this.targets.map(t => t.texture)
  }
  dispose() { for (const t of this.targets) t.dispose(); this.mat.dispose(); super.dispose() }
}

export const HeroLadder = forwardRef(function HeroLadder(_props, ref) {
  const pass = useMemo(() => new HeroLadderPass(), [])
  return <primitive ref={ref} object={pass} dispose={null} />
})
