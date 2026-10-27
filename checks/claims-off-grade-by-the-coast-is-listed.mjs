#!/usr/bin/env node
// CLAIM — EVERY STREET LEFT OUT OF THE INK AS OFF GRADE BY THE COAST IS LISTED. A street over ①'s water with no bridge, tunnel or
// layer tag is a bridge all the same (Jacob, 2026-10-27: "a; we don't have any mechanism for this in the authoring tools"): ①'s
// coast is the high-water mark. It leaves the ink like a tagged span (`tileGround.js#splitOverWater`), and it is RECORDED,
// never silent: frozen as `protopolygon.offGradeByCoast` [{ street, segOrd, wetM, at }], printed in the pour, and listed here.
// ⭐ GREEN BY DESIGN: an entry is a ruled, named outcome, not a defect — this check is the operator's list of them (Boz,
// 2026-10-27). It is RED only when a town's ① carries no record (a pour before the rule: re-pour) or an entry lacks a field.
//   Read off each town's frozen ① (`ribbons.json` → protopolygon) — light, no build.
//   MUTANT (always run, in memory): a record with one entry missing its `wetM` must read RED.
//   node checks/claims-off-grade-by-the-coast-is-listed.mjs [--scene=<town> …]
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, ribbonsPath, ribbonScenes } from './_scenes.mjs'

const ok = (e) => e && typeof e.street === 'string' && Number.isFinite(e.segOrd) && Number.isFinite(e.wetM) && e.wetM > 0
  && Array.isArray(e.at) && e.at.length === 2 && e.at.every(Number.isFinite)
const judge = (R) => !Array.isArray(R) ? { missing: true, bad: [] } : { missing: false, bad: R.filter(e => !ok(e)) }

let red = 0, towns = 0
{ const good = judge([{ street: 'a', segOrd: 0, wetM: 48, at: [1, 2] }]), cut = judge([{ street: 'a', segOrd: 0, at: [1, 2] }])
  const m = !good.missing && !good.bad.length && cut.bad.length === 1
  if (!m) red++
  console.log(`${m ? '✅' : '⛔'} mutant: a complete entry reads GREEN, one missing its wetM reads RED`) }
for (const scene of ribbonScenes()) {
  const rp = join(ROOT, ribbonsPath(scene)); if (!existsSync(rp)) continue
  const P = JSON.parse(readFileSync(rp, 'utf8')).protopolygon; if (!P) continue
  towns++
  const R = P.offGradeByCoast, J = judge(R)
  if (J.missing) { console.log(`⛔ ${scene}: its ① carries no offGradeByCoast — a pour before the rule. Re-pour.`); red++; continue }
  if (J.bad.length) { console.log(`⛔ ${scene}: ${J.bad.length} entr(ies) lack a field (street, segOrd, wetM, at): ${JSON.stringify(J.bad[0]).slice(0, 160)}`); red++; continue }
  console.log(`✅ ${scene}: ${R.length} street span(s) off grade by the coast${R.length ? '' : ' (none)'}`)
  for (const e of R) console.log(`     ${e.street}|${e.segOrd} · ${e.wetM.toFixed(2)} m over the water · at (${e.at.map(v => v.toFixed(3)).join(', ')})`)
}
if (!towns) { console.log('⛔ no town carries a ① — nothing listed'); red++ }
console.log(red ? `\n⛔ ${red} RED` : '\n✅ every street off grade by the coast is listed')
process.exit(red ? 1 : 0)
