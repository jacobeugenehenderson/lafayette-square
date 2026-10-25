// Splice probe: degree-2 chain cuts (the presence check's definition) grouped into joined strokes — sizes, cycles, mixed gs.
import { readFileSync } from 'node:fs'
const qk = (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`
for (const f of process.argv.slice(2)) {
  const S = JSON.parse(readFileSync(f, 'utf8')).streets.filter(s => s.points?.length >= 2), at = new Map()
  S.forEach((s, c) => { for (const e of ['start', 'end']) if (s.caps?.[e]?.degree === 2) { const k = qk(e === 'start' ? s.points[0] : s.points.at(-1)); if (!at.has(k)) at.set(k, []); at.get(k).push([c, e]) } })
  const par = S.map((_, i) => i), find = (i) => (par[i] === i ? i : (par[i] = find(par[i]))), deg = new Map()
  let cuts = 0, self = 0, odd = 0
  for (const L of at.values()) { if (L.length !== 2) { odd++; continue } if (L[0][0] === L[1][0]) { self++; continue } cuts++; par[find(L[0][0])] = find(L[1][0]); for (const [c] of L) deg.set(c, (deg.get(c) || 0) + 1) }
  const comp = new Map(); S.forEach((_, i) => { const r = find(i); if (!comp.has(r)) comp.set(r, []); comp.get(r).push(i) })
  const groups = [...comp.values()].filter(g => g.length > 1)
  const cyc = groups.filter(g => g.every(c => deg.get(c) === 2)), mixed = groups.filter(g => new Set(g.map(c => !!S[c].gradeSeparated)).size > 1)
  console.log(`${f.split('/').at(-3)}: ${cuts} cuts · ${self} self-joins · ${odd} degree-2 keys not exactly 2 ends · ${groups.length} joined strokes (max ${Math.max(...groups.map(g => g.length))} chains) · ${cyc.length} cycles · ${mixed.length} mix grade-separated`)
  for (const g of cyc.slice(0, 3)) console.log(`   cycle: ${g.map(c => S[c].skelId).join(' · ')}`)
}
