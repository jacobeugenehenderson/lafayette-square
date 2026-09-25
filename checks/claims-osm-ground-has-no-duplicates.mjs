#!/usr/bin/env node
/**
 * claims-osm-ground-has-no-duplicates.mjs
 *
 * ⛔ THE CLASS: one OSM feature entering a town's ground data twice. fetch.js's ground
 * query outputs tagged ways and then relation MEMBER ways, so a way that is both came back
 * twice and was pushed twice (2026-09-24: provincetown +84 natural, huron +18 landuse). A
 * doubled polygon is a doubled vote wherever features are counted or areas summed.
 *
 * Asserts, per scene's raw/osm.json, per ground bucket:
 *   · a WAY id appears once (relations are exempt: one relation legitimately emits
 *     several rings under its id — they are caught by the next test if truly identical);
 *   · no two features share identical tags + geometry;
 * and, reading fetch.js, that ingestElements still dedupes ways (per bucket) and relations.
 * ⚠️ A town fetched before the fix stays RED until it is re-fetched. That red is true.
 *
 *     node checks/claims-osm-ground-has-no-duplicates.mjs [--self-test]
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'cartograph', 'data')

function loadSources() {
  const scenes = {}
  for (const s of readdirSync(DATA)) {
    const p = join(DATA, s, 'raw', 'osm.json')
    if (existsSync(p)) scenes[s] = JSON.parse(readFileSync(p, 'utf8')).ground || {}
  }
  return { scenes, fetchJs: readFileSync(join(ROOT, 'cartograph', 'fetch.js'), 'utf8') }
}

function run(S) {
  const out = []
  const assert = (name, ok, detail) => out.push({ name, ok: !!ok, detail })
  for (const [scene, ground] of Object.entries(S.scenes)) {
    const idDup = [], geoDup = []
    for (const [bucket, feats] of Object.entries(ground)) {
      if (!Array.isArray(feats)) continue
      const ids = new Map(), geos = new Map()
      for (const f of feats) {
        if (!f.osmType || f.osmType === 'way') ids.set(f.osmId, (ids.get(f.osmId) || 0) + 1)
        const k = JSON.stringify(f.tags || {}) + JSON.stringify((f.coords || []).map(c => [c.lon, c.lat]))
        geos.set(k, (geos.get(k) || 0) + 1)
      }
      const nId = [...ids.values()].reduce((a, n) => a + (n > 1 ? n - 1 : 0), 0)
      const nGeo = [...geos.values()].reduce((a, n) => a + (n > 1 ? n - 1 : 0), 0)
      if (nId) idDup.push(`${bucket} +${nId}`)
      if (nGeo) geoDup.push(`${bucket} +${nGeo}`)
    }
    assert(`${scene}/way-ids-unique`, idDup.length === 0, `repeated way ids (extra copies): ${idDup.join(' · ')} — re-fetch: CARTOGRAPH_SCENE=${scene} node cartograph/fetch.js`)
    assert(`${scene}/no-identical-features`, geoDup.length === 0, `identical tags+geometry (extra copies): ${geoDup.join(' · ')}`)
  }
  assert('fetch/ingest-dedupes-by-way-id', /if \(seen\.has\(el\.id\)\)/.test(S.fetchJs) && /seen\.add\(el\.id\)/.test(S.fetchJs),
    'cartograph/fetch.js#ingestElements no longer dedupes ways by id per target')
  assert('fetch/ingest-dedupes-relations', /if \(relationIds\.has\(el\.id\)\)/.test(S.fetchJs),
    'cartograph/fetch.js#ingestElements no longer dedupes relations by id')
  return out
}

const MUTATIONS = [
  { name: 'fetch/ingest-dedupes-by-way-id',
    apply: (S) => ({ ...S, fetchJs: S.fetchJs.replace('if (seen.has(el.id))', 'if (false)') }) },
  { name: 'fetch/ingest-dedupes-relations',
    apply: (S) => ({ ...S, fetchJs: S.fetchJs.replace('if (relationIds.has(el.id))', 'if (false)') }) },
  { name: 'SCENE/way-ids-unique', dup: true },
  { name: 'SCENE/no-identical-features', dup: true },
]

if (process.argv.includes('--self-test')) {
  // Baseline: a scene with no duplicates. Planting one duplicate must turn BOTH scene
  // assertions red; removing the dedupe from fetch.js must turn its assertion red.
  const base = loadSources()
  const clean = Object.entries(base.scenes).find(([s]) => run({ ...base, scenes: { [s]: base.scenes[s] } }).every(r => r.ok))
  if (!clean) { console.log('⛔ no clean scene to mutate against'); process.exit(1) }
  const [scene, ground] = clean
  const B = { ...base, scenes: { [scene]: ground } }
  const bucket = Object.keys(ground).find(k => ground[k]?.length)
  const dupScene = { [scene]: { ...ground, [bucket]: [...ground[bucket], ground[bucket][0]] } }
  let bad = 0
  for (const m of MUTATIONS) {
    const name = m.name.replace('SCENE', scene)
    const res = run(m.dup ? { ...B, scenes: dupScene } : m.apply(B))
    const hit = res.find(r => r.name === name)
    if (!hit || hit.ok) { console.log(`  ⛔ ${name} — defect planted and the check STAYED GREEN`); bad++ }
    else console.log(`  ✓ ${name} — went red`)
  }
  console.log(bad ? `\n⛔ ${bad} mutation(s) did not fail.` : `\n✅ every mutation produced its named failure (planted in '${scene}').`)
  process.exit(bad ? 1 : 0)
}

const res = run(loadSources())
for (const r of res) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`)
const failed = res.filter(r => !r.ok)
console.log(`\n${res.length - failed.length}/${res.length} green`)
process.exit(failed.length ? 1 : 0)
