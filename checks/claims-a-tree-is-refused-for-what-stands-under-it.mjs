#!/usr/bin/env node
/**
 * claims-a-tree-is-refused-for-what-stands-under-it — a ground-cover refusal is backed at the POINT.
 *
 * Jacob, 2026-09-26 (`docs/briefs/BRIEF-wetland-trees.md`): Provincetown refused 48% of its
 * tree candidates as `lu:wetland`, and three quarters of them stood in no wetland at all. A tile
 * takes one land use, and a ground cover takes a tile from a jurisdiction at any share, so the
 * Seashore's pitch-pine reserve was painted wetland and every tree in it refused with it.
 * The tree gate now asks the point (`forbidden-surface.mjs` `coverVerdict`).
 *
 * ⭐ It reads the gate, never restates it: candidates from the town's own census wells
 *    (`treeBakeInputsForMap`), the verdict from `makeZoneTester`, the answering feature from its
 *    `featureAt`. The ground-cover classes are the tester's own `askedAtPoint`.
 *
 * ⛔ FAILS ON:
 *   1. A refusal as a ground-cover class with NO feature of that class under the tree — the
 *      block's label standing in for the ground (the defect).
 *   2. A tree refused while standing in a wooded wetland (`WETLAND_SUBTYPE` = wooded).
 * Prints, per town, what each ground-cover refusal stands in (tag / wetland subtype) — the
 * reason a tree is refused, readable per point.
 *
 *   node checks/claims-a-tree-is-refused-for-what-stands-under-it.mjs              # every town
 *   node checks/claims-a-tree-is-refused-for-what-stands-under-it.mjs provincetown
 */
import { readFileSync, existsSync } from 'node:fs'
import { scenes, ROOT } from './_scenes.mjs'
import { makeZoneTester } from '../cartograph/forbidden-surface.mjs'
import { treeBakeInputsForMap } from '../cartograph/tree-bake-inputs.mjs'
import { WETLAND_SUBTYPE } from '../cartograph/lu-policy.mjs'

let failed = 0, measured = 0
for (const scene of scenes('public/baked/<scene>/trees.json')) {
  console.log(`\n── ${scene}`)
  const inp = treeBakeInputsForMap(scene)
  if (!inp?.zoneShapePath || !inp.placements?.some(existsSync)) { console.log('  NOT CHECKED — no census well or shape resolves.'); continue }
  const designPath = `${ROOT}/public/looks/${scene}/design.json`
  const tester = makeZoneTester({ shapePath: inp.zoneShapePath, mapPath: inp.forbiddenMapPath,
    designPath: existsSync(designPath) ? designPath : undefined, scene, quiet: true })
  const covered = new Set(tester.askedAtPoint)
  measured++
  if (!covered.size) { console.log('  no ground-cover tiles — every land-use refusal is the block\'s own class.'); continue }

  const by = {}, bad = {}
  let n = 0
  for (const p of inp.placements.filter(existsSync)) {
    const j = JSON.parse(readFileSync(p, 'utf8'))
    for (const t of (Array.isArray(j) ? j : j.trees)) {
      n++
      const reason = tester(t.x, t.z)
      if (!reason?.startsWith('lu:') || !covered.has(reason.slice(3))) continue
      const f = tester.featureAt(t.x, t.z)
      const key = f ? `${reason} ⇐ ${f.tag}${f.subtype ? '/' + f.subtype : ''}` : `${reason} ⇐ (nothing under it)`
      by[key] = (by[key] || 0) + 1
      const why = !f || f.lu !== reason.slice(3) ? 'refused for the block\'s label'
        : f.subtype && WETLAND_SUBTYPE[f.subtype] === 'wooded' ? 'a wooded wetland refused' : null
      if (why) bad[`${key} — ${why}`] = (bad[`${key} — ${why}`] || 0) + 1
    }
  }
  console.log(`  ${n} candidates; ground-cover tiles: ${[...covered].join(', ')}`)
  for (const [k, c] of Object.entries(by).sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(7)}  ${k}`)
  for (const [k, c] of Object.entries(bad)) { failed++; console.log(`  ⛔ ${c}  ${k}`) }
}
if (!measured) { console.error('\n⛔ NOT MEASURED — no town could be tested. This is not a pass.'); process.exit(2) }
console.log(failed ? `\n⛔ ${failed} problem(s).` : '\n✓ every ground-cover refusal stands on that ground.')
process.exit(failed ? 1 : 0)
