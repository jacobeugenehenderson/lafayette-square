// CLAIM: the corner record the operator's handle rides reports the radius the arc
// ACHIEVED, not the radius it was ASKED for.
//
// `tileGround.js:8135`: "the truth the handle rides has to be the arc that is DRAWN."
// This checks that sentence against the pour, by comparing the record with the ease's
// OWN disclosure in the same build — so the two numbers cannot come from different maps.
//
// `cornerSet` is ②'s achieved arcs — the one producer since the legacy chain shape pass was deleted
// (2026-10-20). (Before that a probe that omitted the proto flags measured the undrawn legacy set,
// which is why the check this file replaces was excised, not bannered.)
//
// ⛔ The ease's counters cannot be read after the fact — the build DRAINS them
// (`easeSkipsTake` resets). They are disclosed as `console.warn`, so the honest way to
// read them is to capture what the producer says about itself during the pour.
//
// ⛔⛔ READ THE `① SOURCE` LINE — only lafayettesquare is frozen (`ROADMAP A20`).
//
// ▶ node checks/claims-the-corner-record-reports-the-achieved-radius.mjs [scene ...]
import fs from 'fs'
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'

for (const scene of feedScenes()) {
  const f = feed(scene); if (!f) continue
  const warns = []
  const realWarn = console.warn
  console.warn = (...a) => { warns.push(a.join(' ')) }
  let tg
  try { tg = buildProto(f) }
  finally { console.warn = realWarn }

  const CS = (tg.cornerSet || []).filter(c => c.vertR > 0)
  if (!CS.length) { console.log(`⛔ ${scene}: no corner record — NOT measured`); continue }
  const short = CS.filter(c => c.fillet?.r > 0 && c.fillet.r < c.vertR - 1e-9).length
  const none  = CS.filter(c => !(c.fillet?.r > 0)).length

  // what the producer said about itself, during this same pour
  const num = (re) => { for (const w of warns) { const m = w.match(re); if (m) return Number(m[1]) } return null }
  const below   = num(/(\d+) corner\(s\) eased BELOW their authored radius/)
  const declined = num(/(\d+) corner\(s\) the ease DECLINED/)

  console.log(`\n${scene}  (look ${f.look} · ${f.slots} authored slots)`)
  console.log(`  ① SOURCE: ${tg.protoSource}`)
  console.log(`  the RECORD (what the handle rides): ${CS.length} corners · ${short} below the asked radius · ${none} with no arc`)
  console.log(`  the EASE  (same pour, its own words): ${below ?? '—'} eased BELOW their authored radius · ${declined ?? '—'} declined outright`)
  if (below == null && declined == null) {
    console.log('  ⛔ the ease disclosed NOTHING this pour — cannot compare. NOT a pass.'); continue
  }
  const producerSays = (below ?? 0) + (declined ?? 0)
  const recordSays = short + none
  const ok = recordSays >= producerSays
  console.log(`  ⇒ ${ok ? '✅ PASS' : '⛔ FAIL'}: the record shows ${recordSays} imperfect corner(s); the ease reports ${producerSays}.`)
  if (!ok) console.log(`     The dial reports the radius REQUESTED, not the radius ACHIEVED — the operator is shown a corner the map does not have.`)
}
