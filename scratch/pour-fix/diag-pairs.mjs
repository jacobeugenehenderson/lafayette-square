// Per-pair: the check's cell index against brute-force pairwise Clipper, on one town's committed evidence. Read-only.
import { readFileSync } from 'node:fs'
import { overlaps, brute } from '../../checks/claims-the-land-is-painted-by-its-evidence.mjs'
const ev = JSON.parse(readFileSync(`cartograph/data/${process.argv[2]}/clean/ribbons.json`, 'utf8')).landEvidence
const I = overlaps(ev), B = brute(ev, true)
const ia = new Map(I.pairs.map(p => [`${p.i},${p.j}`, p]))
const rows = [...B.byPair].map(([k, a]) => [k, a, ia.get(k)?.area ?? 0]).map(r => [...r, r[2] - r[1]]).sort((x, y) => Math.abs(y[3]) - Math.abs(x[3]))
console.log(`index ${I.total.toFixed(3)} · brute ${B.total.toFixed(3)} · pairs ${I.pairs.length} / ${B.pairs.size}`)
for (const [k, b, i, d] of rows.slice(0, 6)) { const [p, q] = k.split(',').map(Number); console.log(`  ${k}: brute ${b.toFixed(4)} · index ${i.toFixed(4)} · Δ ${d.toFixed(4)} · ${ev[p].src}:${ev[p].tag ?? ev[p].lu} (${ev[p].rings.length} rings) × ${ev[q].src}:${ev[q].tag ?? ev[q].lu} (${ev[q].rings.length} rings) · at ${ia.get(k)?.at}`) }
