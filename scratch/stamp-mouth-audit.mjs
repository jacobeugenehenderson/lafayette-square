// stamp-mouth-audit.mjs — does the STAMP already record the second mouth corner?
//
// The ring-derived test `cornerAt(a,b)` (a !== b) cannot see a doubled-back spur's
// second mouth pass (POLYGON-FIRST §2.1 Check 5). The question this probe answers:
// at each mouth the ring MISSES, does the node's corner registry (`corners.all`,
// written from the chains before the ring exists) record that corner anyway?
// A hit is a `sameChain` entry whose two sides match the ring's blind pass.
//
// Reuses scratch/coupler-fold-legs.mjs. Reads the frozen artifact only.
import { loadRibbons, foldLegs, mouthInfo, D } from './coupler-fold-legs.mjs'

const rib = loadRibbons()
const nodes = rib.junctionMap?.nodes || []
const nodeAt = (p) => nodes.find(n => D(n.at, p) < 0.05) || null

const folds = foldLegs(rib)
let missing = 0, coveredByAdjacent = 0
const rows = []

for (const f of folds) {
  const tile = rib.tiles[f.tileIdx]
  const mi = mouthInfo(f, tile)
  if (!mi) continue
  const blind = mi.corners.filter(c => !c.isCorner)
  if (!blind.length) continue
  missing++
  const mp = tile.ring[mi.mouthIdx]
  const n = nodeAt(mp)
  // the corner the ring cannot see: both bounds on the SAME chain
  const sameChain = (n?.corners?.all || []).filter(p => p.sameChain)
  // does one of them match the blind pass's (chain, side)?
  const hit = blind.some(c => {
    const [chain, inSide] = c.inc.split('/')
    const outSide = c.out.split('/')[1]
    return sameChain.some(p => p.a.chain === chain &&
      ((p.a.side === inSide && p.b.side === outSide) || (p.a.side === outSide && p.b.side === inSide)))
  })
  if (hit) coveredByAdjacent++
  rows.push({
    spur: `${f.skelId}[${f.capEnd}]`,
    blind: blind.map(c => `${c.inc} → ${c.out}`).join(' | '),
    node: n ? n.kinds.join('+') : 'NO NODE',
    registry: n?.corners?.all?.length ?? 0,
    sameChain: sameChain.length,
    covered: hit ? 'YES' : 'no',
  })
}

console.log(`folds: ${folds.length}   mouths missing a ring-visible corner: ${missing}`)
console.table(rows)
console.log(`\ncovered by the registry (sameChain corner): ${coveredByAdjacent} / ${missing}`)
