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
const complete = (w) => ({ ...NEUTRAL_WEATHER, ...w })
export const WEATHER_PRESETS = {
  clear:    complete({ cloudCover: 0.05, precipitationIntensity: 0, currentWeatherCode: 0,  temperatureF: 68 }),
  overcast: complete({ cloudCover: 0.95, precipitationIntensity: 0, currentWeatherCode: 3,  temperatureF: 60 }),
  rain:     complete({ cloudCover: 0.95, precipitationIntensity: 4, currentWeatherCode: 63, temperatureF: 55 }),
  snow:     complete({ cloudCover: 0.95, precipitationIntensity: 2, currentWeatherCode: 73, temperatureF: 25 }),
}
