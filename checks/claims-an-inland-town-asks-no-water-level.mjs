#!/usr/bin/env node
// claims-an-inland-town-asks-no-water-level.mjs — DOES A TOWN WITH NO COAST STAY SILENT ABOUT WATER LEVELS, WHILE A COAST TOWN
// WITH NO LEVELS STILL SAYS SO?
//
// ⭐ LS's console (2026-10-28): SlabRevetment asked cartograph/waterLevel.mjs#waterLevels for an INLAND town and logged "the town has
// no chosen level" — a refusal for a town that has no water. The terrain declares what it is zeroed on (bake-terrain.js `datum`:
// 'water' for a coast town, 'local minimum' inland), so the revetment asks waterLevel.mjs#waterLevelsIfWet:
//   ① a planted inland terrain (datum 'local minimum', no water record) → null, no throw (nothing said);
//   ② a planted WATER-datum terrain with no water record → throws (a stale coast terrain is still said, never a quiet dry band);
//      and a planted terrain declaring NO datum → throws "carries no datum" (never read as inland);
//   ③ every baked terrain on disk (public/baked/<scene>/terrain.json): inland → null; water → its levels (or a named refusal);
//   ④ both readers, SlabRevetment.jsx and BakedGround.jsx (one rule, two readers: Boz, 2026-10-28), ask waterLevelsIfWet with the
//      terrain's datum, and neither asks waterLevels directly (read from the source).
// ⭐ MUTANTS (--mutants), each RED: the datum gate removed (① throws) · the no-datum refusal removed (a datum-less terrain read as
// inland) · BakedGround back on waterLevels(terrainWater()).
//   node checks/claims-an-inland-town-asks-no-water-level.mjs [--mutants]
// Read-only. Exits 1 on any claim false or a mutant not seen.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { importSource } from './_importSource.mjs'
const MUTANTS = process.argv.includes('--mutants')
const wl = (tag, transform) => importSource('cartograph/waterLevel.mjs', { suffix: `// ${tag}`, transform })
const throws = (f) => { try { f(); return null } catch (e) { return e.message } }
const READERS = ['src/components/SlabRevetment.jsx', 'src/components/BakedGround.jsx']
const SRC = Object.fromEntries(READERS.map(f => [f, readFileSync(join(ROOT, f), 'utf8')]))
const baked = existsSync(join(ROOT, 'public/baked')) ? readdirSync(join(ROOT, 'public/baked')).filter(t => existsSync(join(ROOT, 'public/baked', t, 'terrain.json'))) : []

function claims({ waterLevelsIfWet }, src) {
  const out = []
  let v; const e1 = throws(() => { v = waterLevelsIfWet({ datum: 'local minimum', water: null }) })
  if (e1 || v !== null) out.push(`① an inland terrain asks for a water level (${e1 || JSON.stringify(v)})`)
  if (!throws(() => waterLevelsIfWet({ datum: 'water', water: null }))) out.push('② a water-datum terrain with no levels is not said')
  const e2 = throws(() => waterLevelsIfWet({ datum: undefined, water: null }))
  if (!e2 || !/carries no datum/.test(e2)) out.push(`② a terrain declaring no datum is read as inland, not refused (${e2 || 'null'})`)
  for (const t of baked) { const T = JSON.parse(readFileSync(join(ROOT, 'public/baked', t, 'terrain.json'), 'utf8'))
    if (T.datum !== 'water') { const e = throws(() => waterLevelsIfWet({ datum: T.datum, water: T.water })); if (e) out.push(`③ ${t} (datum ${T.datum}) is asked for a level: ${e}`) } }
  for (const [f, t] of Object.entries(src)) {
    if (!/waterLevelsIfWet\(\{\s*datum:\s*terrainDatum\(\),\s*water:\s*terrainWater\(\)\s*\}\)/.test(t)) out.push(`④ ${f} does not ask waterLevelsIfWet with the terrain's datum`)
    if (/\bwaterLevels\(/.test(t)) out.push(`④ ${f} still asks waterLevels directly (an inland town would be asked for a level)`) }
  return out
}
let bad = 0
const real = claims(await wl('real'), SRC)
for (const r of real) console.log(`⛔ ${r}`)
if (real.length) bad++
else console.log(`✅ an inland terrain asks no level; a water terrain with none is said; ${baked.length} baked terrain(s) on disk agree; SlabRevetment and BakedGround ask by datum`)
if (MUTANTS) { const got = claims(await wl('no-gate', (t) => { const f = "  if (datum !== 'water') return null\n"; if (!t.includes(f)) throw new Error('[mutant] the gate is gone — re-aim it'); return t.replace(f, '') }), SRC), red = got.length > real.length
  if (!red) bad++
  console.log(`   mutant · the datum gate removed: ${red ? `RED, as it must be (${got[0]})` : '⛔ still clean — the check cannot see it'}`)
  { const got3 = claims(await wl('no-datum', (t) => { const f = "  if (datum == null) throw new Error('waterLevels: terrain.json carries no datum — re-bake the terrain')\n"; if (!t.includes(f)) throw new Error('[mutant] the refusal is gone — re-aim it'); return t.replace(f, '') }), SRC), red3 = got3.length > real.length
    if (!red3) bad++
    console.log(`   mutant · the no-datum refusal removed: ${red3 ? `RED, as it must be (${got3[0]})` : '⛔ still clean — the check cannot see it'}`) }
  const bg = 'src/components/BakedGround.jsx', from = 'waterLevelsIfWet({ datum: terrainDatum(), water: terrainWater() })'
  if (!SRC[bg].includes(from)) { bad++; console.log('   ⛔ mutant not made: BakedGround no longer holds the text it mutates') }
  else { const got2 = claims(await wl('m2'), { ...SRC, [bg]: SRC[bg].replace(from, 'waterLevels(terrainWater())') }), red2 = got2.length > real.length
    if (!red2) bad++
    console.log(`   mutant · BakedGround back on waterLevels(terrainWater()): ${red2 ? `RED, as it must be (${got2[0]})` : '⛔ still clean — the check cannot see it'}`) } }
console.log(bad ? '\n⛔ RED — an inland town is asked for a water level, or a coast town with none is not said' : '\n✅ GREEN — water levels are asked of a coast town only, by both readers')
process.exit(bad ? 1 : 0)
