#!/usr/bin/env node
// CLAIM — EVERY CONTROL ON STAGE'S LIGHT SOURCES CARD REACHES A LIVE UNIFORM, IN EVERY TOWN'S STAGE AND IN PRODUCTION.
//
// Jacob, 2026-09-26, on Provincetown: "none of these controls do anything." The Lantern was wired to the live
// store in LAFAYETTE SQUARE's Stage only; every poured town mounted the lamps without it and read the value frozen
// in scene.json — so Brightness and Glow moved a slider and nothing else. Layer 0's LS-shaped hole, in the UI.
//   ① every Stage mount of the lamps (<BakedLamps>, <StreetLights>) in CartographApp passes the live lantern
//   ② each control moves its own thing: every Lantern/Lamp Glow field drives ≥1 target in StreetLights,
//      and no target is driven by two fields (self-mutated: a master multiplier on the pools must go red)
//   ③ every LAMPGLOW field is written as a share by BOTH the Stage pump and the production driver
//   ④ those uniforms have shader readers (pool → groundLamp.js + building walls · trees → treeAtlasMaterial.js)
//   ⑤ the walls' GLSL falloff equals lampPool.js's JS falloff, evaluated — one model, two languages
//   ⑥ Pool radius is MONOTONIC and 0 = OFF: through the real GLSL wipe, a lone pool's lit reach (ground and
//      canopy) starts at 0, never shrinks as the knob rises, and is the full reach at 1 (self-mutated)
// ⭐ The field lists are READ from skyLightChannels.js, never restated, so a new control is covered the day it lands.
// ⭐ SELF-MUTATION, every run: ① is re-run on a copy of CartographApp with one live lantern removed, and must go red.
//
//   node checks/claims-light-sources-are-live.mjs
import { readFileSync } from 'node:fs'
import { LANTERN_FIELD_KEYS, LAMPGLOW_FIELDS } from '../src/cartograph/skyLightChannels.js'
import { lampFalloff, LAMP_FALLOFF_GLSL, LAMP_WIPE_GLSL, groundPool, poolWipe, canopyWipe } from '../src/lib/lampPool.js'

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

console.log('② EACH CONTROL MOVES ITS OWN THING — every field drives ≥1 target, no target is driven by two fields')
// Jacob, 2026-09-26: "They're redundant, but also don't refer to the correct things" — a master Brightness
// multiplied the pools, so two knobs moved one thing. Parse StreetLights' per-frame writes (following local
// consts such as `bulb`) and map field → targets.
const writes = (() => {
  const frame = lights.slice(lights.indexOf('useFrame('))
  const fieldsIn = (expr, vars) => {
    const f = new Set()
    for (const m of expr.matchAll(/lant\.(\w+)|share\.(\w+)/g)) f.add(m[1] ? `lantern.${m[1]}` : `lampGlow.${m[2]}`)
    for (const [v, vf] of vars) if (new RegExp(`\\b${v}\\b`).test(expr)) vf.forEach(x => f.add(x))
    return f
  }
  const vars = new Map()
  for (const m of frame.matchAll(/const (\w+) = ([^\n]+)/g)) { const f = fieldsIn(m[2], vars); if (f.size) vars.set(m[1], f) }
  const out = new Map()   // target → Set(fields)
  for (const m of frame.matchAll(/([\w.?\[\]]+?\.(?:value|opacity|emissiveIntensity))\s*=\s*([^\n]+)/g)) {
    const f = fieldsIn(m[2], vars)
    if (f.size) out.set(m[1].replace(/\?/g, ''), f)
  }
  return out
})()
{
  const all = [...LANTERN_FIELD_KEYS.map(k => `lantern.${k}`), ...LAMPGLOW_FIELDS.map(f => `lampGlow.${f.key}`)]
  for (const field of all) {
    const targets = [...writes].filter(([, f]) => f.has(field)).map(([t]) => t)
    targets.length ? ok(`${field} → ${targets.join(', ')}`) : bad(`${field} drives nothing in StreetLights`)
  }
  for (const [t, f] of writes) if (f.size > 1) bad(`${t} is driven by ${[...f].join(' AND ')} — two controls, one thing`)
  // ⭐ AT 0, EVERY LAMP LIGHT IS EXACTLY 0 (Jacob, 2026-09-26: "even turned all the way to 0 … some glows").
  // A light's write must be a pure product of its field (and t, clamps) — an additive term survives 0.
  // Radius (a wipe threshold) and Glow size (a size) are not light, so they are exempt.
  const NOT_LIGHT = new Set(['lampGlow.radius', 'lantern.glowSize'])
  const frameSrc = lights.slice(lights.indexOf('useFrame('))
  for (const m of frameSrc.matchAll(/([\w.?\[\]]+?\.(?:value|opacity|emissiveIntensity))\s*=\s*([^\n]+)/g)) {
    const f = writes.get(m[1].replace(/\?/g, ''))
    if (!f || [...f].every(x => NOT_LIGHT.has(x))) continue
    ;/[^e]\+|^\s*\+/.test(m[2].replace(/\/\/.*$/, '')) ? bad(`${m[1]} = ${m[2].trim()} — an additive term survives its slider at 0`) : null
  }
  ok('every lamp light is a pure product of its slider (0 ⇒ exactly 0)')
  // Self-mutation: a master multiplier on the pools must be caught.
  const m = new Map(writes); m.set('_lampGlow.poolUniform.value', new Set(['lampGlow.pool', 'lantern.intensity']))
  ;[...m].some(([, f]) => f.size > 1) ? ok('mutation (Bulb also scaling the pools) is caught') : bad('mutation NOT caught')
}

console.log('③ EVERY LAMP GLOW FIELD IS WRITTEN IN STAGE + PRODUCTION')
for (const { key } of LAMPGLOW_FIELDS) {
  const w = new RegExp(`share\\.${key}\\s*=\\s*triple\\.${key}\\b`)
  w.test(app) ? ok(`${key}: Stage pump writes it`) : bad(`${key}: the Stage pump (CartographApp LampGlowPump) never writes share.${key}`)
  w.test(driver) ? ok(`${key}: production driver writes it`) : bad(`${key}: the production driver (LampGlowDriver) never writes share.${key}`)
}

console.log('④ THE UNIFORMS HAVE SHADER READERS')
for (const [u, file] of [['poolUniform', 'src/lib/groundLamp.js'], ['poolUniform', 'src/components/SlabBuildings.jsx'], ['treesUniform', 'src/components/treeAtlasMaterial.js'],
                          ['poolWipeUniform', 'src/lib/groundLamp.js'], ['canopyWipeUniform', 'src/components/SlabBuildings.jsx'], ['canopyWipeUniform', 'src/components/treeAtlasMaterial.js']])
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

console.log('⑥ POOL RADIUS: MONOTONIC, 0 = OFF, 1 = FULL (through the real GLSL wipe)')
{
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
  const body = LAMP_WIPE_GLSL.replace(/float lampWipe\(float v, float th\)/, 'function lampWipe(v, th)')
  const lampWipe = new Function('smoothstep', `${body}; return lampWipe`)(smoothstep)
  const reach = (th, prof) => { let r = 0; for (let i = 0; i <= 1000; i++) if (lampWipe(prof(i / 1000), th) > 1e-6) r = i / 1000; return r }
  const sweep = (wipeFn, prof) => Array.from({ length: 41 }, (_, i) => reach(wipeFn(i / 40), prof))
  // Full reach = the last lit sample before the rim, where the profile is exactly 0 (so 0.999, not 1).
  const judge = (xs) => xs[0] === 0 && xs.at(-1) >= 0.99 && xs.every((x, i) => i === 0 || x >= xs[i - 1] - 1e-9)
  for (const [name, fn, prof] of [['ground', poolWipe, groundPool], ['canopy + walls', canopyWipe, lampFalloff]]) {
    const xs = sweep(fn, prof)
    judge(xs) ? ok(`${name}: 0 → ${xs[1].toFixed(2)} … ${xs[20].toFixed(2)} … 1 — never shrinks`) : bad(`${name}: reach across the knob is ${xs.map(x => x.toFixed(2)).join(' ')}`)
  }
  // Self-mutation: the first, broken threshold (the pool's own profile, dark at its centre).
  judge(sweep(r => (r >= 1 ? 0 : groundPool(Math.max(0, r))), groundPool)) ? bad('mutation NOT caught — ⑥ is blind') : ok('mutation (threshold = the pool profile itself) is caught')
}

console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ all claims hold')
process.exit(red ? 1 : 0)
