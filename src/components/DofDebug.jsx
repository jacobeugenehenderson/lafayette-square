/**
 * DofDebug — the depth-of-field debug paint (window.__dofDebug = 1; Preview: ?dofDebug=1): red = the blur amount,
 * green = 1 − it, read straight off the canvas as red/255.
 *
 * ⛔ DRAWN AFTER THE COMPOSER, never inside it. It was a branch in RomanceDoF and five passes repainted it (PTown,
 * 2026-10-28: a foreground at blur 0.2 read red 0–15); as an Effect it was merged and SORTED by postprocessing (depth
 * effects first, so grain ran over it), and N8AO's pass draws to the screen after every Effect. So it is a frame
 * callback one priority after the composer's (renderPipeline.jsx#COMPOSER_PRIORITY), drawing one quad over the canvas:
 * the same law (RomanceDoF.jsx#DOF_BLUR_GLSL) on the same refs (_dofRefs) and the composer's own depth texture, the one
 * DoF reads. It costs nothing while the flag is off. ▶ node checks/claims-the-debug-paint-is-the-pass-amount.mjs
 */
import { useMemo } from 'react'
import { useTownFrame } from '../lib/useTownFrame.js'
import * as THREE from 'three'
import { _dofRefs, _heroLadderRefs, DOF_BLUR_GLSL, DOF_FOCUS_OBJECT_GLSL } from './RomanceDoF.jsx'

const frag = /* glsl */`
  #define PERSPECTIVE_CAMERA
  #include <packing>
  uniform sampler2D uDepth;
  uniform float cameraNear, cameraFar, uFocusDist, uMaxBlur, uHeroBlur, uZone, uRamp, uLogDepth, uFocusOn, uDiscR;
  uniform mat4 uCamWorld;
  uniform vec2 uDiscC;
  uniform vec2 uTanHalf;
  uniform vec3 uUpView;
  uniform float uHeroOn, uHeroNear, uHeroGround;
  uniform sampler2D uMask;
  uniform vec4 uHeroRect;
  ${DOF_BLUR_GLSL}
  ${DOF_FOCUS_OBJECT_GLSL}
  varying vec2 vUv;
  void main() {
    float dist = depthToDistance(texture2D(uDepth, vUv).r);
    float amt = focusObjectAmount(clamp(blurAmount(dist, vUv), 0.0, 1.0), dist, vUv);
    gl_FragColor = vec4(amt, 1.0 - amt, 0.0, 1.0);
  }
`

/** @param composer a ref to the composer (its input buffer's depth texture) · @param after the composer's render priority */
export function DofDebug({ composer, after }) {
  const draw = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.fromEntries(['cameraNear', 'cameraFar', 'uFocusDist', 'uMaxBlur', 'uHeroBlur', 'uZone', 'uRamp', 'uLogDepth', 'uFocusOn', 'uDiscR', 'uHeroOn', 'uHeroNear', 'uHeroGround'].map(k => [k, { value: 0 }])
        .concat([['uDepth', { value: null }], ['uTanHalf', { value: new THREE.Vector2() }], ['uUpView', { value: new THREE.Vector3() }], ['uCamWorld', { value: new THREE.Matrix4() }], ['uDiscC', { value: new THREE.Vector2() }], ['uMask', { value: null }], ['uHeroRect', { value: new THREE.Vector4() }]])),
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: frag, depthTest: false, depthWrite: false,
    })
    const scene = new THREE.Scene(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
    quad.frustumCulled = false; scene.add(quad)
    return { mat, scene, cam: new THREE.Camera() }
  }, [])
  useTownFrame(({ gl }) => {
    if (!(typeof window !== 'undefined' && window.__dofDebug)) return
    const depth = composer.current?.inputBuffer?.depthTexture
    if (!depth) { console.error('[dof] ⛔ debug paint: the composer has no depth texture — nothing painted'); return }
    const u = draw.mat.uniforms
    u.uDepth.value = depth
    u.cameraNear.value = _dofRefs.near.current; u.cameraFar.value = _dofRefs.far.current
    u.uFocusDist.value = _dofRefs.focusDist.current
    u.uTanHalf.value.copy(_dofRefs.tanHalf.current); u.uUpView.value.copy(_dofRefs.upView.current)
    u.uMaxBlur.value = _dofRefs.maxBlur.current; u.uHeroBlur.value = _dofRefs.heroBlur.current
    u.uZone.value = _dofRefs.zone.current; u.uRamp.value = _dofRefs.ramp.current; u.uFocusOn.value = _dofRefs.focusOn.current
    u.uCamWorld.value.copy(_dofRefs.camWorld.current); u.uDiscC.value.copy(_dofRefs.discC.current); u.uDiscR.value = _dofRefs.discR.current
    u.uLogDepth.value = gl.capabilities.logarithmicDepthBuffer ? 1 : 0
    // The focus object's own blur, as the pass takes it (the ladder ran this frame: its mask is this frame's).
    const heroOn = _heroLadderRefs.on.current && !!_heroLadderRefs.mask.current, r = _dofRefs.heroRect.current
    u.uHeroOn.value = heroOn ? 1 : 0; u.uMask.value = heroOn ? _heroLadderRefs.mask.current : depth
    if (r) u.uHeroRect.value.set(r[0], r[1], r[2], r[3]); else u.uHeroRect.value.set(0, 0, 0, 0)
    u.uHeroNear.value = _dofRefs.heroNear.current; u.uHeroGround.value = _dofRefs.heroGround.current
    const was = gl.autoClear; gl.autoClear = false; gl.setRenderTarget(null)
    gl.render(draw.scene, draw.cam)
    gl.autoClear = was
  }, after + 1)
  return null
}
