#!/usr/bin/env node
// hpdm-identity-lock.test.mjs — STEP 2 acceptance (no network).
// Exercises the exact assignIds() the pipeline calls, against HPDM's real data.
// Run: node scratch/hpdm-identity-lock.test.mjs   (exit 0 = all pass)

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assignIds, keyOf, saveRegistry } from '../cartograph/msbf-identity.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'cartograph/data/hipointe-demun')
const raw = JSON.parse(readFileSync(join(DIR, 'raw/msbf.json'), 'utf8'))
const registry = JSON.parse(readFileSync(join(DIR, 'identity-registry.json'), 'utf8'))
const onDisk = readFileSync(join(DIR, 'identity-registry.json'), 'utf8')

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name}  ${detail}`) }
}
// deterministic shuffle (no Math.random — harness forbids it)
const shuffle = (arr) => arr.map((v, i) => ({ v, r: (i * 2654435761) % arr.length }))
  .sort((a, z) => a.r - z.r).map(o => o.v)

const feats = raw.buildings.map(b => ({ msbfId: b.msbfId, coords: b.coords }))

console.log('\n═══ HPDM identity lock — step 2 acceptance ═══\n')

// 1. ORDER-INDEPENDENCE — a reordered re-fetch preserves every number.
{
  const shuffled = shuffle(feats)
  const { ids, collisions } = assignIds(shuffled.map(f => f.coords), registry, {})
  const restored = shuffled.filter((f, i) => ids[i] === f.msbfId).length
  ok(`shuffled re-fetch restores all ${feats.length} msbfIds`, restored === feats.length, `${restored}/${feats.length}`)
  ok('no coincident-centroid collisions', collisions === 0, `collisions=${collisions}`)
}

// 2. APPEND — a genuinely new footprint takes highWater+1, nothing renumbers.
{
  const novel = [{ lon: 999.1234567, lat: 88.7654321 }, { lon: 999.1234570, lat: 88.7654325 }] // centroid nowhere near HPDM
  const { ids, registry: grown, appended } = assignIds([...feats.map(f => f.coords), novel], registry, {})
  const preserved = feats.every((f, i) => ids[i] === f.msbfId)
  ok('existing footprints unchanged when a new one is added', preserved)
  ok('new footprint = highWater+1', ids[feats.length] === registry.highWater + 1, `got ${ids[ids.length - 1]} want ${registry.highWater + 1}`)
  ok('registry grew by exactly one', appended === 1 && grown.count === registry.count + 1, `appended=${appended} count=${grown.count}`)
}

// 3. NO-OP PARITY — same fetch, same order → byte-identical registry (no churn).
{
  const { registry: reReg } = assignIds(feats.map(f => f.coords), registry, {})
  const serialized = JSON.stringify(reReg, null, 0) + '\n'
  ok('no-op fetch reproduces the on-disk registry byte-for-byte', serialized === onDisk,
    serialized === onDisk ? '' : `len ${serialized.length} vs ${onDisk.length}`)
}

// 4. ANCHOR INTEGRITY — all 192 listing building_ids still resolve.
{
  const listings = JSON.parse(readFileSync(join(DIR, 'content/listings.json'), 'utf8'))
  const arr = Array.isArray(listings) ? listings : listings.listings || []
  const ids = new Set(Object.values(registry.map).map(n => `msbf-${n}`))
  const resolved = arr.filter(l => l.building_id && ids.has(l.building_id)).length
  ok(`all ${arr.length} listing anchors resolve`, resolved === arr.length, `${resolved}/${arr.length}`)
}

// 5. NEW-TOWN PATH — no registry → mint index → freeze → next (reordered) fetch preserves.
{
  const stub = [
    [{ lon: 10.0000001, lat: 50.0000001 }], [{ lon: 10.0000002, lat: 50.0000002 }],
    [{ lon: 10.0000003, lat: 50.0000003 }], [{ lon: 10.0000004, lat: 50.0000004 }],
  ]
  const first = assignIds(stub, null, { scene: 'stub-town', source: 's', dataset: 'd' })
  const mintedByIndex = first.ids.every((id, i) => id === i)
  ok('first fetch mints id = index and freezes a registry', mintedByIndex && first.minting && first.registry.count === 4)
  const reordered = shuffle(stub.map((coords, i) => ({ coords, id: i })))
  const second = assignIds(reordered.map(o => o.coords), first.registry, {})
  const preserved = reordered.every((o, i) => second.ids[i] === o.id)
  ok('second (reordered) fetch preserves the minted numbering', preserved)
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
