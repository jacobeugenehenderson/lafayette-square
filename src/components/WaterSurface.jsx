import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import { makeWaterMaterial, WATER_LOOK_DEFAULTS, slopeScaleForWind, maxRoughnessForWind,
         coxMunkSlopeVariance, WIND_FLOOR_MPS } from './waterMaterial'
import { TERRAIN_DECL, assignTerrainUniforms, terrainBed, terrainWater, terrainTide } from '../utils/terrainShader'
import { tidePhase } from '../../cartograph/waterLevel.mjs'

let _saidNoBed = false
let _saidNoTide = false
/** The tide's phase at the SCENE's time (Stage's scrubbed clock or the live one). A tidal town with no clock says so
 *  once and stands at HIGH. Shared with the stone's wetted band (SlabRevetment). */
export function phaseNow() {
  try { return tidePhase(useTimeOfDay.getState().currentTime, terrainWater(), terrainTide()) } catch (e) {
    if (!_saidNoTide) { _saidNoTide = true; console.error(`[WaterSurface] ⛔ ${e.message} — the water stands at HIGH`) }
    return 1
  }
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
// `extentDiag` — the body's own extent when the geometry carries more than the body (the horizon sectors BakedGround
// appends), so the waves keep the town's scale. `horizon` — { center, inner, outer, hazeIn, rimIn, rimOut }: the haze fade past
// the rim, and the rim's own fade (past it the bed reads as deep).
function WaterSurface({ geometry, renderOrder = 0, extentDiag: extentOverride = null, horizon = null, look = null }) {
  const { material, uniforms } = useMemo(() => {
    geometry.computeBoundingBox()
    const bb = geometry.boundingBox
    const extentDiag = extentOverride ?? Math.hypot(bb.max.x - bb.min.x, bb.max.z - bb.min.z)
    // ⛔ No `disturbance`: the point ripple models something dropped in a pond.
    // On a body kilometres across it is one sine wave crossing the map.
    return makeWaterMaterial({ extentDiag, terrain: { decl: TERRAIN_DECL, assign: assignTerrainUniforms } })
  }, [geometry, extentOverride])
  useFrame((_, delta) => {
    uniforms.uTime.value += delta
    uniforms.uPhase.value = phaseNow()
    if (horizon) { uniforms.uHorizonC.value.set(horizon.center[0], horizon.center[1]); uniforms.uHorizonIn.value = horizon.inner; uniforms.uHorizonOut.value = horizon.outer; uniforms.uHazeIn.value = horizon.hazeIn ?? 0
      uniforms.uRimIn.value = horizon.rimIn; uniforms.uRimOut.value = horizon.rimOut }
    // ⭐ The town's visibility depth, read off its terrain's bed record (bake-terrain). ⛔ A town whose terrain has
    // no bed draws the water flat-shaded and SAYS so — it was baked before the bed existed.
    const bed = terrainBed()
    // Surfaces › Water › Clarity scales the town's visibility depth (never past it — see WATER_LOOK_DEFAULTS).
    const clarity = Math.min(1, Math.max(0, look?.clarity ?? WATER_LOOK_DEFAULTS.clarity))
    uniforms.uVisibleM.value = bed ? bed.visibleToM * clarity : 0
    uniforms.uFadeM.value = bed ? bed.fadeOverM * clarity : 0
    uniforms.uDeepSee.value = Math.min(1, Math.max(0, look?.deepSeeThrough ?? WATER_LOOK_DEFAULTS.deepSeeThrough))
    if (!bed && !_saidNoBed) { _saidNoBed = true; console.error('[WaterSurface] ⛔ this terrain carries no bed (terrain.json `bed`) — the water is not shaded by depth. ▶ re-bake the terrain') }
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
    uniforms.uGalPole.value.copy(b.galPole)       // the Milky Way reflects: the same band the dome draws
    uniforms.uGalCtr.value.copy(b.galCtr)
    uniforms.uMwGate.value = b.mwGate
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
