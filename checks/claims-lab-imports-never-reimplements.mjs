// claims-lab-imports-never-reimplements.mjs — IS THE SURFACE LAB STILL THE MAP'S ENVIRONMENT?
//
// ⭐ THE INVARIANT (`docs/briefs/BRIEF-surface-lab.md §1`): the lab IMPORTS the
// production lighting, sky, weather, ground and materials — it never defines its
// own. A lab with its own light or its own shader is a second pipeline: a surface
// tuned there looks right in the lab and wrong on the map, and nothing says so.
// ⛔ That is exactly what the boulder harness grew: its own hemisphere + directional
// rig, its own bank and water materials. Measured 2026-09-24 (Marram).
//
// TWO HALVES, both read off the lab's own source (comments stripped first, so a
// comment naming a light does not trip it):
//   ① ABSENCE — no file under src/harness/lab/ defines a light, a shader or a
//      material: JSX light/material elements, `new THREE.*Light|*Material(`,
//      ShaderMaterial, onBeforeCompile, or GLSL.
//   ② PRESENCE — the lab mounts the production environment, by import: the ground
//      (BakedGround), the sun/sky rig (CelestialBodies), the weather (WeatherEffects
//      + the directive driver), the lamp pool (LampGlowDriver), and the map's own
//      boulders (SlabRevetment) — so "boulders lab vs map identical" holds BY
//      CONSTRUCTION: the lab draws them with the very component the map draws them with.
//
// ▶ MUTATION-TEST IT (a passing check proves nothing until seen to fail):
//     · add `<ambientLight intensity={1} />` inside the lab's <Canvas>   → ① RED
//     · add `onBeforeCompile` to any object in src/harness/lab/           → ① RED
//     · delete the `import BakedGround …` line from main.jsx               → ② RED
//   Put each back.
//
//   node checks/claims-lab-imports-never-reimplements.mjs
// Read-only. Exits 1 when the lab has grown its own environment or lost the real one.
import fs from 'fs'
import path from 'path'

const DIR = 'src/harness/lab'
if (!fs.existsSync(DIR)) { console.error(`⛔ ${DIR} does not exist — the lab this check guards is gone.`); process.exit(1) }

const files = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(jsx?|mjs|glsl|frag|vert)$/.test(e.name)) files.push(p)
  }
})(DIR)

// Strip // and /* */ comments without eating URLs inside strings well enough for a
// source this size: block comments first, then line comments not preceded by ':'.
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')

const FORBIDDEN = [
  [/<(ambient|directional|hemisphere|point|spot|rectArea)Light\b/, 'a JSX light element'],
  [/new\s+THREE\.\w*Light\s*\(/, 'a THREE light constructor'],
  [/<\w*Material\b/, 'a JSX material element'],
  [/new\s+THREE\.\w*Material\s*\(/, 'a THREE material constructor'],
  [/\b(Raw)?ShaderMaterial\b/, 'a ShaderMaterial'],
  [/\bonBeforeCompile\b/, 'a shader patch (onBeforeCompile)'],
  [/gl_FragColor|gl_Position|#include\s*</, 'GLSL source'],
  [/['"][^'"]+\.(glsl|frag|vert)(\?raw)?['"]/, 'a shader file import'],
]

let red = 0
console.log(`① ABSENCE — ${files.length} file(s) under ${DIR}/`)
for (const f of files) {
  const src = strip(fs.readFileSync(f, 'utf8'))
  const lines = src.split('\n')
  for (const [re, what] of FORBIDDEN) {
    lines.forEach((l, i) => {
      if (re.test(l)) { red++; console.log(`   ⛔ ${f}:${i + 1} defines ${what}: ${l.trim().slice(0, 100)}`) }
    })
  }
}
if (!red) console.log('   ✅ no light, shader or material of the lab\'s own')

// ② PRESENCE — read the imports, not a restated list of what they should be.
const REQUIRED = {
  BakedGround: 'components/BakedGround',
  CelestialBodies: 'components/CelestialBodies',
  WeatherEffects: 'components/WeatherEffects',
  AtmosphereDirectiveDriver: 'components/AtmosphereDirectiveDriver',
  LampGlowDriver: 'components/PostProcessing',
  SlabRevetment: 'components/SlabRevetment',
}
const all = files.map(f => strip(fs.readFileSync(f, 'utf8'))).join('\n')
console.log('② PRESENCE — the production environment, imported AND mounted')
for (const [name, from] of Object.entries(REQUIRED)) {
  const imported = new RegExp(`import[^;]*\\b${name}\\b[^;]*from\\s*['"][./]*(src/)?${from.replace('/', '\\/')}`).test(all)
  const mounted = new RegExp(`<${name}\\b`).test(all)
  if (imported && mounted) console.log(`   ✅ ${name}`)
  else { red++; console.log(`   ⛔ ${name}: ${imported ? 'imported but never MOUNTED' : `not imported from ${from}`}`) }
}

console.log(red ? `\n⛔ FAIL — ${red} finding(s). The lab is no longer the map's environment.` : '\n✅ PASS')
process.exit(red ? 1 : 0)
