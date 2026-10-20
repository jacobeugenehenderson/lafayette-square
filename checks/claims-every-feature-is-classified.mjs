#!/usr/bin/env node
// ⭐⭐ IS EVERY PIECE OF STREET-SCAPE ONE CLASS OUT OF THE ONE VOCABULARY? — `BRIEF-the-classifier §3`.
//
// PASS A ONLY (way class, from tags, in the skeleton). Pass B (faces · tips · crossings, from ①) is
// not built; this check says so every run rather than passing over it.
//
// ⭐ IT READS THE SOURCE, IT DOES NOT RESTATE IT (`CLAUDE.md` PRUNE §1). The vocabulary is imported
// from `src/cartograph/streetClass.js`; the record is the skeleton the pour wrote; each chain's class
// is re-derived from its source ways' RAW tags through that table and compared. No class list is
// copied here.
//
// RED (exit 1) on:
//   · UNCLASSIFIED — a chain or path with no class, a class not in the table, or a source way the
//     table cannot classify (a fallback put back in the pour reads as this);
//   · a CATCH-ALL row in the table (a `highway` rule that is not an explicit list);
//   · a CONTRADICTION — the record says one thing and the class says another:
//       name-made   a chain whose class does not enter the network as a street (a name made it);
//       mixed       a chain whose source ways hold more than one class (a name grouped across classes);
//       seed        a chain of a non-local street class seeded as `residential` (curb, lawn and walk
//                   it should not have: a living street with a curb);
//       stale       the record's class is not one its source ways' tags give.
//   Each contradiction prints its OWNER, the old site that still produces it. Pass A changed no paint,
//   so the owners stand until the consumers are rewired (the brief §2 "Both passes").
//
// ▶ node checks/claims-every-feature-is-classified.mjs [scene ...] [--skeleton=<path with <scene>>]
// ▶ node checks/claims-every-feature-is-classified.mjs <scene> --selftest   (mutation test: each must read RED)
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, eachTown } from './_scenes.mjs'
import { CLASSES, RULES, classifyWay } from '../src/cartograph/streetClass.js'

const argv = process.argv.slice(2)
const scene = eachTown('cartograph/data/<scene>/raw/osm.json')
const SELFTEST = argv.includes('--selftest')
const skelArg = argv.find(a => a.startsWith('--skeleton='))?.slice('--skeleton='.length)
const skelPath = skelArg ? skelArg.replace('<scene>', scene) : join(ROOT, `cartograph/data/${scene}/clean/skeleton.json`)
if (!existsSync(skelPath)) {
  console.error(`⛔ NOT MEASURED — no skeleton at ${skelPath}. Nothing was measured; this is not a pass.`)
  process.exit(2)
}
const RUNGS = new Set(['authored', 'data', 'norm', 'kit'])
// Classes whose `residential` seed does not reach the paint: `streetProfiles#measureFromSeed`
// takes `highwaySection` for a highway class. Disclosed, not RED. Read as a fact about the
// consumer, so it goes when that consumer reads the class.
const SEED_NOT_PAINTED = new Set(['highway', 'highway-link'])

function tableFaults(rules, classes) {
  const out = []
  rules.forEach((r, i) => {
    if (!Array.isArray(r.highway) || !r.highway.length || r.highway.some(h => typeof h !== 'string' || !h || h === '*'))
      out.push(`rule ${i} (${r.class}): highway is not an explicit list — a catch-all`)
    if (!classes[r.class]) out.push(`rule ${i}: class "${r.class}" is not in CLASSES`)
    if (!RUNGS.has(r.rung)) out.push(`rule ${i} (${r.class}): rung "${r.rung}" is not on the ladder`)
  })
  for (const k of Object.keys(classes)) if (!rules.some(r => r.class === k)) out.push(`class "${k}" has no rule (unreachable)`)
  return out
}

function measure(skel, tagsById, { rules = RULES, classes = CLASSES, classify = classifyWay } = {}) {
  const r = { table: tableFaults(rules, classes), unclassified: [], nameMade: [], mixed: [], seed: [], stale: [], seedNotPainted: 0,
    chains: new Map(), paths: new Map(), rungs: new Map(), offGuide: new Map() }
  const where = (s) => { const p = (s.points || s.coords || [])[0]; return p ? `(${p.x.toFixed(0)}, ${p.z.toFixed(0)})` : '(no geometry)' }
  const tally = (m, k) => m.set(k, (m.get(k) || 0) + 1)
  const one = (s, kind) => {
    const label = `${kind} ${s.id}${s.name ? ` "${s.name}"` : ''} ${where(s)}`
    const srcs = kind === 'chain' ? (s.sources || []) : [s.osmId]
    const srcClasses = new Set()
    for (const id of srcs) {
      const t = tagsById.get(id)
      const c = t && classify(t)
      if (!c) { r.unclassified.push(`${label}: source way ${id} ${t ? `highway=${t.highway}` : 'not in raw'} — no class in the table`); continue }
      srcClasses.add(c.class)
    }
    if (!s.class || !classes[s.class] || !RUNGS.has(s.classRung) || !s.classReason) {
      r.unclassified.push(`${label}: record carries class=${s.class ?? '∅'} rung=${s.classRung ?? '∅'}`)
      return
    }
    tally(kind === 'chain' ? r.chains : r.paths, s.class)
    tally(r.rungs, s.classRung)
    if (!classes[s.class].guide) tally(r.offGuide, s.class)
    if (srcClasses.size && !srcClasses.has(s.class)) r.stale.push(`${label}: record says ${s.class}, its ways say ${[...srcClasses].join('/')}`)
    if (kind !== 'chain') return
    if (srcClasses.size > 1) {
      const nets = new Set([...srcClasses].map(k => classes[k].network))
      r.mixed.push(`${label}: ${s.classReason.split('MIXED by name: ')[1] || [...srcClasses].join(' + ')}${nets.size > 1 ? '   [across networks]' : '   [street classes only]'}`)
    }
    if (classes[s.class].network !== 'street') r.nameMade.push(`${label}: class ${s.class} (network ${classes[s.class].network})`)
    else if (s.seed?.seededClass === 'residential' && s.class !== 'local') {
      if (SEED_NOT_PAINTED.has(s.class)) r.seedNotPainted++
      else r.seed.push(`${label}: class ${s.class} seeded residential`)
    }
  }
  for (const s of skel.streets || []) one(s, 'chain')
  for (const p of skel.paths || []) one(p, 'path')
  r.red = r.table.length + r.unclassified.length + r.nameMade.length + r.mixed.length + r.seed.length + r.stale.length
  return r
}

const skel = JSON.parse(readFileSync(skelPath, 'utf8'))
const osm = JSON.parse(readFileSync(join(ROOT, `cartograph/data/${scene}/raw/osm.json`), 'utf8'))
const tagsById = new Map((osm.ground?.highway || []).map(f => [f.osmId, f.tags || {}]))

if (SELFTEST) {
  // Each mutation must RAISE the counter it targets. The clean record is already RED where the old
  // sites stand, so the test is the counter moving, never the exit code alone.
  const clone = () => JSON.parse(JSON.stringify(skel))
  const base = measure(skel, tagsById)
  const local = skel.streets.findIndex(s => s.class === 'local' && s.sources?.length === 1)
  const fp = skel.paths.findIndex(p => p.class === 'path')
  const cases = []
  { // 1 · a residential fallback put back: the pour admits a way the table cannot classify as `local`
    const t = new Map(tagsById); const id = skel.streets[local].sources[0]
    t.set(id, { ...t.get(id), highway: 'mutant_class' })
    cases.push(['fallback: unknown tag poured as local', measure(skel, t).unclassified.length, base.unclassified.length]) }
  { // 1b · the same fallback as a catch-all row in the table
    const rules = [...RULES, { highway: ['*'], class: 'local', rung: 'kit' }]
    cases.push(['fallback: catch-all row in the table', measure(skel, tagsById, { rules }).table.length, base.table.length]) }
  { // 1c · the class field dropped from the record
    const s = clone(); delete s.streets[local].class
    cases.push(['record: a chain with no class', measure(s, tagsById).unclassified.length, base.unclassified.length]) }
  { // 2 · a name-made chain: a footway with a name enters streets[]
    const s = clone(); const p = s.paths[fp]
    s.streets.push({ id: 'mutant-named-footway', name: 'Mutant Walk', points: p.coords, sources: [p.osmId], class: p.class, classRung: p.classRung, classReason: p.classReason, seed: { seededClass: 'residential' } })
    cases.push(['name-made: a named footway as a chain', measure(s, tagsById).nameMade.length, base.nameMade.length]) }
  { // 2b · a name grouping across classes: a footway way welded into a local chain
    const s = clone(); s.streets[local].sources.push(skel.paths[fp].osmId)
    cases.push(['mixed: a footway way in a local chain', measure(s, tagsById).mixed.length, base.mixed.length]) }
  { // 2c · a non-local street seeded residential (the living street with a curb)
    const s = clone(); const c = s.streets[local]; c.class = 'living-street'
    const t = new Map(tagsById); t.set(c.sources[0], { ...t.get(c.sources[0]), highway: 'living_street' })
    cases.push(['seed: living street seeded residential', measure(s, t).seed.length, base.seed.length]) }
  console.log(`\n${scene} — mutation test (each must read RED: its counter must rise)`)
  let ok = true
  for (const [what, got, was] of cases) { const red = got > was; ok &&= red; console.log(`   ${red ? '✅ RED' : '⛔ STILL GREEN'}  ${what}   (${was} → ${got})`) }
  console.log(`   ·  dropped tip tag — Pass B (tips) is not built; not testable here`)
  console.log(ok ? '\n✅ every mutation reads RED' : '\n⛔ A MUTATION WENT UNSEEN — the check is blind to it')
  process.exit(ok ? 0 : 1)
}

const r = measure(skel, tagsById)
const fmt = (m) => [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ') || '(none)'
const list = (title, owner, xs, n = 8) => {
  if (!xs.length) { console.log(`   ✅ ${title}: 0`); return }
  console.log(`   ⛔ ${title}: ${xs.length}   — owner: ${owner}`)
  for (const x of xs.slice(0, n)) console.log(`        ${x}`)
  if (xs.length > n) console.log(`        …and ${xs.length - n} more`)
}
console.log(`\n${scene}   ${skelPath.replace(ROOT + '/', '')}`)
console.log(`   chains ${skel.streets?.length ?? 0} by class:  ${fmt(r.chains)}`)
console.log(`   paths  ${skel.paths?.length ?? 0} by class:  ${fmt(r.paths)}`)
console.log(`   by rung:  ${fmt(r.rungs)}`)
if (r.offGuide.size) console.log(`   ⚠️ classes NOT IN THE STYLE GUIDE (open for Jacob):  ${fmt(r.offGuide)}`)
list('table faults', 'src/cartograph/streetClass.js', r.table)
list('UNCLASSIFIED', 'skeleton.js classification', r.unclassified)
list('stale class', 'skeleton.js classFields', r.stale)
list('name-made chains', 'skeleton.js groupByName (a name makes a chain whatever its class)', r.nameMade)
list('mixed-class chains', 'skeleton.js groupByName (a name groups across classes)', r.mixed)
if (r.mixed.length) console.log(`        of which across networks (a path/lot class grouped into a street): ${r.mixed.filter(x => x.endsWith('[across networks]')).length}`)
list('seeded residential', 'skeleton.js seedSection (`STD_SECTION[base] ? base : \'residential\'`)', r.seed)
if (r.seedNotPainted) console.log(`   ⚠️ ${r.seedNotPainted} highway-class chain(s) seeded residential in the record; not painted (measureFromSeed → highwaySection)`)
console.log(`   ·  Pass B (faces · tips · crossings) is NOT BUILT — not checked`)
console.log(r.red ? `\n⛔ ${r.red} red — every one named above with the site that owns it` : '\n✅ every feature is classified and no record contradicts its class')
process.exit(r.red ? 1 : 0)
