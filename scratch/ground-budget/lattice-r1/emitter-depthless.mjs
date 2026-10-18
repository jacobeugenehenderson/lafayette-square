// emitter-depthless.mjs — for every band piece one of whose owners carries NO depth its class needs (the band check's claim 5),
// name the piece's EMITTER (a cell's own part, with the cell's kind and run indices — or byRects' / a landing's `why`), where it
// is, and how far it lies from the nearest iaFull edge of its own span. Boz, 2026-10-18 (tile 196: label first, then edges).
// Heavy (builds the producer): run through sweep/run.sh with CHECK=scratch/ground-budget/lattice-r1/emitter-depthless.mjs.
//   [TILE=196] TOWNS=hipointedemun …/run.sh <tileGround copy>
import { feed, buildProto, feedScenes } from '../../_proto-feed.mjs'
const NEED = { curb: ['cw'], walk: ['walkFrom', 'walkTo'], lawn: ['cw', 'WB'] }
const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
for (const scene of feedScenes()) {
  const f = feed(scene); if (!f) continue
  const warn = console.warn; console.warn = () => {}; const R = buildProto(f, { quiet: true, protoArtifact: true, protoProducer: true }); console.warn = warn
  let n = 0
  for (const t of R.protoBandPieces || []) { if (process.env.TILE && +process.env.TILE !== t.tile) continue
    const st = R.protoShapeTiles[t.tile]
    for (const q of t.pieces) for (const o of q.owners) { const miss = (NEED[q.cls] || []).filter(k => !(Array.isArray(o.depths?.[k]) && o.depths[k].every(Number.isFinite))); if (!miss.length) continue
      n++
      let cx = 0, cz = 0, m = 0; for (const r of q.rings) for (const [x, z] of r) { cx += x; cz += z; m++ } cx /= m; cz /= m
      // the piece's distance to its own span's contour edges, and the nearest edge of ANY span with its label
      let own = Infinity, any = { d: Infinity }
      ;(st.iaFull || []).forEach((rg, si) => rg.forEach((a, j) => { const b = rg[(j + 1) % rg.length], d = Math.min(...q.rings.flat().map(p => segD(p, a, b)))
        const run = st.iaStamp?.[si]?.[j], arc = st.iaArc?.[si]?.[j], cap = st.iaCap?.[si]?.[j]
        // the producer's own span label (`spanOfSrc`): cap c<i>/<run> · arc a<i>/<run> · run r<run>/<run>
        const lab = (cap != null ? 'c' + cap : arc != null ? 'a' + arc : run != null ? 'r' + run : '-') + '/' + (run ?? '-')
        if (d < any.d) any = { d, lab, si, j }
        if (lab === o.span) own = Math.min(own, d) }))
      console.log(`ED ${scene} tile ${t.tile} ${q.cls} span ${o.span} (${o.skelId}|${o.side}|${o.segOrd}) at (${cx.toFixed(2)}, ${cz.toFixed(2)}): no ${miss.join('/')} · emitter ${`${q.why ?? 'cell'} ${JSON.stringify(q.from ?? null)}`} · ${o.edges?.length ?? 0} bound edge(s) · nearest edge of its own span ${own.toFixed(2)} m · nearest edge of any span ${any.d.toFixed(2)} m (${any.lab}, ring ${any.si} edge ${any.j})`) } }
  console.log(`ED ${scene}: ${n} depthless owner(s)`)
}
