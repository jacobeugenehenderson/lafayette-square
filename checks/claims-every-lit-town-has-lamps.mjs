#!/usr/bin/env node
// CLAIM — EVERY TOWN WHOSE STREETS TAKE LAMPS SHIPS LAMPS, EACH ONE SAYING WHERE IT CAME FROM,
// AND NO INVENTED LAMP STANDS IN THE ROAD. (ROADMAP H-17 · BRIEF-street-lamps-derived)
//
// Lamps baked to ZERO on every poured town for months, and nothing went red: the bake read a
// hand-made file only LS had, and "0 lamps" is a plausible-looking night. The fix is two wells
// (surveyed OSM + a derived fill along the street graph) and a `source` on every lamp.
//   ① the bake knows all three wells (read from `SOURCE_BY_WELL`, not restated here);
//   ② the census goes to zero when the derived well is removed — so ③ is able to fail
//      (the mutation runs in-process on every town, every time);
//   ③ WHAT SHIPS: a town whose skeleton has streets in a lit road group has lamps > 0, the
//      lamps.json is v3, and every lamp is stamped osm | derived | authored;
//   ④ every DERIVED lamp stands on ground the producer calls legal (`DERIVED_LEGAL`: treelawn ·
//      sidewalk · lu), judged on the frozen shape's painted zones. ⛔ A positive list, not a
//      forbidden one: the first version listed what was illegal, missed `pavement` (the drawn
//      carriageway — a centreline reads `pavement`), and passed a lamp moved into the road.
//   ▶ Mutation: move one derived lamp onto a street centreline in a copy of lamps.json → ④ RED.
//
// ▶ MUTATION-TEST IT BY HAND TOO: delete a town's clean/derived_lamps.json and re-bake lamps → ③ RED.
//   In bake-lamps.js, remove `derived` from SOURCE_BY_WELL → ① RED.
//
//   node checks/claims-every-lit-town-has-lamps.mjs [scene…] [--baked=<dir>]   (--baked: read lamps.json from <dir>/<scene>/)
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { scenes } from './_scenes.mjs'
import { SOURCE_BY_WELL, readLampCensus, lampSettings } from '../cartograph/bake-lamps.js'
import { groupOf } from '../cartograph/lamp-spacing.mjs'
import { makeZoneTester } from '../cartograph/forbidden-surface.mjs'
import { DERIVED_LEGAL } from '../cartograph/derive-lamps.mjs'

const bakedArg = process.argv.find(a => a.startsWith('--baked='))?.slice(8)
let red = 0
const bad = (m) => { red++; console.log(`   ⛔ ${m}`) }
const ok = (m) => console.log(`   ✅ ${m}`)
const read = (p) => JSON.parse(readFileSync(p, 'utf-8'))
const STAMPS = new Set(Object.values(SOURCE_BY_WELL))

console.log('① THE BAKE KNOWS ALL THREE WELLS')
for (const w of ['osm', 'derived', 'authored']) STAMPS.has(w) ? ok(`stamps '${w}'`) : bad(`SOURCE_BY_WELL has no '${w}' — that well cannot reach a lamp`)

for (const scene of scenes('public/baked/<scene>/shape.json')) {
  console.log(`\n── ${scene}`)
  const skel = join('cartograph/data', scene, 'clean/skeleton.json')
  if (!existsSync(skel)) { console.log(`   NOT CHECKED — no ${skel}`); continue }
  const eligible = read(skel).streets.filter(s => groupOf(s.highway)).length
  const derivedPath = join('cartograph/data', scene, 'clean/derived_lamps.json')

  // The operator may switch the fill off (design.json#lamps.derive = false — "real lamps only"). Then no
  // derived lamp may ship, and the town must still have its real ones.
  const { derive } = lampSettings(scene)
  if (!derive) {
    const lp0 = join(bakedArg || 'public/baked', scene, 'lamps.json')
    const d0 = existsSync(lp0) ? (read(lp0).lamps || []).filter(l => l.source === 'derived').length : 0
    d0 ? bad(`② derived fill is OFF by authoring, yet ${d0} derived lamps shipped — re-bake lamps`) : ok('② derived fill OFF by authoring (real lamps only) — none shipped')
  } else if (existsSync(derivedPath)) {
    const withIt = readLampCensus(scene).perWell, without = readLampCensus(scene, { derivedPath: '/nonexistent/derived_lamps.json' }).perWell
    without.derived === 0 && withIt.derived > 0 ? ok(`② dropping the derived well removes ${withIt.derived} lamps (census can fail)`) : bad(`② removing the derived well changed nothing (${withIt.derived} → ${without.derived})`)
  } else if (eligible) bad(`② no ${derivedPath} — ${eligible} streets are eligible and nothing derived them. ▶ node cartograph/derive-lamps.mjs --scene=${scene}`)

  // ③ What ships.
  const lp = join(bakedArg || 'public/baked', scene, 'lamps.json')
  if (!existsSync(lp)) { bad(`③ no ${lp}`); continue }
  const j = read(lp)
  if (eligible && !(j.count > 0)) bad(`③ ${eligible} streets in a lit road group, and lamps.json has ${j.count} lamps`)
  else ok(`③ ${j.count} lamps (${eligible} eligible streets)`)
  if (!(j.version >= 3)) bad(`③ lamps.json is v${j.version} — baked before provenance; re-bake lamps`)
  const unstamped = (j.lamps || []).filter(l => !STAMPS.has(l.source)).length
  unstamped ? bad(`③ ${unstamped}/${j.lamps.length} lamps carry no osm|derived|authored stamp`) : ok(`③ every lamp stamped ${JSON.stringify(j.bySource ?? {})}`)

  // ④ No invented lamp in the road.
  const derived = (j.lamps || []).filter(l => l.source === 'derived')
  if (!derived.length) continue
  const map = join('cartograph/data', scene, 'clean/map.json')
  const zoneOf = makeZoneTester({ shapePath: join('public/baked', scene, 'shape.json'), mapPath: existsSync(map) ? map : undefined,
    scene, quiet: true }).zoneOf
  const onIllegal = {}
  for (const l of derived) { const z = zoneOf(l.x, l.z); if (!DERIVED_LEGAL.has(z)) onIllegal[z] = (onIllegal[z] || 0) + 1 }
  Object.keys(onIllegal).length ? bad(`④ derived lamps on illegal ground: ${JSON.stringify(onIllegal)}`) : ok(`④ all ${derived.length} derived lamps on legal ground`)
}

console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ all claims hold')
process.exit(red ? 1 : 0)
