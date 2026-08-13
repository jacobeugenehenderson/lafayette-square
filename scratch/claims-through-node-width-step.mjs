// THE CHECK: at a THROUGH-NODE — a ring vertex where two consecutive runs carry
// the SAME `roadId` — the road must present ONE pavementHW to this tile.
// RIBBONS §3.3: "a through-road must carry one `pavementHW` per side (the width
// datum)". `cornerAt` reads the same roadId both sides and runs the offset
// STRAIGHT THROUGH, so a depth step there is a step the construction was told is
// not a corner: a notch in the curb polygon.
//
// ⭐ Why this generalises to a town nobody has looked at: the expected value is
// read out of the artifact's OWN per-run `measure[side].pavementHW` and its own
// `roadId` — never a constant, never a street name, never a human's knowledge of
// which corner looks wrong. An asymmetric street is the operator's authoring and
// PASSES; a CORNER (different roadId) changing width PASSES — that is the
// product. Only same-road-different-depth is reported.
//
//   node scratch/claims-through-node-width-step.mjs [scene|--all]
//
// Writes nothing. Exit 1 if any step exceeds TOL.
import fs from 'fs'
import crypto from 'crypto'

const TOL = 0.01                       // metres; below this is float noise
const arg = process.argv[2] || 'lafayette-square'
const scenes = arg === '--all'
  ? fs.readdirSync('public/baked').filter(s => fs.existsSync(`public/baked/${s}/shape.json`))
  : [arg]
const o = console.log

let bad = 0
for (const scene of scenes) {
  const SHAPE = `public/baked/${scene}/shape.json`
  const RAW = fs.readFileSync(SHAPE)
  const sh = JSON.parse(RAW)
  if (!Array.isArray(sh.tiles)) { o(`\n── ${scene}   NO TILES in shape.json — not a poured artifact`); continue }
  o(`\n── ${scene}   shape.json sha256 ${crypto.createHash('sha256').update(RAW).digest('hex').slice(0, 10)}   tiles ${sh.tiles.length}`)

  let through = 0, corners = 0, steps = []
  sh.tiles.forEach((t, ti) => {
    const runs = t.runs || []
    if (runs.length < 2) return
    for (let i = 0; i < runs.length; i++) {
      const a = runs[i], b = runs[(i + 1) % runs.length]
      // the seam vertex: a's poly end == b's poly start (ring order)
      const va = a.poly?.[a.poly.length - 1], vb = b.poly?.[0]
      if (!va || !vb) continue
      if (Math.hypot(va[0] - vb[0], va[1] - vb[1]) > 0.05) continue      // not adjacent in the ring
      const sameRoad = a.roadId && b.roadId && a.roadId === b.roadId
      if (!sameRoad) { corners++; continue }
      through++
      // ⛔ READ `baseMeasure`, NOT `measure` (Layer 0 q3). `measure` is
      // baseMeasure AFTER per-fe blockCustoms — and a per-fe width change at a
      // through-node is the operator's authoring gesture, the product, not a
      // defect. `baseMeasure` is what derive's name-aware reconciliation
      // (derive.js:2613) was supposed to have made uniform per road, per side.
      // Only a step in the BASE is a broken datum.
      const ha = a.baseMeasure?.[a.side]?.pavementHW
      const hb = b.baseMeasure?.[b.side]?.pavementHW
      if (!Number.isFinite(ha) || !Number.isFinite(hb)) continue
      const d = Math.abs(ha - hb)
      if (d <= TOL) continue
      // ⛔ SPLIT THE CLASS before calling anything a defect (Layer 0 q3).
      // Same skelId + side flip = the tile WRAPS that chain's terminus. It sees
      // both authored sides because it goes round the end; the cap constructor
      // owns that and the step is the operator's asymmetry. NOT a notch.
      const kind = (a.skelId === b.skelId && a.side !== b.side) ? 'cap-wrap'
        : (a.skelId !== b.skelId && a.side !== b.side) ? 'SEAM-FLIP'
        : 'SEAM-STEP'
      steps.push({ ti, at: va, kind, roadId: a.roadId, a: `${a.skelId}/${a.side}`, b: `${b.skelId}/${b.side}`, ha, hb, d })
    }
  })
  const real = steps.filter(s => s.kind !== 'cap-wrap')
  o(`through-nodes ${through}   corners ${corners}   cap-wraps(expected) ${steps.length - real.length}   WIDTH-STEPS AT CONTINUING THROUGH-NODES ${real.length}`)
  real.sort((x, y) => y.d - x.d)
  for (const s of real) {
    o(`  tile ${String(s.ti).padStart(3)}  ${s.kind}  Δ ${s.d.toFixed(4)} m  road ${s.roadId}`)
    o(`      ${s.a} hw ${s.ha.toFixed(4)}  →  ${s.b} hw ${s.hb.toFixed(4)}   at [${s.at[0].toFixed(2)}, ${s.at[1].toFixed(2)}]`)
  }
  bad += real.length
}
o(`\nTOTAL width-steps at continuing through-nodes: ${bad}`)
process.exit(bad ? 1 : 0)
