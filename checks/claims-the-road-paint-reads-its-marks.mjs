#!/usr/bin/env node
// CLAIM — THE ROAD'S PAINT IS WHAT EACH STREET'S MARKS SELECTED, STRUCK FROM THE SEALED SHAPE; AND THE PARKING DEPTH NEVER
// MOVES THE CURB. (BRIEF-the-ink-is-owned-by-its-labels §3.3/§3a/§3b/§4; Boz's parking proof, 2026-10-25.)
//
// The ground draws the centre stripe off the sealed centreline (`protopolygon.centrelines`) and the edge lines off ②'s
// labelled kerb (`tileGround.js#roadMarkings`), in the kinds the pour selected per street (`streets[].marks`,
// `src/cartograph/streetMarkings.js`). Everything below is read off the producer's own output with the town's AUTHORING
// LOADED (CLAUDE.md Layer 0 q3) — never restated.
//
//   (P) THE PARKING DEPTH IS NOT THE CURB'S INPUT. ② is built three times — the measure as poured, every `parking` 0, and
//       every `parking` = its side's pavementHW — and its kerb (`protoShapeTiles[].iA` / `iaFull`) must be byte-identical.
//       PLANTED (always run): the same comparison with pavementHW reduced by the parking depth (what "parking narrows the
//       carriageway" would do) must DIFFER, or the comparison proves nothing.
//   (S) EVERY STRIPE RING LIES ON A MARKED STREET: each vertex within half a double line (+ a lattice step) of a sealed
//       centreline run whose street's centre kind is not 'none'. A stripe beside only unmarked runs is RED.
//   (E) EVERY EDGE LINE LIES BESIDE A STREET THAT TAKES ONE: each vertex within the look's reach of a kerb edge whose run's
//       street has edge lines or a parking lane on that side. (E2) …and on the ROAD side of it: no edge line inside a block.
//   (S0) A town with marked streets draws SOME stripe: zero stripe vertices with marked runs present is RED.
//   MUTANT (S, E; in process, always run): `roadMarkings` with every street marked double-solid and both edges must go RED
//       on a town with any unmarked street — or (S) and (E) prove nothing there.
//
//   node checks/claims-the-road-paint-reads-its-marks.mjs --slot=<who granted it> [--scene=<town> …]
// ⚠️ HEAVY: three full ① ② ③ producer builds and two paint passes PER TOWN (minutes per town; LS + HPDM + Huron + PTown is a
// long run). So it is NOT in `npm test` (Boz, 2026-10-25: "heavy checks don't belong in npm test"): it runs on request, in a
// granted slot, and says who granted it. RED on every town poured before the road paint, until the re-pour.
// @args --slot=<granted>
// Exit 1 on any RED, an unbuildable town, or a mutant that stays green · 2 with no --slot.
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
import { roadMarkings } from '../src/lib/tileGround.js'
import { LATTICE_M } from '../src/lib/lattice.js'

const slot = process.argv.find(a => a.startsWith('--slot='))?.slice('--slot='.length)
if (!slot) { console.log('⛔ NOT RUN — heavy: pass --slot=<who granted it> (three producer builds per town; never in npm test)'); process.exit(2) }
console.log(`(heavy run, slot granted by ${slot})`)
let red = 0, towns = 0
const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f() } finally { console.log = l; console.warn = w } }
const sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
// segments in a grid; `within(p, d)` = some segment lies within d of p
function segIndex(segs, C = 20) {
  const g = new Map()
  for (const s of segs) for (let x = Math.floor(Math.min(s[0][0], s[1][0]) / C); x <= Math.floor(Math.max(s[0][0], s[1][0]) / C); x++) for (let z = Math.floor(Math.min(s[0][1], s[1][1]) / C); z <= Math.floor(Math.max(s[0][1], s[1][1]) / C); z++) (g.get(x + ',' + z) || g.set(x + ',' + z, []).get(x + ',' + z)).push(s)
  return (p, d) => { const r = Math.ceil(d / C); for (let x = Math.floor(p[0] / C) - r; x <= Math.floor(p[0] / C) + r; x++) for (let z = Math.floor(p[1] / C) - r; z <= Math.floor(p[1] / C) + r; z++) for (const s of (g.get(x + ',' + z) || [])) if (sd(p, s[0], s[1]) <= d) return true; return false }
}
const kerbOf = (R) => JSON.stringify((R.protoShapeTiles || []).map(t => [t.iA, t.iaFull]))
const withMeasure = (f, fn) => ({ ...f, ribbons: { ...f.ribbons, streets: f.ribbons.streets.map(st => st.measure?.left && st.measure?.right ? { ...st, measure: { ...st.measure, left: fn(st.measure.left), right: fn(st.measure.right) } } : st) } })

for (const scene of feedScenes()) {
  const f = feed(scene); if (!f) { red++; continue }
  console.log(`\n── ${scene}`)
  let R
  try { R = quiet(() => buildProto(f)) } catch (e) { console.log(`  ⛔ the producer refused — nothing checked: ${String(e.message).split('\n')[0].slice(0, 220)}`); red++; continue }
  towns++
  // ── (P) ──
  const base = kerbOf(R)
  const variants = [['parking 0', (s) => ({ ...s, parking: 0 })], ['parking = pavementHW', (s) => ({ ...s, parking: s.pavementHW })]]
  for (const [name, fn] of variants) {
    let K; try { K = kerbOf(quiet(() => buildProto(withMeasure(f, fn)))) } catch (e) { console.log(`  ⛔ (P) ${name}: the producer refused — ${String(e.message).split('\n')[0].slice(0, 160)}`); red++; continue }
    const ok = K === base; if (!ok) red++
    console.log(`  ${ok ? '✅' : '⛔'} (P) ② with ${name}: ${ok ? 'byte-identical to the poured measure' : 'DIFFERS — the parking depth reached the curb'}`)
  }
  { const P = (s) => ({ ...s, pavementHW: Math.max(0, (s.pavementHW || 0) - (s.parking || 0)) })
    const any = f.ribbons.streets.some(st => (st.measure?.left?.parking || 0) + (st.measure?.right?.parking || 0) > 0)
    if (!any) console.log('  ⚪ (P) planted: no street carries a parking depth, so the planted narrowing changes nothing to see — not judged')
    else { let K = null, refused = null; try { K = kerbOf(quiet(() => buildProto(withMeasure(f, P)))) } catch (e) { refused = String(e.message).split('\n')[0].slice(0, 120) }
      // a planted narrowing the producer REFUSES (the stamp, on the moved curb) has moved ② as surely as one it draws
      const ok = !!refused || K !== base; if (!ok) red++
      console.log(`  ${ok ? '✅' : '⛔'} (P) planted: pavementHW − parking ${refused ? `moves ② far enough that the producer refuses it (${refused})` : ok ? 'changes ② (the comparison can see a curb move)' : 'leaves ② unchanged — the comparison is blind'}`) } }
  // ── (S) and (E) ──
  const fp = f.ribbons.protopolygon, marks = new Map(f.ribbons.streets.map(st => [st.skelId, st.marks]))
  if (!fp?.centrelines) { console.log('  ⛔ (S) no sealed centreline — a pour before it'); red++; continue }
  const MARKING_LOOK = f.ribbons.markingLook
  if (!MARKING_LOOK) { console.log('  ⛔ (S) the ribbons carry no paint look — a pour before it'); red++; continue }
  const W = MARKING_LOOK.line, LAT = 2 * LATTICE_M
  const marked = [], unmarked = []
  for (const C of fp.centrelines) for (const r of C.runs) { const k = marks.get(r.skelId)?.centre?.kind
    const P = C.points.slice(r.from, r.to + 1).concat(C.closed && r.to === C.points.length ? [C.points[0]] : [])
    for (let i = 0; i < P.length - 1; i++) (k && k !== 'none' ? marked : unmarked).push([P[i], P[i + 1]]) }
  const nearMarked = segIndex(marked)
  const judgeS = (paint, label) => { let off = 0, n = 0, at = null
    for (const ring of paint.stripe) for (const p of ring) { n++; if (!nearMarked(p, MARKING_LOOK.gap / 2 + W + LAT)) { off++; at ||= p } }
    return { off, n, at, label } }
  // the kerb edges whose street takes an edge line or a parking lane on that side, and the reach a line lies within
  const kerbEdges = [], reach = Math.max(MARKING_LOOK.edgeInset + W, ...f.ribbons.streets.flatMap(st => [st.measure?.left?.parking || 0, st.measure?.right?.parking || 0]).map(d => d + W)) + LAT
  for (const t of R.protoShapeTiles) (t.iaFull || []).forEach((ring, si) => { const S = t.iaStamp?.[si]; if (!S) return
    ring.forEach((a, e) => { const run = t.runs?.[S[e]]; if (!run) return
      const M = marks.get(run.skelId), st = f.ribbons.streets.find(x => x.skelId === run.skelId)
      if (M?.edges?.kind?.[run.side] || (st?.measure?.[run.side]?.parking || 0) > 0) kerbEdges.push([a, ring[(e + 1) % ring.length]]) }) })
  const nearKerb = segIndex(kerbEdges)
  const judgeE = (paint, label) => { let off = 0, n = 0, at = null
    for (const ring of [...paint.edgeline, ...paint['edgeline:yellow']]) for (const p of ring) { n++; if (!nearKerb(p, reach)) { off++; at ||= p } }
    return { off, n, at, label } }
  const say = (x, what) => console.log(`  ${x.off ? '⛔' : '✅'} ${what}: ${x.n} vertex(es) · ${x.off} not ${what.startsWith('(S)') ? 'on a marked street' : 'beside a street that takes one'}${x.at ? ` (e.g. ${x.at.map(v => v.toFixed(2)).join(', ')})` : ''}`)
  // (E2) ON THE ROAD SIDE — a distance to the kerb is the same either side of it, so (E) cannot see a line struck into the BLOCK
  // (that inversion shipped once, the probe of 2026-10-25). No edge-line vertex may lie inside any tile's block (its curb ring, iA).
  const blocks = R.protoShapeTiles.flatMap(t => t.iA || []).filter(r => r?.length >= 3)
  const bbs = blocks.map(r => { let a = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, z] of r) a = [Math.min(a[0], x), Math.min(a[1], z), Math.max(a[2], x), Math.max(a[3], z)]; return a })
  const wind = (p, r) => { let w = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
    if (zj <= p[1]) { if (zi > p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) > 0) w++ } else if (zi <= p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) < 0) w-- } return w }
  const inBlock = (p) => blocks.some((r, i) => p[0] > bbs[i][0] && p[0] < bbs[i][2] && p[1] > bbs[i][1] && p[1] < bbs[i][3] && wind(p, r) !== 0)
  const judgeSide = (paint) => { let n = 0, inside = 0, at = null
    for (const ring of [...paint.edgeline, ...paint['edgeline:yellow']]) { const c = ring.reduce((t, p) => [t[0] + p[0] / ring.length, t[1] + p[1] / ring.length], [0, 0]); n++; if (inBlock(c)) { inside++; at ||= c } }
    return { n, inside, at } }
  const S = judgeS(R.roadPaint, 'live'), E = judgeE(R.roadPaint, 'live'), E2 = judgeSide(R.roadPaint)
  say(S, '(S) stripe'); say(E, '(E) edge lines'); red += (S.off ? 1 : 0) + (E.off ? 1 : 0)
  console.log(`  ${E2.inside ? '⛔' : '✅'} (E2) edge lines on the road side: ${E2.n} ring(s) · ${E2.inside} inside a block${E2.at ? ` (e.g. ${E2.at.map(v => v.toFixed(2)).join(', ')})` : ''}`); if (E2.inside) red++
  if (!S.n) { console.log('  ⛔ (S) no stripe was drawn on this town at all — a marked street must show one'); if (marked.length) red++ }
  // ── the mutant: every street marked ──
  const hasUnmarked = unmarked.length > 0
  if (!hasUnmarked) console.log('  ⚪ mutant: every street here is marked — the mutant cannot be told from the truth, not judged')
  else {
    const all = { centre: { kind: 'double-solid', rung: 'mutant' }, edges: { kind: { left: 'yellow', right: 'white' }, rung: 'mutant' } }
    let mp; try { mp = quiet(() => roadMarkings({ tiles: R.protoShapeTiles, centrelines: fp.centrelines, marksOf: () => all, measureOfRun: (run) => { const st = f.ribbons.streets.find(x => x.skelId === run.skelId); const m = st?.measure?.[run.side]; return m ? { pavementHW: m.pavementHW, parking: m.parking ?? 0 } : null }, look: MARKING_LOOK })) }
    catch (e) { console.log(`  ⛔ mutant: the paint refused — ${String(e.message).slice(0, 160)}`); red++; continue }
    const mS = judgeS(mp, 'mutant'), mE = judgeE(mp, 'mutant'), ok = mS.off > 0 || mE.off > 0
    if (!ok) red++
    console.log(`  ${ok ? '✅' : '⛔'} mutant (every street marked): ${ok ? `RED as it must be — stripe ${mS.off}, edge ${mE.off} vertex(es) off (not counted against the check)` : 'stayed GREEN — (S) and (E) prove nothing here'}`)
  }
}
if (!towns) { console.log('\n⛔ no town built — nothing was checked'); red++ }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ the road paint reads its marks, and the parking depth never moves the curb')
process.exit(red ? 1 : 0)
