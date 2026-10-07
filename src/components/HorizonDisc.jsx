/**
 * HorizonDisc — the ground that runs from the town's rim out to the horizon, fading on a scalloped edge.
 *
 * ⭐ RESTORED 2026-09-27 (Jacob: "restore it that way"). Removed the night before with its controls
 * (fe2215b2); without it nothing is drawn past the town's edge fade, and the page's background showed as a dark
 * band under the sky that no control could reach. It comes back with NO controls: its size is the town's own
 * (multiples of the baked stencil radius; Class D: never a fixed metre), its colour is the town's own areal COVER
 * round the rim (bake-ground stencil `horizon`), lit by the scene's lights like the ground. The scalloped far edge is the look Jacob kept. Where the rim is
 * WATER, the water body itself runs on past the rim to the horizon (BakedGround `extendWaterToHorizon`).
 * Centre and radius are the baked ground's stencil. ⛔ No stencil ⇒ no disc, said once — never an invented size.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useSkyState from '../hooks/useSkyState'
import { lookOf } from '../lib/lookOf.js'
import { slabUrl, slabFetch } from '../lib/slabUrl.js'
import { horizonFor } from '../lib/horizonReach.js'

const _warned = new Set()

// The horizon's reach, in multiples of the town's own radius — one definition, shared with the bake.
export { horizonFor }

// The horizon's colour strip: one texel per direction of the bake's `horizon` record. The colormap's pixels are read
// once; each direction averages them (in linear light) at its points; a direction with none takes its nearest covered
// neighbour's; then each is averaged with its ±LOWPASS neighbours. sRGB out, sampled by angle with wrap.
const LOWPASS = 2
const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
const toSrgb = (c) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)))
function horizonStrip(img, cm, hz) {
  const W = img.width, H = img.height, cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0)
  const px = ctx.getImageData(0, 0, W, H).data, N = hz.sectors
  const own = hz.points.map(pts => {
    if (!pts.length) return null
    let r = 0, g = 0, b = 0, n = 0
    for (let i = 0; i < pts.length; i += 2) {
      // colormap texture: flipY false, so image row 0 is v = 0
      const x = Math.min(W - 1, Math.max(0, Math.round(((pts[i] - cm.min[0]) / cm.span[0]) * W - 0.5)))
      const y = Math.min(H - 1, Math.max(0, Math.round(((pts[i + 1] - cm.min[1]) / cm.span[1]) * H - 0.5)))
      const k = (y * W + x) * 4; r += toLin(px[k]); g += toLin(px[k + 1]); b += toLin(px[k + 2]); n++
    }
    return [r / n, g / n, b / n]
  })
  if (!own.some(Boolean)) return null
  const filled = own.map((c, s) => { if (c) return c; for (let d = 1; d < N; d++) { const a = own[(s + d) % N] || own[(s - d + N) % N]; if (a) return a } return null })
  const data = new Uint8Array(N * 4)
  for (let s = 0; s < N; s++) {
    let r = 0, g = 0, b = 0
    for (let d = -LOWPASS; d <= LOWPASS; d++) { const c = filled[(s + d + N) % N]; r += c[0]; g += c[1]; b += c[2] }
    const n = 2 * LOWPASS + 1
    data[s * 4] = toSrgb(r / n); data[s * 4 + 1] = toSrgb(g / n); data[s * 4 + 2] = toSrgb(b / n); data[s * 4 + 3] = 255
  }
  const t = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter
  t.needsUpdate = true
  return t
}

export default function HorizonDisc({ lookId, bakeLastMs }) {
  const look = lookOf(lookId, 'HorizonDisc')
  const [stencil, setStencil] = useState(null)
  const matRef = useRef(null)
  const meshRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setStencil(null)
    slabFetch(look, 'ground.json', undefined, bakeLastMs ?? null)
      .then(r => r.ok ? r.json() : null)
      .then(m => {
        if (cancelled) return
        const s = m?.stencil
        if (Array.isArray(s?.center) && s.radius > 0) setStencil({ center: s.center, radius: s.radius, rimR: s.fade?.inner ?? s.radius, colormap: m?.colormap || null, horizon: s.horizon || null })
        else if (!_warned.has(look)) { _warned.add(look); console.error(`[HorizonDisc] ⛔ "${look}" has no baked ground stencil (centre + radius) — no horizon until it is baked`) }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [look, bakeLastMs])

  const h = stencil ? horizonFor(stencil.radius) : null

  // ⭐ THE WORLD CONTINUES, AS THE TOWN'S COVER (Jacob, 2026-09-27: "carried the color of the surface out to the horizon";
  // 2026-09-28: a single edge sample per direction "is not the correct solution for LS" — every road, stripe and water
  // band crossing the rim streaked out to the horizon). Each direction now carries the town's own ground colour (the
  // baked colormap) AVERAGED over points on its dominant areal cover (bake-ground stencil `horizon`, groundCover.mjs),
  // a direction with no cover takes its nearest covered neighbour's, and each is low-passed with its ±2 neighbours, so
  // a change of cover round the rim is a gradient. Computed once on load into a strip the shader reads by angle.
  // Where the rim is water, the water surface runs on over this (BakedGround). REMOVED: the one colormap sample at
  // 0.98 × the rim fade's inner edge.
  const [colorTex, setColorTex] = useState(null)
  useEffect(() => {
    const cm = stencil?.colormap, hz = stencil?.horizon
    if (!cm?.image || !hz) {
      if (stencil && !_warned.has(look + ':cm')) { _warned.add(look + ':cm'); console.error(`[HorizonDisc] ⛔ "${look}" has no ${!cm?.image ? 'baked ground colormap' : 'horizon record (ground.json stencil.horizon)'} — the horizon carries the sky's tone only. ▶ ${!cm?.image ? 'bake-ground-ao' : 'bake-ground'}`) }
      setColorTex(null)
      return
    }
    let dead = false
    new THREE.ImageLoader().load(slabUrl(look, cm.image, bakeLastMs ?? null), (img) => {
      if (dead) return
      const t = horizonStrip(img, cm, hz)
      if (dead) { t?.dispose(); return }
      if (!t && !_warned.has(look + ':hz')) { _warned.add(look + ':hz'); console.error(`[HorizonDisc] ⛔ "${look}": no direction round the rim has areal cover — the horizon carries the sky's tone only`) }
      setColorTex(t)
    })
    return () => { dead = true }
  }, [stencil, look, bakeLastMs])
  useEffect(() => () => colorTex?.dispose(), [colorTex])

  // ⭐ LIT LIKE THE GROUND (Jacob, 2026-09-27: the land past the rim was "too dark" — it took only the sky's horizon
  // colour). A standard material, so the same sun, ambient and hemisphere that light the town light the disc; its
  // colour is the ground's own just inside the rim, carried outward direction by direction, and it fades on the
  // scalloped edge. The fade and the colour lookup are the only things patched in.
  const material = useMemo(() => {
    const u = {
      uInner: { value: 0 }, uOuter: { value: 1 },
      uColor: { value: new THREE.Color('#3a4a3a') },
      uStrip: { value: null }, uHasColor: { value: 0 }, uRimLocal: { value: 0 },
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
          uniform float uInner; uniform float uOuter; uniform vec3 uColor; uniform sampler2D uStrip; uniform float uHasColor;
          uniform float uRimLocal; varying vec2 vLocal;
          float hdHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float hdVnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 w = f * f * (3.0 - 2.0 * f);
            return mix(mix(hdHash(i), hdHash(i + vec2(1.0, 0.0)), w.x), mix(hdHash(i + vec2(0.0, 1.0)), hdHash(i + vec2(1.0, 1.0)), w.x), w.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 hdCol = uColor;
          if (uHasColor > 0.5) {
            // The disc lies in its local XY, rotated onto the ground: local (x, y) → world (x, -z). The strip's texel s is
            // the direction at angle (s + ½)/N · 2π, measured as the bake does (cos → x, sin → z).
            float ang = atan(-vLocal.y, vLocal.x);
            hdCol = texture2D(uStrip, vec2(fract(ang / 6.28318530718), 0.5)).rgb;
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
    u.uHasColor.value = colorTex ? 1 : 0
    u.uStrip.value = colorTex
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
