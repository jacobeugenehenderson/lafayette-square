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
//   6. THE PERPENDICULAR CORNER (Jacob, 2026-10-20) — the painter discloses each corner's own ground as built (`t.perp`: each
//      leg's extension, each cut, a one-pad's hull), and this reads the owner OFF THE FROZEN TILE, never off the disclosure's
//      label: a leg's key is its edge's run, `r<t>/<t>` with t = `iaStamp[si][i]`. Within each record (shrunk by two grid steps,
//      so a neighbour that only meets its edge is not judged) on the painted band: a. every point is in a piece · b. every piece
//      names that leg · c. where two legs' extensions cross, both legs · d. a hull piece names its corner's arc (`a<arc>/…`).
//      Over every piece: e. an owner keyed by an arc (`a<arc>/…`) names only that arc's own edges (both ends in it, `iaArc` per
//      vertex) · f. pieces naming one owner twice, REPORTED, not failed: an arc's half is keyed `a<arc>/<t>` and its owner IS
//      its leg's run t (`ownerOf`), so ground a leg and its own arc's half share names that run twice (measured on HEAD before
//      the perpendicular build too: HPDM 1,382 pieces; open for Boz, 2026-10-20).
//   node checks/claims-the-bands-are-held-by-their-owners.mjs [--scene=<town> …] [--mutants] (or MUTANTS=1) · BANDS_ALL=1 lists every site with its position
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
// BANDS_ALL=1 lifts the 4-example cap on every list and prints each site on its own line, with a position (Boz, 2026-10-18:
// so every remainder can be placed against arcs). The producer's refusedAt keeps its own cap of 8 per tile.
const CAP = process.env.BANDS_ALL ? Infinity : 4, ALL = !!process.env.BANDS_ALL
const mid = (rs) => { const [a, b, c, d] = bbOf(rs); return `(${((a + c) / 2).toFixed(2)}, ${((b + d) / 2).toFixed(2)})` }
const NEED = { curb: ['cw'], walk: ['walkFrom', 'walkTo'], lawn: ['cw', 'WB'] }   // the levels each class lies between

// ⭐ the perpendicular clause (6), on the same output; `t.perp` is the painter's disclosure, the owners are read off the tile
const shrink = (rings, steps = 2) => { const co = new clipperLib.ClipperOffset(2, 0.25), out = new clipperLib.Paths()
  co.AddPaths(rings.filter(r => r?.length >= 3).map(C), clipperLib.JoinType.jtMiter, clipperLib.EndType.etClosedPolygon); co.Execute(out, -steps)
  return out.map(p => p.map(q => [q.X / CLIP_SCALE, q.Y / CLIP_SCALE])) }
const judgePerp = (T, R) => {
  const J = { perpRecords: 0, perpUncovered: 0, perpWrongLeg: 0, perpCross: 0, perpCrossWrong: 0, perpHull: 0, perpHullWrong: 0, perpNoStamp: 0, arcKeyBad: 0, dupOwner: 0, at: [] }
  const note = (s) => { if (J.at.length < CAP) J.at.push(s) }
  for (const t of T) {
    const st = R.protoShapeTiles[t.tile], recs = t.perp || []
    const byCls = (cls) => t.pieces.filter(q => q.cls === cls).map(q => ({ q, b: bbOf(q.rings) }))
    const P = { walk: byCls('walk'), lawn: byCls('lawn') }
    const hitting = (cls, region) => { const b = bbOf(region); return (P[cls] || []).filter(x => meet(x.b, b) && area(op(ClipType.ctIntersection, x.q.rings, region)) > 0).map(x => x.q) }
    const legKey = (x) => { const tt = st.iaStamp?.[x.si]?.[x.i]; return tt == null ? null : `r${tt}/${tt}` }
    const legs = new Map()   // corner → its ext records (walk), for the crossing
    for (const x of recs) { J.perpRecords++
      const reg = op(ClipType.ctIntersection, shrink(x.rings), t.painted[x.cls] || []); if (!reg.length) continue
      const got = op(ClipType.ctDifference, reg, t.pieces.filter(q => q.cls === x.cls).flatMap(q => q.rings)), u = area(got)
      if (u > 0) { J.perpUncovered += u; note(`tile ${t.tile} ${x.cls} ${x.kind} at ${mid(reg)}: ${u.toFixed(6)} m² in no piece`) }
      if (x.kind === 'hull') { J.perpHull++; const arc = String(x.corner).split('|')[1]
        for (const q of hitting(x.cls, reg)) if (!q.owners.some(o => String(o.span).startsWith(`a${arc}/`))) { J.perpHullWrong++; note(`tile ${t.tile} hull at ${mid(reg)}: a piece owned by ${q.owners.map(o => o.span).join('+')}, not arc ${arc}`) }
        continue }
      const k = legKey(x); if (k == null) { J.perpNoStamp++; continue }
      for (const q of hitting(x.cls, reg)) if (!q.owners.some(o => o.span === k)) { J.perpWrongLeg++; note(`tile ${t.tile} ${x.cls} ${x.kind} of leg ${k} at ${mid(reg)}: a piece owned by ${q.owners.map(o => o.span).join('+')}`) }
      if (x.kind === 'ext' && x.cls === 'walk') (legs.get(x.corner) || legs.set(x.corner, []).get(x.corner)).push({ x, k, reg }) }
    for (const [, ls] of legs) for (let a = 0; a < ls.length; a++) for (let b = a + 1; b < ls.length; b++) {
      const X = op(ClipType.ctIntersection, ls[a].reg, ls[b].reg); if (!(area(X) > 0)) continue; J.perpCross++
      for (const q of hitting('walk', X)) if (!(q.owners.some(o => o.span === ls[a].k) && q.owners.some(o => o.span === ls[b].k))) { J.perpCrossWrong++; note(`tile ${t.tile} crossing at ${mid(X)}: a piece owned by ${q.owners.map(o => o.span).join('+')}, not both ${ls[a].k} and ${ls[b].k}`) } }
    for (const q of t.pieces) { const ks = q.owners.map(key); if (new Set(ks).size < ks.length) J.dupOwner++
      for (const o of q.owners) { const m = String(o.span).match(/^a(\d+)\//); if (!m) continue
        for (const e of o.edges || []) { const A = st.iaArc?.[e.si] || [], n = A.length
          if (!(A[e.e] === +m[1] && A[(e.e + 1) % n] === +m[1])) { J.arcKeyBad++; note(`tile ${t.tile} ${q.cls} owner ${o.span}: edge ${e.si}:${e.e} is not an edge of arc ${m[1]} (iaArc ${A[e.e]} → ${A[(e.e + 1) % n]})`); break } } } }
  }
  return J
}
const judge = (T, R, scene, say) => {
  let n = 0, multi = 0, multiM2 = 0, noDepth = 0, noEdgeDepth = 0, uncovered = 0, beyond = 0, overlap = 0, wrongOwner = 0, notOnRing = 0, noOwner = 0, seamN = 0, seamWrong = 0, seamUnread = 0
  const unAt = [], ovAt = [], woAt = [], swAt = [], ndAt = [], neAt = []
  for (const t of T) {
    const st = R.protoShapeTiles[t.tile], ringKeys = new Set((st.ringOwner || []).map(o => o?.skelId ? key(o) : null).filter(Boolean))
    n += t.pieces.length
    for (const cls of ['curb', 'walk', 'lawn']) {
      const P = t.pieces.filter(q => q.cls === cls).flatMap(q => q.rings), B = t.painted[cls] || []
      if (!P.length && !B.length) continue
      const u = area(op(ClipType.ctDifference, B, P)), v = area(op(ClipType.ctDifference, P, B))
      uncovered += u; beyond += v
      if ((u > 0 || v > 0) && unAt.length < CAP) { if (ALL) { for (const g of op(ClipType.ctDifference, B, P)) unAt.push(`tile ${t.tile} ${cls}: painted in no piece ${area([g]).toFixed(6)} m² at ${mid([g])}`); for (const g of op(ClipType.ctDifference, P, B)) unAt.push(`tile ${t.tile} ${cls}: piece not painted ${area([g]).toFixed(6)} m² at ${mid([g])}`) }
        else unAt.push(`tile ${t.tile} ${cls}: ${u.toFixed(6)} m² painted in no piece, ${v.toFixed(6)} m² of piece not painted`) }
    }
    const bb = t.pieces.map(q => bbOf(q.rings))
    for (let i = 0; i < t.pieces.length; i++) for (let j = i + 1; j < t.pieces.length; j++) { if (!meet(bb[i], bb[j])) continue
      const x = area(op(ClipType.ctIntersection, t.pieces[i].rings, t.pieces[j].rings)); if (x > 0) { overlap += x; if (ovAt.length < CAP) ovAt.push(`tile ${t.tile}: ${t.pieces[i].cls} ${t.pieces[i].owners.map(o => o.span).join('+')} × ${t.pieces[j].cls} ${t.pieces[j].owners.map(o => o.span).join('+')} ${x.toFixed(6)} m²${ALL ? ` at ${mid(op(ClipType.ctIntersection, t.pieces[i].rings, t.pieces[j].rings))}` : ''}`) } }
    for (const q of t.pieces) { if (!q.owners?.length) { noOwner++; continue }
      if (q.owners.length > 1) { multi++; multiM2 += area(q.rings) }
      for (const ow of q.owners) { const need = NEED[q.cls] || [], miss = need.filter(k => !(Array.isArray(ow.depths?.[k]) && ow.depths[k].every(Number.isFinite)))
        if (miss.length) { noDepth++; if (ndAt.length < CAP) ndAt.push(`tile ${t.tile} ${q.cls} ${ow.span}: no ${miss.join('/')}${ALL ? ` · piece at ${mid(q.rings)}` : ''}`) }
        // 5b: the same depths from the TILE's record, through the owner's own edges (what the deformer reads)
        const viaTile = (ow.edges || []).some(e => need.every(k => t.edgeDepths?.[e.si]?.[e.e]?.[k]?.length))
        if (!viaTile) { noEdgeDepth++; if (neAt.length < CAP) neAt.push(`tile ${t.tile} ${q.cls} ${ow.span}: ${ow.edges?.length || 0} edge(s), none with ${need.join('/')}${ALL ? ` · piece at ${mid(q.rings)}` : ''}`) }
        const [h, r] = String(ow.span).split('/'), run = h[0] === 'c' ? st.caps?.[+h.slice(1)] : Number.isFinite(+r) ? st.runs?.[+r] : null
        if (!run) { noOwner++; continue }
        if (key(run) !== key(ow)) { wrongOwner++; if (woAt.length < CAP) woAt.push(`tile ${t.tile} ${q.cls} span ${ow.span}: names ${key(ow)}, its stamp run is ${key(run)}${ALL ? ` · piece at ${mid(q.rings)}` : ''}`) }
        if (!ringKeys.has(key(ow))) notOnRing++ } }
    for (const sm of t.seams) for (const L of sm.line) { if (L.length < 2) continue; seamN++
      const a = L[0], b = L[L.length - 1], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nn = [-(b[1] - a[1]) / d * 0.005, (b[0] - a[0]) / d * 0.005]
      const at = (p) => t.pieces.filter(q => q.cls === sm.cls && inRings(p, q.rings)).flatMap(q => q.owners.map(key))
      const s1 = at([m[0] + nn[0], m[1] + nn[1]]), s2 = at([m[0] - nn[0], m[1] - nn[1]])
      if (!s1.length || !s2.length) { seamUnread++; continue }
      const got = new Set([...s1, ...s2]), want = new Set([sm.a, sm.b])
      if ([...want].some(k => !got.has(k))) { seamWrong++; if (swAt.length < CAP) swAt.push(`tile ${t.tile} ${sm.cls} at (${m.map(v => v.toFixed(2))}): seam names ${sm.a} | ${sm.b}, the pieces either side are ${[...got].join(' | ')}`) } }
  }
  const list = (a) => !a.length ? '' : ALL ? `\n      ${a.join('\n      ')}\n  ` : ` (${a.join(' · ')})`
  const Jp = judgePerp(T, R)
  const ok = !uncovered && !beyond && !overlap && !wrongOwner && !noOwner && !seamWrong && !noDepth && !noEdgeDepth && !Jp.perpUncovered && !Jp.perpWrongLeg && !Jp.perpCrossWrong && !Jp.perpHullWrong && !Jp.perpNoStamp && !Jp.arcKeyBad
  say(`${ok ? '✅' : '⛔'} ${scene}: ${T.length} tile(s) · ${n} band piece(s)`)
  say(`   1 cover (exact): painted in no piece ${uncovered.toFixed(6)} m² · piece not painted ${beyond.toFixed(6)} m²${list(unAt)}`)
  say(`   2 disjoint: overlap ${overlap.toFixed(6)} m²${list(ovAt)}`)
  say(`   3 owners: not the span's stamp run (or cap) ${wrongOwner}${list(woAt)} · span with no stamp run or cap ${noOwner} · owner key not on the tile's ① ring ${notOnRing} (reported, not failed) · pieces held by more than one owner ${multi}, ${multiM2.toFixed(1)} m² (ground in two spans' rects or a join, Boz 2026-10-18)`)
  say(`   4 seams: ${seamN} read · naming an owner the pieces either side are not ${seamWrong}${list(swAt)} · a side in no piece of the class ${seamUnread} (reported, not failed)`)
  say(`   5 depths: owners missing a depth their class needs (curb: cw · walk: walkFrom, walkTo · lawn: cw, WB) ${noDepth}${list(ndAt)}`)
  say(`   5b depths via the tile's edgeDepths (owner.edges → tile.edgeDepths[si][e]): owners with no edge carrying them ${noEdgeDepth}${list(neAt)}`)
  say(`   6 perpendicular (${Jp.perpRecords} record(s) · ${Jp.perpCross} crossing(s) · ${Jp.perpHull} hull(s)): a in no piece ${Jp.perpUncovered.toFixed(6)} m² · b a piece not naming its leg ${Jp.perpWrongLeg} · c a crossing not both legs' ${Jp.perpCrossWrong} · d a hull not its arc's ${Jp.perpHullWrong} · a leg edge with no stamp run ${Jp.perpNoStamp} · e an arc key on an edge not that arc's ${Jp.arcKeyBad} · f one owner named twice ${Jp.dupOwner} (reported, not failed)${list(Jp.at)}`)
  return { ok, uncovered, beyond, overlap, wrongOwner, noOwner, seamWrong, noDepth, noEdgeDepth, ...Jp }
}
let bad = 0, towns = 0
for (const scene of feedScenes()) {
  const f = feed(scene); if (!f) { bad++; continue }
  const warn = console.warn; console.warn = () => {}
  let R; try { R = buildProto(f, { quiet: true }) }
  catch (e) { console.warn = warn; console.log(`⛔ ${scene}: the producer refused, so nothing was checked — ${String(e.message).split('\n')[0].slice(0, 200)}`); bad++; continue }
  console.warn = warn
  const T = R.protoBandPieces
  if (!T?.length) { console.log(`⛔ ${scene}: the producer reported no band pieces — nothing was checked`); bad++; continue }
  towns++
  const J = judge(T, R, scene, console.log); if (!J.ok) bad++
  { let ref = 0, refM = 0; const at = []; for (const t of T) { ref += t.census.refused || 0; refM += t.census.refusedM2 || 0; at.push(...(t.census.refusedAt || []).map(x => `tile ${t.tile} ${x}`)) }
    console.log(`   the producer's own refusals (ground in no span's rect and no single join): ${ref} region(s), ${refM.toFixed(3)} m²${at.length ? (ALL ? `\n      ${at.join('\n      ')}` : ` — ${at.slice(0, 6).join(' · ')}`) : ''}`) }
  // the producer's census, summed over tiles (bandPiecesOfTile's own counters; numbers add, {k: n} maps add per key) — so a
  // run before and after a producer change compares on the same line (Loess, 2026-10-18)
  { const sum = {}; for (const t of T) for (const [k, v] of Object.entries(t.census || {})) {
      if (typeof v === 'number') sum[k] = (sum[k] || 0) + v
      else if (v && typeof v === 'object' && !Array.isArray(v)) { const o = sum[k] || (sum[k] = {}); for (const [kk, vv] of Object.entries(v)) if (typeof vv === 'number') o[kk] = (o[kk] || 0) + vv } }
    const fmt = (v) => typeof v === 'number' ? +v.toFixed(3) : `{${Object.entries(v).map(([k, n]) => `${k}: ${+n.toFixed(3)}`).join(', ')}}`
    console.log(`   producer census: ${Object.entries(sum).map(([k, v]) => `${k} ${fmt(v)}`).join(' · ')}`) }
  // the bands as PAINTED, per class (the cover claim's own reference, `t.painted`), beside the census's area by emitter
  { const pm = {}; for (const t of T) for (const [cls, B] of Object.entries(t.painted || {})) pm[cls] = (pm[cls] || 0) + area(B || [])
    console.log(`   painted m² per class: ${Object.entries(pm).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(' · ')}`) }
  // …and the PIECES' own area by emitter, with this check's own area function (so it is comparable with `painted` above,
  // whatever the producer's census counts): piece.why, else its cell's kind
  { const em = {}, tot = {}; for (const t of T) for (const q of t.pieces) { const k = `${q.cls}:${q.why ?? 'cell ' + (q.from?.kind ?? '?')}`, a = area(q.rings); em[k] = (em[k] || 0) + a; tot[q.cls] = (tot[q.cls] || 0) + a }
    console.log(`   pieces m² per class: ${Object.entries(tot).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(' · ')} · by emitter: ${Object.entries(em).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(' · ')}`) }
  // ⭐ MUTANTS (--mutants): each breaks ONE claim on this same output, and that claim must go RED — a check never seen to fail
  // proves nothing
  if (process.argv.includes('--mutants') || process.env.MUTANTS) {
    // per corner: its legs' walk extensions (key off the frozen stamp, region on the painted walk) and its hulls
    const perpEach = (X, f) => { for (const t of X) { const st = R.protoShapeTiles[t.tile], by = new Map()
      for (const x of t.perp || []) { if (x.cls !== 'walk') continue; const g = by.get(x.corner) || by.set(x.corner, { legs: [], hulls: [] }).get(x.corner)
        const reg = op(ClipType.ctIntersection, shrink(x.rings), t.painted.walk || []); if (!reg.length) continue
        if (x.kind === 'hull') g.hulls.push(reg); else if (x.kind === 'ext') { const tt = st.iaStamp?.[x.si]?.[x.i]; if (tt != null) g.legs.push({ k: `r${tt}/${tt}`, reg }) } }
      for (const [ck, g] of by) f(t, st, g.legs, String(ck).split('|')[1], g.hulls) } }
    const inRec = (t, L) => t.pieces.filter(q => q.cls === 'walk' && area(op(ClipType.ctIntersection, q.rings, L.reg)) > 0)
    const clone = () => T.map(t => ({ ...t, pieces: t.pieces.map(q => ({ ...q, owners: q.owners.map(o => ({ ...o })) })), seams: t.seams.map(q => ({ ...q })) }))
    const M = {
      'drop a piece (→ 1 cover)': (X) => { for (const t of X) if (t.pieces.length > 1) { let k = 0; t.pieces.forEach((q, i) => { if (area(q.rings) > area(t.pieces[k].rings)) k = i }); t.pieces.splice(k, 1) } return 'uncovered' },
      'duplicate a piece (→ 2 disjoint)': (X) => { for (const t of X) if (t.pieces.length) t.pieces.push({ ...t.pieces[0] }); return 'overlap' },
      'owner shifted to the next stamp run (→ 3 owners)': (X) => { for (const t of X) { const st = R.protoShapeTiles[t.tile]; for (const q of t.pieces) for (const o of q.owners) { const r = +String(o.span).split('/')[1], n = st.runs?.[r + 1]; if (Number.isFinite(r) && n) Object.assign(o, { skelId: n.skelId, side: n.side, segOrd: n.segOrd }) } } return 'wrongOwner' },
      'the tile loses its edgeDepths (→ 5b)': (X) => { for (const t of X) t.edgeDepths = null; return 'noEdgeDepth' },
      'an owner loses its depths (→ 5 depths)': (X) => { for (const t of X) for (const q of t.pieces) for (const o of q.owners) o.depths = null; return 'noDepth' },
      'seam names another owner (→ 4 seams)': (X) => { for (const t of X) for (const sm of t.seams) if (sm.a && sm.b && sm.a !== sm.b) sm.a = sm.b + '#'; return 'seamWrong' },
      // the perpendicular corner (6): each mimics one wrong producer on this same output
      'P1 the legs swapped (→ 6b)': (X) => { perpEach(X, (t, st, legs) => { if (legs.length < 2) return; const [A, B] = legs
        for (const q of inRec(t, A)) for (const o of q.owners) if (o.span === A.k) o.span = B.k
        for (const q of inRec(t, B)) for (const o of q.owners) if (o.span === B.k) o.span = A.k }); return 'perpWrongLeg' },
      'P2 the crossing given to the arc (→ 6c)': (X) => { perpEach(X, (t, st, legs, arc) => { if (legs.length < 2) return
        const Xr = op(ClipType.ctIntersection, legs[0].reg, legs[1].reg); if (!(area(Xr) > 0)) return
        for (const q of t.pieces) if (q.cls === 'walk' && area(op(ClipType.ctIntersection, q.rings, Xr)) > 0) q.owners = [{ ...q.owners[0], span: `a${arc}/0` }] }); return 'perpCrossWrong' },
      'P3 the hull given to a leg (→ 6d)': (X) => { perpEach(X, (t, st, legs, arc, hulls) => { if (!legs.length) return
        for (const h of hulls) for (const q of t.pieces) if (q.cls === 'walk' && area(op(ClipType.ctIntersection, q.rings, h)) > 0) q.owners = [{ ...q.owners[0], span: legs[0].k }] }); return 'perpHullWrong' },
      "P4 a leg's span dropped, its ground refused (→ 6a)": (X) => { perpEach(X, (t, st, legs) => { if (!legs.length) return; const kill = new Set(inRec(t, legs[0]))
        t.pieces = t.pieces.filter(q => !kill.has(q)) }); return 'perpUncovered' },
      'P5 overlap ground given to one owner only (→ 6b)': (X) => { perpEach(X, (t, st, legs) => { for (const L of legs) for (const q of inRec(t, L))
        if (q.owners.length > 1) q.owners = q.owners.filter(o => o.span !== L.k) }); return 'perpWrongLeg' },
      "P6 an after leg read as its own arc, through spanOfSrc (→ 6b)": (X) => { perpEach(X, (t, st, legs, arc) => { for (const L of legs) for (const q of inRec(t, L))
        for (const o of q.owners) if (o.span === L.k) o.span = `a${arc}/${L.k.split('/')[1]}` }); return 'perpWrongLeg' },
      'P7 a cell edge starting on an arc keyed by the arc again (→ 6e)': (X) => { for (const t of X) { const st = R.protoShapeTiles[t.tile]
        for (const q of t.pieces) for (const o of q.owners) { if (!/^r/.test(String(o.span))) continue
          const e = (o.edges || []).find(e => { const A = st.iaArc?.[e.si] || []; return A[e.e] != null && A[(e.e + 1) % A.length] !== A[e.e] })
          if (e) o.span = `a${st.iaArc[e.si][e.e]}/${String(o.span).split('/')[1]}` } } return 'arcKeyBad' },
    }
    const nPerp = T.reduce((n, t) => n + (t.perp || []).length, 0), nHull = T.reduce((n, t) => n + (t.perp || []).filter(x => x.kind === 'hull').length, 0)
    for (const [name, f] of Object.entries(M)) {
      // a corner mutant needs a corner: on a town that builds none it cannot be seen to fail, so it is NAMED as not run
      if (/^P[1-6] /.test(name) && !nPerp) { console.log(`   mutant · ${name}: ⚠️ NOT RUN — ${scene} builds no perpendicular corner (its norm, or its frozen ribbons' norm), so this town cannot show it RED`); continue }
      if (/^P3 /.test(name) && !nHull) { console.log(`   mutant · ${name}: ⚠️ NOT RUN — ${scene} has no one-pad corner, so no hull to give away`); continue }
      const X = clone(), claim = f(X), r = judge(X, R, scene, () => {})
      const red = r[claim] > 0; if (!red) bad++; console.log(`   mutant · ${name}: ${red ? 'RED, as it must be' : '⛔ still GREEN — the claim cannot see it'} (${claim} ${typeof r[claim] === 'number' ? +r[claim].toFixed(6) : r[claim]})`) }
  }
}
if (!towns) { console.log('⛔ no town produced band pieces — nothing was checked'); bad++ }
console.log(`\n${bad ? '⛔ RED — a band is not held by its owners' : '✅ GREEN — every band piece names its owner, and the pieces are the bands'}`)
process.exit(bad ? 1 : 0)
