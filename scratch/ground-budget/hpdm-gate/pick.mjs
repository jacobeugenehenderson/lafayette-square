// pick.mjs <walls-all.txt> <group> [n=5] — the n worst wall sites of a group, at least 5 m apart (walls-dist.mjs --show output)
import { readFileSync } from 'fs'
const [f, grp, n = 5] = process.argv.slice(2), out = []
for (const l of readFileSync(f, 'utf8').trim().split('\n')) { if (!l.trim().startsWith(grp + ' at')) continue
  const m = l.match(/at \((-?[\d.]+), (-?[\d.]+)\): rises ([\d.]+) m more than its terrain across ([\d.]+) m/), p = [+m[1], +m[2]]
  if (out.some(o => Math.hypot(o.p[0] - p[0], o.p[1] - p[1]) < 5)) continue
  out.push({ p, ex: +m[3], span: +m[4] }); if (out.length == +n) break }
for (const o of out) console.log(`${o.p[0]},${o.p[1]} ex ${o.ex} span ${o.span}`)
