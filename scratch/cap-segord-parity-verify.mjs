// cap-segord-parity-verify.mjs — PIECE 1 GATE (HANDOFF-dead-end-cap-flip §36/§44).
//
// Proves KEY PARITY for the synthetic dead-end cap segOrd, on the FROZEN
// artifact (never a live-path metric): the slot the FLIP will write == the slot
// the RENDER will read, and it never collides with a leg slot. Imports the REAL
// shipped helpers (no re-implemented formula) and cross-checks against the
// rendered tips in shape.json.
//
//   run:  node scratch/cap-segord-parity-verify.mjs
//
// The claims:
//   P1  detection 1:1 with rendered tips — every detectTileCaps tip is a frozen
//       roundTip/bluntTip and vice versa (no writable-but-unread orphan; no
//       rendered-but-unwritable cap). This is the T3 key-parity hazard the piece
//       exists to close.
//   P2  flip-write slot == render-read slot — both sides resolve (skelId,capEnd)
//       from the SAME frozen tip and key through the SAME makeCapFe+feCustomKey.
//   P3  cap slot DISJOINT from both leg slots at the tip (the two runs' keys).
//   P4  cap slot UNIQUE — no two caps collide onto one slot.
//   P5  freeze→rehydrate roundtrip — tilesFromFrozen carries tile.caps through.

import fs from 'fs'
import { detectTileCaps, chainEndpointKeys, tilesFromFrozen } from '../src/lib/tileGround.js'
import { makeCapFe, feCustomKey, CAP_SEGORD, isCapSegOrd } from '../src/lib/feCustomKey.js'

const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const shape   = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))
const streets = ribbons.streets
const tipKey = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000)
const slotKey = (k) => k ? `${k[0]}|${k[1]}|${k[2]}` : null

let fails = 0
const fail = (msg) => { fails++; console.log('  ✗ ' + msg) }
const ok   = (msg) => console.log('  ✓ ' + msg)

// ── Ground truth A: the RENDER — frozen tips + the runs ending at each ────────
// A rendered cap = a roundTip/bluntTip; the two runs ending at its node give the
// chain (skelId) + the LEG slots the cap must not collide with.
const renderTipKeys = new Set()
const runsAtTip = new Map()   // tipKey → [{skelId, side, segOrd}]
for (const t of shape.tiles) {
  for (const v of [...(t.roundTips || []), ...(t.bluntTips || [])]) renderTipKeys.add(tipKey(v.p))
  for (const run of (t.runs || [])) {
    if (!run.poly || run.poly.length < 2) continue
    for (const p of [run.poly[0], run.poly[run.poly.length - 1]]) {
      const tk = tipKey(p)
      if (!runsAtTip.has(tk)) runsAtTip.set(tk, [])
      runsAtTip.get(tk).push({ skelId: run.skelId, side: run.side, segOrd: run.segOrd })
    }
  }
}

// ── Ground truth B: DETECTION — the shipped helper on the frozen ribbons.tiles ─
const endpointKeys = chainEndpointKeys(streets)
const detected = []   // { tk, skelId, capEnd, slot }
for (const t of ribbons.tiles) {
  for (const c of detectTileCaps(t.ring, t.edges, endpointKeys)) {
    const tk = tipKey(t.ring[c.vertexIdx])
    const capFe = makeCapFe(c.skelId, c.capEnd, { chainName: null })
    detected.push({ tk, skelId: c.skelId, capEnd: c.capEnd, slot: feCustomKey(capFe) })
  }
}
console.log(`\ndetected caps: ${detected.length}   rendered tips: ${renderTipKeys.size}`)

// ── P1 · detection 1:1 with rendered tips ─────────────────────────────────────
console.log('\nP1 — detection 1:1 with rendered tips (no orphan either way)')
const detTipKeys = new Set(detected.map(d => d.tk))
let orphanDet = 0, orphanRen = 0
for (const tk of detTipKeys) if (!renderTipKeys.has(tk)) orphanDet++
for (const tk of renderTipKeys) if (!detTipKeys.has(tk)) orphanRen++
if (orphanDet) fail(`${orphanDet} detected caps have NO rendered tip (writable-but-unread orphans)`)
if (orphanRen) fail(`${orphanRen} rendered tips have NO detected cap (unwritable rendered caps)`)
if (!orphanDet && !orphanRen) ok(`all ${detected.length} caps ↔ ${renderTipKeys.size} rendered tips, exact 1:1`)

// ── P2 · flip-write slot == render-read slot ──────────────────────────────────
// The render side independently reconstructs (skelId, capEnd) from the frozen
// tip's neighbouring runs (skelId) + the chain-endpoint match (capEnd), then
// keys through the SAME makeCapFe. It must equal the detection/flip slot.
console.log('\nP2 — flip-write slot == render-read slot (same makeCapFe both sides)')
let p2ok = 0
for (const d of detected) {
  const runs = runsAtTip.get(d.tk) || []
  const skelIds = new Set(runs.map(r => r.skelId))
  if (!skelIds.has(d.skelId)) { fail(`tip ${d.tk}: detection skelId ${d.skelId} not among render runs ${[...skelIds]}`); continue }
  // capEnd from the render side: match tip to the chain's start/end endpoint.
  const ends = endpointKeys.get(d.skelId)
  const renCapEnd = ends?.start === d.tk ? 'start' : (ends?.end === d.tk ? 'end' : null)
  const renderSlot = feCustomKey(makeCapFe(d.skelId, renCapEnd))
  if (slotKey(renderSlot) !== slotKey(d.slot)) fail(`tip ${d.tk}: render slot ${slotKey(renderSlot)} != flip slot ${slotKey(d.slot)}`)
  else p2ok++
}
if (p2ok === detected.length) ok(`all ${p2ok} caps: flip-write slot == render-read slot`)

// ── P3 · cap slot disjoint from both leg slots ────────────────────────────────
console.log('\nP3 — cap slot DISJOINT from the two leg slots at the tip')
let p3ok = 0
for (const d of detected) {
  const legSlots = new Set((runsAtTip.get(d.tk) || []).map(r => slotKey([r.skelId, r.side, r.segOrd])))
  if (!isCapSegOrd(d.slot[2])) fail(`tip ${d.tk}: cap segOrd ${d.slot[2]} is not a reserved cap segOrd`)
  else if (legSlots.has(slotKey(d.slot))) fail(`tip ${d.tk}: cap slot ${slotKey(d.slot)} COLLIDES with a leg slot`)
  else p3ok++
}
if (p3ok === detected.length) ok(`all ${p3ok} caps: reserved cap segOrd, disjoint from every leg slot at the tip`)

// ── P4 · cap slot unique (no two caps share a slot) ──────────────────────────
console.log('\nP4 — cap slot UNIQUE (no collision between caps)')
const bySlot = new Map()
for (const d of detected) { const k = slotKey(d.slot); bySlot.set(k, (bySlot.get(k) || 0) + 1) }
const dupes = [...bySlot.entries()].filter(([, n]) => n > 1)
if (dupes.length) dupes.forEach(([k, n]) => fail(`slot ${k} claimed by ${n} caps`))
else ok(`all ${bySlot.size} cap slots distinct`)

// ── P5 · freeze → rehydrate roundtrip (tilesFromFrozen carries caps) ──────────
console.log('\nP5 — freeze→rehydrate: tilesFromFrozen preserves tile.caps')
// Simulate the frozen artifact derive.js writes: stamp caps onto the frozen
// tiles, then rehydrate. Detection edges carry skelId (frozen shape) already.
const stamped = ribbons.tiles.map(t => {
  const caps = detectTileCaps(t.ring, t.edges, endpointKeys)
  return caps.length ? { ...t, caps } : t
})
const rehydrated = tilesFromFrozen(stamped, streets)
let stampedCaps = 0, keptCaps = 0
for (const t of stamped) stampedCaps += (t.caps?.length || 0)
for (const t of (rehydrated || [])) keptCaps += (t.caps?.length || 0)
if (!rehydrated) fail('tilesFromFrozen returned null on the stamped artifact')
else if (keptCaps !== stampedCaps) fail(`rehydrate dropped caps: stamped ${stampedCaps} → kept ${keptCaps}`)
else ok(`tilesFromFrozen carried all ${keptCaps} caps through rehydration`)

// ── verdict ───────────────────────────────────────────────────────────────────
console.log(`\nCAP_SEGORD = ${JSON.stringify(CAP_SEGORD)}`)
console.log(fails === 0
  ? `\n✅ PARITY PROVEN — ${detected.length} caps, all claims pass. Piece 1 gate GREEN.\n`
  : `\n❌ ${fails} failure(s) — do NOT proceed past piece 1.\n`)
process.exit(fails === 0 ? 0 : 1)
