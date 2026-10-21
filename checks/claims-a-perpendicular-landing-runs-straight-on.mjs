#!/usr/bin/env node
// CLAIM — A PERPENDICULAR CORNER'S WALK RUNS STRAIGHT ON (`SECTION §6.1`; Jacob, 2026-10-18: "there is no bend at all, only
// straight extension thru"). Each leg's walk is carried past its tangent to the kerb, so where it lands its two SIDES are
// that walk's own lines: PARALLEL TO THE LEG (Boz, 2026-10-18: the extension is literal; at an oblique corner that is not
// square to the crossed street).
// READS the live pour (authoring loaded through the feed) — never a rule: per perpendicular curb cut, its `along` (the way
// the landing's walk runs back into the block, the painter's own record) and the drawn walk (`sidewalk` ∪ `curbCut`).
// ASSERTS, at every corner where BOTH legs landed (one landing leaves the other leg nothing to be parallel to — counted, not
// judged): inside a 4 m window round each landing, every SIDE — an edge ≥ 15 cm of the walk's boundary with exactly one end
// on the kerb it meets (the curb's edge, or the pavement's where the cut runs through the curb) — lies within 2° of one of its corner's legs (the `along` of the corner's
// landings). In the straight-on corner a side is its leg's own line; a side on the arc's normal is not. Window edges are
// not the walk's and are skipped.
// ⭐ AND THE CUT IS THE WALK'S END (`SECTION §6.1`: the walk run on to the kerb "is its landing and its cut"; Jacob, 2026-10-18:
// "they should line up with the sidewalks themselves"). For EVERY perpendicular cut (one landing or two): the painted cut
// piece(s) near its record, and their ENDS — a vertex on the pavement's edge whose one neighbour edge leaves it. Each end lies within
// 2 cm (`ENDTOL`) of a SIDE LINE of the walk — the infinite line through a painted `sidewalk` edge (≥ 15 cm, within 4 m) running
// within 2° of the `along` of a perpendicular cut within 6 m — and each cut's kerb edge reaches both side lines of its own walk (the two
// either side of its record), so it spans the walk. A corner's two cuts may paint as one piece (joined where the walks cross at the kerb), so ends are judged per corner. Read from paint only; the cut's own edges are never a side line.
// ⭐ AND IT GOES THROUGH THE CURB TO THE PAVEMENT (Jacob, 2026-10-18: "cut through and contour the curbs all the way to the
// pavement"). For every cut, across its walk (five lines on its `along`, inside its two side lines): the cut's outermost
// edge on each line lies on the ASPHALT's edge (within 1 cm), not on curb; and no painted curb overlaps a painted cut by
// more than 25 cm² at a corner (`OVTOL`: the two are cut from one band, so their shared edge rounds by a millimetre; a curb
// left standing in front of a cut is ~2000 cm²). The cut's ENDS are read on the asphalt's edge, where it meets the road.
// ⭐ AND THE CUT IS A SIMPLE SHAPE (Jacob, 2026-10-18: "the ramps need to be extensions of the sidewalks"; "a geometrically
// simple shape"). A perpendicular cut's BACK is square to its walk, `warningDepth` back from where its side line that reaches
// the road FIRST meets it (Boz, 2026-10-18: full width at the kerb): on its two side lines the painted cut runs back from the
// pavement's edge, the shorter run that far (−1 / +3 cm: read 2 cm inside the line; at least that far on a united pad). A diagonal cut is a band of constant depth from the
// pavement's edge: no point deeper than `warningDepth` (1 cm), its inner edge at that depth. No two of a corner's cut
// pieces stand apart by a hairline (under 1 cm). TWO RAMPS ON ONE ARC (Boz's ruling, 2026-10-18): drawn as two pieces only
// where lawn or land use reaches the curb along that arc between them; else they are one pad.
// ⭐ AND EVERY WALK THAT REACHES THE KERB GETS ITS RAMP (`f-prowag-curb-ramp-per-crosswalk`, R203.6.1.1: "one curb ramp or
// blended transition shall be provided for each crosswalk"; Jacob, 2026-10-18: "both sidewalks get full ramps"). Along each
// perpendicular corner that drew fewer ramps than it has walks (the painter's own count, `walks` / `ramps`), no painted walk
// meets the curb bare along its arc (`arcPts`, tangent to tangent; 5 cm kept clear of each tangent): there, a walk reaches the
// kerb with no ramp. (Bare walk beside the curb at a corner whose every walk has its ramp is the curb between two ramps.)
// PRINTS: per town, landings and sides judged, cuts and ends judged, and the perpendicular corners whose legs meet more than
// 10° off square — the case where "parallel to the leg" and "square across the street" part (the crosswalk's ruling meets it).
//   [LIST=1] node checks/claims-a-perpendicular-landing-runs-straight-on.mjs [scene…] [--painter=<tileGround copy>] [--live-norm]
//   (LIST: every red · --live-norm: the norm the pour would freeze now, for a town whose pour predates it)
// SEEN RED on plan (2) (c825e04e: radial landings, sides on the arc's normals). MUTATION: give `legExt` a direction rotated
// off the edge's own — red. The ends row: SEEN RED on a89e3c36 (a norm-width piece centred on a re-solved contact);
// MUTATION: shift each cut 0.3 m along its kerb — red. The shape rows: SEEN RED on ee9c19c7 and on the uncommitted
// along-the-walk and road-edge-band builds; MUTATION: the pad rule off (two ramps never united) — red. The through-curb rows: SEEN RED on 38d03e41 (the cut stopped at the
// curb's inner edge); MUTATIONS: stop the cut at the curb's inner edge — red; leave the curb painted under it — red.
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { feed } from '../scratch/_proto-feed.mjs'
import { ribbonScenes } from './_scenes.mjs'
import { intersectRings } from '../src/lib/buildBlockGeometryV2.js'
const painter = process.argv.find(a => a.startsWith('--painter='))?.slice(10)
const { buildTileGround } = await import(painter ? pathToFileURL(resolve(painter)).href : '../src/lib/tileGround.js')
const named = process.argv.slice(2).filter(a => !a.startsWith('--')), liveNorm = process.argv.includes('--live-norm')
const { resolveCurbCutNorm } = await import('../cartograph/curb-cut-norm.mjs'), { readSources } = await import('../cartograph/sources.js')
const TOL = 2, MINLEN = 0.15, H = 2.0, ENDTOL = 0.02, SEP = 0.1, OVTOL = 25e-4
const ang = (u, v) => { const c = Math.abs(u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1); return Math.acos(Math.min(1, c)) * 180 / Math.PI }
let red = false
for (const scene of named.length ? named : ribbonScenes()) {
  const f = feed(scene); if (!f) { red = true; continue }
  // --live-norm: the norm the pour would freeze NOW (`curb-cut-norm.mjs`, the way derive.js resolves it), for a town whose
  // frozen pour predates it — never a rule of this check's own
  if (liveNorm) { const src = readSources(scene); f.ribbons = { ...f.ribbons, curbCutNorm: resolveCurbCutNorm(scene, src.declared ? src.state : null) } }
  const pl = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
  let R; try { R = buildTileGround(f.ribbons, { smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth,
    blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides,
    cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1 }) } finally { console.log = pl; console.warn = pw }
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
      // the kerb the walk meets: the curb's edge, or the pavement's where the cut carries the walk through the curb
      const segs = []; for (const g of [...curb, ...(R.asphalt || [])].filter(close)) for (let i = 0; i < g.length; i++) segs.push([g[i], g[(i + 1) % g.length]])
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
  const area = (rs) => rs.reduce((t, r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return t + Math.abs(a) / 2 }, 0)
  const unit = (v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l] }
  // each cut's own side lines, as offsets across its `along`
  const lineCache = new Map(), linesOf = (r) => { if (lineCache.has(r)) return lineCache.get(r)
    const u = unit(r.along), nr = [-u[1], u[0]], offs = [], [cx, cz] = r.at
    for (const g of walkOnly.filter(g => g.some(([x, z]) => Math.abs(x - cx) < 6 && Math.abs(z - cz) < 6))) for (let i = 0; i < g.length; i++) { const p0 = g[i], q0 = g[(i + 1) % g.length], e = [q0[0] - p0[0], q0[1] - p0[1]]
      if (Math.hypot(...e) < MINLEN || ang(e, u) > TOL || segD(r.at, p0, q0) > 4) continue
      offs.push(p0[0] * nr[0] + p0[1] * nr[1]) }
    const L = { r, nr, offs }; lineCache.set(r, L); return L }
  let cutsJudged = 0, endsJudged = 0, ovMax = 0, backMax = 0
  const badEnds = []
  for (const c of corners) {
    const near = (g) => g.some(([x, z]) => c.recs.some(r => Math.abs(x - r.at[0]) < 6 && Math.abs(z - r.at[1]) < 6))
    // the corner's painted cut, UNITED (a land-use seam splits a cut into pieces whose shared edge is not an end)
    const box = (() => { const xs = c.recs.map(r => r.at[0]), zs = c.recs.map(r => r.at[1]), m = 8
      return [[Math.min(...xs) - m, Math.min(...zs) - m], [Math.max(...xs) + m, Math.min(...zs) - m], [Math.max(...xs) + m, Math.max(...zs) + m], [Math.min(...xs) - m, Math.max(...zs) + m]] })()
    const mine = cuts.filter(near), U = mine.length ? intersectRings(mine, [box]) : [], nCut = U.filter(g => c.recs.some(r => ringD(r.at, g) <= 0.5))
    // the cut's ENDS are where it leaves the pavement: it runs through the curb, so its edge on the road is the asphalt's
    const segs = []; for (const g of (R.asphalt || []).filter(near)) for (let i = 0; i < g.length; i++) segs.push([g[i], g[(i + 1) % g.length]])
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
    // A SIMPLE SHAPE. Diagonal: no point deeper than the warning depth from the pavement's edge, its inner edge at it.
    // Perpendicular: on the walk's centre line, the cut runs back the warning depth from the pavement's edge (checked below,
    // with the side lines). Every style: no hairline between a corner's pieces.
    const WD = f.ribbons.curbCutNorm?.warningDepth
    const aS = []; for (const g of (R.asphalt || []).filter(near)) for (let i = 0; i < g.length; i++) aS.push([g[i], g[(i + 1) % g.length]])
    if (WD > 0 && nCut.length && c.recs.every(r => r.style === 'diagonal')) {
      let deep = 0, atDepth = 0
      for (const g of nCut) for (const P of g) { const dd = Math.min(...aS.map(([u, v]) => segD(P, u, v))); deep = Math.max(deep, dd); if (Math.abs(dd - WD) < 0.01) atDepth++ }
      if (deep > WD + 0.01) badEnds.push(`${tag}: its diagonal cut reaches ${deep.toFixed(2)} m from the pavement's edge, deeper than the warning depth ${WD} m`)
      else if (!atDepth) badEnds.push(`${tag}: no part of its diagonal cut reaches the warning depth ${WD} m from the pavement's edge`)
    }
    { const raw = mine.filter(g => c.recs.some(r => ringD(r.at, g) <= 1))
      for (let i = 0; i < raw.length; i++) for (let j = i + 1; j < raw.length; j++) { let m = Infinity
        for (const P of raw[i]) m = Math.min(m, ringD(P, raw[j])); for (const P of raw[j]) m = Math.min(m, ringD(P, raw[i]))
        if (m > 1e-3 && m < 0.01) badEnds.push(`${tag}: two pieces of its cut stand ${(m * 1000).toFixed(0)} mm apart — touching ramps are one cut`) } }
    // TWO RAMPS ON ONE ARC: two pieces only where lawn or land use reaches the curb between them
    const cc = (R.curbCutCorners || []).find(k => k.si === c.si && k.arc === c.arc && k.arcPts && Math.hypot(k.at[0] - c.at[0], k.at[1] - c.at[1]) < 20)
    if (c.recs.length === 2 && cc) {
      const pieceOf = (r) => nCut.findIndex(g => ringD(r.at, g) <= 0.5)
      if (pieceOf(c.recs[0]) >= 0 && pieceOf(c.recs[1]) >= 0 && pieceOf(c.recs[0]) !== pieceOf(c.recs[1])) {   // (a record with no paint is its own row)
        // the stretch of the arc BETWEEN the two pieces: each piece's span along the arc (its points within 0.6 m of it)
        const A = cc.arcPts, cum = [0]; for (let k = 1; k < A.length; k++) cum.push(cum[k - 1] + Math.hypot(A[k][0] - A[k - 1][0], A[k][1] - A[k - 1][1]))
        const onArc = (m) => { let best = { d: Infinity, s: 0 }; for (let k = 1; k < A.length; k++) { const a = A[k - 1], b = A[k], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
          const t = L2 ? Math.max(0, Math.min(1, ((m[0] - a[0]) * dx + (m[1] - a[1]) * dz) / L2)) : 0, d = Math.hypot(m[0] - a[0] - t * dx, m[1] - a[1] - t * dz)
          if (d < best.d) best = { d, s: cum[k - 1] + t * Math.sqrt(L2) } } return best }
        const span = (g) => { const ss = g.map(onArc).filter(o => o.d < 0.6).map(o => o.s); return ss.length ? [Math.min(...ss), Math.max(...ss)] : null }
        const s1 = span(nCut[pieceOf(c.recs[0])]), s2 = span(nCut[pieceOf(c.recs[1])])
        const gap = s1 && s2 ? (s1[1] < s2[0] ? [s1[1], s2[0]] : s2[1] < s1[0] ? [s2[1], s1[0]] : null) : null
        const cS = []; for (const g of (R.curb || []).filter(near)) for (let i = 0; i < g.length; i++) cS.push([g[i], g[(i + 1) % g.length]])
        const green = [...Object.values(R.treelawnByLu || {}).flat(), ...Object.values(R.luByClass || {}).flat()].filter(near)
        let touch = gap ? 0 : 1      // pieces overlapping along the arc without uniting are a hairline, judged above
        if (gap) for (const g of green) for (let i = 0; i < g.length; i++) { const a = g[i], b = g[(i + 1) % g.length], m = mid(a, b), o = onArc(m)
          if (o.d < 0.6 && o.s > gap[0] && o.s < gap[1] && cS.some(([u, v]) => segD(m, u, v) < 0.005)) touch += Math.hypot(b[0] - a[0], b[1] - a[1]) }
        if (touch < 0.01) badEnds.push(`${tag}: two ramps on one arc drawn apart with only walk or curb between them — they are one pad`)
      }
    }
    // THROUGH THE CURB: on five lines across the walk, the cut's outermost crossing (toward the road) lies on the asphalt
    const asph = (R.asphalt || []).filter(near), curbs = (R.curb || []).filter(near)
    const ov = curbs.length && nCut.length ? area(intersectRings(curbs, nCut)) : 0
    ovMax = Math.max(ovMax, ov)
    if (ov > OVTOL) badEnds.push(`${tag}: ${(ov * 1e4).toFixed(0)} cm² of curb painted inside its cut`)
    for (const L of lines) { const oAt = L.r.at[0] * L.nr[0] + L.r.at[1] * L.nr[1]
      const lo = Math.max(...L.offs.filter(v => v < oAt)), hi = Math.min(...L.offs.filter(v => v > oAt))
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue
      // the perpendicular cut's BACK: square to the walk, the warning depth back from where the side line that reaches the
      // road FIRST meets it — so on each of its two side lines (2 cm inside, from its face ends) the cut runs back from the
      // pavement's edge, and the SHORTER of the two runs is the warning depth (1 cm; at least that on a united pad)
      if (WD > 0 && L.r.style !== 'diagonal' && L.r.face) {
        const ua = unit(L.r.along), [FA, FB] = L.r.face, lf = Math.hypot(FB[0] - FA[0], FB[1] - FA[1]) || 1, fu = [(FB[0] - FA[0]) / lf, (FB[1] - FA[1]) / lf]
        const runOn = (O) => { const oc = O[0] * L.nr[0] + O[1] * L.nr[1], ts = []
          for (const g of nCut) for (let i = 0; i < g.length; i++) { const a = g[i], b = g[(i + 1) % g.length]
            const oa = a[0] * L.nr[0] + a[1] * L.nr[1] - oc, ob = b[0] * L.nr[0] + b[1] * L.nr[1] - oc
            if ((oa > 0) === (ob > 0) || oa === ob) continue
            const t0 = oa / (oa - ob), X = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], t = (X[0] - O[0]) * ua[0] + (X[1] - O[1]) * ua[1]
            if (t > -0.5 && t < 4) ts.push(t) }                          // from its own face on, never a cut across the street
          ts.sort((p2, q2) => p2 - q2); return ts.length >= 2 ? ts[1] - ts[0] : null }   // the first interval from the pavement end
        const r1 = runOn([FA[0] + fu[0] * 0.02, FA[1] + fu[1] * 0.02]), r2 = runOn([FB[0] - fu[0] * 0.02, FB[1] - fu[1] * 0.02])
        const own = (R.curbCutCorners || []).filter(k => k.si === L.r.si && k.arc === L.r.arc && k.arcPts).sort((p2, q2) => Math.hypot(p2.at[0] - L.r.at[0], p2.at[1] - L.r.at[1]) - Math.hypot(q2.at[0] - L.r.at[0], q2.at[1] - L.r.at[1]))[0]
        if (r1 != null && r2 != null) { const run = Math.min(r1, r2), pad = own?.pad === 'one'
          backMax = Math.max(backMax, Math.abs(run - WD) * (pad ? 0 : 1))
          // 3 cm over: the run is read 2 cm inside the side line, which on a slanted landing meets the road a little later
          if (run < WD - 0.01 || (!pad && run > WD + 0.03)) badEnds.push(`${tag}: its ramp's shorter side runs ${run.toFixed(2)} m back from the pavement, not the warning depth ${WD} m`) }
      }
      const u = [L.nr[1], -L.nr[0]], ua = unit(L.r.along), sg = Math.sign(u[0] * ua[0] + u[1] * ua[1]) || 1, au = [u[0] * sg, u[1] * sg]
      let short = 0
      for (let k = 1; k <= 5; k++) { const o = lo + (hi - lo) * k / 6, base = L.r.at, q0 = base[0] * L.nr[0] + base[1] * L.nr[1]
        const O = [base[0] + L.nr[0] * (o - q0), base[1] + L.nr[1] * (o - q0)]             // a point on the line, by the record
        let tMin = Infinity                                                                  // most road-ward crossing (t along `along`)
        for (const g of nCut) for (let i = 0; i < g.length; i++) { const a = g[i], b = g[(i + 1) % g.length]
          const oa = a[0] * L.nr[0] + a[1] * L.nr[1] - o, ob = b[0] * L.nr[0] + b[1] * L.nr[1] - o
          if ((oa > 0) === (ob > 0) || oa === ob) continue
          const t0 = oa / (oa - ob), X = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], t = (X[0] - O[0]) * au[0] + (X[1] - O[1]) * au[1]
          if (Math.abs(t) < 3 && t < tMin) tMin = t }
        if (tMin === Infinity) { short++; continue }
        const X = [O[0] + au[0] * tMin, O[1] + au[1] * tMin]
        if (!asph.some(g => ringD(X, g) < 0.01)) short++ }
      if (short) badEnds.push(`${tag}: a cut whose edge misses the pavement on ${short} of 5 lines across its walk — the curb stands in front of it`) }
    for (const L of lines) { const oAt = L.r.at[0] * L.nr[0] + L.r.at[1] * L.nr[1]
      const lo = Math.max(...L.offs.filter(v => v < oAt)), hi = Math.min(...L.offs.filter(v => v > oAt))
      const reach = (o) => Number.isFinite(o) && kerbEdges.some(([a, b]) => { const oa = a[0] * L.nr[0] + a[1] * L.nr[1], ob = b[0] * L.nr[0] + b[1] * L.nr[1]
        return Math.min(oa, ob) - ENDTOL <= o && o <= Math.max(oa, ob) + ENDTOL })
      const n = [lo, hi].filter(reach).length
      if (n < 2) badEnds.push(`${tag}: a cut reaching ${n} of its walk's two side lines at the kerb — it does not span its walk`) }
  }
  // ── every walk reaching the kerb is ramped: no bare walk on the curb along a perpendicular corner's arc ──────────────
  const bare = []
  for (const c of (R.curbCutCorners || []).filter(c => c.wedge && c.arcPts?.length > 1 && (c.walks || 0) > (c.ramps || 0))) {
    const A = c.arcPts, near = (g) => g.some(([x, z]) => Math.abs(x - c.at[0]) < 8 && Math.abs(z - c.at[1]) < 8)
    const cum = [0]; for (let i = 1; i < A.length; i++) cum.push(cum[i - 1] + Math.hypot(A[i][0] - A[i - 1][0], A[i][1] - A[i - 1][1]))
    const onArc = (m) => { let best = { d: Infinity, s: 0 }; for (let i = 1; i < A.length; i++) { const a = A[i - 1], b = A[i], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
      const t = L2 ? Math.max(0, Math.min(1, ((m[0] - a[0]) * dx + (m[1] - a[1]) * dz) / L2)) : 0, d = Math.hypot(m[0] - a[0] - t * dx, m[1] - a[1] - t * dz)
      if (d < best.d) best = { d, s: cum[i - 1] + t * Math.sqrt(L2) } } return best }
    const cS = []; for (const g of (R.curb || []).filter(near)) for (let i = 0; i < g.length; i++) cS.push([g[i], g[(i + 1) % g.length]])
    const kS = []; for (const g of (R.curbCut || []).filter(near)) for (let i = 0; i < g.length; i++) kS.push([g[i], g[(i + 1) % g.length]])
    let m2 = 0
    for (const g of (R.sidewalk || []).filter(near)) for (let i = 0; i < g.length; i++) { const a = g[i], b = g[(i + 1) % g.length]
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.02) continue
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], o = onArc(m)
      if (o.d > 0.6 || o.s < 0.05 || o.s > cum[cum.length - 1] - 0.05) continue
      if (cS.some(([u, v]) => segD(m, u, v) < 0.005) && !kS.some(([u, v]) => segD(m, u, v) < 0.005)) m2 += Math.hypot(b[0] - a[0], b[1] - a[1]) }
    if (m2 > 0.05) bare.push(`(${c.at[0].toFixed(1)}, ${c.at[1].toFixed(1)}): ${m2.toFixed(2)} m of walk meets the curb bare along the arc — a walk reaching the kerb with no ramp`)
  }
  console.log(`   ${bare.length ? `⛔ RED — ${bare.length} perpendicular corner(s) where a walk reaches the kerb with no ramp` : '✅ every walk reaching the kerb at a perpendicular corner is ramped'}`)
  for (const b of process.env.LIST ? bare : bare.slice(0, 6)) console.log(`   ✗ ${b}`)
  if (bare.length) red = true
  const pairs = corners.filter(c => c.recs.length === 2 && legOf(c.recs[0]) !== legOf(c.recs[1]))   // its two legs' landings
  const oblique = pairs.map(c => 90 - ang(c.recs[0].along, c.recs[1].along)).filter(d => d > 10)
  console.log(`── ${scene}   ${bad.length ? `⛔ RED — ${bad.length} landing side(s) not parallel to their leg` : '✅ every landing side runs on its leg'}`)
  console.log(`   ${corners.length} perpendicular corner(s), ${corners.filter(both).length} with both legs landed (the rest NOT JUDGED) · ${judged} landing(s) with walk in their window · ${sides} side(s) judged (≤ ${TOL}° to a leg)`)
  console.log(`   corners with both landings more than 10° off square: ${oblique.length} of ${pairs.length}${oblique.length ? ` (up to ${Math.max(...oblique).toFixed(0)}° off)` : ''}`)
  for (const b of process.env.LIST ? bad : bad.slice(0, 6)) console.log(`   ✗ ${b}`)
  console.log(`   ${badEnds.length ? `⛔ RED — ${badEnds.length} cut end(s) off their walk's side lines` : '✅ every cut is its walk\'s end'} · ${cutsJudged} cut(s), ${endsJudged} end(s) judged (≤ ${ENDTOL} m to a side line, two lines) · curb inside a cut at most ${(ovMax * 1e4).toFixed(0)} cm² (≤ ${(OVTOL * 1e4).toFixed(0)}) · a single ramp's back at most ${(backMax * 100).toFixed(1)} cm off the warning depth`)
  const cls = {}; for (const b of badEnds) { const k = b.replace(/^\([^)]*\): /, '').replace(/[\d.]+ m off/, '… m off'); (cls[k] ||= []).push(b.match(/^\([^)]*\)/)?.[0]) }
  for (const [k, v] of Object.entries(cls)) console.log(`     ${v.length} × ${k} (${new Set(v).size} corner(s)), e.g. ${[...new Set(v)].slice(0, 3).join(' ')}`)
  if (process.env.LIST) for (const b of badEnds.filter(b => !b.includes("no painted cut"))) console.log(`   · ${b}`)
  if (bad.length || badEnds.length) red = true
}
process.exit(red ? 1 : 0)
