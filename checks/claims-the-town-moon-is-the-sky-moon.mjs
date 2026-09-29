#!/usr/bin/env node
/**
 * "IS THE TOWN'S MOON PICTURE THE SKY'S OWN MOON — ON THE TOWN'S ONE WEBGL CONTEXT?"
 *
 * WHY (BRIEF-ward-society-pass §B, ruled by Boz 2026-09-29, option C). The Ward's Almanac shows tonight's moon as a
 * picture (`useTownMoonImage`, src/components/TownMoon.jsx). ⛔ Three ways it goes wrong, each caught here:
 *   1. the phase is wrong — the lit fraction at known dates (the 2024-04-08 eclipse new moon, the 2024-04-15 first
 *      quarter, the 2024-04-23 full moon) from `moonSky`, the one computation the sky and the picture share;
 *   2. there are two moons — the sky's <Moon> and the picture must both take `createMoonMaterial`, `moonSky` and
 *      `moonSunDir3D`, and the picture may compute or shade nothing of its own;
 *   3. it costs a WebGL context — phones cap them, and a lost one is a black movie: the picture renders on the
 *      <Town> canvas's own `gl` (a painter <Town> mounts), never a new renderer, <Canvas> or webgl context.
 *   And (4) where the moon is comes from the placed town, never the kit's boot town (no `instance.js`).
 * ⛔ Mutation-tested 2026-09-29: moonSky reading `new Date()` instead of `time` → (1) red; a `new THREE.WebGLRenderer`
 *    in TownMoon.jsx → (3) red; a second ShaderMaterial in TownMoon.jsx → (2) red.
 * ⚠️ (2)–(4) read source. The picture's pixels are Jacob's eye on the Almanac.
 *
 * Usage: node checks/claims-the-town-moon-is-the-sky-moon.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { moonSky } from '../src/components/celestialLights.js'

const fails = []
// 1. The phase, at dates anyone can look up. Any place: the lit fraction does not depend on where you stand.
const place = { lat: 42.05, lon: -70.19 }
for (const [iso, lo, hi, what] of [
  ['2024-04-08T18:18:00Z', 0, 0.01, 'the 2024-04-08 new moon'],
  ['2024-04-15T19:13:00Z', 0.45, 0.55, 'the 2024-04-15 first quarter'],
  ['2024-04-23T23:49:00Z', 0.99, 1, 'the 2024-04-23 full moon'],
]) {
  const f = moonSky(new Date(iso), place).illum.fraction
  if (!(f >= lo && f <= hi)) fails.push(`phase: lit fraction ${f.toFixed(4)} at ${what}, want ${lo}–${hi}`)
}

const code = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/.*$/gm, '')
const sky = code('src/components/CelestialBodies.jsx')
const pic = code('src/components/TownMoon.jsx')
const town = code('src/components/Town.jsx')

// 2. One moon.
if (!/createMoonMaterial\(moonTexture\)/.test(sky)) fails.push('one moon: the sky\'s <Moon> does not take createMoonMaterial')
if (!/moonSunDir3D\(sunDirection, camera/.test(sky)) fails.push('one moon: the sky\'s <Moon> does not light by moonSunDir3D')
if (!/moonSky\(currentTime, place/.test(sky)) fails.push('one moon: the sky\'s lighting does not take moonSky')
for (const f of ['createMoonMaterial', 'moonSky', 'moonSunDir3D']) if (!pic.includes(f)) fails.push(`one moon: TownMoon.jsx does not use ${f}`)
if (/ShaderMaterial|SunCalc|getMoonIllumination|fragmentShader/.test(pic)) fails.push('one moon: TownMoon.jsx shades or computes the moon itself')

// 3. No second context.
if (/WebGLRenderer|<Canvas|getContext\(\s*['"](webgl|webgl2|experimental-webgl)['"]/.test(pic)) fails.push('context: TownMoon.jsx makes a WebGL context of its own')
if (!/useThree\(\(s\) => s\.gl\)/.test(pic)) fails.push('context: TownMoon.jsx does not draw on the <Town> canvas\'s gl')
if (!/<TownMoonPainter \/>/.test(town)) fails.push('context: <Town> does not mount TownMoonPainter inside its canvas')
if (/useFrame\(/.test(pic)) fails.push('context: TownMoon.jsx waits on frames — it must draw while <Town> is paused')

// 4. The placed town, never the boot town.
if (/instance\.js|INSTANCE\b/.test(pic)) fails.push('place: TownMoon.jsx reads the kit\'s boot town')
if (!/townPlace\(\)/.test(pic)) fails.push('place: TownMoon.jsx does not take the placed town')

if (fails.length) {
  console.error(`⛔ ${fails.length} failure(s):`)
  for (const f of fails) console.error('   ' + f)
  process.exit(1)
}
console.log('✅ the town\'s moon picture is the sky\'s own moon, at the right phase, on the <Town> canvas\'s one context')
