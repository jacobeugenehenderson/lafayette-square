/**
 * useAtmosphereDirective — composes the live atmospheric directive.
 *
 * Mounted once (in <AtmosphereDirectiveDriver />, which lives inside the
 * Canvas in Scene.jsx). Subscribes to:
 *   - useSkyState weather targets (open-meteo raw, fed by useWeather)
 *   - useTimeOfDay currentTime (scrubbable)
 *   - scene.clouds.values.preset operator override (SC.6 wiring)
 *
 * Loads almanac.json + presets.json + modulators.json once
 * (module-level cache), then recomputes the directive whenever any
 * input changes and writes it to useAtmosphere.rawDirective. The
 * driver's per-frame useFrame lerps rawDirective → tweenedDirective.
 *
 * Phase 5a (Cirrus) shipped the Almanac base path. Phase 6 (Halo
 * 2026-05-20) extends it: after the Almanac picks the base directive,
 * the modulator stack composes continuous deltas on top — each
 * modulator independently evaluates a strength from derived signals
 * and applies its bundle of color/scale/tint/range deltas. Per-modulator
 * strengths are published to useAtmosphere.activeStrengths so the
 * editor's live indicator can read what's firing now.
 */
import { useEffect, useRef } from 'react'
import { selectDirectiveWithStrengths } from '../lib/almanac-eval.js'
import { buildWeatherPayload } from '../lib/weather-payload.js'
import { deriveSignals } from '../lib/weather-signals.js'
import useSkyState from './useSkyState.js'
import useTimeOfDay from './useTimeOfDay.js'
import useAtmosphere from './useAtmosphere.js'
import { useSceneJson } from '../lib/useSceneJson.js'

let _almanacPromise = null
let _presetsPromise = null
let _modulatorsPromise = null
let _almanacCache = null
let _presetsCache = null
let _modulatorsCache = null

function ensureLoaded() {
  if (_almanacCache && _presetsCache && _modulatorsCache) return Promise.resolve()
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
  if (!_modulatorsPromise) {
    _modulatorsPromise = fetch(`${import.meta.env.BASE_URL}clouds/modulators.json`)
      .then(r => r.ok ? r.json() : { modulators: [] })
      // 404 (artifact missing) is non-fatal — modulators are additive;
      // absence means the base directive is published unmodulated. This
      // matches the slab-completeness doctrine: kit deploys without a
      // modulators artifact still render correctly, just without the
      // continuous-phenomena layer.
      .then(j => { _modulatorsCache = j || { modulators: [] } })
      .catch(e => {
        console.warn('[useAtmosphereDirective] modulators load failed:', e)
        _modulatorsCache = { modulators: [] }
      })
  }
  return Promise.all([_almanacPromise, _presetsPromise, _modulatorsPromise])
}

/** Read-only accessors for callers (Atmosphere uniform blender). */
export function getPresetsCache() { return _presetsCache }
export function getAlmanacCache() { return _almanacCache }
export function getModulatorsCache() { return _modulatorsCache }

export default function useAtmosphereDirective(lookId) {
  const scene = useSceneJson(lookId)
  const _targetCloudCover = useSkyState((s) => s._targetCloudCover)
  const _targetPrecip = useSkyState((s) => s._targetPrecipitation)
  const _targetWindMs = useSkyState((s) => s.windSpeedMs)
  const _targetWindDir = useSkyState((s) => s.windDirDeg)
  const _humidity = useSkyState((s) => s.humidity)
  const _pressure = useSkyState((s) => s.pressureMb)
  const _tempF = useSkyState((s) => s.temperatureF)
  const _wmo = useSkyState((s) => s.currentWeatherCode)
  const _direct = useSkyState((s) => s.directRadiation)
  const _diffuse = useSkyState((s) => s.diffuseRadiation)
  // useTimeOfDay ticks every animation frame; subscribe at minute
  // granularity (Almanac rules + most modulator drivers resolve at that
  // grain). Hour-of-day signals naturally flip at the right tick.
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
      const signals = deriveSignals(payload, time, {
        currentWeatherCode: sky.currentWeatherCode,
        directRadiation: sky.directRadiation,
        diffuseRadiation: sky.diffuseRadiation,
        hourlyForecast: sky.hourlyForecast,
      })
      const { directive, strengths } = selectDirectiveWithStrengths({
        weather: payload,
        almanac: _almanacCache,
        presets: _presetsCache,
        override,
        modulators: _modulatorsCache?.modulators || [],
        signals,
      })
      // Strengths can change frame-to-frame even when the base rule is
      // stable; publish them every tick (cheap shallow set) so the
      // editor's live indicator stays current.
      useAtmosphere.getState().setActiveStrengths(strengths || {})

      // De-dupe identical directives so the tween isn't restarted by an
      // irrelevant ping. The dedup key now includes modulator strengths
      // (small string) so a strength change retriggers the tween.
      const key = directiveIdentityKey(directive, strengths)
      if (key === _lastEvalKey.current) return
      _lastEvalKey.current = key
      useAtmosphere.getState().setRawDirective(directive)
    })
    return () => { cancelled = true }
  }, [
    _targetCloudCover, _targetPrecip, _targetWindMs, _targetWindDir,
    _humidity, _pressure, _tempF, _wmo, _direct, _diffuse,
    currentMinuteOfHour,
    override,
  ])
}

function directiveIdentityKey(d, strengths) {
  if (!d) return 'null'
  const clouds = (d.clouds || []).map(c => `${c.preset}:${(c.weight ?? 0).toFixed(3)}`).join(',')
  const sun = d.sun ? `${d.sun.tint || ''}|${(d.sun.intensity ?? '').toString().slice(0, 6)}` : ''
  const wind = d.wind ? `${d.wind.scale ?? ''}|${d.wind.dir ?? ''}` : ''
  const dome = d.lightDome ? `${d.lightDome.top || ''}|${d.lightDome.horizon || ''}|${(d.lightDome.ambientFloor ?? '').toString().slice(0, 6)}` : ''
  const s = strengths ? Object.entries(strengths).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(',') : ''
  return `${clouds}#${sun}#${wind}#${dome}#${s}`
}
