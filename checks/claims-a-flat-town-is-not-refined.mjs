#!/usr/bin/env node
// CLAIM — A TOWN WITH NO TERRAIN SHIPS ITS GROUND UNREFINED (F3, Jacob 2026-09-24).
//
// Every ground refinement exists to give the runtime's terrain lift enough vertices to drape the DEM. A
// scene with no heightfield is lifted by nothing, so refining it is pure cost — and a 64 m cap on a
// no-terrain town was the Provincetown explosion (its bay, one 157 km² face, quartered to 10.3M slivers).
// ASSERTS, per baked look (public/baked/<look>/ground.json `groundShape`, written by bake-ground):
//   · `terrain` agrees with the scene on disk (cartograph/data/<scene>/clean/terrain.json present?) —
//     the bake's own claim is not trusted;
//   · no terrain ⇒ every partition group's refine is 'none'.
// A ground baked before this disclosure has no `groundShape` and is NOT CHECKED — loud, never a pass.
//
//   node checks/claims-a-flat-town-is-not-refined.mjs [look…] [--ground=path --scene=id]
//
// MUTATION (must go red): drop the `!hasTerrain` gate in bake-ground's planGroup for one kind (e.g. the
// hard overlays) and bake a no-terrain town to --out-dir.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const looks = JSON.parse(readFileSync(join(ROOT, 'public/looks/index.json'), 'utf8')).looks
let red = false
// An explicit --ground judges that file for the look(s) named on the command line (a scratch bake).
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
for (const look of (arg('ground') ? named : scenes('public/baked/<scene>/ground.json'))) {
  const p = arg('ground') || join(ROOT, 'public/baked', look, 'ground.json')
  if (!existsSync(p)) { console.log(`── ${look}   ⛔ NOT CHECKED — no ${p}`); red = true; continue }
  const g = JSON.parse(readFileSync(p, 'utf8')).groundShape
  if (!g) { console.log(`── ${look}   ⛔ NOT CHECKED — ground.json has no groundShape (baked before F3). Re-bake.`); red = true; continue }
  const scene = arg('scene') || looks.find(l => l.id === look)?.scene || look
  const onDisk = existsSync(join(ROOT, 'cartograph/data', scene, 'clean/terrain.json'))
  const refined = Object.entries(g.groups).filter(([, v]) => v.refine !== 'none').map(([k, v]) => `${k}(${v.refine})`)
  const bad = []
  if (g.terrain !== onDisk) bad.push(`the bake says terrain=${g.terrain}, the scene ${onDisk ? 'HAS' : 'has NO'} clean/terrain.json`)
  if (!onDisk && refined.length) bad.push(`no terrain, yet ${refined.length} group(s) refined: ${refined.join(', ')}`)
  console.log(`── ${look} (${scene}) ── terrain ${onDisk ? 'yes' : 'NO'} · ${refined.length} group(s) refined ${bad.length ? '⛔' : '✅'}`)
  for (const b of bad) console.log(`   ⛔ ${b}`)
  if (bad.length) red = true
}
console.log(red ? '\n⛔ A flat town was refined — or a ground could not be judged.' : '\n✅ Every flat town ships its ground unrefined.')
process.exit(red ? 1 : 0)
