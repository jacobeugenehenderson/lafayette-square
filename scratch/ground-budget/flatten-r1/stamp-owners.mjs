// stamp-owners.mjs — THE A10 GATE ON st⁺, which no existing gate can see (they read the freeze or the artifact, before
// `stampTile`). Runs tileGround's own `stampTile` on every tile of each town's frozen shape.json (pure, no bake) and
// asserts, per tile: (a) iaFull⁺ contains iaFull as an exact subsequence (nothing moved); (b) every sub-edge of an original
// edge q carries iaStamp[q] — ownership by length unchanged; (c) iaCorner's true count unchanged; (d) iA⁺ ⊇ iA (nothing
// lost); (e) the crossing pass settles. Prints insertions and the disjointness tally per town. Exit 1 on any breach.
//   node scratch/ground-budget/flatten-r1/stamp-owners.mjs [town …]
import { readFileSync, existsSync } from 'fs'
import { stampTile, stampTally } from '../../../src/lib/tileGround.js'
const ROOT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const towns = process.argv.slice(2).length ? process.argv.slice(2) : ['hipointedemun', 'huron', 'lafayette-square', 'provincetown']
let bad = 0
for (const town of towns) {
  const p = `${ROOT}/public/baked/${town}/shape.json`; if (!existsSync(p)) { console.log(`⛔ ${town}: no shape.json — NOT CHECKED`); bad++; continue }
  const T = JSON.parse(readFileSync(p, 'utf8')).tiles
  Object.assign(stampTally, { tiles: 0, pairs: 0, m2: 0, maxWidthMm: 0, at: [] })
  let tiles = 0, inserted = 0, insIA = 0, breach = [], threw = 0
  for (const [ti, st] of T.entries()) { if (!Array.isArray(st?.evidenceByPiece) || !st.iaFull?.length) continue; tiles++
    let s2; try { s2 = stampTile(st) } catch (e) { threw++; breach.push(`tile ${ti}: ${e.message.slice(0, 120)}`); continue }
    st.iaFull.forEach((r, ri) => { const r2 = s2.iaFull[ri], st0 = st.iaStamp?.[ri], st2 = s2.iaStamp?.[ri]
      let j = 0, q = -1; const sub = []
      for (let k = 0; k < r2.length; k++) { if (j < r.length && r2[k] === r[j]) { q = j; j++; sub.push(['orig', q]) } else sub.push(['ins', q]) }
      if (j !== r.length) breach.push(`tile ${ti} ring ${ri}: iaFull⁺ is not a supersequence of iaFull`)
      inserted += r2.length - r.length
      if (st0 && st2) sub.forEach(([kind, q0], k) => { const want = st0[(q0 + r.length) % r.length]; if (st2[k] !== want) breach.push(`tile ${ti} ring ${ri} vertex ${k} (${kind} on edge ${q0}): stamp ${st2[k]} ≠ ${want}`) })
      const c0 = (st.iaCorner?.[ri] || []).filter(Boolean).length, c2 = (s2.iaCorner?.[ri] || []).filter(Boolean).length
      if (c0 !== c2) breach.push(`tile ${ti} ring ${ri}: corners ${c0} → ${c2}`) })
    ;(st.iA || []).forEach((r, ri) => { const s = new Set(s2.iA[ri]); if (r.some(v => !s.has(v))) breach.push(`tile ${ti} iA ring ${ri}: a vertex was lost`); insIA += s2.iA[ri].length - r.length })
  }
  bad += breach.length
  console.log(`${town.padEnd(18)} stamped tiles ${tiles} · vertices inserted into iaFull ${inserted}, into iA ${insIA} · ${breach.length ? `⛔ ${breach.length} breach(es)` : 'owners, corners and contours intact'}${threw ? ` · ${threw} refused` : ''} · evidence overlaps between classes ${stampTally.pairs} pair(s) on ${stampTally.tiles} tile(s), ${stampTally.m2.toFixed(3)} m², widest ${stampTally.maxWidthMm.toFixed(1)} mm`)
  for (const b of breach.slice(0, 6)) console.log('    ' + b)
}
process.exit(bad ? 1 : 0)
