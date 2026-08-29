// A17's one gated measurement: does a duplicate vertex at an IX change the segOrd partition?
// Builds the partition for every duplicate-carrying chain WITH and WITHOUT the duplicate and
// diffs the slot→span mapping. If the ordinals do not move, the lead is dead and gets struck.
import { readFileSync } from 'node:fs'
import { resolveChainSegmentation } from '../src/lib/buildBlockGeometryV2.js'

const ribbons = JSON.parse(readFileSync('src/data/ribbons.json', 'utf8'))
const streets = ribbons.streets.filter(s => s.points?.length >= 2)

// naturalSegments, verbatim from buildBlockGeometryV2.js:660 (the partition under test)
function naturalSegments(street, ixSet) {
  const n = (street.points || []).length
  if (n < 2) return []
  const ixs = [...ixSet].filter(i => Number.isInteger(i) && i > 0 && i < n - 1).sort((a, b) => a - b)
  if (!ixs.length) return [{ start: 0, end: n - 1 }]
  const segs = []
  let prev = 0
  for (const ix of ixs) { if (ix > prev) segs.push({ start: prev, end: ix }); prev = ix }
  if (prev < n - 1) segs.push({ start: prev, end: n - 1 })
  return segs
}
const dupIdxs = (s) => {
  const out = []
  for (let i = 1; i < s.points.length; i++) {
    const [ax, az] = s.points[i - 1], [bx, bz] = s.points[i]
    if (Math.hypot(bx - ax, bz - az) < 1e-6) out.push(i)
  }
  return out
}
const spanStr = (s, seg) => {
  const a = s.points[seg.start], b = s.points[seg.end]
  return `(${a[0].toFixed(1)},${a[1].toFixed(1)})→(${b[0].toFixed(1)},${b[1].toFixed(1)})`
}
const len = (s, seg) => {
  let d = 0
  for (let i = seg.start; i < seg.end; i++) d += Math.hypot(s.points[i+1][0]-s.points[i][0], s.points[i+1][1]-s.points[i][1])
  return d
}

const withDup = resolveChainSegmentation(streets)
// The counterfactual: the same corpus with each duplicate vertex removed.
const cleaned = streets.map(s => {
  const d = new Set(dupIdxs(s))
  return d.size ? { ...s, points: s.points.filter((_, i) => !d.has(i)) } : s
})
const noDup = resolveChainSegmentation(cleaned)

const AUTHORED = new Set(['park-avenue-1', 'mississippi-avenue', 'south-18th-street-3', 'south-jefferson-avenue-3'])
let moved = 0, chains = 0, zeroLen = 0, bothInIx = 0
for (let i = 0; i < streets.length; i++) {
  const s = streets[i], d = dupIdxs(s)
  if (!d.length) continue
  chains++
  const ixA = withDup.get(s), ixB = noDup.get(cleaned[i])
  // (a) THE UNMEASURED HALF: does the resolver return BOTH indices of the duplicated point?
  const both = d.filter(j => ixA.has(j) && ixA.has(j - 1))
  if (both.length) bothInIx++
  const segsA = naturalSegments(s, ixA)
  const segsB = naturalSegments(cleaned[i], ixB)
  const zl = segsA.filter(g => len(s, g) < 1e-6)
  zeroLen += zl.length
  const changed = segsA.length !== segsB.length
  if (changed) moved++
  const tag = AUTHORED.has(String(s.skelId ?? s.key ?? s.name ?? s.id)) ? ' ⭐AUTHORED' : ''
  console.log(`${(changed ? '⛔' : '  ')} ${String(s.skelId ?? s.key ?? s.name ?? s.id).padEnd(26)}${tag}`)
  console.log(`     dup at point idx ${d.join(',')}   IX set holds BOTH indices: ${both.length ? 'YES ⛔' : 'no'}`)
  console.log(`     segOrds  with dup: ${segsA.length}   without: ${segsB.length}   zero-length spans: ${zl.length}`)
  if (changed) {
    const n = Math.max(segsA.length, segsB.length)
    for (let k = 0; k < n; k++) {
      const a = segsA[k], b = segsB[k]
      const same = a && b && a.start === b.start && a.end === b.end
      if (!same) console.log(`       segOrd ${k}: with=${a ? spanStr(s, a) : '—'}  without=${b ? spanStr(cleaned[i], b) : '—'}`)
    }
  }
}
console.log(`\n${chains} duplicate-carrying chains · ${bothInIx} where the resolver returns BOTH indices`
  + ` · ${zeroLen} zero-length spans minted · ${moved} chains whose segOrd partition MOVES`)
console.log(moved ? '⛔ THE ORDINALS MOVE — the lead survives.' : '✅ the ordinals do NOT move — strike the lead.')
