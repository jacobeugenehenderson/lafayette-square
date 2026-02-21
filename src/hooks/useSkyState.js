import { create } from 'zustand'
import * as THREE from 'three'

// Pre-allocated vectors to avoid per-frame GC
const _sunDir = new THREE.Vector3()
const _moonDir = new THREE.Vector3()
const _wind = new THREE.Vector2()

const useSkyState = create((set, get) => ({
  // ── Celestial (pushed from CelestialBodies each frame) ──
  sunDirection: new THREE.Vector3(0, 0.3, 1),
  sunElevation: 0.5,
  moonDirection: new THREE.Vector3(0, 0.3, -1),
  moonPhase: 0,
  moonIllumination: 0,
  moonAltitude: 0,
  horizonColor: new THREE.Color('#1a1525'),  // sky color at h=0, pushed from GradientSky

  // ── Weather (smoothly interpolated toward targets) ──
  cloudCover: 0,
  storminess: 0,
  turbidity: 0,
  precipitationIntensity: 0,
  windVector: new THREE.Vector2(0, 0),
  temperatureF: null,  // real temp from Open-Meteo (°F), null until first fetch
  currentWeatherCode: null,  // WMO code from current conditions
  hourlyForecast: [],  // Array<{ time: Date, temperatureF: number, weatherCode: number }>

  // ── Creative / derived ──
  astronomyAlpha: 1,      // star visibility factor (sun + clouds)
  beautyBias: 0.6,        // 0-1: amplifies sunset glow, cloud highlights
  sunsetPotential: 0,     // derived: how dramatic a sunset could be right now

  // ── Internal interpolation targets ──
  _targetCloudCover: 0,
  _targetStorminess: 0,
  _targetTurbidity: 0,
  _targetPrecipitation: 0,
  _targetWind: new THREE.Vector2(0, 0),

  // ── Background tab state ──
  isBackgroundTab: false,

  // ── Methods ──

  setWeatherTargets: (data) => {
    set({
      _targetCloudCover: data.cloudCover ?? get()._targetCloudCover,
      _targetStorminess: data.storminess ?? get()._targetStorminess,
      _targetTurbidity: data.turbidity ?? get()._targetTurbidity,
      _targetPrecipitation: data.precipitationIntensity ?? get()._targetPrecipitation,
      _targetWind: data.windVector ?? get()._targetWind,
      temperatureF: data.temperatureF !== undefined ? data.temperatureF : get().temperatureF,
      currentWeatherCode: data.currentWeatherCode !== undefined ? data.currentWeatherCode : get().currentWeatherCode,
    })
  },

  setCelestial: (data) => {
    const state = get()
    // Mutate existing vectors to avoid object churn
    if (data.sunDirection) state.sunDirection.copy(data.sunDirection)
    if (data.moonDirection) state.moonDirection.copy(data.moonDirection)
    set({
      sunElevation: data.sunElevation ?? state.sunElevation,
      moonPhase: data.moonPhase ?? state.moonPhase,
      moonIllumination: data.moonIllumination ?? state.moonIllumination,
      moonAltitude: data.moonAltitude ?? state.moonAltitude,
    })
  },

  setHourlyForecast: (f) => set({ hourlyForecast: f }),

  setBeautyBias: (v) => set({ beautyBias: Math.max(0, Math.min(1, v)) }),
  setLiveMode: () => set({ beautyBias: 0.6 }),
  setCinematicMode: () => set({ beautyBias: 1.0 }),
  setBackgroundTab: (v) => set({ isBackgroundTab: v }),

  tick: (dt) => {
    const s = get()
    if (s.isBackgroundTab) return

    // ── Smooth interpolation toward weather targets ──
    // Storm rate is faster (~15s) when storminess is increasing substantially
    const storming = s._targetStorminess - s.storminess > 0.1
    const rate = 1 - Math.exp(-dt / (storming ? 15 : 90))

    const cloudCover = s.cloudCover + (s._targetCloudCover - s.cloudCover) * rate
    const storminess = s.storminess + (s._targetStorminess - s.storminess) * rate
    const turbidity = s.turbidity + (s._targetTurbidity - s.turbidity) * rate
    const precipitationIntensity = s.precipitationIntensity + (s._targetPrecipitation - s.precipitationIntensity) * rate

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

    set({
      cloudCover,
      storminess,
      turbidity,
      precipitationIntensity,
      astronomyAlpha,
      sunsetPotential,
    })
  },
}))

export default useSkyState
