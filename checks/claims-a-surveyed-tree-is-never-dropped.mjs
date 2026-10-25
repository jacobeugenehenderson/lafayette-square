#!/usr/bin/env node
// claims-a-surveyed-tree-is-never-dropped.mjs — DOES EVERY SURVEYED TREE IN THE DISC STAND IN THE SLAB?
//
// ⭐ THE CLASS (Jacob, 2026-10-25: "Keep PTown's trees" · "keep those too, that's why things are authorable"). A recorded
// tree is reality; our land use and hardscape are derivations. When
// the fresh pour put PTown's land use (landuse:retail) under six surveyed trees and the nudge found no legal ground, the
// bake deleted them, and HPDM lost 97 the same way. Rule (arborist/bake-trees.js#SURVEYED_KEPT_ON, read here, never
// restated): a surveyed tree ruled out for one of those reasons stays at its surveyed point, counted and named.
// READS the bake's own census (bake-trees.js#readCensus over tree-bake-inputs.mjs#treeBakeInputsForMap, deduped exactly as
// the bake does), the slab's trees.json, the disc (boundaryRecords.mjs#discOf) and the same frozen-shape zone tester the
// bake uses (forbidden-surface.mjs#makeZoneTester). For each SURVEYED candidate inside the disc with no slab tree within
// the nudge's reach of it: the tester's reason at its point. RED where that reason is one SURVEYED_KEPT_ON protects, or
// where the ground is legal (dropped for no stated reason). Drops for other reasons are counted and printed.
//   node checks/claims-a-surveyed-tree-is-never-dropped.mjs [scene …]
// ⭐ MUTATION TEST (--selftest): remove one protected tree's instance from a copy of a town's slab → RED, naming it.
// A slab baked under the OLD rule is itself the natural mutant (PTown's six and HPDM's 98).
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ROOT, ribbonScenes } from './_scenes.mjs'

const REACH = 4.01   // m — the nudge's farthest ring (forbidden-surface.mjs#classify.nudge: rings 4 × step 1)
const quiet = async (f) => { const l = console.log, w = console.warn; console.log = console.warn = () => {}; try { return await f() } finally { console.log = l; console.warn = w } }
const { SURVEYED_KEPT_ON, readCensus } = await import('../arborist/bake-trees.js')
const { treeBakeInputsForMap } = await import('../cartograph/tree-bake-inputs.mjs')
const { makeZoneTester } = await import('../cartograph/forbidden-surface.mjs')
const { discOf } = await import('../cartograph/boundaryRecords.mjs')

async function judge(scene, slabTrees = null) {
  const inp = treeBakeInputsForMap(scene)
  if (!inp) return { scene, skip: 'no tree-bake inputs' }
  const slabP = resolve(ROOT, inp.output || `public/baked/${scene}/trees.json`), shapeP = resolve(ROOT, inp.zoneShapePath || `public/baked/${scene}/shape.json`)
  if (!existsSync(slabP) || !existsSync(shapeP)) return { scene, skip: 'no baked trees.json or shape.json' }
  const census = await quiet(() => readCensus(inp.placements))
  const D = discOf(JSON.parse(readFileSync(join(ROOT, 'cartograph/data', scene, 'neighborhood_boundary.json'), 'utf8')), scene)
  const S = slabTrees || JSON.parse(readFileSync(slabP, 'utf8')).instances
  const zone = await quiet(() => makeZoneTester({ shapePath: shapeP, mapPath: inp.forbiddenMapPath, scene, quiet: true }))
  // a coarse grid of the slab's trees for the reach test
  const cell = (x, z) => `${Math.floor(x / 8)},${Math.floor(z / 8)}`, grid = new Map()
  for (const t of S) { const k = cell(t.x, t.z); (grid.get(k) || grid.set(k, []).get(k)).push(t) }
  const standing = (c) => { const cx = Math.floor(c.x / 8), cz = Math.floor(c.z / 8)
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const t of grid.get(`${cx + i},${cz + j}`) || []) if (Math.hypot(t.x - c.x, t.z - c.z) <= REACH) return true
    return false }
  const bad = [], other = {}, byReason = {}
  let surveyed = 0
  for (const c of census.trees) {
    if (c.__kind === 'derived' || !D.inDisc(c.x, c.z)) continue
    surveyed++
    if (standing(c)) continue
    const reason = zone(c.x, c.z)
    if (!reason || SURVEYED_KEPT_ON(reason)) byReason[reason || 'legal'] = (byReason[reason || 'legal'] || 0) + 1
    if (!reason || SURVEYED_KEPT_ON(reason)) bad.push(`${c.__source} ${c.species ?? '?'} at (${c.x}, ${c.z}) on ${reason || 'LEGAL ground'}`)
    else other[reason] = (other[reason] || 0) + 1
  }
  return { scene, surveyed, bad, other, byReason, zone, census, D, S }
}

const show = (r) => r.skip ? `⛔ ${r.scene}: NOT CHECKED — ${r.skip}`
  : `${r.bad.length ? '⛔' : '✅'} ${r.scene}: ${r.surveyed} surveyed tree(s) in the disc · ${r.bad.length} dropped where the rule keeps them` +
    (r.bad.length ? ` (${Object.entries(r.byReason).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')})` : '') +
    (Object.keys(r.other).length ? ` · dropped for other reasons: ${Object.entries(r.other).map(([k, v]) => `${k}=${v}`).join(' ')}` : '') +
    (r.bad.length ? '\n     ' + r.bad.slice(0, 10).join('\n     ') : '')

if (process.argv.includes('--selftest')) {
  let ok = false
  for (const s of ribbonScenes([])) {
    const r = await judge(s); if (r.skip) continue
    const { census, D, S, zone } = r
    // a victim the rule must keep: a surveyed tree in the disc, standing, on legal or protected ground
    const victim = census.trees.find(c => c.__kind !== 'derived' && D.inDisc(c.x, c.z) && S.some(t => Math.hypot(t.x - c.x, t.z - c.z) <= REACH)
      && (!zone(c.x, c.z) || SURVEYED_KEPT_ON(zone(c.x, c.z))))
    if (!victim) continue
    const R = await judge(s, S.filter(t => Math.hypot(t.x - victim.x, t.z - victim.z) > REACH))
    ok = R.bad.some(b => b.includes(`(${victim.x}, ${victim.z})`))
    console.log(`  ${ok ? '✅' : '⛔'} ${s}: removing the slab tree at a surveyed point (${victim.x}, ${victim.z}) → ${ok ? 'RED, naming it' : 'stayed green'}`)
    break
  }
  if (!ok) console.log('  ⛔ the selftest exercised nothing, or the removal stayed green')
  process.exit(ok ? 0 : 1)
}

let red = 0, judged = 0
for (const s of ribbonScenes()) { const r = await judge(s); if (r.skip) red++; else { judged++; if (r.bad.length) red++ } console.log(show(r)) }
if (!judged) { console.log('⛔ no town was judged — nothing proved'); red++ }
console.log(red ? '\n⛔ RED — a surveyed tree was dropped where SURVEYED_KEPT_ON keeps it (arborist/bake-trees.js)' : '\n✅ GREEN — every surveyed tree the rule keeps stands in the slab')
process.exit(red ? 1 : 0)
