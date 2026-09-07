#!/usr/bin/env node
// ⭐⭐⭐ ① HAS NO NODES — and nothing downstream may put them back.
// ▶ node scratch/claims-proto-has-no-nodes.mjs [scene]
//
// *(Jacob, 2026-09-07: "the ribbon is disrupted where nodes are, which means it's got nodes in
// there. Get Rid Of Them." · "Do you understand that the protopolygon doesn't have nodes?")*
//
// ① is minted from the chains and the chains are then WALLED OFF. A chain cut and a segOrd
// boundary are bookkeeping in the chain world; ①'s contour runs straight through them and the only
// thing that changes there is the LABEL. So a consumer that mints a CORNER wherever `skelId`
// changes has put the chain graph's nodes back into a construction built to have none — and the
// operator sees the ribbon disrupted at every junction. The continuous side of a T is exactly where
// the kit cuts a chain, which is why that is the class this defect always presents as.
//
// ⛔ WHAT THIS GATES, and it is structural — no rasterising, so it runs in seconds:
//   A · no curb arc is MINTED at a node (② must not round a straight street at a chain cut)
//   B · the ped ARRANGEMENT does not flip at a node (the walk must not swap curb-side ↔ set-back
//       where a road is merely cut — that is the join line the operator circled)
// ⭐ Both are counted against the ROAD, never the chain: `throughId ?? roadId ?? skelId`.
import { feed, buildProto } from './_proto-feed.mjs'
import { resolvePedDepths } from '../src/lib/tileGround.js'
const KP = p => `${p[0].toFixed(6)},${p[1].toFixed(6)}`
let bad = 0
for (const scene of (process.argv[2] ? [process.argv[2]] : ['lafayette-square', 'hipointe-demun'])) {
  const f = feed(scene); if (!f) { bad++; continue }
  const T = buildProto(f, { protoArtifact: true }).protoShapeTiles
  const k = {}, mintedAt = {}, flipAt = {}
  for (const t of T) for (let ri = 0; ri < t.iaFull.length; ri++) {
    const ring = t.iaFull[ri], stp = t.iaStamp[ri], m = ring.length
    for (let i = 0; i < m; i++) {
      const a = stp[(i - 1 + m) % m], b = stp[i]
      if (a == null || b == null || a === b) continue
      const A = t.runs[a], B = t.runs[b]
      const cls = A.skelId !== B.skelId
        ? (A.roadKey === B.roadKey ? 'NODE · same road, different chain' : 'corner · different roads')
        : A.side !== B.side ? 'cap fold · same chain, both sides'
        : 'NODE · same chain+side, different segOrd'
      k[cls] = (k[cls] || 0) + 1
      // A · was an arc MINTED here? (an apex ON this vertex — not merely spanned by a neighbour's)
      for (const fl of t.fillets || []) if (KP(fl.apex) === KP(ring[i])) { mintedAt[cls] = (mintedAt[cls] || 0) + 1; break }
      // B · does the ped arrangement flip across it?
      const arr = (r) => { const c = f.blockCustoms?.[r.skelId]?.[r.side]?.[r.segOrd] || null
        return resolvePedDepths(r.baseMeasure, r.side, c).hasTL }
      if (arr(A) !== arr(B)) flipAt[cls] = (flipAt[cls] || 0) + 1
    }
  }
  console.log(`\n══ ${scene} · ${T.length} tiles ══`)
  for (const [c, v] of Object.entries(k).sort((x, y) => y[1] - x[1]))
    console.log(`  ${String(v).padStart(4)} × ${c.padEnd(42)} arc minted ${String(mintedAt[c] || 0).padStart(3)} · ped flips ${String(flipAt[c] || 0).padStart(3)}`)
  for (const c of Object.keys(k)) {
    if (!c.startsWith('NODE')) continue
    if (mintedAt[c]) { console.log(`  ⛔ FAIL — ${mintedAt[c]} curb arc(s) MINTED at "${c}". ② is rounding a street ① runs straight through.`); bad++ }
    if (flipAt[c])   { console.log(`  ⛔ FAIL — the ped arrangement flips at ${flipAt[c]} × "${c}". The walk jumps a treelawn's depth where a road is merely cut — the operator's join line.`); bad++ }
  }
  // ⚠️ A cap fold is NOT a node and is NOT gated here: `SECTION §6.3` rules the bulb carries ONE
  // cross-section and goes whole to the cap owner. That is a REAL open item, not a passing case.
  const cf = k['cap fold · same chain, both sides'] || 0, cfF = flipAt['cap fold · same chain, both sides'] || 0
  if (cfF) console.log(`  ⚠️ OPEN, not gated: ${cfF} of ${cf} cap folds flip the arrangement — "legs meeting end caps" (\`SECTION §6.3\`, unbuilt).`)
}
console.log(bad ? `\n⛔ ${bad} FAILURE(S) — the chain graph's nodes are back in the drawing.`
                : `\n✅ PASS — no corner is minted at a node, and the ped does not step at one.`)
process.exit(bad ? 1 : 0)
