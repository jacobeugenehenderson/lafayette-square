// coupler-slit-anatomy.mjs — TRUNK PORT (2026-07-30). The C0 evidence, one ring.
//
// THE MISSING PIECE IS THE CORNER (`POLYGON-FIRST §2.1` Check 5). A corner is built
// where TWO DIFFERENT streets meet — `cornerAt(a,b)` is a real corner iff `a !== b`
// (`RIBBONS §1`). The doubled-back ring visits a dead-end spur's MOUTH vertex twice:
// the first pass is cross-street → spur (a corner), the second is spur → spur (not
// one). So one leg is bounded corner-to-corner and the other runs through unbounded.
//
// This dumps the ring, both mouth passes and the corner verdict for a named chain,
// straight off the FROZEN artifact — no Slice-1 fields, so it runs on trunk.
//   node scratch/coupler-slit-anatomy.mjs [skelId ...]     (default: the C0 case)
import { foldLegs, tipGap, mouthInfo, loadRibbons, D, EPS } from './coupler-fold-legs.mjs'

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['south-18th-street-3', 'dolman-street-0']
const ribbons = loadRibbons()
const tiles = ribbons.tiles || []
const folds = foldLegs(ribbons)
const P = (p) => `(${p[0].toFixed(2)}, ${p[1].toFixed(2)})`

for (const target of targets) {
  const mine = folds.filter(f => f.skelId === target)
  if (!mine.length) { console.log(`\n════ ${target}: no dead-end cap on this chain (not a spur, or not in ribbons.tiles)`); continue }
  for (const f of mine) {
    const tile = tiles[f.tileIdx], ring = f.ring, N = ring.length
    console.log(`\n════ ${target}  tile#${f.tileIdx}  cap.vertexIdx=${f.vertexIdx} capEnd=${f.capEnd}  ringN=${N}`)
    console.log(`     tip gap (the flanking vertices): ${tipGap(f).toFixed(4)} m  ⇒ ${tipGap(f) < EPS ? '⛔ ZERO-WIDTH SLIT' : 'has width'}`)
    for (const l of f.legs) {
      console.log(`     leg branch=${l.branch} side=${l.side} span[${l.ringI0}..${(l.ringI0 + l.ringLen) % l.ringN}] len=${l.ringLen}`)
    }

    // the ring around the tip, with each vertex's incoming/outgoing chain
    console.log(`\n     ── ring vertices (chain on each edge) ──`)
    for (let i = 0; i < N; i++) {
      const inc = tile.edges[(i - 1 + N) % N], out = tile.edges[i]
      const dup = ring.findIndex((p, j) => j !== i && D(p, ring[i]) < 1e-6)
      const mark = i === f.vertexIdx ? '  ← THE TIP' : dup >= 0 ? `  ← duplicate of ring[${dup}]` : ''
      console.log(`     ring[${String(i).padStart(2)}] ${P(ring[i])}   in=${inc.skelId}/${inc.side}  out=${out.skelId}/${out.side}${mark}`)
    }

    // ⭐ THE CORNER TEST at every occurrence of the MOUTH vertex (see mouthInfo).
    const m = mouthInfo(f, tile)
    console.log(`\n     ── \u2b50 the corner test at the MOUTH (cornerAt(a,b) \u21d2 corner iff a !== b) ──`)
    for (const c of m.corners) {
      console.log(`     ring[${c.idx}] ${P(ring[c.idx])}   ${c.inc} \u2192 ${c.out}   ${c.isCorner ? '\u2705 CORNER — different streets' : '\u26d4 NO CORNER — same street both sides'}`)
    }
    console.log(`\n     mouth passes: ${m.passes.length}${m.passes.length > 1 ? ' (bit-identical coordinate — the ring visits the mouth twice)' : ''}`)
    console.log(`     CORNERS BUILT AT THE MOUTH: ${m.built} of ${m.passes.length}   \u21d2 ${m.built < m.passes.length ? '\u26d4 one leg bounded, one UNBOUNDED — THE DEFECT' : '\u2705 both legs bounded'}`)
    for (const l of m.runThrough) {
      console.log(`     \u26d4 leg branch=${l.branch} side=${l.side} span[${l.ringI0}..${(l.ringI0 + l.ringLen) % l.ringN}] does NOT stop at the mouth — no corner there to bound it, so it runs through to ring[${[l.ringI0, (l.ringI0 + l.ringLen) % l.ringN].find(i => i !== f.vertexIdx && !m.passes.includes(i))}]`)
    }
  }
}

// The class-wide count: how many spurs present a corner at EVERY mouth pass? (Check 5)
let both = 0, missing = 0, through = 0
for (const f of folds) {
  const m = mouthInfo(f, tiles[f.tileIdx])
  if (!m) continue
  if (m.built >= m.passes.length && m.passes.length > 1) both++; else missing++
  if (m.runThrough.length) through++
}
console.log(`\n── Check 5 across the map — every dead-end spur should present TWO mouth corners ──`)
console.log(`spurs with a corner at EVERY mouth pass:      ${both} / ${folds.length}`)
console.log(`spurs MISSING at least one mouth corner:       ${missing} / ${folds.length}   \u26d4 target 0`)
console.log(`spurs with a leg running THROUGH the mouth:    ${through} / ${folds.length}   \u26d4 target 0 (the unbounded leg)`)
