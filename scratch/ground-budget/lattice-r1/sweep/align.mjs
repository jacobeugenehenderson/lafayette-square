// align.mjs <town> — is ringOwner on the right edge? (1) an edge whose two ends are one frozen ① block ring's consecutive
// vertices must carry that block edge's owner; (2) a 'rim' edge must lie on the boundary ring, and no other edge may.
import { readFileSync } from 'fs'
const town = process.argv[2], S = JSON.parse(readFileSync(`ring-new-${town}.json`, 'utf8'))
const fp = JSON.parse(readFileSync(`/Users/jacobhenderson/Desktop/lafayette-square.nosync/public/${town === 'lafayette-square' ? '' : ''}`.length ? process.env.RIB : '', 'utf8')).protopolygon
const key = (v) => v.join(','), edge = new Map()
fp.blocks.forEach((r, k) => r.forEach((v, i) => edge.set(key(v) + '>' + key(r[(i + 1) % r.length]), fp.owners[fp.blockLabels[k][i]])))
const B = fp.boundaryRing, sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
const onB = (p) => B.some((a, i) => sd(p, a, B[(i + 1) % B.length]) <= 1e-3)
const dir = { fwd: 0, rev: 0 }; let m = 0, ok = 0, bad = 0, rimOn = 0, rimOff = 0, otherOn = 0
for (const t of S.tiles) t.ring.forEach((v, i) => { const w = t.ring[(i + 1) % t.ring.length], o = t.ringOwner[i], mid = [(v[0] + w[0]) / 2, (v[1] + w[1]) / 2]
  const fwd = edge.get(key(v) + '>' + key(w)), rev = edge.get(key(w) + '>' + key(v)), fo = fwd || rev; if (fo) { dir[fwd ? 'fwd' : 'rev']++ }; if (fo) { m++; const exp = fo.water ? 'water' : fo.skelId === '__boundary__' ? 'rim' : `${fo.skelId}|${fo.side}|${fo.segOrd}`, got = o.kind || `${o.skelId}|${o.side}|${o.segOrd}`; exp === got ? ok++ : bad++ }
  if (o.kind === 'rim') onB(mid) ? rimOn++ : rimOff++; else if (onB(mid) && onB(v) && onB(w)) otherOn++ })
console.log(`${town}: edges that are a frozen block edge ${m}: owner matches ${ok}, differs ${bad} · rim edges on the boundary ${rimOn}, off it ${rimOff} · non-rim edges lying on the boundary ${otherOn} · matched forward ${dir.fwd}, reversed ${dir.rev}`)
