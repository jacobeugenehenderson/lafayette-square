/**
 * useAtmosphereDirective — composes the live atmospheric directive.
 *
 * Mounted once (in <AtmosphereDirectiveDriver />, which lives inside the
 * Canvas in Scene.jsx). Subscribes to:
 *   - useSkyState weather targets (open-meteo raw, fed by useWeather)
 *   - useTimeOfDay currentTime (scrubbable)
 *   - scene.clouds.values.preset operator override (SC.6 wiring)
 *
 * Loads almanac.json + presets.json once (module-level cache), then
 * recomputes the directive whenever any input changes and writes it to
 * useAtmosphere.rawDirective. The driver's per-frame useFrame lerps
 * rawDirective → tweenedDirective.
 *
 * Phase 5a-scope: this hook produces the BASE directive from the
 * Almanac. Phase 6 Modulators will stack on top before write — same
 * shape, no consumer churn.
 */
import { useEffect, useRef } from 'react'
import { selectDirective } from '../lib/almanac-eval.js'
import { buildWeatherPayload } from '../lib/weather-payload.js'
import useSkyState from './useSkyState.js'
import useTimeOfDay from './useTimeOfDay.js'
import useAtmosphere from './useAtmosphere.js'
import { useSceneJson } from '../lib/useSceneJson.js'

let _almanacPromise = null
let _presetsPromise = null
let _almanacCache = null
let _presetsCache = null

function ensureLoaded() {
  if (_almanacCache && _presetsCache) return Promise.resolve()
  if (!_almanacPromise) {
    _almanacPromise = fetch(`${import.meta.env.BASE_URL}clouds/almanac.json`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { _almanacCache = j })
      .catch(e => { console.warn('[useAtmosphereDirective] almanac load failed:', e) })
  }
  if (!_presetsPromise) {
    _presetsPromise = fetch(`${import.meta.env.BASE_URL}clouds/presets.json`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { _presetsCache = j })
      .catch(e => { console.warn('[useAtmosphereDirective] presets load failed:', e) })
  }
  return Promise.all([_almanacPromise, _presetsPromise])
}

/** Read-only accessors for callers (Atmosphere uniform blender). */
export function getPresetsCache() { return _presetsCache }
export function getAlmanacCache() { return _almanacCache }

export default function useAtmosphereDirective(lookId) {
  const scene = useSceneJson(lookId)
  // Subscribe to a coarse "weather slice changed" signal — we read
  // individual values inside the effect to avoid retriggering on every
  // smoothed interpolation tick. The poller calls setWeatherTargets
  // every ~5 min, which is the cadence we want for re-evaluation.
  const _targetCloudCover = useSkyState((s) => s._targetCloudCover)
  const _targetPrecip = useSkyState((s) => s._targetPrecipitation)
  const _targetWindMs = useSkyState((s) => s.windSpeedMs)
  const _targetWindDir = useSkyState((s) => s.windDirDeg)
  const _humidity = useSkyState((s) => s.humidity)
  const _pressure = useSkyState((s) => s.pressureMb)
  const _tempF = useSkyState((s) => s.temperatureF)
  const _wmo = useSkyState((s) => s.currentWeatherCode)
  // useTimeOfDay ticks every animation frame; subscribing to the raw
  // Date would re-run the evaluator effect 60×/sec. Quantize to whole
  // minutes — Almanac rules only resolve at that granularity (TOD slot
  // boundaries) so per-minute re-eval is plenty.
  const currentMinuteOfHour = useTimeOfDay((s) => {
    const t = s.currentTime
    return t.getFullYear() * 525600 + t.getMonth() * 44640 + t.getDate() * 1440 + t.getHours() * 60 + t.getMinutes()
  })
  const override = scene?.clouds?.values?.preset || null

  const _lastEvalKey = useRef(null)

  useEffect(() => {
    let cancelled = false
    ensureLoaded().then(() => {
      if (cancelled) return
      const sky = useSkyState.getState()
      const time = useTimeOfDay.getState().currentTime
      // Read targets directly so the evaluator sees the API-level
      // values, not the interpolated display values.
      const weatherTargets = {
        cloudCover: sky._targetCloudCover,
        storminess: sky._targetStorminess,
        turbidity: sky._targetTurbidity,
        precipitationIntensity: sky._targetPrecipitation,
        windVector: sky._targetWind,
        windSpeedMs: sky.windSpeedMs,
        windDirDeg: sky.windDirDeg,
        pressureMb: sky.pressureMb,
        humidity: sky.humidity,
        temperatureF: sky.temperatureF,
        currentWeatherCode: sky.currentWeatherCode,
      }
      const payload = buildWeatherPayload(weatherTargets, time)
      const directive = selectDirective({
        weather: payload,
        almanac: _almanacCache,
        presets: _presetsCache,
        override,
      })
      // De-duplicate identical directives so the tween isn't restarted
      // by an irrelevant store ping (e.g., scrubbing time within the
      // same Almanac bucket). Cheap shallow key over preset+weight set.
      const key = directiveIdentityKey(directive)
      if (key === _lastEvalKey.current) return
      _lastEvalKey.current = key
      useAtmosphere.getState().setRawDirective(directive)
    })
    return () => { cancelled = true }
  }, [
    _targetCloudCover, _targetPrecip, _targetWindMs, _targetWindDir,
    _humidity, _pressure, _tempF, _wmo,
    currentMinuteOfHour,
    override,
  ])
}

function directiveIdentityKey(d) {
  if (!d) return 'null'
  const clouds = (d.clouds || []).map(c => `${c.preset}:${(c.weight ?? 0).toFixed(3)}`).join(',')
  const sun = d.sun ? `${d.sun.tint || ''}|${d.sun.intensity ?? ''}` : ''
  const wind = d.wind ? `${d.wind.scale ?? ''}|${d.wind.dir ?? ''}` : ''
  return `${clouds}#${sun}#${wind}`
}
