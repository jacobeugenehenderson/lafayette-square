#!/usr/bin/env node
/**
 * "DOES EVERY TIME-OF-DAY SLOT HAVE A TIME, EVERY DAY, EVERYWHERE, AND DO THE LIGHTS DO TODAY'S THING WHERE THE SUN DOES NOT
 * REACH ONE?" (Jacob, 2026-11-01: "Yes, build it"; "There is no reason a person should ever know about this"; Boz's
 * ruling and tie-break; Zob's corrections.)
 *
 * Through src/lib/todSlots.js and the real resolvers (src/cartograph/animatedParam.js, src/displays/showChannel.js), at
 * latitudes 0, ±48.6, ±60, ±62, ±66.5, ±70, ±80 on every day of 2026:
 *   1. every slot has a finite minute (never null), and the slots keep the day's own order from the nadir round
 *      (dawn ≤ sunrise ≤ noon ≤ golden ≤ sunset ≤ dusk ≤ night, a setting slot met at the nadir being the day's end);
 *   2. a slot moves smoothly with the date: no day-to-day jump beyond todSlots.js#SLOT_DAY_MOVE_MAX_MIN (its one home; a
 *      display schedule's judgement rests on it, showSchedule.js#refuseScheduleSense), the worst printed;
 *   3. a slot the sun does not reach sits at its closest approach: on a polar night (80°N, Dec 21) Dusk and Dawn at
 *      noon; on a white night (80°N, Jun 21) at the nadir; at 62°N, Jun 21 Sunset is real while Dusk and Dawn are
 *      at the nadir;
 *   4. the LIGHTS, through the real resolvers at every fifth minute: the kit's lamps (kitDayChannel('lantern')) and the
 *      display's default channel are OFF all white-night day and ON all polar-night day; at 62°N the lamps are on at
 *      the nadir (a real sunset) while the display (keyed at Dusk) stays dark;
 *   5. the Night key OCCURS where the sun does not reach −18° (Paris, Jun 21: Night at the nadir, between real Dusk
 *      and Dawn) — it used to drop;
 *   6. the share card never names a moment that did not happen (todSlotAt skips an unreached slot), and Stage's
 *      capture refuses a date that lacks one from the reached flags, as before.
 * Usage: node checks/claims-every-slot-has-a-time-every-day.mjs [--mutants] [--drift]
 *   --drift: each registered town's day-to-day slot move (median, p99, max): the single-day read's error across midnight.
 */
import { importSource, sourceOf } from './_importSource.mjs'

const IDS = ['dawn', 'sunrise', 'noon', 'golden', 'sunset', 'dusk', 'night', 'deep']
const SETTING = new Set(['golden', 'sunset', 'dusk', 'night'])
const LATS = [0, 48.6, -48.6, 60, -60, 62, -62, 66.5, -66.5, 70, -70, 80, -80]
const at = (lat, lon = 0, tz = 'UTC') => ({ lat, lon, tz })
const day = (iso) => new Date(`${iso}T12:00:00Z`)

async function verdict({ slots, param, share, capture } = {}) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  // The slot minutes are T's and are passed into the resolvers, so a slot mutant reaches the lights through them.
  const T = await importSource('src/lib/todSlots.js', slots ? { transform: slots } : {})
  const A = await importSource('src/cartograph/animatedParam.js', param ? { transform: param } : {})
  const S = await importSource('src/displays/showChannel.js', param ? { redirect: { 'src/cartograph/animatedParam.js': { transform: param } } } : {})
  const K = await importSource('src/cartograph/skyLightChannels.js')
  // 1–2. a minute every day, in the day's order, moving smoothly
  let worst = { j: 0 }, bad = null
  for (const lat of LATS) {
    let prev = null
    for (let d = 0; d < 365 && !bad; d++) {
      const date = new Date(Date.UTC(2026, 0, 1 + d, 12)), sm = T.todSlotMinutesAt(date, at(lat))
      const none = IDS.find(id => !Number.isFinite(sm[id]))
      if (none) { bad = `${lat}° ${date.toISOString().slice(0, 10)}: ${none} has no minute (${sm[none]})`; break }
      const off = (id) => { const o = ((sm[id] - sm.deep) % 1440 + 1440) % 1440; return SETTING.has(id) && o < 1e-9 ? 1440 : o }
      const order = IDS.slice(0, 7)
      for (let i = 1; i < order.length && !bad; i++) if (off(order[i]) < off(order[i - 1]) - 1e-6) bad = `${lat}° ${date.toISOString().slice(0, 10)}: ${order[i]} (${sm[order[i]].toFixed(1)}) falls before ${order[i - 1]} (${sm[order[i - 1]].toFixed(1)}) in the day's order`
      if (prev) for (const id of IDS) { const x = Math.abs(sm[id] - prev[id]) % 1440, j = Math.min(x, 1440 - x); if (j > worst.j) worst = { j, where: `${id} at ${lat}° on ${date.toISOString().slice(0, 10)}` } }
      prev = sm
    }
  }
  F(!bad, bad)
  F(worst.j <= T.SLOT_DAY_MOVE_MAX_MIN, `a slot jumps ${worst.j.toFixed(1)} minutes in a day (${worst.where}), more than todSlots.js#SLOT_DAY_MOVE_MAX_MIN (${T.SLOT_DAY_MOVE_MAX_MIN}), which a show window's judgement rests on`)
  if (!slots && !param && !share) console.log(`   the largest day-to-day move of any slot: ${worst.j.toFixed(1)} min (${worst.where})`)
  // 3. the closest approach
  const polar = T.todSlotMinutesAt(day('2026-12-21'), at(80)), white = T.todSlotMinutesAt(day('2026-06-21'), at(80)), part = T.todSlotMinutesAt(day('2026-06-21'), at(62))
  F(polar.dusk === polar.noon && polar.dawn === polar.noon, `on a polar night Dusk and Dawn are not at noon (${polar.dusk}, ${polar.dawn} vs ${polar.noon})`)
  F(white.dusk === white.deep && white.dawn === white.deep, `on a white night Dusk and Dawn are not at the nadir (${white.dusk}, ${white.dawn} vs ${white.deep})`)
  const pr = T.todSlotReachedAt(day('2026-06-21'), at(62))
  F(pr.sunset && !pr.dusk && part.dusk === part.deep && part.dawn === part.deep, `at 62°N on Jun 21 Sunset is not real with Dusk and Dawn at the nadir (${JSON.stringify(pr)})`)
  // 4. the lights through the real resolvers
  const lamp = K.kitDayChannel('lantern'), disp = S.defaultDisplayChannel()
  const lampAt = (m, sm) => A.resolveGroupAtMinute(lamp, m, sm, K.LANTERN_FIELD_KEYS, K.LANTERN_FLAT_DEFAULTS).intensity
  // the display's light through its schedule (showSchedule.js), on the day's row (the same row both nights: the test day's)
  const Hs = await importSource('src/displays/showSchedule.js', param ? { redirect: { 'src/cartograph/animatedParam.js': { transform: param } } } : {})
  const dispAt = (m, sm) => { const rowOf = () => sm, d = '2026-06-21', nb = Hs.nightsOn(disp, Hs.prevDate(d), rowOf, 300), nt = Hs.nightsOn(disp, d, rowOf, 300); return Hs.displayStateAt(disp, nb, nt, d, m, rowOf).glow }
  const all = (sm, f) => { for (let m = 0; m < 1440; m += 5) if (!f(m, sm)) return m; return null }
  const lw = all(white, (m, sm) => lampAt(m, sm) === 0), dw = all(white, (m, sm) => dispAt(m, sm) === 0)
  const lp = all(polar, (m, sm) => lampAt(m, sm) > 0), dp = all(polar, (m, sm) => dispAt(m, sm) > 0)
  F(lw == null, `on a white night (80°N, Jun 21) the lamps are lit at minute ${lw} (${lw != null && lampAt(lw, white)})`)
  F(dw == null, `on a white night (80°N, Jun 21) the display glows at minute ${dw}`)
  F(lp == null, `on a polar night (80°N, Dec 21) the lamps are dark at minute ${lp}`)
  F(dp == null, `on a polar night (80°N, Dec 21) the display is dark at minute ${dp}`)
  F(lampAt(part.deep, part) > 0, 'at 62°N on Jun 21 the lamps are dark at the nadir, after a real sunset')
  const d62 = all(part, (m, sm) => dispAt(m, sm) === 0)
  F(d62 == null, `at 62°N on Jun 21 (no civil dusk) the display glows at minute ${d62}`)
  // 5. the Night key occurs
  const paris = T.todSlotMinutesAt(day('2026-06-21'), at(48.86, 2.35, 'Europe/Paris')), preach = T.todSlotReachedAt(day('2026-06-21'), at(48.86, 2.35, 'Europe/Paris'))
  const night = { animated: 'tod', values: { dusk: { glow: 0 }, night: { glow: 1 }, dawn: { glow: 0 } } }
  F(!preach.night && preach.dusk && preach.dawn, `Paris on Jun 21 is not a day the sun misses −18° with a real dusk and dawn (${JSON.stringify(preach)})`)
  F(Number.isFinite(paris.night) && A.resolveGroupAtMinute(night, paris.night, paris, ['glow'], { glow: 0 }).glow === 1, 'in Paris on Jun 21 the Night key does not occur')
  // 6. the share card
  const card = share ? share(sourceOf('src/lib/todSlots.js')) : null
  const T2 = card ? await importSource('src/lib/todSlots.js', { transform: share }) : T
  const nadirInstant = new Date(Date.UTC(2026, 5, 21, 0, 0) + (paris.deep - 120) * 60000)   // Paris is UTC+2 in June
  const named = T2.todSlotAt(nadirInstant, at(48.86, 2.35, 'Europe/Paris'), T2.SHARE_SLOT_TOLERANCE_MIN)
  F(named !== 'night', `the share card names "night" at the nadir in Paris on Jun 21, a moment that did not happen (${named})`)
  const sc = capture ? capture(sourceOf('src/cartograph/ShareCapture.jsx')) : sourceOf('src/cartograph/ShareCapture.jsx')
  F(/const reached = getTodSlotReached\(was\.time\), absent = TOD_SLOT_IDS\.filter\(\(id\) => !reached\[id\]\)/.test(sc), "Stage's share capture does not refuse a date that lacks a slot from the reached flags")
  return fails
}

// A run that throws (a Refusal from a resolver, say) is a failure, never a crash of the check.
const run = async (m) => { try { return await verdict(m) } catch (e) { return [`it threw: ${String(e.message).slice(0, 200)}`] } }
const fails = await run()
if (fails.length) { console.log('⛔ a slot has no time, or the lights do not do today\'s thing where the sun misses one:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log("✅ every slot has a time every day at every latitude, in the day's order; the lamps and the display are off on a white night and on through a polar night; the Night key occurs; the share card names only what happened")

// --drift: how far a slot moves from one day to the next in each registered town (the error of reading today's minute for
// yesterday's key across midnight: the resolvers' single-day read, cartograph/BACKLOG.md). Printed, never judged here.
if (process.argv.includes('--drift')) {
  const T = await importSource('src/lib/todSlots.js'), REG = await importSource('src/instances/registry.js')
  for (const id of REG.registeredMaps()) {
    const g = REG.instanceForMap(id)?.geography; if (!g) continue
    const rows = T.todSlotYear({ lat: g.lat, lon: g.lon, tz: g.timezone }, 2026), moves = []; let max = { m: 0 }
    for (let k = 1; k < rows.length; k++) for (const s of ['night', 'deep', 'dawn']) {
      const x = Math.abs(rows[k].minutes[s] - rows[k - 1].minutes[s]) % 1440, m = Math.min(x, 1440 - x); moves.push(m); if (m > max.m) max = { m, s, date: rows[k].date } }
    moves.sort((a, b) => a - b)
    console.log(`   ${id}: Night/Deep/Dawn move from one day to the next by a median ${moves[moves.length >> 1].toFixed(2)} min, p99 ${moves[Math.floor(moves.length * 0.99)].toFixed(2)}, max ${max.m.toFixed(1)} (${max.s}, ${max.date})`)
  }
}

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['an unreached slot is null again', { slots: (s) => s.replace('minutes[id] = townMinuteOf(Math.abs(hi - a) <= Math.abs(lo - a) ? noon : nadir, tz)', 'minutes[id] = null') }],
    ['every unreached slot sent to the nadir (one side)', { slots: (s) => s.replace('Math.abs(hi - a) <= Math.abs(lo - a) ? noon : nadir', 'nadir') }],
    ['the side by category, not by angle', { slots: (s) => s.replace('Math.abs(hi - a) <= Math.abs(lo - a) ? noon : nadir', "['dawn', 'dusk', 'night'].includes(id) ? nadir : noon") }],
    ['the Night key dropping again', { slots: (s) => s.replace('    const a = ANGLE[SUNCALC_TIME[id]]', "    if (id === 'night') { minutes[id] = null; continue }\n    const a = ANGLE[SUNCALC_TIME[id]]") }],
    ['ties broken by a fixed slot order', { param: (s) => s.replace('arc(a.minute, mins.deep) < arc(a.minute, mins.noon) ? NADIR_ORDER : NOON_ORDER', 'false ? NADIR_ORDER : NOON_ORDER') }],
    ['a fade-down starting from full', { param: (s) => s.replace('scale: reachedAt(channel, points, i) * (1 - ramp(eK))', 'scale: (1 - ramp(eK))') }],
    ["Stage's capture back on the null test", { capture: (s) => s.replace('const reached = getTodSlotReached(was.time), absent = TOD_SLOT_IDS.filter((id) => !reached[id])', 'const absent = TOD_SLOT_IDS.filter((id) => mins[id] == null)') }],
    ['the share card naming an unreached slot', { share: (s) => s.replace('if (m == null || (reached && !reached[id])) continue', 'if (m == null) continue') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await run(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
