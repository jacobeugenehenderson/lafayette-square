#!/usr/bin/env node
// CLAIM — EVERY OFF-GRADE SPAN OVER THE WATER IS LISTED, BY IDENTITY. ① leaves each one out of the ink (`tileGround.js#splitOverWater`:
// a bridge, a tunnel, or a street over the water with no tag — off grade BY THE COAST, Jacob, 2026-10-27: "a") and records it,
// never silently: frozen as `protopolygon.offGradeSpans` [{ street, segOrd, kind: 'tagged' | 'byCoast', hwy, wetM, points }].
// The paint lays each back over the water as `mat:bridge` (`bridgeOverlay`, `highwayBridges`; Jacob: "b for now, deck later"),
// and the shore pin skips the coast beneath it — both read this record. Supersedes claims-off-grade-by-the-coast-is-listed
// (its `offGradeByCoast` is now this list's byCoast entries).
// ⭐ GREEN BY DESIGN: an entry is a ruled, named outcome, not a defect — this check is the operator's list of them (Boz,
// 2026-10-27). It is RED only when a town's ① carries no record (a pour before the rule: re-pour) or an entry lacks a field.
//   Read off each town's frozen ① (`ribbons.json` → protopolygon) — light, no build.
//   MUTANT (always run, in memory): a record with one entry missing its `points` must read RED.
//   node checks/claims-every-off-grade-span-over-the-water-is-listed.mjs
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, ribbonsPath, ribbonScenes } from './_scenes.mjs'

const ok = (e) => e && typeof e.street === 'string' && Number.isFinite(e.segOrd) && (e.kind === 'tagged' || e.kind === 'byCoast')
  && typeof e.hwy === 'boolean' && Number.isFinite(e.wetM) && e.wetM > 0
  && Array.isArray(e.points) && e.points.length >= 2 && e.points.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
const judge = (R) => !Array.isArray(R) ? { missing: true, bad: [] } : { missing: false, bad: R.filter(e => !ok(e)) }

let red = 0, towns = 0
{ const e = { street: 'a', segOrd: 0, kind: 'tagged', hwy: false, wetM: 48, points: [[1, 2], [3, 4]] }
  const good = judge([e]), cut = judge([{ ...e, points: undefined }])
  const m = !good.missing && !good.bad.length && cut.bad.length === 1
  if (!m) red++
  console.log(`${m ? '✅' : '⛔'} mutant: a complete entry reads GREEN, one missing its points reads RED`) }
for (const scene of ribbonScenes()) {
  const rp = join(ROOT, ribbonsPath(scene)); if (!existsSync(rp)) continue
  const P = JSON.parse(readFileSync(rp, 'utf8')).protopolygon; if (!P) continue
  towns++
  const R = P.offGradeSpans, J = judge(R)
  if (J.missing) { console.log(`⛔ ${scene}: its ① carries no offGradeSpans — a pour before the rule. Re-pour.`); red++; continue }
  if (J.bad.length) { console.log(`⛔ ${scene}: ${J.bad.length} entr(ies) lack a field (street, segOrd, kind, hwy, wetM, points): ${JSON.stringify(J.bad[0]).slice(0, 160)}`); red++; continue }
  console.log(`✅ ${scene}: ${R.length} off-grade span(s) over the water${R.length ? ` (${R.filter(e => e.kind === 'byCoast').length} by the coast)` : ' (none)'}`)
  for (const e of R) { const m = e.points[Math.floor(e.points.length / 2)]
    console.log(`     ${e.street}|${e.segOrd} · ${e.kind}${e.hwy ? ' · swept by H' : ''} · ${e.wetM.toFixed(2)} m over the water · at (${m.map(v => v.toFixed(3)).join(', ')})`) }
}
if (!towns) { console.log('⛔ no town carries a ① — nothing listed'); red++ }
console.log(red ? `\n⛔ ${red} RED` : '\n✅ every off-grade span over the water is listed')
process.exit(red ? 1 : 0)
