// ⛔⛔ THE BLOCK SILHOUETTE IS PAINTED A HARDCODED LU, SO ANY GAP IN THE FILL SHOWS AS THAT LU.
// `BlockGeometryV2Debug.jsx`: `sectionGeos.block` is "the frozen block silhouette, under the LU
// paint" and it is drawn with `tileLuFallback = tileLuMats.get('residential')` — a hardcoded class,
// not the tile's own. LS's `residential` is #5A8A3A, a green.
// ⇒ Wherever the FILL (parcel + treelawn + walk + curb) fails to cover the block, the operator sees
// RESIDENTIAL GREEN. On a residential block that is invisible. On a commercial block it is a green
// strip against tan — Jacob, 2026-09-07: "It is fixed for one color/LU but not the other."
// ⭐ THIS IS THE LAYER 0 SHAPE EXACTLY: the defect is silent on the commonest class and loud on the
// rare one, so a town that is mostly residential looks clean and town #2 may not be.
// ⛔ The gap is measured in m², per tile, against the tile's OWN block silhouette — never by eye.
// ▶ node checks/claims-the-block-underlay-never-shows.mjs [scene ...]
import { feed, buildProto } from './_proto-feed.mjs'
import { sectionPassProtoTile } from '../src/lib/tileGround.js'
import { differenceRings } from '../src/lib/buildBlockGeometryV2.js'

const SA = r => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i][0] * r[j][1] - r[j][0] * r[i][1] } return a / 2 }
const area = rs => (rs || []).reduce((s, r) => s + SA(r), 0)

for (const scene of (process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square', 'hipointe-demun'])) {
  const f = feed(scene); if (!f || f.curbWidth == null) continue
  const T = buildProto(f, { protoArtifact: true }).protoShapeTiles
  if (!T?.length) { console.log(`⛔ ${scene}: no protoShapeTiles — NOT measured`); continue }
  let gapTotal = 0, blockTotal = 0
  const byLu = new Map()
  const worst = []
  for (const [ti, t] of T.entries()) {
    const r = sectionPassProtoTile(t, f.curbWidth, { outer: 'LU', inner: 'SW' }, f.blockCustoms)
    const block = t.iA || []
    if (!block.length) continue
    const bA = area(block); if (bA <= 0) continue
    // ⛔ No union first — `differenceRings` takes the whole clip set, and unioning here would be a
    // second boolean whose failure mode (touching records) is the very thing that misreads as a gap.
    const painted = [
      ...(r.Wacc || []), ...(r.curb || []),
      ...Object.values(r.tlByLu || {}).flat(), ...Object.values(r.luByLu || {}).flat(),
    ]
    const gap = Math.max(0, area(differenceRings(block, painted)))
    const lu = t.lu || 'unknown'
    blockTotal += bA; gapTotal += gap
    const e = byLu.get(lu) || { n: 0, gap: 0, blk: 0 }
    e.n++; e.gap += gap; e.blk += bA; byLu.set(lu, e)
    if (gap > 1) worst.push({ ti, lu, gap: +gap.toFixed(1), pct: +(100 * gap / bA).toFixed(1) })
  }
  console.log(`\n=== ${scene} (look ${f.look}, ${f.slots} authored slots) ===`)
  console.log(`block area ${blockTotal.toFixed(0)} m² · UNPAINTED (shows the hardcoded 'residential' underlay) ${gapTotal.toFixed(0)} m²  ${(100 * gapTotal / blockTotal).toFixed(2)}%`)
  console.log(`⭐ the split that matters — the gap is INVISIBLE on 'residential' and VISIBLE on every other class:`)
  const rows = [...byLu.entries()].sort((a, b) => b[1].gap - a[1].gap)
  for (const [lu, e] of rows) {
    const vis = lu === 'residential' ? 'invisible (matches the underlay)' : '⛔ VISIBLE as green on this class'
    console.log(`   ${lu.padEnd(20)} tiles ${String(e.n).padStart(4)}  gap ${e.gap.toFixed(0).padStart(7)} m²  ${(100 * e.gap / e.blk).toFixed(2).padStart(6)}% of its block area   ${vis}`)
  }
  worst.sort((a, b) => b.gap - a.gap)
  console.log(`   worst tiles: ${worst.slice(0, 6).map(w => `#${w.ti} ${w.lu} ${w.gap}m² (${w.pct}%)`).join(' · ') || 'none'}`)
}
