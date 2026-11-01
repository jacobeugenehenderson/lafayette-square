#!/usr/bin/env node
/**
 * "DOES EVERY VIEWER SEE THE SAME LIGHT AT THE SAME INSTANT?" (BRIEF-the-monument-lights-up §4, gate 1)
 *
 * A show is must-see because it is a pure function of the TOWN's clock: no server, and no viewer's clock in it. So:
 *   1. behaviour: the engine (src/displays/lightShow/engine.js, with its transitions) gives the SAME colour for every bulb
 *      when asked the same show time and instant twice, a moment apart, through a show's opening, a look, a transition
 *      and a motion object on its way in;
 *   2. the engine and the transitions read no clock at all (Date, performance, getHours…);
 *   3. the renderer's LIVE path reads the town's one clock (useTimeOfDay.currentTime → townClockOf) and no other; the
 *      page's own time (performance.now) is allowed ONLY inside Stage's preview branch.
 * The drawer here is synthetic (seeded pixels, not the town's SVGs): what is under test is the engine, not the art.
 *
 * Usage: node checks/claims-a-display-is-the-same-for-every-viewer.mjs [--mutants]
 *   --mutants: the engine reading Date.now() → (1) and (2) red; the live path reading performance.now() → (3) red.
 */
import { importSource, sourceOf } from './_importSource.mjs'

const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
// The viewer's clocks. (`.getTime()` of the town's instant is the town's clock, not one of these.)
const CLOCK = /\b(Date\.now|new Date|performance\.now|getHours|getMinutes|getSeconds)\b/

function drawer() {
  let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296
  const frame = { w: 24, h: 18, pinH: 4, faces: 4 }
  const px = (alphaAll) => { const a = new Uint8ClampedArray(frame.w * frame.h * 4); for (let i = 0; i < a.length; i += 4) { a[i] = rnd() * 255; a[i + 1] = rnd() * 255; a[i + 2] = rnd() * 255; a[i + 3] = alphaAll || rnd() > 0.5 ? 255 : 0 } return a }
  const looks = [
    { id: 'a', layers: [{ motion: { kind: 'twinkle' }, frames: ['x'], px: [px(true)] }, { motion: { kind: 'fall', speed: 5 }, frames: ['x'], px: [px()] }] },
    { id: 'b', layers: [{ motion: { kind: 'spin', speed: 7 }, frames: ['x', 'y'], fps: 6, px: [px(true), px(true)] }, { motion: { kind: 'still' }, enter: 'rise', frames: ['x'], px: [px()] }] },
    { id: 'c', layers: [{ motion: { kind: 'pulse' }, frames: ['x'], px: [px(true)] }, { motion: { kind: 'fade', period: 5 }, frames: ['x'], px: [px()] }] },
  ]
  return { frame, looks, byId: Object.fromEntries(looks.map(L => [L.id, L])) }
}
const RUN = [{ look: 'a', seconds: 3 }, { transition: 'sparkle' }, { look: 'b', seconds: 2 }, { transition: 'chevron' }, { look: 'c', seconds: 3 }, { transition: 'melt' }, { look: 'a', seconds: 2 }]

async function frames(mutate) {
  const E = await importSource('src/displays/lightShow/engine.js', mutate ? { transform: mutate } : {})
  const D = drawer(), C = E.compileRun(RUN, D.byId, 'check')
  const out = []
  for (const t of [1.2, 4.0, 6.0, 9.5, 12.7, 15.0, 19.0]) {
    const s = E.showAt(D.frame, C, D.byId, t, 1_700_000_000 + t)
    for (let row = 0; row < D.frame.h; row++) for (let c = 0; c < D.frame.w; c++) {
      const r = s.reveal ? s.reveal(c, row) : 'on'
      out.push(r === 'on' ? s.colour(c, row).map(v => Math.round(v)).join(',') : r)
    }
  }
  return out.join(';')
}

async function verdict({ engineMutant, liveMutant } = {}) {
  const fails = []
  // 1. behaviour: the same instant twice, a moment apart.
  const a = await frames(engineMutant); await new Promise(r => setTimeout(r, 25)); const b = await frames(engineMutant)
  if (a !== b) fails.push('the same show time and instant, asked twice a moment apart, lit the bulbs differently: the engine reads a clock of its own')
  // 2. no clock in the engine or the transitions.
  for (const [rel, src] of [['src/displays/lightShow/engine.js', engineMutant ? engineMutant(sourceOf('src/displays/lightShow/engine.js')) : sourceOf('src/displays/lightShow/engine.js')], ['src/displays/lightShow/transitions.js', sourceOf('src/displays/lightShow/transitions.js')]]) {
    const m = code(src).match(CLOCK); if (m) fails.push(`${rel} reads a clock (${m[0]}): a show must be a function of the instant it is given`)
  }
  // 3. the renderer: the town's one clock live; the page's time only inside Stage's preview branch.
  let ls = code(sourceOf('src/displays/lightShow/LightShow.jsx')); if (liveMutant) ls = liveMutant(ls)
  const a0 = ls.indexOf('if (preview) {'), a1 = ls.indexOf('} else {', a0)
  if (a0 < 0 || a1 < 0) fails.push('LightShow.jsx: no `if (preview) { … } else {` branch to tell Stage\'s preview from the live path')
  else {
    const live = ls.slice(0, a0) + ls.slice(a1), m = live.match(CLOCK)
    if (m) fails.push(`LightShow.jsx reads ${m[0]} outside Stage's preview branch: the live show must run on the town's clock alone`)
    if (!/useTimeOfDay\.getState\(\)\.currentTime/.test(live) || !/townClockOf\(/.test(live)) fails.push('LightShow.jsx: the live path does not read the town\'s one clock (useTimeOfDay.currentTime through townClockOf)')
  }
  return fails
}

const fails = await verdict()
if (fails.length) { console.log('⛔ a display is not the same for every viewer:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ every viewer sees the same light: the engine is a pure function of the instant; live runs on the town\'s clock alone; the page\'s time only in Stage\'s preview')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['the engine reads Date.now()', { engineMutant: (s) => s.replace('export function sampleLook(F, look, c, row, t,', 'export function sampleLook(F, look, c, row, t_,').replace('  const { w: FW, h: FH, pinH: P } = F, CONE = FH - P\n  for (let li', '  const t = t_ + (Date.now() % 1000) / 37\n  const { w: FW, h: FH, pinH: P } = F, CONE = FH - P\n  for (let li') }],
    ['the live path reads performance.now()', { liveMutant: (s) => s.replace('day.current.times, where)); now = instant.getTime() / 1000', 'day.current.times, where)); now = performance.now() / 1000') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
