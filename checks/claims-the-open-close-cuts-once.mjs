#!/usr/bin/env node
// ⭐ THE OPEN/CLOSE CUTS ONCE (BRIEF-cut-once-in-full-precision §4; Zob's finish list, 2026-10-29). structures.mjs#openCloseAtStep
// (the footprints and the traced water) and #waterWithoutDecks (the deck take-out) open and close through cartograph/openClose.mjs,
// whose every edge is born on a source line and rounded to the lattice ONCE. Judged by cartograph/openCloseJudge.mjs (check-side, the
// investigation's own instruments): against the DEFINITION, the same operation by clipper on a lattice 1000× finer, end to end;
// against the SOURCE, no output edge is a second, re-rounded copy of one it did not change (BRIEF §3.1's yardstick, P as noded).
// The fast rows; Huron's whole traced water is the heavy ratchet: ▶ node checks/claims-the-open-close-cuts-once-huron.mjs
//   (0) the instruments are seen to fail: a planted copy reads copy 1; a planted missing corner reads a definition disagreement
//   (1) each planted row, aimed at one emission rule, through the kit: no disagreement with the definition past 2·NODE_BOUND, no
//       copy, no crossing; where the definition changes topology the kit follows it and NAMES the change (3b)
//   (2) PTown's decks and Breakwater strip and Huron's pier (fixtures): the same bar, and the decks' ≤ 2 mm edges at their pre-open 0
//   (3) TOPOLOGY: a planted hole, split and pinch keep the integer form's parts and holes
//   (4) PTown's take-out (coast v5 + its street decks): copy 0, crossings 0, its ≤ 2 mm edges on a RATCHET
//   Mutants, each seen RED: the integer re-offset restored (the frozen pre-port form, checks/fixtures/open-close-integer-frozen-
//   464dfa5f.mjs) on (2) and (4) · a method that drops a hole on (3) · the ratchet's ceiling one above and one below on (4).
//   ⚠ The PER-RULE mutants (each emission rule reversed: the gap rule before the miter limit, the trimmed arc inverted or unclipped, tags
//   by set order, the subtracted set wound the same way, …) are NOT here: each needs a mutated openClose.mjs, i.e. source mutation, which
//   tiers a check `live` (Zob, 2026-10-29: no third check). They are the scratch harness's rows, each seen RED on its planted row there
//   (scratch/cut-once/row-mutant.mjs ROW HOOK over cand3.mjs's hooks; port-equal.mjs proves the kit is cand3 with every hook off).
// ▶ node checks/claims-the-open-close-cuts-once.mjs
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openCloseAtStep, waterWithoutDecks } from '../cartograph/structures.mjs'
import { partsOf, widerThanTwoH, openCloseCutOnce } from '../cartograph/openClose.mjs'
import * as FROZEN from './fixtures/open-close-integer-frozen-464dfa5f.mjs'
import { ip, union, e2e, definitionOf, residualOf, verdictOf, ownEdge, crossings, short, topo } from '../cartograph/openCloseJudge.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const fx = (n) => JSON.parse(readFileSync(join(ROOT, `checks/fixtures/cut-once-${n}.json`), 'utf8'))
let fails = 0
const row = (ok, msg) => { if (!ok) fails++; console.log(`${ok ? '✅' : '⛔'} ${msg}`) }
const noded = (src) => ip(partsOf(src, 'P').flat())             // P as the open/close nodes it: the copy yardstick's source
// one run through an open/close: the definition end to end, the copy yardstick, crossings, ≤ 2 mm edges, topology
const judge = (f, src, stepM, name, def) => { let k
  try { k = f(src, stepM, name).paths } catch (e) { return { why: String(e.message) } }
  const j = e2e(k, src, stepM, def), o = ownEdge(noded(src), k)
  return { k, cand: j['candidate only'], defn: j['definition only'], largest: j.list[0], copy: o.copy, copyAt: o.copies[0], copies: o.copies, cross: crossings(k).length, short: short(k), topo: topo(k) } }
const off2 = (r) => `${r.cand.twoNb} candidate-only / ${r.defn.twoNb} definition-only past 2·NB${r.largest ? ` (largest ${r.largest.m2} m² at (${r.largest.at.join(', ')}))` : ''}`
const bar = (r) => !r.why && !r.cand.twoNb && !r.defn.twoNb && !r.copy && !r.cross

// ── (0) the instruments, seen to fail first
const SQ = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
{ const P = ip([SQ(0, 0, 20000, 20000)]), copied = ip([[[0, 0], [20000, 0], [20000, 20001], [0, 20001]]])
  const o = ownEdge(P, copied); row(o.copy === 3, `(0) the yardstick sees a copy: a square whose top edge is moved 1 unit (its two sides lengthened with it) reads copy ${o.copy} (want 3)`)
  // a source edge split by the noding at a vertex within NODE_BOUND of its line is the source edge; split 1 unit off, it is two copies
  const inNB = ownEdge(P, ip([[[0, 0], [20000, 0], [20000, 20000], [10000, 20000], [0, 20000]]])).copy, nudged = ownEdge(P, ip([[[0, 0], [20000, 0], [20000, 20000], [10000, 20001], [0, 20000]]])).copy
  row(inNB === 0 && nudged === 2, `(0) a split edge: at a vertex on its line it reads copy ${inNB} (want 0); at a vertex 1 unit off, copy ${nudged} (want 2)`)
  const cut = ip([[[0, 0], [20000, 0], [20000, 18000], [18000, 18000], [18000, 20000], [0, 20000]]]), j = e2e(cut, P, 0.9988)
  row(j['definition only'].twoNb === 1, `(0) the judge sees a disagreement: the square less a 2 m corner reads ${j['definition only'].twoNb} definition-only piece(s) past 2·NB (want 1)`) }

// ── (1) the planted rows (scratch/cut-once/planted.mjs's shapes, the investigation's rows), at a 0.9988 m step
const STEP_M = 0.9988, rev = (r) => r.slice().reverse()
const ROWS = {
  square: ['a 20 m square is unchanged', [SQ(0, 0, 20000, 20000)]],
  spike: ['a sub-2h spike on a straight wall is removed, the wall straight', [[[0, 0], [20000, 0], [20000, 20000], [10200, 20000], [10000, 23000], [9800, 20000], [0, 20000]]]],
  notch: ['a sub-2h notch is filled', [[[0, 0], [20000, 0], [20000, 20000], [10300, 20000], [10300, 17000], [9700, 17000], [9700, 20000], [0, 20000]]]],
  sharp: ['a 20° tip is squared past the miter limit', [[[0, 0], [20000, 3527], [0, 7053]]]],
  valley: ['a 24 u flat valley between two 10° turns is unchanged', [[[0, 0], [20000, 0], [20000, 20000], [12000, 20000], [10012, 19650], [9988, 19650], [8000, 20000], [0, 20000]]]],
  reflexChain: ['a reflex near-straight chain with a 24 u middle edge is unchanged', [[[0, 0], [20000, 0], [20000, 20000], [12000, 20000], [10016, 19982], [9992, 19982], [8000, 20000], [0, 20000]]]],
  notchAtLimit: ['a V-notch past the miter limit, its apex a 20 u flat, is squared in the close (the miter limit before the gap rule)', [[[0, 0], [20000, 0], [20000, 20000], [11409, 20000], [10010, 17000], [9990, 17000], [8591, 20000], [0, 20000]]]],
  arcInside: ['a trimmed arc wholly inside D is the region\'s own chain', [[[0, 0], [19980, 0], [19995, 5], [20000, 20], [20000, 20000], [0, 20000]]]],
  arcClipped: ['a trimmed arc with a vertex 6 u outside D is clipped at its target line', [[[0, 0], [19980, 0], [19990, -6], [20000, 20], [20000, 20000], [0, 20000]]]],
  cornerStub: ['a strip crossing a square\'s corner at a neck: the neck token read in the ring\'s forward order', [SQ(0, 0, 20000, 20000), [[18721, 20550], [20279, 19650], [24779, 27444], [23221, 28344]]]],
  insideRun: ['Huron\'s own water where a token inside one run carries its neighbour\'s line within the rounding: the run continues', fx('huron-inside-run-crop').paths],
  // PTown's own water (10 m round (−3936.813, −1432.743); 5 such sites in the census): a 5 u source edge between two near-collinear
  // long ones, whose offset vanished, so the erode's 1 u segment there is claimed by edges 9 and 7 between 8 and 9. Read forward, 7
  // comes after the successor 9 and the call refused 'no forward order'; 7's own offset line holds both ends within the rounding, so it
  // is a claimant and is dropped (openClose.mjs#emit; the mutant setClaimantsKept, scratch, refuses here)
  claimant: ['an order-breaking claimant within the rounding is dropped, the token read forward', fx('ptown-claimant-crop').paths],
  // PTown's own water (10 m round (817.712, −600.875); the census's 2 'backward, no staircase' sites): the same shape with a 17.8 u
  // edge, but the successor carries TWO tags (9 and 10), so the order is bounded at its latest; edge 8, read beyond it, is a claimant
  // (the mutant setClaimantOneSuccessor, scratch, refuses 'a cut from edge 10 to edge 8 runs BACKWARD')
  claimant2: ['an order-breaking claimant before a two-tag successor is dropped', fx('ptown-claimant2-crop').paths],
  // PTown's own water (10 m round (−119.15, 313.735)): a 45° staircase whose erode cuts edge 10 to edge 12 (0.2° apart) across a 5 u
  // step. The trimmed arc's premise fails (its arc starts outside D's wedge), the step is a sub-cell step between resolved runs, and
  // its vertices lie on the lines: they stand in (Zob's ruling; before, 'a trimmed arc STARTS outside D's wedge' refused here)
  trimstart: ['a trimmed arc whose premise fails at a sub-cell step: the step\'s own vertices stand in', fx('ptown-trimstart-crop').paths],
  // PTown's own water (30 m round (−4486.547, −1424.506); the census's 7 wide fills): the close shuts a mouth and the dilate re-forms a
  // hole tagged with the open's OUTER edges. A ring wound opposite to its tags' source takes no arc stand-ins (Zob's ruling; the mutant
  // setOppStandins fills the hole, 2.74 m²), and an offset face wholly the rounding is not emitted (a 3-vertex zero-area ring at the
  // mouth grew into a 1 m² hole that drained this one; the mutant setFSliverKept refuses 'P's hole opened'). The hole is KEPT
  wideFill: ['a hole the close re-forms at a shut mouth is kept, its walls an outer\'s edges', fx('ptown-widefill-crop').paths],
}
// ⚠ A CUT POINT OFF ITS SOURCE LINE (Zob, 2026-10-29; BACKLOG "the open/close's residual against the definition"): in insideRun, a new
// cut side meets source edge 0 at (−4312.323, −3315.972), 1.94 u off its line (past NODE_BOUND), and the output runs back onto it: 2
// copies, on a ratchet named by site (Huron's one is in the heavy check). Why the emission invariant passes it is not established
const COPY_KNOWN = { insideRun: { n: 2, at: '-4312.323, -3315.972' } }
for (const [name, [what, rings]] of Object.entries(ROWS)) { const r = judge(openCloseAtStep, ip(rings), STEP_M, name), kc = COPY_KNOWN[name]
  const copyOk = kc ? r.copy === kc.n && r.copies.some(c => c.flat().join(', ').includes(kc.at)) : !r.copy
  row(!r.why && !r.cand.twoNb && !r.defn.twoNb && !r.cross && copyOk, `(1) ${name}: ${what} — ${r.why ? `REFUSED: ${r.why.slice(0, 200)}` : `${off2(r)} · copy ${r.copy}${kc ? ` (ceiling ${kc.n}, at (${kc.at}): ${r.copy > kc.n ? 'ROSE' : r.copy < kc.n ? 'FELL: lower it in this commit' : 'held'})` : ''} · crossings ${r.cross}`}`) }
// a hole whose wall the open breaks over a stretch WIDER than 2h: the close cannot refill it, and the hole opens to the outside, as the
// definition opens it (Jacob's ruling (a); until 2026-10-29 the guard refused it). It builds, matches the definition, and names the change
{ const wallLong = [SQ(0, 0, 20000, 20000), rev(SQ(5000, 5000, 10000, 14300))], r = judge(openCloseAtStep, ip(wallLong), STEP_M, 'wallLong'), rec = r.why ? [] : openCloseAtStep(ip(wallLong), STEP_M, 'wallLong').topology
  row(!r.why && !r.cand.twoNb && !r.defn.twoNb && rec.some(x => x.kind === 'hole-opened'), `(1) wallLong: a sub-2h wall over a stretch wider than 2h opens the hole, as the definition does, and the record names it — ${r.why ? `REFUSED: ${r.why.slice(0, 160)}` : `${off2(r)} · record ${JSON.stringify(rec)}`}`) }
// ⭐ ONE LINE, TWO EDGES: a hole whose wall the open breaks over a stretch narrower than 2h. The close refills the mouth and the hole
// is KEPT, as the definition keeps it: the dilate re-forms the hole ring, whose back-offset reads a merged token of two collinear
// edges (the mouth's two sides) and LEAVES it at the last edge (openClose.mjs#emit). Left at the first, the join out ran across the
// whole outer and the hole was filled (until 2026-10-29 a known refusal here; the mutant setMergeLeavesFirst, scratch/cut-once)
{ const wallShort = [SQ(0, 0, 20000, 20000), rev([[5000, 5000], [15000, 5000], [15000, 17000], [10150, 17000], [10150, 19050], [9850, 19050], [9850, 17000], [5000, 17000]])]
  const r = judge(openCloseAtStep, ip(wallShort), STEP_M, 'wallShort')
  row(bar(r) && r.topo.holes === 1, `(1) wallShort: a hole whose wall the open breaks over a short stretch is KEPT — ${r.why ? `REFUSED: ${r.why.slice(0, 200)}` : `${r.topo.outers} outer, ${r.topo.holes} hole (want 1) · ${off2(r)} · copy ${r.copy} · crossings ${r.cross}`}`) }
// ⭐ A SINGLE-TAG SEGMENT OUT OF ORDER AT A STAIRCASE (Boz's GO, 2026-10-29): PTown's own water, 10 m round (343.28, −204.639), a 10.8 u
// source edge within the rounding of its neighbour's line, whose erode reads single-tag segments 10, 12, 11, 12. The rule re-reads the
// out-of-order one as the in-order neighbour's tag (its offset line holds it within the tiered bound) and the crop builds, matching the
// definition (the mutant setStairRetagOff, scratch, refuses as 'a STAIRCASE in its SOURCE'). ⛔ And it must NOT FIRE where the order
// holds: the kit's own count (openCloseCutOnce's stat.stairRetag) is 0 on every other planted row and fixture here
{ const src = ip(fx('ptown-staircase-crop').paths), r = judge(openCloseAtStep, src, STEP_M, 'staircase')
  let fired = null; try { fired = openCloseCutOnce(partsOf(src, 'staircase').flat(), STEP_M, 'staircase').stat.stairRetag || 0 } catch (e) { fired = `REFUSED ${String(e.message).slice(0, 80)}` }
  row(bar(r) && fired > 0, `(1) staircase: an out-of-order single-tag segment at a source staircase is read as its in-order neighbour — ${r.why ? `REFUSED: ${r.why.slice(0, 200)}` : `${off2(r)} · copy ${r.copy} · crossings ${r.cross}`} · the rule fired ${fired} time(s)`)
  const quiet = [...Object.entries(ROWS).map(([n, [, rings]]) => [n, ip(rings)]), ['decks', ip(fx('ptown-deck-inputs').inputs.flat())], ['breakwater', ip(fx('ptown-embankments').paths)], ['pier', ip(fx('huron-pier-deck-inputs').inputs.flat())]]
    .map(([n, s2]) => { let f = 0; try { for (const part of partsOf(s2, n)) f += openCloseCutOnce(part, STEP_M, n).stat.stairRetag || 0 } catch { f = 0 } return [n, f] }).filter(([, f]) => f > 0)
  // ⛔ AND NOT ON A COLLAPSING SMALL RING (Zob's ruling, 2026-10-29): PTown's own water, 20 m round (−3562.288, −1379.212), a 0.18 m²
  // hole whose sub-metre edges' offsets genuinely come out of order as it collapses. Its edges are shorter than a cell, so no resolved
  // run is there to continue: the rule fires 0 times and the hole is filled, as the definition fills it (the mutant setStairCellOff,
  // scratch, fires 4 times and disagrees with the definition by 4.746 m²)
  { const cs = ip(fx('ptown-collapse-crop').paths), cr = judge(openCloseAtStep, cs, fx('ptown-collapse-crop').fineM, 'collapse')
    let cf = null; try { cf = openCloseCutOnce(partsOf(cs, 'collapse').flat(), fx('ptown-collapse-crop').fineM, 'collapse').stat.stairRetag || 0 } catch (e) { cf = `REFUSED ${String(e.message).slice(0, 80)}` }
    row(bar(cr) && cf === 0, `(1) a collapsing small ring is not a staircase: the rule fired ${cf} time(s) — ${cr.why ? `REFUSED: ${cr.why.slice(0, 160)}` : `${off2(cr)} · copy ${cr.copy}`}`) }
  row(!quiet.length, `(1) the staircase rule does not fire where the order holds: ${quiet.length ? `it FIRED on ${quiet.map(([n, f]) => `${n} (${f})`).join(', ')}` : `0 times on the ${Object.keys(ROWS).length} planted rows, the decks, the Breakwater and the pier`}`) }

// ⭐ THE DEFINITION'S INVARIANT ON EVERY FEATURE (Zob's ruling, 2026-10-29): openClose.mjs refuses a taken or filled feature wider than
// 2h. Read from the source (both lists pass through the predicate before k is cut), and the predicate seen to fail: a planted over-wide
// take (a 3 m square) is wider; a 0.6 m strip is not
{ const src = readFileSync(join(ROOT, 'cartograph/openClose.mjs'), 'utf8'), wired = /for \(const \[kind, fs\] of \[\['taken', tf\], \['filled', ff\]\]\) for \(const pp of fs\) if \(widerThanTwoH\(pp, h\)\)/.test(src)
  const h = STEP_M / 2 * 1000, P = (r) => [r.map(([X, Y]) => ({ X, Y }))], wide = widerThanTwoH(P(SQ(0, 0, 3000, 3000)), h), thin = widerThanTwoH(P(SQ(0, 0, 600, 3000)), h)
  row(wired && wide && !thin, `(1) every taken and filled feature is held narrower than 2h: the guard reads both lists ${wired} · mutant, a planted over-wide take (3 m square) is wider ${wide}, RED · a 0.6 m strip is not ${!thin}`) }

// ── (2) the fixtures: PTown's decks (structures.mjs#deckInputs over its raw/osm.json), its Breakwater strip
// (#embankmentFootprints), Huron's pier (its deck inputs); each with the frozen integer form beside it as the mutant
const decks = fx('ptown-deck-inputs'), bw = fx('ptown-embankments'), pier = fx('huron-pier-deck-inputs')
const FIX = [['PTown\'s decks', ip(decks.inputs.flat()), decks.fineM], ['PTown\'s Breakwater strip', ip(bw.paths), bw.fineM], ['Huron\'s pier', ip(pier.inputs.flat()), pier.fineM]]
for (const [name, src, stepM] of FIX) { const def = definitionOf(src, stepM), r = judge(openCloseAtStep, src, stepM, name, def)
  const decksShort = name === 'PTown\'s decks' ? r.short === 0 : true
  row(bar(r) && decksShort, `(2) ${name}: ${r.why ? `REFUSED: ${r.why.slice(0, 200)}` : `${off2(r)} · copy ${r.copy} · crossings ${r.cross} · ≤ 2 mm ${r.short}${name === 'PTown\'s decks' ? ' (pre-open 0)' : ''}`}`)
  if (name !== 'PTown\'s decks') continue                        // the integer form copies nothing on the strip and one edge on the pier: the decks carry it
  const m = judge(FROZEN.openCloseAtStep, src, stepM, name, def)
  row(!m.why && m.copy > 0, `(2) mutant: the integer re-offset restored (frozen 464dfa5f) on ${name} → ${m.why ? `refused (${m.why.slice(0, 100)})` : `copy ${m.copy}${m.copyAt ? ` (first (${m.copyAt[0].join(', ')}) → (${m.copyAt[1].join(', ')}))` : ''} · ≤ 2 mm ${m.short} · crossings ${m.cross}`}${!m.why && m.copy > 0 ? ', RED as it must be' : ' — the row cannot see a copy'}`) }
{ const r = judge(FROZEN.openCloseAtStep, ip(ROWS.cornerStub[1]), STEP_M, 'cornerStub')
  row(!r.why && r.copy > 0, `(2) mutant: the integer re-offset restored on cornerStub → copy ${r.copy} · crossings ${r.cross}${!r.why && r.copy > 0 ? ', RED' : ' — not seen'}`) }

// ── (3) TOPOLOGY: a part with a hole (a 6 m hole, 7 m walls: kept), a dumbbell whose 0.4 m neck the open takes (a split), and two
// squares meeting at one vertex (a pinch) — the same outers and holes as the integer form, which is correct on each
const TOPO = [SQ(0, 0, 20000, 20000), rev(SQ(7000, 7000, 6000, 6000)),
  SQ(30000, 0, 8000, 8000), SQ(38000, 3800, 3000, 400), SQ(41000, 0, 8000, 8000),
  SQ(60000, 0, 8000, 8000), SQ(68000, 8000, 8000, 8000)]
{ const src = ip(TOPO), r = judge(openCloseAtStep, src, STEP_M, 'topology'), z = judge(FROZEN.openCloseAtStep, src, STEP_M, 'topology (integer)')
  const same = !r.why && !z.why && r.topo.outers === z.topo.outers && r.topo.holes === z.topo.holes
  row(same && bar(r), `(3) topology: a hole, a split and a pinch → ${r.why ? `REFUSED: ${r.why.slice(0, 160)}` : `${r.topo.outers} outer(s), ${r.topo.holes} hole(s); the integer form ${z.topo.outers}, ${z.topo.holes} · ${off2(r)}`}`)
  if (!r.why) { const dropped = r.k.filter(q => { let a = 0; for (let i = 0; i < q.length; i++) { const p = q[i], w = q[(i + 1) % q.length]; a += p.X * w.Y - w.X * p.Y } return a > 0 }), t = topo(dropped)
    row(t.holes !== z.topo.holes, `(3) mutant: a method that drops a hole → ${t.outers} outer(s), ${t.holes} hole(s) against the integer form's ${z.topo.holes}, RED${t.holes === z.topo.holes ? ' — NOT seen' : ''}`) } }

// ── (3b) THE TOPOLOGY THE DEFINITION CHANGES IS FOLLOWED, AND NAMED (Jacob's ruling (a), 2026-10-29): where the definition fills or
// opens a hole, merges holes or splits a part, the open/close does too, and its `topology` record names every change ({ kind, at, m2,
// n }). Per kind, a planted case: it builds, matches the definition end to end, and its record CLOSES THE BOOKS: P's holes − filled −
// opened − Σ(merged n − 1) = the output's holes, and P's outers + Σ(split n − 1) − Σ(joined n − 1) = its outers. ⛔ The mutant: the
// same change made SILENTLY (the record emptied) cannot close them, RED. (A change the definition does NOT make refuses at
// widerThanTwoH, row (1); its rule mutants are the scratch harness's.)
{ const books = (src, k, rec) => { const a = topo(src), b = topo(k), n = (kind, f = () => 1) => rec.filter(x => x.kind === kind).reduce((t, x) => t + f(x), 0), extra = (x) => (x.n || 1) - 1
    return a.holes - n('hole-filled') - n('hole-opened') - n('holes-merged', extra) === b.holes && a.outers + n('part-split', extra) - n('parts-joined', extra) === b.outers }
  const TOPOS = [
    ['hole-opened', 'PTown\'s own water: the definition opens an 11.13 m² hole to the outside (and fills a 1.6 m² one)', ip(fx('ptown-holeopen-crop').paths), fx('ptown-holeopen-crop').fineM],
    ['hole-filled', 'PTown\'s own water: two sub-cell holes whose walls meet within 2h are filled (the walls-meet transition)', ip(fx('ptown-walls-crop').paths), fx('ptown-walls-crop').fineM],
    ['holes-merged', 'two holes 6 m deep, the 0.6 m wall between them taken: one hole', ip([SQ(0, 0, 30000, 20000), rev(SQ(6000, 6000, 8000, 8000)), rev(SQ(14600, 6000, 8000, 8000))]), STEP_M],
    ['part-split', 'a dumbbell whose 0.4 m × 3 m neck the open takes: two parts', ip([SQ(30000, 0, 8000, 8000), SQ(38000, 3800, 3000, 400), SQ(41000, 0, 8000, 8000)]), STEP_M]]
  for (const [kind, what, src, stepM] of TOPOS) { let res = null, why = null; try { res = openCloseAtStep(src, stepM, kind) } catch (e) { why = String(e.message) }
    const r = why ? { why } : judge(openCloseAtStep, src, stepM, kind), rec = res?.topology || []
    const ok = !why && !r.cand.twoNb && !r.defn.twoNb && rec.some(x => x.kind === kind) && books(src, res.paths, rec)
    row(ok, `(3b) ${kind}: ${what} — ${why ? `REFUSED: ${why.slice(0, 180)}` : `${off2(r)} · record ${JSON.stringify(rec.map(x => `${x.kind}${x.n ? `×${x.n}` : ''} ${x.m2} m²`))} · the books ${books(src, res.paths, rec) ? 'close' : 'DO NOT close'}`}`)
    if (!why) row(!books(src, res.paths, []), `(3b) mutant: the ${kind} made SILENTLY (no record) → the books ${books(src, res.paths, []) ? 'still close — the row cannot see a silent change' : 'do not close, RED'}`) }
  // the cross-ring token (two holes' walls, three tags): read per ring, a transition; it builds and matches the definition
  const cr = judge(openCloseAtStep, ip(fx('ptown-crossring-crop').paths), fx('ptown-crossring-crop').fineM, 'cross-ring')
  row(bar(cr), `(3b) cross-ring: two holes' walls meeting at a segment carrying three tags of the two rings, each ring read at the tag that continues its neighbour — ${cr.why ? `REFUSED: ${cr.why.slice(0, 180)}` : `${off2(cr)} · copy ${cr.copy} · crossings ${cr.cross}`}`) }

// ── (3c) THE RUNTIME NET (Zob's ruling, Boz's approval, 2026-10-29): the coast step judges each open/close against its definition
// (openCloseJudge.mjs, which bake-coast.mjs imports) and gates every piece past 2·NODE_BOUND against the town's SIGNED tolerance
// (cartograph/data/<town>/coast-tolerance.json: count, m² and the accepted SET of piece keys, written only by sign-coast-residual.mjs
// --accept). ⛔ Seen to fail on a real wrong output: the collapsing hole's output with the staircase rule's cell test removed (frozen once,
// checks/fixtures/cut-once-ptown-collapse-wrong-output.json: a 4.746 m² piece only 0.929 m wide, which a cell bound let through)
{ const cs = ip(fx('ptown-collapse-crop').paths), st = fx('ptown-collapse-crop').fineM, empty = { n: 0, m2: 0, sites: [] }
  const wrongK = ip(fx('ptown-collapse-wrong-output').paths), wrong = residualOf(wrongK, cs, st), live = residualOf(openCloseAtStep(cs, st, 'collapse').paths, cs, st)
  const bc = readFileSync(join(ROOT, 'cartograph/bake-coast.mjs'), 'utf8'), sg = readFileSync(join(ROOT, 'cartograph/sign-coast-residual.mjs'), 'utf8')
  const wired = /if \(gate\) judgeNets\(\{ water: waterNet, decks: decksNet \}\)/.test(bc) && /waterNet = netOf\(oc\.paths, traced, fine\)/.test(bc) && /decksNet = netOf\(decks\.paths, deckInputs\(osm\.ground\)\.paths, fine\)/.test(bc)
    && /const tolPath = join\(mapDir, 'coast-tolerance\.json'\)/.test(bc) && /if \(!accept\) \{/.test(sg) && !/--force|--anyway|process\.env\./.test(bc.slice(bc.indexOf('const judgeNets'), bc.indexOf('const recordOf')))
  row(wired, `(3c) the runtime net is wired: bake-coast judges the water's and the decks' open/close against the town's tolerance before the record is written; sign-coast-residual writes only with --accept; no bake-anyway (${wired})`)
  const v = (r, t) => verdictOf(r, t, 'planted')
  row(v(wrong, empty).act === 'stop', `(3c) mutant: the frozen wrong output (${wrong.n} piece, ${wrong.m2} m², key ${wrong.pieces[0]?.key}) against an empty accepted set → ${v(wrong, empty).act.toUpperCase()}, RED as it must be`)
  row(v(live, empty).act === 'pass' && v(live, null).act === 'stop', `(3c) the live output of the same crop passes an empty set (${v(live, empty).act}); with NO tolerance signed, the first pour stops (${v(live, null).act})`)
  const signed = { n: wrong.n, m2: wrong.m2, sites: wrong.pieces.map(({ key, side, m2, at }) => ({ key, side, m2, at })) }
  const swap = { ...wrong, pieces: wrong.pieces.map(w => ({ ...w, key: w.key.split('').reverse().join('') })) }
  row(v(wrong, signed).act === 'pass' && v(swap, signed).act === 'stop', `(3c) the SET is gated: the signed piece passes (${v(wrong, signed).act}); mutant, one accepted piece swapped for a new one of equal count and m² → ${v(swap, signed).act.toUpperCase()}, RED`)
  const mv = (pp) => pp.map(r => r.map(q => ({ X: q.X + 1, Y: q.Y })))
  const shifted = residualOf(ip(mv(wrongK)), ip(mv(cs)), st)
  row(shifted.n === wrong.n && shifted.pieces[0]?.key !== wrong.pieces[0]?.key && v(shifted, signed).act === 'stop', `(3c) a piece moved by 1 mm is a NEW key (${wrong.pieces[0]?.key} → ${shifted.pieces[0]?.key}) and stops (${v(shifted, signed).act})`)
  const fell = v(wrong, { n: 2, m2: wrong.m2 + 1, sites: [...signed.sites, { key: 'gone0000000000000', side: 'definition only', m2: 1, at: [0, 0] }] })
  row(fell.act === 'tighten' && fell.tightened.n === 1 && fell.tightened.sites.length === 1, `(3c) a FALL tightens the tolerance: an accepted piece gone → ${fell.act}, to ${fell.tightened?.n} piece(s), ${fell.tightened?.m2} m²`) }

// ── (4) PTown's take-out (structures.mjs#waterWithoutDecks over coast v5 and its street decks): the water within two cells of a
// deck opened, the deck and its slivers closed, both through openClose.mjs. ⛔ Its three subtractions (w0, loc, thin) are still
// clipper's integer booleans: a NAMED DEBT (BACKLOG). ⭐ The ≤ 2 mm count is a RATCHET: RED on a rise, and RED on a fall ("lower
// the ceiling to N in this commit"), so it can never drift into a tolerance
const TAKEOUT_SHORT = 3
const ratchet = (n, ceiling) => (n > ceiling ? `ROSE to ${n} above the ceiling ${ceiling}` : n < ceiling ? `FELL to ${n}: lower the ceiling to ${n} in this commit` : null)
{ const coast = fx('ptown-coast'), sd = fx('ptown-street-decks-port'), water = coast.water.flatMap(b => [b.outer, ...b.holes])   // TODAY's decks (the fixture's note says how; the older fixture's were the pre-port footprints')
  const P = (r) => r.map(([x, z]) => ({ X: Math.round(x * 1000), Y: Math.round(z * 1000) }))
  const src = union(ip([...water.map(P), ...sd.rings.map(P)]))
  const take = (f) => { let w; try { w = f(water, coast.arcs || [], sd.rings, coast.fineM) } catch (e) { return { why: String(e.message) } }
    let le2 = 0; for (const r of w.rings) for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; if (Math.hypot(q[0] - p[0], q[1] - p[1]) <= 0.002) le2++ }
    const out = ip(w.rings.map(P)); return { le2, copy: ownEdge(src, out).copy, cross: crossings(out).length, slivers: w.slivers.length } }
  const t = take(waterWithoutDecks), why = t.why ? null : ratchet(t.le2, TAKEOUT_SHORT)
  row(!t.why && !t.copy && !t.cross && !why, `(4) PTown's take-out: ${t.why ? `REFUSED: ${t.why.slice(0, 200)}` : `copy ${t.copy} · crossings ${t.cross} · ≤ 2 mm ${t.le2} (ceiling ${TAKEOUT_SHORT}${why ? `: ${why}` : ''}) · ${t.slivers} sliver(s) taken`}`)
  if (!t.why) { row(!!ratchet(t.le2, TAKEOUT_SHORT - 1) && !!ratchet(t.le2, TAKEOUT_SHORT + 1), `(4) mutants: the ceiling one below → ${ratchet(t.le2, TAKEOUT_SHORT - 1)}; one above → ${ratchet(t.le2, TAKEOUT_SHORT + 1)}; both RED`) }
  const m = take(FROZEN.waterWithoutDecks)
  row(!m.why && (m.copy > 0 || !!ratchet(m.le2, TAKEOUT_SHORT)), `(4) mutant: the integer take-out restored (frozen 464dfa5f) → ${m.why ? `refused (${m.why.slice(0, 100)})` : `copy ${m.copy} · ≤ 2 mm ${m.le2} (${ratchet(m.le2, TAKEOUT_SHORT) || 'at the ceiling'})`}, RED`) }

console.log(fails ? `\n⛔ ${fails} claim(s) fail.` : '\n✅ the open/close cuts once')
process.exitCode = fails ? 1 : 0
