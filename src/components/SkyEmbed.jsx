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
  /* ⚠ SIZING — THE ANSWER, so nobody spends another day on it.
     R3F v8 gates its ENTIRE setup on react-use-measure
     (`@react-three/fiber` Canvas: `if (containerRect.width > 0 && ... )
     createRoot(canvas)`), and react-use-measure reports through a
     ResizeObserver. ⛔ A ResizeObserver cannot deliver while the frame is not
     being RENDERED — a background tab, a throttled frame. So there: no
     callback, no measurement, no root at all, and the canvas keeps the HTML
     default 300×150 with an EMPTY `style.width`. On the first real paint it
     fires and everything sizes. It self-heals; there is nothing to fix here.

     ⚠ Measured 2026-08-22, clean load: t=1000ms → 300×150, style w=""; t=5500ms
     → 1344×504 backing / 896×336 CSS, sky drawing full width. Nothing changed
     between those two readings except that the tab got painted.
     ▶ Repro: `scratch/embed-probe.html`.

     ⛔ TWO WRONG TURNS, BOTH ALREADY TAKEN — do not repeat either:
     · width/height in the Canvas `style` prop — lands on the canvas element and
       clobbers the sizing R3F applies. Made it worse.
     · a requestAnimationFrame resize nudge — was here, did nothing, and has been
       removed: rAF is throttled by the very thing that throttles the observer,
       so it cannot fire when it would be needed.
     ⚠ And the trap that protected the wrong diagnosis for a day: checking for a
     context with `canvas.getContext('webgl2')` CREATES one, so it can never
     report a context missing. Read `style.width` instead — empty means
     `gl.setSize` never ran, therefore there is no root. */

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
