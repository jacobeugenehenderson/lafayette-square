/**
 * HorizonDisc — the ground that runs from the town's rim out to the horizon, fading on a scalloped edge.
 *
 * ⭐ RESTORED 2026-09-27 (Jacob: "restore it that way"). Removed the night before with its controls
 * (fe2215b2); without it nothing is drawn past the town's edge fade, and the page's background showed as a dark
 * band under the sky that no control could reach. It comes back with NO controls: its size is the town's own
 * (multiples of the baked stencil radius; Class D: never a fixed metre), its colour is the ground's own at the
 * rim, lit by the scene's lights like the ground. The scalloped far edge is the look Jacob kept. Where the rim is
 * WATER, the water body itself runs on past the rim to the horizon (BakedGround `extendWaterToHorizon`).
 * Centre and radius are the baked ground's stencil. ⛔ No stencil ⇒ no disc, said once — never an invented size.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useSkyState from '../hooks/useSkyState'
import { resolveLookId } from '../lib/resolveLookId.js'
import { ASSET_BASE } from '../lib/bakedUrl.js'

const _warned = new Set()

// The horizon's reach, in multiples of the town's own radius (what 65b273dd derived from LS's authored horizon over
// its radius, so LS renders as it did): the disc out to 2.8 R, fading from 1.05 R to 3.53 R.
const DISC_R = 2.8, FADE_IN_R = 1.05, FADE_OUT_R = 3.53
export const horizonFor = (townRadius) => ({ radius: DISC_R * townRadius, fadeInner: FADE_IN_R * townRadius, fadeOuter: FADE_OUT_R * townRadius })

export default function HorizonDisc({ lookId, bakeLastMs }) {
  const look = resolveLookId(lookId)
  const [stencil, setStencil] = useState(null)
  const matRef = useRef(null)
  const meshRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setStencil(null)
    fetch(`${ASSET_BASE}baked/${look}/ground.json?t=${bakeLastMs ?? Date.now()}`)
      .then(r => r.ok ? r.json() : null)
      .then(m => {
        if (cancelled) return
        const s = m?.stencil
        if (Array.isArray(s?.center) && s.radius > 0) setStencil({ center: s.center, radius: s.radius, rimR: s.fade?.inner ?? s.radius, colormap: m?.colormap || null })
        else if (!_warned.has(look)) { _warned.add(look); console.error(`[HorizonDisc] ⛔ "${look}" has no baked ground stencil (centre + radius) — no horizon until it is baked`) }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [look, bakeLastMs])

  const h = stencil ? horizonFor(stencil.radius) : null

  // ⭐ THE WORLD CONTINUES (Jacob, 2026-09-27: "What if the horizon extender disc carried the color of the surface out
  // to the horizon since that's theoretically what the authored disc edge IS"). Each direction takes the ground's
  // own colour just inside the town's edge (the baked colormap) and carries it to the horizon.
  // Where the rim is water, the water surface runs on over this (BakedGround); beneath it the disc carries the bed.
  const [colorTex, setColorTex] = useState(null)
  useEffect(() => {
    const cm = stencil?.colormap
    if (!cm?.image) {
      if (stencil && !_warned.has(look + ':cm')) { _warned.add(look + ':cm'); console.error(`[HorizonDisc] ⛔ "${look}" has no baked ground colormap — the horizon carries the sky's tone only until ground AO is baked`) }
      setColorTex(null)
      return
    }
    let dead = false
    new THREE.TextureLoader().load(`${ASSET_BASE}baked/${look}/${cm.image}?t=${bakeLastMs ?? ''}`, (t) => {
      if (dead) { t.dispose(); return }
      t.colorSpace = THREE.SRGBColorSpace
      t.flipY = false
      t.needsUpdate = true
      setColorTex(t)
    })
    return () => { dead = true }
  }, [stencil, look, bakeLastMs])

  // ⭐ LIT LIKE THE GROUND (Jacob, 2026-09-27: the land past the rim was "too dark" — it took only the sky's horizon
  // colour). A standard material, so the same sun, ambient and hemisphere that light the town light the disc; its
  // colour is the ground's own just inside the rim, carried outward direction by direction, and it fades on the
  // scalloped edge. The fade and the colour lookup are the only things patched in.
  const material = useMemo(() => {
    const u = {
      uInner: { value: 0 }, uOuter: { value: 1 },
      uColor: { value: new THREE.Color('#3a4a3a') },
      uColorMap: { value: null }, uHasColor: { value: 0 },
      uMapMin: { value: new THREE.Vector2() }, uMapSpan: { value: new THREE.Vector2(1, 1) },
      uCenter: { value: new THREE.Vector2() }, uRimR: { value: 1 }, uRimLocal: { value: 0 },
    }
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, transparent: true, depthWrite: false })
    m.onBeforeCompile = (sh) => {
      if (sh.fragmentShader.includes('hdVnoise')) return      // idempotent: three may call this twice
      Object.assign(sh.uniforms, u)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position.xy;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uInner; uniform float uOuter; uniform vec3 uColor; uniform sampler2D uColorMap; uniform float uHasColor;
          uniform vec2 uMapMin; uniform vec2 uMapSpan; uniform vec2 uCenter; uniform float uRimR; uniform float uRimLocal; varying vec2 vLocal;
          float hdHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float hdVnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 w = f * f * (3.0 - 2.0 * f);
            return mix(mix(hdHash(i), hdHash(i + vec2(1.0, 0.0)), w.x), mix(hdHash(i + vec2(0.0, 1.0)), hdHash(i + vec2(1.0, 1.0)), w.x), w.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 hdCol = uColor;
          if (uHasColor > 0.5) {
            // The disc lies in its local XY, rotated onto the ground: local (x, y) → world (x, -z).
            vec2 dir = normalize(vec2(vLocal.x, -vLocal.y) + 1e-6);
            vec2 uv = (uCenter + dir * uRimR * 0.98 - uMapMin) / uMapSpan;   // just inside the town's edge fade
            hdCol = texture2D(uColorMap, uv).rgb;
          }
          diffuseColor.rgb = hdCol;`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          // ⛔ Nothing inside the town's rim fade: the disc lies at y = -0.05 and draws after the opaque world, so under the
          // town it painted over anything below that plane — the revetment's toe under the water showed the disc's blue
          // through the shallows (Jacob, 2026-09-27: "shows the horizon and ground discs thru the seams").
          if (length(vLocal) < uRimLocal) discard;
          { float r = length(vLocal), band = max(1.0, uOuter - uInner);
            float wobble = (hdVnoise(vLocal * 9.0) - 0.5) * band * 0.35;     // the scalloped edge
            float a = smoothstep(0.0, 1.0, 1.0 - smoothstep(uInner, uOuter, r + wobble));
            if (a <= 0.001) discard;
            gl_FragColor.a *= a; }`)
    }
    m.customProgramCacheKey = () => 'horizon-disc-lit'
    m.userData.u = u
    matRef.current = m
    return m
  }, [])
  useEffect(() => () => material.dispose(), [material])

  useFrame(() => {
    if (!h) return
    const hc = useSkyState.getState().horizonColor
    const u = matRef.current.userData.u
    u.uColor.value.set(hc.r * 0.35 + 0.02, hc.g * 0.35 + 0.03, hc.b * 0.30)   // only until the colormap loads
    const cm = stencil.colormap
    u.uHasColor.value = colorTex && cm ? 1 : 0
    if (colorTex && cm) {
      u.uColorMap.value = colorTex
      u.uMapMin.value.set(cm.min[0], cm.min[1])
      u.uMapSpan.value.set(cm.span[0], cm.span[1])
    }
    u.uCenter.value.set(stencil.center[0], stencil.center[1])
    u.uRimR.value = stencil.rimR
    // The geometry is a unit circle: express the fade radii in it.
    const r = Math.max(1, h.radius)
    u.uInner.value = h.fadeInner / r
    u.uRimLocal.value = stencil.rimR / r
    u.uOuter.value = h.fadeOuter / r
    if (meshRef.current) {
      meshRef.current.position.set(stencil.center[0], -0.05, stencil.center[1])
      meshRef.current.scale.set(r, r, 1)
    }
  })

  if (!h) return null
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} material={material} renderOrder={-100}>
      <circleGeometry args={[1, 128]} />
    </mesh>
  )
}
