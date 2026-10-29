#!/usr/bin/env node
// ⭐ THE OPEN/CLOSE CUTS ONCE (BRIEF-cut-once-in-full-precision §4; Zob's finish list, 2026-10-29). structures.mjs#openCloseAtStep
// (the footprints and the traced water) and #waterWithoutDecks (the deck take-out) open and close through cartograph/openClose.mjs,
// whose every edge is born on a source line and rounded to the lattice ONCE. Judged by checks/_cutOnceJudge.mjs (check-side, the
// investigation's own instruments): against the DEFINITION, the same operation by clipper on a lattice 1000× finer, end to end;
// against the SOURCE, no output edge is a second, re-rounded copy of one it did not change (BRIEF §3.1's yardstick, P as noded).
// The fast rows; Huron's whole traced water is the heavy ratchet: ▶ node checks/claims-the-open-close-cuts-once-huron.mjs
//   (0) the instruments are seen to fail: a planted copy reads copy 1; a planted missing corner reads a definition disagreement
//   (1) each planted row, aimed at one emission rule, through the kit: no disagreement with the definition past 2·NODE_BOUND, no
//       copy, no crossing; a row whose topology change is Boz's refuses BY NAME
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
import { partsOf, widerThanTwoH } from '../cartograph/openClose.mjs'
import * as FROZEN from './fixtures/open-close-integer-frozen-464dfa5f.mjs'
import { ip, union, e2e, definitionOf, ownEdge, crossings, short, topo } from './_cutOnceJudge.mjs'

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
}
// ⚠ A CUT POINT OFF ITS SOURCE LINE (Zob, 2026-10-29; BACKLOG "the open/close's residual against the definition"): in insideRun, a new
// cut side meets source edge 0 at (−4312.323, −3315.972), 1.94 u off its line (past NODE_BOUND), and the output runs back onto it: 2
// copies, on a ratchet named by site (Huron's one is in the heavy check). Why the emission invariant passes it is not established
const COPY_KNOWN = { insideRun: { n: 2, at: '-4312.323, -3315.972' } }
for (const [name, [what, rings]] of Object.entries(ROWS)) { const r = judge(openCloseAtStep, ip(rings), STEP_M, name), kc = COPY_KNOWN[name]
  const copyOk = kc ? r.copy === kc.n && r.copies.some(c => c.flat().join(', ').includes(kc.at)) : !r.copy
  row(!r.why && !r.cand.twoNb && !r.defn.twoNb && !r.cross && copyOk, `(1) ${name}: ${what} — ${r.why ? `REFUSED: ${r.why.slice(0, 200)}` : `${off2(r)} · copy ${r.copy}${kc ? ` (ceiling ${kc.n}, at (${kc.at}): ${r.copy > kc.n ? 'ROSE' : r.copy < kc.n ? 'FELL: lower it in this commit' : 'held'})` : ''} · crossings ${r.cross}`}`) }
// the two rows whose topology change is Boz's: each refuses by the guard's own name
{ const wallLong = [SQ(0, 0, 20000, 20000), rev(SQ(5000, 5000, 10000, 14300))], r = judge(openCloseAtStep, ip(wallLong), STEP_M, 'wallLong')
  row(/the topology guard: P's hole at \(5\.000, 19\.300\) .* opened to the outside/.test(r.why || ''), `(1) wallLong: a sub-2h wall over a stretch wider than 2h opens the hole, and the guard REFUSES by name — ${r.why ? r.why.slice(0, 160) : 'BUILT'}`) }
// ⛔ A KNOWN REFUSAL (Plumb, 2026-10-29; BACKLOG "the close's back-offset loses a hole the dilate re-forms"): a hole whose wall the
// open breaks over a stretch narrower than 2h. The close should refill the mouth and keep the hole (the definition does); its
// back-offset of the dilate's re-formed hole ring (a cut between two COLLINEAR edges of one open ring, across an arc that runs the
// whole outer) emits that arc instead, and the hole was FILLED with no refusal. The guard now refuses it by name. RED when the
// message changes, and RED when it starts BUILDING (then this row asserts it keeps its hole, against the definition)
{ const wallShort = [SQ(0, 0, 20000, 20000), rev([[5000, 5000], [15000, 5000], [15000, 17000], [10150, 17000], [10150, 19050], [9850, 19050], [9850, 17000], [5000, 17000]])]
  const r = judge(openCloseAtStep, ip(wallShort), STEP_M, 'wallShort'), KNOWN = "the open/close: a filled feature at (10.150, 20.000) (120.90 m²) is wider than a cell"
  row(!!r.why && r.why.includes(KNOWN), `(1) wallShort, the KNOWN refusal: a hole whose wall the open breaks over a short stretch — ${r.why ? (r.why.includes(KNOWN) ? 'refuses by name: the filled feature is wider than a cell (the close\'s back-offset loses the hole; cause not established)' : `refuses, NOT as known: ${r.why.slice(0, 200)}`) : 'now BUILDS: assert its hole is kept against the definition, and retire the known refusal'}`) }

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

// ── (4) PTown's take-out (structures.mjs#waterWithoutDecks over coast v5 and its street decks): the water within two cells of a
// deck opened, the deck and its slivers closed, both through openClose.mjs. ⛔ Its three subtractions (w0, loc, thin) are still
// clipper's integer booleans: a NAMED DEBT (BACKLOG). ⭐ The ≤ 2 mm count is a RATCHET: RED on a rise, and RED on a fall ("lower
// the ceiling to N in this commit"), so it can never drift into a tolerance
const TAKEOUT_SHORT = 11
const ratchet = (n, ceiling) => (n > ceiling ? `ROSE to ${n} above the ceiling ${ceiling}` : n < ceiling ? `FELL to ${n}: lower the ceiling to ${n} in this commit` : null)
{ const coast = fx('ptown-coast'), sd = fx('ptown-street-decks'), water = coast.water.flatMap(b => [b.outer, ...b.holes])
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
