#!/usr/bin/env node
// claims-an-area-highway-is-a-surface.mjs — IS EVERY AREA HIGHWAY (A PLAZA, A TERRACE, A SERVICES AREA) A SURFACE, NEVER A STREET
// CHAIN, AND IS ONE THE VOCABULARY CANNOT PLACE REFUSED BY NAME?
//
// ⭐ 2026-10-28 (Boz, on Zob's read): Altadena's skeleton refused "no class … for highway=path area=yes"; JH's Diversity Plaza (a
// MULTIPOLYGON, no area tag) was classed a linear `pedestrian` and chained; named area=yes ways (HPDM's st-louis-walk-of-fame,
// chapman-plaza…, Huron's the-deering-family-terrace) entered as street chains because a NAME promotes a way (STYLE-GUIDE §9
// Conflict 9.1); and derive's path layer stroked a plaza's outline as a path line. One rule, in src/cartograph/streetClass.js:
//   ① THE VOCABULARY (planted tags, through the module's own classifyWay / classOf): `isArea` is area=yes OR type=multipolygon;
//      a path, footway, cycleway, pedestrian or service area is a 'plaza' (network 'area'); a pedestrian multipolygon is a plaza,
//      not a line; a road area (residential area=yes) matches nothing and classOf refuses naming it an AREA.
//   ② THE TOWNS: every area highway in each raw/osm.json is a network-'area' class, or is named as refused.
//   ③ THE SKELETON drops every network-'area' way BEFORE it groups by name (read from the source), so no name promotes one.
//   ④ THE PATH LAYER (derive.js) strokes only non-area ways (read from the source).
// The fill is RULED and UNBUILT (STYLE-GUIDE §9, Jacob 2026-10-20: plaza is its own type, an area fill): skeleton and derive each
// print the areas they did not draw, by name. ▶ cartograph/BACKLOG.md.
// ⭐ MUTANTS (--mutants), each RED: the multipolygon clause removed · the skeleton's area drop removed · derive back on all ways.
//   node checks/claims-an-area-highway-is-a-surface.mjs [<scene> …] [--mutants]
// Read-only. Exits 1 on any claim false or a mutant not seen.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { scenes, ROOT } from './_scenes.mjs'
import { importSource } from './_importSource.mjs'
const MUTANTS = process.argv.includes('--mutants')
const vocab = (tag, transform) => importSource('src/cartograph/streetClass.js', { suffix: `// ${tag}`, transform })
const SKEL = readFileSync(join(ROOT, 'cartograph/skeleton.js'), 'utf8'), DERIVE = readFileSync(join(ROOT, 'cartograph/derive.js'), 'utf8')
const towns = scenes('cartograph/data/<scene>/raw/osm.json')
const throws = (f) => { try { f(); return null } catch (e) { return e.message } }

function claims(V, skel, derive, census = false) {
  const out = [], net = (t) => { const c = V.classifyWay(t); return c ? `${c.class}/${V.CLASSES[c.class].network}` : null }
  for (const [t, want] of [[{ highway: 'path', area: 'yes' }, 'plaza/area'], [{ highway: 'cycleway', area: 'yes' }, 'plaza/area'],
    [{ highway: 'pedestrian', type: 'multipolygon' }, 'plaza/area'], [{ highway: 'footway', type: 'multipolygon' }, 'plaza/area'],
    [{ highway: 'pedestrian', area: 'yes' }, 'plaza/area'], [{ highway: 'pedestrian' }, 'pedestrian/path']])
    if (net(t) !== want) out.push(`① ${JSON.stringify(t)} → ${net(t) ?? 'REFUSED'}, want ${want}`)
  const e = throws(() => V.classOf({ highway: 'residential', area: 'yes', name: 'Planted Square' }))
  if (!e || !/an AREA, not a street/.test(e)) out.push(`① a road area is not refused as an AREA (${e || 'classed'})`)
  if (census) for (const t of towns) {
    const H = JSON.parse(readFileSync(join(ROOT, `cartograph/data/${t}/raw/osm.json`), 'utf8')).ground?.highway || []
    const A = H.filter(f => V.isArea(f.tags || {})), bad = A.filter(f => { const c = V.classifyWay(f.tags || {}); return c && V.CLASSES[c.class].network !== 'area' && c.class !== 'not-built' && c.class !== 'indoor' })
    const refused = A.filter(f => !V.classifyWay(f.tags || {}))
    if (bad.length) out.push(`② ${t}: ${bad.length} area highway(s) classed as a LINE: ${bad.slice(0, 3).map(f => `osm ${f.osmId} ${JSON.stringify(f.tags).slice(0, 80)}`).join(' · ')}`)
    console.log(`   ② ${t}: ${A.length} area highway(s) · surfaces ${A.length - bad.length - refused.length} · refused by name ${refused.length}${refused.length ? ` (${refused.slice(0, 3).map(f => `osm ${f.osmId} highway=${f.tags.highway}`).join(' · ')})` : ''}`)
  }
  const drop = skel.indexOf("CLASSES[wayClass.get(f.osmId).class]?.network !== 'area')"), group = skel.indexOf('= groupByName(highways)')
  if (drop < 0 || group < 0 || drop > group) out.push('③ the skeleton does not drop network-area ways before it groups by name')
  if (!/const lines = highways\.filter\(f => !isAreaWay\(f\)\)/.test(derive) || !/const paths = lines\.filter\(/.test(derive)) out.push('④ derive\'s path layer strokes area ways')
  return out
}
let bad = 0
const real = claims(await vocab('real'), SKEL, DERIVE, true)
for (const r of real) console.log(`⛔ ${r}`)
if (real.length) bad++
else console.log(`✅ an area highway is a surface (area=yes or a multipolygon), never a chain; one the vocabulary cannot place is refused as an AREA; ${towns.length} town(s)`)
if (MUTANTS) for (const [what, V, skel, derive] of [
  ['the multipolygon clause removed', await vocab('no-mp', (t) => t.replace(" || tags?.type === 'multipolygon'", '')), SKEL, DERIVE],
  ["the skeleton's area drop removed", await vocab('m2'), SKEL.replace("CLASSES[wayClass.get(f.osmId).class]?.network !== 'area')", 'true)'), DERIVE],
  ['derive back on all ways', await vocab('m3'), SKEL, DERIVE.replace('const paths = lines.filter(', 'const paths = highways.filter(')],
]) { const got = claims(V, skel, derive), red = got.length > real.length
  if (!red) bad++
  console.log(`   mutant · ${what}: ${red ? `RED, as it must be (${got[0]})` : '⛔ still clean — the check cannot see it'}`) }
console.log(bad ? '\n⛔ RED — an area highway can be a street chain or a path line, or is classed silently' : '\n✅ GREEN — an area highway is a surface, by one rule')
process.exit(bad ? 1 : 0)
