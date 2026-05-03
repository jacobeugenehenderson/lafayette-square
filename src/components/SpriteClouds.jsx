import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Clouds, Cloud } from '@react-three/drei'
import * as THREE from 'three'
import useCamera from '../hooks/useCamera'
import useSkyState from '../hooks/useSkyState'

// Wind offset accumulator (persists across frames + remounts)
const _windOffset = new THREE.Vector3(0, 0, 0)

// Cloud field layout — sprites distribute as a horizontal band of cumulus
// puffs above the neighborhood. Numbers chosen to keep ~120 sprites total
// (PUFF_COUNT × segments) which is well inside drei's default 200 limit.
// Scene units are tens-to-hundreds (Hero camera at y=55 looking toward
// target [400, 45, -100] with a narrow 22° FOV). Sprites live in a sky
// band centered forward of camera so they actually land in frame.
// CloudDome's huge SKY_RADIUS doesn't apply — that's a dome at infinity,
// these are real positioned objects in the scene.
const PUFF_COUNT = 11
const SEGMENTS_BASE = 5
const SEGMENTS_HEAVY = 8
const ALT_MIN = 160
const ALT_MAX = 460
const FIELD_RADIUS = 1600
// Recenter the puff field roughly above Hero's look target so the cone
// of view actually clips through the cloud layer.
const FIELD_CENTER_X = 200
const FIELD_CENTER_Z = -50

// Pre-allocated working colors
const _baseLit = new THREE.Color('#ffffff')
const _sunset = new THREE.Color('#ff8a55')
const _storm = new THREE.Color('#3c4150')
const _night = new THREE.Color('#0a0d18')

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function SpriteClouds() {
  const groupRef = useRef()
  const viewMode = useCamera((s) => s.viewMode)

  // Slow-changing sky values: subscribe so React re-renders the <Cloud>
  // tree (drei's applyProps then re-pushes color/opacity into the
  // instanced shader). All per-frame work is just wind drift.
  const cloudCover = useSkyState((s) => s.cloudCover)
  const storminess = useSkyState((s) => s.storminess)
  const sunsetPotential = useSkyState((s) => s.sunsetPotential)
  const beautyBias = useSkyState((s) => s.beautyBias)
  const sunElevation = useSkyState((s) => s.sunElevation)

  // Stable seeded layout — varied positions, sizes, seeds per puff.
  const puffs = useMemo(() => {
    let s = 1337
    const rand = () => {
      s = (s * 9301 + 49297) % 233280
      return s / 233280
    }
    return Array.from({ length: PUFF_COUNT }, (_, i) => {
      const angle = rand() * Math.PI * 2
      // sqrt for area-uniform distribution; bias slightly outward so
      // the puffs aren't all clustered overhead.
      const r = Math.sqrt(0.15 + rand() * 0.85) * FIELD_RADIUS
      const x = FIELD_CENTER_X + Math.cos(angle) * r
      const z = FIELD_CENTER_Z + Math.sin(angle) * r
      const y = ALT_MIN + rand() * (ALT_MAX - ALT_MIN)
      const sx = 200 + rand() * 220
      const sy = 38 + rand() * 32
      const sz = 200 + rand() * 220
      return {
        position: [x, y, z],
        bounds: [sx, sy, sz],
        seed: i * 7 + 11,
        // horizon-fade: puffs whose y/r ratio is small thin out a bit.
        horizonFade: smoothstep(0.08, 0.25, y / r),
      }
    })
  }, [])

  // ── Color & opacity from current sky state ────────────────────────
  const isDay = smoothstep(-0.1, 0.1, sunElevation)
  const sunsetMix = sunsetPotential * beautyBias

  const color = useMemo(() => {
    const c = _baseLit.clone()
    c.lerp(_sunset, sunsetMix * 0.55)
    c.lerp(_storm, storminess * 0.5)
    c.lerp(_night, 1 - isDay)
    return c
  }, [sunsetMix, storminess, isDay])

  // Cover-driven opacity, dimmed at night, boosted slightly by storm.
  const baseOpacity = THREE.MathUtils.clamp(
    0.25 + cloudCover * 0.65 + storminess * 0.1,
    0.05,
    0.95
  )
  const opacityScale = 0.35 + isDay * 0.65

  // Segments scale with cover so a clear day stays cheap.
  const segments =
    cloudCover < 0.2 ? Math.max(3, SEGMENTS_BASE - 2)
    : cloudCover > 0.7 ? SEGMENTS_HEAVY
    : SEGMENTS_BASE

  // Wind-driven drift on the parent group. _windOffset is module-level
  // so it survives remounts (e.g. viewMode toggles).
  useFrame((_, delta) => {
    const sky = useSkyState.getState()
    const dt = Math.min(delta, 0.1)
    if (!sky.isBackgroundTab) {
      _windOffset.x += sky.windVector.x * dt * 1.8
      _windOffset.z += sky.windVector.y * dt * 1.8
      // Slow baseline drift even on a still day.
      _windOffset.x += dt * 0.45
      _windOffset.z += dt * 0.22
    }
    if (groupRef.current) {
      groupRef.current.position.x = _windOffset.x
      groupRef.current.position.z = _windOffset.z
    }
  })

  // Mount in Hero + Street (planetarium) only — Browse is the locked
  // top-down authoring view; sky-radius sprites are meaningless there.
  if (viewMode !== 'hero' && viewMode !== 'planetarium') return null

  return (
    <group ref={groupRef}>
      <Clouds limit={PUFF_COUNT * SEGMENTS_HEAVY + 32} frustumCulled={false}>
        {puffs.map((p) => (
          <Cloud
            key={p.seed}
            position={p.position}
            bounds={p.bounds}
            seed={p.seed}
            segments={segments}
            volume={5.5}
            smallestVolume={0.4}
            growth={3}
            speed={0.18}
            concentrate="inside"
            color={color}
            opacity={baseOpacity * opacityScale * (0.55 + p.horizonFade * 0.45)}
            fade={3500}
          />
        ))}
      </Clouds>
    </group>
  )
}

export default SpriteClouds
