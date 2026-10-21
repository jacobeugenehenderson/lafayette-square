// trace.mjs <scene> <x,z> — the densified depths the band is handed along one arc (SECTION_DUMP's ramp rows, stamped with
// each densified edge's own endpoints by a scratch copy, tg.dump.mjs): per edge near the point, its source edge, whether it
// is inside an arc (and which), and walkFrom / walkTo at its start and end. Measures only.
process.env.SECTION_DUMP = '1'
import { feed } from '../../_proto-feed.mjs'
import { resolveCurbCutNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { readSources } from '../../../cartograph/sources.js'
const { buildTileGround, sectionDump } = await import('./tg.dump.mjs')
sectionDump.on = true
const [scene, pt] = process.argv.slice(2), [cx, cz] = pt.split(',').map(Number)
const f = feed(scene), src = readSources(scene), nm = resolveCurbCutNorm(scene, src.declared ? src.state : null)
const pl = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
buildTileGround({ ...f.ribbons, curbCutNorm: nm }, { grout: 'proto', smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth, blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides, cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1, protoProducer: true })
console.log = pl; console.warn = pw
const rows = sectionDump.ramp.filter(r => r.a && Math.hypot(r.a[0] - cx, r.a[1] - cz) < 9)
for (const r of rows) console.log(`${r.a.join(',')} → ${r.b.join(',')}  len ${r.len.toFixed(2)}  src ${r.src}  arc ${r.arcId ?? '—'}  inArc ${r.inArc ?? '—'}  perp ${r.perp ?? '—'}  walkFrom ${r.walkFrom.map(v => v.toFixed(2)).join('→')}  walkTo ${r.walkTo.map(v => v.toFixed(2)).join('→')}  kS ${r.kS ?? '—'} kE ${r.kE ?? '—'}  stamp ${r.stp ?? '—'}  M#${r.mId ?? '—'}  mark ${r.mark}`)
