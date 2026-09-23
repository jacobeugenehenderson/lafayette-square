// CLAIM: a frontage that carries no pedestrian realm can say so.
//
// ⛔⛔ THIS FILE REPLACES `claims-the-hairlines-are-on-blocks-that-take-no-stack.mjs`,
// WHICH WAS MEASURING ITS OWN MISTAKE. That check read `measure[side].treelawn` and
// `.sidewalk` — the RAW fields — and called a block "asking for no walk and no lawn"
// when they were 0. `tileGround.js:6698` warns against exactly that, four lines above
// the function it was replicating: "`measure.treelawn` is only the AUTHORED OVERRIDE;
// the depth the map actually paints comes from `resolvePedDepths`." Reading the raw
// field is a MEASUREMENT WITHOUT AUTHORING — `CLAUDE.md` Layer 0 q3 — and it produced
// a defect report ("17/18 blocks handed a stack nobody asked for, 65,901 m²") whose
// premise was false. Excised, not bannered.
//
// WHAT IS ACTUALLY TRUE, and it is a bigger question than the one I asked:
//   `resolvePedDepths` is  tl = custom.treelawn ?? (pedRealm false ? 0 : STD_TREELAWN)
//                          sw = custom.sidewalk ?? (pedRealm false ? 0 : ADA_SIDEWALK)
// The base measure's treelawn/sidewalk/terminal are NEVER READ for depth; `gleanTreelawn`
// decides only the ARRANGEMENT (`hasTL`). The one data route to "no band" is a side's
// `pedRealm:false` — today only `expressway=yes` (skeleton.js `isExpressway`, 2026-09-23).
// Everything else resolves to a standard treelawn and an ADA sidewalk unless an operator
// has hand-authored both to 0 — a motorway ramp gore included.
//
// So this check does not ask "was this block dressed". It asks the kit question:
//   ⭐ CAN a frontage express "no pedestrian realm", other than by hand, one at a time?
// A town nobody has authored is the test, because that is town #2.
//
// ⛔⛔ READ THE `① SOURCE` LINE BEFORE QUOTING A CROSS-TOWN NUMBER. Only
// lafayette-square carries a FROZEN ①; the others have not been poured since ① landed
// (`ROADMAP A20`), so their rows come from the live re-derivation. Not void — a live
// row is evidence — but weaker, and a reader who cannot see which is which will treat
// them alike.
//
// ▶ node checks/claims-a-frontage-can-ask-for-no-ped-band.mjs [scene ...]
import fs from 'fs'
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
import { resolvePedDepths } from '../src/lib/tileGround.js'

for (const scene of feedScenes()) {
  const f = feed(scene); if (!f) continue
  const tg = buildProto(f)
  const owners = tg.protoOwners
  if (!owners?.length) { console.log(`⛔ ${scene}: no owner stamps — NOT measured`); continue }

  const base = new Map()
  for (const s of (f.ribbons.streets || [])) base.set(s.id || s.skelId, s.measure || s.baseMeasure || null)
  const bcOf = (id, side, ord) => f.blockCustoms?.[id]?.[side]?.[ord] || null

  let n = 0, baseSilent = 0, silentButDressed = 0, authoredToZero = 0
  // ⭐ The one class the DATA says carries no pedestrian realm (`expressway=yes` →
  // `pedRealm:false` on the side, skeleton.js `isExpressway`). Unauthored, it must
  // paint zero; authored, the operator's override wins and is not counted.
  let noRealm = 0, noRealmDressed = 0
  const noRealmBad = []
  const byMat = {}
  for (const o of owners) {
    const mz = base.get(o.skelId); if (!mz) continue
    const side = mz[o.side]; if (!side) continue
    n++
    const c = bcOf(o.skelId, o.side, o.segOrd)
    const d = resolvePedDepths(mz, o.side, c)              // ⭐ the SHIPPED resolver, not the raw field
    const quietInData = !(side.treelawn > 0) && !(side.sidewalk > 0)
    const paints = (d.tl > 0) || (d.sw > 0)
    if (quietInData) baseSilent++
    if (quietInData && paints) {
      silentButDressed++
      const m = side.material || 'unclassified'
      byMat[m] = (byMat[m] || 0) + 1
    }
    if (!paints) authoredToZero++
    if (side.pedRealm === false && !c) {
      noRealm++
      if (paints) { noRealmDressed++; if (noRealmBad.length < 6) noRealmBad.push(`${o.skelId}:${o.side}#${o.segOrd} tl=${d.tl} sw=${d.sw}`) }
    }
  }
  const pct = (v) => `${(100 * v / (n || 1)).toFixed(1)}%`
  console.log(`\n${scene}  (look ${f.look} · ${f.slots} authored slots)`)
  console.log(`  ① SOURCE: ${tg.protoSource}`)
  console.log(`  ${n} frontage stamps · ${baseSilent} (${pct(baseSilent)}) carry NO ped depth in the data`)
  console.log(`  ⇒ ${silentButDressed ? '⛔ FAIL' : '✅ PASS'}: ${silentButDressed} (${pct(silentButDressed)}) of them are painted a treelawn/sidewalk anyway`)
  console.log(`  ⇒ ${authoredToZero} stamp(s) reach zero ped depth at all — by a hand override of BOTH fields, or the data's pedRealm:false`)
  console.log(`     by material: ${JSON.stringify(byMat)}`)
  console.log(`  ${noRealmDressed ? '⛔ FAIL' : '✅ PASS'}: ${noRealm} unauthored frontage(s) whose data says NO pedestrian realm (expressway) · ${noRealmDressed} painted a band anyway`)
  for (const b of noRealmBad) console.log(`     ⛔ ${b}`)
  if (noRealmDressed) process.exitCode = 1
}
