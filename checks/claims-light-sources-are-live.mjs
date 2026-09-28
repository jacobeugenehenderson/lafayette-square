#!/usr/bin/env node
// CLAIM — EVERY CONTROL ON STAGE'S LIGHT SOURCES CARD REACHES A LIVE UNIFORM, IN EVERY TOWN'S STAGE AND IN PRODUCTION.
//
// Jacob, 2026-09-26, on Provincetown: "none of these controls do anything." The Lantern was wired to the live
// store in LAFAYETTE SQUARE's Stage only; every poured town mounted the lamps without it and read the value frozen
// in scene.json — so Brightness and Glow moved a slider and nothing else. Layer 0's LS-shaped hole, in the UI.
//   ① Stage draws the lamps through <Town>, which passes the live lantern; any lamp CartographApp mounts itself must too
//   ② each control moves its own thing: every Lantern/Lamp Glow field drives ≥1 target in StreetLights,
//      and no target is driven by two fields (self-mutated: a master multiplier on the pools must go red)
//   ③ every LAMPGLOW field is written as a share by BOTH the Stage pump and the production driver
//   ④ those uniforms have shader readers (pool → groundLamp.js + building walls · trees → treeAtlasMaterial.js)
//   ⑤ the walls' GLSL falloff equals lampPool.js's JS falloff, evaluated — one model, two languages
//   ⑦ NEON: every Stage environment that draws buildings also mounts neon (SceneNeon, directly or via
//      LafayetteScene) and passes it the Neon on + Density test controls (Loupe's audit: poured towns had none)
//   ⑩ every depth-tested custom lamp shader (StreetLights ShaderMaterials) carries the logdepthbuf chunks —
//      Stage renders log depth, and without them the Glow was hidden by everything (self-mutated)
//   ⑥ Pool radius is MONOTONIC and 0 = OFF: through the real GLSL wipe, a lone pool's lit reach (ground and
//      canopy) starts at 0, never shrinks as the knob rises, and is the full reach at 1 (self-mutated)
// ⭐ The field lists are READ from skyLightChannels.js, never restated, so a new control is covered the day it lands.
// ⭐ SELF-MUTATION, every run: ① is re-run on a copy of CartographApp with a lamp mount lacking the live lantern, and must go red.
//
//   node checks/claims-light-sources-are-live.mjs
import { readFileSync } from 'node:fs'
import { LANTERN_FIELD_KEYS, LAMPGLOW_FIELDS } from '../src/cartograph/skyLightChannels.js'
import { lampFalloff, LAMP_FALLOFF_GLSL, LAMP_WIPE_GLSL, groundPool, canopyWipe, POOL_SHAPE_GLSL, poolDisc, poolCentre } from '../src/lib/lampPool.js'

let red = 0
const bad = (m) => { red++; console.log(`   ⛔ ${m}`) }
const ok = (m) => console.log(`   ✅ ${m}`)
const src = (p) => readFileSync(p, 'utf-8').replace(/\/\/.*$/gm, '')
const app = src('src/cartograph/CartographApp.jsx')
const lights = src('src/components/StreetLights.jsx')
const driver = src('src/components/PostProcessing.jsx')
// ⭐ Every town draws in Stage through <Town> (src/components/Town.jsx), which takes
// Stage's live channels as ONE object: `overrides`, built by CartographApp's useStageOverrides. A Town prop
// `x={o.key}` is live in Stage exactly when that hook supplies `key` — read from its source, never listed.
const town = src('src/components/Town.jsx')
const stageKeys = (() => {
  const list = app.match(/const STAGE_CHANNELS = \[([\s\S]*?)\]/)
  const extra = app.match(/return useMemo\(\(\) => \(\{ \.\.\.channels, ([^}]*)\}\)/)
  return new Set([...(list ? [...list[1].matchAll(/'(\w+)'/g)].map(m => m[1]) : []), ...(extra ? extra[1].split(',').map(x => x.split(':')[0].trim()).filter(Boolean) : [])])
})()
const stageMountsTown = /<Town\b[^>]*overrides=\{townOverrides\}/.test(app) && /const townOverrides = useStageOverrides\(\)/.test(app)

/** Stage mounts of the lamps that do NOT pass the live lantern. */
function deadMounts(text) {
  const tags = [...text.matchAll(/<(BakedLamps|StreetLights)\b[^>]*>/g)].map(m => m[0])
  return { tags, dead: tags.filter(t => !/lanternOverride=\{|lantern=\{/.test(t)) }
}

console.log('① EVERY STAGE MOUNT OF THE LAMPS PASSES THE LIVE LANTERN')
{
  const { tags, dead } = deadMounts(app)
  if (!tags.length) stageMountsTown ? ok('Stage mounts no lamps of its own — every town\'s lamps come through <Town>') : bad('Stage mounts neither <Town> nor lamps — the check cannot see the Stage')
  else if (dead.length) for (const t of dead) bad(`reads the BAKED lantern in Stage: ${t}`)
  else ok(`${tags.length} mounts of its own, all live`)
  // Self-mutation: a lamp mounted in Stage without the live lantern → ① must go red.
  deadMounts(app + '\n<StreetLights lookId={activeLookId} />').dead.length ? ok('mutation (a lamp mount without the live lantern) is caught') : bad('mutation NOT caught — ① is blind')
  // <Town>, as Stage mounts it: its lamps take the live lantern from `overrides`, and Stage supplies it.
  const townLive = (t) => stageMountsTown && stageKeys.has('lantern') && /<BakedLamps\b[^>]*lanternOverride=\{o\.lantern\}/.test(t)
  townLive(town) ? ok('Stage via <Town>: the lamps take the live lantern') : bad('Stage via <Town>: the lamps read the BAKED lantern')
  !townLive(town.replace(/lanternOverride=\{o\.lantern\}/, '')) ? ok('mutation (Town\'s live lantern removed) is caught') : bad('mutation NOT caught — ① is blind to <Town>')
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
  // Colours are written with .set(…) (a THREE.Color), not assigned.
  for (const m of frame.matchAll(/([\w.?\[\]]+?\.(?:value|emissive))\.set\(([^\n]+)\)/g)) {
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
  const NOT_LIGHT = new Set(['lampGlow.radius', 'lampGlow.centre', 'lantern.glowSize'])
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
// ONE driver writes the shares (LampGlowDriver); Stage reaches it with its live channel on both of its
// route — <Town>, whose LampGlowDriver takes lampGlowOverride={o.lampGlow}.
for (const { key } of LAMPGLOW_FIELDS) {
  const w = new RegExp(`share\\.${key}\\s*=\\s*triple\\.${key}\\b`)
  w.test(driver) ? ok(`${key}: the one driver (LampGlowDriver) writes it`) : bad(`${key}: the driver (LampGlowDriver) never writes share.${key}`)
  w.test(app) ? bad(`${key}: CartographApp writes share.${key} itself — a second copy of the driver`) : null
}
;(/<LampGlowDriver\b[^>]*lampGlowOverride=\{o\.lampGlow\}/.test(town) && stageKeys.has('lampGlow') && stageMountsTown)
  ? ok('Stage (every town on <Town>) drives it with the live Lamp Glow') : bad('Stage\'s <Town> route does not carry the live Lamp Glow to LampGlowDriver')
;/<LampGlowDriver\b/.test(app) ? bad('Stage mounts a LampGlowDriver of its own beside <Town>\'s — a second driver') : ok('Stage mounts no second LampGlowDriver')

console.log('④ THE UNIFORMS HAVE SHADER READERS')
for (const [u, file] of [['poolUniform', 'src/lib/groundLamp.js'], ['poolUniform', 'src/components/SlabBuildings.jsx'], ['treesUniform', 'src/components/treeAtlasMaterial.js'],
                          ['poolRadiusUniform', 'src/lib/groundLamp.js'], ['poolCentreUniform', 'src/lib/groundLamp.js'], ['canopyWipeUniform', 'src/components/SlabBuildings.jsx'], ['canopyWipeUniform', 'src/components/treeAtlasMaterial.js']])
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
  // Ground: the circle's reach IS the knob (POOL_SHAPE_GLSL, evaluated as GLSL below) — lit out to k × reach.
  const disc = new Function('smoothstep', `${POOL_SHAPE_GLSL.replace(/float (poolDisc|poolCentre)\(float d, float (R|c)\)/g, 'function $1(d, $2)')}; return poolDisc`)(smoothstep)
  const groundXs = Array.from({ length: 41 }, (_, i) => { const k = i / 40; let r = 0; for (let j = 0; j <= 1000; j++) if (disc(j / 1000, k) > 1e-6) r = j / 1000; return r })
  judge(groundXs) ? ok(`ground: 0 → ${groundXs[1].toFixed(2)} … ${groundXs[20].toFixed(2)} … 1 — never shrinks (the circle is the knob)`) : bad(`ground reach across the knob: ${groundXs.map(x => x.toFixed(2)).join(' ')}`)
  const cx = sweep(canopyWipe, lampFalloff)
  judge(cx) ? ok(`canopy + walls: 0 → ${cx[1].toFixed(2)} … ${cx[20].toFixed(2)} … 1 — never shrinks`) : bad(`canopy reach across the knob: ${cx.map(x => x.toFixed(2)).join(' ')}`)
  // GLSL ↔ JS parity of the pool shape (one model, two languages).
  const centreG = new Function('smoothstep', 'mix', `${POOL_SHAPE_GLSL.replace(/float (poolDisc|poolCentre)\(float d, float (R|c)\)/g, 'function $1(d, $2)')}; return poolCentre`)(smoothstep, (a, b, t) => a + (b - a) * t)
  let worst = 0; for (let i = 0; i <= 400; i++) { const d = i / 100; worst = Math.max(worst, Math.abs(disc(d, 3) - poolDisc(d, 3)), Math.abs(centreG(d, 1.2) - poolCentre(d, 1.2))) }
  worst < 1e-9 ? ok('pool shape GLSL == JS (disc + centre)') : bad(`pool shape GLSL and JS differ by ${worst}`)
  poolCentre(0, 1.2) < 0.1 && poolCentre(1.5, 1.2) > 0.99 ? ok(`the centre is pronounced: ${poolCentre(0, 1.2).toFixed(2)} of the light inside, full by ${(1.2 * 1.1).toFixed(2)} m`) : bad('the centre is not dark/crisp')
  // Self-mutation: the first, broken threshold (the pool's own profile, dark at its centre).
  judge(sweep(r => (r >= 1 ? 0 : groundPool(Math.max(0, r))), groundPool)) ? bad('mutation NOT caught — ⑥ is blind') : ok('mutation (threshold = the pool profile itself) is caught')
}

console.log('⑦ NEON IS MOUNTED IN EVERY STAGE THAT DRAWS BUILDINGS, WITH ITS TEST CONTROLS')
{
  const envs = app.split(/StageEnvironment:/).slice(1)
  let n = 0
  const judge = (blocks) => blocks.map(b => {
    if (!/<SlabBuildings|<LafayetteScene/.test(b)) return null
    const neon = b.match(/<SceneNeon\b[^>]*>|<LafayetteScene\b[\s\S]*?\/>/)
    if (!neon) return 'draws buildings and mounts no neon'
    if (!/forceNeonOn=\{forceNeonOn\}/.test(neon[0]) || !/density=\{neonDensity\}|neonDensity=\{neonDensity\}/.test(neon[0])) return 'mounts neon without the Neon on / Density test controls'
    if (!/materialColors(Override)?=\{materialColorsOverride\}/.test(neon[0])) return 'mounts neon without the live neon colours (Surfaces › Neon)'
    return 'ok'
  }).filter(Boolean)
  for (const r of judge(envs)) { n++; r === 'ok' ? ok(`Stage environment ${n}: neon mounted with its test controls`) : bad(`Stage environment ${n}: ${r}`) }
  // <Town>, as Stage mounts it: its neon must take the three test controls from `overrides`, and Stage must supply them.
  const judgeTown = (t) => {
    if (!stageMountsTown) return 'Stage mounts no <Town> with its live overrides'
    const neon = t.match(/<LafayetteScene\b[\s\S]*?\/>/)
    if (!neon) return 'draws buildings and mounts no neon'
    const need = [['forceNeonOn', 'neonForceOn'], ['neonDensity', 'neonDensity'], ['materialColorsOverride', 'materialColors']]
    const miss = need.filter(([prop, key]) => !new RegExp(`${prop}=\\{o\\.${key}\\}`).test(neon[0]) || !stageKeys.has(key))
    return miss.length ? `mounts neon without ${miss.map(m => m[1]).join(', ')} from Stage` : 'ok'
  }
  n++
  const t = judgeTown(town)
  t === 'ok' ? ok(`Stage via <Town> (every town on it): neon mounted with its test controls`) : bad(`Stage via <Town>: ${t}`)
  judgeTown(town.replace(/<LafayetteScene\b[\s\S]*?\/>/, '')) !== 'ok' ? ok('mutation (Town\'s neon mount removed) is caught') : bad('mutation NOT caught')
}

console.log('⑧ EVERY NEON SWATCH COLOURS THE NEON (it existed for months and drove nothing)')
{
  const surf = src('src/cartograph/CartographSurfaces.jsx'), bands = src('src/components/NeonBands.jsx')
  const ids = [...surf.matchAll(/id: '(neon_\w+)'/g)].map(m => m[1])
  const reads = /materialColors\?\.\[`neon_\$\{key\}`\]/.test(bands)
  if (!ids.length) bad('found no Neon swatches on the Surfaces card')
  else reads ? ok(`${ids.length} swatches (${ids.join(', ')}) → NeonBands reads materialColors.neon_<category>`) : bad('NeonBands does not read materialColors.neon_<category> — the swatches drive nothing')
  ;/CATEGORY_HEX\[k\]/.test(surf) ? ok('swatch defaults come from the renderer\'s own CATEGORY_HEX (one table)') : bad('the Surfaces neon defaults are a second copy of CATEGORY_HEX')
}

console.log('⑨ THE LAMP COLOUR IS A KEYED FIELD OF THE LANTERN, AND LIVE IN EVERY STAGE')
{
  const chans = src('src/cartograph/skyLightChannels.js'), lights = src('src/components/StreetLights.jsx'), surf = src('src/cartograph/CartographSurfaces.jsx')
  ;/LANTERN_FIELDS = \[[\s\S]*?key: 'color'[\s\S]*?\]/.test(chans) ? ok('Light Sources › Lantern › Colour is a keyed field') : bad('the lantern channel has no Colour field')
  ;/lant\.color/.test(lights) ? ok('StreetLights colours every lamp light from the resolved lantern colour') : bad('StreetLights does not read the lantern colour')
  // ⛔ The retired flat swatch must not come back beside it: two colours for one light, one of them dead.
  const stale = ['src/stage/StageApp.jsx', 'src/components/StreetLights.jsx', 'src/components/BakedLamps.jsx', 'src/cartograph/CartographApp.jsx']
    .filter(f => /layerColors\??\.lamp|lampColorOverride/.test(src(f)))
  stale.length ? bad(`the retired layerColors.lamp swatch is still read in ${stale.join(', ')}`) : ok('no second lamp colour (layerColors.lamp) is read anywhere')
  ;/id: 'lamp',[^\n]*noColor: true/.test(surf) ? ok('Designer › Furniture › Lamps is On/Off only (no second colour picker)') : bad('the Designer Lamps item is missing, or carries a colour picker again')
}

console.log('⑨b THE LAMPS SWITCH (Furniture › Lamps) IS LIVE IN STAGE — never read from the last bake')
{
  const live = /const effectiveLayerVis = inDesigner \? layerVis : \{ \.\.\.\(bakedLayerVis \|\| \{\}\), lamp: layerVis\?\.lamp \}/.test(app)
  const baked = src('src/components/BakedLamps.jsx')
  live ? ok('Stage shots take lamp visibility from the live store') : bad('Stage shots read lamp visibility from the bake — turning lamps on does nothing until a bake')
  ;/lampsOnOverride \?\? scene\?\.layerVis\?\.lamp/.test(baked) ? ok('BakedLamps takes the live switch when Stage passes it') : bad('BakedLamps gates on the baked layerVis only')
}

console.log('⑩ LAMP SHADERS SPEAK LOG DEPTH (Stage/Preview use logarithmicDepthBuffer)')
{
  const judge = (text) => [...text.matchAll(/new THREE\.ShaderMaterial\(\{([\s\S]*?)\n\s{4}\}\)/g)].map(m => m[1])
    .filter(b => !/depthTest:\s*false/.test(b))
    .map(b => /logdepthbuf_pars_vertex/.test(b) && /logdepthbuf_vertex>/.test(b) && /logdepthbuf_pars_fragment/.test(b) && /logdepthbuf_fragment>/.test(b))
  const r = judge(lights)
  if (!r.length) bad('found no ShaderMaterial in StreetLights — ⑩ cannot see the lamp shaders')
  else r.every(Boolean) ? ok(`${r.length} depth-tested lamp shaders carry the log-depth chunks`) : bad(`${r.filter(x => !x).length}/${r.length} lamp shaders lack the log-depth chunks — they will be hidden in Stage`)
  judge(lights.replace(/#include <logdepthbuf_vertex>/, '')).every(Boolean) ? bad('mutation NOT caught') : ok('mutation (one logdepthbuf_vertex removed) is caught')
}

console.log('⑪ EVERY BAKED POOL MAP IS A NEAREST-LAMP DISTANCE MAP (the shape is drawn live from it)')
{
  const { readdirSync, existsSync } = await import('node:fs')
  for (const look of readdirSync('public/baked')) {
    const g = `public/baked/${look}/ground.json`
    if (!existsSync(g)) continue
    const pm = JSON.parse(readFileSync(g, 'utf-8')).poolmap
    if (!pm) { console.log(`   · ${look}: no poolmap (no lamps and no trees)`); continue }
    pm.encoding === 'lamp-distance' && pm.scale > 0 ? ok(`${look}: lamp-distance, reach ${pm.scale} m`) : bad(`${look}: poolmap is the old summed map (encoding ${pm.encoding ?? 'none'}) — re-bake its ground AO`)
  }
}

console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ all claims hold')
process.exit(red ? 1 : 0)
