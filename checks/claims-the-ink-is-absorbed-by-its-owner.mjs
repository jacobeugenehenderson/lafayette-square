#!/usr/bin/env node
// CLAIM — ① (THE ε STRIP) IS ABSORBED INTO THE FACES BY ITS OWN LABELS: EVERY PAINTED EDGE NAMES ITS OWNER, NEIGHBOURS MEET
// ON THE CENTRELINE EXACTLY, AND NO FACE IS HANDED AN OWNER IT DID NOT ALREADY BORDER.
//
// The mint cuts ①'s ink along the sealed centrelines and splices each cell into the face that owns it (`src/lib/absorbInk.js`,
// BRIEF-the-ink-is-owned-by-its-labels §3.1–§3.2; Zob's read, Boz 2026-10-25). It replaces the re-stroked quads resolved by
// overlap (`inkByOwner` / `inkPiecesByOwner`, deleted), and with them `claims-the-ink-is-held-by-its-owners` (its subject).
// Read off each town's frozen ① (`ribbons.json` → protopolygon: `paint`, `blocks` / `blockLabels` / `blockHoleLabels`,
// `owners`) — light, no build:
//   (A) LABELLED — every edge of every painted face (outer and holes) carries a label naming an owner.
//   (B) NEIGHBOURS SHARE THE CENTRELINE EXACTLY — each painted edge owned by a street (not the frame, not the water) lies, as
//       the same two vertices in either direction, on exactly ONE other region's boundary — another painted face, or the water
//       cell its other side joined (a breakwater's water side; the ruling) — and the two regions lie on OPPOSITE sides of it.
//       ⭐ CORRECT BY CONSTRUCTION (Zob, 2026-10-25): which side a ring's region is on is read off the ring's own geometry and
//       its role — an outer has its region on the left iff its signed area > 0, a hole the opposite — and the role from the
//       record's structure (a face's `outer` / `holes`; a cell's `rings[0]` when `outer`). No rule per kind of record, so a
//       producer that changes its winding convention cannot invert (B) silently.
//   (C) THE OWNER IS THE FACE'S OWN — each painted edge's street is one the face's UN-absorbed ring already bordered
//       (`blockLabels` / `blockHoleLabels`): the absorption reads ①'s labels, it never resolves a junction by geometry.
//   (P) PLANTED, the hole link's probe (absorbInk#holeProbe): a hole cycle whose LONGEST edge is a spur walked out and back
//       takes its probe off its longest REAL edge, never the spur (Zob, 2026-10-25).
//   MUTANTS (in process, always run): one painted vertex moved one lattice step (B must go RED); every painted face re-wound
//   to the cells' convention (B must stay GREEN — it reads the winding, it does not assume it); one painted edge handed a
//   street its face does not border, which is what a resolution by overlap does at a junction (C must go RED).
//
//   node checks/claims-the-ink-is-absorbed-by-its-owner.mjs [--scene=<town> …]
// Exit 1 on any RED row, a town poured before the absorption, or a mutant that stays green.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, ribbonsPath, ribbonScenes } from './_scenes.mjs'
import { CLIP_SCALE } from '../src/lib/lattice.js'
import { holeProbe } from '../src/lib/absorbInk.js'

let red = 0, towns = 0
const row = (ok, s) => { if (!ok) red++; console.log(`  ${ok ? '✅' : '⛔'} ${s}`) }
const K = (p) => Math.round(p[0] * CLIP_SCALE) + ',' + Math.round(p[1] * CLIP_SCALE)

// (P): a 2 m square hole (clockwise, the face on its left is outside it) with a 30 m spur out of its first corner, out and back
{ const mk = (pts) => { const hs = []; for (let i = 0; i < pts.length; i++) hs.push({ from: pts[i], to: pts[(i + 1) % pts.length] })
    // the spur's two half-edges are each other's twins; a square edge's twin lies outside this cycle
    hs.forEach((h, i) => { h.twin = hs.find(g => g !== h && g.from === h.to && g.to === h.from) || { from: h.to, to: h.from } }); return hs }
  const O = [0, 0], S = [0, 30000], hs = mk([O, S, O, [2000, 0], [2000, -2000], [0, -2000]])
  hs[0].twin = hs[1]; hs[1].twin = hs[0]
  const pt = holeProbe(hs), onSpur = Math.abs(pt[0]) < 1 && pt[1] > 0
  row(!onSpur, `(P) a hole whose longest edge is a 30 m spur takes its probe off a real edge: (${pt.map(v => (v / CLIP_SCALE).toFixed(4)).join(', ')})`) }

function judge(P) {
  const owners = P.owners, faces = P.paint
  const isStreet = (l) => { const o = owners[l]; return o && !o.water && !o.boundary && o.skelId !== '__boundary__' }
  const ringsOf = (f) => [[f.outer, f.outerLabels], ...(f.holes || []).map((h, i) => [h, f.holeLabels?.[i] || []])]
  let edges = 0, unlabelled = 0
  const dir = new Map()     // "a>b" → [{ face, label }]
  faces.forEach((f, k) => { if (!f) return
    for (const [r, L] of ringsOf(f)) r.forEach((a, i) => { edges++; const l = L[i]
      if (l == null || !owners[l]) { unlabelled++; return }
      const id = K(a) + '>' + K(r[(i + 1) % r.length]); (dir.get(id) || dir.set(id, []).get(id)).push({ face: k, label: l }) }) })
  // (B) every region's rings, each with the side its region is on read off its own geometry and role
  const area2 = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0)
  const side = new Map()      // undirected "lo|hi" → [{ region, left }]: `left` = the region lies left of lo→hi
  const addRing = (region, r, isOuter) => { const regionLeft = (area2(r) > 0) === isOuter
    r.forEach((p, i) => { const a = K(p), b = K(r[(i + 1) % r.length]); if (a === b) return
      const fwd = a < b, id = fwd ? a + '|' + b : b + '|' + a
      ;(side.get(id) || side.set(id, []).get(id)).push({ region, left: fwd ? regionLeft : !regionLeft }) }) }
  faces.forEach((f, k) => { if (!f) return; addRing('f' + k, f.outer, true); (f.holes || []).forEach(h => addRing('f' + k, h, false)) })
  ;(P.inkCells || []).forEach((c, j) => { if (c.group === 'water') c.rings.forEach((r, q) => addRing('w' + j, r, q === 0 && c.outer === true)) })
  let street = 0, noTwin = [], twoTwins = 0, toWater = 0, sameSide = []
  for (const [id, es] of dir) for (const e of es) { if (!isStreet(e.label)) continue
    street++
    const [a, b] = id.split('>'), u = a < b ? a + '|' + b : b + '|' + a, all = side.get(u) || []
    const mine = all.find(t => t.region === 'f' + e.face), tw = all.filter(t => t.region !== 'f' + e.face)
    const at = `face ${e.face} at (${a.split(',').map(v => (v / CLIP_SCALE).toFixed(3)).join(', ')})`
    if (tw.length === 0) noTwin.push(at)
    else if (tw.length > 1) twoTwins++
    else { if (tw[0].region[0] === 'w') toWater++; if (mine && tw[0].left === mine.left) sameSide.push(at) } }
  // (C)
  const own = (k) => new Set([...(P.blockLabels?.[k] || []), ...(P.blockHoleLabels?.[k] || []).flat()].map(l => owners[l]?.skelId).filter(Boolean))
  const cache = new Map(), foreign = []
  for (const es of dir.values()) for (const e of es) { if (!isStreet(e.label)) continue
    const S = cache.get(e.face) || cache.set(e.face, own(e.face)).get(e.face)
    if (!S.has(owners[e.label].skelId)) foreign.push(`face ${e.face}: ${owners[e.label].skelId}`) }
  return { edges, unlabelled, street, noTwin, twoTwins, foreign, toWater, sameSide }
}

for (const scene of ribbonScenes()) {
  const rp = join(ROOT, ribbonsPath(scene))
  if (!existsSync(rp)) continue
  const P = JSON.parse(readFileSync(rp, 'utf8')).protopolygon
  console.log(`\n── ${scene}`)
  if (!P?.paint || !P?.owners) { console.log('  ⛔ its ① carries no absorbed faces (protopolygon.paint) — a pour before the absorption. Re-pour.'); red++; continue }
  if ((P.inkCells || []).some(c => typeof c.outer !== 'boolean')) { console.log('  ⛔ its absorbed cells do not say which ring is the outer (inkCells[].outer) — a pour before the record carried its role; (B) cannot read a side. Re-pour.'); red++; continue }
  towns++
  const J = judge(P)
  row(!J.unlabelled, `(A) ${J.edges} painted edge(s) · ${J.unlabelled} with no owner`)
  const okB = (m) => !m.noTwin.length && !m.twoTwins && !m.sameSide.length
  row(okB(J), `(B) ${J.street} street-owned edge(s) · ${J.toWater} with the water across (joined the water) · ${J.noTwin.length} with no neighbour on the same vertices${J.noTwin.length ? ` (e.g. ${J.noTwin.slice(0, 3).join(' · ')})` : ''} · ${J.twoTwins} shared by more than two regions · ${J.sameSide.length} whose neighbour lies on the SAME side${J.sameSide.length ? ` (e.g. ${J.sameSide.slice(0, 3).join(' · ')})` : ''}`)
  row(!J.foreign.length, `(C) street-owned painted edges whose street the face did not already border: ${J.foreign.length}${J.foreign.length ? ` (e.g. ${J.foreign.slice(0, 3).join(' · ')})` : ''}`)
  // ── mutants ──
  const k0 = P.paint.findIndex(f => f?.outer?.length >= 4 && f.outerLabels.some(l => P.owners[l] && !P.owners[l].water && !P.owners[l].boundary))
  if (k0 < 0) { console.log('  ⚪ mutants: no painted face with a street edge — not judged'); continue }
  { const f = P.paint[k0], i = f.outerLabels.findIndex(l => P.owners[l] && !P.owners[l].water && !P.owners[l].boundary)
    const moved = { ...P, paint: P.paint.map((g, k) => k !== k0 ? g : { ...g, outer: g.outer.map((p, j) => j === i ? [p[0] + 1 / CLIP_SCALE, p[1]] : p) }) }
    const m = judge(moved), ok = m.noTwin.length > 0
    if (!ok) red++
    console.log(`  ${ok ? '✅' : '⛔'} mutant (B): face ${k0}'s vertex ${i} moved one lattice step — ${ok ? `RED as it must be (${m.noTwin.length} edge(s) lose their neighbour)` : 'stayed GREEN — (B) is blind'}`) }
  { // every painted face re-wound to the CELLS' convention (its region on the left), its labels carried with each edge
    const rew = (r, L) => { const p = [...r].reverse(), l = [...L].reverse(); l.push(l.shift()); return [p, l] }
    const paint = P.paint.map(f => { if (!f) return f; const [o, ol] = rew(f.outer, f.outerLabels), H = (f.holes || []).map((h, q) => rew(h, f.holeLabels?.[q] || []))
      return { ...f, outer: o, outerLabels: ol, holes: H.map(x => x[0]), holeLabels: H.map(x => x[1]) } })
    const m = judge({ ...P, paint }), ok = okB(m) && m.street === J.street
    if (!ok) red++
    console.log(`  ${ok ? '✅' : '⛔'} mutant (B): every painted face re-wound to the cells' convention — ${ok ? 'GREEN as it must be (B reads the winding, it does not assume it)' : `went RED (${m.noTwin.length} no neighbour · ${m.sameSide.length} same side) — (B) assumes a winding`}`) }
  { // one street-owned painted edge handed a street the face does NOT border (a resolution by overlap at a junction hands a
    // face its neighbour's street). ⛔ Was: the label its centreline twin carries — but both sides of a centreline are ONE
    // street, so that mutant never found a case on any town and was never judged (the trial of 2026-10-25).
    const owners = P.owners, isSt = (l) => owners[l] && !owners[l].water && !owners[l].boundary
    const bordered = (k) => new Set([...(P.blockLabels?.[k] || []), ...(P.blockHoleLabels?.[k] || []).flat()].map(l => owners[l]?.skelId).filter(Boolean))
    let done = null
    for (const [k, f] of P.paint.entries()) { if (!f || done) continue
      const i = f.outerLabels.findIndex(isSt); if (i < 0) continue
      const S = bordered(k), l2 = owners.findIndex((o, l) => isSt(l) && !S.has(o.skelId)); if (l2 < 0) continue
      done = { k, i, l2, other: owners[l2].skelId } }
    if (!done) { console.log('  ⛔ mutant (C): no painted face and foreign street to plant — (C) is not exercised on this town'); red++ }
    else { const paint = P.paint.map((f, k) => k !== done.k ? f : { ...f, outerLabels: f.outerLabels.map((l, j) => j === done.i ? done.l2 : l) })
      const m = judge({ ...P, paint }), ok = m.foreign.length > 0
      if (!ok) red++
      console.log(`  ${ok ? '✅' : '⛔'} mutant (C): face ${done.k} handed a street it does not border (${done.other}) on one edge — ${ok ? 'RED as it must be' : 'stayed GREEN — (C) is blind'}`) } }
}
if (!towns) { console.log('\n⛔ no town carries absorbed faces — nothing was checked'); red++ }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ the ink is absorbed by its owners: every painted edge labelled, neighbours on the same vertices, no foreign owner')
process.exit(red ? 1 : 0)
