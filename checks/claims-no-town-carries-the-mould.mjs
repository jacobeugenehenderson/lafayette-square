#!/usr/bin/env node
/**
 * "DOES ANY TOWN CARRY ANOTHER TOWN'S PLACES?" — continuity map §7 #2 (Phase 2 C, 2026-10-04).
 *
 * A place is a coordinate in a town's own frame: a camera pose, a frame box, a title position. Copied into another
 * town it points at nothing there, and nothing errs. Measured 2026-10-04: LS's building-footprint box
 * `{cx:95,cz:-158,w:1292,h:1025}` sits in every town's `shots.values.browse.bounds` (a store default autosaved as if
 * authored), and Huron carries LS's `parkTitlePos`, baked into its labels.json.
 *
 * ⭐ NOT "EQUALS LAFAYETTE SQUARE'S": LS is only the first town. Every pair of towns is compared, so town #2's
 * places leaking into town #3 are caught the same way.
 *
 * What is compared: every `PLACE_DESIGN_FIELDS` field (cartograph/lookDesign.mjs, the seed strip's own list), in each
 * town's home Look design.json AND its baked scene.json, plus the set-piece title positions baked into labels.json. A field is walked down to its smallest all-numeric pieces —
 * a position `[x,z]`, a pose `[x,y,z]`, a box `{cx,cz,w,h}` — and two towns sharing one is a finding.
 * ⛔ Not a lone number: two towns may share an altitude or a duration by coincidence; a shared coordinate pair may not.
 *
 *   node checks/claims-no-town-carries-the-mould.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const { PLACE_DESIGN_FIELDS } = await import(path.join(ROOT, 'cartograph/lookDesign.mjs'))
const readJson = (p) => existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
const idx = readJson(path.join(ROOT, 'public/looks/index.json'))
const towns = [...new Set((idx.looks || []).map(l => l.scene).filter(Boolean))]

// A coordinate key. ⛔ An all-numeric object WITHOUT one is not a place: `{fov, eyeHeight}` is a lens and a human eye,
// and every town may share them. ⛔ Kit defaults are NOT exempted: LS's box reached every town as the store's default.
const COORD = /^(x|y|z|cx|cy|cz|lat|lon|lng)$/i

/** [path, json] for every smallest all-numeric place (≥2 numbers: an array, or an object with a coordinate key). */
export function places(node, at = '') {
  if (node == null || typeof node !== 'object') return []
  const vals = Object.values(node)
  const numeric = vals.length >= 2 && vals.every(v => typeof v === 'number' && Number.isFinite(v))
  if (numeric && (Array.isArray(node) || Object.keys(node).some(k => COORD.test(k)))) return [[at, JSON.stringify(node)]]
  if (numeric) return []
  return Object.entries(node).flatMap(([k, v]) => places(v, at ? `${at}.${k}` : k))
}

function findings(sources) {
  const seen = new Map()   // json -> [{town, where}]
  for (const [town, where, doc] of sources) {
    for (const f of [...PLACE_DESIGN_FIELDS, 'setPieceTitles']) {   // labels.json carries the baked title positions
      for (const [p, json] of places(doc?.[f], f)) {
        if (!seen.has(json)) seen.set(json, [])
        seen.get(json).push({ town, where: `${where} ${p}` })
      }
    }
  }
  return [...seen].filter(([, hits]) => new Set(hits.map(h => h.town)).size > 1)
}

// ⭐ The detector must fire before its silence means anything.
const planted = findings([['a', 'fixture', { parkTitlePos: [1, 2] }], ['b', 'fixture', { parkTitlePos: [1, 2] }], ['c', 'fixture', { parkTitlePos: [3, 4] }]])
if (planted.length !== 1) { console.log('⛔ the detector does not fire on two towns sharing a planted position — its silence below means nothing'); process.exit(2) }

const sources = []
for (const t of towns) {
  const d = readJson(path.join(ROOT, 'public/looks', t, 'design.json'))
  const s = readJson(path.join(ROOT, 'public/baked', t, 'scene.json'))
  if (d) sources.push([t, 'design.json', d])
  if (s) sources.push([t, 'scene.json', s])
  const lb = readJson(path.join(ROOT, 'public/baked', t, 'labels.json'))
  if (lb) sources.push([t, 'labels.json', { setPieceTitles: lb.setPieceTitles }])
}
console.log(`\nNo town carries another town's places — ${towns.length} towns, fields: ${PLACE_DESIGN_FIELDS.join(', ')}\n`)
if (sources.length < 2) { console.log('⛔ NOT CHECKED — fewer than two towns have a design to compare'); process.exit(2) }
const found = findings(sources)
for (const [json, hits] of found) {
  const byTown = {}
  for (const h of hits) (byTown[h.town] ||= []).push(h.where)
  console.log(`  ⛔ ${json} — in ${Object.keys(byTown).length} towns:`)
  for (const [t, w] of Object.entries(byTown)) console.log(`       ${t.padEnd(18)} ${[...new Set(w)].join(' · ')}`)
}
if (!found.length) console.log("  ✅ every town's places are its own")
console.log(found.length ? `\n⛔ ${found.length} place(s) shared between towns — each is one town's coordinate in another's frame\n` : '\nall held\n')
process.exit(found.length ? 1 : 0)
