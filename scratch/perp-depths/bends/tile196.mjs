// tile196.mjs [tile] — the band pieces of one HPDM tile as boz/hpdm-gate's producer cuts them (its own feed, its own src):
// every lawn piece's owners — span, key, depths, edges — and the owner object's own fields, so a depthless owner can be
// read for what it expected and what it was handed. Measures only.
const HG = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/hpdm-gate'
const { feed, buildProto } = await import(`${HG}/scratch/_proto-feed.mjs`)
const TILE = +(process.argv[2] ?? 196)
const f = feed('hipointedemun'); const pw = console.warn, pl = console.log; console.warn = () => {}; console.log = () => {}
let R; try { R = buildProto(f, { quiet: true, protoArtifact: true, protoProducer: true }) } finally { console.warn = pw; console.log = pl }
const t = (R.protoBandPieces || []).find(x => x.tile === TILE); if (!t) { console.log('no such tile'); process.exit(1) }
const area = (rs) => Math.abs(rs.reduce((s, r) => s + r.reduce((u, p, i) => u + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0) / 2, 0))
const mid = (rs) => { let x = 0, z = 0, n = 0; for (const r of rs) for (const [a, b] of r) { x += a; z += b; n++ } return `(${(x / n).toFixed(2)}, ${(z / n).toFixed(2)})` }
console.log(`tile ${TILE}: ${t.pieces.length} piece(s) · tile keys: ${Object.keys(t).join(', ')}`)
console.log(`owner fields seen: ${[...new Set(t.pieces.flatMap(q => (q.owners || []).flatMap(o => Object.keys(o))))].join(', ')}`)
for (const q of t.pieces.filter(q => q.cls === 'lawn')) {
  console.log(`lawn piece ${mid(q.rings)} ${area(q.rings).toFixed(3)} m² · owners ${q.owners?.length ?? 0}`)
  for (const o of q.owners || []) console.log(`    ${JSON.stringify({ ...o, edges: o.edges, depths: o.depths }, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v).slice(0, 600)}`) }
const st = R.protoShapeTiles[TILE]
console.log(`shape tile ${TILE}: rings ${st.iaFull?.length} · arcs on ring 0: ${[...new Set((st.iaArc?.[0] || []).filter(v => v != null))].join(',')} · junction labels: ${JSON.stringify([...new Set((st.iaJunction?.[0] || []).filter(v => v != null))])}`)
if (t.edgeDepths) console.log(`edgeDepths rings: ${t.edgeDepths.length} · ring 0 edges with lawn depths: ${(t.edgeDepths[0] || []).filter(d => d && d.cw?.length && d.WB?.length).length} of ${(t.edgeDepths[0] || []).length}`)
// ── arc 0 itself: its source edges, their lengths, and what the tile's edgeDepths holds for them
{ const ring = st.iaFull?.[0] || [], arc = st.iaArc?.[0] || [], n = ring.length
  for (const id of [...new Set(arc.filter(v => v != null))]) {
    const ix = []; for (let i = 0; i < n; i++) if (arc[i] === id) ix.push(i)
    const edges = ix.filter(i => arc[(i + 1) % n] === id)
    const lens = edges.map(i => Math.hypot(ring[(i + 1) % n][0] - ring[i][0], ring[(i + 1) % n][1] - ring[i][1]))
    console.log(`arc ${id}: vertices ${ix.join(',')} · arc edges ${edges.join(',')} · lengths ${lens.map(v => v.toFixed(3)).join(', ')} · stamp runs ${edges.map(i => (st.iaStamp?.[0] || [])[i]).join(',')}`)
    console.log(`   edgeDepths on those edges: ${edges.map(i => { const d = t.edgeDepths?.[0]?.[i]; return `${i}:${d ? Object.keys(d).filter(k => d[k]?.length).join('/') || 'empty' : 'none'}` }).join(' · ')}`)
  } }
// ── where arc 0 is, against the a0 pieces: each piece's nearest arc-0 edge, and its nearest edge of any span
{ const ring = st.iaFull?.[0] || [], arc = st.iaArc?.[0] || [], n = ring.length
  const segD = (P, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t2 = L2 ? Math.max(0, Math.min(1, ((P[0] - a[0]) * dx + (P[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(P[0] - a[0] - t2 * dx, P[1] - a[1] - t2 * dz) }
  console.log(`arc 0 runs from (${ring[0].map(v => v.toFixed(2))}) to (${ring[13].map(v => v.toFixed(2))})`)
  for (const q of t.pieces.filter(q => q.owners?.some(o => o.span.startsWith('a0/')))) {
    const c = (() => { let x = 0, z = 0, k = 0; for (const r of q.rings) for (const [a, b] of r) { x += a; z += b; k++ } return [x / k, z / k] })()
    let best = { d: Infinity, e: -1 }; for (let e = 0; e < n; e++) { const d = segD(c, ring[e], ring[(e + 1) % n]); if (d < best.d) best = { d, e } }
    let a0 = { d: Infinity, e: -1 }; for (let e = 0; e < n; e++) if (arc[e] === 0 && arc[(e + 1) % n] === 0) { const d = segD(c, ring[e], ring[(e + 1) % n]); if (d < a0.d) a0 = { d, e } }
    console.log(`   ${q.cls} piece at (${c.map(v => v.toFixed(2))}) owners ${q.owners.map(o => o.span).join('+')}: nearest edge ${best.e} at ${best.d.toFixed(2)} m (arc ${arc[best.e] ?? '—'}, stamp ${(st.iaStamp?.[0] || [])[best.e]}) · nearest arc-0 edge ${a0.e} at ${a0.d.toFixed(2)} m`) } }
