// count.mjs <scene> — per perpendicular corner (the norm the pour would freeze now): how many RECORDED crossings land on it
// (distinct OSM crossings among the arc's landed crossing ends, from scratch/ground-budget/corner-style/out/<scene>.json,
// 37c3201b, joined by the corner's own key) and its interior angle (from its two landings' `along`). Measures only.
import { readFileSync } from 'fs'
import { feed } from '../../_proto-feed.mjs'
import { resolveCurbCutNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { readSources } from '../../../cartograph/sources.js'
const { buildTileGround } = await import('../../../src/lib/tileGround.js')
const scene = process.argv[2], f = feed(scene), src = readSources(scene)
const nm = resolveCurbCutNorm(scene, src.declared ? src.state : null)
const pl = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
const R = buildTileGround({ ...f.ribbons, curbCutNorm: nm }, { grout: 'proto', smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth, blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides, cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1, protoProducer: true })
console.log = pl; console.warn = pw
const rows = JSON.parse(readFileSync(new URL(`../../../../../../scratch/ground-budget/corner-style/out/${scene}.json`, import.meta.url))).rows
const byKey = new Map(rows.map(r => [r.key, r]))
const ang = (u, v) => Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))))) * 180 / Math.PI
const recs = (R.curbCutRecs || []).filter(r => r.along)
const out = []
let unjoined = 0
for (const c of (R.curbCutCorners || []).filter(c => c.wedge)) {
  const row = c.key ? byKey.get(c.key) : null
  if (!row) { unjoined++; continue }
  const rs = recs.filter(r => r.si === c.si && r.arc === c.arc && Math.hypot(r.at[0] - c.at[0], r.at[1] - c.at[1]) < 10)
  // the interior angle: the two landings' `along` point back up their legs, away from the corner, so their angle is the corner's
  const a = rs.length === 2 ? ang(rs[0].along, rs[1].along) : null
  const xs = new Set(row.xwalkEnds.map(e => e.osmId)), xa = new Set(row.xwalkEnds.filter(e => e.kind === 'arc').map(e => e.osmId))
  out.push({ at: c.at, angle: a, crossings: xs.size, onArc: xa.size, kerbs: row.kerbF.length, wedge: c.wedge, legs: row.legs })
}
const dist = (L) => { const d = { 0: 0, 1: 0, 2: 0, '3+': 0 }; for (const o of L) d[o.crossings >= 3 ? '3+' : o.crossings]++; return Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(' · ') }
const acute = out.filter(o => o.angle != null && o.angle < 60)
console.log(`${scene}: ${out.length} perpendicular corner(s) joined to the recorded-crossing rows (${unjoined} unjoined)`)
console.log(`  recorded crossings landing per corner — ${dist(out)}`)
console.log(`  acute corners (< 60° between legs): ${acute.length}; their recorded crossings — ${dist(acute)}`)
console.log(`  corners with 3+ recorded crossings: ${out.filter(o => o.crossings >= 3).length}, of them acute: ${out.filter(o => o.crossings >= 3 && o.angle != null && o.angle < 60).length}`)
for (const o of out.filter(o => o.crossings >= 3).sort((a, b) => (a.angle ?? 999) - (b.angle ?? 999)).slice(0, 8)) console.log(`    3+: (${o.at.map(v => v.toFixed(1))}) ${o.angle != null ? o.angle.toFixed(0) + '°' : 'angle —'} · ${o.crossings} crossings (${o.onArc} landing on the arc itself) · ${o.legs.join(' × ')}`)
for (const o of acute.sort((a, b) => a.angle - b.angle).slice(0, 6)) console.log(`    acute: (${o.at.map(v => v.toFixed(1))}) ${o.angle.toFixed(0)}° · ${o.crossings} recorded crossing(s) · ${o.legs.join(' × ')}`)
