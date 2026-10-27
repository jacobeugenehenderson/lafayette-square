#!/usr/bin/env node
// CLAIM — ALONG THE WATER, ②'S KERB IS ①'S COAST LINE ITSELF: ONE LINE, READ BY BOTH SIDES, NEVER A SECOND NEAR-COPY.
//
// ①'s coast is the high-water mark (Jacob, 2026-10-25). Nothing offsets a curb from it (RIBBONS §1): a water edge has depth 0,
// and its corners are SHARP, street × coast included (Boz, 2026-10-26, Zob's read). The regression this catches: ②'s ease gave
// coast vertices the street class-seed radius (`rSrc` → `protoRAt` had H-3's highway exclusion and no water case), so the
// coast came back as fillet arcs, a second construction of ①'s line up to 0.39 units off it and crossing it (Huron tile 24,
// 2026-10-26). The asphalt (tile − iA − shore cells) kept the strip between the two lines, the land use read ②'s copy, the
// shore read ①'s, and the stack's noding reconciled them afterwards (claims-no-edge-is-drawn-twice: +3.9 km on Huron).
// Read off the producer's own output (`buildTileGround`, the town's authoring loaded), per coast town:
//   (A) every ② kerb vertex (`iaFull`) whose two edges are both stamped to the water (`iaStamp` → `runs[].skelId` ===
//       WATER_EDGE_SKEL) lies on ①'s water edge within one rounding AND is either a ① vertex (the frozen
//       `protopolygon.blocks`) or a vertex the land-use stamp shares into the kerb by design (a stamp crossing ON the coast
//       line, also a vertex of `luByClass`; Zob, 2026-10-26). Anything else is RED by name: off the line, or on it unshared.
//   (B) every ② kerb vertex with ONE water edge (where a street meets the coast) lies on a ① water edge, within the lattice's
//       one rounding (latticeNode#NODE_BOUND, read);
//   (C′) every ① coast vertex (both edges the water's) inside the SPAN of a ② water run appears in ② as a vertex. A run's
//       span is the stretch of ①'s ring between the run's two ends (where it joins a street, read by position on ①'s ring;
//       the whole ring for a run with no end). Dropped inside a span: RED (PTown block 11 v174, a collinear coast vertex,
//       2026-10-26). Outside every span the vertex lies under a carriageway, past a street's join with the water (Huron
//       wall-street-1, 21–47 m past its join): not part of the kerb, counted apart. By identity on ①'s ring, never a distance.
//   MUTANTS (always run): the producer copied with the coast clause of `rSrc` removed (the anchor must occur once) must go RED
//   on some town; a town where it stays GREEN has nothing on its coast to fillet and is said so. In process, per town: one
//   off-line vertex inserted mid-way along a ② water edge (pushed 2 units off it) must read RED as off the line, and one
//   on-line vertex shared by nothing must read RED as unshared.
//   node checks/claims-the-kerb-along-the-water-is-the-coast-line.mjs --slot=<who granted it> [<town> …]
// ⚠️ HEAVY: two producer builds per coast town (live and mutant). Not in npm test; runs in a granted slot and says who granted it.
// @args --slot=<granted>
// Exit 1 on any RED, a mutant that stays green everywhere, or no coast town · 2 with no --slot, or an anchor not found once.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
import { WATER_EDGE_SKEL } from '../src/lib/tileGround.js'
import { CLIP_SCALE } from '../src/lib/lattice.js'
import { NODE_BOUND } from '../src/lib/latticeNode.js'
import { ROOT } from './_scenes.mjs'

const slot = process.argv.find(a => a.startsWith('--slot='))?.slice('--slot='.length)
if (!slot) { console.log('⛔ NOT RUN — heavy: pass --slot=<who granted it> (two producer builds per coast town; never in npm test)'); process.exit(2) }
console.log(`(heavy run, slot granted by ${slot})`)
// the mutant: ONE modified tileGround.js in its own temp dir, the coast clause removed, imports pointed at the live src/lib
const CLAUSE = '(isWaterLab(labs[i]) || isWaterLab(labs[(i - 1 + ring.length) % ring.length]))\n          ? (protoRZero.water++, 0)\n          : '
const tgSrc = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8')
if (tgSrc.split(CLAUSE).length !== 2) { console.log(`⛔ NOT CHECKED — the coast clause of rSrc occurs ${tgSrc.split(CLAUSE).length - 1} time(s) in tileGround.js, not once — re-aim the mutant's anchor`); process.exit(2) }
const LIB = join(ROOT, 'src/lib')
const mutDir = mkdtempSync(join(tmpdir(), 'coast-kerb-'))
process.on('exit', () => rmSync(mutDir, { recursive: true, force: true }))
writeFileSync(join(mutDir, 'tileGround.js'), tgSrc.replace(CLAUSE, '')
  .replace(/from \x27(\.{1,2}\/[^\x27]+)\x27/g, (_, r) => `from "${pathToFileURL(join(LIB, r)).href}"`)
  .replace(/from \x27clipper-lib\x27/g, `from "${import.meta.resolve('clipper-lib')}"`))
const mutant = await import(pathToFileURL(join(mutDir, 'tileGround.js')).href)

const K = (p) => [Math.round(p[0] * CLIP_SCALE), Math.round(p[1] * CLIP_SCALE)]
const key = (k) => k[0] + ',' + k[1]
const windXZ = (p, r) => { let w = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
  if (zj <= p[1]) { if (zi > p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) > 0) w++ } else if (zi <= p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) < 0) w-- } return w }

// ①'s coast: its vertices with both edges the water's, and its water edges (lattice units)
function coastOf(fp) {
  const isW = (l) => l != null && fp.owners[l]?.skelId === WATER_EDGE_SKEL
  const both = new Map(), edges = [], ringsOut = []
  const rings = (fp.blocks || []).map((r, k) => [r, fp.blockLabels?.[k] || []]).concat((fp.blockHoles || []).flatMap((hs, k) => hs.map((h, j) => [h, fp.blockHoleLabels?.[k]?.[j] || []])))
  for (const [r, L] of rings) { const ri = ringsOut.push({ K: r.map(K), n: r.length }) - 1
    r.forEach((p, i) => { const n = r.length
      if (isW(L[i])) edges.push([K(p), K(r[(i + 1) % n]), ri, i])
      if (isW(L[i]) && isW(L[(i - 1 + n) % n])) both.set(key(K(p)), p) }) }
  const at = new Map(); ringsOut.forEach((o, ri) => o.K.forEach((k, i) => at.set(key(k), [ri, i])))
  return { both, edges, rings: ringsOut, at }
}
function judge(tiles, C, lu) {
  const vSet = new Set([...C.both.keys()]), all = new Set()
  const shared = new Set(); for (const rs of Object.values(lu || {})) for (const r of rs || []) for (const p of r || []) shared.add(key(K(p)))
  const onEdge = (k) => C.edges.some(([a, b]) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (!L2) return false
    const t = ((k[0] - a[0]) * dx + (k[1] - a[1]) * dy) / L2; if (t < 0 || t > 1) return false
    const cr = (k[0] - a[0]) * dy - (k[1] - a[1]) * dx; return cr * cr <= NODE_BOUND * NODE_BOUND * L2 })
  let A = 0, Abad = [], Aoff = [], Aunshared = [], B = 0, Bbad = []
  for (const t of tiles) (t.iaFull || []).forEach((ring, si) => { const st = t.iaStamp?.[si]; if (!st) return
    const n = ring.length, w = (e) => t.runs?.[st[e]]?.skelId === WATER_EDGE_SKEL
    ring.forEach((p, i) => { const k = K(p); all.add(key(k))
      const wi = w(i), wp = w((i - 1 + n) % n)
      if (wi && wp) { A++; if (!onEdge(k)) { Aoff.push(p); Abad.push(p) } else if (!vSet.has(key(k)) && !shared.has(key(k))) { Aunshared.push(p); Abad.push(p) } }
      else if (wi || wp) { B++; if (!onEdge(k)) Bbad.push(p) } }) })
  // (C′) the ① spans the ② water runs cover: a run vertex's POSITION on ①'s ring (a ① vertex: its index; on a ① water edge:
  // index + t), the span walked from the run's first position to its last in the direction its positions step
  const posOf = (k) => { const v = C.at.get(key(k)); if (v) return { ri: v[0], x: v[1] }
    for (const [a, b, ri, i] of C.edges) { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (!L2) continue
      const t = ((k[0] - a[0]) * dx + (k[1] - a[1]) * dy) / L2; if (t < 0 || t > 1) continue
      const cr = (k[0] - a[0]) * dy - (k[1] - a[1]) * dx; if (cr * cr <= NODE_BOUND * NODE_BOUND * L2) return { ri, x: i + t } }
    return null }
  const covered = new Set()
  for (const t of tiles) (t.iaFull || []).forEach((ring, si) => { const st = t.iaStamp?.[si]; if (!st) return
    const n = ring.length, w = (e) => t.runs?.[st[e]]?.skelId === WATER_EDGE_SKEL
    let s0 = -1; for (let e = 0; e < n; e++) if (w(e) && !w((e - 1 + n) % n)) { s0 = e; break }
    const runs = []
    if (s0 < 0) { if (w(0)) runs.push({ all: true, vs: ring }) }
    else for (let k = 0, e = s0; k < n;) { if (!w(e)) { e = (e + 1) % n; k++; continue }
      const vs = [ring[e]]; while (k < n && w(e)) { vs.push(ring[(e + 1) % n]); e = (e + 1) % n; k++ } runs.push({ vs }) }
    for (const R of runs) { const P = R.vs.map(q => posOf(K(q))).filter(Boolean); if (!P.length) continue
      const ri = P[0].ri, m = C.rings[ri].n
      if (R.all) { for (let i = 0; i < m; i++) covered.add(key(C.rings[ri].K[i])); continue }
      // the direction: the sign of the first non-zero step, taken the short way round
      let dir = 0; for (let j = 1; j < P.length && !dir; j++) { let d = P[j].x - P[j - 1].x; if (d > m / 2) d -= m; if (d < -m / 2) d += m; dir = Math.sign(d) }
      if (!dir) continue
      const a = P[0].x, b = P[P.length - 1].x, span = ((dir > 0 ? b - a : a - b) % m + m) % m
      for (let i = 0; i < m; i++) { const off = ((dir > 0 ? i - a : a - i) % m + m) % m; if (off > 0 && off < span) covered.add(key(C.rings[ri].K[i])) } } })
  let Cn = 0, under = 0; const Cbad = []
  for (const [kk, p] of C.both) { if (!tiles.some(t => t.ring && windXZ(p, t.ring) !== 0)) continue
    if (!covered.has(kk)) { under++; continue }
    Cn++; if (!all.has(kk)) Cbad.push(p) }
  return { A, Abad, Aoff, Aunshared, B, Bbad, Cn, Cbad, under }
}
const say = (J, label) => {
  const at = (ps) => ps.slice(0, 4).map(p => `(${p.map(v => v.toFixed(3)).join(', ')})`).join(' · ')
  console.log(`  ${J.Abad.length ? '⛔' : '✅'} (A)${label} ${J.A} ② kerb vertex(es) between two water edges · ${J.Aoff.length} off ①'s water edge${J.Aoff.length ? ` (e.g. ${at(J.Aoff)})` : ''} · ${J.Aunshared.length} on it but neither a ① vertex nor a stamp-shared one${J.Aunshared.length ? ` (e.g. ${at(J.Aunshared)})` : ''}`)
  console.log(`  ${J.Bbad.length ? '⛔' : '✅'} (B)${label} ${J.B} ② kerb vertex(es) where a street meets the water · ${J.Bbad.length} off ①'s water edge past one rounding${J.Bbad.length ? ` (e.g. ${at(J.Bbad)})` : ''}`)
  console.log(`  ${J.Cbad.length ? '⛔' : '✅'} (C′)${label} ${J.Cn} ① coast vertex(es) on ②'s kerb line · ${J.Cbad.length} missing from ② as a vertex${J.Cbad.length ? ` (e.g. ${at(J.Cbad)})` : ''} · ${J.under} under a carriageway (not kerb; counted, not judged)`)
  return J.Abad.length + J.Bbad.length + J.Cbad.length }

let red = 0, towns = 0, mutRed = 0
const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f() } finally { console.log = l; console.warn = w } }
for (const scene of feedScenes(process.argv.slice(2).filter(a => !a.startsWith('--')))) {
  const f = feed(scene); if (!f) continue
  const fp = f.ribbons.protopolygon, C = fp && coastOf(fp)
  if (!C?.edges.length) continue                     // no coast in ①: nothing to judge here
  console.log(`\n── ${scene}: ① carries ${C.edges.length} water edge(s), ${C.both.size} coast vertex(es)`)
  towns++
  let R; try { R = quiet(() => buildProto(f)) } catch (e) { console.log(`  ⛔ the producer refused — nothing checked: ${String(e.message).split('\n')[0].slice(0, 200)}`); red++; continue }
  if (say(judge(R.protoShapeTiles, C, R.luByClass), '')) red++
  // in-process mutants on the town's own ②: a vertex inserted mid-way along one water edge, (i) 2 units off it, (ii) on it
  { const t = R.protoShapeTiles.find(t => (t.iaFull || []).some((r, si) => t.iaStamp?.[si]?.some((s, e) => t.runs?.[s]?.skelId === WATER_EDGE_SKEL && t.runs?.[t.iaStamp[si][(e - 1 + r.length) % r.length]]?.skelId === WATER_EDGE_SKEL)))
    if (!t) console.log('  ⚪ mutants (planted vertex): no ② water run to plant on — not judged')
    else { const si = t.iaFull.findIndex((r, si) => t.iaStamp?.[si]?.some((s, e) => t.runs?.[s]?.skelId === WATER_EDGE_SKEL && t.runs?.[t.iaStamp[si][(e - 1 + r.length) % r.length]]?.skelId === WATER_EDGE_SKEL))
      const r = t.iaFull[si], st = t.iaStamp[si], e = st.findIndex((s, e) => t.runs?.[s]?.skelId === WATER_EDGE_SKEL && t.runs?.[st[(e - 1 + r.length) % r.length]]?.skelId === WATER_EDGE_SKEL && Math.hypot(r[(e + 1) % r.length][0] - r[e][0], r[(e + 1) % r.length][1] - r[e][1]) > 10 / CLIP_SCALE)
      const plant = (off) => { const a = r[e], b = r[(e + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L
        const m = [(a[0] + b[0]) / 2 + nx * off / CLIP_SCALE, (a[1] + b[1]) / 2 + nz * off / CLIP_SCALE].map(v => Math.round(v * CLIP_SCALE) / CLIP_SCALE)
        const ring = [...r.slice(0, e + 1), m, ...r.slice(e + 1)], stamp = [...st.slice(0, e + 1), st[e], ...st.slice(e + 1)]
        return R.protoShapeTiles.map(x => x !== t ? x : { ...t, iaFull: t.iaFull.map((q, j) => j === si ? ring : q), iaStamp: t.iaStamp.map((q, j) => j === si ? stamp : q) }) }
      if (e < 0) console.log('  ⚪ mutants (planted vertex): no water edge long enough to plant on — not judged')
      else { const off = judge(plant(2), C, R.luByClass), on = judge(plant(0), C, R.luByClass), J0 = judge(R.protoShapeTiles, C, R.luByClass)
        const okOff = off.Aoff.length > J0.Aoff.length, okOn = on.Aunshared.length > J0.Aunshared.length
        if (!okOff || !okOn) red++
        console.log(`  ${okOff ? '✅' : '⛔'} mutant (a vertex 2 units off a ② water edge): ${okOff ? 'RED as off the line, as it must be' : 'not seen — (A) is blind off the line'}`)
        console.log(`  ${okOn ? '✅' : '⛔'} mutant (a vertex ON a ② water edge, shared by nothing): ${okOn ? 'RED as unshared, as it must be' : 'not seen — (A) is blind to an unshared vertex'}`)
        // (C′): one ① coast vertex deleted from ② (its two water edges merged) must read missing, never "under a carriageway"
        const v = r.findIndex((q, i) => C.both.has(key(K(q))) && t.runs?.[st[i]]?.skelId === WATER_EDGE_SKEL && t.runs?.[st[(i - 1 + r.length) % r.length]]?.skelId === WATER_EDGE_SKEL)
        if (v < 0) console.log('  ⚪ mutant (a ① coast vertex dropped from ②): none to drop on this ring — not judged')
        else { const tiles2 = R.protoShapeTiles.map(x => x !== t ? x : { ...t, iaFull: t.iaFull.map((q, j) => j === si ? q.filter((_, i) => i !== v) : q), iaStamp: t.iaStamp.map((q, j) => j === si ? q.filter((_, i) => i !== v) : q) })
          const dr = judge(tiles2, C, R.luByClass), okD = dr.Cbad.length > J0.Cbad.length
          if (!okD) red++
          console.log(`  ${okD ? '✅' : '⛔'} mutant (a ① coast vertex dropped from ②): ${okD ? 'RED as missing, as it must be' : 'not seen — (C′) reads a dropped vertex as under a carriageway'}`) } } } }
  let M; try { M = quiet(() => buildProto(f, { tg: mutant })) } catch (e) { console.log(`  ✅ mutant (the coast clause removed): the producer refused (${String(e.message).split('\n')[0].slice(0, 120)}) — counted RED`); mutRed++; continue }
  const J = judge(M.protoShapeTiles, C, M.luByClass), bad = J.Abad.length + J.Bbad.length + J.Cbad.length
  if (bad) mutRed++
  console.log(`  ${bad ? '✅' : '⚪'} mutant (the coast clause of rSrc removed): ${bad ? `RED as it must be — (A) ${J.Abad.length} · (B) ${J.Bbad.length} · (C′) ${J.Cbad.length}` : 'GREEN here — no coast corner on this town takes a fillet without the clause'}`)
}
if (!towns) { console.log('\n⛔ no town with a coast in ① — nothing was checked'); red++ }
else if (!mutRed) { console.log('\n⛔ the mutant stayed GREEN on every town — the check cannot see a filleted coast'); red++ }
console.log(red ? `\n⛔ ${red} RED` : '\n✅ along the water, ②\'s kerb is ①\'s coast line itself')
process.exit(red ? 1 : 0)
