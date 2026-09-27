// The fixed weathers an operator can stand the scene in, instead of the live feed.
// ⭐ They are written through `useSkyState.setWeatherTargets`, the SAME input the
// live poller writes, so the Almanac picks the directive and WeatherEffects drives
// wetness and snow exactly as production does. Nothing sets a weather uniform itself.
// Codes are WMO (open-meteo's). Used by the surface lab and Stage's Weather switch.
export const WEATHER_PRESETS = {
  clear:    { cloudCover: 0.05, precipitationIntensity: 0, currentWeatherCode: 0,  temperatureF: 68 },
  overcast: { cloudCover: 0.95, precipitationIntensity: 0, currentWeatherCode: 3,  temperatureF: 60 },
  rain:     { cloudCover: 0.95, precipitationIntensity: 4, currentWeatherCode: 63, temperatureF: 55 },
  snow:     { cloudCover: 0.95, precipitationIntensity: 2, currentWeatherCode: 73, temperatureF: 25 },
}
