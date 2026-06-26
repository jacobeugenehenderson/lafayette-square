// PHASE 1 — confirming probe for the bounded local mouth-splice (READ-ONLY).
// (A) every spur tile's frozen iA carries two distinct mouth fillets to read
// (B) recenter math on an asymmetric spur — fillet-midpoint vs centerline node
// (C) splitting the run identity to the two ACTUAL fillet apexes hands the FILL
//     a wrappable wedge (bent sector at EACH fillet), iA byte-identical.
import fs from 'fs'
import { sectionPassTile } from '../src/lib/tileGround.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'

const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const cw = CURB_WIDTH
const stripMat = { outer: 'LU', inner: 'SW' }
const tiles = shape.tiles
const D = (x) => +x.toFixed(3)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const tipKey = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000)

// ── Detect spur mouths from the FROZEN runs ──────────────────────────────────
// A spur = same skelId, opposite-side run pair whose polys share BOTH endpoints
// up to a degree-1 tip; the mouth is the non-tip shared endpoint (it is revisited
// by the through-frontage). We find, per tile, each (skelId) whose left+right runs
// both touch a shared vertex that is ALSO a run-end of a DIFFERENT skelId (the
// through street) → that shared vertex is the mouth; the other shared end is the tip.
function spurMouths(tile) {
  const runs = tile.runs
  const tips = new Set((tile.roundTips || []).concat(tile.bluntTips || []).map(t => tipKey(t.p)))
  // group runs by skelId
  const bySkel = new Map()
  for (const r of runs) { if (!bySkel.has(r.skelId)) bySkel.set(r.skelId, []); bySkel.get(r.skelId).push(r) }
  // count run-ends per vertex, and which skelIds end there
  const endSkels = new Map() // tipKey -> Set(skelId)
  for (const r of runs) for (const p of [r.poly[0], r.poly[r.poly.length - 1]]) {
    const k = tipKey(p); if (!endSkels.has(k)) endSkels.set(k, new Set()); endSkels.get(k).add(r.skelId)
  }
  const mouths = []
  for (const [skel, rs] of bySkel) {
    const left = rs.find(r => r.side === 'left'), right = rs.find(r => r.side === 'right')
    if (!left || !right) continue
    // collect this skel's run endpoints; mouth = the one shared with the tip-set's complement
    const ends = []
    for (const r of rs) for (const p of [r.poly[0], r.poly[r.poly.length - 1]]) ends.push(p)
    // a spur: there is a degree-1 tip (in tips set) AND a mouth vertex revisited (shared by both sides + a different skel)
    let tip = null, mouth = null
    for (const p of ends) {
      const k = tipKey(p)
      if (tips.has(k)) tip = p
      else if ((endSkels.get(k)?.size || 0) >= 2) mouth = p   // shared with the through street
    }
    // also handle blunt/no-cap dead ends without a registered tip: mouth = the only
    // shared-with-other-skel end; tip = the degree-1-looking end (touched only by this skel)
    if (!mouth) {
      for (const p of ends) { const k = tipKey(p); if ((endSkels.get(k)?.size || 0) >= 2) { mouth = p; break } }
    }
    if (mouth) mouths.push({ skel, mouth, tip, left, right })
  }
  return mouths
}

// nearest two distinct fillets to the mouth (the two mouth corners)
function mouthFillets(tile, mouth) {
  const fl = (tile.fillets || []).map(f => ({ f, d: dist(f.apex, mouth) })).sort((a, b) => a.d - b.d)
  return fl
}

console.log('================ (A) every spur tile has TWO mouth fillets ================')
let spurTiles = 0, totalSpurs = 0, withTwo = 0, withOne = 0, withNone = 0
const aFail = []
for (let i = 0; i < tiles.length; i++) {
  const ms = spurMouths(tiles[i])
  if (!ms.length) continue
  spurTiles++
  for (const m of ms) {
    totalSpurs++
    const fl = mouthFillets(tiles[i], m.mouth)
    // a "readable" mouth fillet: apex within ~ (mouth halfwidth + a few m) of the mouth.
    // Use a generous 12 m gate (mouth corners sit ~ frontage-hw + dead-end-hw from the node).
    const near = fl.filter(x => x.d < 12)
    if (near.length >= 2) withTwo++
    else if (near.length === 1) { withOne++; aFail.push({ tile: i, skel: m.skel, mouth: m.mouth.map(D), near: near.map(x => ({ apex: x.f.apex.map(D), d: D(x.d) })), all: fl.slice(0, 3).map(x => D(x.d)) }) }
    else { withNone++; aFail.push({ tile: i, skel: m.skel, mouth: m.mouth.map(D), near: [], all: fl.slice(0, 3).map(x => D(x.d)) }) }
  }
}
console.log(`spur tiles: ${spurTiles}  total spur-mouths: ${totalSpurs}`)
console.log(`  with TWO readable mouth fillets (<12m): ${withTwo}`)
console.log(`  with ONE: ${withOne}    with NONE: ${withNone}`)
if (aFail.length) { console.log('  FALLBACK-NEEDED mouths:'); for (const f of aFail) console.log('   ', JSON.stringify(f)) }

console.log('\n================ (B) recenter math on an asymmetric spur ================')
// Albion×Missouri on tile[53] — show fillet-midpoint vs centerline node offset.
// pick the most asymmetric spur we can find by comparing the two nearest fillets' offset from mouth.
function reportRecenter(tileIdx, skel) {
  const t = tiles[tileIdx]
  const m = spurMouths(t).find(x => x.skel === skel)
  if (!m) { console.log(`  no ${skel} spur on tile[${tileIdx}]`); return }
  const fl = mouthFillets(t, m.mouth).filter(x => x.d < 12).slice(0, 2)
  if (fl.length < 2) { console.log(`  ${skel}: <2 mouth fillets`); return }
  const f1 = fl[0].f.apex, f2 = fl[1].f.apex
  const mid = [(f1[0] + f2[0]) / 2, (f1[1] + f2[1]) / 2]
  const node = m.mouth   // the centerline node (collapsed vertex)
  const off = dist(mid, node)
  const span = dist(f1, f2)   // chord between the two corners = mouth opening width
  const rNode = Math.max(dist(node, f1), dist(node, f2))     // radius a node-centered disc needs
  const rMid = Math.max(dist(mid, f1), dist(mid, f2))         // radius a midpoint-centered disc needs (= span/2)
  console.log(`  tile[${tileIdx}] ${skel}:`)
  console.log(`    centerline node : ${node.map(D)}`)
  console.log(`    fillet apex 1   : ${f1.map(D)}  (d from node ${D(fl[0].d)})`)
  console.log(`    fillet apex 2   : ${f2.map(D)}  (d from node ${D(fl[1].d)})`)
  console.log(`    fillet MIDPOINT : ${mid.map(D)}`)
  console.log(`    midpoint OFFSET from centerline node = ${D(off)} m  (= ~(leftHW-rightHW)/2 if asymmetric)`)
  console.log(`    mouth opening (chord f1..f2) = ${D(span)} m`)
  console.log(`    disc radius needed centered at NODE = ${D(rNode)} m ; centered at MIDPOINT = ${D(rMid)} m`)
  console.log(`    => a node-centered disc of radius ${D(rMid)} (the natural mouth-half-width) would ${rNode > rMid + 0.05 ? 'CLIP a corner (under-covers by ' + D(rNode - rMid) + 'm)' : 'cover both'}; midpoint disc covers both by construction.`)
  return { off, span }
}
reportRecenter(53, 'albion-place')
reportRecenter(53, 'whittemore-place')

console.log('\n================ (C) THE CORE — split to fillet apexes → wrappable wedge ================')
const area = (rings) => rings.reduce((s, r) => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i][0] * r[j][1] - r[j][0] * r[i][1] } return s + Math.abs(a) / 2 }, 0)
const sumLu = (m) => Object.values(m).reduce((s, rings) => s + area(rings), 0)

// Instrument cornerT + the bent-sector pad by intercepting via a global hook we add below.
// Since sectionPassTile is a black box, we measure: (1) does luRemainder/SW change at the
// mouth (the wrap claims band), and (2) we read internal state by re-deriving cornerT logic
// with the same inputs is hard — instead, run the proxy render comparison via geometry deltas
// near each mouth, AND directly count distinct cornerT keys by re-implementing the key step.

function runTile(label, tile) {
  const r = sectionPassTile(tile, cw, stripMat, null)
  return r
}

// Splice helper: for a given spur mouth, move the run-ENDS that sit on the mouth
// to the TWO fillet apexes (each run-end → its NEAREST mouth fillet apex). This
// is the run-identity-only splice (tile.ring / iA untouched — we never call the
// offset path here; iA is read straight from the frozen artifact).
function spliceMouth(tile, m) {
  const fl = mouthFillets(tile, m.mouth).filter(x => x.d < 12).slice(0, 2)
  if (fl.length < 2) return false
  const a1 = fl[0].f.apex, a2 = fl[1].f.apex
  const near = (p) => dist(p, m.mouth) < 0.01
  for (const r of tile.runs) {
    const last = r.poly.length - 1
    for (const idx of [0, last]) {
      if (!near(r.poly[idx])) continue
      // pick the fillet apex nearer to this run's interior (its second vertex) so
      // the run bends toward its own corner
      const inner = r.poly[idx === 0 ? 1 : last - 1]
      const pick = dist(inner, a1) <= dist(inner, a2) ? a1 : a2
      r.poly[idx] = [pick[0], pick[1]]
    }
  }
  return true
}

// (C.1) iA byte-identity: we NEVER touch iA. Prove by comparing JSON of iA before/after splice.
function iaDigest(t) { return JSON.stringify(t.iA) }

for (const [tileIdx, skel] of [[53, 'albion-place'], [53, 'whittemore-place']]) {
  console.log(`\n  --- tile[${tileIdx}] ${skel} ---`)
  const base = JSON.parse(JSON.stringify(tiles[tileIdx]))
  const iaBefore = iaDigest(base)
  const rBase = runTile('base', base)

  const spl = JSON.parse(JSON.stringify(tiles[tileIdx]))
  const m = spurMouths(spl).find(x => x.skel === skel)
  const ok = spliceMouth(spl, m)
  if (!ok) { console.log('    <2 fillets — skip'); continue }
  const iaAfter = iaDigest(spl)
  const rSpl = runTile('split', spl)

  console.log(`    iA byte-identical: ${iaBefore === iaAfter ? 'YES (untouched)' : 'NO — iA MOVED!'}`)
  console.log(`    SW area  base=${D(area(rBase.Wacc))}  split=${D(area(rSpl.Wacc))}  Δ=${D(area(rSpl.Wacc) - area(rBase.Wacc))}`)
  console.log(`    LU(tlByLu) base=${D(sumLu(rBase.tlByLu))} split=${D(sumLu(rSpl.tlByLu))}  Δ=${D(sumLu(rSpl.tlByLu) - sumLu(rBase.tlByLu))}`)
  console.log(`    LU(luByLu) base=${D(sumLu(rBase.luByLu))} split=${D(sumLu(rSpl.luByLu))}  Δ=${D(sumLu(rSpl.luByLu) - sumLu(rBase.luByLu))}`)
}
