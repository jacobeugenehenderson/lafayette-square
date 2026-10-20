// walk-diff.mjs — the walk gate's over stations (claims-the-walk-is-level-across --json) at HEAD against the gate's: matched by
// position (0.5 m); each gate-only over station asked whether HEAD HAD a station there (a HEAD ② run of the same key passing
// within 5 cm: the station existed, under the limit) or not (the run is new, moved, or relabelled there); then clustered by
// run key, with the fall and the walk's front/back widths. Read-only.
//   node walk-diff.mjs --head=<json> --gate=<json> --head-shape=<shape.json> --gate-shape=<shape.json>
import { readFileSync } from 'fs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const H = JSON.parse(readFileSync(arg('head'))), Gt = JSON.parse(readFileSync(arg('gate')))
const SH = JSON.parse(readFileSync(arg('head-shape'))).tiles, SG = JSON.parse(readFileSync(arg('gate-shape'))).tiles
const CELL = 2, grid = (L) => { const m = new Map(); for (const s of L) { const k = `${Math.floor(s.at[0] / CELL)},${Math.floor(s.at[1] / CELL)}`; (m.get(k) || m.set(k, []).get(k)).push(s) } return m }
const near = (m, p, r) => { const cx = Math.floor(p[0] / CELL), cz = Math.floor(p[1] / CELL); for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) for (const s of m.get(`${x},${z}`) || []) if (Math.hypot(s.at[0] - p[0], s.at[1] - p[1]) <= r) return s; return null }
// HEAD's run polylines by key, segment-gridded
const segs = (S) => { const m = new Map(); for (const t of S) for (const run of t.runs || []) { const key = `${run.skelId} · ${run.side} · ${run.segOrd}`
  for (let i = 0; i + 1 < run.poly.length; i++) { const a = run.poly[i], b = run.poly[i + 1]
    for (let x = Math.floor(Math.min(a[0], b[0]) / CELL); x <= Math.floor(Math.max(a[0], b[0]) / CELL); x++) for (let z = Math.floor(Math.min(a[1], b[1]) / CELL); z <= Math.floor(Math.max(a[1], b[1]) / CELL); z++) { const k = `${x},${z}`; (m.get(k) || m.set(k, []).get(k)).push({ a, b, key }) } } } return m }
const onRun = (m, p) => { let best = null, bd = Infinity; const cx = Math.floor(p[0] / CELL), cz = Math.floor(p[1] / CELL)
  for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) for (const s of m.get(`${x},${z}`) || []) { const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dz) / L2)) : 0, d = Math.hypot(p[0] - s.a[0] - u * dx, p[1] - s.a[1] - u * dz); if (d < bd) { bd = d; best = s } }
  return { d: bd, key: best?.key } }
const gH = grid(H), gG = grid(Gt), rH = segs(SH)
const onlyG = Gt.filter(s => !near(gH, s.at, 0.5)), onlyH = H.filter(s => !near(gG, s.at, 0.5))
console.log(`over stations: HEAD ${H.length} · gate ${Gt.length} · at both ${Gt.length - onlyG.length} · only at the gate ${onlyG.length} · only at HEAD ${onlyH.length}`)
const cls = new Map(); for (const s of onlyG) { const r = onRun(rH, s.at), c = r.d <= 0.05 ? (r.key === s.key ? 'HEAD had a station there (same run), under the limit' : `HEAD had ② there under another run`) : `no HEAD ② within 5 cm (nearest ${r.d < 1 ? '< 1 m' : r.d < 10 ? '1–10 m' : '> 10 m'})`; cls.set(c, (cls.get(c) || 0) + 1) }
for (const [c, n] of [...cls].sort((a, b) => b[1] - a[1])) console.log(`  gate-only: ${String(n).padStart(4)}  ${c}`)
const runs = (L) => { const m = new Map(); for (const s of L) { const e = m.get(s.key) || { n: 0, worst: 0, at: s.at, w: s.walk }; e.n++; if (s.fall > e.worst) { e.worst = s.fall; e.at = s.at; e.w = s.walk } m.set(s.key, e) } return [...m].sort((a, b) => b[1].n - a[1].n) }
for (const [lab, L] of [['gate-only', onlyG], ['HEAD-only', onlyH]]) { const R = runs(L)
  console.log(`  ${lab} by run (${R.length} runs; top 10): ${R.slice(0, 10).map(([k, e]) => `${k} ${e.n} (worst ${(e.worst * 100).toFixed(1)}% at (${e.at.map(x => x.toFixed(1))}), walk ${e.w.map(x => x.toFixed(2)).join('–')} m)`).join(' · ')}`) }
