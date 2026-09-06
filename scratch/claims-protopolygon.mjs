#!/usr/bin/env node
/**
 * THE PROTOPOLYGON — Jacob's construction, built for the first time. READ-ONLY.
 *
 *   "A protopolygon. The humunculus. It is not a real width; let's say it's .00001
 *    symmetrical between nodes... This is equivalent to taking a pattern of line segments
 *    in illustrator, and selecting them all and 'Expand appearance' and then 'Pathfinder'
 *    > JOIN to make it all one shape."
 *   "The circle... ALSO forms the outer edge of the united polygon."
 *
 * ⛔ NOTHING IS ROUNDED (ruled 2026-09-05). Each SEGMENT becomes its own rectangle and the
 * union does the joining — so there is no join style to choose and no miter limit to clamp.
 * The circle is a line segment like any street and joins the SAME unite.
 *
 * Blocks are the HOLES of the result. A block at the rim is bounded by the circle, which is
 * an EDGE OF THE DRAWING — so it closes, and nothing is cut, so nothing needs a cap.
 *
 *   node scratch/claims-protopolygon.mjs [scene ...] [--eps 0.05] [--keep-grade-separated]
 */
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { Clipper, ClipType, PolyType, PolyFillType, PolyTree } = clipperLib
const args = process.argv.slice(2)
const EPS = args.includes('--eps') ? Number(args[args.indexOf('--eps') + 1]) : 0.05
const KEEP_GS = args.includes('--keep-grade-separated')
const NO_CIRCLE = args.includes('--no-circle')
const SVG = args.includes('--svg')
// ⭐ --from-skeleton: build from clean/skeleton.json, which is UPSTREAM of the clip and still
// holds every chain (LS: 217 vs ribbons' 209). Lets the protopolygon be seen un-chopped with
// NO re-pour. Points there are {x,z} objects, not [x,z] arrays.
const FROM_SKEL = args.includes('--from-skeleton')
const SCENES = args.filter(a => !a.startsWith('--') && !/^[\d.]+$/.test(a))
const scenes = SCENES.length ? SCENES : ['lafayette-square', 'hipointe-demun']
const SCALE = 1000                          // Clipper integer space: 1 mm floor
const toC = p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
const areaC = r => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i].X * r[j].Y - r[j].X * r[i].Y } return a / 2 / (SCALE * SCALE) }
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : NaN }
const o = console.log

if (!(EPS * SCALE >= 2)) { o(`⛔ eps ${EPS} m is at or under the ${1 / SCALE} m integer floor — it would round back to an ABSENCE. Refusing.`); process.exit(1) }
o(`THE PROTOPOLYGON — segments expanded at ε=${EPS} m, united, holes read off it. NOTHING rounded.\n`)

for (const scene of scenes) {
  const RIB = FROM_SKEL ? `cartograph/data/${scene}/clean/skeleton.json`
            : scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
  const NB = `cartograph/data/${scene}/neighborhood_boundary.json`
  if (!fs.existsSync(RIB) || !fs.existsSync(NB)) { o(`${scene}: missing artifact — SKIPPED LOUDLY (${RIB} / ${NB})\n`); continue }
  const rb = JSON.parse(fs.readFileSync(RIB, 'utf8'))
  const nb = JSON.parse(fs.readFileSync(NB, 'utf8'))
  const cx = nb.center?.[0] ?? 0, cz = nb.center?.[1] ?? 0, R = nb.radius
  if (!Number.isFinite(R)) { o(`${scene}: boundary carries no radius — the circle cannot join the unite. SKIPPED LOUDLY.\n`); continue }

  // ⛔ ORIENTATION MUST BE UNIFORM throughout: non-zero fill CANCELS where an opposite-wound
  // polygon overlaps, so a mixed-winding pile unions into confetti instead of one object.
  const parts = []
  // ⛔⛔ ONE POLYGON PER CHAIN — never one per SEGMENT. Per-segment rectangles overlap by
  // ε·tan(θ/2) at each vertex, and on a DENSE polyline θ is small enough that the overlap
  // falls under Clipper's 1 mm integer grid: the ink rounds into a DOTTED line and the object
  // shatters. Measured on LS: from skeleton (81 m segments) 2 solid rings / 0 islands; from
  // ribbons (11.7 m segments) 82 solid rings / 968 islands — same code, denser input.
  // ⭐ So the construction must not be sensitive to vertex density. Expanding the PATH is what
  // Illustrator's "expand appearance" does, and it has no such term: walk the chain once,
  // offset every vertex by ε along the AVERAGED normal, and close left-forward against
  // right-backward. No join style, no cap, nothing rounded — and no per-vertex overlap to lose.
  const XZ = (p) => Array.isArray(p) ? p : [p.x, p.z]
  let chains = 0, gsSkipped = 0
  for (const s of rb.streets || []) {
    if (!(s.points?.length >= 2)) continue
    if (s.gradeSeparated && !KEEP_GS) { gsSkipped++; continue }
    const P = s.points.map(XZ)
    const nrm = []
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)]
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz)
      if (!(L > 1e-9)) { nrm.push(nrm[nrm.length - 1] || [0, 0]); continue }
      nrm.push([-dz / L * EPS, dx / L * EPS])
    }
    const L = P.map((p, i) => [p[0] + nrm[i][0], p[1] + nrm[i][1]])
    const Rt = P.map((p, i) => [p[0] - nrm[i][0], p[1] - nrm[i][1]])
    const poly = [...L, ...Rt.reverse()].map(toC)
    if (poly.length < 3) continue
    if (Clipper.Orientation(poly) !== true) poly.reverse()
    parts.push(poly)
    chains++
  }

  // ── THE CIRCLE JOINS THE SAME UNITE — but expand the closed PATH, never chord-by-chord.
  // ⛔⛔ MEASURED 2026-09-05: chord rectangles at r=892 with 1 m chords turn 0.064°, so two
  // consecutive ones overlap by ~0.03 mm — UNDER Clipper's 1 mm integer grid. They round to a
  // DOTTED circle, the disc leaks through the gaps, and no rim block can close. Disc coverage
  // was 80.7%; expanding the path instead took it to 99.8% and dropped solid rings 168 → 2.
  // That is RIBBONS §1's "ε must exceed the integer floor" applied to CHORD DENSITY, not to ε.
  const N = 2048
  if (!NO_CIRCLE) {
    const outer = [], inner = []
    for (let i = 0; i < N; i++) { const t = 2 * Math.PI * i / N
      outer.push(toC([cx + (R + EPS) * Math.cos(t), cz + (R + EPS) * Math.sin(t)]))
      inner.push(toC([cx + (R - EPS) * Math.cos(t), cz + (R - EPS) * Math.sin(t)])) }
    if (Clipper.Orientation(outer) !== true) outer.reverse()
    if (Clipper.Orientation(inner) !== false) inner.reverse()   // negative ⇒ non-zero cancels the middle
    parts.push(outer, inner)
  }

  const cu = new Clipper(); cu.StrictlySimple = true
  for (const p of parts) cu.AddPath(p, PolyType.ptSubject, true)
  const tree = new PolyTree()
  cu.Execute(ClipType.ctUnion, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)

  // ── walk the tree: depth 0 = the object, depth 1 = its HOLES (the blocks)
  const outers = [], holes = []
  const walk = (n) => { for (const c of n.Childs()) { (c.IsHole() ? holes : outers).push(c.Contour()); walk(c) } }
  walk(tree)
  const hAreas = holes.map(h => Math.abs(areaC(h))).filter(a => a > 1.0)
  // a hole is a RIM block if any vertex sits on the circle
  const nearR = (p) => Math.abs(Math.hypot(p.X / SCALE - cx, p.Y / SCALE - cz) - R) < 2 * EPS + 1.5
  const big = holes.filter(h => Math.abs(areaC(h)) > 1.0)
  const rim = big.filter(h => h.some(nearR)).length
  const outside = big.filter(h => Math.hypot(h[0].X / SCALE - cx, h[0].Y / SCALE - cz) > R + 5).length

  // ⭐ Report the object HONESTLY: one real outer + sub-1 m² islands, which are noise,
  // not 200 separate objects. Counting raw outer rings reads as "the union failed" and
  // it has not — the network merges into ONE closed shape.
  const oAreas = outers.map(r => Math.abs(areaC(r))).sort((a, b) => b - a)
  const islands = oAreas.filter(v => v < 1).length
  const realOuters = oAreas.filter(v => v >= 1).length
  o(`${scene}`)
  o(`   chains ${chains}${gsSkipped ? `   (⛔ ${gsSkipped} gradeSeparated held out — pass --keep-grade-separated to include)` : ''}${NO_CIRCLE ? '   ⛔ --no-circle' : `   circle r=${R} @ ${N} chords`}`)
  o(`   ⭐ ONE CLOSED OBJECT: largest outer ${oAreas[0].toFixed(0)} m²   (${realOuters} outer ring(s) ≥1 m², ${islands} sub-1 m² islands = noise)`)
  o(`   ⭐ HOLES (= blocks) ${hAreas.length}`)
  o(`      area  min ${q(hAreas, 0).toFixed(0)}  p50 ${q(hAreas, .5).toFixed(0)}  p90 ${q(hAreas, .9).toFixed(0)}  max ${q(hAreas, 1).toFixed(0)} m²`)
  o(`      ⭐ holes TOUCHING the circle (rim blocks, closed against the edge of the drawing): ${rim}`)
  o(`      holes lying OUTSIDE the circle (the bb beyond the disc — built, not shown): ${outside}`)
  // ⭐ A hole may sit inside the disc, or outside it, but it must NEVER SPAN it: the circle is
  // ink, and ink separates. A hole with vertices on both sides means the seal LEAKS there.
  const dR = p => Math.hypot(p.X / SCALE - cx, p.Y / SCALE - cz) - R
  const cross = big.filter(h => h.some(p => dR(p) < -0.5) && h.some(p => dR(p) > 0.5))
  if (cross.length) {
    o(`      ⛔⛔ HOLES SPANNING THE CIRCLE (the seal LEAKS — ink must separate): ${cross.length}`)
    for (const h of cross.slice(0, 6)) {
      const ds = h.map(dR), a = Math.abs(areaC(h))
      let cxx = 0, czz = 0; for (const p of h) { cxx += p.X / SCALE; czz += p.Y / SCALE }
      o(`         area ${a.toFixed(0)} m²  spans ${Math.min(...ds).toFixed(1)} → ${Math.max(...ds).toFixed(1)} m across the rim  near (${(cxx/h.length).toFixed(0)}, ${(czz/h.length).toFixed(0)})`)
    }
  } else o(`      ✅ no hole spans the circle — the seal holds all the way round`)
  // ── ⭐ LOOK AT IT. Read-only: an SVG beside the check, no src/ touched, no server.
  // The BLOCKS are the holes — filled. The ink (streets + circle) is what is left dark.
  // A rim block that CLOSES against the circle is the whole point: it is filled all the
  // way to the arc, with no cut and therefore no cap.
  if (SVG) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const h of big) for (const p of h) { const X = p.X / SCALE, Y = p.Y / SCALE
      if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y }
    const pad = 40; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad
    const path = (r) => 'M' + r.map(p => `${(p.X / SCALE).toFixed(2)},${(p.Y / SCALE).toFixed(2)}`).join('L') + 'Z'
    const parts2 = []
    parts2.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#23241f"/>`)
    // ⭐ THREE CLASSES, because "build the whole bb, only SHOW the stamped circle" is the model
    // and a drawing that paints all three alike hides it:
    //   inside the disc            → the map
    //   touching the circle (rim)  → closed against the edge of the drawing
    //   outside the disc           → BUILT, NOT SHOWN (ghosted)
    const cen = (h) => { let X = 0, Y = 0; for (const p of h) { X += p.X; Y += p.Y } return [X / h.length / SCALE, Y / h.length / SCALE] }
    for (const h of big) {
      const c = cen(h)
      const outsideDisc = Math.hypot(c[0] - cx, c[1] - cz) > R
      const isRim = h.some(nearR)
      const fill = outsideDisc ? '#3a3d34' : isRim ? '#6aa83a' : '#a8cf7a'
      const stroke = outsideDisc ? '#4d5145' : '#efe9dc'
      parts2.push(`<path d="${path(h)}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`)
    }
    if (!NO_CIRCLE) parts2.push(`<circle cx="${cx}" cy="${cz}" r="${R}" fill="none" stroke="#3b6ef5" stroke-width="2" opacity="0.9"/>`)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" width="1400">\n${parts2.join('\n')}\n</svg>\n`
    const out = `scratch/protopolygon-${scene}${FROM_SKEL ? '-skeleton' : ''}${NO_CIRCLE ? '-nocircle' : ''}.svg`
    fs.writeFileSync(out, svg)
    o(`   ▶ WROTE ${out}  — dark = the ink (streets + circle); filled = the blocks; DARKER GREEN = a block closing on the circle`)
  }
  const shp = `public/baked/${scene}/shape.json`
  if (fs.existsSync(shp)) o(`   for scale: frozen shape.json tiles = ${JSON.parse(fs.readFileSync(shp, 'utf8')).tiles.length}`)
  o('')
}
