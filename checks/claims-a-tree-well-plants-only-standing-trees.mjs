#!/usr/bin/env node
/**
 * claims-a-tree-well-plants-only-standing-trees.mjs — a declared tree well (sources.json `trees`; cartograph/fetch-trees.mjs)
 * plants the trees that stand, says what it did not plant, and reaches BOTH tree entry points.
 *
 *   node checks/claims-a-tree-well-plants-only-standing-trees.mjs
 *
 * BRIEF-nyc-adapter §3.2a ("trees become a well kind"). Hermetic — drives the code that runs:
 *  1. STANDING vs GONE — a record that a tree was removed / is a stump is never planted (NYC Forestry `tpstructure`
 *     Retired/Stump/Shaft; the 2015 census `status: Stump`), and is counted.
 *  2. SUPERSESSION — a later survey's explicit "gone" record within DEDUP_M removes an older well's tree, counted; the
 *     mere ABSENCE of a tree in the later survey removes nothing.
 *  3. ONE TRUNK RADIUS — DEDUP_M has one home (arborist/census-dedup.mjs), read by the bake and the fetch.
 *  4. BOTH ENTRY POINTS read the declared wells through the same call (sources.js#declaredTreeWellPaths) — the two lists
 *     drifted once and LS shipped with no street trees (tree-bake-inputs.mjs header).
 * ⭐ MUTANTS (each RED): plant a stump · let absence supersede · supersede at 2× the radius · drop the declared wells from
 *    either entry point.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assembleTreeWells } from '../cartograph/fetch-trees.mjs'
import { STATES } from '../cartograph/states/index.mjs'
import { DEDUP_M } from '../arborist/census-dedup.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const fails = [], ok = []
const check = (name, pass, detail = '') => (pass ? ok : fails).push(`${name}${detail ? ' — ' + detail : ''}`)
const throws = (fn, re) => { try { fn(); return false } catch (e) { return re.test(e.message) } }

// 1. the readers: standing vs gone
const F = STATES.NY.trees['nyc-forestry'].read, C = STATES.NY.trees['nyc-street-census-2015'].read
const loc = { location: { coordinates: [-73.89, 40.75] } }
for (const [st, want] of [['Full', true], ['Retired', false], ['Stump', false], ['Shaft', false], ['Stump - Uprooted', false]])
  check(`Forestry tpstructure "${st}" → standing ${want}`, F({ ...loc, tpstructure: st, genusspecies: 'Morus - mulberry' }).standing === want)
check('Forestry species is the Latin half; the common name rides beside it', (({ species, common }) => species === 'Morus' && common === 'mulberry')(F({ ...loc, tpstructure: 'Full', genusspecies: 'Morus - mulberry' })))
for (const [st, want] of [['Alive', true], ['Dead', true], ['Stump', false]])
  check(`2015 census status "${st}" → standing ${want}`, C({ latitude: '40.75', longitude: '-73.89', status: st }).standing === want)

// 1–2. assembly + supersession
const T = (x, z, standing = true) => ({ x, z, standing })
{ const r = assembleTreeWells([{ id: 'old', rows: [T(0, 0), T(10, 0), T(20, 0), T(40, 0, false), T(NaN, NaN)] }]).get('old')
  check('a GONE record is never planted, and is counted', r.trees.length === 3 && r.removals.length === 1, JSON.stringify({ trees: r.trees.length, removals: r.removals.length }))
  check('a record with no position is counted, not planted', r.unlocated === 1) }
{ const res = assembleTreeWells([
    { id: 'live', supersedes: ['census'], rows: [T(0.5, 0, false), T(20, 0)] },          // gone at 0.5 m from census tree #1; standing near #3
    { id: 'census', rows: [T(0, 0), T(10, 0), T(20.4, 0), T(0, DEDUP_M * 1.5)] }])
  const c = res.get('census')
  check('a later "gone" record within DEDUP_M removes the older tree, counted', c.trees.length === 3 && c.supersededBy.live === 1, JSON.stringify({ n: c.trees.length, by: c.supersededBy }))
  check('a tree the later survey simply LACKS is kept (absence proves nothing)', c.trees.some(t => t.x === 10))
  check('a tree beyond DEDUP_M of a gone record is kept', c.trees.some(t => t.z === DEDUP_M * 1.5)) }
{ const r = assembleTreeWells([{ id: 'w', rows: [{ x: 0, z: 0, standing: true, dead: true, recordId: 'd1' }, { x: 9, z: 0, standing: true, recordId: 'a1' }] }]).get('w')
  check('a standing DEAD tree is kept on record, not planted, counted', r.trees.length === 1 && r.dead.length === 1 && r.dead[0].recordId === 'd1') }
{ const res = assembleTreeWells([{ id: 'live', supersedes: ['census'], rows: [{ x: 0.5, z: 0, standing: false }] }, { id: 'census', rows: [{ x: 0, z: 0, standing: true, recordId: 'c7' }] }])
  check('a superseded tree is NAMED by its record id', res.get('census').supersededIds.live?.[0] === 'c7', JSON.stringify(res.get('census').supersededIds)) }
check('NYC Forestry declares itself the later survey of the 2015 census', JSON.stringify(STATES.NY.trees['nyc-forestry'].supersedes) === '["nyc-street-census-2015"]')
check('a dead Forestry tree reads dead; a dead census tree reads dead', F({ ...loc, tpstructure: 'Full', tpcondition: 'Dead' }).dead === true && C({ latitude: '40.75', longitude: '-73.89', status: 'Dead' }).dead === true)
check('superseding a well the town does not declare THROWS', throws(() => assembleTreeWells([{ id: 'a', supersedes: ['nope'], rows: [] }]), /does not declare/))

// 3. one trunk radius
const files = []
const walk = (d) => { for (const e of readdirSync(d)) { if (e === 'node_modules' || e.startsWith('_archive') || e.startsWith('.')) continue
  const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else if (/\.(m?js)$/.test(e)) files.push(p) } }
walk(join(ROOT, 'cartograph')); walk(join(ROOT, 'arborist'))
const homes = files.filter(f => /\bDEDUP_M\s*=\s*\d/.test(readFileSync(f, 'utf8'))).map(f => relative(ROOT, f))
check('DEDUP_M is defined once — arborist/census-dedup.mjs', homes.length === 1 && homes[0] === 'arborist/census-dedup.mjs', homes.join(', '))

// 4. both entry points
for (const f of ['cartograph/tree-bake-inputs.mjs', 'arborist/bake-trees.js'])
  check(`${f} reads the declared tree wells (declaredTreeWellPaths(scene))`, /\.\.\.declaredTreeWellPaths\(scene\)/.test(readFileSync(join(ROOT, f), 'utf8')))

for (const o of ok) console.log(`✓ ${o}`)
for (const f of fails) console.log(`✗ ${f}`)
process.exit(fails.length ? 1 : 0)
