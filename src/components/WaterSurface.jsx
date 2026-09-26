import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import { makeWaterMaterial, slopeScaleForWind, maxRoughnessForWind,
         coxMunkSlopeVariance, WIND_FLOOR_MPS, LAMP_REFLECT_MAX } from './waterMaterial'
import { lampGlow, lampHeads } from '../preview/lampGlowState'
import { POOL_RADIUS_M } from '../lib/lampPool'
import { terrainExag } from '../utils/terrainShader'

// The lamps whose light reaches this water: within the one lamp model's reach (`lampPool.js`) of any
// of its triangles. Computed once per lamp list; the per-frame work is only the nearest-to-camera pick.
function lampsOverWater(geometry) {
  const xz = lampHeads.xz
  if (!xz) return []
  const P = geometry.attributes.position.array, I = geometry.index.array
  const CELL = POOL_RADIUS_M * 2, grid = new Map()
  for (let t = 0; t < I.length; t += 3) {
    const xs = [P[I[t] * 3], P[I[t + 1] * 3], P[I[t + 2] * 3]], zs = [P[I[t] * 3 + 2], P[I[t + 1] * 3 + 2], P[I[t + 2] * 3 + 2]]
    for (let cx = Math.floor((Math.min(...xs) - POOL_RADIUS_M) / CELL); cx <= Math.floor((Math.max(...xs) + POOL_RADIUS_M) / CELL); cx++)
      for (let cz = Math.floor((Math.min(...zs) - POOL_RADIUS_M) / CELL); cz <= Math.floor((Math.max(...zs) + POOL_RADIUS_M) / CELL); cz++) {
        const k = cx + ',' + cz
        if (!grid.has(k)) grid.set(k, [])
        grid.get(k).push(t)
      }
  }
  const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz
    const u = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0
    return Math.hypot(ax + u * dx - x, az + u * dz - z) }
  const reaches = (x, z) => {
    for (const t of grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) {
      const [a, b, c] = [I[t], I[t + 1], I[t + 2]].map(i => [P[i * 3], P[i * 3 + 2]])
      const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
      if (d) { const w0 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / d, w1 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / d
        if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) return true }
      if (Math.min(segD(x, z, ...a, ...b), segD(x, z, ...b, ...c), segD(x, z, ...c, ...a)) <= POOL_RADIUS_M) return true
    }
    return false
  }
  const out = []
  for (let i = 0; i < xz.length / 2; i++) if (reaches(xz[i * 2], xz[i * 2 + 1])) out.push(i)
  return out
}

/**
 * WaterSurface — THE ONE WATER MESH, MOUNTED TWICE.
 *
 * ⛔⛔ WHY THIS COMPONENT EXISTS, AND IT COST AN EVENING TO FIND OUT. The kit has
 * TWO renderers for the same map: the RUNTIME (BakedGround, reading the baked
 * slab) and the DESIGNER/STAGE (MapLayers, reading map.json directly). Drawing
 * the same objects from different sources is deliberate — but they were painting
 * water with DIFFERENT MATERIALS: the runtime with the kit water shader, the
 * Designer with `makeFlatMat`, a flat colour swatch.
 * ⇒ Every change to the water shader was INVISIBLE IN THE STAGE, silently.
 * Jacob judged the lake there for four rounds while I explained measurements
 * taken from code that was not running in his window. Nothing errored; the
 * Designer simply showed a different, simpler truth.
 * ⭐ THE RULE THIS ENCODES: when the two surfaces draw the same object they mount
 * the SAME COMPONENT, not two materials that happen to agree. A shared material
 * FACTORY is not enough — the per-frame uniform driving is half the material,
 * and that is exactly the half that diverged.
 * ⚠️ General form: `docs/agents/AGENT-VALIDATION-SURFACES.md`.
 */
function WaterSurface({ geometry, renderOrder = 0 }) {
  const { material, uniforms } = useMemo(() => {
    geometry.computeBoundingBox()
    const bb = geometry.boundingBox
    const extentDiag = Math.hypot(bb.max.x - bb.min.x, bb.max.z - bb.min.z)
    // ⛔ No `disturbance`: the point ripple models something dropped in a pond.
    // On a body kilometres across it is one sine wave crossing the map.
    return makeWaterMaterial({ extentDiag })
  }, [geometry])
  const shore = useMemo(() => ({ version: -1, idx: [], d2: null }), [geometry])
  useFrame(({ camera }, delta) => {
    uniforms.uTime.value += delta
    // ⭐ LAMPS ON THE WATER — the nearest lamps whose light reaches this water, lit and coloured by the
    // same values as the ground pools and the canopy (lampGlow), so all three agree.
    if (shore.version !== lampHeads.version) {
      shore.version = lampHeads.version
      shore.idx = lampsOverWater(geometry)
      shore.d2 = new Float32Array(shore.idx.length)
    }
    uniforms.uLampLit.value = lampGlow.poolUniform.value
    uniforms.uLampColor.value.copy(lampGlow.colorUniform.value)
    if (lampGlow.poolUniform.value > 0 && shore.idx.length) {
      const xz = lampHeads.xz, cx = camera.position.x, cz = camera.position.z
      const order = shore.idx.map((li, k) => { const dx = xz[li * 2] - cx, dz = xz[li * 2 + 1] - cz; shore.d2[k] = dx * dx + dz * dz; return k })
      order.sort((p, q) => shore.d2[p] - shore.d2[q])
      const n = Math.min(LAMP_REFLECT_MAX, order.length)
      for (let j = 0; j < n; j++) { const li = shore.idx[order[j]]
        uniforms.uLamps.value[j].set(xz[li * 2], lampHeads.groundRaw[li] * terrainExag.value + lampHeads.headY, xz[li * 2 + 1]) }
      uniforms.uLampN.value = n
    } else uniforms.uLampN.value = 0
    uniforms.uSunAltitude.value = useTimeOfDay.getState().getLightingPhase().sunAltitude
    // ⭐⭐ THE LAKE READS THE TOWN'S REAL WEATHER. `windSpeedMs` / `windDirDeg`
    // are polled from open-meteo for this town's own coordinates
    // (`useWeather.js` → `useSkyState`), and Cox & Munk 1954 turns wind speed
    // into the water's slope variance — which IS the width of the glitter.
    // ⇒ a windy afternoon in Huron is a choppier, broader-sparkling lake, and a
    // calm one is closer to a mirror. Not authored, not tuned: tracked.
    const sky = useSkyState.getState()
    // ⛔ FLOORED. `windSpeedMs` is 0 until the weather poller writes it, and the
    // poller does not run in the Stage — so the authoring surface was reading
    // DEAD CALM and rendering a mirror. Every wave term downstream reads this,
    // which is why the whole surface went flat at once. See WIND_FLOOR_MPS.
    const windMps = Math.max(WIND_FLOOR_MPS, sky.windSpeedMs || 0)
    uniforms.uSlopeScale.value = slopeScaleForWind(windMps)
    uniforms.uMaxRoughness.value = maxRoughnessForWind(windMps)
    uniforms.uGustDriftMps.value = windMps
    uniforms.uSlopeRms.value = Math.sqrt(coxMunkSlopeVariance(windMps))
    // `windDirDeg` is meteorological — degrees the wind blows FROM — so the wave
    // trains travel toward the opposite bearing. Compass bearing → world XZ with
    // −Z as north, the same convention celestialToPosition uses.
    const travelRad = (sky.windDirDeg + 180) * Math.PI / 180
    uniforms.uWindDir.value.set(Math.sin(travelRad), -Math.cos(travelRad))
    // ⭐⭐ THE SKY THE DOME IS DRAWING, read not re-derived. GradientSky resolves
    // the operator's authored sky grid once per frame and publishes the four
    // bands here; the lake reflects exactly those, so a town graded warm has warm
    // water and the sky knob reaches the water with no second control.
    // ⛔ Re-resolving the grid here would drift from the dome at every TOD
    // boundary — the same class the `keyDirection` note records.
    const b = sky.skyBands
    uniforms.uBandHorizon.value.copy(b.horizon)
    uniforms.uBandLow.value.copy(b.low)
    uniforms.uBandMid.value.copy(b.mid)
    uniforms.uBandHigh.value.copy(b.high)
    uniforms.uSkyGlow.value.copy(b.glow)
    uniforms.uTurbidity.value = b.turbidity
    uniforms.uSunDir.value.copy(sky.sunDirection)
    // The BRIGHTER BODY, for the analytic glitter. keyDirection is published by
    // CelestialBodies for exactly this: a consumer that needs the VECTOR rather
    // than the light. (I argued earlier that water should not read it because it
    // sits in the light rig — true for the PBR lobe, wrong for an analytic term
    // that needs a half-vector. Reversed deliberately.)
    uniforms.uKeyDir.value.copy(sky.keyDirection)
    uniforms.uKeyColor.value.copy(sky.keyColor)
    // No glitter from a body below the horizon.
    uniforms.uKeyUp.value = Math.max(0, Math.min(1, sky.keyDirection.y * 6))
  })
    return (
    <mesh
      geometry={geometry}
      material={material}
      renderOrder={renderOrder}
      receiveShadow
    />
  )
}

export default WaterSurface
