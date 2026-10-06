#!/usr/bin/env node
/**
 * claims-one-building-id-minter.mjs — a building has ONE id minter and a town has ONE answer to "where do my
 * footprints come from".
 *
 *   node checks/claims-one-building-id-minter.mjs
 *
 * BRIEF-nyc-adapter step 3. The id `msbf-<n>` was minted in FOUR copies (bake-buildings, bake-content, serve.js,
 * membership) that agreed only by copy-paste, and `raw/msbf.json` was read by path at six sites. A city footprint
 * well (NYC: `bin-<BIN>`) needs every one of them to move together — so they became one:
 *  1. THE MINTER — `membership.mjs#buildingIdOf` is the only code that builds an id from `.msbfId`. The scan READS the
 *     source tree, so a fifth copy turns this RED the day it is written.
 *  2. THE WELL — `footprint-well.mjs#footprintWell` is the only reader of `'msbf.json'` by name (fetch-msbf.js, the
 *     well's WRITER, is the other home). An undeclared town says it is on MSBF.
 *  3. THE ID TABLE — stamped id · msbf · osm · curated projectId, in that order.
 * ⭐ MUTANTS (each RED): re-inline `msbf-${b.msbfId}` in bake-buildings · read join(raw,'msbf.json') in pipeline ·
 *    drop projectId from the minter · let an undeclared town's label stop saying MSBF.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildingIdOf } from '../cartograph/membership.mjs'
import { footprintWell } from '../cartograph/footprint-well.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const fails = [], ok = []
const check = (name, pass, detail = '') => (pass ? ok : fails).push(`${name}${detail ? ' — ' + detail : ''}`)

const files = []
const walk = (d) => { for (const e of readdirSync(d)) {
  if (e === 'node_modules' || e.startsWith('_archive') || e.startsWith('.')) continue
  const p = join(d, e), st = statSync(p)
  if (st.isDirectory()) walk(p); else if (/\.(m?js|jsx)$/.test(e)) files.push(p) } }
walk(join(ROOT, 'cartograph')); walk(join(ROOT, 'src'))

// 1. the minter
const MINT = /msbf-\$\{[\w?.]+\.msbfId\}/
const minters = files.filter(f => MINT.test(readFileSync(f, 'utf8'))).map(f => relative(ROOT, f))
check('exactly one file mints a building id from .msbfId — cartograph/membership.mjs',
  minters.length === 1 && minters[0] === 'cartograph/membership.mjs', minters.join(', '))

// 2. the well
const HOMES = new Set(['cartograph/footprint-well.mjs', 'cartograph/fetch-msbf.js'])
const readers = files.filter(f => /['"]msbf\.json['"]/.test(readFileSync(f, 'utf8'))).map(f => relative(ROOT, f)).filter(f => !HOMES.has(f))
check("no code names 'msbf.json' outside its resolver and its writer", readers.length === 0, readers.join(', '))
for (const t of readdirSync(join(ROOT, 'cartograph/data')).filter(d => statSync(join(ROOT, 'cartograph/data', d)).isDirectory())) {
  let fw; try { fw = footprintWell(t) } catch (e) { check(`${t}: its footprint well resolves`, false, e.message.split('\n')[0]); continue }
  if (!fw.declared) check(`${t}: undeclared → MSBF, and SAID`, fw.file === 'msbf.json' && /MSBF/.test(fw.label), fw.label)
  else check(`${t}: declared → ${fw.wellId}`, !!fw.file && fw.file !== 'msbf.json', fw.label)
}

// 3. the id table
for (const [b, want] of [[{ id: 'bin-1', msbfId: 2 }, 'bin-1'], [{ msbfId: 7, osmId: 9 }, 'msbf-7'], [{ osmId: 9 }, 'osm-9'],
  [{ projectId: 'bldg-0001' }, 'bldg-0001'], [{}, null]])
  check(`${JSON.stringify(b)} → ${want}`, buildingIdOf(b) === want, String(buildingIdOf(b)))

for (const o of ok) console.log(`✓ ${o}`)
for (const f of fails) console.log(`✗ ${f}`)
process.exit(fails.length ? 1 : 0)
