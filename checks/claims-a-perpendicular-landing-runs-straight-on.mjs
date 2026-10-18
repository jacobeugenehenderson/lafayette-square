#!/usr/bin/env node
// CLAIM — A PERPENDICULAR CORNER'S WALK RUNS STRAIGHT ON (`SECTION §6.1`; Jacob, 2026-10-18: "there is no bend at all, only
// straight extension thru"). Each leg's walk is carried past its tangent to the kerb, so where it lands its two SIDES are
// that walk's own lines: PARALLEL TO THE LEG (Boz, 2026-10-18: the extension is literal; at an oblique corner that is not
// square to the crossed street).
// READS the live pour (authoring loaded through the feed) — never a rule: per perpendicular curb cut, its `along` (the way
// the landing's walk runs back into the block, the painter's own record) and the drawn walk (`sidewalk` ∪ `curbCut`).
// ASSERTS, at every corner where BOTH legs landed (one landing leaves the other leg nothing to be parallel to — counted, not
// judged): inside a 4 m window round each landing, every SIDE — an edge ≥ 15 cm of the walk's boundary with exactly one end
// on the curb (the kerb line the walk meets) — lies within 2° of one of its corner's legs (the `along` of the corner's
// landings). In the straight-on corner a side is its leg's own line; a side on the arc's normal is not. Window edges are
// not the walk's and are skipped.
// ⭐ AND THE CUT IS THE WALK'S END (`SECTION §6.1`: the walk run on to the kerb "is its landing and its cut"; Jacob, 2026-10-18:
// "they should line up with the sidewalks themselves"). For EVERY perpendicular cut (one landing or two): the painted cut
// piece(s) near its record, and their ENDS — a vertex on the curb whose one neighbour edge leaves the curb. Each end lies within
// 2 cm (`ENDTOL`) of a SIDE LINE of the walk — the infinite line through a painted `sidewalk` edge (≥ 15 cm, within 4 m) running
// within 2° of the `along` of a perpendicular cut within 6 m — and each cut's kerb edge reaches both side lines of its own walk (the two
// either side of its record), so it spans the walk. A corner's two cuts may paint as one piece (joined where the walks cross at the kerb), so ends are judged per corner. Read from paint only; the cut's own edges are never a side line.
// PRINTS: per town, landings and sides judged, cuts and ends judged, and the perpendicular corners whose legs meet more than
// 10° off square — the case where "parallel to the leg" and "square across the street" part (the crosswalk's ruling meets it).
//   [LIST=1] node checks/claims-a-perpendicular-landing-runs-straight-on.mjs [scene…] [--painter=<tileGround copy>]   (LIST: every red end)
// SEEN RED on plan (2) (c825e04e: radial landings, sides on the arc's normals). MUTATION: give `legExt` a direction rotated
// off the edge's own — red. The ends row: SEEN RED on a89e3c36 (a norm-width piece centred on a re-solved contact);
// MUTATION: shift each cut 0.3 m along its kerb — red.
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { feed } from '../scratch/_proto-feed.mjs'
import { ribbonScenes } from './_scenes.mjs'
import { intersectRings } from '../src/lib/buildBlockGeometryV2.js'
const painter = process.argv.find(a => a.startsWith('--painter='))?.slice(10)
const { buildTileGround } = await import(painter ? pathToFileURL(resolve(painter)).href : '../src/lib/tileGround.js')
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const TOL = 2, MINLEN = 0.15, H = 2.0, ENDTOL = 0.02, SEP = 0.1
const ang = (u, v) => { const c = Math.abs(u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1); return Math.acos(Math.min(1, c)) * 180 / Math.PI }
let red = false
for (const scene of named.length ? named : ribbonScenes()) {
  const f = feed(scene); if (!f) { red = true; continue }
  const pl = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
  let R; try { R = buildTileGround(f.ribbons, { grout: 'proto', smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth,
    blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides,
    cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1, protoProducer: true }) } finally { console.log = pl; console.warn = pw }
  const recs = (R.curbCutRecs || []).filter(r => r.style !== 'diagonal' && r.along)
  if (!recs.length) { console.log(`── ${scene}   no perpendicular landing in this pour (norm ${f.ribbons.curbCutNorm?.style ?? 'none'})`); continue }
  const walk = [...(R.sidewalk || []), ...(R.curbCut || [])], curb = R.curb || []
  // a CORNER is the landings one arc carries: grouped by (ring, arc) and by distance, so two tiles' arc ids never merge
  const corners = []
  const legOf = (r) => (r.serves || []).map(x => `${x.leg?.skelId}|${x.leg?.side}`).join(',')
  for (const r of recs) { const c = corners.find(c => c.si === r.si && c.arc === r.arc && Math.hypot(c.at[0] - r.at[0], c.at[1] - r.at[1]) < 20)
    if (c) { if (!c.recs.some(o => o.at[0] === r.at[0] && o.at[1] === r.at[1] && legOf(o) === legOf(r))) c.recs.push(r) }   // a cut recorded twice is one landing
    else corners.push({ si: r.si, arc: r.arc, at: r.at, recs: [r] }) }
  let sides = 0, judged = 0
  const bad = []
  // an edge ON the curb (the kerb's inner line, which the walk meets) is the landing's kerb edge, never a side
  const onCurb = (m, segs) => segs.some(([a, b]) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
    const t = L2 ? Math.max(0, Math.min(1, ((m[0] - a[0]) * dx + (m[1] - a[1]) * dz) / L2)) : 0
    return Math.hypot(m[0] - a[0] - t * dx, m[1] - a[1] - t * dz) < 0.005 })
  // ⭐ a landing's SIDE is a walk edge with ONE end on the curb, running in from it — the leg's own lines along the kerb
  // (a curved or kinked leg's included) never touch it, and a walk already at the kerb lies ON it
  // only a corner whose BOTH legs landed can be judged: with one, the other leg's own lines have nothing to be parallel to
  const both = (c) => c.recs.length >= 2 && new Set(c.recs.map(legOf)).size >= 2
  for (const c of corners.filter(both)) {
    const legs = c.recs.map(r => r.along)
    for (const r of c.recs) {
      const [cx, cz] = r.at, win = [[cx - H, cz - H], [cx + H, cz - H], [cx + H, cz + H], [cx - H, cz + H]]
      const close = (g) => g.some(([x, z]) => Math.abs(x - cx) < 4 * H && Math.abs(z - cz) < 4 * H)
      const near = walk.filter(close)
      const W = near.length ? intersectRings(near, [win]) : []          // the subjects are united under the nonzero rule
      if (!W.length) continue
      judged++
      const segs = []; for (const g of curb.filter(close)) for (let i = 0; i < g.length; i++) segs.push([g[i], g[(i + 1) % g.length]])
      const onWin = (p, q) => [0, 1].some(k => Math.abs(p[k] - q[k]) < 1e-3 && Math.abs(Math.abs(p[k] - (k ? cz : cx)) - H) < 1e-3)
      // an edge drawn in BOTH directions is a seam between two pieces of the walk (the cut strip beside the sidewalk), not its edge
      // (its other side may be split into collinear pieces, so: any antiparallel edge within 2 mm of this one's midpoint)
      const E = []; for (const g of W) for (let i = 0; i < g.length; i++) E.push([g[i], g[(i + 1) % g.length]])
      const seam = (p, q) => { const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], e = [q[0] - p[0], q[1] - p[1]], le = Math.hypot(...e)
        return E.some(([a, b]) => { const d = [b[0] - a[0], b[1] - a[1]], ld = Math.hypot(...d); if (!(ld > 1e-6) || (e[0] * d[0] + e[1] * d[1]) / (le * ld) > -0.9998) return false
          const t = Math.max(0, Math.min(1, ((m[0] - a[0]) * d[0] + (m[1] - a[1]) * d[1]) / (ld * ld))); return Math.hypot(m[0] - a[0] - t * d[0], m[1] - a[1] - t * d[1]) < 0.002 }) }
      for (const g of W) for (let i = 0; i < g.length; i++) {
        const p = g[i], q = g[(i + 1) % g.length], e = [q[0] - p[0], q[1] - p[1]]
        if (Math.hypot(...e) >= MINLEN && seam(p, q)) continue
        if (Math.hypot(...e) < MINLEN || onWin(p, q) || onCurb([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], segs)) continue
        if (onCurb(p, segs) === onCurb(q, segs)) continue                // not a side: neither end, or both, on the curb
        sides++
        const a = Math.min(...legs.map(l => ang(e, l)))
        if (a > TOL) bad.push(`(${cx.toFixed(1)}, ${cz.toFixed(1)}): a side ${Math.hypot(...e).toFixed(2)} m long runs ${a.toFixed(1)}° off both legs`)
      }
    }
  }
  // ── the ends row: every perpendicular cut, from the painted cut and the painted walk ─────────────────────────────────
  // Per CORNER (a corner's two cuts may paint as one piece, joined where the two walks cross at the kerb): its painted cut
  // ring(s) within 0.5 m of a record, their ENDS (a vertex on the curb whose one neighbour edge leaves it), and the walks'
  // SIDE LINES — the infinite lines through painted `sidewalk` edges (≥ 15 cm, within 4 m) running within 2° of a cut's
  // `along`. Every end lies on a side line of one of the corner's walks; every cut has ends on two of its OWN walk's lines.
  const cuts = R.curbCut || [], walkOnly = R.sidewalk || []
  const segD = (P, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
    const t = L2 ? Math.max(0, Math.min(1, ((P[0] - a[0]) * dx + (P[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(P[0] - a[0] - t * dx, P[1] - a[1] - t * dz) }
  const ringD = (P, g) => { let m = Infinity; for (let i = 0; i < g.length; i++) m = Math.min(m, segD(P, g[i], g[(i + 1) % g.length])); return m }
  const unit = (v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l] }
  // each cut's own side lines, as offsets across its `along`
  const lineCache = new Map(), linesOf = (r) => { if (lineCache.has(r)) return lineCache.get(r)
    const u = unit(r.along), nr = [-u[1], u[0]], offs = [], [cx, cz] = r.at
    for (const g of walkOnly.filter(g => g.some(([x, z]) => Math.abs(x - cx) < 6 && Math.abs(z - cz) < 6))) for (let i = 0; i < g.length; i++) { const p0 = g[i], q0 = g[(i + 1) % g.length], e = [q0[0] - p0[0], q0[1] - p0[1]]
      if (Math.hypot(...e) < MINLEN || ang(e, u) > TOL || segD(r.at, p0, q0) > 4) continue
      offs.push(p0[0] * nr[0] + p0[1] * nr[1]) }
    const L = { r, nr, offs }; lineCache.set(r, L); return L }
  let cutsJudged = 0, endsJudged = 0
  const badEnds = []
  for (const c of corners) {
    const near = (g) => g.some(([x, z]) => c.recs.some(r => Math.abs(x - r.at[0]) < 6 && Math.abs(z - r.at[1]) < 6))
    // the corner's painted cut, UNITED (a land-use seam splits a cut into pieces whose shared edge is not an end)
    const box = (() => { const xs = c.recs.map(r => r.at[0]), zs = c.recs.map(r => r.at[1]), m = 8
      return [[Math.min(...xs) - m, Math.min(...zs) - m], [Math.max(...xs) + m, Math.min(...zs) - m], [Math.max(...xs) + m, Math.max(...zs) + m], [Math.min(...xs) - m, Math.max(...zs) + m]] })()
    const mine = cuts.filter(near), U = mine.length ? intersectRings(mine, [box]) : [], nCut = U.filter(g => c.recs.some(r => ringD(r.at, g) <= 0.5))
    const segs = []; for (const g of (R.curb || []).filter(near)) for (let i = 0; i < g.length; i++) segs.push([g[i], g[(i + 1) % g.length]])
    const ends = []
    const mid = (U, V) => [(U[0] + V[0]) / 2, (U[1] + V[1]) / 2]
    // a land-use seam's foot is not an end: its leaving edge is drawn back the other way by the neighbouring piece
    const CE = []; for (const g of nCut) for (let i = 0; i < g.length; i++) CE.push([g[i], g[(i + 1) % g.length]])
    const seamC = (p, q) => { const m = mid(p, q), e = [q[0] - p[0], q[1] - p[1]], le = Math.hypot(...e)
      return CE.some(([a, b]) => { const d = [b[0] - a[0], b[1] - a[1]], ld = Math.hypot(...d); if (!(ld > 1e-6) || (e[0] * d[0] + e[1] * d[1]) / (le * ld) > -0.9998) return false
        return segD(m, a, b) < 0.002 }) }
    for (const g of nCut) for (let i = 0; i < g.length; i++) { const P = g[i], a = g[(i - 1 + g.length) % g.length], b = g[(i + 1) % g.length]
      const ca = onCurb(mid(a, P), segs), cb = onCurb(mid(P, b), segs)
      if (onCurb(P, segs) && ca !== cb && !(ca ? seamC(P, b) : seamC(a, P))) ends.push(P) }
    const lines = c.recs.map(linesOf)
    // an end is judged against EVERY perpendicular cut near it (a neighbouring corner's, or another tile's record of this one)
    const around = (P) => recs.filter(r => Math.hypot(r.at[0] - P[0], r.at[1] - P[1]) < 6).map(linesOf)
    const offOf = (L, P) => { const o = P[0] * L.nr[0] + P[1] * L.nr[1]; let best = Infinity, at = null
      for (const v of L.offs) if (Math.abs(v - o) < best) { best = Math.abs(v - o); at = v } return { d: best, at } }
    const tag = `(${c.at[0].toFixed(1)}, ${c.at[1].toFixed(1)})`
    for (const r of c.recs) if (!nCut.some(g => ringD(r.at, g) <= 0.5)) badEnds.push(`${tag}: no painted cut within 0.5 m of its record`)
    if (!nCut.length) continue
    cutsJudged += c.recs.length
    for (const P of ends) { endsJudged++
      const d = Math.min(...around(P).map(L => offOf(L, P).d))
      if (d > ENDTOL) badEnds.push(`${tag}: an end of its cut lies ${d === Infinity ? 'with no walk side line near' : `${d.toFixed(3)} m off its walks' side lines`}`) }
    // SPANS ITS WALK: the walk's two side lines either side of the record (the landing it is) are each REACHED by the painted
    // cut's kerb edge — touched at an end, or crossed where it joins the other walk's cut
    const kerbEdges = []; for (const g of nCut) for (let i = 0; i < g.length; i++) { const a = g[i], b = g[(i + 1) % g.length]
      if (onCurb(mid(a, b), segs)) kerbEdges.push([a, b]) }
    for (const L of lines) { const oAt = L.r.at[0] * L.nr[0] + L.r.at[1] * L.nr[1]
      const lo = Math.max(...L.offs.filter(v => v < oAt)), hi = Math.min(...L.offs.filter(v => v > oAt))
      const reach = (o) => Number.isFinite(o) && kerbEdges.some(([a, b]) => { const oa = a[0] * L.nr[0] + a[1] * L.nr[1], ob = b[0] * L.nr[0] + b[1] * L.nr[1]
        return Math.min(oa, ob) - ENDTOL <= o && o <= Math.max(oa, ob) + ENDTOL })
      const n = [lo, hi].filter(reach).length
      if (n < 2) badEnds.push(`${tag}: a cut reaching ${n} of its walk's two side lines at the kerb — it does not span its walk`) }
  }
  const pairs = corners.filter(c => c.recs.length === 2 && legOf(c.recs[0]) !== legOf(c.recs[1]))   // its two legs' landings
  const oblique = pairs.map(c => 90 - ang(c.recs[0].along, c.recs[1].along)).filter(d => d > 10)
  console.log(`── ${scene}   ${bad.length ? `⛔ RED — ${bad.length} landing side(s) not parallel to their leg` : '✅ every landing side runs on its leg'}`)
  console.log(`   ${corners.length} perpendicular corner(s), ${corners.filter(both).length} with both legs landed (the rest NOT JUDGED) · ${judged} landing(s) with walk in their window · ${sides} side(s) judged (≤ ${TOL}° to a leg)`)
  console.log(`   corners with both landings more than 10° off square: ${oblique.length} of ${pairs.length}${oblique.length ? ` (up to ${Math.max(...oblique).toFixed(0)}° off)` : ''}`)
  for (const b of bad.slice(0, 6)) console.log(`   ✗ ${b}`)
  console.log(`   ${badEnds.length ? `⛔ RED — ${badEnds.length} cut end(s) off their walk's side lines` : '✅ every cut is its walk\'s end'} · ${cutsJudged} cut(s), ${endsJudged} end(s) judged (≤ ${ENDTOL} m to a side line, two lines)`)
  const cls = {}; for (const b of badEnds) { const k = b.replace(/^\([^)]*\): /, '').replace(/[\d.]+ m off/, '… m off'); (cls[k] ||= []).push(b.match(/^\([^)]*\)/)?.[0]) }
  for (const [k, v] of Object.entries(cls)) console.log(`     ${v.length} × ${k} (${new Set(v).size} corner(s)), e.g. ${[...new Set(v)].slice(0, 3).join(' ')}`)
  if (process.env.LIST) for (const b of badEnds.filter(b => !b.includes("no painted cut"))) console.log(`   · ${b}`)
  if (bad.length || badEnds.length) red = true
}
process.exit(red ? 1 : 0)
