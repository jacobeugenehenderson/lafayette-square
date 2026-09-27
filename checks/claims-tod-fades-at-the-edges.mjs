#!/usr/bin/env node
// CLAIM — TIME-OF-DAY KEYS TWEEN; A KEY BORDERING A BLANK TILE CAN FADE UP OR DOWN, AND THE FADE DOES WHAT IT SAYS.
//
// Jacob, 2026-09-26: "it fades up for 30 minutes at dusk and fades down for 30 minutes at dawn" — keys tween
// across blanks as before; an edge key can instead be a fade up (pointed roof) or fade down (pointed bottom).
// ⛔ The channel-level fade boxes this replaces were shown for months and read by nothing, so this pins it.
// Sampled on a REAL Look's channel (provincetown lampGlow), with Dusk marked up and Dawn marked down:
//   ① unmarked channels resolve exactly as the plain tween (every animated channel of every Look, sampled)
//   ② fade up: 0 at the key, half at key + minutes/2, the plain tween from key + minutes on
//   ③ fade down: the key's value at the key, half at minutes/2, 0 at key + minutes and until the next key
//   ④ absent minutes = TOD_FADE_DEFAULT_MIN (the tile's number) · a mark not bordering a blank is ignored
//   ⑤ the meteorologist's store still patches a channel through the shared todEdgePatch
// ▶ Self-mutation every run: a resolver that ignores the marks must fail ②–③.
//   node checks/claims-tod-fades-at-the-edges.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolveGroupAtMinute, TOD_FADE_DEFAULT_MIN, todEdgePatch } from '../src/cartograph/animatedParam.js'

let red = 0
const bad = (m) => { red++; console.log(`   ⛔ ${m}`) }
const ok = (m) => console.log(`   ✅ ${m}`)
const near = (a, b) => Math.abs(a - b) < 1e-9
// Fixed slot minutes so the check does not depend on today's sun.
const MIN = { dawn: 390, sunrise: 415, noon: 780, golden: 1100, sunset: 1135, dusk: 1160, night: 1222 }
const KEYS = ['grass', 'trees', 'pool', 'radius']
const DEF = { grass: 0, trees: 1, pool: 1, radius: 1 }

console.log('① UNMARKED CHANNELS ARE UNCHANGED (plain tween)')
{
  let n = 0, diff = 0
  for (const look of readdirSync('public/looks')) {
    const p = `public/looks/${look}/design.json`; if (!existsSync(p)) continue
    const d = JSON.parse(readFileSync(p, 'utf-8'))
    for (const [k, ch] of Object.entries(d)) {
      if (!ch?.animated || ch.edges) continue
      const keys = [...new Set(Object.values(ch.values).flatMap(v => Object.keys(v || {})))]
      const numeric = keys.filter(x => typeof Object.values(ch.values)[0]?.[x] === 'number')
      for (let m = 0; m < 1440; m += 37) {
        const a = resolveGroupAtMinute(ch, m, MIN, numeric, {})
        const b = resolveGroupAtMinute({ ...ch, edges: {} }, m, MIN, numeric, {})
        n++; if (numeric.some(x => !near(a[x], b[x]))) diff++
      }
    }
  }
  diff ? bad(`${diff}/${n} samples differ when a channel carries no marks`) : ok(`${n} samples across every Look's animated channels — identical`)
}

const lg = JSON.parse(readFileSync('public/looks/provincetown/design.json', 'utf-8')).lampGlow
const ch = { animated: 'tod', values: { dawn: { pool: 1.5 }, dusk: { pool: 1.0 }, night: { pool: 2.65 } } }   // shape of the real one, fixed values
if (lg?.animated) ok(`the real provincetown lampGlow is animated (${Object.keys(lg.values).join(', ')}) — testing its shape`)
const marked = { ...ch, edges: { dusk: { fade: 'up', minutes: 30 }, dawn: { fade: 'down', minutes: 30 } } }
const pool = (c, m) => resolveGroupAtMinute(c, m, MIN, KEYS, DEF).pool
const run = (resolve, label) => {
  const r = []
  const tweenAt = (m) => pool(ch, m)
  r.push(['② up: off before dusk (noon)', near(resolve(marked, 780), 0)])
  r.push(['② up: 0 at the dusk key', near(resolve(marked, MIN.dusk), 0)])
  r.push(['② up: half-way at dusk + 15', near(resolve(marked, MIN.dusk + 15), tweenAt(MIN.dusk + 15) * 0.5)])
  r.push(['② up: the plain tween from dusk + 30', near(resolve(marked, MIN.dusk + 30), tweenAt(MIN.dusk + 30))])
  r.push(['② run tweens across midnight (00:30)', near(resolve(marked, 30), tweenAt(30))])
  r.push(['③ down: dawn\'s value at the dawn key', near(resolve(marked, MIN.dawn), 1.5)])
  r.push(['③ down: half at dawn + 15', near(resolve(marked, MIN.dawn + 15), 0.75)])
  r.push(['③ down: 0 at dawn + 30 and after', near(resolve(marked, MIN.dawn + 30), 0) && near(resolve(marked, 600), 0)])
  return r
}
console.log('②③ THE FADES, on the lamps\' shape (dawn · dusk · night; up at Dusk, down at Dawn)')
for (const [name, pass] of run(pool)) pass ? ok(name) : bad(name)
{ // self-mutation: a resolver that ignores the marks
  const blind = (c, m) => pool({ ...c, edges: undefined }, m)
  run(blind).some(([, pass]) => !pass) ? ok('mutation (marks ignored → plain tween) is caught') : bad('mutation NOT caught — the fade claims are blind')
}

console.log('④ DEFAULTS AND VALIDITY')
{
  const noMin = { ...ch, edges: { dawn: { fade: 'down' } } }
  near(pool(noMin, MIN.dawn + TOD_FADE_DEFAULT_MIN), 0) && pool(noMin, MIN.dawn + TOD_FADE_DEFAULT_MIN - 1) > 0
    ? ok(`absent minutes = TOD_FADE_DEFAULT_MIN (${TOD_FADE_DEFAULT_MIN})`) : bad('absent minutes do not use TOD_FADE_DEFAULT_MIN')
  const notEdge = { ...ch, edges: { night: { fade: 'down', minutes: 30 } } }   // night's next tile (dawn, across midnight) is keyed
  near(pool(notEdge, MIN.night + 60), pool(ch, MIN.night + 60)) ? ok('a mark on a key with no blank beside it is ignored') : bad('a mark with no blank beside it changed the value')
  const edited = todEdgePatch({ ...ch, transitionIn: 30, transitionOut: 30 }, 'dusk', 'up', 20)
  edited.edges?.dusk?.minutes === 20 && !('transitionIn' in edited) ? ok('todEdgePatch writes the mark and drops the dead channel-level boxes') : bad('todEdgePatch did not write the mark')
  !('edges' in todEdgePatch(edited, 'dusk', null)) ? ok('clearing the last mark removes `edges`') : bad('clearing left an empty edges')
}

console.log('⑤ THE METEOROLOGIST SHARES IT')
{
  const src = readFileSync('src/meteorologist/stores/useMeteorologistStore.js', 'utf-8')
  ;/setCloudParamTransition:[\s\S]{0,200}todEdgePatch\(ch, slotId, fade, minutes\)/.test(src) ? ok('setCloudParamTransition patches through todEdgePatch') : bad('the meteorologist writes fades its own way')
  ;/onSetTransition=\{\(slotId, fade, minutes\) =>/.test(readFileSync('src/meteorologist/Teacup.jsx', 'utf-8')) ? ok('Teacup forwards (slotId, fade, minutes)') : bad('Teacup still forwards the old (side, minutes)')
}

console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ all claims hold')
process.exit(red ? 1 : 0)
