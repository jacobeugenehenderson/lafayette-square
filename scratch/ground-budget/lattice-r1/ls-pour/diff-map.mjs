// diff-map.mjs <a/map.json> <b/map.json> [out.json] — where two pours of one town differ. Read-only on both inputs.
// Per top-level key and per layer (and per ribbons sub-layer): count, and items matched by their canonical JSON — so a
// reordered layer reads as equal, and a changed item counts once as gone and once as new. Prints the first differing
// items' id/name/kind and bbox centre; the full lists go to out.json. Exits 0 either way (a report, not a check).
import { readFileSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
const [pa, pb, out] = process.argv.slice(2)
const A = JSON.parse(readFileSync(pa, 'utf8')), B = JSON.parse(readFileSync(pb, 'utf8'))
const h = (v) => v === undefined ? '(absent)' : createHash('sha1').update(JSON.stringify(v)).digest('hex')
const label = (it) => {
  if (!it || typeof it !== 'object') return String(it).slice(0, 60)
  const id = it.id ?? it.skelId ?? it.projectId ?? it.name ?? it.tags?.name ?? it.kind ?? it.type ?? ''
  const pts = []; const walk = (v, d = 0) => { if (pts.length > 4000 || d > 6) return; if (Array.isArray(v)) { if (v.length === 2 && typeof v[0] === 'number') pts.push(v); else v.forEach(x => walk(x, d + 1)) } else if (v && typeof v === 'object') { if (typeof v.x === 'number' && typeof v.z === 'number') pts.push([v.x, v.z]); else Object.values(v).forEach(x => walk(x, d + 1)) } }
  walk(it); const c = pts.length ? pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]).map(x => x.toFixed(1)) : null
  return `${id}${c ? ` @(${c.join(', ')})` : ''}`
}
const rows = [], full = {}
const cmpList = (name, a = [], b = []) => {
  const ha = a.map(h), hb = b.map(h), cb = new Map(), ca = new Map()
  hb.forEach(x => cb.set(x, (cb.get(x) || 0) + 1)); ha.forEach(x => ca.set(x, (ca.get(x) || 0) + 1))
  const gone = [], fresh = []
  ha.forEach((x, i) => { if (cb.get(x)) cb.set(x, cb.get(x) - 1); else gone.push(i) })
  hb.forEach((x, i) => { if (ca.get(x)) ca.set(x, ca.get(x) - 1); else fresh.push(i) })
  rows.push({ name, a: a.length, b: b.length, gone: gone.length, fresh: fresh.length, order: !gone.length && !fresh.length && ha.join() !== hb.join() })
  if (gone.length || fresh.length) full[name] = { gone: gone.map(i => ({ i, label: label(a[i]) })), fresh: fresh.map(i => ({ i, label: label(b[i]) })) }
}
for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
  if (k === 'layers') continue
  if (Array.isArray(A[k]) || Array.isArray(B[k])) cmpList(k, A[k], B[k])
  else if (h(A[k]) !== h(B[k])) {
    const ka = A[k] && typeof A[k] === 'object' ? A[k] : {}, kb = B[k] && typeof B[k] === 'object' ? B[k] : {}
    const sub = [...new Set([...Object.keys(ka), ...Object.keys(kb)])].filter(s => h(ka[s]) !== h(kb[s]))
    rows.push({ name: k, scalar: true, keys: sub.length ? sub : ['(value)'] }); full[k] = Object.fromEntries((sub.length ? sub : ['(value)']).map(s => [s, s === '(value)' ? [A[k], B[k]] : [ka[s], kb[s]]]))
  }
}
const LA = A.layers || {}, LB = B.layers || {}
for (const k of [...new Set([...Object.keys(LA), ...Object.keys(LB)])].sort()) {
  const a = LA[k], b = LB[k]
  if (Array.isArray(a) || Array.isArray(b)) cmpList(`layers.${k}`, a, b)
  else if (a && typeof a === 'object' || b && typeof b === 'object') {
    for (const s of [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].sort()) {
      const x = a?.[s], y = b?.[s]
      if (Array.isArray(x) || Array.isArray(y)) cmpList(`layers.${k}.${s}`, x, y)
      else if (h(x) !== h(y)) { rows.push({ name: `layers.${k}.${s}`, scalar: true, keys: ['(value)'] }); full[`layers.${k}.${s}`] = [x, y] }
    }
  } else if (h(a) !== h(b)) { rows.push({ name: `layers.${k}`, scalar: true, keys: ['(value)'] }); full[`layers.${k}`] = [a, b] }
}
console.log(`A ${pa}\nB ${pb}`)
const diff = rows.filter(r => r.scalar || r.gone || r.fresh || r.order)
console.log(`${rows.filter(r => !r.scalar).length} lists compared · ${diff.length} differ`)
for (const r of diff) {
  if (r.scalar) { console.log(`  ${r.name}: differs in ${r.keys.slice(0, 12).join(', ')}${r.keys.length > 12 ? ` …+${r.keys.length - 12}` : ''}`); continue }
  console.log(`  ${r.name}: ${r.a} → ${r.b} · ${r.gone} only in A · ${r.fresh} only in B${r.order ? ' · same items, other order' : ''}`)
  const f = full[r.name]; if (!f) continue
  for (const g of f.gone.slice(0, 3)) console.log(`      A only #${g.i} ${g.label}`)
  for (const g of f.fresh.slice(0, 3)) console.log(`      B only #${g.i} ${g.label}`)
}
if (out) { writeFileSync(out, JSON.stringify({ rows, full }, null, 1)); console.log(`full lists → ${out}`) }
