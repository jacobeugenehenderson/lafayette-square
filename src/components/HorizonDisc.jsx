/**
 * HorizonDisc — the ground that runs from the town's rim out to the horizon, fading on a scalloped edge.
 *
 * ⭐ EVERY TOWN (Loupe, 2026-09-26). This was `GroundDisc` inside GatewayArch.jsx, which returns nothing for a Look
 * with no Arch — so no poured town had a horizon, and Stage's Horizon sliders moved nothing there. Jacob: "I like
 * that effect, I would like to keep that." Each app that draws a town mounts this beside <SetPiece>.
 * ▶ node checks/claims-stage-controls-are-live.mjs ① (the horizon channel must reach a drawn component)
 *
 * The size comes from the town: `resolveHorizon` takes the authored keys over defaults that are multiples of the
 * town's radius (skyLightChannels.js). Centre and radius are the baked ground's stencil. ⛔ No stencil ⇒ no disc,
 * and it says so once — never an invented size.
 * `horizonOverride` is Stage's live channel; production and Preview read the baked scene.json.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useSkyState from '../hooks/useSkyState'
import { useSceneJson } from '../lib/useSceneJson.js'
import { resolveLookId } from '../lib/resolveLookId.js'
import { ASSET_BASE } from '../lib/bakedUrl.js'
import { resolveHorizon } from '../cartograph/skyLightChannels.js'

const _warned = new Set()

export default function HorizonDisc({ lookId, bakeLastMs, horizonOverride }) {
  const look = resolveLookId(lookId)
  const scene = useSceneJson(look, bakeLastMs)
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
        if (Array.isArray(s?.center) && s.radius > 0) setStencil({ center: s.center, radius: s.radius })
        else if (!_warned.has(look)) { _warned.add(look); console.error(`[HorizonDisc] ⛔ "${look}" has no baked ground stencil (centre + radius) — no horizon until it is baked`) }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [look, bakeLastMs])

  const channel = horizonOverride ?? scene?.horizon ?? null
  const h = stencil ? resolveHorizon(channel, stencil.radius) : null

  const material = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uInner: { value: 0 },
        uOuter: { value: 1 },
        uColor: { value: new THREE.Color('#3a4a3a') },
      },
      vertexShader: `
        varying vec2 vLocal;
        void main() {
          vLocal = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uInner;
        uniform float uOuter;
        uniform vec3 uColor;
        varying vec2 vLocal;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }
        void main() {
          float r = length(vLocal);
          float band = max(1.0, uOuter - uInner);
          // The scalloped edge: noise pushes the fade in and out along the rim.
          float wobble = (vnoise(vLocal * 9.0) - 0.5) * band * 0.35;
          float t = smoothstep(uInner, uOuter, r + wobble);
          float alpha = smoothstep(0.0, 1.0, 1.0 - t);
          if (alpha <= 0.001) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    })
    matRef.current = m
    return m
  }, [])
  useEffect(() => () => material.dispose(), [material])

  useFrame(() => {
    if (!h) return
    const hc = useSkyState.getState().horizonColor
    matRef.current.uniforms.uColor.value.set(hc.r * 0.35 + 0.02, hc.g * 0.35 + 0.03, hc.b * 0.30)
    // The geometry is a unit circle: express the fade radii in it.
    const r = Math.max(1, h.radius)
    matRef.current.uniforms.uInner.value = h.fadeInner / r
    matRef.current.uniforms.uOuter.value = h.fadeOuter / r
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
