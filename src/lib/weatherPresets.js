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
  windVector: { x: 0, y: 0 }, windSpeedMs: 0, windDirDeg: 0,
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
