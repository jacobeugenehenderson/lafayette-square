// t3.mjs <scene> — TRIAL T3 (scratch/open-source-scout/REPORT.md §3): provenance through the carve, on Clipper2's Z channel.
// THE CARVE is ②'s own, inside `offsetRingByRects`: ① (sub-ε edges folded) MINUS the UNION of every edge's depth band and
// every corner's wedge/bevel — `differenceRings([ring], unionRings(clips))` (Clipper 1, NonZero, NO Z) — after which each
// output edge is labelled by CONTAINMENT among the block's own contributors (`labelOf`: a curb line outranks the ① edge,
// which outranks an end cap; most overlap wins). The probe copy (make-probe.mjs) hands this script the same clips and
// contributors the pour built, from the same input (in-<scene>.json, authoring loaded).
// HERE the same two booleans run in Clipper2 (Clipper64, NonZero, the same 1 mm grid), with every input vertex's Z seeded:
// Z names the input vertex, whose two edges' ① owners {skelId · side · segOrd} are known; a vertex Clipper2 MINTS goes through
// `zCallback`, which gets the two crossing edges and records the owners of both. Owner sets are carried, never looked up.
//   per output VERTEX: no owner · one · two or more (a corner names two by nature)
//   per output EDGE (the owner is a property of an edge — tileGround.js, "A LABEL IS A PROPERTY OF AN EDGE"): its owner is
//     the OWNERS its two vertices share (owner keys, so an edge spanning two ① edges of one street — Clipper2 drops collinear
//     vertices — keeps it) — none · one · ambiguous (≥ 2) · and, of the one-owner edges longer than TOL (a 1-grid-step
//     edge has no direction to judge; the pour merges those, `mergeGrid`), WRONG two ways:
//       off   — the edge lies on no contributor of that owner (geometry: within TOL of the segment, overlapping > TOL);
//       rule  — the owner differs from what the pour's containment rule gives the same edge (`labelOf`, re-implemented
//               verbatim over the same contributors).
// Counted on the carve's raw output and again on the rings the pour keeps (|area| > AREA_MIN). Our own carve's unlabelled
// edges (`labelOf` → null) are counted beside it.
import { readFileSync, writeFileSync } from 'fs'
import { Clipper64, ClipType, FillRule } from 'clipper2-ts'
import { offsetRingByRects } from './tileGround.probe.mjs'
import { signedArea } from './c2.mjs'
const scene = process.argv[2]
const IN = JSON.parse(readFileSync(new URL(`./in-${scene}.json`, import.meta.url), 'utf8'))
const SC = 1000, TOLC = 2 / SC                      // tileGround.js: CLIP_SCALE 1000, labelOf's TOLC = 2 / SCALE
const ownerKey = (lab) => { const o = IN.owners[lab]; return o ? `${o.skelId}|${o.side}|${o.segOrd}` : `?${lab}` }
const dS = (d) => Math.max(0, (Array.isArray(d) ? d[0] : d) || 0), dE = (d) => Math.max(0, (Array.isArray(d) ? d[1] : d) || 0)

function carveC2(ring, clips, clipLabs, outward) {
  const Zs = [null]                                  // Z id → Set of reduced ① edge indices
  const seed = (poly, L) => poly.map((p, j) => { Zs.push(new Set([L[(j - 1 + poly.length) % poly.length], L[j]])); return { x: Math.round(p[0] * SC), y: Math.round(p[1] * SC), z: Zs.length - 1 } })
  const edgeSet = (a, b) => { const A = Zs[a.z], B = Zs[b.z]; if (!A || !B) return new Set(); return new Set([...A].filter(x => B.has(x))) }
  let minted = 0, mintedEmpty = 0
  const zcb = (b1, t1, b2, t2, pt) => { const s = new Set([...edgeSet(b1, t1), ...edgeSet(b2, t2)]); minted++; if (!s.size) mintedEmpty++; Zs.push(s); pt.z = Zs.length - 1 }
  const run = (ct, subj, clip) => { const c = new Clipper64(); c.zCallback = zcb; c.addSubject(subj); if (clip) c.addClip(clip); const out = []; c.execute(ct, FillRule.NonZero, out); return out }
  const U = run(ClipType.Union, clips.map((p, i) => seed(p, clipLabs[i])))
  const R = seed(ring, ring.map((_, i) => i))
  const out = outward ? run(ClipType.Union, [R, ...U]) : run(ClipType.Difference, [R], U)
  return { rings: out, Zs, minted, mintedEmpty }
}
// the pour's containment rule, verbatim (tileGround.js offsetRingByRects `labelOf`), without its spatial grid
const labelOfRule = (contrib) => (p, q) => {
  const ex = q[0] - p[0], ey = q[1] - p[1], eL = Math.hypot(ex, ey); if (!(eL > 0)) return null
  let best = null
  for (const c of contrib) { const dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], L = Math.hypot(dx, dy)
    const off = (r) => Math.abs((r[0] - c.a[0]) * dy - (r[1] - c.a[1]) * dx) / L
    if (off(p) > TOLC || off(q) > TOLC) continue
    const tp = ((p[0] - c.a[0]) * dx + (p[1] - c.a[1]) * dy) / L, tq = ((q[0] - c.a[0]) * dx + (q[1] - c.a[1]) * dy) / L
    const ov = Math.min(L, Math.max(tp, tq)) - Math.max(0, Math.min(tp, tq))
    if (!(ov > TOLC)) continue
    if (!best || c.kind < best.kind || (c.kind === best.kind && ov > best.ov)) best = { kind: c.kind, ov, lab: c.lab } }
  return best ? best.lab : null }
// does the edge lie on SOME contributor carrying one of these labels?
const liesOn = (contrib, labs) => (p, q) => contrib.some(c => { if (!labs.has(c.lab)) return false
  const dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], L = Math.hypot(dx, dy)
  const off = (r) => Math.abs((r[0] - c.a[0]) * dy - (r[1] - c.a[1]) * dx) / L
  if (off(p) > TOLC || off(q) > TOLC) return false
  const tp = ((p[0] - c.a[0]) * dx + (p[1] - c.a[1]) * dy) / L, tq = ((q[0] - c.a[0]) * dx + (q[1] - c.a[1]) * dy) / L
  return Math.min(L, Math.max(tp, tq)) - Math.max(0, Math.min(tp, tq)) > TOLC })

const Z0 = () => ({ hyb: 0, hybNone: 0, long: 0, v: 0, vNone: 0, vOne: 0, vMany: 0, e: 0, eNone: 0, eOne: 0, eAmb: 0, eShort: 0, eJudged: 0, eOff: 0, eRule: 0, eRuleNone: 0, ruleKinds: {}, noneKinds: {} })
const tot = { raw: Z0(), kept: Z0(), ours: { e: 0, eNone: 0, eKeptNone: 0, eKept: 0, eKeptLong: 0, eKeptLongNone: 0 }, minted: 0, mintedEmpty: 0, contours: 0 }
const examples = { eOff: [], eRule: [], eAmb: [], eNone: [] }
for (const b of IN.blocks) for (const [c, outward] of [[b, false], ...b.holes.map(h => [h, true])]) {
  const st = {}
  offsetRingByRects(c.ring, (j) => c.depth[j], outward, st, null, 0.005, { e: c.e, v: c.v, hwy: c.hwy, own: c.own })
  const K = st._carve; if (!K) continue
  tot.contours++
  const own = (i) => ownerKey(c.labs[K.origE[i]])                  // reduced ① edge → owner key
  const maxD = Math.max(0, ...c.depth.map(d => Math.max(dS(d), dE(d)))), AREA_MIN = Math.max(0.5, maxD * maxD * 0.6)
  // ours: the carve's own labels
  K.rawRings.forEach((rg, ri) => { const keep = rg.length >= 3 && Math.abs(signedArea(rg)) > AREA_MIN
    rg.forEach((_, j) => { tot.ours.e++; const l = K.rawLabels[ri][j]; if (l == null) tot.ours.eNone++; if (keep) { tot.ours.eKept++; if (l == null) tot.ours.eKeptNone++
      const p = rg[j], q = rg[(j + 1) % rg.length]; if (Math.hypot(q[0] - p[0], q[1] - p[1]) > TOLC) { tot.ours.eKeptLong++; if (l == null) tot.ours.eKeptLongNone++ } } }) })
  const C = carveC2(K.ring, K.clips, K.clipLabs, K.outward)
  tot.minted += C.minted; tot.mintedEmpty += C.mintedEmpty
  const rule = labelOfRule(K.contrib)
  for (const rg of C.rings) {
    const P = rg.map(p => [p.x / SC, p.y / SC]), keep = P.length >= 3 && Math.abs(signedArea(P)) > AREA_MIN
    const ownSet = (z) => new Set([...(C.Zs[z] || [])].map(own))
    for (const T of keep ? [tot.raw, tot.kept] : [tot.raw]) {
      for (let j = 0; j < rg.length; j++) {
        const S = ownSet(rg[j].z); T.v++; if (!S.size) T.vNone++; else if (S.size === 1) T.vOne++; else T.vMany++
        const q = (j + 1) % rg.length, Sq = ownSet(rg[q].z), E = new Set([...S].filter(x => Sq.has(x))); T.e++
        if (Math.hypot(P[q][0] - P[j][0], P[q][1] - P[j][1]) > TOLC) { T.long++
          const zOk = E.size === 1 && liesOn(K.contrib, new Set(K.contrib.map(c => c.lab).filter(l => own(l) === [...E][0])))(P[j], P[q])
          if (!zOk && rule(P[j], P[q]) == null) T.hybNone++ }
        const at = P[j].map(x => +x.toFixed(2))
        if (!E.size) { T.eNone++
          // what the containment rule says this edge is, and what each END's own owners are
          const r0 = rule(P[j], P[q]), kr = r0 == null ? null : K.contrib.filter(c => c.lab === r0 && liesOn([c], new Set([r0]))(P[j], P[q])).map(c => c.kind).sort()[0]
          const kk = `rule ${r0 == null ? 'none' : `kind ${kr}${/__boundary__/.test(own(r0)) ? ' (rim)' : ''}`} · ends ${[...S].length}/${[...Sq].length} owners`; T.noneKinds[kk] = (T.noneKinds[kk] || 0) + 1
          if (T === tot.raw && examples.eNone.length < 12) examples.eNone.push({ k: b.k, at, p: P[j], q: P[q], owners: [[...S].join('+'), [...Sq].join('+')] }); continue }
        if (E.size > 1) { T.eAmb++; if (T === tot.raw && examples.eAmb.length < 12) examples.eAmb.push({ k: b.k, at, owners: [...E], p: P[j], q: P[q] }); continue }
        T.eOne++
        if (!(Math.hypot(P[q][0] - P[j][0], P[q][1] - P[j][1]) > TOLC)) { T.eShort++; continue }
        T.eJudged++
        const Ze = new Set(K.contrib.map(c => c.lab).filter(l => own(l) === [...E][0]))
        if (!liesOn(K.contrib, Ze)(P[j], P[q])) { T.eOff++; if (T === tot.raw && examples.eOff.length < 12) examples.eOff.push({ k: b.k, at, owner: [...E][0], p: P[j], q: P[q] }) }
        const r = rule(P[j], P[q])
        if (r == null) T.eRuleNone++
        else if (own(r) !== [...E][0]) { T.eRule++
          const kr = K.contrib.filter(c => c.lab === r && liesOn([c], new Set([r]))(P[j], P[q])).map(c => c.kind).sort()[0]
          const kz = K.contrib.filter(c => Ze.has(c.lab) && liesOn([c], Ze)(P[j], P[q])).map(c => c.kind).sort()[0]
          const kk = `rule kind ${kr} vs Z's kind ${kz ?? 'none'}`; T.ruleKinds[kk] = (T.ruleKinds[kk] || 0) + 1; if (T === tot.raw && examples.eRule.length < 12) examples.eRule.push({ k: b.k, at, z: [...E][0], rule: own(r), p: P[j], q: P[q] }) }
      }
    }
  }
}
const L = []; const say = (x = '') => { L.push(x); console.log(x) }
const pc = (a, b) => b ? `${a} (${(100 * a / b).toFixed(2)}%)` : `${a}`
say(`T3 · ${scene} (authored slots ${IN.slots}) · ${tot.contours} contours · the carve: ① − ∪(bands, wedges, bevels), NonZero, 1 mm grid`)
say(`Clipper2 minted ${tot.minted} vertices through zCallback; ${tot.mintedEmpty} of them got an empty owner set`)
for (const [nm, T] of [['raw carve', tot.raw], ['rings kept (> AREA_MIN)', tot.kept]]) {
  say(`${nm}:`)
  say(`  vertices ${T.v}: no owner ${pc(T.vNone, T.v)} · one ${pc(T.vOne, T.v)} · two or more ${pc(T.vMany, T.v)}`)
  say(`  edges ${T.e}: no owner ${pc(T.eNone, T.e)} · ambiguous ${pc(T.eAmb, T.e)} · one ${pc(T.eOne, T.e)}`)
  say(`    of the one-owner edges: ≤ TOL long (not judged) ${T.eShort} · judged ${T.eJudged}: on no contributor of that owner ${pc(T.eOff, T.eJudged)} · differs from the containment rule ${pc(T.eRule, T.eJudged)} · rule finds none ${pc(T.eRuleNone, T.eJudged)}`)
  say(`    edges > TOL ${T.long}: Z where it names one owner the edge lies on, else the containment rule → still unlabelled ${pc(T.hybNone, T.long)}`)
  say(`    no-owner edges by what the rule says they are: ${JSON.stringify(T.noneKinds)}`)
  say(`    rule disagreements by contributor kind (1 curb line · 2 ① edge · 3 band end cap): ${JSON.stringify(T.ruleKinds)}`)
}
say(`ours (Clipper 1 carve + containment labelOf): edges ${tot.ours.e}, unlabelled ${pc(tot.ours.eNone, tot.ours.e)}; on kept rings ${tot.ours.eKept}, unlabelled ${pc(tot.ours.eKeptNone, tot.ours.eKept)}; of those > TOL ${tot.ours.eKeptLong}, unlabelled ${pc(tot.ours.eKeptLongNone, tot.ours.eKeptLong)}`)
for (const [k, v] of Object.entries(examples)) if (v.length) { say(`examples ${k}:`); for (const x of v.slice(0, 6)) say(`  block ${x.k} at (${x.at.join(', ')}) ${x.owner || x.z || (x.owners || []).join(' + ') || ''}${x.rule ? ` · rule: ${x.rule}` : ''}${x.owners ? ` · ends ${x.owners.join(' | ')}` : ''}  len ${Math.hypot(x.q[0] - x.p[0], x.q[1] - x.p[1]).toFixed(3)} m`) }
writeFileSync(new URL(`./t3-${scene}.out`, import.meta.url), L.join('\n') + '\n')
writeFileSync(new URL(`./t3-${scene}.json`, import.meta.url), JSON.stringify({ tot, examples }))
