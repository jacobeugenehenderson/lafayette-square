// depths.mjs <scene> — the depths the band's offsets are handed (SECTION_DUMP's ramp rows) on every UNPADDED arc edge, before
// and after the end() fix on boz/hpdm-gate (hg.pre.mjs / hg.post.mjs, scratch copies stamped with each edge's arc): densified
// pieces per arc, and how far the outer strip's start depth (walkFrom) and the walk's back (walkTo) swing across the arc.
process.env.SECTION_DUMP = '1'
import { feed } from '../../_proto-feed.mjs'
const scene = process.argv[2], f = feed(scene)
const run = async (file) => { const m = await import(file); m.sectionDump.on = true; m.sectionDump.ramp.length = 0
  const pl = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
  try { m.buildTileGround(f.ribbons, { grout: 'proto', smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth, blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides, cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1, protoProducer: true }) } finally { console.log = pl; console.warn = pw }
  const by = new Map(); for (const r of m.sectionDump.ramp) { if (r.arcId == null || r.padded) continue; const k = `${r.tileKey}|${r.si}|${r.ri}|${r.arcId}`
    const e = by.get(k) || by.set(k, { n: 0, wf: [], wt: [] }).get(k); e.n++; e.wf.push(...r.walkFrom); e.wt.push(...r.walkTo) }
  return by }
const A = await run('./hg.pre.mjs'), B = await run('./hg.post.mjs')
const swing = (v) => Math.max(...v) - Math.min(...v)
let arcs = 0, pieceA = 0, pieceB = 0, swA = 0, swB = 0, flatB = 0, changed = 0
for (const [k, a] of A) { const b = B.get(k); if (!b) continue; arcs++; pieceA += a.n; pieceB += b.n
  const sa = swing(a.wf), sb = swing(b.wf); if (sa > 0.05) swA++; if (sb > 0.05) swB++; if (sb <= 1e-6) flatB++; if (Math.abs(sa - sb) > 1e-6 || a.n !== b.n) changed++ }
console.log(`${scene}: ${arcs} unpadded arc(s) — densified edges ${pieceA} → ${pieceB} · arcs whose outer-strip start swings > 5 cm across the arc ${swA} → ${swB} · flat after ${flatB} · arcs whose depths changed ${changed}`)
