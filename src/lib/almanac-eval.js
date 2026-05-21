/**
 * almanac-eval — given a live weather payload + an Almanac rule set +
 * a Teapot preset library + an optional operator override + a Modulator
 * set + a derived-signals payload, resolves to an atmospheric *directive*
 * (cloud-preset blend + sun / lightDome / wind / precip overlays).
 *
 * Phase 5a landed the Almanac base path. Phase 6 (Halo 2026-05-20)
 * extends the same `selectDirective` so it composes modulators on top
 * of the base directive — each modulator independently evaluates a
 * strength 0..1 from the signals payload and applies a bundle of
 * deltas. Schema authority:
 *   - meteorologist/pipeline/schema/almanac.schema.json
 *   - meteorologist/pipeline/schema/modulator.schema.json
 * Don't invent fields here that the authored Almanac / Modulators
 * don't declare.
 *
 * Composition rules (commutative-by-design where the math allows):
 *   - Scalar `{scale:[a,b]}` deltas multiply on the same field across
 *     modulators (commutes naturally).
 *   - `{tintToward, amount:[a,b]}` deltas sum-and-clamp on `amount`
 *     before being applied as a single lerp toward `tintToward` (the
 *     summed amount is the lerp factor; multiple modulators tinting
 *     toward different colors apply sequentially, so colors don't
 *     strictly commute — but for the v1 modulator set, at most one
 *     tintToward modulator targets each field at high strength).
 *   - `{from,to}` color hex deltas OVERRIDE the base value at strength=1
 *     (last-wins under simultaneous activation; documented in commit
 *     body — the v1 starter set is designed so two color-override
 *     modulators don't fire at once).
 *   - Direct scalar `[lo,hi]` deltas sum-and-clamp per field.
 */

const NUMERIC_RANGE_KEYS = [
  'tempC', 'cloudCover', 'pressureMb', 'humidity',
  'windKph', 'windDirDeg', 'precipMmHr', 'stormDistanceKm',
  'sunElevationDeg', 'sunAzimuthDeg',
]
const STRING_MEMBERSHIP_KEYS = ['tod', 'season', 'precipKind']

export function selectDirective({ weather, almanac, presets, override, modulators, signals } = {}) {
  const base = selectBaseDirective({ weather, almanac, presets, override })
  if (!modulators?.length || !signals || !base) return base
  return applyModulators(base, modulators, signals).directive
}

/**
 * Phase 5a's path, factored out so Phase 6 can compose on top. Pure;
 * returns a directive or null.
 */
function selectBaseDirective({ weather, almanac, presets, override } = {}) {
  if (override && override !== 'auto' && typeof override === 'string') {
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
 * Selector variant exposed to the UI: also returns the per-modulator
 * strengths computed during composition. Used by useAtmosphereDirective
 * to publish activeStrengths on useAtmosphere so the editor's live
 * strength indicator can read what's firing right now.
 */
export function selectDirectiveWithStrengths(args) {
  const base = selectBaseDirective(args)
  if (!args?.modulators?.length || !args?.signals || !base) {
    return { directive: base, strengths: {} }
  }
  return applyModulators(base, args.modulators, args.signals)
}

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

// ── Modulator composition ───────────────────────────────────────────────

/**
 * Apply all enabled modulators to a base directive. Returns
 * { directive, strengths } where strengths is a map of modulator id →
 * 0..1 strength as evaluated against `signals`.
 */
function applyModulators(baseDirective, modulators, signals) {
  // Deep-clone the base so the caller's directive (often a frozen entry
  // out of almanac.json) isn't mutated. Cheap: directives are small.
  let directive = JSON.parse(JSON.stringify(baseDirective))
  const strengths = {}

  // Accumulators for commutative composition: per-path { scaleProduct,
  // tintAmount, directSum } so we can fold N modulators into one final
  // write per field.
  const acc = new Map()
  const getAcc = (path) => {
    let a = acc.get(path)
    if (!a) { a = { scaleProduct: 1, tintColor: null, tintAmount: 0, directSum: 0, directCount: 0, colorOverride: null }; acc.set(path, a) }
    return a
  }

  for (const m of modulators) {
    if (m.enabled === false) continue
    const strength = evaluateDriver(m.driver, signals)
    strengths[m.id] = strength
    if (!Number.isFinite(strength) || strength <= 0) continue

    for (const [path, delta] of Object.entries(m.deltas || {})) {
      const a = getAcc(path)
      if (Array.isArray(delta)) {
        // Direct scalar range [lo, hi]
        a.directSum += mix(delta[0], delta[1], strength)
        a.directCount += 1
      } else if (delta && typeof delta === 'object') {
        if ('from' in delta && 'to' in delta) {
          // Color hex override — last wins; we keep the most recent.
          a.colorOverride = lerpHex(delta.from, delta.to, strength)
        } else if ('scale' in delta) {
          a.scaleProduct *= mix(delta.scale[0], delta.scale[1], strength)
        } else if ('tintToward' in delta && 'amount' in delta) {
          a.tintAmount += mix(delta.amount[0], delta.amount[1], strength)
          // For simplicity: when multiple modulators tint toward
          // different colors, the latest tintToward wins on color, the
          // amounts sum-and-clamp. v1 set is designed to avoid this.
          a.tintColor = delta.tintToward
        }
      }
    }
  }

  // Fold accumulators back onto the directive.
  for (const [path, a] of acc) {
    const cur = getPath(directive, path)
    let next = cur

    // Color overrides take precedence over tint-toward + scale (they
    // address different field kinds in practice, but lock the order
    // anyway).
    if (a.colorOverride != null) {
      next = a.colorOverride
    } else if (a.tintAmount > 0 && a.tintColor) {
      const baseColor = typeof cur === 'string' && cur[0] === '#' ? cur : '#888888'
      next = lerpHex(baseColor, a.tintColor, Math.min(1, a.tintAmount))
    }

    if (typeof cur === 'number' || typeof next === 'number' || a.directCount > 0 || a.scaleProduct !== 1) {
      let n = typeof cur === 'number' ? cur : 0
      if (a.directCount > 0) n = a.directSum / a.directCount  // average direct ranges that landed
      n = n * a.scaleProduct
      // Clamp to the directive schema's bounds where known (best-effort
      // — full schema-aware clamping lives in the validator).
      n = clampForPath(path, n)
      next = n
    }

    if (next !== undefined && next !== null) setPath(directive, path, next)
  }

  return { directive, strengths }
}

/**
 * Drivers → 0..1 strength. Supported shapes are locked in
 * modulator.schema.json. Any signal that's null/undefined evaluates to 0.
 */
export function evaluateDriver(driver, signals) {
  if (!driver) return 0
  if (driver.all) {
    let product = 1
    for (const sub of driver.all) {
      product *= evaluateDriver(sub, signals)
      if (product <= 0) return 0
    }
    return product
  }
  const v = signals?.[driver.signal]
  if (v == null) return 0
  if (driver.in) return driver.in.includes(v) ? 1 : 0
  if (driver.between) {
    const [lo, hi] = driver.between
    return v >= lo && v <= hi ? 1 : 0
  }
  if (driver.min != null) return v >= driver.min ? 1 : 0
  if (driver.range && driver.curve) {
    return curveStrength(v, driver.range[0], driver.range[1], driver.curve)
  }
  return 0
}

function curveStrength(v, lo, hi, curve) {
  // Normalize to [0,1] across the lo→hi axis; inverted ranges (lo>hi)
  // are supported — useful when a phenomenon fires as a signal DROPS
  // (e.g., direct_ratio falling from 0.7 toward 0.35 = smoke).
  const t = clamp01((v - lo) / (hi - lo || 1e-9))
  switch (curve) {
    case 'linear':     return t
    case 'threshold':  return t >= 0.5 ? 1 : 0
    case 'bell':       return 1 - Math.abs(2 * t - 1)
    case 'smoothstep':
    default:           return t * t * (3 - 2 * t)
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x }
function mix(a, b, t) { return a + (b - a) * t }

function lerpHex(a, b, t) {
  const ai = parseHex(a), bi = parseHex(b)
  if (!ai || !bi) return a
  const r = Math.round(mix(ai[0], bi[0], t))
  const g = Math.round(mix(ai[1], bi[1], t))
  const bl = Math.round(mix(ai[2], bi[2], t))
  return '#' + [r, g, bl].map(n => n.toString(16).padStart(2, '0')).join('')
}
function parseHex(s) {
  if (typeof s !== 'string' || s[0] !== '#' || s.length !== 7) return null
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]
}

function getPath(obj, path) {
  if (!obj) return undefined
  const parts = path.split('.')
  let cur = obj
  for (const k of parts) { if (cur == null) return undefined; cur = cur[k] }
  return cur
}
function setPath(obj, path, value) {
  const parts = path.split('.')
  const last = parts.pop()
  let cur = obj
  for (const k of parts) {
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}
    cur = cur[k]
  }
  cur[last] = value
}

// Best-effort clamping against directive.schema.json's known bounds.
const NUMERIC_BOUNDS = {
  'sun.intensity':           [0, 4],
  'sun.azimuth':             [0, 360],
  'sun.elevation':           [-90, 90],
  'lightDome.ambientFloor':  [0, 1],
  'wind.scale':              [0, 5],
  'wind.dir':                [0, 360],
  'precip.intensity':        [0, 1],
}
function clampForPath(path, n) {
  const b = NUMERIC_BOUNDS[path]
  if (!b) return n
  return Math.min(b[1], Math.max(b[0], n))
}
