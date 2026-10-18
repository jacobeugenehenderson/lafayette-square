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
// PRINTS: per town, landings and sides judged, and the perpendicular corners whose legs meet more than 10° off square — the
// case where "parallel to the leg" and "square across the street" part (the crosswalk's ruling meets it there).
//   node checks/claims-a-perpendicular-landing-runs-straight-on.mjs [scene…] [--painter=<tileGround copy>]
// SEEN RED on plan (2) (c825e04e: radial landings, sides on the arc's normals). MUTATION: give `legExt` a direction rotated
// off the edge's own — red.
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { feed } from '../scratch/_proto-feed.mjs'
import { ribbonScenes } from './_scenes.mjs'
import { intersectRings } from '../src/lib/buildBlockGeometryV2.js'
const painter = process.argv.find(a => a.startsWith('--painter='))?.slice(10)
const { buildTileGround } = await import(painter ? pathToFileURL(resolve(painter)).href : '../src/lib/tileGround.js')
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const TOL = 2, MINLEN = 0.15, H = 2.0
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
  const pairs = corners.filter(c => c.recs.length === 2 && legOf(c.recs[0]) !== legOf(c.recs[1]))   // its two legs' landings
  const oblique = pairs.map(c => 90 - ang(c.recs[0].along, c.recs[1].along)).filter(d => d > 10)
  console.log(`── ${scene}   ${bad.length ? `⛔ RED — ${bad.length} landing side(s) not parallel to their leg` : '✅ every landing side runs on its leg'}`)
  console.log(`   ${corners.length} perpendicular corner(s), ${corners.filter(both).length} with both legs landed (the rest NOT JUDGED) · ${judged} landing(s) with walk in their window · ${sides} side(s) judged (≤ ${TOL}° to a leg)`)
  console.log(`   corners with both landings more than 10° off square: ${oblique.length} of ${pairs.length}${oblique.length ? ` (up to ${Math.max(...oblique).toFixed(0)}° off)` : ''}`)
  for (const b of bad.slice(0, 6)) console.log(`   ✗ ${b}`)
  if (bad.length) red = true
}
process.exit(red ? 1 : 0)
