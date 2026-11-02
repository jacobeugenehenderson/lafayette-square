#!/usr/bin/env node
/**
 * "DOES A TOWN SCRUBBED TO ANOTHER TIME KEEP TICKING FROM THERE?" (Jacob, 2026-11-01: "we never really leave now's time
 * we just scrub along its index"; "it's hard to preview the display if you have to wait for an hour to see it").
 *
 * <Town timeOffsetMs> (0 = live) shows now + offset and the town's clock ADVANCES from there, frame by frame, so a scrubbed
 * Light Show plays at frame rate instead of freezing at the scrubbed minute (a `time` Date is never ticked).
 *   1. RUN: TownPlace (src/components/TownPlace.jsx) and TimeTicker (src/components/SkyTickers.jsx) under the hook runner
 *      (checks/_hookRunner.mjs), on the REAL clock store (src/hooks/useTimeOfDay.js), with Date.now stubbed:
 *      · an offset puts currentTime at now + offset, off live (isLive false: the weather reads the shown time);
 *      · across 100 frames currentTime − (now + offset) stays 0 (timeSpeed 1, not paused: the header's assumption);
 *      · a REMOUNT re-anchors at now + offset (time passed while it was gone);
 *      · a TOWN SWITCH (a new lookId, the same offset) leaves the clock where it is, still now + offset;
 *      · offset 0 is live.
 *   2. READ: <Town> keeps TimeTicker mounted under an offset (only a `time` Date unmounts it), and refuses `time` with
 *      `timeOffsetMs`, holdScrubbedTime with `timeOffsetMs`, and an offset that is not a finite number, each by name.
 *
 * Usage: node checks/claims-a-scrubbed-town-keeps-ticking.mjs [--mutants]
 *   --mutants: the ticker held off live · the offset frozen as an instant (no ticker under it) · no re-anchor on remount ·
 *   the offset applied with isLive left true · the time+offset refusal removed → each RED.
 */
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'
import { importSource, sourceOf } from './_importSource.mjs'
import { hookRunner } from './_hookRunner.mjs'

const TOD = (await import(pathToFileURL(join(ROOT, 'src/hooks/useTimeOfDay.js')).href)).default
const HOOKS = (names) => names.map(h => `const ${h} = (...a) => globalThis.__hooks.${h}(...a)`).join('\n')

async function run({ place, ticker } = {}) {
  const fails = [], mount = hookRunner()
  const P = await importSource('src/components/TownPlace.jsx', { span: { from: 'function requireTown(' }, ...(place ? { transform: place } : {}),
    prefix: HOOKS(['useLayoutEffect', 'useRef', 'useState', 'useSyncExternalStore']) +
      "\nconst reloadTerrain = () => Promise.resolve()\nconst setTownPlace = () => {}, placedLook = () => null, onPlaceMoved = () => () => {}, terrainLook = () => null, onTerrainReload = () => () => {}\nimport useTimeOfDay from '../hooks/useTimeOfDay.js'\nimport { Refusal } from '../lib/refusal.js'" })
  const K = await importSource('src/components/SkyTickers.jsx', { span: { functions: ['TimeTicker'] }, suffix: '\nexport { TimeTicker }', ...(ticker ? { transform: ticker } : {}),
    // the store's hook form (a selector) read straight from the real store: the runner has no React to subscribe through
    prefix: HOOKS(['useRef']) + "\nconst useTownFrame = (fn) => { globalThis.__tick = fn }\nimport TOD from '../hooks/useTimeOfDay.js'\nconst useTimeOfDay = Object.assign((sel) => sel(TOD.getState()), { getState: TOD.getState, setState: TOD.setState })" })
  const realNow = Date.now
  let clock = Date.UTC(2026, 10, 1, 21, 0, 0)
  Date.now = () => clock
  const town = { geography: { lat: 38.6, lon: -90.2 } }, OFF = 2 * 3600e3 + 59 * 60e3
  const off = () => TOD.getState().currentTime.getTime() - (clock + OFF)
  try {
    TOD.setState({ timeSpeed: 1, isPaused: false }); TOD.getState().returnToLive()
    const a = mount(P.TownPlace); a.render({ town, lookId: 'a-town', timeOffsetMs: OFF }); await a.settle({ town, lookId: 'a-town', timeOffsetMs: OFF })
    if (off() !== 0) fails.push(`an offset of ${OFF} ms does not put the town at now + offset (off by ${off()} ms)`)
    if (TOD.getState().isLive) fails.push('a town shown at now + offset is still marked live: the weather would read the current conditions, not the shown time\'s')
    const t = mount(K.TimeTicker); t.render({})
    let worst = 0
    for (let i = 0; i < 100; i++) { clock += 16; globalThis.__tick({}, 0.016); worst = Math.max(worst, Math.abs(off())) }
    if (worst !== 0) fails.push(`over 100 frames the scrubbed town drifts from now + offset (worst ${worst} ms): a show would not play at frame rate`)
    // a town switch: the same offset, a new lookId — the clock is left where it is, and keeps ticking
    a.render({ town, lookId: 'b-town', timeOffsetMs: OFF }); await a.settle({ town, lookId: 'b-town', timeOffsetMs: OFF })
    for (let i = 0; i < 10; i++) { clock += 16; globalThis.__tick({}, 0.016) }
    if (off() !== 0) fails.push(`after a town switch the clock is ${off()} ms off now + offset`)
    // a remount after time passed with nothing ticking: re-anchored
    a.unmount(); t.unmount(); clock += 7000
    const b = mount(P.TownPlace); b.render({ town, lookId: 'b-town', timeOffsetMs: OFF }); await b.settle({ town, lookId: 'b-town', timeOffsetMs: OFF })
    if (off() !== 0) fails.push(`a remount does not re-anchor at now + offset (off by ${off()} ms)`)
    b.render({ town, lookId: 'b-town', timeOffsetMs: 0 }); await b.settle({ town, lookId: 'b-town', timeOffsetMs: 0 }); b.unmount()
    // returnToLive reads the wall clock (new Date()), not Date.now: live means isLive and the real now
    if (!TOD.getState().isLive || Math.abs(TOD.getState().currentTime.getTime() - realNow.call(Date)) > 1000) fails.push('offset 0 is not live')
  } finally { Date.now = realNow; delete globalThis.__tick }
  return fails
}

function read(town = sourceOf('src/components/Town.jsx')) {
  const fails = []
  if (!/\{!\(time instanceof Date\) && <TimeTicker holdScrubbedTime=\{holdScrubbedTime\}/.test(town)) fails.push('<Town> does not keep TimeTicker mounted under an offset (only a `time` Date may unmount it): the scrubbed town would freeze')
  if (!/if \(time !== undefined\) throw new Refusal\('\[Town\] ⛔ `time` and `timeOffsetMs` both drive the clock/.test(town)) fails.push('<Town> does not refuse `time` with `timeOffsetMs`')
  if (!/if \(holdScrubbedTime\) throw new Refusal\('\[Town\] ⛔ `holdScrubbedTime` with `timeOffsetMs`/.test(town)) fails.push('<Town> does not refuse holdScrubbedTime with `timeOffsetMs` (the hold freezes the offset)')
  if (!/if \(!Number\.isFinite\(timeOffsetMs\)\) throw new Refusal/.test(town)) fails.push('<Town> does not refuse an offset that is not a finite number')
  if (!/<TownPlace [^>]*timeOffsetMs=\{timeOffsetMs\}/.test(town)) fails.push('<Town> does not hand TownPlace the offset')
  return fails
}

const fails = [...await run(), ...read()]
for (const f of fails) console.log(`⛔ ${f}`)
console.log(fails.length ? '\n⛔ RED — a scrubbed town does not keep ticking from now + offset' : '✅ a scrubbed town keeps ticking from now + offset: frame by frame, across a town switch, re-anchored on a remount; 0 is live')
let bad = fails.length ? 1 : 0

if (process.argv.includes('--mutants')) {
  const must = (from, to) => (s) => { if (!s.includes(from)) throw new Error(`[mutant] anchor gone: ${from.slice(0, 80)}`); return s.replace(from, to) }
  const town = sourceOf('src/components/Town.jsx')
  const MUTANTS = [
    ['the ticker held off live', () => run({ ticker: must('if (holdScrubbedTime && !useTimeOfDay.getState().isLive) return', 'if (!useTimeOfDay.getState().isLive) return') })],
    ['the offset frozen as an instant (no ticker under it)', () => read(must('{!(time instanceof Date) && <TimeTicker', '{timeOffsetMs === undefined && !(time instanceof Date) && <TimeTicker')(town))],
    ['no re-anchor on remount', () => run({ place: must('    if (timeOffsetMs === undefined) return\n', "    if (timeOffsetMs === undefined || globalThis.__seenOffset === timeOffsetMs) return\n    globalThis.__seenOffset = timeOffsetMs\n") })],
    ['the offset applied with isLive left true', () => run({ place: must('else tod.setTime(new Date(Date.now() + timeOffsetMs))', 'else useTimeOfDay.setState({ currentTime: new Date(Date.now() + timeOffsetMs) })') })],
    ['the time+offset refusal removed', () => read(must("if (time !== undefined) throw new Refusal('[Town] ⛔ `time` and `timeOffsetMs`", "if (false) throw new Refusal('[Town] ⛔ `time` and `timeOffsetMs`")(town))],
  ]
  for (const [name, go] of MUTANTS) {
    delete globalThis.__seenOffset
    const f = await go()
    console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f[0].slice(0, 110)})` : ''}`)
    if (!f.length) bad = 1
  }
}
process.exit(bad)
