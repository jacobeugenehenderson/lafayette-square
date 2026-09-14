#!/usr/bin/env node
// ⭐⭐ DOES A NON-VEHICULAR WAY BOUND A CITY BLOCK? — the check behind `ROADMAP A19`.
//
// THE CANON (`SKELETON.md §2` `paths[]`): "Non-vehicular UNNAMED ways (footway/cycleway/steps/
// service) — Render pavement-only, no measure authoring." And `§3 step 7`: "Unnamed vehicular
// (motorway/trunk/*_link) → streets with synthetic names. Everything else → paths[]." A footway
// is pavement drawn INSIDE a block (`buildPathRibbons` clips it to the parcel interior,
// `ARCHITECTURE.md:142` / `BAKE.md §3`). It is not a block boundary and takes no authoring.
//
// ⛔ THE RULE IS KEYED ON THE WORD "UNNAMED", AND NOTHING RE-CHECKS THE CLASS. `skeleton.js §3`
// step 1 buckets by NAME; every named group goes through `makeStreet` (step 6) whatever its
// `highway` tag says. Only the unnamed bucket ever reaches `paths[]`. So a NAMED footway becomes
// a street chain and bounds blocks — and is ALSO stroked as a path inside them.
//
// ⭐ THIS READS THE SOURCE, IT DOES NOT RESTATE IT (`CLAUDE.md` PRUNE §1): the classes come off
// the artifacts, the double-carry is derived by joining `streets[]` to `paths[]`. No number here
// is copied from a doc, and none should be copied OUT of here — re-run it.
//
// ▶ node checks/claims-named-way-becomes-street.mjs [scene ...]
import fs from 'fs'
import { ribbonsPath, ribbonScenes } from './_scenes.mjs'

// Non-vehicular classes. ⛔ `service` is deliberately NOT here: a service road is vehicular
// (driveways, alleys) and legitimately bounds a block. The canon's §2 list lumps it in because
// that sentence is about UNNAMED ways, where the distinction does not arise.
const NONVEHICULAR = ['pedestrian', 'footway', 'path', 'cycleway', 'steps']
// ⛔ CHILLERED, not deferred (`ROADMAP` ordering constraint, Jacob 2026-08-13). A check must
// report CHILLERED, never a number — sizing a class on them is how noise becomes a skip list.
const CHILLERED = ['ksi-y-m-yn', 'centrum']

const scenes = ribbonScenes()
const RIB = ribbonsPath

let anyBound = false
for (const scene of scenes) {
  if (CHILLERED.includes(scene)) { console.log(`\n${scene}   ⛔ CHILLERED — not sized, by ruling`); continue }
  const path = RIB(scene)
  if (!fs.existsSync(path)) { console.log(`\n${scene}   ⛔ no ribbons at ${path} — SKIPPED LOUDLY`); continue }
  const rb = JSON.parse(fs.readFileSync(path, 'utf8'))
  const streets = (rb.streets || []).filter(s => s?.points?.length >= 2)
  const paths = rb.paths || []
  const nv = streets.filter(s => NONVEHICULAR.includes(s.highway))
  const named = nv.filter(s => s.name)
  const names = new Set(named.map(s => s.name))
  const pathNames = new Set(paths.filter(p => p.name).map(p => p.name))
  const both = [...names].filter(n => pathNames.has(n))

  console.log(`\n${scene}   streets ${streets.length}   paths ${paths.length}`)
  console.log(`   NON-VEHICULAR WAYS SITTING IN streets[] — i.e. bounding blocks:  ${nv.length}`)
  if (!nv.length) { console.log('   ✅ none — this town cannot exhibit the class'); continue }
  anyBound = true
  console.log(`      of those NAMED ${named.length} · UNNAMED ${nv.length - named.length}   ⇒ ${named.length === nv.length ? 'every one got in by having a NAME' : '⚠️ an unnamed one got through — a DIFFERENT door, investigate'}`)
  console.log(`      distinct names ${names.size} · ALSO stroked as a path inside those blocks: ${both.length}  (the double carry)`)
  const byClass = {}
  for (const s of nv) byClass[s.highway] = (byClass[s.highway] || 0) + 1
  console.log(`      by class   ${Object.entries(byClass).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  ')}`)
  const big = [...named].sort((a, b) => b.points.length - a.points.length).slice(0, 5)
  console.log(`      the largest, so the scale is not mistaken for slivers:`)
  for (const s of big) console.log(`         ${String(s.points.length).padStart(5)} pts   ${s.highway.padEnd(11)} ${s.name}`)
}
console.log(`\n${anyBound
  ? '⛔ A NON-VEHICULAR WAY IS BOUNDING CITY BLOCKS — the canon says it should be pavement inside one (ROADMAP A19)'
  : '✅ no non-vehicular way bounds a block on any scene checked'}\n`)
process.exit(anyBound ? 1 : 0)
