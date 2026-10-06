#!/usr/bin/env node
/**
 * claims-a-tide-station-is-in-the-water-or-named.mjs — a town's tide is timed by a CO-OPS station INSIDE its bbox, or
 * by the station the town NAMES (sources.json `tide`), or the acquisition THROWS. Never the nearest by distance.
 *
 *   node checks/claims-a-tide-station-is-in-the-water-or-named.mjs
 *
 * Jacob, 2026-10-05: Jackson Heights' envelope touches Flushing Bay with no station inside it; it names Worlds Fair
 * Marina (8517251). Hermetic — drives cartograph/fetch-water-datums.mjs#chooseTideStation / #namedTideStation.
 * ⭐ MUTANTS (each RED): named beats in-bbox · fall back to the nearest · accept a named id CO-OPS does not list ·
 *    accept a `tide` with no `why`.
 */
import { chooseTideStation, namedTideStation, parseTideDeclaration } from '../cartograph/fetch-water-datums.mjs'
import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const fails = [], ok = []
const check = (name, pass, detail = '') => (pass ? ok : fails).push(`${name}${detail ? ' — ' + detail : ''}`)
const throws = (fn, re) => { try { fn(); return false } catch (e) { return re.test(e.message) } }

const near = { id: '8518750', name: 'The Battery', km: 1.2, inBbox: false }
const named = { id: '8517251', name: 'Worlds Fair Marina', km: 3.0, inBbox: false }
const inside = { id: '8516945', name: 'Kings Point', km: 9.0, inBbox: true }
const stations = [near, named, inside]

check('a station inside the bbox wins, even when another is named', chooseTideStation(stations, { station: '8517251', why: 'w' }, 't').station === inside)
{ const c = chooseTideStation([near, named], { station: '8517251', why: 'Flushing Bay' }, 't')
  check('with none inside, the NAMED station is used and says why', c.station === named && /named/.test(c.why) && /Flushing Bay/.test(c.why), c.why) }
check('with none inside and none named it THROWS — never the nearest', throws(() => chooseTideStation([near, named], null, 't'), /none named/))
check('a declaration with no reason THROWS', throws(() => parseTideDeclaration({ station: '8517251' }), /must be/))
check('a declaration that is not a 7-digit id THROWS', throws(() => parseTideDeclaration({ station: 'Flushing', why: 'w' }), /must be/))
check('no declaration reads as none', parseTideDeclaration(undefined) === null)
check('a named id CO-OPS does not list THROWS', throws(() => chooseTideStation([near], { station: '9999999', why: 'w' }, 't'), /does not list/))

for (const t of readdirSync(join(ROOT, 'cartograph/data')).filter(d => statSync(join(ROOT, 'cartograph/data', d)).isDirectory())) {
  const p = join(ROOT, 'cartograph/data', t, 'sources.json')
  if (!existsSync(p) || JSON.parse(readFileSync(p, 'utf8')).tide == null) continue
  let n = null; try { n = namedTideStation(t) } catch (e) { check(`${t}: its tide declaration reads`, false, e.message.split('\n')[0]); continue }
  check(`${t}: names tide station ${n.station} with a reason`, /^\d{7}$/.test(n.station) && n.why.length > 0)
}

for (const o of ok) console.log(`✓ ${o}`)
for (const f of fails) console.log(`✗ ${f}`)
process.exit(fails.length ? 1 : 0)
