#!/usr/bin/env node
// ⭐⭐ EVERY JUNCTION CORNER'S CURB CUTS COME FROM SOMEWHERE NAMED — AND EVERY CROSSWALK ENDS AT A CURB CUT ON BOTH SIDES — `BRIEF-corner-ramps-and-kerb §0a`, `cartograph/curb-cut-norm.mjs`.
// Builds Section's FILL for a scene (the painter is live) and reads the curb cuts it painted off the painter's own tally:
// junction corners by the rung their style came from (authored · scene · state · kit), how many have NO source, and
// every curb-cut record's corner. It restates no rule.
//
//   node checks/claims-every-junction-corner-has-a-curb-cut-source.mjs <scene>            off the scene's frozen ①
//   node checks/claims-every-junction-corner-has-a-curb-cut-source.mjs <scene> --live     off a live mint (before a re-pour)
//   node checks/claims-every-junction-corner-has-a-curb-cut-source.mjs <scene> --live --selftest
//        the painter under trial norms + an authored leg, on that scene's real corners
//
// ⛔ FAILS when: a curb cut sits on a corner that is not a junction · a crosswalk's two ends are not two curb cuts at one
// junction, beside one chain, on its two sides · junction corners on tiles poured before the norm was
// frozen (`noNorm` — re-pour) · an authored style is invalid · the selftest disagrees. `noSource` (norm 'none', nothing
// authored or recorded) is printed loud and is NOT a failure — it is the ruled default, made visible.
import { feed, buildProto } from '../scratch/_proto-feed.mjs'
import { buildCurbCutEvidence, ROAD } from '../cartograph/curb-cut-evidence.mjs'
import { styleFromEvidence, landCurbCutEvidence } from '../src/lib/tileGround.js'
import { mkdtempSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const args = process.argv.slice(2)
const scene = args.find(a => !a.startsWith('--')) || 'lafayette-square'
const live = args.includes('--live')
const f = feed(scene); if (!f) process.exit(1)
if (live) delete f.ribbons.protopolygon
// a crosswalk pair is sound iff both ends are curb cuts at the same node, serving the same chain from its two sides
const badPairs = (r) => (r.crosswalkPairs || []).filter(([a, b, chain]) => {
  const A = r.curbCutRecs[a], B = r.curbCutRecs[b]
  if (!A || !B || A.node == null || A.node !== B.node) return true
  const sa = (A.serves || []).find(x => x.leg.skelId === chain), sb = (B.serves || []).find(x => x.leg.skelId === chain)
  return !sa || !sb || sa.leg.side === sb.leg.side
}).length
const run = (norm, blockCustoms = f.blockCustoms, evidence) => {
  const rb = { ...f.ribbons, ...(norm === undefined ? {} : { curbCutNorm: norm }), ...(evidence === undefined ? {} : { curbCutEvidence: evidence }) }
  return buildProto({ ...f, ribbons: rb, blockCustoms }, { quiet: true, protoProducer: true })
}

if (args.includes('--selftest')) {
  const dims = { width: 1.5, warningDepth: 0.6 }
  const cw = { style: 'lines', width: 3, line: 0.3, source: 'trial' }, cwNone = { style: 'none', source: 'kit' }
  const K = run({ style: 'none', source: 'kit', crosswalks: cw }).curbCutTally || {}
  const Kc = run({ style: 'none', source: 'kit', crosswalks: cw }).crosswalkTally || {}
  const Dg = run({ style: 'diagonal', ...dims, source: 'trial', crosswalks: cwNone })
  const Pp = run({ style: 'perpendicular', ...dims, source: 'trial', crosswalks: cw })
  const J = K.junction || 0
  // an authored leg on a town whose norm is 'none' but carries the jurisdiction's sizes: exactly that corner gets curb cuts
  const one = Pp.curbCutRecs[0]
  const st = Pp.protoShapeTiles?.[one?.tile]
  const jx = st?.junctions?.[one?.junction]
  let authored = null
  if (jx) {
    const leg = jx.legs[0], runs = st.runs.filter(r => r.skelId === leg.skelId && r.side === leg.side)
    const bc = structuredClone(f.blockCustoms || {})
    for (const r of runs) { const s = ((bc[r.skelId] ||= {})[r.side] ||= {}); s[r.segOrd] = { ...(s[r.segOrd] || {}), curbCuts: { start: 'diagonal', end: 'diagonal' } } }
    authored = run({ style: 'none', ...dims, source: 'trial' }, bc).curbCutTally || {}
  }
  // ⭐ THE EVIDENCE RUNG, on this town's real crossings: trial kerb nodes at both END vertices of every crossing way
  // (and three on a crossing's road node), bound and landed by the real code. Written to a temp file, never the town.
  const raw = `cartograph/data/${scene}/raw`, osm = JSON.parse(readFileSync(`${raw}/osm.json`, 'utf8')).ground.highway
  const crossings = osm.filter(w => w.tags?.footway === 'crossing' && w.coords.length >= 3)
  const onRoad = new Set(osm.filter(w => ROAD.has(w.tags?.highway)).flatMap(w => w.coords.map(c => `${c.lon},${c.lat}`)))
  const trial = (kind) => { const d = mkdtempSync(join(tmpdir(), 'kerbs-')), p2 = join(d, 'osm_kerbs.json'), nodes = []
    for (const w of crossings) for (const c of [w.coords[0], w.coords[w.coords.length - 1]]) nodes.push({ osmId: nodes.length, tags: { barrier: 'kerb', kerb: kind }, lon: c.lon, lat: c.lat })
    for (const c of crossings.map(w => w.coords.slice(1, -1).filter(c => onRoad.has(`${c.lon},${c.lat}`))).filter(r => r.length === 1).map(r => r[0]).slice(0, 3))
      nodes.push({ osmId: nodes.length, tags: { highway: 'crossing', kerb: kind }, lon: c.lon, lat: c.lat })
    writeFileSync(p2, JSON.stringify({ fetchedAt: 'trial', nodes }))
    return buildCurbCutEvidence({ osmPath: `${raw}/osm.json`, kerbsPath: p2, skeletonPath: `cartograph/data/${scene}/clean/skeleton.json` }) }
  const Elow = trial('lowered'), Eup = trial('raised')
  const none = buildCurbCutEvidence({ osmPath: `${raw}/osm.json`, kerbsPath: join(tmpdir(), 'no-such-kerbs.json'), skeletonPath: `cartograph/data/${scene}/clean/skeleton.json` })
  const diag = { style: 'diagonal', ...dims, source: 'trial', crosswalks: cwNone }
  const Lo = run(diag, f.blockCustoms, Elow).curbCutTally || {}, Up = run(diag, f.blockCustoms, Eup).curbCutTally || {}
  // the landing on its own, on clean copies of this town's tiles: every landing is OWNED by the road it crosses, and the
  // ownership guard is seen to FAIL: the same records claiming a road that does not exist must all be refused
  const tiles = structuredClone(run(diag).protoShapeTiles || []).map(t => { delete t.curbCutEvidence; return t })
  const L = landCurbCutEvidence(tiles, Elow).census
  const tiles2 = structuredClone(tiles).map(t => { delete t.curbCutEvidence; return t })
  const Lx = landCurbCutEvidence(tiles2, { ...Elow, records: Elow.records.map(r => ({ ...r, crossed: ['__no_such_road__'] })) }).census
  const owned = tiles.flatMap(t => (t.curbCutEvidence || []).map(x => (t.junctions?.[x.jx]?.legs || []).some(l => x.crossed.includes(l?.skelId))))
  const sfe = (xs) => styleFromEvidence(xs.map(([f2, kind = 'lowered']) => ({ f: f2, kind })))
  const rows = [
    ['evidence: a middle drop reads diagonal',     sfe([[0.5]]) === 'diagonal'],
    ['evidence: two end drops read perpendicular', sfe([[0.1], [0.9]]) === 'perpendicular'],
    ['evidence: one end only is unreadable',       sfe([[0.1]]) === 'unreadable' && sfe([[0.5], [0.9]]) === 'unreadable'],
    ['evidence: raised only reads none',           sfe([[0.5, 'raised']]) === 'none' && sfe([[0.5, 'rolled']]) === 'unreadable'],
    ['no kerb file is NOT FETCHED, not empty',     none.fetched === false],
    ['kerb nodes bind to crossings by identity',   Elow.records.length > 0 && Elow.census.positionNotRecorded >= 3],
    ['every landing is owned by its crossed road', owned.length > 0 && owned.every(Boolean) && owned.length === L.landed],
    ['a road that is no leg is refused',          Lx.landed === 0 && Lx.notOwner === L.landed + L.notOwner],
    ['partial evidence against the norm is counted', (Lo.contradicted || 0) > 0 && (Lo.contradicted || 0) <= (Lo.unreadable || 0)],
    ['landed evidence reaches the painter',        ((Lo.bySource?.['osm:kerb'] || 0) + (Lo.unreadable || 0)) > 0],
    ['raised kerbs suppress the norm\'s cut',      (Up.bySource?.['osm:kerb'] || 0) > 0 && (Up.curbCuts || 0) < J],
    ['kit norm paints nothing',           (K.curbCuts || 0) === 0],
    ['…and every junction is noSource',   J > 0 && K.noSource === J],
    ['diagonal: one curb cut per junction',   (Dg.curbCutTally?.curbCuts || 0) === J],
    ['perpendicular: two per junction',   (Pp.curbCutTally?.curbCuts || 0) === 2 * J],
    ['every curb cut is on a junction',       [...Dg.curbCutRecs, ...Pp.curbCutRecs].every(r => Number.isInteger(r.junction))],
    ['strips are painted',                (Dg.curbCut?.length || 0) > 0 && (Pp.curbCut?.length || 0) > (Dg.curbCut?.length || 0)],
    ['an authored leg places curb cuts',      !!authored && authored.curbCuts > 0 && authored.curbCuts < J && (authored.bySource?.authored || 0) > 0],
    ['no curb cuts → no crosswalks, said',    (Kc.pairs || 0) === 0 && Kc.noCurbCut === 1],
    ['crosswalk norm none → none',        (Dg.crosswalkPairs?.length || 0) === 0 && !(Dg.crosswalk?.length)],
    ['crosswalks pair curb cuts',             (Pp.crosswalkTally?.pairs || 0) > 0 && (Pp.crosswalk?.length || 0) > 0],
    ['every crosswalk ends at two curb cuts', badPairs(Pp) === 0],
  ]
  let bad = 0
  for (const [name, ok] of rows) { if (!ok) bad++; console.log(`  ${ok ? '✅' : '⛔'} ${name}`) }
  console.log(`  (evidence trial: ${Elow.records.length} record(s) bound · landed ${L.landed}, refused ${L.notOwner} not-owner / ${L.offArc} off-arc / ${L.notJunction} not-junction / ${L.noHit} no-hit · lowered → ${Lo.bySource?.['osm:kerb'] || 0} corner(s) by evidence, ${Lo.unreadable || 0} unreadable (${Lo.contradicted || 0} contradict the norm) · raised → ${Up.curbCuts} cut(s) of ${J})`)
  console.log(`  (${scene}: ${J} junction corners · diagonal ${Dg.curbCutTally?.curbCuts} · perpendicular ${Pp.curbCutTally?.curbCuts} · authored ${authored?.curbCuts ?? '—'} · crosswalks ${Pp.crosswalkTally?.pairs} paired, ${Pp.crosswalkTally?.unpaired} unpaired, ${Pp.crosswalkTally?.ambiguous} ambiguous)`)
  console.log(bad ? `⛔ selftest: ${bad} wrong` : '✅ selftest: the painter places curb cuts by evidence, norm and authoring, on junctions only')
  process.exit(bad ? 1 : 0)
}

const r = run(undefined)
const T = r.curbCutTally
if (!T) { console.log(`⛔ ${scene}: the painter returned no curb-cut tally — NOT checked`); process.exit(1) }
const offJunction = (r.curbCutRecs || []).filter(x => !Number.isInteger(x.junction)).length
console.log(`${scene}${live ? ' (live ①)' : ''}: ${T.junction || 0} junction corner(s) · ${T.bend || 0} bend · ${T.unknown || 0} unknown`)
console.log(`  style from : ${Object.entries(T.bySource || {}).map(([k, v]) => `${v} ${k}`).join(' · ') || 'nothing'}`)
console.log(`  curb cuts  : ${T.curbCuts || 0} painted${T.short ? ` · ${T.short} short of their width` : ''}${T.conflict ? ` · ${T.conflict} legs disagree` : ''}`)
if (T.noSource) console.log(`  ⛔ ${T.noSource} corners have no curb-cut source (norm 'none') — the ruled default, visible`)
if (T.noDims) console.log(`  ⛔ ${T.noDims} authored curb cut(s) with no norm dimensions to draw them`)
if (T.contradicted) console.log(`  ⛔ ${T.contradicted} corner(s) where partial evidence CONTRADICTS the norm — drawn by the norm; override if the record is right: ${(r.curbCutContradicted || []).slice(0, 8).map(c => `(${c.at[0].toFixed(0)}, ${c.at[1].toFixed(0)})`).join(' ')}`)
if (T.unreadable) console.log(`  ${T.unreadable} corner(s) whose recorded cuts are unreadable — counted, drawn by the norm`)
const C = r.crosswalkTally || {}, bad = badPairs(r)
console.log(`  crosswalks : ${C.style && C.style !== 'none' ? `${C.pairs} (${C.style}, from ${C.source}) · ${C.unpaired} crossing(s) with no curb cut across · ${C.ambiguous} ambiguous` : `none (norm ${C.style ?? 'not frozen'})`}`)
if (bad) console.log(`  ⛔ ${bad} crosswalk(s) whose ends are not two curb cuts across one chain at one junction`)
const fail = offJunction || T.noNorm || T.invalid || bad
if (offJunction) console.log(`  ⛔ ${offJunction} curb cut(s) on a corner that is not a junction`)
if (T.noNorm) console.log(`  ⛔ ${T.noNorm} junction corner(s) on tiles poured before the curb-cut norm — re-pour`)
if (T.invalid) console.log(`  ⛔ ${T.invalid} authored style(s) invalid`)
console.log(fail ? '⛔ NOT a pass' : '✅ every junction corner\'s curb-cut style has a named source')
process.exit(fail ? 1 : 0)
