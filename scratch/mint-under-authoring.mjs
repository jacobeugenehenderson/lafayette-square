#!/usr/bin/env node
/**
 * DOES THE MINT SET MOVE WHEN THE OPERATOR AUTHORS A WIDTH?
 *
 * The A10-③ stamp refuses a tile when `unionRings([W])` mints a vertex with no
 * source (`offset:clipper-minted-vertex`). W is built from the AUTHORED half-width
 * (`buildCurbRings.depthAt` → `authoredHW` → `blockCustoms[skelId][side][segOrd]
 * .pavementHW`), so whether W self-intersects is a property of a TILE AT AN
 * AUTHORING STATE, not of the tile. The 193-tile census was genuine default.
 *
 * WHY IT MATTERS. A cure that paints from the partition where stamped and
 * re-strokes where not would let a width drag silently flip a block between two
 * painting paths — and under SURVEY §4.1 (activate blocks, drag a strip) the drag
 * is the primary gesture, not an edge case.
 *
 * ⛔ MEASUREMENT ONLY. Live source untouched, nothing re-poured, nothing re-baked.
 *
 * THE TRAP THIS AVOIDS, named because it invalidated the first attempt: LS's live
 * `design.json` carries ZERO `blockCustoms`, so a probe's "authored" and "defaults"
 * runs for LS are THE SAME INPUT TWICE. Identical refusal counts there are not
 * evidence of stability — they are evidence of nothing. Every pair below is
 * SAME-BAKE, TWO GENUINELY DIFFERENT AUTHORING STATES, and each one carries a
 * control proving the curb actually moved.
 *
 * Usage:  node scratch/mint-under-authoring.mjs
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))

const OPTS = {
  stencil: null, curbWidth: 0.15, smooth: 0, blockLandUse: null,
  cornerRadiusScale: 1, cornerRadiusOverrides: null, cornerCornerRadiusOverrides: null,
  emitArtifact: true,
}
const quiet = (fn) => { const w = console.log; console.log = () => {}; try { return fn() } finally { console.log = w } }
const round = (v) => (typeof v === 'number' ? +v.toFixed(6) : v)
const h = (o) => crypto.createHash('sha256').update(JSON.stringify(o, (k, v) => round(v))).digest('hex').slice(0, 12)
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))

// SAME BAKE, TWO STATES. Each pair names its own confound.
const PAIRS = [
  {
    id: 'lafayette-square',
    ribbons: 'src/data/ribbons.json',
    a: ['genuine default', null],
    b: ['pre-reset', rd('public/looks/lafayette-square/design.json.pre-reset').blockCustoms || {}],
    note: 'THE HEADLINE PAIR. ⚠️ the fixture is PARTIAL — the resolved slot count is printed below.',
  },
  {
    id: 'hipointe-demun',
    ribbons: 'cartograph/data/hipointe-demun/clean/ribbons.json',
    a: ['genuine default', null],
    b: ['authored', rd('public/looks/hipointe-demun/design.json').blockCustoms || {}],
    note: '⭐ THE CLEANEST SINGLE-DIAL TEST: its slots hold ONLY pavementHW + terminal, so nothing '
        + 'but the width is varying. (The board calls HPDM "INERT for A10" — correct for the FILL, '
        + 'and exactly why it is the purest probe for a SHAPE-pass question.)',
  },
  {
    id: 'lafayette-square-staging',
    ribbons: 'cartograph/data/lafayette-square-staging/clean/ribbons.json',
    a: ['genuine default', null],
    b: ['authored', rd('public/looks/lafayette-square-staging/design.json').blockCustoms || {}],
    note: '⚠️ a DIFFERENT BAKE from LS (116 tiles, different skeleton). A second data point, '
        + '⛔ never merged with LS into one number.',
  },
]

// Slot resolution AT THE TRIPLE — the definition, not the street-presence proxy
// (POLYGON-FIRST §5 RULE 1b; the proxy answered 16/16 where the definition answers
// 48/79, and a proxy fails toward "fine").
const resolvedSlots = (tiles, bc) => {
  const triples = new Set()
  for (const t of tiles) for (const r of (t.runs || [])) triples.add(`${r.skelId}|${r.side}|${r.segOrd}`)
  let live = 0, total = 0
  for (const sk of Object.keys(bc || {})) for (const side of Object.keys(bc[sk] || {})) for (const ord of Object.keys(bc[sk][side] || {})) {
    total++
    if (triples.has(`${sk}|${side}|${ord}`)) live++
  }
  return { live, total }
}

const run = (ribbons, bc) => {
  const pr = quiet(() => buildTileGround(ribbons, { ...OPTS, blockCustoms: bc }))
  return (pr._shapeArtifact || []).map(t => ({
    stamped: Array.isArray(t.iaEdge),
    why: t.iaEdgeReason || null,
    producer: t.producer,
    iA: h(t.iA),
  }))
}

console.log('\n⭐ DOES THE MINT SET MOVE UNDER AUTHORING?')
console.log('   pavementHW → buildCurbRings.depthAt → offsetRingVariable → W → unionRings.')
console.log('   ⛔ Nothing re-poured, nothing re-baked, live source untouched.\n')

for (const P of PAIRS) {
  const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, P.ribbons)))
  const A = run(ribbons, P.a[1])
  const B = run(ribbons, P.b[1])
  console.log(`══ ${P.id} — "${P.a[0]}" vs "${P.b[0]}" ══`)
  console.log(`   ${P.note}`)
  const slots = resolvedSlots(A.length ? (quiet(() => buildTileGround(ribbons, { ...OPTS, blockCustoms: P.b[1] }))._shapeArtifact) : [], P.b[1])
  console.log(`   authoring: ${slots.live}/${slots.total} slot(s) resolve at the skelId|side|segOrd TRIPLE`)

  // ── THE CONTROL. If the curb did not move, the comparison is vacuous and must
  //    say so rather than reporting "stable" (the LS same-input-twice trap).
  const moved = A.filter((a, i) => a.iA !== B[i].iA).length
  if (!moved) {
    console.log(`   ⛔ CONTROL FAILED — the curb is byte-identical on all ${A.length} tiles between the two`)
    console.log(`      states. The authoring never reached the shape pass, so THIS PAIR MEASURES NOTHING.`)
    console.log(`      ⛔ Do not read the flip count below as stability.\n`)
  } else {
    console.log(`   ✅ control: the curb MOVED on ${moved}/${A.length} tiles — the authoring reached W.`)
  }

  const toMint = [], toStamp = [], reasonChange = []
  for (let i = 0; i < A.length; i++) {
    if (A[i].stamped && !B[i].stamped) toMint.push([i, B[i].why])
    else if (!A[i].stamped && B[i].stamped) toStamp.push([i, A[i].why])
    else if (!A[i].stamped && !B[i].stamped && A[i].why !== B[i].why) reasonChange.push([i, A[i].why, B[i].why])
  }
  const nA = A.filter(x => !x.stamped && /minted/.test(x.why || '')).length
  const nB = B.filter(x => !x.stamped && /minted/.test(x.why || '')).length
  console.log(`   minted-vertex tiles: ${P.a[0]} ${nA}  →  ${P.b[0]} ${nB}   (net ${nB - nA >= 0 ? '+' : ''}${nB - nA})`)
  console.log(`   ⭐ FLIPS: stamped→unstamped ${toMint.length}  ·  unstamped→stamped ${toStamp.length}  ·  reason changed ${reasonChange.length}`)
  if (toMint.length) console.log(`      authoring CREATED a mint on tile(s): ${toMint.map(([i, w]) => `${i}(${w})`).join(' ')}`)
  if (toStamp.length) console.log(`      authoring DESTROYED a mint on tile(s): ${toStamp.map(([i, w]) => `${i}(was ${w})`).join(' ')}`)
  if (reasonChange.length) console.log(`      refusal reason changed: ${reasonChange.map(([i, x, y]) => `${i} ${x}→${y}`).join(' ')}`)
  fs.writeFileSync(path.join(ROOT, `scratch/.mint-flip-${P.id}.json`), JSON.stringify({
    a: P.a[0], b: P.b[0], moved, toMint, toStamp, reasonChange,
    stampedA: A.map((x, i) => x.stamped ? i : -1).filter(i => i >= 0),
    stampedB: B.map((x, i) => x.stamped ? i : -1).filter(i => i >= 0),
  }))
  console.log('')
}
console.log('⚠️  Flip counts above are for the AVAILABLE fixtures only. No fixture exercises')
console.log('    pavementHW across its full authorable range, so a zero here bounds nothing —')
console.log('    it says these particular authored widths did not flip these particular tiles.')
