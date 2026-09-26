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
 *    `harness/lab/main.jsx`) go through the REAL Almanac (`almanac.json`, `modulators.json`,
 *    `selectDirectiveWithStrengths`) → `deriveSkyScalars` → `weatherExposureScale`. Rain must
 *    read more overcast, stormier and darker than clear.
 * 2. The feed never reaches the drawn sky directly: `setWeatherTargets` leaves the drawn
 *    `cloudCover`/`storminess` untouched.
 * 3. Every app that draws rain mounts the driver and the light rig, the driver publishes
 *    through `deriveSkyScalars`, and both exposure writers apply the weather's scale.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
const json = (p) => JSON.parse(read(p))

const { selectDirectiveWithStrengths } = await import(path.join(ROOT, 'src/lib/almanac-eval.js'))
const { buildWeatherPayload } = await import(path.join(ROOT, 'src/lib/weather-payload.js'))
const { deriveSignals } = await import(path.join(ROOT, 'src/lib/weather-signals.js'))
const { deriveSkyScalars, weatherExposureScale } = await import(path.join(ROOT, 'src/lib/sky-scalars.js'))
const useSkyState = (await import(path.join(ROOT, 'src/hooks/useSkyState.js'))).default

let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nThe light follows the weather')

// ── 1. feed → Almanac → sky scalars → exposure ─────────────────────────────
// The lab's presets, parsed out of the lab rather than restated.
const labSrc = read('src/harness/lab/main.jsx')
const preset = (name) => {
  const m = labSrc.match(new RegExp(`^\\s*${name}:\\s*(\\{[^}]*\\})`, 'm'))
  if (!m) throw new Error(`lab WEATHER.${name} not found in src/harness/lab/main.jsx`)
  return Function(`return (${m[1]})`)()
}
const almanac = json('public/clouds/almanac.json')
const presets = json('public/clouds/presets.json')
const modulators = json('public/clouds/modulators.json').modulators || []
const noon = new Date('2026-09-26T12:00:00')

function lightFor(feed) {
  const weather = buildWeatherPayload(feed, noon)
  const signals = deriveSignals(weather, noon, { currentWeatherCode: feed.currentWeatherCode })
  const { directive } = selectDirectiveWithStrengths({ weather, almanac, presets, override: null, modulators, signals })
  const s = deriveSkyScalars(directive)
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

console.log(failed ? `\n⛔ ${failed} failure(s)\n` : '\n✅ the light follows the weather\n')
process.exit(failed ? 1 : 0)
