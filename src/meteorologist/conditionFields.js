/**
 * Static metadata for the Condition editor right rail.
 *
 * WHEN_FIELDS — the rule's payload predicates (range + chip-multi-select).
 *   Absent fields are wildcards (no `when` constraint on that axis).
 *
 * DIRECTIVE_FIELDS — the rule's published atmospheric output. Phase 3 keeps
 *   every value flat (scalar / hex / enum). Phase 3b will promote selected
 *   numerics (sun.intensity, lightDome.ambientFloor, wind.scale, wind.dir,
 *   precip.intensity) to TodChannel/animatableValue once Phase 4's
 *   viewport can validate temporal authoring visually.
 *
 * `path` uses dot notation; the store's setRuleField(ruleId, path, value)
 * walks the path. `precipKind` and `precip.kind` include null as a valid
 * option meaning "no precipitation" — rendered via `nullLabel`.
 */

export const WHEN_FIELDS = [
  { key: 'tempC',           label: 'Temp (°C)',          kind: 'range', min: -30,  max: 50,    step: 1 },
  { key: 'cloudCover',      label: 'Cloud cover',        kind: 'range', min: 0,    max: 1,     step: 0.05 },
  { key: 'humidity',        label: 'Humidity',           kind: 'range', min: 0,    max: 1,     step: 0.05 },
  { key: 'windKph',         label: 'Wind (kph)',         kind: 'range', min: 0,    max: 120,   step: 1 },
  { key: 'windDirDeg',      label: 'Wind dir (°)',       kind: 'range', min: 0,    max: 360,   step: 5 },
  { key: 'precipMmHr',      label: 'Precip (mm/hr)',     kind: 'range', min: 0,    max: 50,    step: 0.5 },
  { key: 'stormDistanceKm', label: 'Storm dist (km)',    kind: 'range', min: 0,    max: 200,   step: 1 },
  { key: 'sunElevationDeg', label: 'Sun elev (°)',       kind: 'range', min: -90,  max: 90,    step: 1 },
  { key: 'sunAzimuthDeg',   label: 'Sun azimuth (°)',    kind: 'range', min: 0,    max: 360,   step: 5 },
  { key: 'tod',             label: 'TOD slots',          kind: 'chips', options: ['dawn','sunrise','noon','golden','sunset','dusk','night'] },
  { key: 'season',          label: 'Seasons',            kind: 'chips', options: ['spring','summer','autumn','winter'] },
  { key: 'precipKind',      label: 'Precip kinds',       kind: 'chips', options: ['rain','snow','sleet','hail', null], nullLabel: '(none)' },
]

export const DIRECTIVE_FIELDS = [
  { path: 'sun.intensity',          label: 'Sun intensity',     kind: 'slider', min: 0,   max: 4,   step: 0.05 },
  { path: 'sun.tint',               label: 'Sun tint',          kind: 'color' },
  { path: 'sun.azimuth',            label: 'Sun azimuth (°)',   kind: 'slider', min: 0,   max: 360, step: 1 },
  { path: 'sun.elevation',          label: 'Sun elevation (°)', kind: 'slider', min: -90, max: 90,  step: 1 },
  { path: 'lightDome.top',          label: 'Dome top',          kind: 'color' },
  { path: 'lightDome.horizon',      label: 'Dome horizon',      kind: 'color' },
  { path: 'lightDome.ambientFloor', label: 'Ambient floor',     kind: 'slider', min: 0,   max: 1,   step: 0.01 },
  { path: 'wind.scale',             label: 'Wind scale',        kind: 'slider', min: 0,   max: 5,   step: 0.05 },
  { path: 'wind.dir',               label: 'Wind dir (°)',      kind: 'slider', min: 0,   max: 360, step: 5 },
  { path: 'precip.kind',            label: 'Precip kind',       kind: 'select', options: ['rain','snow','sleet','hail', null], nullLabel: '(none)' },
  { path: 'precip.intensity',       label: 'Precip intensity',  kind: 'slider', min: 0,   max: 1,   step: 0.01 },
]

// Walk a dot-path on an object. Returns undefined if any link is missing.
// Used by WhenCard / DirectiveCard to read the current value off a rule.
export function getPath(obj, path) {
  if (!obj || !path) return undefined
  const parts = path.split('.')
  let cur = obj
  for (const k of parts) {
    if (cur == null) return undefined
    cur = cur[k]
  }
  return cur
}
