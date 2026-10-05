// The fixed weathers an operator can stand the scene in, instead of the live feed.
// ⭐ They are written through `useSkyState.setWeatherTargets`, the SAME input the
// live poller writes, so the Almanac picks the directive and WeatherEffects drives
// wetness and snow exactly as production does. Nothing sets a weather uniform itself.
// Codes are WMO (open-meteo's). Used by the surface lab and Stage's Weather switch.
//
// ⛔ A preset is a COMPLETE weather, not a patch. setWeatherTargets keeps the previous
// value of anything it isn't given, so a partial preset laid over a live rainy feed kept
// the storm's radiation, storminess, turbidity and forecast, and "Clear" stayed gloomy
// at noon (Jacob, 2026-09-26). Every input the directive reads is set here, from
// NEUTRAL (no signal) unless the weather itself implies it.
export const NEUTRAL_WEATHER = {
  storminess: 0, turbidity: 0,
  windVector: { x: 0, y: 0 }, windSpeedMs: 0, windDirDeg: 0, windGustsMs: 0,
  pressureMb: null, humidity: null,
  directRadiation: null, diffuseRadiation: null,
}
/**
 * Derive storminess (0-1) from WMO weather code + precipitation amount. ONE rule for the live
 * feed (useWeather.fetchWeather) and the presets, so a preset's rain is as stormy as real rain.
 */
export function deriveStorminess(weatherCode, precipitation) {
  let base = 0
  if (weatherCode >= 95) base = 0.8          // thunderstorm
  else if (weatherCode >= 80) base = 0.4     // showers
  else if (weatherCode >= 61) base = 0.2     // rain
  else if (weatherCode >= 51) base = 0.1     // drizzle
  else if (weatherCode >= 71) base = 0.15    // snow
  else if (weatherCode >= 45) base = 0.05    // fog

  // Boost from precipitation intensity (mm/h)
  const precipBoost = Math.min(0.2, precipitation * 0.02)
  return Math.min(1, base + precipBoost)
}

// Storminess is DERIVED from the weather code and precipitation, exactly as the live feed
// does it, never left at NEUTRAL's 0: a rain preset with storminess 0 lit the scene like
// plain overcast (Loupe's audit, 2026-09-26).
const complete = (w) => ({ ...NEUTRAL_WEATHER, ...w, storminess: deriveStorminess(w.currentWeatherCode, w.precipitationIntensity) })
export const WEATHER_PRESETS = {
  clear:    complete({ cloudCover: 0.05, precipitationIntensity: 0, currentWeatherCode: 0,  temperatureF: 68 }),
  overcast: complete({ cloudCover: 0.95, precipitationIntensity: 0, currentWeatherCode: 3,  temperatureF: 60 }),
  rain:     complete({ cloudCover: 0.95, precipitationIntensity: 4, currentWeatherCode: 63, temperatureF: 55 }),
  snow:     complete({ cloudCover: 0.95, precipitationIntensity: 2, currentWeatherCode: 73, temperatureF: 25 }),
}

// ── STILL AIR — the wind a preset stands in (Jacob, 2026-10-05: "1, x, 2, 0 provides a good amount of motion at rest").
// NEUTRAL's wind 0 is read by the wind sheet as DEAD CALM, so every preset froze the canopy to its steady sway and the
// Tree Wind's visible floor (it lifts only GUSTS) could never fire in Stage. A preset now carries a calm day's air:
// 1 m/s gusting to 2, shape from the preset's own storminess. ⛔ Its DIRECTION is not a kit constant (a westerly is
// right for the first towns and wrong for a trade-wind or southern one): it is THIS town's tendency, the speed-weighted
// mean of its own forecast's wind, passed in by the caller. No local reading → no direction → the preset stays calm,
// and the caller says so.
export const STILL_AIR = Object.freeze({ speedMps: 1, gustsMps: 2 })

/** The town's tendency: the speed-weighted mean FROM bearing of its readings (degrees), or null with none. */
export function windTendencyFromDeg(readings) {
  let x = 0, y = 0
  for (const r of readings || []) {
    const s = Number(r?.windSpeedMs), d = Number(r?.windDirDeg)
    if (!(s > 0) || !Number.isFinite(d)) continue
    x += Math.sin((d * Math.PI) / 180) * s; y += Math.cos((d * Math.PI) / 180) * s
  }
  if (Math.hypot(x, y) < 1e-6) return null
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360
}

/** A preset standing in still air from `fromDeg` (this town's tendency); `fromDeg` null → the preset as is (calm). */
export function withStillAir(preset, fromDeg) {
  if (fromDeg == null) return preset
  const r = (fromDeg * Math.PI) / 180, s = STILL_AIR.speedMps
  // windVector exactly as the live feed builds it (useWeather: sin/cos of the FROM bearing × speed).
  return { ...preset, windSpeedMs: s, windGustsMs: STILL_AIR.gustsMps, windDirDeg: fromDeg, windVector: { x: Math.sin(r) * s, y: Math.cos(r) * s } }
}
