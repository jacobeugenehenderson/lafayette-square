#!/usr/bin/env node
// claims-an-inland-town-asks-no-water-level.mjs — DOES A TOWN WITH NO COAST STAY SILENT ABOUT WATER LEVELS, WHILE A COAST TOWN
// WITH NO LEVELS STILL SAYS SO?
//
// ⭐ LS's console (2026-10-28): SlabRevetment asked cartograph/waterLevel.mjs#waterLevels for an INLAND town and logged "the town has
// no chosen level" — a refusal for a town that has no water. The terrain declares what it is zeroed on (bake-terrain.js `datum`:
// 'water' for a coast town, 'local minimum' inland), so the revetment asks waterLevel.mjs#waterLevelsIfWet:
//   ① a planted inland terrain (datum 'local minimum', no water record) → null, no throw (nothing said);
//   ② a planted WATER-datum terrain with no water record → throws (a stale coast terrain is still said, never a quiet dry band);
//   ③ every baked terrain on disk (public/baked/<scene>/terrain.json): inland → null; water → its levels (or a named refusal);
//   ④ SlabRevetment.jsx asks waterLevelsIfWet with the terrain's datum (read from the source).
// ⭐ MUTANT (--mutants): the datum gate removed → ① throws → RED.
//   node checks/claims-an-inland-town-asks-no-water-level.mjs [--mutants]
// Read-only. Exits 1 on any claim false or a mutant not seen.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { importSource } from './_importSource.mjs'
const MUTANTS = process.argv.includes('--mutants')
const wl = (tag, transform) => importSource('cartograph/waterLevel.mjs', { suffix: `// ${tag}`, transform })
const throws = (f) => { try { f(); return null } catch (e) { return e.message } }
const SRC = readFileSync(join(ROOT, 'src/components/SlabRevetment.jsx'), 'utf8')
const baked = existsSync(join(ROOT, 'public/baked')) ? readdirSync(join(ROOT, 'public/baked')).filter(t => existsSync(join(ROOT, 'public/baked', t, 'terrain.json'))) : []

function claims({ waterLevelsIfWet }, src) {
  const out = []
  let v; const e1 = throws(() => { v = waterLevelsIfWet({ datum: 'local minimum', water: null }) })
  if (e1 || v !== null) out.push(`① an inland terrain asks for a water level (${e1 || JSON.stringify(v)})`)
  if (!throws(() => waterLevelsIfWet({ datum: 'water', water: null }))) out.push('② a water-datum terrain with no levels is not said')
  for (const t of baked) { const T = JSON.parse(readFileSync(join(ROOT, 'public/baked', t, 'terrain.json'), 'utf8'))
    if (T.datum !== 'water') { const e = throws(() => waterLevelsIfWet({ datum: T.datum, water: T.water })); if (e) out.push(`③ ${t} (datum ${T.datum}) is asked for a level: ${e}`) } }
  if (!/waterLevelsIfWet\(\{\s*datum:\s*terrainDatum\(\),\s*water:\s*terrainWater\(\)\s*\}\)/.test(src)) out.push('④ SlabRevetment does not ask waterLevelsIfWet with the terrain\'s datum')
  return out
}
let bad = 0
const real = claims(await wl('real'), SRC)
for (const r of real) console.log(`⛔ ${r}`)
if (real.length) bad++
else console.log(`✅ an inland terrain asks no level; a water terrain with none is said; ${baked.length} baked terrain(s) on disk agree; SlabRevetment asks by datum`)
if (MUTANTS) { const got = claims(await wl('no-gate', (t) => { const f = "  if (datum !== 'water') return null\n"; if (!t.includes(f)) throw new Error('[mutant] the gate is gone — re-aim it'); return t.replace(f, '') }), SRC), red = got.length > real.length
  if (!red) bad++
  console.log(`   mutant · the datum gate removed: ${red ? `RED, as it must be (${got[0]})` : '⛔ still clean — the check cannot see it'}`) }
console.log(bad ? '\n⛔ RED — an inland town is asked for a water level, or a coast town with none is not said' : '\n✅ GREEN — water levels are asked of a coast town only')
process.exit(bad ? 1 : 0)
