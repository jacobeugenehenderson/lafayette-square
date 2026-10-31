#!/usr/bin/env node
/**
 * "DOES EVERY LOOK START FROM ITS OWN BEGINNING?" (BRIEF-the-monument-lights-up; Jacob, 2026-10-31: the Red Ribbon's
 * build "starts black", and Trans arrives on its lilac and resolves into the stripes)
 *
 * A look's motions run on the LOOK's clock, 0 when its segment begins, never on the town's instant; else a once-played
 * build starts wherever the hour left it, and a fade lands wherever the hour left it. So, in the engine
 * (src/displays/lightShow/engine.js):
 *   1. a layer played ONCE shows its first frame as its look begins and on through the transition that brings it in,
 *      its later frames at their own seconds, and its last frame held after; whatever the town's instant;
 *   2. a fade's `phase` places it at the look's start: a fade with phase 0.25 is fully over the look as it lands.
 * The drawer is synthetic (flat pixels): what is under test is the engine's clock, not the art.
 *
 * Usage: node checks/claims-a-look-runs-on-its-own-clock.mjs [--mutants]
 *   --mutants: looks sampled on the instant · once played as a loop · a fade's phase ignored, each red.
 */
import { importSource } from './_importSource.mjs'

const F = { w: 8, h: 6, pinH: 2, faces: 4 }
const flat = (rgb) => { const a = new Uint8ClampedArray(F.w * F.h * 4); for (let i = 0; i < a.length; i += 4) { a[i] = rgb[0]; a[i + 1] = rgb[1]; a[i + 2] = rgb[2]; a[i + 3] = 255 } return a }
const BLACK = [0, 0, 0], RED = [200, 0, 0], GREEN = [0, 200, 0], BLUE = [0, 0, 200], LILAC = [180, 108, 255], GREY = [90, 90, 90]
const looks = [
  { id: 'x', layers: [{ motion: { kind: 'still' }, frames: ['x'], px: [flat(GREY)] }] },
  { id: 'build', layers: [{ motion: { kind: 'still' }, frames: ['0', '1', '2'], fps: 1, once: true, px: [flat(BLACK), flat(RED), flat(GREEN)] }] },
  { id: 'lands', layers: [{ motion: { kind: 'still' }, frames: ['x'], px: [flat(BLUE)] }, { motion: { kind: 'fade', period: 4, phase: 0.25 }, frames: ['x'], px: [flat(LILAC)] }] },
]
const byId = Object.fromEntries(looks.map(L => [L.id, L]))
const RUN = [{ look: 'x', seconds: 5 }, { transition: 'iris' }, { look: 'build', seconds: 5 }, { transition: 'iris' }, { look: 'lands', seconds: 3 }, { transition: 'iris' }, { look: 'x', seconds: 2 }]

async function verdict(mutate) {
  const E = await importSource('src/displays/lightShow/engine.js', mutate ? { transform: mutate } : {})
  const C = E.compileRun(RUN, byId, 'check'), segs = C.segs, fails = []
  const at = (i) => E.OPEN_SECONDS + segs[i].at                                    // a segment's start, on the show clock
  const bulb = (t, instant) => E.showAt(F, C, byId, t, instant).colour(3, F.pinH + 2).map(Math.round).join(',')
  const is = (t, rgb, what) => { for (const instant of [1_700_000_000.0, 1_700_000_001.6, 1_700_000_003.3]) { const got = bulb(t, instant); if (got !== rgb.join(',')) { fails.push(`${what}: ${got} at town instant ${instant}, not ${rgb.join(',')}`); return } } }
  // 1. once: black as it begins, red a second and a half in, green after two, held green past its last frame.
  is(at(2) + 0.05, BLACK, 'the once-played build as its look begins')
  is(at(2) + 1.5, RED, 'the build a second and a half in')
  is(at(2) + 4.5, GREEN, 'the build after its last frame (held)')
  // …and black through the transition bringing it in, where the incoming look is read (iris, from the middle out).
  const midIris = at(1) + segs[1].seconds * 0.9
  for (const instant of [1_700_000_000.0, 1_700_000_001.6]) {
    const got = E.showAt(F, C, byId, midIris, instant).colour(F.w / F.faces / 2, F.pinH + Math.floor((F.h - F.pinH) * 0.55)).map(Math.round).join(',')
    if (got !== BLACK.join(',')) { fails.push(`the build while the transition brings it in: ${got} at town instant ${instant}, not black`); break }
  }
  // 2. a fade with phase 0.25 is fully over its look as it lands.
  is(at(4) + 0.05, LILAC, 'the fade (phase 0.25) as its look lands')
  return fails
}

const fails = await verdict()
if (fails.length) { console.log('⛔ a look does not run on its own clock:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ every look runs on its own clock: a once-played build starts black and holds its end, whatever the instant; a fade lands where its phase puts it')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['looks sampled on the town\'s instant', (s) => s.replace('sampleLook(F, looksById[seg.look], c, row, runT - seg.at,', 'sampleLook(F, looksById[seg.look], c, row, now,').replace('tB = runT - nextLook.at', 'tB = now')],
    ['once played as a loop', (s) => s.replace('return L.once ? Math.min(n - 1, Math.max(0, i)) :', 'return false ? 0 :')],
    ['a fade\'s phase ignored', (s) => s.replace('fadeAlpha(t + (m.phase ?? 0) * (m.period ?? 6),', 'fadeAlpha(t,')],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
