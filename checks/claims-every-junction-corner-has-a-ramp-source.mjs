#!/usr/bin/env node
// ⭐⭐ EVERY JUNCTION CORNER'S RAMPS COME FROM SOMEWHERE NAMED — `BRIEF-corner-ramps-and-kerb §0a`, `cartograph/ramp-norm.mjs`.
// Builds Section's FILL for a scene (the painter is live) and reads the ramps it painted off the painter's own tally:
// junction corners by the rung their style came from (authored · scene · state · kit), how many have NO source, and
// every ramp record's corner. It restates no rule.
//
//   node checks/claims-every-junction-corner-has-a-ramp-source.mjs <scene>            off the scene's frozen ①
//   node checks/claims-every-junction-corner-has-a-ramp-source.mjs <scene> --live     off a live mint (before a re-pour)
//   node checks/claims-every-junction-corner-has-a-ramp-source.mjs <scene> --live --selftest
//        the painter under trial norms + an authored leg, on that scene's real corners
//
// ⛔ FAILS when: a ramp sits on a corner that is not a junction · junction corners on tiles poured before the norm was
// frozen (`noNorm` — re-pour) · an authored style is invalid · the selftest disagrees. `noSource` (norm 'none', nothing
// authored or recorded) is printed loud and is NOT a failure — it is the ruled default, made visible.
import { feed, buildProto } from '../scratch/_proto-feed.mjs'

const args = process.argv.slice(2)
const scene = args.find(a => !a.startsWith('--')) || 'lafayette-square'
const live = args.includes('--live')
const f = feed(scene); if (!f) process.exit(1)
if (live) delete f.ribbons.protopolygon
const run = (norm, blockCustoms = f.blockCustoms) => {
  const rb = norm === undefined ? f.ribbons : { ...f.ribbons, rampNorm: norm }
  return buildProto({ ...f, ribbons: rb, blockCustoms }, { quiet: true, protoProducer: true })
}

if (args.includes('--selftest')) {
  const dims = { width: 1.5, warningDepth: 0.6 }
  const K = run({ style: 'none', source: 'kit' }).rampTally || {}
  const Dg = run({ style: 'diagonal', ...dims, source: 'trial' })
  const Pp = run({ style: 'perpendicular', ...dims, source: 'trial' })
  const J = K.junction || 0
  // an authored leg on a town whose norm is 'none' but carries the jurisdiction's sizes: exactly that corner gets ramps
  const one = Pp.rampRecs[0]
  const st = Pp.protoShapeTiles?.[one?.tile]
  const jx = st?.junctions?.[one?.junction]
  let authored = null
  if (jx) {
    const leg = jx.legs[0], runs = st.runs.filter(r => r.skelId === leg.skelId && r.side === leg.side)
    const bc = structuredClone(f.blockCustoms || {})
    for (const r of runs) { const s = ((bc[r.skelId] ||= {})[r.side] ||= {}); s[r.segOrd] = { ...(s[r.segOrd] || {}), ramps: { start: 'diagonal', end: 'diagonal' } } }
    authored = run({ style: 'none', ...dims, source: 'trial' }, bc).rampTally || {}
  }
  const rows = [
    ['kit norm paints nothing',           (K.ramps || 0) === 0],
    ['…and every junction is noSource',   J > 0 && K.noSource === J],
    ['diagonal: one ramp per junction',   (Dg.rampTally?.ramps || 0) === J],
    ['perpendicular: two per junction',   (Pp.rampTally?.ramps || 0) === 2 * J],
    ['every ramp is on a junction',       [...Dg.rampRecs, ...Pp.rampRecs].every(r => Number.isInteger(r.junction))],
    ['strips are painted',                (Dg.ramp?.length || 0) > 0 && (Pp.ramp?.length || 0) > (Dg.ramp?.length || 0)],
    ['an authored leg places ramps',      !!authored && authored.ramps > 0 && authored.ramps < J && (authored.bySource?.authored || 0) > 0],
  ]
  let bad = 0
  for (const [name, ok] of rows) { if (!ok) bad++; console.log(`  ${ok ? '✅' : '⛔'} ${name}`) }
  console.log(`  (${scene}: ${J} junction corners · diagonal ${Dg.rampTally?.ramps} · perpendicular ${Pp.rampTally?.ramps} · authored ${authored?.ramps ?? '—'})`)
  console.log(bad ? `⛔ selftest: ${bad} wrong` : '✅ selftest: the painter places ramps by norm and by authoring, on junctions only')
  process.exit(bad ? 1 : 0)
}

const r = run(undefined)
const T = r.rampTally
if (!T) { console.log(`⛔ ${scene}: the painter returned no ramp tally — NOT checked`); process.exit(1) }
const offJunction = (r.rampRecs || []).filter(x => !Number.isInteger(x.junction)).length
console.log(`${scene}${live ? ' (live ①)' : ''}: ${T.junction || 0} junction corner(s) · ${T.bend || 0} bend · ${T.unknown || 0} unknown`)
console.log(`  style from : ${Object.entries(T.bySource || {}).map(([k, v]) => `${v} ${k}`).join(' · ') || 'nothing'}`)
console.log(`  ramps      : ${T.ramps || 0} painted${T.short ? ` · ${T.short} short of their width` : ''}${T.conflict ? ` · ${T.conflict} legs disagree` : ''}`)
if (T.noSource) console.log(`  ⛔ ${T.noSource} corners have no ramp source (norm 'none') — the ruled default, visible`)
if (T.noDims) console.log(`  ⛔ ${T.noDims} authored ramp(s) with no norm dimensions to draw them`)
const fail = offJunction || T.noNorm || T.invalid
if (offJunction) console.log(`  ⛔ ${offJunction} ramp(s) on a corner that is not a junction`)
if (T.noNorm) console.log(`  ⛔ ${T.noNorm} junction corner(s) on tiles poured before the ramp norm — re-pour`)
if (T.invalid) console.log(`  ⛔ ${T.invalid} authored style(s) invalid`)
console.log(fail ? '⛔ NOT a pass' : '✅ every junction corner\'s ramp style has a named source')
process.exit(fail ? 1 : 0)
