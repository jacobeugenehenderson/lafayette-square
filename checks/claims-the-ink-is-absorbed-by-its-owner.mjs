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
//   (B) NEIGHBOURS SHARE THE CENTRELINE EXACTLY — each painted edge owned by a street (not the frame, not the water) has its
//       reverse in exactly ONE other face's painted boundary: the two tiles meet on the same vertices, with no slit.
//   (C) THE OWNER IS THE FACE'S OWN — each painted edge's street is one the face's UN-absorbed ring already bordered
//       (`blockLabels` / `blockHoleLabels`): the absorption reads ①'s labels, it never resolves a junction by geometry.
//   (P) PLANTED, the hole link's probe (absorbInk#holeProbe): a hole cycle whose LONGEST edge is a spur walked out and back
//       takes its probe off its longest REAL edge, never the spur (Zob, 2026-10-25).
//   MUTANTS (in process, always run): one painted vertex moved one lattice step (B must go RED); one centreline edge given
//   its twin's label, which is what a resolution by overlap does at a junction (C must go RED).
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
  // (B)
  let street = 0, noTwin = [], twoTwins = 0
  for (const [id, es] of dir) for (const e of es) { if (!isStreet(e.label)) continue
    street++
    const [a, b] = id.split('>'), tw = (dir.get(b + '>' + a) || []).filter(t => t.face !== e.face)
    if (tw.length === 0) noTwin.push(`face ${e.face} at (${a.split(',').map(v => (v / CLIP_SCALE).toFixed(3)).join(', ')})`)
    else if (tw.length > 1) twoTwins++ }
  // (C)
  const own = (k) => new Set([...(P.blockLabels?.[k] || []), ...(P.blockHoleLabels?.[k] || []).flat()].map(l => owners[l]?.skelId).filter(Boolean))
  const cache = new Map(), foreign = []
  for (const es of dir.values()) for (const e of es) { if (!isStreet(e.label)) continue
    const S = cache.get(e.face) || cache.set(e.face, own(e.face)).get(e.face)
    if (!S.has(owners[e.label].skelId)) foreign.push(`face ${e.face}: ${owners[e.label].skelId}`) }
  return { edges, unlabelled, street, noTwin, twoTwins, foreign }
}

for (const scene of ribbonScenes()) {
  const rp = join(ROOT, ribbonsPath(scene))
  if (!existsSync(rp)) continue
  const P = JSON.parse(readFileSync(rp, 'utf8')).protopolygon
  console.log(`\n── ${scene}`)
  if (!P?.paint || !P?.owners) { console.log('  ⛔ its ① carries no absorbed faces (protopolygon.paint) — a pour before the absorption. Re-pour.'); red++; continue }
  towns++
  const J = judge(P)
  row(!J.unlabelled, `(A) ${J.edges} painted edge(s) · ${J.unlabelled} with no owner`)
  row(!J.noTwin.length && !J.twoTwins, `(B) ${J.street} street-owned edge(s) · ${J.noTwin.length} with no neighbour on the same vertices${J.noTwin.length ? ` (e.g. ${J.noTwin.slice(0, 3).join(' · ')})` : ''} · ${J.twoTwins} shared by more than two faces`)
  row(!J.foreign.length, `(C) street-owned painted edges whose street the face did not already border: ${J.foreign.length}${J.foreign.length ? ` (e.g. ${J.foreign.slice(0, 3).join(' · ')})` : ''}`)
  // ── mutants ──
  const k0 = P.paint.findIndex(f => f?.outer?.length >= 4 && f.outerLabels.some(l => P.owners[l] && !P.owners[l].water && !P.owners[l].boundary))
  if (k0 < 0) { console.log('  ⚪ mutants: no painted face with a street edge — not judged'); continue }
  { const f = P.paint[k0], i = f.outerLabels.findIndex(l => P.owners[l] && !P.owners[l].water && !P.owners[l].boundary)
    const moved = { ...P, paint: P.paint.map((g, k) => k !== k0 ? g : { ...g, outer: g.outer.map((p, j) => j === i ? [p[0] + 1 / CLIP_SCALE, p[1]] : p) }) }
    const m = judge(moved), ok = m.noTwin.length > 0
    if (!ok) red++
    console.log(`  ${ok ? '✅' : '⛔'} mutant (B): face ${k0}'s vertex ${i} moved one lattice step — ${ok ? `RED as it must be (${m.noTwin.length} edge(s) lose their neighbour)` : 'stayed GREEN — (B) is blind'}`) }
  { // a centreline edge given the label its TWIN carries in the other face (the overlap resolution's answer at a junction)
    const owners = P.owners, isSt = (l) => owners[l] && !owners[l].water && !owners[l].boundary
    let done = null
    const paint = P.paint.map((f) => f && { ...f, outerLabels: [...f.outerLabels] })
    const dir = new Map(); paint.forEach((f, k) => f && f.outer.forEach((a, i) => dir.set(K(a) + '>' + K(f.outer[(i + 1) % f.outer.length]), { k, i })))
    for (const [k, f] of paint.entries()) { if (!f || done) continue
      for (let i = 0; i < f.outer.length && !done; i++) { const l = f.outerLabels[i]; if (!isSt(l)) continue
        const t = dir.get(K(f.outer[(i + 1) % f.outer.length]) + '>' + K(f.outer[i])); if (!t || t.k === k) continue
        const tl = paint[t.k].outerLabels[t.i]; if (!isSt(tl) || owners[tl].skelId === owners[l].skelId) continue
        f.outerLabels[i] = tl; done = { k, other: owners[tl].skelId } } }
    if (!done) console.log('  ⚪ mutant (C): no centreline edge between two DIFFERENT streets\' faces to swap — not judged')
    else { const m = judge({ ...P, paint }), ok = m.foreign.length > 0
      if (!ok) red++
      console.log(`  ${ok ? '✅' : '⛔'} mutant (C): face ${done.k} handed its neighbour's street (${done.other}) on one edge — ${ok ? 'RED as it must be' : 'stayed GREEN — (C) is blind'}`) } }
}
if (!towns) { console.log('\n⛔ no town carries absorbed faces — nothing was checked'); red++ }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ the ink is absorbed by its owners: every painted edge labelled, neighbours on the same vertices, no foreign owner')
process.exit(red ? 1 : 0)
