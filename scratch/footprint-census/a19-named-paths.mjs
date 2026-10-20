// READ-ONLY: what A19 ("class decides, not name") would change if applied to NAMED ways. Per town: named path-class chains on ①
// by class (service apart); the ① blocks each separates (a block pair with that chain between them would merge); authored
// blockCustoms keys on those chains (they must not orphan).   node scratch/footprint-census/a19-named-paths.mjs <town>
import fs from 'node:fs'
process.chdir('/Users/jacobhenderson/Desktop/lafayette-square.nosync')
const town = process.argv[2]
const R = JSON.parse(fs.readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')), fp = R.protopolygon
const idx = JSON.parse(fs.readFileSync('public/looks/index.json', 'utf8')), ls = (idx.looks || []).filter(l => l.scene === town), look = (ls.find(l => l.id === town) || ls[0])?.id
const design = look ? JSON.parse(fs.readFileSync(`public/looks/${look}/design.json`, 'utf8')) : {}, BC = design.blockCustoms || {}
const PATH = new Set(['footway', 'cycleway', 'path', 'steps', 'pedestrian', 'bridleway', 'track', 'corridor', 'elevator'])
const chains = new Map()   // skelId → { cls, name, blocks: Set }
for (const s of R.streets || []) { const base = String(s.highway || '').replace(/_link$/, ''); if (!s.name) continue
  if (PATH.has(base) || base === 'service') chains.set(s.skelId, { cls: base, name: s.name, blocks: new Set() }) }
;(fp.blockLabels || []).forEach((labs, k) => { for (const l of labs || []) { const o = fp.owners[l]; const c = o && chains.get(o.skelId); if (c) c.blocks.add(k) } })
const by = {}
for (const [id, c] of chains) { const k = c.cls === 'service' ? 'service (named)' : 'path-class (named)'; const b = (by[k] ||= { chains: 0, byCls: {}, sep: 0, pairs: 0, authored: 0, authoredKeys: [], ex: [] })
  b.chains++; b.byCls[c.cls] = (b.byCls[c.cls] || 0) + 1; if (c.blocks.size >= 2) { b.sep++; b.pairs += c.blocks.size - 1 }
  if (BC[id]) { b.authored++; if (b.authoredKeys.length < 6) b.authoredKeys.push(id) }
  if (b.ex.length < 5) b.ex.push(`${id} "${c.name}" (${c.blocks.size} block(s))`) }
console.log(`${town} (look ${look}): ① blocks ${fp.blocks.length}`)
for (const [k, b] of Object.entries(by)) console.log(`  ${k}: ${b.chains} chain(s) · ${Object.entries(b.byCls).map(([c, n]) => `${c} ${n}`).join(' · ')} · bounding ≥2 blocks ${b.sep} (≈${b.pairs} block merge(s) if dropped from ①) · with authored blockCustoms ${b.authored}${b.authoredKeys.length ? ` (${b.authoredKeys.join(', ')})` : ''} · e.g. ${b.ex.join(' · ')}`)
