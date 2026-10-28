// READ-ONLY: is pourMeasureOf the decision derive made? The OLD rule is READ from git (HEAD's derive.js: the nested
// computeStreetMeasure and the overlay/highway lines at its call), evaluated with the same helpers, and compared over every
// chain of every town with a skeleton.json in <dataRoot>: measure deep-equal, the highway report, the refused list.
//   node scratch/embankment-hold/measure-equal.mjs <dataRoot> [rev=HEAD]
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
const ROOT = new URL('../../', import.meta.url).pathname, [dataRoot, rev = 'HEAD'] = process.argv.slice(2)
const SP = await import(ROOT + 'src/cartograph/streetProfiles.js')
const old = execSync(`git -C ${ROOT} show ${rev}:cartograph/derive.js`, { encoding: 'utf8', maxBuffer: 1 << 28 })
const a = old.indexOf('  function computeStreetMeasure(name, cls, seed, chain) {'), b = old.indexOf('\n  }\n', a)
if (a < 0 || b < 0) throw new Error('⛔ the old computeStreetMeasure is not in ' + rev)
const callA = old.indexOf('    const ovOnHighway = isSweptClass(s.class)'), callB = old.indexOf(': computeStreetMeasure(s.name, s.class, s.seed, s)', callA)
if (callA < 0 || callB < 0) throw new Error('⛔ the old call site is not in ' + rev)
const body = old.slice(a, b + 4) + '\n' + old.slice(callA, callB + ': computeStreetMeasure(s.name, s.class, s.seed, s)'.length) + '\n  return { measure, ovAuthored }'
const oldRule = new Function('isSweptClass', 'highwaySection', 'measureFromSeed', 'hwyStd', 'hwyReport', 'hwyRefused', 's', 'ov', body)
let towns = 0, chains = 0, bad = 0
for (const t of readdirSync(dataRoot)) {
  const sk = join(dataRoot, t, 'clean/skeleton.json'); if (!existsSync(sk)) continue
  const osm = join(dataRoot, t, 'raw/osm.json'), ovp = join(dataRoot, t, 'clean/overlay.json')
  let std = null; const read = new Map(), stdOf = () => std ??= SP.highwayStandard(JSON.parse(readFileSync(join(ROOT, 'references/registry.json'), 'utf8')), SP.townState(JSON.parse(readFileSync(osm, 'utf8'))), read)
  const ovById = existsSync(ovp) ? (JSON.parse(readFileSync(ovp, 'utf8')).streets || {}) : {}
  const streets = JSON.parse(readFileSync(sk, 'utf8')).streets || []
  // ⓘ planted: each town's first seeded non-swept chain again with a SURVEY seed, so the 'seed-survey' branch is read
  { const p = streets.find(s => s.seed && s.class && s.name && !SP.isSweptClass(s.class) && s.points?.length >= 2); if (p) streets.push({ ...p, id: p.id + '#survey-plant', seed: { ...p.seed, widthSource: 'survey' } })
    // ⓘ and its first swept chain with an overlay measure, which the rule must REFUSE on a highway (r-highway-no-authoring)
    const h = streets.find(s => s.class && s.name && SP.isSweptClass(s.class) && s.points?.length >= 2)
    if (h) { const id = h.id + '#hwy-overlay-plant'; streets.push({ ...h, id }); ovById[id] = { measure: { left: { pavementHW: 1 }, right: { pavementHW: 1 }, source: 'plant' } } } }
  const repO = [], refO = [], repN = [], refN = []; let n = 0, diff = 0, authored = 0
  for (const s of streets) { if (!s.name || !s.points || s.points.length < 2) continue
    const ov = ovById[s.id] || null
    let O, N, eO = null, eN = null
    try { O = oldRule(SP.isSweptClass, SP.highwaySection, SP.measureFromSeed, stdOf, repO, refO, s, ov) } catch (e) { eO = e.message }
    try { N = SP.pourMeasureOf(s, ov, stdOf); if (N.refusedOnHighway) refN.push(`${s.id}(source:${ov.measure.source ?? 'none'})`); if (N.hwy) repN.push(N.hwy) } catch (e) { eN = e.message }
    n++; if (N?.authored) authored++
    const same = eO || eN ? eO === eN || (eO && eN && eO.replace('computeStreetMeasure', 'pourMeasureOf') === eN) : isDeepStrictEqual(O.measure, N.measure) && O.ovAuthored === N.authored
    if (!same) { diff++; if (diff <= 3) console.log(`   ⛔ ${t} ${s.id}: old ${eO ?? JSON.stringify(O.measure).slice(0, 160)} · new ${eN ?? JSON.stringify(N.measure).slice(0, 160)}`) } }
  const repSame = isDeepStrictEqual(repO, repN), refSame = isDeepStrictEqual(refO, refN)
  console.log(`${t}: ${n} chains (${authored} authored) · ${diff} differ · highway report ${repO.length} ${repSame ? '=' : '≠'} · refused ${refO.length} ${refSame ? '=' : '≠'}`)
  towns++; chains += n; bad += diff + (repSame ? 0 : 1) + (refSame ? 0 : 1) }
console.log(bad ? `⛔ ${bad} difference(s)` : `✅ ${towns} towns, ${chains} chains: pourMeasureOf is the old decision, measure for measure`)
process.exit(bad ? 1 : 0)
