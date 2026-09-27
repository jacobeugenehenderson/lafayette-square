// What the seven TOD slots ARE, per town and season: sun altitude at each slot, which slots vanish,
// and what each altitude-driven physics ramp already does there. Reads the live code, restates nothing.
// ▶ node scratch/tod-kit-default/slot-physics.mjs
import SunCalc from 'suncalc'
import { resolveGroupAtMinute } from '../../src/cartograph/animatedParam.js'
import { sunIntensity, nightBlendFor } from '../../src/components/celestialLights.js'
const D = 180 / Math.PI
const towns = [
  ['altadena', 34.19, -118.13], ['lafayette-square', 38.616, -90.2161], ['huron', 41.395, -82.562],
  ['provincetown', 42.05, -70.19], ['lodz (51.75)', 51.75, 19.46], ['anchorage (61.2)', 61.22, -149.9], ['tromso (69.6)', 69.65, 18.96],
]
const dates = { 'Mar 20': '2026-03-20', 'Jun 21': '2026-06-21', 'Sep 22': '2026-09-22', 'Dec 21': '2026-12-21' }
const key = { dawn: 'dawn', sunrise: 'sunrise', noon: 'solarNoon', golden: 'goldenHour', sunset: 'sunset', dusk: 'dusk', night: 'night' }
const ramps = (alt) => ({
  lampOn: Math.min(1, Math.max(0, (0.15 - alt) / 0.45)),          // StreetLights
  starFade: Math.max(0, Math.min(1, (-alt - 0.02) / 0.12)),       // useSkyState astronomyAlpha (clear)
  nightFactor: Math.max(0, Math.min(1, (0.05 - alt) / 0.20)),     // CelestialBodies
  sun: sunIntensity(alt), nightBlend: nightBlendFor(alt),
})
console.log('── sun altitude (deg) at each slot; "—" = SunCalc returns no such moment that day ──')
for (const [n, la, lo] of towns) for (const [dl, ds] of Object.entries(dates)) {
  const t = SunCalc.getTimes(new Date(ds + 'T12:00:00Z'), la, lo)
  const row = Object.entries(key).map(([s, k]) => {
    const d = t[k]; if (!d || isNaN(d)) return `${s}:—`
    return `${s}:${(SunCalc.getPosition(d, la, lo).altitude * D).toFixed(1)}`
  })
  console.log(n.padEnd(18), dl, row.join('  '))
}
console.log('\n── the physics ramps already in the code, at each slot\'s altitude (noon = Provincetown equinox 48°) ──')
const alts = { dawn: -6, sunrise: -0.833, noon: 48, golden: 6, sunset: -0.833, dusk: -6, 'nautical(-12)': -12, night: -18 }
for (const [s, a] of Object.entries(alts)) {
  const r = ramps(a / D)
  console.log(s.padEnd(14), `alt ${String(a).padStart(6)}°`, Object.entries(r).map(([k, v]) => `${k} ${v.toFixed(2)}`).join('  '))
}
// The resolver's night: a channel keyed at every slot, darkest at Night, back up at Dawn.
console.log('\n── the resolver through the night (Provincetown, Sep 22): keyed night=0.20, dawn=0.60 ──')
const la = 42.05, lo = -70.19, day = new Date('2026-09-22T12:00:00Z')
const tt = SunCalc.getTimes(day, la, lo), toMin = (d) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
const sm = Object.fromEntries(Object.entries(key).map(([s, k]) => [s, toMin(tt[k])]))
const ch = { animated: 'tod', values: { dawn: { value: 0.6 }, sunrise: { value: 1 }, noon: { value: 1 }, golden: { value: 1 }, sunset: { value: 1 }, dusk: { value: 0.6 }, night: { value: 0.2 } } }
const nightEnd = toMin(SunCalc.getTimes(new Date(day.getTime() + 864e5), la, lo).nightEnd)
const probe = [['night slot', sm.night], ['night +1h', sm.night + 60], ['midnight', 1440 - 1e-6], ['03:00', 180], ['nightEnd (−18° morning)', nightEnd], ['dawn slot', sm.dawn]]
for (const [l, m] of probe) {
  const mm = ((m % 1440) + 1440) % 1440
  const v = resolveGroupAtMinute(ch, mm, sm, ['value'], { value: 1 }).value
  console.log(l.padEnd(24), String(Math.floor(mm / 60)).padStart(2, '0') + ':' + String(Math.floor(mm % 60)).padStart(2, '0'), 'value', v.toFixed(3))
}
