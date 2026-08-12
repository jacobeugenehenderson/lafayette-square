// tipcoupler — prove the change ADDED records at degree-1 tips and touched NOTHING else.
// Compares two fresh map.json runs node-for-node and tile-for-tile.
// Usage: node scratch/tipcoupler-diff.mjs <before.json> <after.json>
import fs from 'node:fs'; import crypto from 'node:crypto'
const [A, B] = process.argv.slice(2)
const load = f => JSON.parse(fs.readFileSync(f, 'utf8')).layers.ribbons
const a = load(A), b = load(B)
const h = o => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 12)
const vKey = p => p[0].toFixed(3) + ',' + p[1].toFixed(3)

// Geometric degree from the AFTER run's curbed chains (tileGround.js:2787 definition).
const deg = new Map()
for (const s of (b.streets || [])) {
  if (!s?.points?.length || s.gradeSeparated || s.disabled) continue
  const p = s.points
  for (let i = 0; i < p.length; i++) { const k = vKey(p[i]); deg.set(k, (deg.get(k) || 0) + ((i === 0 || i === p.length - 1) ? 1 : 2)) }
}
const degOf = n => deg.has(vKey(n.at)) ? deg.get(vKey(n.at)) : 'UNLOCATABLE'

const mapBy = ns => new Map(ns.map(n => [n.key, n]))
const NA = mapBy(a.junctionMap.nodes), NB = mapBy(b.junctionMap.nodes)
console.log(`nodes: ${NA.size} → ${NB.size}`)
const added = [...NB.keys()].filter(k => !NA.has(k)), removed = [...NA.keys()].filter(k => !NB.has(k))
console.log(`  nodes added ${added.length}, removed ${removed.length}`)

// Per-node hash before/after, bucketed by degree.
const buckets = {}
for (const [k, nb] of NB) {
  const na = NA.get(k); if (!na) continue
  const d = degOf(nb)
  const t = buckets[d] || (buckets[d] = { n: 0, changed: 0, gainedCA: 0, otherFieldChanged: 0 })
  t.n++
  if (h(na) === h(nb)) continue
  t.changed++
  const sa = { ...na }, sb = { ...nb }; delete sa.cornersAdjacent; delete sb.cornersAdjacent
  if (h(sa) !== h(sb)) t.otherFieldChanged++
  if (!(na.cornersAdjacent || []).length && (nb.cornersAdjacent || []).length) t.gainedCA++
}
console.log('\ngeoDeg        nodes  changed  gained cornersAdjacent  CHANGED IN ANY OTHER FIELD')
for (const d of Object.keys(buckets).sort((x, y) => (x === 'UNLOCATABLE') - (y === 'UNLOCATABLE') || x - y)) {
  const t = buckets[d]
  console.log(`${String(d).padStart(11)} ${String(t.n).padStart(7)} ${String(t.changed).padStart(8)} ${String(t.gainedCA).padStart(22)} ${String(t.otherFieldChanged).padStart(26)}`)
}

// Everything else in the ribbons layer, byte-for-byte.
console.log('\nribbons layer, key by key (sha256/12):')
const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
for (const k of keys) {
  const ha = h(a[k] ?? null), hb = h(b[k] ?? null)
  console.log(`  ${ha === hb ? 'SAME  ' : 'DIFF ⛔'} ${k}${Array.isArray(a[k]) ? ` [${a[k].length}]` : ''}`)
}
// junctionMap minus cornersAdjacent must be byte-identical.
const strip = jm => ({ ...jm, nodes: jm.nodes.map(n => { const c = { ...n }; delete c.cornersAdjacent; return c }) })
console.log(`\njunctionMap with cornersAdjacent STRIPPED: ${h(strip(a.junctionMap)) === h(strip(b.junctionMap)) ? 'BYTE-IDENTICAL ✅' : 'DIFFERS ⛔'}`)
