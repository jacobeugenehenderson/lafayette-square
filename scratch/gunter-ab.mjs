// Gunter (D1): A/B audit — HEAD ribbons.json vs re-derived. Expect:
//  • all 44 inner-edge carriageways: inboard pavementHW → 0 (except authored
//    survivors), outer carries the width; phase.medianWidth → phase.chainGap
//  • every non-carriageway street identical except the phase rename
import { readFileSync } from 'fs'
const A = JSON.parse(readFileSync('scratch/gunter-ribbons-HEAD.json', 'utf8'))
const B = JSON.parse(readFileSync('src/data/ribbons.json', 'utf8'))
const bById = new Map(B.streets.map(s => [s.skelId, s]))
const inbKeyOf = s => s.innerSign === +1 ? 'right' : 'left'
const outKeyOf = s => inbKeyOf(s) === 'left' ? 'right' : 'left'

let cwRows = [], cleanInb = 0, survivors = [], otherDiffs = []
for (const sa of A.streets) {
  const sb = bById.get(sa.skelId)
  if (!sb) { otherDiffs.push('MISSING ' + sa.skelId); continue }
  const strip = s => {
    const { phase, measure, segmentMeasures, ...rest } = s
    const ph = phase ? { ...phase } : phase
    if (ph) { delete ph.medianWidth; delete ph.chainGap }
    return JSON.stringify({ ...rest, phase: ph })
  }
  const isCw = sb.anchor === 'inner-edge' && sb.innerSign
  if ((sa.phase?.medianWidth ?? null) !== (sb.phase?.chainGap ?? null)) otherDiffs.push('GAP-MISMATCH ' + sa.skelId)
  if (!isCw) {
    if (strip(sa) !== strip(sb) ||
        JSON.stringify(sa.measure) !== JSON.stringify(sb.measure) ||
        JSON.stringify(sa.segmentMeasures) !== JSON.stringify(sb.segmentMeasures)) {
      otherDiffs.push('NON-CARRIAGEWAY DIFF ' + sa.skelId)
    }
    continue
  }
  if (strip(sa) !== strip(sb)) otherDiffs.push('CW STRUCTURAL DIFF ' + sa.skelId)
  const inb = inbKeyOf(sb), out = outKeyOf(sb)
  const beforeInb = sa.measure?.[inb]?.pavementHW ?? null
  const beforeOut = sa.measure?.[out]?.pavementHW ?? null
  const afterInb = sb.measure?.[inb]?.pavementHW ?? null
  const afterOut = sb.measure?.[out]?.pavementHW ?? null
  if (afterInb === 0) cleanInb++
  else survivors.push(`${sb.skelId} inboard ${afterInb}`)
  cwRows.push(`${sb.skelId.padEnd(40)} ${(sb.phase?.role || '').padEnd(14)} inb ${String(beforeInb).slice(0, 6).padEnd(6)}→${String(afterInb).slice(0, 6).padEnd(6)}  out ${String(beforeOut).slice(0, 6).padEnd(6)}→${String(afterOut).slice(0, 6)}`)
}
console.log(cwRows.join('\n'))
console.log(`\ncarriageways: ${cwRows.length} | inboard now 0: ${cleanInb} | survivors: ${survivors.length}`)
for (const s of survivors) console.log('  ' + s)
console.log(`\nnon-carriageway/structural diffs: ${otherDiffs.length}`)
for (const d of otherDiffs) console.log('  ' + d)
