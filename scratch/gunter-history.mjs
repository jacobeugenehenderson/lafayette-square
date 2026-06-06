// Gunter (D1): trace lafayette-avenue-6 innerSign / point order / measure across ribbons.json history
import { execSync } from 'child_process'
const commits = process.argv.slice(2)
for (const c of commits) {
  let raw
  try { raw = execSync(`git show ${c}:src/data/ribbons.json`, { maxBuffer: 1e9 }).toString() } catch { console.log(c, 'no file'); continue }
  let r
  try { r = JSON.parse(raw) } catch { console.log(c, 'unparsable'); continue }
  const s = (r.streets || []).find(x => x.skelId === 'lafayette-avenue-6')
  if (!s) { console.log(c, 'lafayette-avenue-6 not present'); continue }
  const pt = p => Array.isArray(p) ? p : [p.x, p.z]
  const p0 = pt(s.points[0]), pN = pt(s.points[s.points.length - 1])
  console.log(c,
    'innerSign=' + s.innerSign,
    'anchor=' + s.anchor,
    `first=[${p0[0].toFixed(0)},${p0[1].toFixed(0)}] last=[${pN[0].toFixed(0)},${pN[1].toFixed(0)}]`,
    'Lpav=' + (s.measure?.left?.pavementHW?.toFixed?.(2) ?? '—'),
    'Rpav=' + (s.measure?.right?.pavementHW?.toFixed?.(2) ?? '—'))
}
