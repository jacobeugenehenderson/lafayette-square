#!/usr/bin/env node
// CLAIM — A HIGHWAY IS ONE ROAD, NOT A ROW OF FRAGMENTS (H-3 check 1, cartograph/_archive/BRIEF-highway-build-plan-2026-09-23.md).
//
// OSM cuts a freeway into a new way wherever a tag changes, and each unnamed way used to become its
// own chain — so the highway drew with a visible joint at every cut. `skeleton.js`
// `weldHighwayChains` joins them. This check asserts no WELDABLE joint survives, in the frame
// (`skeleton.json`) AND in what ① is drawn from (`ribbons.json`, flattened points).
//
// A WELDABLE JOINT: two grade-separated chains of the SAME highway class and the same `oneway`,
// meeting TAIL→HEAD at a node of degree 2 (every chain incidence counted: endpoint +1, interior +2).
// ⛔ NO ANGLE CONDITION (Boz, 2026-09-23): a degree-2 same-direction joint has nowhere else to go,
// so the angle there is curvature, not a turn.
// NAMED EXCEPTIONS, printed every run, never silent:
//   · a divided carriageway (`phase.kind === 'divided'`) — the divided machinery is not reopened;
//   · two different REAL names (a name transition), where neither side is synthetic.
//
// Reads the highway classes out of `skeleton.js` (LIMITED_ACCESS) rather than restating them.
//
//   node checks/claims-highway-no-visible-joint.mjs [scene…]
//   node checks/claims-highway-no-visible-joint.mjs huron --skeleton=/tmp/skel.json --ribbons=/tmp/r.json
//
// MUTATION (must go red): disable the weld — `weldHighwayChains(streets)` commented out in
// skeleton.js, run it to a temp --out, and pass that file as --skeleton.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const skelOverride = arg('skeleton'), ribOverride = arg('ribbons')

const skelSrc = readFileSync(join(ROOT, 'cartograph/skeleton.js'), 'utf8')
const la = skelSrc.match(/const LIMITED_ACCESS = new Set\(\[([^\]]+)\]\)/)
// The ribbons path is promote-ribbons.js's rule, which lives in applySnapshot.mjs — CALLED, not re-parsed.
const { promotedRibbonsPath: ribbonsOf } = await import(join(ROOT, 'cartograph/applySnapshot.mjs'))
if (!la) {
  console.error('⛔ NOT CHECKED — could not read LIMITED_ACCESS from skeleton.js')
  process.exit(2)
}
const HIGHWAY = new Set([...la[1].matchAll(/'([^']+)'/g)].map(m => m[1]))

const xy = (p) => Array.isArray(p) ? p : [p.x, p.z]
const key = (p) => { const [x, z] = xy(p); return `${x.toFixed(2)},${z.toFixed(2)}` }

// chains: [{ id, highway, oneway, gs, divided, synthetic, name, points }]
function joints(chains) {
  const degree = new Map()
  for (const c of chains) c.points.forEach((p, i) => {
    const k = key(p); degree.set(k, (degree.get(k) || 0) + (i === 0 || i === c.points.length - 1 ? 1 : 2))
  })
  const hwy = chains.filter(c => HIGHWAY.has(c.highway) && c.gs && c.points.length >= 2)
  const byHead = new Map()
  for (const c of hwy) { const k = key(c.points[0]); byHead.set(k, byHead.has(k) ? null : c) }
  const out = { weldable: [], divided: [], name: [] }
  for (const a of hwy) {
    const k = key(a.points[a.points.length - 1]), b = byHead.get(k)
    if (!b || b === a || degree.get(k) !== 2 || a.highway !== b.highway || a.oneway !== b.oneway) continue
    const tag = `${a.id}→${b.id}`
    if (a.divided || b.divided) out.divided.push(tag)
    else if (!a.synthetic && !b.synthetic && a.name !== b.name) out.name.push(tag)
    else out.weldable.push(`${tag} @(${k})`)
  }
  return out
}

let red = false
const list = (xs) => xs.slice(0, 8).join(' · ') + (xs.length > 8 ? ` … (+${xs.length - 8})` : '')
for (const scene of scenes('cartograph/data/<scene>/raw/osm.json')) {
  const skelPath = skelOverride || join(ROOT, 'cartograph/data', scene, 'clean/skeleton.json')
  const ribPath = ribOverride || ribbonsOf(scene)
  const missing = [skelPath, ribPath].filter(p => !existsSync(p))
  if (missing.length) { console.log(`\n── ${scene}   ⛔ NOT CHECKED — missing ${missing.join(', ')}`); red = true; continue }
  const skel = readJson(skelPath).streets || []
  const bySkel = new Map(skel.map(s => [s.id, s]))
  // ⛔ A FRAME OLDER THAN THE WELD CANNOT BE JUDGED: without `ref` (stamped on every chain by the same
  // step) it also predates `synthetic`, and every unnamed-ramp joint would read as a name transition —
  // a false green. Likewise ribbons that name a chain the skeleton no longer has were poured before it.
  if (!skel.every(s => 'ref' in s)) { console.log(`\n── ${scene}   ⛔ NOT CHECKED — the skeleton predates the H-3 weld (no \`ref\` stamp). Re-pour.`); red = true; continue }
  const ribs = readJson(ribPath).streets || []
  const orphan = ribs.filter(r => !bySkel.has(r.skelId)).map(r => r.skelId)
  if (orphan.length) { console.log(`\n── ${scene}   ⛔ NOT CHECKED — ribbons older than the skeleton (${orphan.length} skelId(s) it no longer has, e.g. ${orphan.slice(0, 3).join(', ')}). Pour: pipeline + promote-ribbons.`); red = true; continue }
  const frame = skel.map(s => ({ id: s.id, highway: s.highway, oneway: !!s.oneway, gs: !!s.gradeSeparated,
    divided: s.phase?.kind === 'divided', synthetic: !!s.synthetic, name: s.name, points: s.points || [] }))
  const drawn = ribs.map(r => ({ id: r.skelId, highway: r.highway, oneway: !!r.oneway,
    gs: !!r.gradeSeparated, divided: r.phase?.kind === 'divided', synthetic: !!bySkel.get(r.skelId)?.synthetic,
    name: r.name, points: r.points || [] }))
  console.log(`\n── ${scene} ──`)
  for (const [label, chains] of [['skeleton', frame], ['ribbons ', drawn]]) {
    const j = joints(chains)
    console.log(`   ${label}: ${j.weldable.length ? '⛔' : '✅'} ${j.weldable.length} weldable joint(s) left between two chains`)
    if (j.weldable.length) { console.log(`      ${list(j.weldable)}`); red = true }
    if (j.divided.length) console.log(`      ⚠️ named exception — ${j.divided.length} divided-carriageway joint(s), not welded by ruling: ${list(j.divided)}`)
    if (j.name.length) console.log(`      ⚠️ named exception — ${j.name.length} name-transition joint(s) between two real names: ${list(j.name)}`)
  }
}
console.log(red
  ? '\n⛔ A highway still draws as fragments at a weldable joint. Re-pour the town (skeleton.js welds; pipeline + promote-ribbons carry it to the ribbons).'
  : '\n✅ No weldable highway joint survives in any frame or ribbons.')
process.exit(red ? 1 : 0)
