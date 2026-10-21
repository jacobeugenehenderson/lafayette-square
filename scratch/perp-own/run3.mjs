// run3.mjs <scene> — read-only; run from the worktree root. Boz's two follow-ups (2026-10-20), no fix chosen:
//  (1) does the leg edge's own stamp, runs[iaStamp[si][i]] (what ownerOf('aX/t') reads), name the leg? ORACLE, independent of
//      the stamp and of spanOfSrc: the skeleton's own centerlines (ribbons `streets` + `alleys`). From the leg edge's midpoint a
//      ray is cast toward the road (−nr, `legFrame`'s normal, depth growing into the block), and the FIRST centerline segment it
//      crosses within 150 m is the street that edge fronts. Right = same skelId · same road (sameRoad: roadId or throughId,
//      a chain split) · wrong · unresolvable (no stamp run, or the ray meets no centerline). ⚠️ The oracle is a measurement
//      only; it is a first-hit ray, not a nearest search, and it is never a construction.
//  (2) the wider reach: on EVERY tile with pieces, each source edge of each contour part whose span label (spanOfSrc) is an
//      arc's though the edge is not an arc edge (both ends in one arc), i.e. its start vertex lies on an arc; and the pieces
//      whose owner span is such a label, in m² by class.
import { fileURLToPath } from 'url'
const WT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '')
const scene = process.argv[2]
const { feed } = await import(`${WT}/scratch/_proto-feed.mjs`)
const { buildTileGround } = await import('./tileGround.probe.mjs')
const E = []
globalThis.__MEASURE = (ext) => { for (const x of ext) E.push({ role: x.role, span: x.span, cArc: x.cArc, run: x.run, mid: x.mid, nr: x.nr, len: x.edgeLen }) }
const W = { edges: 0, arcEdges: 0, mis: 0, misLen: 0, misMirror: 0, spans: 0, misSpans: 0, misSpansAlsoArc: 0, pieces: {}, misPieces: {}, misPiecesN: 0, tiles: 0 }
globalThis.__PIECES = ({ st, parts, spanOfSrc, pieces, signedArea }) => {
  W.tiles++
  const misLab = new Set(), allLab = new Set(), arcLab = new Set()
  for (const p of parts) { const A = st.iaArc?.[p.si] || [], n = p.ring.length
    for (let e = 0; e < n; e++) { W.edges++; const lab = spanOfSrc(p.si, e); allLab.add(lab)
      const isArc = A[e] != null && A[e] === A[(e + 1) % n]; if (isArc) { W.arcEdges++; arcLab.add(lab) }
      if (lab[0] === 'a' && !isArc) { W.mis++; misLab.add(lab); const a = p.ring[e], b = p.ring[(e + 1) % n]; W.misLen += Math.hypot(b[0] - a[0], b[1] - a[1])
        if (A[e] !== A[(e + 1) % n] && A[(e + 1) % n] != null) W.misMirror++ } } }
  W.spans += allLab.size; W.misSpans += misLab.size; for (const l of misLab) if (arcLab.has(l)) W.misSpansAlsoArc++
  for (const q of pieces) { const a = q.rings.reduce((t, r) => t + signedArea(r), 0), m = Math.abs(a)
    W.pieces[q.cls] = (W.pieces[q.cls] || 0) + m
    if (q.owners.some(o => misLab.has(o.span))) { W.misPiecesN++; W.misPieces[q.cls] = (W.misPieces[q.cls] || 0) + m } }
}
const f = feed(scene); if (!f) process.exit(2)
const prev = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
let R; try {
  R = buildTileGround(f.ribbons, { smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth,
    blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides,
    cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1 })
} finally { console.log = prev; console.warn = pw }
// (1) the oracle
const lines = [...(f.ribbons.streets || []), ...(f.ribbons.alleys || [])].filter(s => s?.skelId && s.points?.length >= 2)
const byId = new Map(lines.map(s => [s.skelId, s]))
const hit = (P, d, maxL = 150) => { let best = null
  for (const s of lines) { const pts = s.points; for (let k = 0; k + 1 < pts.length; k++) { const U = pts[k], V = pts[k + 1], ex = V[0] - U[0], ez = V[1] - U[1]
    const den = d[0] * ez - d[1] * ex; if (Math.abs(den) < 1e-12) continue
    const wx = U[0] - P[0], wz = U[1] - P[1], t = (wx * ez - wz * ex) / den, u = (wx * d[1] - wz * d[0]) / den
    if (u >= 0 && u <= 1 && t > 1e-6 && t <= maxL && (!best || t < best.t)) best = { t, s, cross: ex * (P[1] - U[1]) - ez * (P[0] - U[0]) } } }
  return best }
const same = (a, b) => (a?.roadId != null && a.roadId === b?.roadId) || (a?.throughId != null && a.throughId === b?.throughId)
const kind = (e) => e.span[0] === 'r' ? 'run label' : e.span[0] === 'a' ? (+e.span.slice(1).split('/')[0] === e.cArc ? 'own-arc label' : 'other-arc label') : e.span
const tab = {}, sides = {}, wrongAt = [], ts = []
for (const e of E) {
  let v
  if (!e.run) v = 'unresolvable: no stamp run'
  else if (!e.nr) v = 'unresolvable: no frame'
  else { const h = hit(e.mid, [-e.nr[0], -e.nr[1]])
    if (!h) v = 'unresolvable: ray meets no centerline'
    else { ts.push(h.t); if (h.s.skelId === e.run.skelId) v = 'right: same skelId'; else if (same(h.s, e.run)) v = 'right: same road (chain split)'; else { v = 'WRONG'; if (wrongAt.length < 8) wrongAt.push(`${e.role} ${e.span} stamp ${e.run.skelId}|${e.run.side} · ray → ${h.s.skelId} at ${h.t.toFixed(1)} m · mid (${e.mid.map(c => c.toFixed(1))}) · edge ${e.len?.toFixed(1)} m`) }
      if (v.startsWith('right')) { const k = `${h.cross > 0 ? 'centerline-left' : 'centerline-right'} vs stamp side ${e.run.side}`; sides[k] = (sides[k] || 0) + 1 } } }
  const k = `${e.role} · ${kind(e)} · ${v}`; tab[k] = (tab[k] || 0) + 1
}
const q = (p) => { const s = ts.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) : '-' }
console.log(`${scene} · authoring slots ${f.slots} · centerlines ${lines.length}`)
console.log(`(1) perpendicular legs with an extension: ${E.length} · oracle: first centerline crossed from the leg edge's midpoint toward the road (ray length p50 ${q(.5)} m, p95 ${q(.95)} m, max ${q(1)} m)`)
for (const [k, v] of Object.entries(tab).sort()) console.log(`      ${v} · ${k}`)
console.log(`    side (where right): ${Object.entries(sides).map(([k, v]) => `${v} ${k}`).join(' · ')}`)
for (const w of wrongAt) console.log(`      WRONG: ${w}`)
// (2)
const m = (o) => Object.entries(o).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ')
console.log(`(2) ${W.tiles} tiles with pieces · source edges ${W.edges} (arc edges ${W.arcEdges}) · edges with an arc's label that are NOT arc edges ${W.mis} (${W.misLen.toFixed(1)} m), of which the end vertex is in a different arc ${W.misMirror}`)
console.log(`    span labels ${W.spans} (per tile, summed) · labels carried by such an edge ${W.misSpans}, of which also carried by true arc edges (leg and arc share one span) ${W.misSpansAlsoArc}`)
console.log(`    pieces m² by class: ${m(W.pieces)} · pieces owned (in part) by such a span: ${W.misPiecesN}, m² ${m(W.misPieces)}`)
console.log(`    peak rss ${(process.memoryUsage().rss / 1e9).toFixed(2)} GB`)
