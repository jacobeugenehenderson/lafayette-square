/**
 * LightningDriver — stochastic flash trigger + attack/decay curve writing
 * the shared `WEATHER_UNIFORMS.uLightningFlash` scalar.
 *
 * Phase 7d (Tempest, 2026-05-20). Reads `directive.lightning.rate` (Hz)
 * and `directive.lightning.kind`. Per-frame: with probability `rate*dt`,
 * begin a flash; while a flash is active, drive uLightningFlash through
 * a 50ms attack / 200ms decay curve.
 *
 * Two visible consumers of the flash uniform:
 *   1. Scene ambient (boosted via the brief's Path A — multiply existing
 *      `<ambientLight>` intensity). Implemented inside this component as
 *      a side-effect on the parent scene's first ambient light, found
 *      via useThree().scene.traverse. Coarse but effective at this
 *      duration (~250ms total).
 *   2. Atmosphere cloud shader — atmosphere-materials.js binds the same
 *      WEATHER_UNIFORMS.uLightningFlash uniform on its material so the
 *      cloud "lit-from-above" pulse fires automatically. No prop plumb.
 *   3. Opt-in materials patched via weather-uniforms.js get a uniform
 *      brightening term.
 *
 * If kind === 'cloud_to_ground', render a vertical streak during the
 * flash window (CloudToGroundStreak sub-component). Intracloud kind:
 * nothing rendered here — the cloud-shader pulse is the visual.
 */
import { useRef, useEffect, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { WEATHER_UNIFORMS } from '../../lib/weather-uniforms.js'

const ATTACK_MS = 50
const DECAY_MS = 200

function CloudToGroundStreak({ x, z, seed }) {
  // Vertical line from cloud-base (~1200m, the atmosphere SLAB_BASE_ALT)
  // down to ground y=0. Bright white emissive line. Single allocated
  // BufferGeometry; reused across all flashes of this kind.
  const geom = useMemo(() => {
    const points = []
    const segments = 12
    // Jaggy: lateral displacement at each segment.
    let cx = 0, cz = 0
    const rng = (n) => {
      // deterministic jitter from seed + segment index
      return ((Math.sin(seed * 91.7 + n * 17.3) * 9301 + 49297) % 233280) / 233280
    }
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const y = 1200 - t * 1200
      if (i > 0 && i < segments) {
        cx += (rng(i) - 0.5) * 15
        cz += (rng(i + 100) - 0.5) * 15
      }
      points.push(cx, y, cz)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3))
    return g
  }, [seed])

  useEffect(() => () => geom.dispose(), [geom])

  return (
    <line position={[x, 0, z]} renderOrder={2002}>
      <primitive attach="geometry" object={geom} />
      <lineBasicMaterial color="#e8f0ff" linewidth={2} transparent depthWrite={false} />
    </line>
  )
}

export default function LightningDriver({ rate = 0, kind = 'intracloud' }) {
  const { scene } = useThree()
  const flashStartRef = useRef(null)
  const flashSeedRef = useRef(0)
  const flashPosRef = useRef({ x: 0, z: 0 })
  const ambientRef = useRef(null)
  const ambientBaseRef = useRef(null)
  // Mount-state for cloud-to-ground streak. Only used when kind matches;
  // refs would skip re-render so we mirror flashStart into state for that
  // case. Set on flash start, cleared on end.
  const [streak, setStreak] = useState(null)

  // Find scene's primary ambient light once. Cache + base intensity.
  useEffect(() => {
    let found = null
    scene.traverse((obj) => {
      if (!found && (obj.isAmbientLight || obj.type === 'AmbientLight')) found = obj
    })
    if (found) {
      ambientRef.current = found
      ambientBaseRef.current = found.intensity
    }
    return () => {
      if (ambientRef.current && ambientBaseRef.current != null) {
        ambientRef.current.intensity = ambientBaseRef.current
      }
      WEATHER_UNIFORMS.uLightningFlash.value = 0
    }
  }, [scene])

  useFrame(({ clock }, dt) => {
    const nowSec = clock.elapsedTime
    // Maybe start a flash. Stochastic: probability per frame = rate * dt.
    if (flashStartRef.current === null && rate > 0) {
      if (Math.random() < rate * dt) {
        flashStartRef.current = nowSec
        const seed = Math.random() * 1000
        flashSeedRef.current = seed
        const a = Math.random() * Math.PI * 2
        const r = 200 + Math.random() * 600
        const pos = { x: Math.cos(a) * r, z: Math.sin(a) * r }
        flashPosRef.current = pos
        if (kind === 'cloud_to_ground') {
          setStreak({ x: pos.x, z: pos.z, seed })
        }
      }
    }

    // Apply curve.
    let v = 0
    if (flashStartRef.current !== null) {
      const tMs = (nowSec - flashStartRef.current) * 1000
      if (tMs < ATTACK_MS) {
        v = tMs / ATTACK_MS
      } else if (tMs < ATTACK_MS + DECAY_MS) {
        v = 1.0 - (tMs - ATTACK_MS) / DECAY_MS
      } else {
        flashStartRef.current = null
        if (streak) setStreak(null)
      }
    }
    WEATHER_UNIFORMS.uLightningFlash.value = v

    // Scene ambient boost.
    if (ambientRef.current && ambientBaseRef.current != null) {
      ambientRef.current.intensity = ambientBaseRef.current * (1.0 + v * 4.0)
    }
  })

  if (!streak || kind !== 'cloud_to_ground') return null
  return <CloudToGroundStreak x={streak.x} z={streak.z} seed={streak.seed} />
}
