#!/usr/bin/env node
// claims-the-ink-is-held-by-its-owners.mjs — ① (THE 2ε STRIP BETWEEN TILES) IS COVERED BY OWNED PIECES, AND EACH NAMES WHO IT IS.
//
// No tile holds the ink, so the ground can give it a line only through its pieces (`inkPiecesByOwner`, tileGround.js; shape.json
// `ink`; BRIEF-the-ground-knows-its-height §5: "a street's ① takes that street's road surface"). Three claims, read off the
// producer's own ink (`proto` rings + `protoLabels` → `protoOwners`), built through the one feed with the town's authoring loaded:
//   1. COVER — the pieces united are the ink: no ink outside every piece, no piece outside the ink;
//   2. PARTITION — the pieces do not overlap, and every piece names at least one owner;
//   3. OWNERS — the piece under each ink edge's own stroke (a point ε inside the strip off the edge's midpoint) names that edge's
//      owner, and each owner a crossing piece names has an edge whose stroke reaches it.
//   4. CURBLESS BLOCKS — each `kind: 'block'` piece lies inside a frozen ① block, outside H and on no tile.
//   node checks/claims-the-ink-is-held-by-its-owners.mjs [--scene=<town> …]
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
const name = (o) => typeof o === 'string' ? o : o?.kind === 'water' ? 'water' : JSON.stringify(o)

let bad = 0, towns = 0
for (const scene of feedScenes()) {
  const f = feed(scene); if (!f) { bad++; continue }
  const warn = console.warn; console.warn = () => {}
  let R; try { R = buildProto(f, { quiet: true, protoArtifact: true, protoProducer: true }) }
  catch (e) { console.warn = warn; console.log(`⛔ ${scene}: the producer refused, so nothing was checked — ${String(e.message).split('\n')[0].slice(0, 200)}`); bad++; continue }
  console.warn = warn
  const P = R.protoInkPieces, ink = R.proto, L = R.protoLabels, O = R.protoOwners
  if (!P) { console.log(`⛔ ${scene}: the producer reported no ink pieces (protoInkPieces) — nothing was checked`); bad++; continue }
  towns++
  // ⛔ NO GLOBAL UNION OF THE PIECES: measured on JH, one Clipper union of 7,147 piece rings reported winding 2 inside a
  // 25,241 m² block that NO piece covers (each piece's own winding there 0) — an instrument fault, so each claim is read locally.
  // ⛔ THE INK THE PIECES ARE OF: the producer's ① strip clipped to the town's stencil, as `inkPiecesByOwner` is handed it
  // (the bake's `stencil.clipPolygon`, the feed's `f.stencil`). Read unclipped, the strip outside the disc reads as uncovered.
  if (!f.stencil?.length) { console.log(`⛔ ${scene}: the feed carries no stencil — the pieces' own extent is unknown, nothing was checked`); bad++; continue }
  const inkU = op(ClipType.ctIntersection, ink, [f.stencil]), aInk = area(inkU)
  const bbOf = (rs) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const r of rs) for (const [x, z] of r) { if (x < a) a = x; if (z < b) b = z; if (x > c) c = x; if (z > d) d = z } return [a, b, c, d] }
  const meet = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
  const bb = P.map(p => bbOf(p.rings)), inkBB = inkU.map(r => bbOf([r]))
  // what survives an erosion by the boolean's own tolerance (2 grid units, `booleanLabelled`'s containment rule) — narrower is the grid's own rounding, not a region
  const GRID = 2, near2 = (q, i) => P[i].rings.some(r => r.some((a, k) => { const b = r[(k + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dz) <= GRID / CLIP_SCALE }))
  const solid = (rs) => { if (!rs.length) return 0; const co = new clipperLib.ClipperOffset(), out = []; co.AddPaths(rs.map(C), clipperLib.JoinType.jtRound, clipperLib.EndType.etClosedPolygon); co.Execute(out, -GRID); return out.reduce((t, q) => t + Math.abs(q.reduce((u, a, i) => u + a.X * q[(i + 1) % q.length].Y - q[(i + 1) % q.length].X * a.Y, 0) / 2), 0) / (CLIP_SCALE * CLIP_SCALE) }
  // 1b — no piece outside the ink: each piece against the ink rings near it (nonzero, wound as Clipper wrote them)
  let over = 0, overRaw = 0; P.forEach((p, i) => { if (p.kind === 'block') return; const near = inkU.filter((_, k) => meet(inkBB[k], bb[i])); const d = op(ClipType.ctDifference, p.rings, near); overRaw += area(d); over += solid(d) })
  // 2 — no overlap: every pair of pieces whose bounds meet
  let overlap = 0, overlapRaw = 0; const ord = P.map((_, i) => i).sort((a, b) => bb[a][0] - bb[b][0])
  for (let a = 0; a < ord.length; a++) for (let b = a + 1; b < ord.length && bb[ord[b]][0] <= bb[ord[a]][2]; b++) { const i = ord[a], j = ord[b]; if (!meet(bb[i], bb[j])) continue
    const x = op(ClipType.ctIntersection, P[i].rings, P[j].rings); if (x.length) { overlapRaw += area(x); overlap += solid(x) } }
  const noOwner = P.filter(p => !p.owners?.length).length
  // 4 — THE CURBLESS BLOCKS' GROUND (`kind: 'block'`): each lies inside a frozen ① block, outside H, and on no tile
  const fp = f.ribbons.protopolygon, BP = P.filter(p => p.kind === 'block'), H = (R.highway || []).filter(r => r?.length >= 3), T = R.protoShapeTiles.map(t => t.ring), tbb = T.map(r => bbOf([r]))
  let bOut = 0, bH = 0, bTile = 0, bM2 = 0
  for (const p of BP) { const b = bbOf(p.rings); bM2 += area(p.rings)
    bOut += solid(op(ClipType.ctDifference, p.rings, fp.blocks.filter(r => meet(bbOf([r]), b))))
    if (H.length) bH += solid(op(ClipType.ctIntersection, p.rings, H))
    const nt = T.filter((_, i) => meet(tbb[i], b)); if (nt.length) bTile += solid(op(ClipType.ctIntersection, p.rings, nt)) }
  // 1a + 3 — every 0.5 m along every ink edge, a point ε inside the strip (the ink lies left of its own edges, as Clipper writes
  // it) must lie in a piece, and that piece must name the edge's owner
  const eps = 0.005 / 2, STEP = 0.5
  const grid = new Map(), G = 50; P.forEach((p, i) => { for (let x = Math.floor(bb[i][0] / G); x <= Math.floor(bb[i][2] / G); x++) for (let z = Math.floor(bb[i][1] / G); z <= Math.floor(bb[i][3] / G); z++) (grid.get(x + ',' + z) || grid.set(x + ',' + z, []).get(x + ',' + z)).push(i) })
  const pieceAt = (p) => (grid.get(Math.floor(p[0] / G) + ',' + Math.floor(p[1] / G)) || []).filter(i => inRings(p, P[i].rings))
  let samples = 0, missed = 0, wrong = 0, onGrid = 0; const reached = P.map(() => new Set()), wrongAt = [], missedAt = []
  ink.forEach((r, ri) => r.forEach((A, k) => { const B = r[(k + 1) % r.length], dx = B[0] - A[0], dz = B[1] - A[1], len = Math.hypot(dx, dz), o = O[L[ri]?.[k]]
    if (!(len > 4 * eps) || !o) return
    const key = o.water ? 'water' : o.skelId, m = Math.max(1, Math.round(len / STEP))
    for (let s = 0; s < m; s++) { const t = (s + 0.5) / m, q = [A[0] + dx * t - dz / len * eps, A[1] + dz * t + dx / len * eps]
      if (!inRings(q, inkU)) continue                                // a point the strip does not hold (a sliver end)
      samples++; const hit = pieceAt(q)
      if (!hit.length && (grid.get(Math.floor(q[0] / G) + ',' + Math.floor(q[1] / G)) || []).some(i => near2(q, i))) { onGrid++; continue }
      if (!hit.length) { missed++; if (missedAt.length < 3) missedAt.push(`(${q.map(c => c.toFixed(3))}) on ${key}`); continue }
      for (const i of hit) { reached[i].add(key); if (!P[i].owners.map(name).includes(key)) { wrong++; if (wrongAt.length < 3) wrongAt.push(`${key} at (${q.map(c => c.toFixed(2))}), piece names ${P[i].owners.map(name).join(' + ')}`) } } } }))
  const crossings = P.filter(p => p.owners.length > 1), unreached = crossings.filter(p => { const i = P.indexOf(p); return p.owners.some(o => !reached[i].has(name(o))) }).length
  const ok = over === 0 && overlap === 0 && !noOwner && !missed && !wrong && !bOut && !bH && !bTile
  if (!ok) bad++
  console.log(`${ok ? '✅' : '⛔'} ${scene}: ${P.length} ink piece(s), ${crossings.length} crossing(s) (≥ 2 owners, up to ${Math.max(0, ...crossings.map(p => p.owners.length))}) · ink ${aInk.toFixed(2)} m²`)
  console.log(`   1 cover: ${samples} points ε inside the strip, every ${STEP} m along every ink edge · in no piece ${missed} (within the 2-unit grid of a piece's edge, not counted: ${onGrid})${missedAt.length ? ` (${missedAt.join(' · ')})` : ''} · piece outside the ink ${over.toFixed(6)} m² wider than the grid (${overRaw.toFixed(3)} m² of slivers in all)`)
  console.log(`   2 partition: overlap ${overlap.toFixed(6)} m² wider than the grid (${overlapRaw.toFixed(3)} m² of slivers in all) · pieces with no owner ${noOwner}`)
  console.log(`   4 curbless blocks: ${BP.length} piece(s), ${bM2.toFixed(1)} m² · outside every ① block ${bOut.toFixed(6)} m² · under H ${bH.toFixed(6)} m² · on a tile ${bTile.toFixed(6)} m² (each wider than the grid)`)
  console.log(`   3 owners: in a piece not naming the edge's owner ${wrong}${wrongAt.length ? ` (${wrongAt.join(' · ')})` : ''} · crossing pieces naming an owner no sample reached ${unreached} (reported, not failed)`)
}
if (!towns) { console.log('⛔ no town produced ① ink — nothing was checked'); bad++ }
console.log(`\n${bad ? '⛔ RED — the ink is not held by its owners' : '✅ GREEN — every piece of the ink names who it belongs to'}`)
process.exit(bad ? 1 : 0)
