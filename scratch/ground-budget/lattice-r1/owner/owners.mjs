// owners.mjs <own cap.json> — each kept unowned ② edge: the ① edges whose contributor segments hold both its ends (within
// TOLC), their ① OWNERS (skelId|side|segOrd), grouped: one ① edge · same owner · same skelId|side, different segOrd (a chain
// cut) · different street or side (a meeting). With the ① turn between the two ① edges and whether the vertex is on an ease arc.
import { readFileSync } from 'fs'
import { LATTICE_M } from '../../../../src/lib/lattice.js'
const D = JSON.parse(readFileSync(process.argv[2], 'utf8')), TOLC = 2 * LATTICE_M, key = (p) => p.join(',')
const dseg = (c, r) => { const dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], L2 = dx * dx + dy * dy, u = Math.max(0, Math.min(1, ((r[0] - c.a[0]) * dx + (r[1] - c.a[1]) * dy) / L2)); return Math.hypot(r[0] - c.a[0] - u * dx, r[1] - c.a[1] - u * dy) }
const g = new Map(), rows = []
for (const a of D.at.filter(a => a.kept)) {
  const o = D.offNull.find(r => key(r.p) === key(a.p) && r.block === a.block) || D.offNull.find(r => key(r.p) === key(a.p))
  const cand = new Map(); for (const c of o.ops) if (dseg(c, o.p) <= TOLC && dseg(c, o.q) <= TOLC && !cand.has(c.oe)) cand.set(c.oe, c)
  const cs = [...cand.values()], own = cs.map(c => c.owner), sk = own.map(x => x?.split('|').slice(0, 2).join('|'))
  const grp = cs.length === 1 ? 'one ① edge' : cs.length > 2 ? `${cs.length} ① edges` : own[0] === own[1] ? 'same owner' : sk[0] === sk[1] ? 'same skelId·side, different segOrd (chain cut)' : 'different street or side (a meeting)'
  const turn = cs.length === 2 ? Math.abs(Math.atan2(cs[0].e[0] * cs[1].e[1] - cs[0].e[1] * cs[1].e[0], cs[0].e[0] * cs[1].e[0] + cs[0].e[1] * cs[1].e[1])) * 180 / Math.PI : null
  const r = g.get(grp) || g.set(grp, { n: 0, arc: 0, turns: [] }).get(grp); r.n++; if (a.arc != null) r.arc++; if (turn != null) r.turns.push(turn)
  rows.push({ grp, p: a.p, eL: o.eL, own, turn, arc: a.arc }); r.short = (r.short || 0) + (o.eL <= TOLC ? 1 : 0)
}
const q = (t, f) => { const b = [...t].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * f))].toFixed(2) : '—' }
for (const [k, r] of [...g].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${String(r.n).padStart(3)}  ${k} · ≤ TOLC exactly ${r.short} · on an ease arc ${r.arc} · ① turn p10 ${q(r.turns, .1)}° median ${q(r.turns, .5)}° p90 ${q(r.turns, .9)}° max ${q(r.turns, 1)}°`)
if (process.argv.includes('--rows')) for (const r of rows) console.log(`   ${r.grp.slice(0, 14).padEnd(14)} (${r.p.map(c => c.toFixed(3)).join(', ')}) ${(r.eL * 1000).toFixed(2)} mm · ${r.own.join(' / ')} · turn ${r.turn?.toFixed(2) ?? '—'}° · arc ${r.arc ?? '—'}`)
