#!/usr/bin/env node
// claims-the-bands-are-held-by-their-owners.mjs — EACH TILE'S CURB, WALK AND LAWN ARE CUT INTO PIECES, EACH WITH ONE OWNER (`bandPiecesOfTile`).
//
// The ground gives a band its line through its pieces (Screed, 2026-10-17: a band point in no piece is refused, never
// handed to the nearest). Read through the one feed, with the town's authoring and stencil, against the bands the same
// pass PAINTED for that tile (`sectionOpen`, pieces mode):
//   1. COVER, EXACT — per tile and class, the pieces united are the painted band: the area either way round is reported at
//      the lattice, with no tolerance (Screed: "if some sliver is truly unavoidable, measure it and name what makes it").
//   2. DISJOINT — no two pieces of one tile overlap.
//   3. OWNERS — each of a piece's owners (one, or exactly the spans whose own rects hold it: `bandPiecesOfTile`) is the identity quartet of its span's stamp run (a dead-end cap's: `iaCap` → `caps`),
//      recomputed here off the frozen tile (`iaStamp` → `runs`), and that key is one the tile's ① ring carries (`ringOwner`).
//   5. DEPTHS — every owner carries its span's depths as struck (`offsetRingByRects`' rects) for the levels its class lies
//      between, which Screed's band blend reads as is.
//   4. SEAMS — at each seam's midpoint, a point just either side lies in a piece of that class owned by `a` and by `b`.
//   node checks/claims-the-bands-are-held-by-their-owners.mjs [--scene=<town> …] [--mutants] (or MUTANTS=1)
import clipperLib from 'clipper-lib'
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
import { CLIP_SCALE } from '../src/lib/lattice.js'

const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
const C = (r) => r.map(([x, z]) => ({ X: Math.round(x * CLIP_SCALE), Y: Math.round(z * CLIP_SCALE) }))
const op = (ct, A, B = []) => { const c = new Clipper(), out = []; c.AddPaths(A.filter(r => r?.length >= 3).map(C), PolyType.ptSubject, true)
  if (B.length) c.AddPaths(B.filter(r => r?.length >= 3).map(C), PolyType.ptClip, true)
  c.Execute(ct, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return out.map(p => p.map(q => [q.X / CLIP_SCALE, q.Y / CLIP_SCALE])) }
const area = (rs) => Math.abs(rs.reduce((t, r) => t + r.reduce((u, p, i) => u + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0) / 2, 0))
const inRings = (p, rings) => { let w = 0; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
  if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) w ^= 1 } return !!w }
const bbOf = (rs) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const r of rs) for (const [x, z] of r) { if (x < a) a = x; if (z < b) b = z; if (x > c) c = x; if (z > d) d = z } return [a, b, c, d] }
const meet = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
const key = (o) => o ? `${o.skelId}|${o.side}|${o.segOrd}` : null
const NEED = { curb: ['cw'], walk: ['walkFrom', 'walkTo'], lawn: ['cw', 'WB'] }   // the levels each class lies between

const judge = (T, R, scene, say) => {
  let n = 0, multi = 0, multiM2 = 0, noDepth = 0, uncovered = 0, beyond = 0, overlap = 0, wrongOwner = 0, notOnRing = 0, noOwner = 0, seamN = 0, seamWrong = 0, seamUnread = 0
  const unAt = [], ovAt = [], woAt = [], swAt = [], ndAt = []
  for (const t of T) {
    const st = R.protoShapeTiles[t.tile], ringKeys = new Set((st.ringOwner || []).map(o => o?.skelId ? key(o) : null).filter(Boolean))
    n += t.pieces.length
    for (const cls of ['curb', 'walk', 'lawn']) {
      const P = t.pieces.filter(q => q.cls === cls).flatMap(q => q.rings), B = t.painted[cls] || []
      if (!P.length && !B.length) continue
      const u = area(op(ClipType.ctDifference, B, P)), v = area(op(ClipType.ctDifference, P, B))
      uncovered += u; beyond += v
      if ((u > 0 || v > 0) && unAt.length < 4) unAt.push(`tile ${t.tile} ${cls}: ${u.toFixed(6)} m² painted in no piece, ${v.toFixed(6)} m² of piece not painted`)
    }
    const bb = t.pieces.map(q => bbOf(q.rings))
    for (let i = 0; i < t.pieces.length; i++) for (let j = i + 1; j < t.pieces.length; j++) { if (!meet(bb[i], bb[j])) continue
      const x = area(op(ClipType.ctIntersection, t.pieces[i].rings, t.pieces[j].rings)); if (x > 0) { overlap += x; if (ovAt.length < 4) ovAt.push(`tile ${t.tile}: ${t.pieces[i].cls} ${t.pieces[i].owners.map(o => o.span).join('+')} × ${t.pieces[j].cls} ${t.pieces[j].owners.map(o => o.span).join('+')} ${x.toFixed(6)} m²`) } }
    for (const q of t.pieces) { if (!q.owners?.length) { noOwner++; continue }
      if (q.owners.length > 1) { multi++; multiM2 += area(q.rings) }
      for (const ow of q.owners) { const need = NEED[q.cls] || [], miss = need.filter(k => !(Array.isArray(ow.depths?.[k]) && ow.depths[k].every(Number.isFinite)))
        if (miss.length) { noDepth++; if (ndAt.length < 4) ndAt.push(`tile ${t.tile} ${q.cls} ${ow.span}: no ${miss.join('/')}`) }
        const [h, r] = String(ow.span).split('/'), run = h[0] === 'c' ? st.caps?.[+h.slice(1)] : Number.isFinite(+r) ? st.runs?.[+r] : null
        if (!run) { noOwner++; continue }
        if (key(run) !== key(ow)) { wrongOwner++; if (woAt.length < 4) woAt.push(`tile ${t.tile} ${q.cls} span ${ow.span}: names ${key(ow)}, its stamp run is ${key(run)}`) }
        if (!ringKeys.has(key(ow))) notOnRing++ } }
    for (const sm of t.seams) for (const L of sm.line) { if (L.length < 2) continue; seamN++
      const a = L[0], b = L[L.length - 1], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nn = [-(b[1] - a[1]) / d * 0.005, (b[0] - a[0]) / d * 0.005]
      const at = (p) => t.pieces.filter(q => q.cls === sm.cls && inRings(p, q.rings)).flatMap(q => q.owners.map(key))
      const s1 = at([m[0] + nn[0], m[1] + nn[1]]), s2 = at([m[0] - nn[0], m[1] - nn[1]])
      if (!s1.length || !s2.length) { seamUnread++; continue }
      const got = new Set([...s1, ...s2]), want = new Set([sm.a, sm.b])
      if ([...want].some(k => !got.has(k))) { seamWrong++; if (swAt.length < 4) swAt.push(`tile ${t.tile} ${sm.cls} at (${m.map(v => v.toFixed(2))}): seam names ${sm.a} | ${sm.b}, the pieces either side are ${[...got].join(' | ')}`) } }
  }
  const ok = !uncovered && !beyond && !overlap && !wrongOwner && !noOwner && !seamWrong && !noDepth
  say(`${ok ? '✅' : '⛔'} ${scene}: ${T.length} tile(s) · ${n} band piece(s)`)
  say(`   1 cover (exact): painted in no piece ${uncovered.toFixed(6)} m² · piece not painted ${beyond.toFixed(6)} m²${unAt.length ? ` (${unAt.join(' · ')})` : ''}`)
  say(`   2 disjoint: overlap ${overlap.toFixed(6)} m²${ovAt.length ? ` (${ovAt.join(' · ')})` : ''}`)
  say(`   3 owners: not the span's stamp run (or cap) ${wrongOwner}${woAt.length ? ` (${woAt.join(' · ')})` : ''} · span with no stamp run or cap ${noOwner} · owner key not on the tile's ① ring ${notOnRing} (reported, not failed) · pieces held by more than one owner ${multi}, ${multiM2.toFixed(1)} m² (ground in two spans' rects or a join, Boz 2026-10-18)`)
  say(`   4 seams: ${seamN} read · naming an owner the pieces either side are not ${seamWrong}${swAt.length ? ` (${swAt.join(' · ')})` : ''} · a side in no piece of the class ${seamUnread} (reported, not failed)`)
  say(`   5 depths: owners missing a depth their class needs (curb: cw · walk: walkFrom, walkTo · lawn: cw, WB) ${noDepth}${ndAt.length ? ` (${ndAt.join(' · ')})` : ''}`)
  return { ok, uncovered, beyond, overlap, wrongOwner, noOwner, seamWrong, noDepth }
}
let bad = 0, towns = 0
for (const scene of feedScenes()) {
  const f = feed(scene); if (!f) { bad++; continue }
  const warn = console.warn; console.warn = () => {}
  let R; try { R = buildProto(f, { quiet: true, protoArtifact: true, protoProducer: true }) }
  catch (e) { console.warn = warn; console.log(`⛔ ${scene}: the producer refused, so nothing was checked — ${String(e.message).split('\n')[0].slice(0, 200)}`); bad++; continue }
  console.warn = warn
  const T = R.protoBandPieces
  if (!T?.length) { console.log(`⛔ ${scene}: the producer reported no band pieces — nothing was checked`); bad++; continue }
  towns++
  const J = judge(T, R, scene, console.log); if (!J.ok) bad++
  { let ref = 0, refM = 0; const at = []; for (const t of T) { ref += t.census.refused || 0; refM += t.census.refusedM2 || 0; at.push(...(t.census.refusedAt || []).map(x => `tile ${t.tile} ${x}`)) }
    console.log(`   the producer's own refusals (ground in no span's rect and no single join): ${ref} region(s), ${refM.toFixed(3)} m²${at.length ? ` — ${at.slice(0, 6).join(' · ')}` : ''}`) }
  // ⭐ MUTANTS (--mutants): each breaks ONE claim on this same output, and that claim must go RED — a check never seen to fail
  // proves nothing
  if (process.argv.includes('--mutants') || process.env.MUTANTS) {
    const clone = () => T.map(t => ({ ...t, pieces: t.pieces.map(q => ({ ...q, owners: q.owners.map(o => ({ ...o })) })), seams: t.seams.map(q => ({ ...q })) }))
    const M = {
      'drop a piece (→ 1 cover)': (X) => { for (const t of X) if (t.pieces.length > 1) { let k = 0; t.pieces.forEach((q, i) => { if (area(q.rings) > area(t.pieces[k].rings)) k = i }); t.pieces.splice(k, 1) } return 'uncovered' },
      'duplicate a piece (→ 2 disjoint)': (X) => { for (const t of X) if (t.pieces.length) t.pieces.push({ ...t.pieces[0] }); return 'overlap' },
      'owner shifted to the next stamp run (→ 3 owners)': (X) => { for (const t of X) { const st = R.protoShapeTiles[t.tile]; for (const q of t.pieces) for (const o of q.owners) { const r = +String(o.span).split('/')[1], n = st.runs?.[r + 1]; if (Number.isFinite(r) && n) Object.assign(o, { skelId: n.skelId, side: n.side, segOrd: n.segOrd }) } } return 'wrongOwner' },
      'an owner loses its depths (→ 5 depths)': (X) => { for (const t of X) for (const q of t.pieces) for (const o of q.owners) o.depths = null; return 'noDepth' },
      'seam names another owner (→ 4 seams)': (X) => { for (const t of X) for (const sm of t.seams) if (sm.a && sm.b && sm.a !== sm.b) sm.a = sm.b + '#'; return 'seamWrong' },
    }
    for (const [name, f] of Object.entries(M)) { const X = clone(), claim = f(X), r = judge(X, R, scene, () => {})
      const red = r[claim] > 0; if (!red) bad++; console.log(`   mutant · ${name}: ${red ? 'RED, as it must be' : '⛔ still GREEN — the claim cannot see it'} (${claim} ${typeof r[claim] === 'number' ? +r[claim].toFixed(6) : r[claim]})`) }
  }
}
if (!towns) { console.log('⛔ no town produced band pieces — nothing was checked'); bad++ }
console.log(`\n${bad ? '⛔ RED — a band is not held by its owners' : '✅ GREEN — every band piece names its owner, and the pieces are the bands'}`)
process.exit(bad ? 1 : 0)
