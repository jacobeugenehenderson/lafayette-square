// short-edges.mjs — WHY the 77 unstamped ② vertices' 1–4 mm edges exist: each traced to the offsetRingByRects operands that
// made it (run4.sh's capture: the contributors within 5 mm, with their ① ring edge), in metres and in Clipper integer
// units (CLIP_SCALE, lattice.js). Classes: R = one operand corner rounded onto two grid points (no edge in exact
// arithmetic) · G = two distinct operand corners 1–4 mm apart (a real mm-scale feature of the operands) · X = no operand
// corner at the edge: a crossing Clipper minted between operand lines. And: is every ① operand vertex on the 1 mm lattice?
//   node scratch/ground-budget/stamp-audit/short-edges.mjs stamp4-<town>.json [--show=3]
import { readFileSync } from 'fs'
import { CLIP_SCALE, LATTICE_M } from '../../../src/lib/lattice.js'
const D = JSON.parse(readFileSync(process.argv[2], 'utf8')), SHOW = +(process.argv.find(a => a.startsWith('--show='))?.split('=')[1] || 3)
const iu = (p) => `[${Math.round(p[0] * CLIP_SCALE)}, ${Math.round(p[1] * CLIP_SCALE)}]`, m = (p) => `(${p[0].toFixed(6)}, ${p[1].toFixed(6)})`
const onLat = (p) => p.every(v => Math.abs(v * CLIP_SCALE - Math.round(v * CLIP_SCALE)) < 1e-6)
const unst = []; for (const t of D.tiles) (t.iaFull || []).forEach((ring, ri) => ring.forEach((p, i) => { if (t.iaStamp?.[ri]?.[i] == null && t.iaCap?.[ri]?.[i] == null) unst.push(p) }))
const recs = D.offNull.filter(o => o.ops)
const cls = new Map(), offLat = new Map(), worked = []
let noRec = 0
for (const p of unst) {
  let o = null, bd = 1e-3; for (const r of recs) { const d = Math.hypot(r.p[0] - p[0], r.p[1] - p[1]); if (d < bd) { bd = d; o = r } }
  if (!o) { noRec++; continue }
  const corners = o.ops.flatMap(c => [{ v: c.a, c }, { v: c.b, c }])
  const near = (pt) => corners.reduce((b, k) => { const d = Math.hypot(k.v[0] - pt[0], k.v[1] - pt[1]); return d < b.d ? { d, k } : b }, { d: Infinity, k: null })
  const np = near(o.p), nq = near(o.q), TWO = 2 * LATTICE_M
  let c
  if (np.d > TWO && nq.d > TWO) c = 'X · no operand corner within 2 grid steps: a crossing Clipper minted between operand lines'
  else if (np.d <= TWO && nq.d <= TWO && Math.hypot(np.k.v[0] - nq.k.v[0], np.k.v[1] - nq.k.v[1]) < 1e-6) c = 'R · ONE operand corner rounded onto two grid points (no edge in exact arithmetic)'
  else if (np.d <= TWO && nq.d <= TWO) { const g = Math.hypot(np.k.v[0] - nq.k.v[0], np.k.v[1] - nq.k.v[1]); c = `G · two distinct operand corners ${g < 0.002 ? '< 2 mm' : '2–5 mm'} apart (kinds ${np.k.c.kind}/${nq.k.c.kind}, ${np.k.c.lab === nq.k.c.lab ? 'the same ① edge' : 'different ① edges'})` }
  else c = 'M · one end at an operand corner, the other a minted crossing'
  cls.set(c, (cls.get(c) || 0) + 1)
  // the ① operands: every ① ring vertex these contributors were built on
  for (const op of o.ops) for (const v of op.ring || []) { if (!v) continue; const k = onLat(v) ? 'on the 1 mm lattice' : 'OFF the 1 mm lattice (float-born)'; offLat.set(k, (offLat.get(k) || 0) + 1) }
  if (worked.length < SHOW) worked.push({ p, o, c })
}
console.log(`${unst.length} unstamped ② vertices · ${noRec} with no short-edge record within 1 mm`)
for (const [k, v] of [...cls].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`)
console.log(`  ① operand vertices (the ring edges the nearby contributors were struck from), counted per use: ${[...offLat].map(([k, v]) => `${k} ${v}`).join(' · ')}`)
const curbEnds = recs.flatMap(o => o.ops.filter(c => c.kind === 1).flatMap(c => [c.a, c.b])), cl = curbEnds.filter(onLat).length
console.log(`  curb-line contributor endpoints (① offset by depth, before Clipper): ${cl} of ${curbEnds.length} on the lattice`)
for (const { p, o, c } of worked) {
  console.log(`\n  ── site (${p[0].toFixed(3)}, ${p[1].toFixed(3)}) · ${c}`)
  console.log(`     the ② edge: ${m(o.p)} → ${m(o.q)} · ${(o.eL * 1000).toFixed(2)} mm · grid ${iu(o.p)} → ${iu(o.q)}`)
  for (const op of o.ops) console.log(`     operand kind ${op.kind} (${op.kind === 1 ? 'curb line' : op.kind === 2 ? '① edge' : 'end cap'}) of ① edge ${op.lab}: ${m(op.a)} → ${m(op.b)} · grid ${iu(op.a)} → ${iu(op.b)} · ① ring ${op.ring?.map(v => v ? `${m(v)}${onLat(v) ? '' : ' OFF-LATTICE'}` : '—').join(' → ')} · depth ${op.dS?.toFixed(4)}/${op.dE?.toFixed(4)} m`)
}
