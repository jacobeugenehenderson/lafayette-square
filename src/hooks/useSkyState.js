import { create } from 'zustand'
import * as THREE from 'three'
import useAtmosphere from './useAtmosphere.js'

// Pre-allocated vectors to avoid per-frame GC
const _sunDir = new THREE.Vector3()
const _moonDir = new THREE.Vector3()
const _wind = new THREE.Vector2()
// The last snapEpoch the wind honoured: a chosen weather's wind lands at once (useAtmosphere).
let _windSnapEpoch = useAtmosphere.getState().snapEpoch

const useSkyState = create((set, get) => ({
  // ── Celestial (pushed from CelestialBodies each frame) ──
  sunDirection: new THREE.Vector3(0, 0.3, 1),
  sunElevation: 0.5,
  moonDirection: new THREE.Vector3(0, 0.3, -1),
  moonPhase: 0,
  moonIllumination: 0,
  moonAltitude: 0,
  // ── The KEY light, published so a consumer OUTSIDE the light rig can use it ──
  // `sunDirection` is the sun; `keyDirection` is whatever the scene's primary
  // <directionalLight> actually is right now — the sun by day, the sun→moon blend
  // at night. They are the same vector for most of the day and materially
  // different after dusk. A consumer that wants "where is the light coming from"
  // wants THIS one. Pushed from CelestialBodies' lighting useMemo, off the very
  // `primary.lightPosition` the light is built from — never recomputed.
  keyDirection: new THREE.Vector3(0, 1, 0),
  keyColor: new THREE.Color('#fffefa'),
  nightFactor: 0,
  horizonColor: new THREE.Color('#1a1525'),  // sky color at h=0, pushed from GradientSky
  // ⭐ The operator's AUTHORED sky, as GradientSky resolved it this frame. Pushed
  // rather than re-resolved so every consumer reflects the same sky the dome is
  // drawing — the water reads these into `skyDomeColor()` and gets the town's own
  // grade for free. ⛔ Read, never recompute: re-resolving the grid elsewhere
  // drifts at TOD boundaries, which is the class that `keyDirection` records.
  skyBands: {
    horizon: new THREE.Color('#1a1525'),
    low:     new THREE.Color('#1a1525'),
    mid:     new THREE.Color('#2a3550'),
    high:    new THREE.Color('#3a5580'),
    glow:    new THREE.Color('#ffd9a0'),
    turbidity: 0,
  },

  // ── Weather the sky DRAWS — a projection of the directive, never the raw feed ──
  // Written only by `setSkyScalars(deriveSkyScalars(directive))` (`lib/sky-scalars.js`),
  // so the lights, dome and exposure follow the same state as the rain.
  cloudCover: 0,
  storminess: 0,
  turbidity: 0,
  windVector: new THREE.Vector2(0, 0),
  windSpeedMs: 0,          // raw scalar speed (m/s), surfaced so Almanac evaluator gets windKph without re-deriving from windVector
  windDirDeg: 0,           // meteorological convention — degrees the wind blows FROM
  pressureMb: null,        // open-meteo pressure_msl (mb / hPa)
  humidity: null,          // open-meteo relative_humidity_2m, normalized to 0..1
  temperatureF: null,  // real temp from Open-Meteo (°F), null until first fetch
  currentWeatherCode: null,  // WMO code from current conditions
  directRadiation:  null,    // open-meteo direct_radiation (W/m²)
  diffuseRadiation: null,    // open-meteo diffuse_radiation (W/m²)
  hourlyForecast: [],  // Array<{ time: Date, temperatureF: number, weatherCode: number, pressureMb: number|null }>
  feedPaused: false,   // true while Stage's Weather switch stands a preset: the live fetch writes nothing

  // ── Creative / derived ──
  astronomyAlpha: 1,      // star visibility factor (sun + clouds)
  beautyBias: 0.6,        // 0-1: amplifies sunset glow, cloud highlights
  sunsetPotential: 0,     // derived: how dramatic a sunset could be right now

  // ── The live FEED — the Almanac's input (useAtmosphereDirective), never drawn ──
  feedCloudCover: 0,
  feedStorminess: 0,
  feedTurbidity: 0,
  feedPrecipitation: 0,
  _targetWind: new THREE.Vector2(0, 0),

  // ── Background tab state ──
  isBackgroundTab: false,

  // ── Methods ──

  setWeatherTargets: (data) => {
    set({
      feedCloudCover: data.cloudCover ?? get().feedCloudCover,
      feedStorminess: data.storminess ?? get().feedStorminess,
      feedTurbidity: data.turbidity ?? get().feedTurbidity,
      feedPrecipitation: data.precipitationIntensity ?? get().feedPrecipitation,
      _targetWind: data.windVector ?? get()._targetWind,
      windSpeedMs: data.windSpeedMs !== undefined ? data.windSpeedMs : get().windSpeedMs,
      windDirDeg: data.windDirDeg !== undefined ? data.windDirDeg : get().windDirDeg,
      pressureMb: data.pressureMb !== undefined ? data.pressureMb : get().pressureMb,
      humidity: data.humidity !== undefined ? data.humidity : get().humidity,
      temperatureF: data.temperatureF !== undefined ? data.temperatureF : get().temperatureF,
      currentWeatherCode: data.currentWeatherCode !== undefined ? data.currentWeatherCode : get().currentWeatherCode,
      directRadiation:  data.directRadiation  !== undefined ? data.directRadiation  : get().directRadiation,
      diffuseRadiation: data.diffuseRadiation !== undefined ? data.diffuseRadiation : get().diffuseRadiation,
    })
  },

  setCelestial: (data) => {
    const state = get()
    // Mutate existing vectors to avoid object churn
    if (data.sunDirection) state.sunDirection.copy(data.sunDirection)
    if (data.moonDirection) state.moonDirection.copy(data.moonDirection)
    if (data.keyDirection) state.keyDirection.copy(data.keyDirection)
    if (data.keyColor) state.keyColor.set(data.keyColor)
    set({
      nightFactor: data.nightFactor ?? state.nightFactor,
      sunElevation: data.sunElevation ?? state.sunElevation,
      moonPhase: data.moonPhase ?? state.moonPhase,
      moonIllumination: data.moonIllumination ?? state.moonIllumination,
      moonAltitude: data.moonAltitude ?? state.moonAltitude,
    })
  },

  // The sky's weather, from the directive. Already eased by the directive's own tween,
  // so it is set, not interpolated again.
  setSkyScalars: ({ cloudCover, storminess, turbidity }) => set({ cloudCover, storminess, turbidity }),

  setHourlyForecast: (f) => set({ hourlyForecast: f }),
  setFeedPaused: (on) => set({ feedPaused: !!on }),

  setBeautyBias: (v) => set({ beautyBias: Math.max(0, Math.min(1, v)) }),
  setLiveMode: () => set({ beautyBias: 0.6 }),
  setCinematicMode: () => set({ beautyBias: 1.0 }),
  setBackgroundTab: (v) => set({ isBackgroundTab: v }),

  tick: (dt) => {
    const s = get()
    if (s.isBackgroundTab) return

    const { cloudCover, storminess, turbidity } = s
    const rate = 1 - Math.exp(-dt / 90)

    // A chosen weather (snapEpoch moved) takes its wind at once; real weather eases in.
    const epoch = useAtmosphere.getState().snapEpoch
    if (epoch !== _windSnapEpoch) { _windSnapEpoch = epoch; s.windVector.set(s._targetWind.x, s._targetWind.y) }

    // Wind interpolation
    const wx = s.windVector.x + (s._targetWind.x - s.windVector.x) * rate
    const wy = s.windVector.y + (s._targetWind.y - s.windVector.y) * rate
    s.windVector.set(wx, wy)

    // ── Derived: astronomyAlpha ──
    // sunFade: 0 when sun is up (alt>0.12), 1 when sun is well below horizon (alt<-0.02)
    const sunFade = Math.max(0, Math.min(1, (-s.sunElevation - 0.02) / 0.12))
    const astronomyAlpha = sunFade * (1 - cloudCover * 0.7)

    // ── Derived: sunsetPotential ──
    // Low sun factor: peaks when sun altitude is near 0-0.1 (twilight/golden hour)
    const lowSunFactor = Math.max(0, 1 - Math.abs(s.sunElevation - 0.05) / 0.25)
    // Partial cloud bonus: scattered clouds make better sunsets than clear or overcast
    const partialCloudBonus = 1 + Math.max(0, 0.5 - Math.abs(cloudCover - 0.35)) * 2
    // Haze bonus: some turbidity enhances warm scatter
    const hazeBonus = 1 + turbidity * 0.5
    const sunsetPotential = Math.min(1, lowSunFactor * partialCloudBonus * hazeBonus * (1 - storminess))

    // Skip set() when all values have converged (avoids per-frame re-render churn)
    const EPS = 5e-4
    if (
      Math.abs(astronomyAlpha - s.astronomyAlpha) < EPS &&
      Math.abs(sunsetPotential - s.sunsetPotential) < EPS
    ) return

    set({
      astronomyAlpha,
      sunsetPotential,
    })
  },
}))

export default useSkyState
