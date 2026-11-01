#!/usr/bin/env node
/**
 * "IS A KEYED LAMP EXACTLY ITS KEYS?" (Jacob, 2026-11-01: "There's no point in an authored value being tied to a
 * heuristic"; shown his 2026-09-26 ruling that restored the ramp, and confirmed "Delete it".)
 *
 * In src/components/StreetLights.jsx:
 *   1. the four keyed lamp values (the Lantern's Bulb and Glow, the Lamp Glow card's pools and trees) are written as
 *      exactly `Math.max(0, <keyed>)`, each statement ending there (no factor after it);
 *   2. the sun appears ONLY at its allowed sites, by an inventory of every reference in the whole file (Zob: a check that
 *      looks only for `const … sunAltitude` misses a `let`, a helper, a factor on a write, or a shader ramp):
 *      the getLightingPhase selector and its one destructure, the sunAltUniform declaration and its write, the shader
 *      uniform hookup and its declaration, and the iron's nightDarken (a look of the lamp body, not a keyed value).
 *      Anything else that reads the sun fails, naming the line.
 * Usage: node checks/claims-a-keyed-lamp-is-its-keys.mjs [--mutants]
 */
import { sourceOf } from './_importSource.mjs'

const ALLOWED = [
  /^const sunAltUniform = useRef\(\{ value: 0\.5 \}\)$/,
  /^const getLightingPhase = useTimeOfDay\(s => s\.getLightingPhase\)$/,
  /^shader\.uniforms\.uSunAltitude = sunAltUniform\.current$/,
  /^uniform float uSunAltitude;$/,
  /^float nightDarken = mix\(0\.15, 1\.0, smoothstep\(-0\.1, 0\.1, uSunAltitude\)\);$/,
  /^const \{ sunAltitude \} = getLightingPhase\(\)$/,
  /^sunAltUniform\.current\.value = sunAltitude$/,
]
const KEYED = [
  ['the Bulb', /^\s*const bulb = Math\.max\(0, lant\.intensity \?\? 0\)\s*$/m],
  ['the Glow', /^\s*const glow = Math\.max\(0, lant\.glow \?\? 0\)\s*$/m],
  ['the pools', /^\s*_lampGlow\.poolUniform\.value  = Math\.max\(0, _lampGlow\.share\.pool\)\s*$/m],
  ['the trees', /^\s*_lampGlow\.treesUniform\.value = Math\.max\(0, _lampGlow\.share\.trees\)\s*$/m],
]
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/(^|[^:])\/\/.*$/, '$1'))

function verdict(mutate) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  const src = mutate ? mutate(sourceOf('src/components/StreetLights.jsx')) : sourceOf('src/components/StreetLights.jsx')
  const joined = strip(src).join('\n')
  for (const [what, re] of KEYED) F(re.test(joined), `${what} is not exactly its keys`)
  const sunLines = strip(src).map(l => l.trim()).filter(l => /sunAltitude|uSunAltitude|getLightingPhase|sunAltUniform/.test(l))
  for (const l of sunLines) F(ALLOWED.some(re => re.test(l)), `the sun is read outside its allowed sites: ${l}`)
  F(sunLines.length >= ALLOWED.length, `only ${sunLines.length} sun references found: the inventory reads nothing`)
  return fails
}

const fails = verdict()
if (fails.length) { console.log('⛔ a keyed lamp is not its keys:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ a keyed lamp is exactly its keys: Bulb, Glow, pools and trees; the sun read only at its allowed sites')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['the ramp restored on the Bulb', (s) => s.replace('    const bulb = Math.max(0, lant.intensity ?? 0)', '    const t = Math.min(1, Math.max(0, (0.15 - sunAltitude) / 0.45))\n    const bulb = t * Math.max(0, lant.intensity ?? 0)')],
    ['the ramp restored on the pools', (s) => s.replace('    _lampGlow.poolUniform.value  = Math.max(0, _lampGlow.share.pool)', '    _lampGlow.poolUniform.value  = Math.max(0, _lampGlow.share.pool) * Math.max(0, -sunAltitude)')],
    ['a `let` ramp as a trailing factor (Zob 1)', (s) => s.replace('    const bulb = Math.max(0, lant.intensity ?? 0)', '    let t = Math.min(1, Math.max(0, (0.15 - sunAltitude) / 0.45))\n    const bulb = Math.max(0, lant.intensity ?? 0) * t')],
    ['a module-level helper reading the sun (Zob 2)', (s) => s.replace('    const glow = Math.max(0, lant.glow ?? 0)', '    const glow = Math.max(0, lant.glow ?? 0) * dayFade()').replace('function StreetLights(', 'const dayFade = () => Math.max(0, -useTimeOfDay.getState().getLightingPhase().sunAltitude)\nfunction StreetLights(')],
    ['a ramp on the uniform write (Zob 3)', (s) => s.replace('bulbOnUniform.current.value = Math.min(1, bulb)', 'bulbOnUniform.current.value = Math.min(1, bulb) * Math.max(0, -sunAltitude)')],
    ['a ramp in the shader (Zob 4)', (s) => s.replace('float nightDarken = mix(0.15, 1.0, smoothstep(-0.1, 0.1, uSunAltitude));', 'float nightDarken = mix(0.15, 1.0, smoothstep(-0.1, 0.1, uSunAltitude));\n          float glassVisible = clamp(uBulbOn, 0.0, 1.0) * smoothstep(0.15, -0.3, uSunAltitude);')],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
