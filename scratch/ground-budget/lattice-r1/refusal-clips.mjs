// refusal-clips.mjs — at every band refusal (ground in no span's rect and no single join), the rects and joins within 2 m
// of it (bandPiecesOfTile's `census.refusedNear`, a REPORTING reach — never a rule): their spans, join vertex and depths.
// (Not whether a clip touches it: the refused ground is what is left AFTER every clip is subtracted, so none can.) Plus every piece emitted by a JOIN whose owner has no depth.
// Heavy (builds the producer): CHECK=scratch/ground-budget/lattice-r1/refusal-clips.mjs TOWNS=<town> …/sweep/run.sh <tileGround>
import { feed, buildProto, feedScenes } from '../../_proto-feed.mjs'
const NEED = { curb: ['cw'], walk: ['walkFrom', 'walkTo'], lawn: ['cw', 'WB'] }
const f2 = (v) => Array.isArray(v) ? `[${v.map(x => +(+x).toFixed(3)).join(', ')}]` : String(v)
for (const scene of feedScenes()) {
  const f = feed(scene); if (!f) continue
  const warn = console.warn; console.warn = () => {}; const R = buildProto(f, { quiet: true, protoArtifact: true, protoProducer: true }); console.warn = warn
  for (const t of R.protoBandPieces || []) {
    for (const r of t.census.refusedNear || []) {
      console.log(`RC ${scene} tile ${t.tile} ${r.cls} REFUSED ${r.m2.toFixed(3)} m² at (${r.at.map(v => v.toFixed(2)).join(', ')}): ${r.clips.length} clip(s) within 2 m`)
      for (const c of r.clips) console.log(`RC     ${c.join ? `join ${c.join}` : 'rect'} spans ${c.spans.join('+')} · depths ${f2(c.d)}`) }
    for (const q of t.pieces) if (q.why === 'join') for (const o of q.owners) { const miss = (NEED[q.cls] || []).filter(k => !(Array.isArray(o.depths?.[k]) && o.depths[k].every(Number.isFinite))); if (!miss.length) continue
      let cx = 0, cz = 0, m = 0; for (const rg of q.rings) for (const [x, z] of rg) { cx += x; cz += z; m++ }
      console.log(`RC ${scene} tile ${t.tile} ${q.cls} JOIN piece at (${(cx / m).toFixed(2)}, ${(cz / m).toFixed(2)}), owner ${o.span} (${o.skelId}|${o.side}|${o.segOrd}), no ${miss.join('/')}: join ${q.from?.join} · its clips' depths ${(q.from?.d || []).map(f2).join(' ')} · owners ${q.owners.map(x => x.span).join('+')}`) }
  }
}
