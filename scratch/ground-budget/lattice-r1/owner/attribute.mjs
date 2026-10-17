// attribute.mjs <town> — every changed tile between cap-ubefore-<town> and cap-uafter-<town>, clustered (15 m), named: NEW CORNER
// (an ease arc within 5 m that was not there) · LOST CORNER · RELABEL (edges within 5 m whose label the new rule changed, from
// cap-urelab-<town>, with old → new owner) · OTHER. The relabel records also say what the old rule saw (overlap, off-line).
import { readFileSync } from 'fs'
const T = process.argv[2], J = (x) => JSON.parse(readFileSync(`../cap-u${x}-${T}.json`, 'utf8'))
const A = J('before'), B = J('after'), RL = J('relab').relab
const bm = new Map(B.tiles.map(t => [t.ring0.join(','), t]))
const arcsNear = (D, c, r) => { const s = new Set(); for (const t of D.tiles) (t.iaFull || []).forEach((ring, ri) => ring.forEach((v, i) => { const a = t.iaArc?.[ri]?.[i]; if (a != null && Math.hypot(v[0] - c[0], v[1] - c[1]) <= r) s.add(t.ring0.join(',') + '#' + a) })); return s.size }
const out = []
for (const t of A.tiles) { const u = bm.get(t.ring0.join(',')); if (!u) { out.push({ kind: 'TILE GONE', at: t.ring0 }); continue }
  const sa = new Set(t.iaFull.flat().map(v => v.join(','))), sb = new Set(u.iaFull.flat().map(v => v.join(',')))
  const ia = new Set(t.iA.flat().map(v => v.join(','))), ib = new Set(u.iA.flat().map(v => v.join(',')))
  const ch = [...[...sa].filter(v => !sb.has(v)), ...[...sb].filter(v => !sa.has(v)), ...[...ia].filter(v => !ib.has(v)), ...[...ib].filter(v => !ia.has(v))].map(v => v.split(',').map(Number))
  const cl = []; for (const p of ch) { const c = cl.find(c => Math.hypot(c.c[0] - p[0], c.c[1] - p[1]) < 15); if (c) c.n++; else cl.push({ c: p, n: 1 }) }
  for (const { c, n } of cl) {
    const a0 = arcsNear(A, c, 5), a1 = arcsNear(B, c, 5)
    const rl = RL.filter(r => Math.hypot(r.p[0] - c[0], r.p[1] - c[1]) <= 5 || Math.hypot(r.q[0] - c[0], r.q[1] - c[1]) <= 5)
    // the tile's corner records (fillets): added, removed, or re-sized, nearest this cluster
    const fk = (f) => f.apex.map(x => x.toFixed(2)).join(','), fa = new Map((t.fillets || []).map(f => [fk(f), f])), fb = new Map((u.fillets || []).map(f => [fk(f), f]))
    const fch = [...[...fb].filter(([k]) => !fa.has(k)).map(([, f]) => ({ what: 'corner ADDED', f })), ...[...fa].filter(([k]) => !fb.has(k)).map(([, f]) => ({ what: 'corner REMOVED', f })),
      ...[...fa].filter(([k, f]) => fb.has(k) && Math.abs(fb.get(k).r - f.r) > 1e-6).map(([k, f]) => ({ what: `corner r ${f.r.toFixed(3)} → ${fb.get(k).r.toFixed(3)}`, f }))]
      .map(x => ({ ...x, d: Math.hypot(x.f.apex[0] - c[0], x.f.apex[1] - c[1]) })).filter(x => x.d <= 25).sort((x, y) => x.d - y.d)
    const kind = fch.some(x => x.what === 'corner ADDED') ? 'NEW CORNER' : fch.some(x => x.what === 'corner REMOVED') ? 'LOST CORNER' : fch.length ? 'CORNER RESIZED' : rl.length ? 'RELABEL' : 'OTHER'
    out.push({ kind, tile: t.ring0.map(x => x.toFixed(1)).join(','), at: c.map(x => x.toFixed(2)).join(', '), n, arcs: `${a0}→${a1}`, fch: fch.map(x => `${x.what} at (${x.f.apex.map(v => v.toFixed(2)).join(', ')}) ${x.d.toFixed(1)} m away`),
      rl: rl.map(r => `${r.oldOwner ?? 'null'} → ${r.newOwner ?? 'null'} (${(r.eL * 1000).toFixed(1)} mm${r.old != null ? `; old rule: overlap ${(r.oldOv * 1000).toFixed(3)} mm, off ${(r.oldOff * 1000).toFixed(3)} mm, kind ${r.oldKind}` : ''})`) }) } }
const tally = {}; for (const o of out) tally[o.kind] = (tally[o.kind] || 0) + 1
console.log(`${T}: ${out.length} changed site(s) · ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
for (const o of out) { console.log(`  ${o.kind.padEnd(11)} tile ${o.tile} at (${o.at}) · ${o.n} vertex change(s) · arcs within 5 m ${o.arcs}`); for (const x of o.fch) console.log(`      ⌒ ${x}`); for (const r of o.rl.slice(0, 4)) console.log(`      ${r}`); if (o.rl.length > 4) console.log(`      … ${o.rl.length - 4} more`) }
