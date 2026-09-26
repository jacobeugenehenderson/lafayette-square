#!/usr/bin/env node
// CLAIM — EVERY CONTROL ON STAGE'S LIGHT SOURCES CARD REACHES A LIVE UNIFORM, IN EVERY TOWN'S STAGE AND IN PRODUCTION.
//
// Jacob, 2026-09-26, on Provincetown: "none of these controls do anything." The Lantern was wired to the live
// store in LAFAYETTE SQUARE's Stage only; every poured town mounted the lamps without it and read the value frozen
// in scene.json — so Brightness and Glow moved a slider and nothing else. Layer 0's LS-shaped hole, in the UI.
//   ① every Stage mount of the lamps (<BakedLamps>, <StreetLights>) in CartographApp passes the live lantern
//   ② every LANTERN field is read by StreetLights (`lant.<key>`)
//   ③ every LAMPGLOW field is written as a share by BOTH the Stage pump and the production driver, and
//      StreetLights turns it into a uniform (`share.<key>` × the lamp's output)
//   ④ those uniforms have shader readers (pool → groundLamp.js + building walls · trees → treeAtlasMaterial.js)
//   ⑤ the walls' GLSL falloff equals lampPool.js's JS falloff, evaluated — one model, two languages
// ⭐ The field lists are READ from skyLightChannels.js, never restated, so a new control is covered the day it lands.
// ⭐ SELF-MUTATION, every run: ① is re-run on a copy of CartographApp with one live lantern removed, and must go red.
//
//   node checks/claims-light-sources-are-live.mjs
import { readFileSync } from 'node:fs'
import { LANTERN_FIELD_KEYS, LAMPGLOW_FIELDS } from '../src/cartograph/skyLightChannels.js'
import { lampFalloff, LAMP_FALLOFF_GLSL } from '../src/lib/lampPool.js'

let red = 0
const bad = (m) => { red++; console.log(`   ⛔ ${m}`) }
const ok = (m) => console.log(`   ✅ ${m}`)
const src = (p) => readFileSync(p, 'utf-8').replace(/\/\/.*$/gm, '')
const app = src('src/cartograph/CartographApp.jsx')
const lights = src('src/components/StreetLights.jsx')
const driver = src('src/components/PostProcessing.jsx')

/** Stage mounts of the lamps that do NOT pass the live lantern. */
function deadMounts(text) {
  const tags = [...text.matchAll(/<(BakedLamps|StreetLights)\b[^>]*>/g)].map(m => m[0])
  return { tags, dead: tags.filter(t => !/lanternOverride=\{|lantern=\{/.test(t)) }
}

console.log('① EVERY STAGE MOUNT OF THE LAMPS PASSES THE LIVE LANTERN')
{
  const { tags, dead } = deadMounts(app)
  if (!tags.length) bad('found no lamp mounts in CartographApp — the check cannot see the Stage')
  else if (dead.length) for (const t of dead) bad(`reads the BAKED lantern in Stage: ${t}`)
  else ok(`${tags.length} mounts, all live`)
  // Self-mutation: drop one live lantern → ① must go red.
  const mutated = app.replace(/ lanternOverride=\{lanternOverride\}/, '')
  deadMounts(mutated).dead.length ? ok('mutation (one live lantern removed) is caught') : bad('mutation NOT caught — ① is blind')
}

console.log('② EVERY LANTERN FIELD IS READ BY THE LAMPS')
for (const k of LANTERN_FIELD_KEYS) new RegExp(`lant\\.${k}\\b`).test(lights) ? ok(`lantern.${k}`) : bad(`lantern.${k} — no \`lant.${k}\` in StreetLights`)

console.log('③ EVERY LAMP GLOW FIELD IS WRITTEN IN STAGE + PRODUCTION AND BECOMES A UNIFORM')
for (const { key } of LAMPGLOW_FIELDS) {
  const w = new RegExp(`share\\.${key}\\s*=\\s*triple\\.${key}\\b`)
  w.test(app) ? ok(`${key}: Stage pump writes it`) : bad(`${key}: the Stage pump (CartographApp LampGlowPump) never writes share.${key}`)
  w.test(driver) ? ok(`${key}: production driver writes it`) : bad(`${key}: the production driver (LampGlowDriver) never writes share.${key}`)
  new RegExp(`Uniform\\.value\\s*=\\s*lampLit\\s*\\*\\s*_lampGlow\\.share\\.${key}\\b`).test(lights)
    ? ok(`${key}: StreetLights applies it to the lamp's output`) : bad(`${key}: StreetLights never multiplies the lamp output by share.${key}`)
}

console.log('④ THE UNIFORMS HAVE SHADER READERS')
for (const [u, file] of [['poolUniform', 'src/lib/groundLamp.js'], ['poolUniform', 'src/components/SlabBuildings.jsx'], ['treesUniform', 'src/components/treeAtlasMaterial.js']])
  src(file).includes(`_lampGlow.${u}`) ? ok(`${u} → ${file}`) : bad(`${u} has no reader in ${file}`)

console.log('⑤ THE WALLS\' GLSL FALLOFF IS THE JS FALLOFF')
{
  // Evaluate the GLSL body as JS: same operators, only the builtins differ.
  const body = LAMP_FALLOFF_GLSL.replace(/float lampFalloff\(float rn\)/, 'function glsl(rn)').replace(/\bfloat\b/g, 'let')
  const glsl = new Function('exp', 'clamp', `${body}; return glsl`)(Math.exp, (x, a, b) => Math.min(b, Math.max(a, x)))
  let worst = 0
  for (let i = 0; i <= 1000; i++) { const rn = i / 1000; worst = Math.max(worst, Math.abs(glsl(rn) - lampFalloff(rn))) }
  worst < 1e-12 ? ok(`identical over rn ∈ [0,1] (max |Δ| ${worst.toExponential(1)})`) : bad(`GLSL and JS falloff differ by up to ${worst.toFixed(4)}`)
}

console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ all claims hold')
process.exit(red ? 1 : 0)
