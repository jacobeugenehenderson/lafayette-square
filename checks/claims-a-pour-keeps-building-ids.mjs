#!/usr/bin/env node
// ⛔⛔ DOES A RE-POUR KEEP EVERY BUILDING'S ID? — a hard gate (Jacob, 2026-09-23).
//
// Building ids are minted ONCE, at fetch (`fetch-msbf.js` → `identity-registry.json`, the seal).
// `pipeline.js` carries `msbfId` into `clean/map.json`, and the building bake writes `msbf-<N>`
// into `public/baked/<scene>/buildings.json`. A re-pour (skeleton → pipeline → bake) must
// therefore move no id — every placement, photo, override and listing is keyed on them.
//
// WHAT THIS DOES, per town: reads the sorted msbfId set out of `clean/map.json` and the sorted
// `id` set out of `buildings.json`, and requires them to be the SAME set, by the bake's own
// spelling (`msbf-<N>`, read off the baked ids — never restated). With `--record=<file>` it also
// writes `{scene: {registrySha, mapIds, bakedIds}}`; with `--before=<file>` it compares against one,
// so a pour is gated before AND after:
//   ▶ node checks/claims-a-pour-keeps-building-ids.mjs --record=/tmp/ids.before.json huron
//     … pour …
//   ▶ node checks/claims-a-pour-keeps-building-ids.mjs --before=/tmp/ids.before.json huron
//
// ⭐ Reads the artifacts, restates nothing. ⛔ Never run a fetch to "fix" a red here.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const recordTo = arg('record'), beforeFrom = arg('before')
const before = beforeFrom ? JSON.parse(readFileSync(beforeFrom, 'utf8')) : null

const sha = (p) => existsSync(p) ? createHash('sha1').update(readFileSync(p)).digest('hex') : null
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

let red = false
const record = {}
for (const scene of scenes('public/baked/<scene>/buildings.json')) {
  const mapPath = join(ROOT, 'cartograph/data', scene, 'clean/map.json')
  const bakedPath = join(ROOT, 'public/baked', scene, 'buildings.json')
  if (!existsSync(mapPath)) { console.log(`\n── ${scene}   ⛔ NOT CHECKED — no clean/map.json`); red = true; continue }
  const mapIds = (JSON.parse(readFileSync(mapPath, 'utf8')).buildings || [])
    .map(b => b.msbfId).filter(v => v != null).map(String).sort()
  const bakedRaw = (JSON.parse(readFileSync(bakedPath, 'utf8')).buildings || []).map(b => String(b.id))
  // The bake's spelling, learned from its own output: a common prefix before the number.
  const prefix = bakedRaw.find(id => /\d+$/.test(id))?.replace(/\d+$/, '') ?? ''
  const bakedIds = bakedRaw.filter(id => id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length)))
    .map(id => id.slice(prefix.length)).sort()
  const registrySha = sha(join(ROOT, 'cartograph/data', scene, 'identity-registry.json'))
  record[scene] = { registrySha, mapIds, bakedIds }

  const lines = []
  if (!same(mapIds, bakedIds)) {
    const m = new Set(mapIds), b = new Set(bakedIds)
    lines.push(`map.json ≠ buildings.json: ${mapIds.filter(x => !b.has(x)).length} only in map, ${bakedIds.filter(x => !m.has(x)).length} only baked`)
  }
  const bf = before?.[scene]
  if (bf) {
    if (bf.registrySha !== registrySha) lines.push(`identity-registry.json CHANGED (${bf.registrySha} → ${registrySha})`)
    if (!same(bf.mapIds, mapIds)) lines.push(`map.json msbfIds CHANGED (${bf.mapIds.length} → ${mapIds.length})`)
    if (!same(bf.bakedIds, bakedIds)) lines.push(`buildings.json ids CHANGED (${bf.bakedIds.length} → ${bakedIds.length})`)
  } else if (before) lines.push('no before-record for this scene')

  console.log(`\n── ${scene} ── map ${mapIds.length} · baked ${bakedIds.length} (prefix "${prefix}") · registry ${registrySha?.slice(0, 12) ?? '—'}`)
  for (const l of lines) console.log(`   ⛔ ${l}`)
  if (lines.length) red = true
}

if (recordTo) { writeFileSync(recordTo, JSON.stringify(record)); console.log(`\n→ recorded ${recordTo}`) }
console.log(red ? '\n⛔ A building id moved. STOP — report before any further pour.' : '\n✅ Building ids are identical.')
process.exit(red ? 1 : 0)
