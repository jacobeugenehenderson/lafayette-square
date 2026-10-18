import { readFileSync } from 'fs'
const town = process.argv[2], S = JSON.parse(readFileSync(`ring-new-${town}.json`, 'utf8')), fp = JSON.parse(readFileSync(process.env.RIB, 'utf8')).protopolygon
const key = (v) => v.join(','), edge = new Map(), nb = new Map()
fp.blocks.forEach((r, k) => r.forEach((v, i) => { const o = fp.owners[fp.blockLabels[k][i]]; edge.set(key(r[(i + 1) % r.length]) + '>' + key(v), { o, k, i }) }))
const nm = (o) => o.water ? 'water' : o.kind || `${o.skelId}|${o.side}|${o.segOrd}`
const cls = {}; let shown = 0
for (const t of S.tiles) { const n = t.ring.length; t.ring.forEach((v, i) => { const w = t.ring[(i + 1) % n], f = edge.get(key(v) + '>' + key(w)); if (!f) return
  const exp = nm(f.o), got = nm(t.ringOwner[i]); if (exp === got) return
  const prev = nm(t.ringOwner[(i - 1 + n) % n]), next = nm(t.ringOwner[(i + 1) % n])
  const e = got === 'rim' ? 'got rim' : got === prev || got === next ? 'neighbour edge owner' : exp.split('|')[0] === got.split('|')[0] ? (exp.split('|')[1] !== got.split('|')[1] ? 'same street, other side' : 'same street+side, other segOrd') : 'other street'
  cls[e] = (cls[e] || 0) + 1; if (shown++ < 4) console.log(`  e.g. exp ${exp} got ${got} prev ${prev} next ${next}`) }) }
console.log(town, JSON.stringify(cls))
