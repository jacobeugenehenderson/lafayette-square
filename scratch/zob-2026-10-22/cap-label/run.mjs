// What ② does at a ① cap edge: is the cap record's label on ANY ② vertex? where is ② near the tip? in the disc or out?
import { join } from 'path'
import { readFileSync } from 'fs'
const [W, S, RIB] = process.argv.slice(2); process.chdir(W)
const { feed, buildProto } = await import(join(W, 'scratch/_proto-feed.mjs'))
const { discOf } = await import(join(W, 'cartograph/boundaryRecords.mjs'))
const disc = discOf(JSON.parse(readFileSync(join(W, 'cartograph/data', S, 'neighborhood_boundary.json'), 'utf8')), 'zob probe')
const f = feed(S); f.ribbons = JSON.parse(readFileSync(RIB, 'utf8'))
const R = buildProto(f, { quiet: true })
const O = R.protoOwners, EC = globalThis.__ec || []
const emitted = new Set((R.protoShapeTiles || []).flatMap(t => (t.caps || []).map(c => `${c.skelId}|${c.capEnd}`)))
const onTwo = new Map(); EC.forEach((e, ei) => (e.labs || []).forEach((l, i) => { if (l != null) (onTwo.get(l) || onTwo.set(l, []).get(l)).push([ei, i]) }))
const capRecs = O.map((o, i) => ({ o, i })).filter(({ o }) => o?.cap)
const rows = capRecs.map(({ o, i }) => { const tip = o.tip, k = `${o.skelId}|${o.tipEnd}`
  let best = Infinity; for (const e of EC) for (const p of e.ring) { const d = Math.hypot(p[0] - tip[0], p[1] - tip[1]); if (d < best) best = d }
  return { k, i, emitted: emitted.has(k), inDisc: disc.inDisc(tip[0], tip[1]), onTwo: (onTwo.get(i) || []).length, near2: best } })
const tab = (f) => { const x = rows.filter(f); return `${x.length} (label on ②: ${x.filter(r => r.onTwo).length} · ② within 10 m of the tip: ${x.filter(r => r.near2 < 10).length} · none within 50 m: ${x.filter(r => !(r.near2 < 50)).length})` }
console.error(`${S}: ① cap records ${rows.length} · ② contours ${EC.length}`)
for (const [n, fn] of [['emitted, in disc', r => r.emitted && r.inDisc], ['emitted, out', r => r.emitted && !r.inDisc], ['LOST, in disc', r => !r.emitted && r.inDisc], ['LOST, out of disc', r => !r.emitted && !r.inDisc]]) console.error(`   ${n.padEnd(18)} ${tab(fn)}`)
for (const r of rows.filter(r => !r.emitted && r.inDisc).slice(0, 12)) console.error(`     lost in disc: ${r.k} · label on ② ${r.onTwo}× · nearest ② vertex ${r.near2.toFixed(2)} m`)
// ⭐ severed? the number of distinct ② contours within 8 m of the tip, and the gap from the tip to the nearest ① ink edge of
// ANOTHER owner key, or of its own owner more than 20 m back along the chain (its own body coming back)
const P1 = R.proto, L1 = R.protoLabels
const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], q = dx * dx + dz * dz, t = q ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / q)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
const chains = new Map([...(f.ribbons.streets || []), ...(f.ribbons.paths || []), ...(f.ribbons.alleys || [])].map(s => [s.skelId ?? s.name, (s.points || []).map(q => Array.isArray(q) ? q : [q.x, q.z])]))
for (const r of rows) { const o = O[r.i], tip = o.tip
  const near = new Set(); EC.forEach((e, ei) => { if (e.ring.some(p => Math.hypot(p[0] - tip[0], p[1] - tip[1]) < 8)) near.add(ei) }); r.contours = near.size
  let gap = Infinity; const own = chains.get(o.skelId) || []
  P1.forEach((rg, ri) => { for (let i = 0; i < rg.length; i++) { const q = O[L1[ri][i]]; if (!q) continue
    if (q.skelId === o.skelId) { const sp = own[q.srcIdx]; if (!sp || Math.hypot(sp[0] - tip[0], sp[1] - tip[1]) < 20) continue }
    const d = segD(tip, rg[i], rg[(i + 1) % rg.length]); if (d < gap) gap = d } })
  r.gap = gap }
const hist = (xs) => `contours near the tip: ${JSON.stringify(xs.reduce((m, r) => (m[r.contours] = (m[r.contours] || 0) + 1, m), {}))} · gap to other ink: min ${Math.min(...xs.map(r => r.gap)).toFixed(2)} m · median ${xs.map(r => r.gap).sort((a, b) => a - b)[xs.length >> 1]?.toFixed(2)} m`
console.error(`   emitted in disc: ${hist(rows.filter(r => r.emitted && r.inDisc))}`)
for (const r of rows.filter(r => !r.emitted && r.inDisc)) console.error(`   LOST in disc ${r.k}: contours near the tip ${r.contours} · gap to other ink ${r.gap.toFixed(2)} m`)
const show = (k) => { const r = rows.find(x => x.k === k); if (!r) return; const tip = O[r.i].tip
  console.error(`   ② at ${k} (cap record #${r.i}; legs: ${O.map((o, i) => ({ o, i })).filter(({ o }) => o?.skelId === O[r.i].skelId && o.srcIdx === O[r.i].srcIdx).map(({ o, i }) => '#' + i + ' ' + o.side + (o.cap ? ' CAP' : '')).join(', ')})`)
  EC.forEach((e, ei) => e.ring.forEach((p, vi) => { const d = Math.hypot(p[0] - tip[0], p[1] - tip[1]); if (d < 7) { const o = O[e.labs?.[vi]]; console.error(`      ② ${ei}:${vi} ${d.toFixed(2)} m · #${e.labs?.[vi]} ${o ? o.skelId + '|' + o.side + '|' + o.segOrd + ' src' + o.srcIdx + (o.tipEnd ? ' tip:' + o.tipEnd : '') + (o.cap ? ' CAP' : '') : ''}`) } })) }
for (const k of (process.env.SHOW || '').split(',').filter(Boolean)) show(k)
process.exit(0)
