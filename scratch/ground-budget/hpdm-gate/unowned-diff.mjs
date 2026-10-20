// unowned-diff.mjs — HEAD's unowned ped sites against the gate's (unowned-sites.mjs), clustered (3 m), matched (1 m), and each
// cluster only one side has read against the two slabs' ② (shape.json iaFull · iaArc · iaStamp→runs) within R of it:
//   ② moved     — a gate ② vertex lies > 1 cm off HEAD's ② (or the reverse): the curb ring itself changed there
//   new arc     — the gate has a corner arc there and HEAD does not (or the reverse)
//   relabelled  — ② unmoved, but its owners (skelId·side·segOrd, or arc) differ
//   ② same      — ② and its owners unchanged: the bands changed, or something else (cause not established)
//   node unowned-diff.mjs --head=<json> --gate=<json> --head-shape=<shape.json> --gate-shape=<shape.json> [--r=5]
import { readFileSync } from 'fs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const H = JSON.parse(readFileSync(arg('head'))), Gt = JSON.parse(readFileSync(arg('gate'))), R = +(arg('r') || 5)
const SH = JSON.parse(readFileSync(arg('head-shape'))).tiles, SG = JSON.parse(readFileSync(arg('gate-shape'))).tiles
const near = (L, p, r) => L.some(q => Math.hypot(q.p[0] - p[0], q.p[1] - p[1]) <= r)
const cluster = (L) => { const C = []; for (const s of L) { const c = C.find(c => c.s.some(q => Math.hypot(q.p[0] - s.p[0], q.p[1] - s.p[1]) <= 3)); c ? c.s.push(s) : C.push({ s: [s] }) } return C }
// ② vertices within R, with owner label, per slab
const verts = (S, p) => { const out = []; S.forEach((t, ti) => (t.iaFull || []).forEach((ring, ri) => ring.forEach((q, i) => { if (Math.hypot(q[0] - p[0], q[1] - p[1]) > R) return
  const a = t.iaArc?.[ri]?.[i], st = t.iaStamp?.[ri]?.[i], run = st != null ? t.runs?.[st] : null
  out.push({ q, ring, i, arc: a, own: a != null ? 'arc' : run ? `${run.skelId}·${run.side}·${run.segOrd}` : 'none' }) }))) ; return out }
const segD = (p, V) => { let b = Infinity; for (const v of V) { const r = v.ring, n = r.length; for (const j of [v.i, (v.i + n - 1) % n]) { const a = r[j], c = r[(j + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; b = Math.min(b, Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dz)) } } return b }
const why = (c) => { const p = c.s[0].p, vh = verts(SH, p), vg = verts(SG, p)
  const moved = Math.max(0, ...vg.map(v => segD(v.q, vh)), ...vh.map(v => segD(v.q, vg)))
  const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
  const tin = (S) => S.filter(t => pip(p[0], p[1], t.ring)).map(t => `${(t.iaFull || []).length} ② ring(s)`).join('/') || 'no tile'
  const dmin = (S) => { let b = Infinity; for (const t of S) for (const r of t.iaFull || []) for (const q of r) b = Math.min(b, Math.hypot(q[0] - p[0], q[1] - p[1])); return b }
  if (!vh.length || !vg.length) return `deep: no ② within R (nearest ② vertex HEAD ${dmin(SH).toFixed(1)} m · gate ${dmin(SG).toFixed(1)} m)`
  if (moved > 0.01) return `② moved (by up to ${moved.toFixed(2)} m)`
  const ah = vh.some(v => v.arc != null), ag = vg.some(v => v.arc != null); if (ah !== ag) return ag ? 'new arc at the gate' : 'arc only at HEAD'
  const oh = new Set(vh.map(v => v.own)), og = new Set(vg.map(v => v.own)); if ([...oh].sort().join() !== [...og].sort().join()) return `relabelled (${[...oh].join(', ')} → ${[...og].join(', ')})`
  return '② and owners the same' }
const CH = cluster(H), CG = cluster(Gt)
const both = CG.filter(c => c.s.some(s => near(H, s.p, 1))), onlyG = CG.filter(c => !c.s.some(s => near(H, s.p, 1))), onlyH = CH.filter(c => !c.s.some(s => near(Gt, s.p, 1)))
const n = (C) => C.reduce((a, c) => a + c.s.length, 0)
console.log(`HEAD ${H.length} vertex(es) in ${CH.length} site(s) · gate ${Gt.length} in ${CG.length}`)
console.log(`  at both (a gate site within 1 m of a HEAD vertex): ${both.length} site(s), gate ${n(both)} vertex(es) · HEAD's there ${H.filter(s => near(Gt, s.p, 3)).length}`)
for (const [lab, C] of [['only at the gate', onlyG], ['only at HEAD', onlyH]]) {
  const by = new Map(); for (const c of C) { const w = why(c), k = w.replace(/\(.*\)/, '').trim(); const e = by.get(k) || { n: 0, v: 0, ex: [] }; e.n++; e.v += c.s.length; if (e.ex.length < 4) e.ex.push(`(${c.s[0].p.map(x => x.toFixed(1))}) ${c.s.length}v ${c.s[0].g}${w.includes('(') ? ' ' + w.slice(w.indexOf('(')) : ''}`); by.set(k, e) }
  console.log(`  ${lab}: ${C.length} site(s), ${n(C)} vertex(es)`)
  for (const [k, e] of [...by].sort((a, b) => b[1].v - a[1].v)) console.log(`    ${String(e.v).padStart(4)} v in ${e.n} site(s) · ${k} · e.g. ${e.ex.join(' · ')}`) }
