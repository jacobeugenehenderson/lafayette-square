// Splice probe: the ① block face containing a point, in two ribbons files: vertex count, area, holes, and its ring's
// owners in order (run-length), side by side.   node scratch/splice/blockat.mjs <a.json> <b.json> x,z
import { readFileSync } from 'node:fs'
const [fa, fb, at] = process.argv.slice(2), q = at.split(',').map(Number)
const inRing = (rg, x, y) => { let c = false; for (let i = 0, j = rg.length - 1; i < rg.length; j = i++) { const [a, b] = rg[i], [e, d] = rg[j]; if ((b > y) !== (d > y) && x < (e - a) * (y - b) / (d - b) + a) c = !c } return c }
const area = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1] } return s / 2 }
for (const f of [fa, fb]) { const P = JSON.parse(readFileSync(f, 'utf8')).protopolygon
  const hits = P.blocks.map((r, k) => k).filter(k => inRing(P.blocks[k], q[0], q[1]) && !(P.blockHoles?.[k] || []).some(h => inRing(h, q[0], q[1])))
  for (const k of hits) { const r = P.blocks[k], L = P.blockLabels[k], runs = []
    for (let i = 0; i < r.length; i++) { const o = P.owners[L[i]], key = `${o?.skelId}|${o?.side}|${o?.segOrd}`; if (runs.length && runs[runs.length - 1][0] === key) runs[runs.length - 1][1]++; else runs.push([key, 1]) }
    let minE = Infinity; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; minE = Math.min(minE, Math.hypot(b[0] - a[0], b[1] - a[1])) }
    console.log(`${f.split('/').slice(-2).join('/')}: block ${k} · ${r.length} vertices · area ${Math.abs(area(r)).toFixed(1)} m² · ${(P.blockHoles?.[k] || []).length} holes · shortest edge ${(minE * 1000).toFixed(2)} mm\n   ${runs.map(([k, n]) => `${k}×${n}`).join(' → ')}`) }
  if (!hits.length) console.log(`${f}: no block contains (${q})`) }
