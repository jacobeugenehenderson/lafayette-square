/**
 * almanac-eval — given a live weather payload + an Almanac rule set +
 * a Teapot preset library + an optional operator override, resolves to
 * an atmospheric *directive* (cloud-preset blend + optional sun /
 * lightDome / wind / precip overlays).
 *
 * Schema authority: meteorologist/pipeline/schema/almanac.schema.json.
 * Don't invent fields here that the authored Almanac doesn't declare.
 *
 * For v1 (SC.6) this module is exported and import-clean but has no
 * production consumer — CloudDome ignores presets and renders
 * procedurally. The evaluator lands now so Atmosphere v3's runtime
 * plugs in mechanically. Doctrine:
 * slab-carries-full-authored-product (operator authors Teapot once +
 * Almanac rules once; weather drives selection frame-by-frame).
 *
 * Inputs:
 *   weather  — payload matching meteorologist/pipeline/schema/weather-payload.schema.json.
 *              Numeric fields (tempC, cloudCover, pressureMb, humidity,
 *              windKph, windDirDeg, precipMmHr, stormDistanceKm,
 *              sunElevationDeg, sunAzimuthDeg) + string fields
 *              (tod, season, precipKind).
 *   almanac  — the parsed public/clouds/almanac.json artifact.
 *   presets  — the parsed public/clouds/presets.json artifact (used
 *              for validation / fallback selection).
 *   override — operator-pinned preset id from scene.clouds.values.preset;
 *              'auto' / null / undefined → consult the Almanac.
 *
 * Returns a `directive` object (clouds + sun + lightDome + wind +
 * precip subset). When a rule matches, returns that rule's directive;
 * otherwise the Almanac's top-level `fallback`. Override path returns a
 * synthetic directive `{ clouds: [{preset: override, weight: 1}] }`.
 */

const NUMERIC_RANGE_KEYS = [
  'tempC', 'cloudCover', 'pressureMb', 'humidity',
  'windKph', 'windDirDeg', 'precipMmHr', 'stormDistanceKm',
  'sunElevationDeg', 'sunAzimuthDeg',
]
const STRING_MEMBERSHIP_KEYS = ['tod', 'season', 'precipKind']

export function selectDirective({ weather, almanac, presets, override } = {}) {
  if (override && override !== 'auto' && typeof override === 'string') {
    // Trust the operator-pinned preset id; authoring-time validation in
    // meteorologist/pipeline/validate.js is responsible for catching
    // unknown ids before they reach the slab. (presets.json's shape is
    // `{version, meta, presets: [{id, ...}]}` — array of preset
    // objects, not a map; that's why we don't probe it here.)
    return { clouds: [{ preset: override, weight: 1 }] }
  }
  if (!almanac || !Array.isArray(almanac.rules) || !weather) {
    return almanac?.fallback || null
  }
  for (const rule of almanac.rules) {
    if (ruleMatches(rule, weather)) return rule.directive
  }
  return almanac.fallback || null
}

/**
 * Top-weighted preset id from the directive's clouds blend. Useful
 * shorthand when a consumer only needs the dominant preset (e.g., a
 * Stage UI badge); Atmosphere v3 itself will consume the full blend.
 */
export function selectPreset(args) {
  const d = selectDirective(args)
  if (!d?.clouds?.length) return null
  let top = d.clouds[0]
  for (const c of d.clouds) if ((c.weight || 0) > (top.weight || 0)) top = c
  return top.preset || null
}

function ruleMatches(rule, weather) {
  const when = rule?.when || {}
  for (const key of NUMERIC_RANGE_KEYS) {
    if (!when[key]) continue
    const v = weather[key]
    if (typeof v !== 'number') return false
    const [min, max] = when[key]
    if (v < min || v > max) return false
  }
  for (const key of STRING_MEMBERSHIP_KEYS) {
    if (!when[key]) continue
    const v = weather[key] === undefined ? null : weather[key]
    if (!when[key].includes(v)) return false
  }
  return true
}
