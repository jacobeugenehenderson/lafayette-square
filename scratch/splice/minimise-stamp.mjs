// Splice: minimise the PTown stamp capture into the smallest input on which the FROZEN round-then-retest loop still refuses
// (drop whole rings, then single vertices, each kept only while it still refuses). Fixture (b) of the noding check.
//   node scratch/splice/minimise-stamp.mjs <in.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { stampCrossings } from '../../checks/fixtures/stamp-crossings-frozen-9764b474.mjs'
const [inP, outP] = process.argv.slice(2), F = JSON.parse(readFileSync(inP, 'utf8'))
let items = F.items.map(x => ({ kind: x.kind, r: x.r.map(p => [p[0], p[1]]) }))
const refuses = (it) => { try { stampCrossings(it.map(x => x.r), (a, b) => (it[a].kind === 'ev') === (it[b].kind === 'ev')); return false } catch (e) { return /did not settle/.test(e.message) } }
if (!refuses(items)) { console.log('⛔ the capture does not refuse under the frozen rule — nothing to minimise'); process.exit(1) }
for (let i = items.length - 1; i >= 0; i--) { const t = items.filter((_, j) => j !== i); if (t.length >= 2 && refuses(t)) items = t }
// then vertices, by DELTA DEBUGGING per ring: drop a chunk, halving the chunk size, keep a drop only while it still
// refuses (a ring keeps ≥ 3 vertices); single-vertex greedy over ~29k vertices does not finish
for (const x of items) {
  for (let size = x.r.length >> 1; size >= 1; size >>= 1)
    for (let at = 0; at < x.r.length && x.r.length - size >= 3;) { const keep = x.r; x.r = keep.filter((_, j) => j < at || j >= at + size)
      if (refuses(items)) continue; x.r = keep; at += size } }
writeFileSync(outP, JSON.stringify({ note: `minimised from ${inP} (PTown stamp, 2026-10-25) by scratch/splice/minimise-stamp.mjs: the smallest set on which the frozen round-then-retest loop still refuses`, site: F.site, items }))
console.log(`minimised: ${F.items.length} rings → ${items.length} (${items.map(x => `${x.kind} ${x.r.length}v`).join(', ')}) · still refuses: ${refuses(items)} → ${outP}`)
