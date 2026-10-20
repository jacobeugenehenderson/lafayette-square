// Classifier steps 3–6: per-chain diff of two map.json pours (before/after), every ribbons field + layer equality (Tally, 2026-10-20).
// ▶ node scratch/style-guide/classifier-ribbons-diff.mjs <before map.json> <after map.json>
import { readFileSync } from 'node:fs'
const [aP, bP] = process.argv.slice(2)
const A = JSON.parse(readFileSync(aP)), B = JSON.parse(readFileSync(bP))
const la = A.layers, lb = B.layers
console.log('layers:', Object.keys(lb).map(k => `${k}${JSON.stringify(la[k]) === JSON.stringify(lb[k]) ? '' : ' ≠'}`).join(' · '))
const ra = la.ribbons, rb = lb.ribbons
console.log('ribbons keys:', Object.keys(rb).map(k => `${k}${JSON.stringify(ra[k]) === JSON.stringify(rb[k]) ? '' : ' ≠'}`).join(' · '))
const byId = new Map(ra.streets.map(s => [s.skelId, s]))
const cause = new Map(), ex = new Map()
for (const s of rb.streets) {
  const o = byId.get(s.skelId)
  const { class: c, ...sb } = s, { type: t, ...sa } = o
  if (JSON.stringify(sa) === JSON.stringify(sb)) continue
  const d = []
  for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) if (JSON.stringify(sa[k]) !== JSON.stringify(sb[k])) {
    if (k === 'measure') for (const side of ['left', 'right']) for (const f of new Set([...Object.keys(sa.measure[side] || {}), ...Object.keys(sb.measure[side] || {})]))
      if (JSON.stringify(sa.measure[side]?.[f]) !== JSON.stringify(sb.measure[side]?.[f])) d.push(`${f} ${JSON.stringify(sa.measure[side]?.[f])}→${JSON.stringify(sb.measure[side]?.[f])}`)
    if (k !== 'measure') d.push(k)
  }
  const key = `${c}: ${[...new Set(d)].join(', ')}`
  cause.set(key, (cause.get(key) || 0) + 1); if (!ex.has(key)) ex.set(key, [])
  ex.get(key).push(s.skelId)
}
for (const [k, n] of [...cause].sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(3)}  ${k}   ${ex.get(k).slice(0, 4).join(' ')}`)
