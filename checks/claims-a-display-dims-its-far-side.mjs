#!/usr/bin/env node
/**
 * "DOES A DISPLAY DIM ITS FAR SIDE FROM THE EYE, BY ITS OWN AUTHORED AMOUNT, FROM THE CAMERA EVERY FRAME?" (Jacob,
 * 2026-11-01: "I thought we were dimming the rear lights away from the camera … for greater dimension"; released by Boz
 * after Jacob's eye on the show channel.)
 *
 *   1. THE FACTOR (engine.js#backDimFactor, driven): 1 − backDim × (1 − n·v) / 2, n the bulb's outward direction from the
 *      axis, v toward the eye: whole facing the eye, × (1 − backDim) on the far side, half way side-on, the same at any
 *      distance (v is a direction), and no dim at backDim 0;
 *   2. AUTHORED, refused out of range: engine.js#validateDisplay and LightShow refuse a backDim outside 0 … 1 by name;
 *      absent is the neutral default, 0; PTown's record carries its own (read from the instance);
 *   3. WIRED (LightShow.jsx, read): the eye is the live camera brought into the set-piece's frame each frame; each bulb's
 *      light (glow and show alike, before it is written to the cores the cards share) is × its factor, from the bulb's own
 *      place and its outward direction.
 * Usage: node checks/claims-a-display-dims-its-far-side.mjs [--mutants]
 */
import { importSource, sourceOf } from './_importSource.mjs'

const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const near = (a, b) => Math.abs(a - b) < 1e-12

async function verdict({ eng, view } = {}) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  const E = await importSource('src/displays/lightShow/engine.js', eng ? { transform: eng } : {})
  // 1. a bulb on the +x side (n = (1, 0)); the eye at +x (facing), −x (far side), +z (side-on), far and near
  F(near(E.backDimFactor(0.3, 1, 0, 50, 0, 0), 1), 'a bulb facing the eye is dimmed')
  F(near(E.backDimFactor(0.3, 1, 0, -50, 0, 0), 0.7), `a bulb on the far side is not × (1 − backDim) (${E.backDimFactor(0.3, 1, 0, -50, 0, 0)})`)
  F(near(E.backDimFactor(0.3, 1, 0, 0, 0, 40), 0.85), 'a bulb side-on is not dimmed half way')
  F(near(E.backDimFactor(0.3, 1, 0, -5, 0, 0), E.backDimFactor(0.3, 1, 0, -5000, 0, 0)), 'the dim depends on the distance (v must be a direction)')
  F(near(E.backDimFactor(0, 1, 0, -50, 0, 0), 1), 'backDim 0 dims anything')
  // the eye's elevation (Zob): no dim straight down (never NaN), the cue fading with elevation, no global dim from above
  const down = E.backDimFactor(0.3, 1, 0, 0, 80, 0)
  F(down === 1, `straight down a bulb is dimmed or NaN (${down}): from overhead there is no front or back`)
  F(near(E.backDimFactor(0.3, 1, 0, -50, 50, 0), 1 - 0.3 * Math.SQRT1_2), `at 45° the far side's dim does not fade with the elevation (${E.backDimFactor(0.3, 1, 0, -50, 50, 0)})`)
  F(E.backDimFactor(0.3, 0, 1, 0.01, 1000, 0) > 0.999, 'from high above, a bulb side-on is dimmed (a global dim, not a front/back cue)')
  // 2. authored, refused out of range
  const drawer = { frame: { w: 2, h: 3, pinH: 1, faces: 4 }, looks: [{ id: 'a', layers: [{ motion: { kind: 'still' }, frames: ['a.png'] }] }] }
  const rec = (backDim) => ({ drawer: 'displays/x/looks.json', season: 's', strands: { glow: 1, show: 2, ringRadiusM: 3, footHeightM: 1 }, run: [{ look: 'a', seconds: 5 }], ...(backDim === undefined ? {} : { backDim }) })
  const refuses = (f, re) => { try { f(); return false } catch (e) { return re.test(e.message) } }
  F(refuses(() => E.validateDisplay(rec(1.5), drawer, 'check'), /backDim \(1\.5\) is how far the bulbs facing away from the eye dim, 0 … 1/) && refuses(() => E.validateDisplay(rec(-0.1), drawer, 'check'), /backDim \(-0\.1\)/), 'a backDim outside 0 … 1 is not refused by name')
  F(!refuses(() => E.validateDisplay(rec(undefined), drawer, 'check'), /./) && !refuses(() => E.validateDisplay(rec(0.3), drawer, 'check'), /./), 'a display with no backDim, or one in range, is refused')
  const REG = await importSource('src/instances/registry.js')
  const pt = REG.registeredMaps().map(m => REG.instanceForMap(m)).find(i => i?.displays?.length)?.displays?.[0]
  F(pt && pt.backDim >= 0 && pt.backDim <= 1, `the town with a display carries no backDim in range (${pt?.backDim})`)
  // 3. wired
  const ls = code(view ? view(sourceOf('src/displays/lightShow/LightShow.jsx')) : sourceOf('src/displays/lightShow/LightShow.jsx'))
  F(/const backDim = display\.backDim \?\? 0/.test(ls) && /if \(!\(backDim >= 0 && backDim <= 1\)\) throw new Refusal\(/.test(ls), 'LightShow does not read the display\'s own backDim (neutral 0 when absent), or does not refuse one out of range')
  F(/const eye = backDim > 0 \? root\.current\.worldToLocal\(reach\.eye\.copy\(three\.camera\.position\)\) : null/.test(ls), 'the eye is not the live camera in the set-piece\'s frame')
  F(/k = backDimFactor\(backDim, A\[b \+ 3\], A\[b \+ 4\], eye\.x - A\[b\], eye\.y - A\[b \+ 1\], eye\.z - A\[b \+ 2\]\)/.test(ls) && /tmp\.c\.setRGB\(rgb\[0\] \/ 255 \* k, rgb\[1\] \/ 255 \* k, rgb\[2\] \/ 255 \* k\)/.test(ls), 'each bulb\'s light is not × its own factor (its place, its outward direction, toward the eye)')
  F(/at\.set\(\[x, y, z, x \/ h, z \/ h\], \(s \* rows \+ j\) \* 5\)/.test(ls), 'a bulb\'s outward direction is not from the set-piece\'s axis through its own place')
  return fails
}

const run = async (m) => { try { return await verdict(m) } catch (e) { return [`it threw: ${String(e.message).slice(0, 200)}`] } }
const fails = await run()
if (fails.length) { console.log('⛔ the display does not dim its far side:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ a display dims its far side from the eye by its own backDim: whole facing, × (1 − backDim) away at eye level, fading with the eye’s elevation, none straight down, from the live camera each frame, glow and show alike; out of range refused, absent no dim')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['the far side whole (no dim)', { eng: (s) => s.replace('  return 1 - backDim * (1 - (nx * hx + nz * hz) / h) / 2 * h', '  return 1') }],
    ['the dim by distance, not direction', { eng: (s) => s.replace('const len = Math.hypot(vx, vy, vz) || 1,', 'const len = 50,') }],
    ['the near side dimmed instead', { eng: (s) => s.replace('(1 - (nx * hx + nz * hz) / h)', '(1 + (nx * hx + nz * hz) / h)') }],
    ['the 3-D direction (a global dim from above)', { eng: (s) => s.replace('  return 1 - backDim * (1 - (nx * hx + nz * hz) / h) / 2 * h', '  return 1 - backDim * (1 - (nx * hx + nz * hz)) / 2') }],
    ['a bare horizontal direction (NaN straight down)', { eng: (s) => s.replace('  if (!(h > 0)) return 1                                              // straight down: no front or back to cue\n', '').replace(' / 2 * h', ' / 2') }],
    ['a backDim out of range accepted', { eng: (s) => s.replace('if (display.backDim !== undefined && !(display.backDim >= 0 && display.backDim <= 1)) throw', 'if (false) throw') }],
    ['a fixed eye, not the camera', { view: (s) => s.replace('root.current.worldToLocal(reach.eye.copy(three.camera.position))', 'reach.eye.set(0, 0, 100)') }],
    ['the factor not applied', { view: (s) => s.replace('tmp.c.setRGB(rgb[0] / 255 * k, rgb[1] / 255 * k, rgb[2] / 255 * k)', 'tmp.c.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)') }],
    ['backDim a constant in the plugin', { view: (s) => s.replace('const backDim = display.backDim ?? 0', 'const backDim = 0.3') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await run(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
