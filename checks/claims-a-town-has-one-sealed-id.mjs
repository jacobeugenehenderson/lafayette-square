#!/usr/bin/env node
/**
 * "DOES EVERY BACKEND KNOW A TOWN BY ITS SEALED ID — NEVER BY ITS NAME?"
 *
 * WHY (Jacob, 2026-10-04, BRIEF-rename-hpdm-to-its-address). The Apps Script tenant, the Operations overlay and the
 * Ward's calls were all keyed by the town's look/map NAME, so renaming Hi-Pointe–DeMun would have pointed it at empty
 * tabs and an absent overlay — its claims and Host edits detached, and nothing erred. A town's backend key is now an
 * opaque id, minted once in `cartograph/data/<map>/town-id.json`, never shown to operators, never derived from a name.
 *
 * Asserts:
 *   1. every town-id.json holds one well-formed id, and no two towns share one;
 *   2. every registered town carries its file's id (the registry attaches it; a town without one cannot load);
 *   3. no id has changed since its file was first committed (followed across a rename — a rename moves the file);
 *   4. every town id the Apps Script names is a sealed one (a typo would be a town with no rows);
 *   5. the Apps Script opens only tabs its schema knows, and its schema names no tab nothing opens;
 *   6. the kit's backend clients send `tenant` from `townTenant()` and never a look.
 *
 *   node checks/claims-a-town-has-one-sealed-id.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const ID = /^tw-[a-z0-9]{8}$/
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8')
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' })

console.log('\nA town has one sealed id')

// 1 — the files
const dataDir = path.join(ROOT, 'cartograph/data')
const sealed = {}   // map -> id
for (const map of readdirSync(dataDir)) {
  const rel = `cartograph/data/${map}/town-id.json`
  if (!existsSync(path.join(ROOT, rel))) continue
  const { townId } = JSON.parse(read(rel))
  if (!ID.test(townId || '')) bad(`${rel}: townId ${JSON.stringify(townId)} is not a sealed id (tw- + 8 lowercase letters/digits)`)
  sealed[map] = townId
}
const byId = {}
for (const [map, id] of Object.entries(sealed)) (byId[id] ||= []).push(map)
const shared = Object.entries(byId).filter(([, maps]) => maps.length > 1)
if (shared.length) bad(`towns share an id: ${shared.map(([id, maps]) => `${id} = ${maps.join(' + ')}`).join('; ')}`)
else ok(`${Object.keys(sealed).length} towns, ${Object.keys(sealed).length} distinct ids`)

// 2 — the registry carries them
const { registeredMaps, instanceForMap } = await import(path.join(ROOT, 'src/instances/registry.js'))
for (const map of registeredMaps()) {
  const t = instanceForMap(map)
  if (!sealed[map]) bad(`${map} is registered but has no cartograph/data/${map}/town-id.json`)
  else if (t.townId !== sealed[map]) bad(`${map}: the registry carries ${t.townId}, its file seals ${sealed[map]}`)
}
if (registeredMaps().every(m => instanceForMap(m).townId === sealed[m])) ok(`every registered town (${registeredMaps().length}) carries its sealed id`)

// 3 — never changed since first committed
for (const [map, id] of Object.entries(sealed)) {
  const rel = `cartograph/data/${map}/town-id.json`
  const log = git('log', '--follow', '--format=%H', '--name-only', '--', rel).trim().split('\n').filter(Boolean)
  if (log.length < 2) { console.log(`  ⏳ ${map}: ${rel} is not committed yet — nothing to compare`); continue }
  const [first, firstPath] = log.slice(-2)
  const was = JSON.parse(git('show', `${first}:${firstPath}`)).townId
  if (was !== id) bad(`${map}: its id was ${was} when first committed (${first.slice(0, 8)}) and is ${id} now — every backend row for it would detach`)
  else ok(`${map}: ${id} unchanged since ${first.slice(0, 8)}`)
}

// 4 — the Apps Script names only sealed ids
const gas = read('apps-script/Code.js')
const named = [...new Set(gas.match(/tw-[a-z0-9]{8}/g) || [])]
const unknown = named.filter(id => !byId[id])
if (unknown.length) bad(`apps-script/Code.js names id(s) no town seals: ${unknown.join(', ')}`)
else ok(`every id the Apps Script names (${named.length}) is a sealed town's`)

// 5 — the Apps Script's tabs are its schema's
const schemaSrc = gas.slice(gas.indexOf('var TAB_HEADERS = {'), gas.indexOf('\n}\n', gas.indexOf('var TAB_HEADERS = {')))
const schema = new Set([...schemaSrc.matchAll(/^\s*'([A-Za-z]+)':/gm)].map(m => m[1]))
const opened = new Set([...gas.matchAll(/getSheet\('([A-Za-z]+)'\)/g)].map(m => m[1]))
const unlisted = [...opened].filter(n => !schema.has(n)), unopened = [...schema].filter(n => !opened.has(n))
if (!schema.size) bad('could not read TAB_HEADERS out of apps-script/Code.js')
else if (unlisted.length || unopened.length) bad(`the Apps Script's tabs and its schema disagree — opened but not in TAB_HEADERS: [${unlisted.join(', ')}] · in TAB_HEADERS but never opened: [${unopened.join(', ')}]`)
else ok(`the Apps Script opens exactly its schema's ${schema.size} tabs`)

// 6 — the kit's clients send the sealed tenant, never a look
for (const rel of ['src/lib/api.js', 'src/lib/commerceApi.js']) {
  const src = read(rel)
  if (/\blook\s*:|['"]look['"]/.test(src)) bad(`${rel} still sends a look to the backend`)
  else if (!/townTenant\(\)/.test(src)) bad(`${rel} does not name the town by townTenant()`)
  else ok(`${rel} names the town by its sealed tenant`)
}

console.log(failed ? `\n${failed} FAILED` : '\nall held')
process.exit(failed ? 1 : 0)
