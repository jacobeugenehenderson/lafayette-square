#!/usr/bin/env node
/**
 * claims-buildings-are-the-union.mjs
 *
 * ⛔ THE CLASS: one footprint well hiding another. pipeline.js used MSBF INSTEAD OF OSM, so every
 * building MSBF missed vanished (provincetown: the Crown & Anchor, the Public Library, the Red Inn,
 * the police station…), and bake-content called their listings "correctly absent".
 *
 * Asserts:
 *   union/keeps-osm-only       BEHAVIOUR — an OSM footprint MSBF lacks is added, as osm-<id>.
 *   union/merges-twins         BEHAVIOUR — a centroid-contained twin and an offset, mostly-covered
 *                              twin are the same building (MSBF's geometry kept, not doubled).
 *   union/keeps-separate       BEHAVIOUR — a neighbour that merely touches an MSBF footprint is kept.
 *   union/twin-joins-carried   a merged twin's OSM footprint rides along as a JOIN ring and the join tests it.
 *   pour-and-extent-use-it     pipeline.js's MSBF branch and Extent's footprint list both call
 *                              unionFootprints, so what Extent shows is what pours.
 *
 *     node checks/claims-buildings-are-the-union.mjs [--self-test]
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const { unionFootprints } = await import(join(ROOT, 'cartograph/building-union.mjs'))

const sq = (x, z, w, h = w) => [{ x, z }, { x: x + w, z }, { x: x + w, z: z + h }, { x, z: z + h }]
const MSBF = [{ msbfId: 1, coords: sq(0, 0, 10) }, { msbfId: 2, coords: sq(100, 0, 10) }, { msbfId: 3, coords: sq(200, 0, 10) }]
const OSM = [
  { osmId: 11, tags: { building: 'yes' }, coords: sq(1, 1, 8) },        // twin: centroid inside msbf 1
  { osmId: 12, tags: { building: 'yes' }, coords: sq(102, 3, 10) },     // twin offset: centroid (107,8) inside msbf 2 region? covered majority
  { osmId: 13, tags: { building: 'yes' }, coords: sq(50, 50, 12) },     // OSM-only: nowhere near MSBF
  { osmId: 14, tags: { building: 'yes' }, coords: sq(210, 0, 10) },     // neighbour touching msbf 3's edge
]

function loadSources() { return { unionFootprints, pipeline: read('cartograph/pipeline.js'), serve: read('cartograph/serve.js'), content: read('cartograph/bake-content.js'), derive: read('cartograph/derive.js') } }

function run(S) {
  const out = []
  const assert = (name, ok, detail) => out.push({ name, ok: !!ok, detail })
  const u = S.unionFootprints(MSBF, OSM).buildings
  const osmIds = new Set(u.filter(b => b.osmId != null).map(b => b.osmId))
  assert('union/keeps-osm-only', osmIds.has(13), 'an OSM building MSBF lacks was not added')
  assert('union/merges-twins', !osmIds.has(11) && !osmIds.has(12) && u.filter(b => b.msbfId != null).length === 3,
    `a twin was doubled (osm ids kept: ${[...osmIds].join(', ')})`)
  assert('union/keeps-separate', osmIds.has(14), 'a separate neighbour that touches an MSBF footprint was dropped')
  // A merged twin's footprint must ride along as a JOIN ring, and the join must test it — or a place
  // whose point is in OSM's footprint (offset by metres) finds no building (provincetown's five).
  const m1 = u.find(b => b.msbfId === 1)
  assert('union/twin-joins-carried', (m1?.twinOsmIds || []).includes(11) && m1?.joinRings?.length === 1 &&
    /joinRings/.test(S.derive) && /\(b\.rings \|\| \[b\.ring\]\)\.some\(r => pointInPolygon/.test(S.content),
    "a merged OSM twin's footprint is not carried to the containment join")
  const msbfBranch = /else if \(existsSync\(msbfPath\)\) \{[\s\S]*?\n  \} else/.exec(S.pipeline)?.[0] || ''
  assert('pour-and-extent-use-it', /unionFootprints\(/.test(msbfBranch) && /unionFootprints\(raw\.buildings/.test(S.serve),
    "pipeline.js's MSBF branch or Extent's footprint list no longer uses unionFootprints")
  return out
}

const MUTATIONS = [
  { name: 'union/keeps-osm-only', apply: (S) => ({ ...S, unionFootprints: (m, o) => ({ buildings: m.slice(), report: {} }) }) },
  { name: 'union/merges-twins', apply: (S) => ({ ...S, unionFootprints: (m, o) => ({ buildings: [...m, ...o], report: {} }) }) },
  { name: 'union/keeps-separate', apply: (S) => ({ ...S, unionFootprints: (m, o) => ({ buildings: [...m, ...o.filter(b => b.osmId === 13)], report: {} }) }) },
  { name: 'union/twin-joins-carried', apply: (S) => ({ ...S, content: S.content.replace('(b.rings || [b.ring]).some(r => pointInPolygon(x, z, r))', 'pointInPolygon(x, z, b.ring)') }) },
  { name: 'pour-and-extent-use-it', apply: (S) => ({ ...S, pipeline: S.pipeline.replace('const u = unionFootprints(msbf.buildings, raw.buildings || [])', 'const u = { buildings: msbf.buildings, report: {} }') }) },
]

const S = loadSources()
if (process.argv.includes('--self-test')) {
  const red = run(S).filter(r => !r.ok)
  if (red.length) { for (const r of red) console.log(`⛔ baseline red: ${r.name} — ${r.detail}`); process.exit(1) }
  let bad = 0
  for (const m of MUTATIONS) {
    const hit = run(m.apply(S)).find(r => r.name === m.name)
    if (!hit || hit.ok) { console.log(`  ⛔ ${m.name} — defect planted and the check STAYED GREEN`); bad++ } else console.log(`  ✓ ${m.name} — went red`)
  }
  console.log(bad ? `\n⛔ ${bad} mutation(s) did not fail.` : '\n✅ every mutation produced its named failure.')
  process.exit(bad ? 1 : 0)
}
const res = run(S)
for (const r of res) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`)
const failed = res.filter(r => !r.ok)
console.log(`\n${res.length - failed.length}/${res.length} green`)
process.exit(failed.length ? 1 : 0)
