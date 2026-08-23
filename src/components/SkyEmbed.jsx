import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { INSTANCE } from '../instance.js'
import { IS_MOBILE } from '../lib/isMobile.js'
import CelestialBodies from './CelestialBodies'
import CloudDome from './CloudDome'
import WeatherEffects from './WeatherEffects'
import WeatherPoller from './WeatherPoller'
import AtmosphereDirectiveDriver from './AtmosphereDirectiveDriver'
import { TimeTicker, SkyStateTicker } from './Scene'

/**
 * SKY EMBED — the neighbourhood's actual sky, and nothing else.
 *
 * ⭐ WHY THIS EXISTS. An embedding page wanted a strip of sky, and the first
 * attempt drew one: a CSS gradient, a disc for the sun, a hand-built moon with
 * hand-drawn maria. It was a worse copy of something already solved. The real
 * sky is HERE — the authored gradient across the day, the true sun and moon
 * (the moon a photographed surface with its terminator derived from the sun's
 * direction), the catalogue stars in their real spectral colours, the
 * constellations, the Milky Way, the clouds, and the live weather falling.
 *
 * So this mounts exactly that and drops everything else: no ground, no
 * buildings, no trees, no lamps, no post-processing, no controls. It is the
 * cheapest possible WebGL context — a dome and some points — which is what
 * makes it affordable beside the full map on the same page.
 *
 * ⛔ It is NOT a second copy of Scene. Every piece below is the same component
 * production mounts, driven by the same stores; the clock arrives by
 * `ward-time` like everywhere else, so dragging a slider on the embedding page
 * moves this sky and the map above it together.
 */
export default function SkyEmbed() {
  /* ⚠ R3F MEASURES ITS CONTAINER ONCE, ON MOUNT, and then waits for a resize.
     A frame loads at its final size, so no resize ever comes — and if that
     first measurement lands before layout, the canvas stays at the default
     300×150 forever while every ancestor around it is correctly sized. That is
     exactly what happened here, and it looks like a broken embed rather than a
     timing problem.

     One resize on the next frame is all it needs. ⛔ Do not "fix" this by
     putting width/height in the Canvas `style` prop — that lands on the canvas
     element itself and clobbers the sizing R3F is trying to apply, which is
     the wrong turn I took first. */
  useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <Canvas
      frameloop="always"
      camera={{ position: [0, 2, 0], fov: 62, near: 1, far: 60000 }}
      gl={{
        alpha: false,
        antialias: !IS_MOBILE,
        logarithmicDepthBuffer: !IS_MOBILE,
        powerPreference: 'low-power',   // a sky is not a map; do not spin the fans
        toneMapping: THREE.ACESFilmicToneMapping,
      }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor(0x000000, 1)
        // Level with the horizon, so the strip reads as a view out rather than
        // a view up — the sun and moon then rise and set THROUGH it.
        camera.lookAt(0, 2, -1000)
      }}
      dpr={IS_MOBILE ? 1 : [1, 1.5]}
      shadows={false}
    >
      <TimeTicker />
      <SkyStateTicker />
      <WeatherPoller />
      <AtmosphereDirectiveDriver lookId={INSTANCE.lookId} />
      <CelestialBodies />
      <CloudDome />
      <WeatherEffects />
    </Canvas>
  )
}
