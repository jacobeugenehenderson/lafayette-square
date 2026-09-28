#!/usr/bin/env node
/**
 * claims-the-light-follows-the-weather — one weather state drives the rain AND the light.
 *
 * ⛔ THE DEFECT THIS GUARDS (Provincetown, 2026-09-26): rain drew from the Almanac's
 * directive while the lights, dome and exposure read `cloudCover`/`storminess` that the
 * poller wrote straight into `useSkyState` — two states for one sky, and a light response
 * too weak to see, so it rained in full sun. ⭐ The directive is now the single source:
 * `AtmosphereDirectiveDriver` projects the tweened directive through
 * `lib/sky-scalars.js#deriveSkyScalars`, and exposure takes `weatherExposureScale`.
 *
 * 1. End to end in node: a clear feed and a rain feed (the lab's own presets, read from
 *    `src/lib/weatherPresets.js`, used by the lab and Stage's Weather switch) go through the REAL Almanac (`almanac.json`, `modulators.json`,
 *    `selectDirectiveWithStrengths`) → `deriveSkyScalars` → `weatherExposureScale`. Rain must
 *    read more overcast, stormier and darker than clear.
 * 2. The feed never reaches the drawn sky directly: `setWeatherTargets` leaves the drawn
 *    `cloudCover`/`storminess` untouched.
 * 3. Every app that draws rain mounts the driver and the light rig, the driver publishes
 *    through `deriveSkyScalars`, and both exposure writers apply the weather's scale.
 * 4. Each falling weather reaches an Almanac rule of its own kind, and every rule is reachable.
 * 5. A chosen weather is the same every time: every weather integrator resets on `snapEpoch`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
const json = (p) => JSON.parse(read(p))

const { selectDirectiveWithStrengths } = await import(path.join(ROOT, 'src/lib/almanac-eval.js'))
const { buildWeatherPayload } = await import(path.join(ROOT, 'src/lib/weather-payload.js'))
// The payload's sun is computed at the placed town (src/lib/townPlace.js starts empty and throws). This check
// used to get INSTANCE's town implicitly, which under Node is the default (Lafayette Square); it now names it.
const { setTownPlace } = await import(path.join(ROOT, 'src/lib/townPlace.js'))
const { instanceForMap } = await import(path.join(ROOT, 'src/instances/registry.js'))
setTownPlace(instanceForMap('lafayette-square').geography, 'lafayette-square')
const { deriveSignals } = await import(path.join(ROOT, 'src/lib/weather-signals.js'))
const { deriveSkyScalars, weatherExposureScale } = await import(path.join(ROOT, 'src/lib/sky-scalars.js'))
const useSkyState = (await import(path.join(ROOT, 'src/hooks/useSkyState.js'))).default

let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nThe light follows the weather')

// ── 1. feed → Almanac → sky scalars → exposure ─────────────────────────────
// The weather presets the lab and Stage's Weather switch stand the scene in,
// imported from their one home rather than restated.
const { WEATHER_PRESETS } = await import('../src/lib/weatherPresets.js')
const preset = (name) => {
  if (!WEATHER_PRESETS[name]) throw new Error(`WEATHER_PRESETS.${name} not found in src/lib/weatherPresets.js`)
  return WEATHER_PRESETS[name]
}
const almanac = json('public/clouds/almanac.json')
const presets = json('public/clouds/presets.json')
const modulators = json('public/clouds/modulators.json').modulators || []
const noon = new Date('2026-09-26T12:00:00')

function lightFor(feed) {
  const weather = buildWeatherPayload(feed, noon)
  const signals = deriveSignals(weather, noon, { currentWeatherCode: feed.currentWeatherCode })
  const { directive } = selectDirectiveWithStrengths({ weather, almanac, presets, override: null, modulators, signals })
  const s = deriveSkyScalars(directive, presets)
  return { ...s, exposure: weatherExposureScale(s.storminess), precip: directive?.precip }
}
const clear = lightFor(preset('clear'))
const rain = lightFor(preset('rain'))
const fmt = (l) => `cover ${l.cloudCover.toFixed(2)} · storm ${l.storminess.toFixed(2)} · exposure ×${l.exposure.toFixed(2)}`
console.log(`    clear: ${fmt(clear)}\n    rain:  ${fmt(rain)} · precip ${JSON.stringify(rain.precip)}`)

if (!(rain.precip?.kind === 'rain' && rain.precip.intensity > 0)) bad('the rain feed produced no rain in the directive — the check is not testing rain')
if (!(rain.cloudCover > clear.cloudCover)) bad('rain is not more overcast than clear')
if (!(rain.storminess > clear.storminess)) bad('rain is not stormier than clear')
if (!(rain.exposure < clear.exposure)) bad('rain does not darken the scene (exposure) relative to clear')
if (!(clear.exposure > 0.95)) bad(`clear weather is being darkened (exposure ×${clear.exposure.toFixed(2)})`)
if (!failed) ok('the real Almanac turns a rain feed into an overcast, stormier, darker sky than a clear one')

// ── 2. the feed does not bypass the directive ──────────────────────────────
const before = { ...useSkyState.getState() }
useSkyState.getState().setWeatherTargets(preset('rain'))
const after = useSkyState.getState()
if (after.cloudCover !== before.cloudCover || after.storminess !== before.storminess) {
  bad('setWeatherTargets moved the DRAWN cloudCover/storminess — the feed is reaching the light around the directive')
} else if (after.feedCloudCover !== preset('rain').cloudCover) {
  bad('setWeatherTargets did not record the feed for the Almanac')
} else ok('the feed goes to the Almanac only; the drawn sky moves only through the directive')

// ── 3. wiring, read from the sources ───────────────────────────────────────
const driver = read('src/components/AtmosphereDirectiveDriver.jsx')
if (!/setSkyScalars\(deriveSkyScalars\(/.test(driver)) bad('AtmosphereDirectiveDriver no longer publishes the sky scalars from the directive')
else if (/setState\(\{\s*tweenedDirective/.test(driver.replace(/function publishTweened[\s\S]*?\n}\n/, ''))) {
  bad('AtmosphereDirectiveDriver writes tweenedDirective outside publishTweened — the rain can move without the light')
} else ok('the driver publishes the rain and the sky scalars from the same tweened directive')

for (const f of ['src/components/usePostFxDriver.js', 'src/components/PostProcessing.jsx']) {
  const src = read(f)
  const writes = [...src.matchAll(/resolveGroupAtMinute\(\s*(exposureChannel|channel),[^\n]*\n\s*\*\s*weatherExposureScale\(/g)]
  if (!writes.length) bad(`${f}: authored exposure is not multiplied by weatherExposureScale`)
}
if (!failed) ok('both exposure writers apply the weather\'s neutral density')

for (const f of ['src/components/Scene.jsx', 'src/preview/PreviewApp.jsx', 'src/cartograph/CartographApp.jsx']) {
  const src = read(f)
  if (!src.includes('<WeatherEffects')) continue
  const missing = ['<AtmosphereDirectiveDriver', '<CelestialBodies', 'PostProcessing'].filter((t) => !src.includes(t))
  if (missing.length) bad(`${f} draws rain but does not mount ${missing.join(', ')}`)
  else ok(`${path.basename(f)}: rain, driver, light rig and exposure all mounted`)
}

// Nothing else writes the drawn scalars.
const writers = ['src/hooks/useSkyState.js', 'src/components/AtmosphereDirectiveDriver.jsx', 'src/meteorologist/CanaryScene.jsx']
const { execSync } = await import('node:child_process')
const hits = execSync(`grep -rlE "setState\\(\\{[^}]*\\b(cloudCover|storminess)\\s*:" src || true`, { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => !writers.includes(f))
if (hits.length) bad(`something besides the directive writes the drawn sky: ${hits.join(', ')}`)
else ok('only the directive path writes cloudCover/storminess')

// Two ways noon stayed dark in Stage under "Clear" (2026-09-26), both proven here:
// (a) the blend KEPT a previous directive's sun when the next authored none, so a stale
//     sun of 0 held darkness 1 forever; a directive with no sun must end with no sun.
// (b) coverage summed raw blend weights, so "clear_sky" (coverage 0) read as overcast.
{
  const { lerpDirective } = await import('../src/lib/directive-blend.js')
  const dark = { clouds: [{ preset: 'stratocumulus_perlucidus', weight: 1 }], sun: { intensity: 0, tint: '#ff9a3a' } }
  const clearD = { clouds: [{ preset: 'clear_sky', weight: 1 }] }
  const end = lerpDirective(dark, clearD, 1)
  if (end.sun) bad(`the blend keeps a sun the new directive does not author (intensity ${end.sun.intensity})`)
  else ok('a directive that authors no sun ends with no sun (no stale darkness)')
  const cs = deriveSkyScalars(clearD, presets)
  if (cs.cloudCover !== 0 || cs.storminess !== 0) bad(`a clear_sky directive draws cloud ${cs.cloudCover}, storm ${cs.storminess}`)
  else ok('a clear_sky directive draws no cloud and no storm')
}

// A weather preset is a COMPLETE weather. setWeatherTargets keeps the previous value of
// any input it isn't given, so a partial preset over a live rainy feed kept the storm
// ("Clear" stayed gloomy at noon, 2026-09-26). Every input setWeatherTargets reads must be
// set by every preset. The list is read from setWeatherTargets, not restated.
{
  const sky = read('src/hooks/useSkyState.js')
  const body = (sky.match(/setWeatherTargets:\s*\(data\)\s*=>\s*\{[\s\S]*?\n  \},/) || [''])[0]
  const inputs = [...new Set([...body.matchAll(/data\.(\w+)/g)].map((m) => m[1]))]
  if (!inputs.length) bad('could not read the inputs of useSkyState.setWeatherTargets')
  let partial = 0
  for (const [name, w] of Object.entries(WEATHER_PRESETS)) {
    const missing = inputs.filter((k) => !(k in w))
    if (missing.length) { partial++; bad(`weather preset '${name}' leaves ${missing.join(', ')} to the previous (live) weather`) }
  }
  if (!partial) ok(`every weather preset sets all ${inputs.length} inputs of setWeatherTargets`)
  // Storminess comes from the live feed's own rule, so precipitation makes a preset stormier.
  const { deriveStorminess } = await import('../src/lib/weatherPresets.js')
  const off = Object.entries(WEATHER_PRESETS).filter(([, w]) => w.storminess !== deriveStorminess(w.currentWeatherCode, w.precipitationIntensity))
  if (off.length) bad(`preset storminess is not the live feed's rule: ${off.map(([n, w]) => `${n}=${w.storminess}`).join(', ')}`)
  else if (!(WEATHER_PRESETS.rain.storminess > WEATHER_PRESETS.overcast.storminess)) bad('the rain preset is no stormier than overcast')
  else ok('preset storminess follows the live feed\'s rule (rain is stormier than overcast)')
}

// ── 4. every falling weather reaches its own rule ──────────────────────────
// ⛔ 2026-09-27: the Almanac is first-match-wins, and `rain_steady` (no temperature) sat
// above `snow_active`, so every snow feed, live or Stage's Snow, drew the rain sky; and
// `snow_active` covered everything `blizzard` does, so no blizzard was ever drawn.
// (a) each preset that falls resolves to a rule whose precip kind is the feed's own
//     (`buildWeatherPayload`'s precipKind, from the WMO code, read, not restated);
// (b) no rule is unreachable: none whose `when` lies wholly inside an earlier rule's.
// Both are mutation-tested against the order this commit fixed.
{
  const ruleFor = (alm, feed) => {
    const { directive } = selectDirectiveWithStrengths({ weather: buildWeatherPayload(feed, noon), almanac: alm, presets, override: null })
    return alm.rules.find((r) => r.directive === directive) || null
  }
  const wrongKinds = (alm) => Object.entries(WEATHER_PRESETS).flatMap(([name, w]) => {
    const kind = buildWeatherPayload(w, noon).precipKind
    if (!kind) return []
    const r = ruleFor(alm, w)
    return r?.directive?.precip?.kind === kind ? [] : [`'${name}' (${kind}) draws ${r ? `'${r.id}'` : 'the fallback'} (${r?.directive?.precip?.kind ?? 'no precip'})`]
  })
  const inside = (b, a) => Object.entries(a.when || {}).every(([k, av]) => {
    const bv = b.when?.[k]
    if (!bv) return false
    return typeof av[0] === 'number' ? bv[0] >= av[0] && bv[1] <= av[1] : bv.every((x) => av.includes(x))
  })
  const shadowed = (alm) => alm.rules.flatMap((b, i) => {
    const a = alm.rules.slice(0, i).find((r) => inside(b, r))
    return a ? [`'${b.id}' can never fire: '${a.id}' above it matches everything it does`] : []
  })

  const falling = Object.keys(WEATHER_PRESETS).filter((n) => buildWeatherPayload(WEATHER_PRESETS[n], noon).precipKind)
  const wk = wrongKinds(almanac), sh = shadowed(almanac)
  wk.forEach(bad); sh.forEach(bad)
  if (!falling.length) bad('no weather preset falls — (a) is testing nothing')
  else if (!wk.length) ok(`each falling preset draws its own kind of sky (${falling.join(', ')})`)
  if (!sh.length) ok(`every Almanac rule is reachable (${almanac.rules.length} rules)`)

  const move = (alm, id, beforeId) => {
    const rules = alm.rules.filter((r) => r.id !== id)
    rules.splice(rules.findIndex((r) => r.id === beforeId), 0, alm.rules.find((r) => r.id === id))
    return { ...alm, rules }
  }
  const has = (...ids) => ids.every((id) => almanac.rules.some((r) => r.id === id))
  if (!has('rain_steady', 'snow_active', 'blizzard')) bad('the mutations name rules the Almanac no longer has — re-aim them')
  else {
    if (wrongKinds(move(almanac, 'rain_steady', 'blizzard')).length) ok('mutation (rain above snow) is caught')
    else bad('mutation (rain above snow) is NOT caught — (a) is blind')
    if (shadowed(move(almanac, 'snow_active', 'blizzard')).length) ok('mutation (snow above blizzard) is caught')
    else bad('mutation (snow above blizzard) is NOT caught — (b) is blind')
  }
}

// ── 5. a chosen weather is a pure function of the choice ───────────────────
// ⛔ 2026-09-27 (Jacob, Stage): Snow's cover stayed white through Rain, and Clear came out
// three ways (after Snow, after Rain, after Live), because four holders integrate weather over
// time and kept what the last weather left: snow cover, wetness, wind, cloud drift. A chosen
// weather bumps useAtmosphere.snapEpoch; every holder must reset on it.
// (a) every src file that integrates weather over time (damp(), exp(-…dt), `+= …wind…dt`)
//     reads snapEpoch; the files are FOUND by that shape, not listed;
// (b) in node: the wind takes a chosen weather's target at once, then eases again.
{
  const { execSync: sh } = await import('node:child_process')
  const files = sh('grep -rlE "useSkyState|useAtmosphere|WEATHER_UNIFORMS" src || true', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
  const integrates = (t) => /\bdamp\(|Math\.exp\(\s*-[^)]*\bdt\b|\+=[^\n]*\b(windVector|intensity|precip)\b[^\n]*\bdt\b/.test(t)
  const holders = files.filter((f) => integrates(read(f)))
  const deaf = (srcOf) => holders.filter((f) => !/\bsnapEpoch\b/.test(srcOf(f)))
  const d = deaf(read)
  if (holders.length < 3) bad(`found only ${holders.length} weather integrators (${holders.join(', ')}) — the shape test has gone blind`)
  else if (d.length) d.forEach((f) => bad(`${f} integrates weather over time but never resets on a chosen weather (snapEpoch)`))
  else ok(`every weather integrator resets on a chosen weather (${holders.map((f) => path.basename(f)).join(', ')})`)
  const victim = holders.find((f) => f.endsWith('WeatherEffects.jsx'))
  if (!victim) bad('WeatherEffects.jsx is no longer found as an integrator — re-aim the mutation')
  else if (deaf((f) => f === victim ? read(f).replaceAll('snapEpoch', 'x') : read(f)).includes(victim)) ok('mutation (WeatherEffects deaf to snapEpoch) is caught')
  else bad('mutation (WeatherEffects deaf to snapEpoch) is NOT caught')

  const useAtmosphere = (await import(path.join(ROOT, 'src/hooks/useAtmosphere.js'))).default
  const sky = useSkyState.getState()
  sky.windVector.set(3, 4)
  sky.setWeatherTargets({ windVector: { x: 0, y: 0 } })
  useSkyState.getState().tick(0.1)
  const eased = useSkyState.getState().windVector.length()
  useAtmosphere.setState((s) => ({ snapEpoch: s.snapEpoch + 1 }))
  useSkyState.getState().tick(0.1)
  const snapped = useSkyState.getState().windVector.length()
  if (!(eased > 4.9)) bad(`without a snap the wind no longer eases (|wind| ${eased.toFixed(3)} after 0.1 s)`)
  else if (snapped !== 0) bad(`a chosen weather keeps the last weather's wind (|wind| ${snapped.toFixed(3)})`)
  else ok('the wind eases for real weather and takes a chosen weather\'s at once')
}

console.log(failed ? `\n⛔ ${failed} failure(s)\n` : '\n✅ the light follows the weather\n')
process.exit(failed ? 1 : 0)
