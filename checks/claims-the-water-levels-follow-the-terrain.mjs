#!/usr/bin/env node
// claims-the-water-levels-follow-the-terrain.mjs — ARE THE WATER'S LEVELS RE-READ WHEN THE TERRAIN RELOADS?
//
// ⭐ 2026-10-28 (Zob's question on kerf/stage-black, Boz): the water's low/high levels are the TERRAIN's record (terrainShader.js
// #terrainWater, #terrainDatum, read through cartograph/waterLevel.mjs#waterLevelsIfWet). <Town> mounts the ground only once its
// terrain has arrived (TownPlace.jsx#useTownLoaded: terrainLook() === lookId), which covers a first load and a town switch. A
// SAME-Look re-bake does not: the Designer and Stage call reloadTerrain(lookId, { force: true }) ASYNC while BakedGround remounts on
// the new bake and fetches its ground, nothing orders the two, and both readers read the levels ONCE (a memo on [manifest, bin],
// a memo on [doc]). So a re-bake whose levels changed could draw the water at the old ones. Both readers now re-read on reload:
//   ① BakedGround.jsx: the mesh build fills a water sheet's aLevelLow/aLevelHigh through ONE function (fillWaterLevels), and an
//      onTerrainReload subscription refills every water sheet with it (the geometry stays);
//   ② SlabRevetment.jsx: its levels memo keys on groundGen, which onTerrainReload increments (read from the source).
// ⭐ MUTANTS (--mutants), each RED: BakedGround's reload subscription removed · SlabRevetment's memo back on [doc].
//   node checks/claims-the-water-levels-follow-the-terrain.mjs [--mutants]
// Read-only. Exits 1 on any claim false or a mutant not seen.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
const BG = readFileSync(join(ROOT, 'src/components/BakedGround.jsx'), 'utf8'), SR = readFileSync(join(ROOT, 'src/components/SlabRevetment.jsx'), 'utf8')
const SUB = "  useEffect(() => onTerrainReload(() => { const L = waterLevelsOrSay()\n    for (const m of meshes) if (m.group.kind !== 'face' && isWaterGroupId(m.group.id)) fillWaterLevels(m.geometry, L) }), [meshes])\n"
function claims(bg, sr) {
  const out = []
  if (!/if \(g\.kind !== 'face' && isWaterGroupId\(g\.id\)\) fillWaterLevels\(geom, waterLevelsOrSay\(\)\)/.test(bg)) out.push('① the mesh build does not fill the water levels through fillWaterLevels')
  if (!bg.includes(SUB)) out.push('① BakedGround does not refill the water levels on onTerrainReload')
  if (/\.setAttribute\('aLevelLow'/g.test(bg) && (bg.match(/\.setAttribute\('aLevelLow'/g) || []).length !== 1) out.push('① aLevelLow is set in more than one place (two copies of the fill)')
  if (!/return null \} \}, \[doc, groundGen\]\)/.test(sr)) out.push('② SlabRevetment\'s levels memo does not re-read on a terrain reload (groundGen)')
  const gi = sr.indexOf('const [groundGen, setGroundGen] = useState(0)'), li = sr.indexOf('const levels = useMemo(')
  if (gi < 0 || li < 0 || gi > li || !/onTerrainReload\(\(\) => setGroundGen\(g => g \+ 1\)\)/.test(sr)) out.push('② groundGen is not incremented by onTerrainReload before the levels memo reads it')
  return out
}
let bad = 0
const real = claims(BG, SR)
for (const r of real) console.log(`⛔ ${r}`)
if (real.length) bad++
else console.log('✅ both readers re-read the water levels when the terrain reloads (BakedGround refills its sheets; SlabRevetment keys on groundGen)')
if (process.argv.includes('--mutants')) for (const [what, bg, sr] of [
  ["BakedGround's reload subscription removed", BG.replace(SUB, ''), SR],
  ["SlabRevetment's memo back on [doc]", BG, SR.replace('return null } }, [doc, groundGen])', 'return null } }, [doc])')],
]) { const got = claims(bg, sr), red = got.length > real.length
  if (!red) bad++
  console.log(`   mutant · ${what}: ${red ? `RED, as it must be (${got[0]})` : '⛔ still clean — the check cannot see it'}`) }
console.log(bad ? '\n⛔ RED — the water can keep the old levels after a re-bake' : '\n✅ GREEN')
process.exit(bad ? 1 : 0)
