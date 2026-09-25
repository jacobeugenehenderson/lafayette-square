#!/usr/bin/env node
// ⛔ DID THE SKELETON REACH THE RIBBONS? — the gate that let `ROADMAP A19` sit unseen (2026-09-23).
//
// `skeleton.json` is the frame; `ribbons.json` is what Survey draws. Between them sit
// `pipeline.js` + `promote-ribbons.js`, and until 2026-09-23 the Bake ran those on LS only — so
// Huron's re-skeleton (US 6 promoted) sat in skeleton.json while Survey and the slab drew the old
// ribbons, and nothing said so.
//
// ⭐ Judged on CONTENT, not mtime: every skeleton street id must be a ribbons `skelId`, and every
// ribbons `skelId` must be a skeleton street — the same set, both ways. An mtime says a file was
// touched; this says the frame arrived. Ribbons live where `promote-ribbons.js` writes them: the
// default scene's in the runtime bundle, every other town's in its own clean/ — read from that file,
// not restated.
//
// ▶ node checks/claims-ribbons-are-not-older-than-the-skeleton.mjs [scene ...]
//   --skeleton=<path>   compare one named scene against another skeleton (mutation testing)
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const skelOverride = process.argv.find(a => a.startsWith('--skeleton='))?.slice('--skeleton='.length)

// promote-ribbons.js's own rule, which lives in applySnapshot.mjs — CALLED, not re-parsed.
const { promotedRibbonsPath: ribbonsOf } = await import(join(ROOT, 'cartograph/applySnapshot.mjs'))

let red = false
for (const scene of scenes('cartograph/data/<scene>/raw/osm.json')) {
  const skelPath = skelOverride || join(ROOT, 'cartograph/data', scene, 'clean/skeleton.json')
  const ribPath = ribbonsOf(scene)
  const missing = [skelPath, ribPath].filter(p => !existsSync(p))
  if (missing.length) { console.log(`\n── ${scene}   ⛔ NOT CHECKED — missing ${missing.join(', ')}`); red = true; continue }
  const skelIds = new Set((readJson(skelPath).streets || []).map(s => s.id))
  const ribIds = new Set((readJson(ribPath).streets || []).map(s => s.skelId))
  const notDrawn = [...skelIds].filter(id => !ribIds.has(id))
  const notFramed = [...ribIds].filter(id => !skelIds.has(id))
  const ok = !notDrawn.length && !notFramed.length
  console.log(`\n── ${scene} ── skeleton ${skelIds.size} · ribbons ${ribIds.size}  ${ok ? '✅' : '⛔'}`)
  if (notDrawn.length) console.log(`   ⛔ ${notDrawn.length} skeleton street(s) not in the ribbons: ${notDrawn.slice(0, 6).join(' · ')}${notDrawn.length > 6 ? ' …' : ''}`)
  if (notFramed.length) console.log(`   ⛔ ${notFramed.length} ribbons street(s) not in the skeleton: ${notFramed.slice(0, 6).join(' · ')}${notFramed.length > 6 ? ' …' : ''}`)
  if (!ok) red = true
}

console.log(red
  ? '\n⛔ A skeleton has not reached its ribbons. Pour the town (pipeline.js + promote-ribbons.js) — the Bake now does, for every OSM town.'
  : '\n✅ Every town\'s ribbons carry exactly its skeleton\'s streets.')
process.exit(red ? 1 : 0)
