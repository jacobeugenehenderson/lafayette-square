// align2.mjs <town> — the ① edges the disc cut shortened (neither a whole block edge nor the rim): the block edge that contains
// both of its ends (within 1 mm) must carry the owner it took.
import { readFileSync } from 'fs'
const town = process.argv[2], S = JSON.parse(readFileSync(`ring-new-${town}.json`, 'utf8')), fp = JSON.parse(readFileSync(process.env.RIB, 'utf8')).protopolygon
const key = (v) => v.join(','), whole = new Set(), segs = []
fp.blocks.forEach((r, k) => r.forEach((v, i) => { const w = r[(i + 1) % r.length]; whole.add(key(w) + '>' + key(v)); segs.push({ a: v, b: w, o: fp.owners[fp.blockLabels[k][i]] }) }))
const sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
const nm = (o) => o.water ? 'water' : o.kind || `${o.skelId}|${o.side}|${o.segOrd}`
let n = 0, ok = 0, bad = 0, amb = 0
for (const t of S.tiles) t.ring.forEach((v, i) => { const w = t.ring[(i + 1) % t.ring.length], o = t.ringOwner[i]; if (o.kind === 'rim' || whole.has(key(v) + '>' + key(w))) return
  n++; const c = new Set(segs.filter(s => sd(v, s.a, s.b) <= 1e-3 && sd(w, s.a, s.b) <= 1e-3).map(s => nm(s.o)))
  if (c.size !== 1) amb++; else if (c.has(nm(o))) ok++; else bad++ })
console.log(`${town}: shortened ① edges ${n}: owner matches its block edge ${ok}, differs ${bad}, no single containing block edge ${amb}`)
