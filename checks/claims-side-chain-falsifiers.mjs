#!/usr/bin/env node
/**
 * READ-ONLY. THE TWO FALSIFIABLE PREDICTIONS of the directed-side-chain / grout model,
 * stated in `project_directed_side_chains_proposal` as free bug-finders and never run:
 *
 *   F1. `innerSign` should DISAPPEAR ENTIRELY — which side faces the median is face
 *       adjacency, not a persisted vote.
 *   F2. `innerEdgeAssign`'s SUPPRESSION HACK should become DELETABLE — it puts both sides
 *       of a carriageway at surveyHW/2 and ZEROES the inboard ped to suppress a side that
 *       should not exist. That is a one-sided chain faked with a two-sided one.
 *
 * ⛔ IF EITHER DOES NOT FALL OUT, THE MODEL HAS A HOLE — find it before building.
 *
 * ⚠️ `inboardSideOf` below MIRRORS `src/lib/tileGround.js` (grep the function name; it is not
 * exported). If that function moves, this probe is stale — it prints its own mirror check.
 *
 *   node scratch/claims-side-chain-falsifiers.mjs [scene ...]
 */
import fs from 'fs'
const scenes = process.argv.slice(2).length ? process.argv.slice(2)
  : ['lafayette-square', 'lafayette-square-staging', 'hipointe-demun', 'altadena']
const o = console.log

// mirror of tileGround.js `inboardSideOf` — the ONE geometric inboard oracle
function inboardSideOf(s, mate) {
  const pa = s?.points, pb = mate?.points
  if (!pa || pa.length < 2 || !pb || pb.length < 2) return { side: s?.innerSign === +1 ? 'right' : 'left', viaFallback: true }
  const i = Math.max(1, Math.floor(pa.length / 2))
  const ca = pa[i], cb = pb[Math.floor(pb.length / 2)]
  const dx = pa[i][0] - pa[i - 1][0], dz = pa[i][1] - pa[i - 1][1], L = Math.hypot(dx, dz) || 1
  const toMate = [cb[0] - ca[0], cb[1] - ca[1]]
  return { side: ((-dz / L) * toMate[0] + (dx / L) * toMate[1] > 0) ? 'left' : 'right', viaFallback: false }
}
// mirror check: the source still contains the algorithm this probe assumes
const src = fs.readFileSync('src/lib/tileGround.js', 'utf8')
const anchored = src.includes('function inboardSideOf(s, mate)') && src.includes("s?.innerSign === +1 ? 'right' : 'left'")
o(anchored ? '✅ ANCHOR OK — tileGround.inboardSideOf matches this probe\n'
           : '⛔ INSTRUMENT ANCHOR DRIFTED — tileGround.inboardSideOf changed. REFUSING to report; re-anchor first.\n')
if (!anchored) process.exit(1)

let totIE = 0, totFallback = 0, totGate = 0, totAgree = 0, totDisagree = 0
let totZeroed = 0, totInbPedNonZero = 0, totSym = 0, totStomp = 0, totStompable = 0
for (const scene of scenes) {
  const RIB = scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
  const DES = `public/looks/${scene}/design.json`
  if (!fs.existsSync(RIB)) { o(`${scene}: missing ${RIB} — SKIPPED LOUDLY`); continue }
  const rb = JSON.parse(fs.readFileSync(RIB, 'utf8'))
  const bc = fs.existsSync(DES) ? (JSON.parse(fs.readFileSync(DES, 'utf8')).blockCustoms || {}) : {}
  const byId = new Map(rb.streets.map(s => [s.skelId, s]))
  const ie = rb.streets.filter(s => s.anchor === 'inner-edge')
  let fallback = 0, gate = 0, agree = 0, disagree = 0, zeroed = 0, inbNonZero = 0, sym = 0, stomp = 0, stompable = 0
  for (const s of ie) {
    const mate = s.pairId ? byId.get(s.pairId) : null
    const r = inboardSideOf(s, mate)
    if (r.viaFallback) fallback++
    if (!mate && s.innerSign) gate++
    // F1: does the persisted vote agree with the geometry?
    const voteSide = s.innerSign === +1 ? 'right' : 'left'
    if (s.innerSign) { if (voteSide === r.side) agree++; else disagree++ }
    // F2: is the hack applied, and is it doing anything?
    const inb = s.measure?.[r.side], out = s.measure?.[r.side === 'left' ? 'right' : 'left']
    if (inb && (inb.treelawn === 0 && inb.sidewalk === 0)) zeroed++
    if (inb && ((inb.treelawn || 0) > 0 || (inb.sidewalk || 0) > 0)) inbNonZero++
    if (inb && out && Math.abs((inb.pavementHW || 0) - (out.pavementHW || 0)) < 1e-9) sym++
    // does the surveyHW/2 override stomp an AUTHORED per-side width?
    const authored = Object.entries(bc).filter(([k]) => k.startsWith(s.skelId + '|'))
    for (const [k, v] of authored) {
      const hw = v?.pavementHW
      if (Number.isFinite(hw)) { stompable++; if (Math.abs(hw - (out?.pavementHW || 0)) > 0.01) stomp++ }
    }
  }
  o(`${scene}: ${rb.streets.length} streets, ${ie.length} anchor='inner-edge'`)
  o(`   F1  innerSign vs the GEOMETRIC oracle : agree ${agree}   ⛔ DISAGREE ${disagree}`)
  o(`   F1  oracle fell back to innerSign     : ${fallback}   <- the ONLY path that reads the vote for a side`)
  o(`   F1  gate "!mate && !innerSign" decided: ${gate}   <- the only OTHER live read`)
  o(`   F2  inboard ped ZEROED (hack applied) : ${zeroed}/${ie.length}   inboard ped still non-zero: ${inbNonZero}`)
  o(`   F2  both sides same pavementHW        : ${sym}/${ie.length}   <- surveyHW/2 override signature`)
  o(`   F2  authored per-side widths on these : ${stompable}   of which OVERRIDDEN by the assign: ${stomp}`)
  totIE += ie.length; totFallback += fallback; totGate += gate; totAgree += agree; totDisagree += disagree
  totZeroed += zeroed; totInbPedNonZero += inbNonZero; totSym += sym; totStomp += stomp; totStompable += stompable
}
o(`\n══ VERDICT ══`)
o(`F1  innerSign is REMOVABLE iff both live reads are dead: fallback ${totFallback}, gate ${totGate} (of ${totIE} inner-edge chains)`)
o(`    ${totFallback === 0 && totGate === 0 ? '✅ BOTH DEAD — the geometry answers it everywhere. innerSign falls out.'
                                            : '⛔ STILL LOAD-BEARING — the model has a hole here.'}`)
o(`    and the vote itself: agree ${totAgree} / DISAGREE ${totDisagree}` +
  (totDisagree ? `  ⭐ removing it is a FIX, not just a cleanup` : ''))
o(`F2  the suppression hack: applied on ${totZeroed}/${totIE}; inboard ped non-zero on ${totInbPedNonZero}`)
o(`    ${totInbPedNonZero === 0 ? '✅ UNIFORM — every inner-edge chain is a one-sided chain wearing two sides.'
                                : '⛔ NOT UNIFORM — some inboard sides carry real ped; the hack is not purely suppression.'}`)
o(`    authored widths overridden by surveyHW/2: ${totStomp}/${totStompable}` +
  (totStomp ? `  ⛔ the assign is overwriting the operator (Layer 0 q3)` : `  ✅ overrides nothing authored`))
