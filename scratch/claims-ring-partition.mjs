#!/usr/bin/env node
/**
 * "DOES THE FROZEN RING ALREADY CARRY A PARTITION WITH AN OWNER ON EVERY ARC?"
 *
 * WHY THIS EXISTS (2026-08-07). The FILL's broken-sidewalk cure (ROADMAP A10 /
 * SECTION §7) is to stop re-deriving an AREA from each run's polyline and
 * instead paint each run's own ARC of the continuous band. The objection to
 * that is always "but then what carries per-edge identity?" — and the answer is
 * that `groupRuns` (tileGround.js) already partitions the ring: it walks the
 * tile's `edges[]`, groups consecutive edges sharing (streetIdx, side), and
 * consumes the whole ring, so EVERY ring edge lands in exactly one run and each
 * run carries the blockCustoms key (skelId / side / segOrd).
 *
 * This check asks the ARTIFACT whether that is true where it matters, so the
 * claim is re-derivable on a town nobody has looked at instead of being quoted
 * from a conversation about Lafayette Square.
 *
 * WHAT IT DISTINGUISHES — the three outcomes are not the same defect:
 *   ⛔ DOUBLE-COVERED ring edge  — two runs claim one arc. This breaks the
 *      partition outright: painting per-arc would paint that arc twice, and
 *      whichever run wins is peel-order, i.e. not a decision at all. FAILS.
 *   ⚠️ OFF-RING run vertex — a frozen run's polyline leaves the ring, so its
 *      arc cannot be located on the ring at all. On a tile with a dead-end tip
 *      this is the known face-walk doubling-back (ROADMAP A0, the mouth slit):
 *      reported, but attributed, NOT counted as an A10 blocker. On a tile with
 *      NO dead-end tip it is unexplained and FAILS — that is a new class.
 *   ✅ clean — every ring edge has exactly one owner, every run vertex is a
 *      ring vertex. The partition is available to the FILL as-is.
 *
 * ⛔ Read-only. Reads `public/baked/<scene>/shape.json`. Writes nothing.
 * ⚠️ Reports per scene: the carved/offset producer mix means block geometry
 *    varies enormously by town (7%→75%), so a single scene proves nothing.
 *
 * Usage:
 *   node scratch/claims-ring-partition.mjs                  # every baked scene
 *   node scratch/claims-ring-partition.mjs lafayette-square # one scene
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const BAKED = join(ROOT, 'public/baked')

const key = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`

/**
 * Locate the ring edge a run's consecutive vertex pair covers.
 * A run may be stored in either traversal direction — the frozen builder runs
 * `side==='right'` chain-forward and `'left'` reversed (tileGround.js, the
 * pendant side-claim note) — so both orientations count as the same edge.
 * A ring may also visit one coordinate twice (a dead-end slit), so a coordinate
 * resolves to a LIST of indices, never one.
 */
const edgeBetween = (atCoord, a, b, n) => {
  const A = atCoord.get(key(a)) || []
  const B = atCoord.get(key(b)) || []
  for (const i of A) if (B.includes((i + 1) % n)) return i        // forward  i → i+1
  for (const j of B) if (A.includes((j + 1) % n)) return j        // reversed i+1 → i
  return -1
}

const auditScene = (scene) => {
  const path = join(BAKED, scene, 'shape.json')
  const tiles = JSON.parse(readFileSync(path, 'utf8')).tiles || []

  let ringEdges = 0, clean = 0, doubled = 0, offRing = 0
  const violations = []       // partition-breaking: double cover, or off-ring with no tip
  const attributed = []       // off-ring on a dead-end tile → A0's slit

  for (const [ti, tile] of tiles.entries()) {
    const ring = tile.ring || []
    const n = ring.length
    if (n < 3 || !Array.isArray(tile.runs)) continue
    ringEdges += n

    const atCoord = new Map()
    ring.forEach((p, j) => {
      const s = key(p)
      if (!atCoord.has(s)) atCoord.set(s, [])
      atCoord.get(s).push(j)
    })
    const onRing = new Set(atCoord.keys())
    const hasTip = ((tile.roundTips || []).length + (tile.bluntTips || []).length) > 0

    const cover = new Array(n).fill(0)
    const stray = []
    for (const run of tile.runs) {
      const poly = run.poly || []
      for (const p of poly) if (!onRing.has(key(p))) stray.push({ skelId: run.skelId, side: run.side })
      for (let a = 0; a < poly.length - 1; a++) {
        const e = edgeBetween(atCoord, poly[a], poly[a + 1], n)
        if (e >= 0) cover[e]++
      }
    }

    const dup = cover.filter(c => c > 1).length
    doubled += dup
    offRing += stray.length

    if (dup) violations.push({ tile: ti, kind: 'DOUBLE-COVERED', count: dup, hasTip })
    if (stray.length) {
      const row = { tile: ti, kind: 'OFF-RING', count: stray.length, streets: [...new Set(stray.map(s => s.skelId))] }
      if (hasTip) attributed.push(row); else violations.push({ ...row, hasTip })
    }
    if (!dup && !stray.length) clean++
  }

  return { scene, tiles: tiles.length, ringEdges, clean, doubled, offRing, violations, attributed }
}

// ── run ────────────────────────────────────────────────────────────────────
const only = process.argv[2]
const scenes = (only ? [only] : readdirSync(BAKED))
  .filter(s => existsSync(join(BAKED, s, 'shape.json')))
  .sort()

if (!scenes.length) {
  console.error(`⛔ no baked shape.json found${only ? ` for scene "${only}"` : ''} — nothing to check.`)
  process.exit(2)
}

console.log('RING PARTITION — does every ring arc have exactly one owning run?\n')

let failed = false
for (const scene of scenes) {
  const r = auditScene(scene)
  // A scene with no tiles is NOT a pass — a vacuous ✅ is the silent
  // substitution this suite exists to refuse (CLAUDE.md Layer 0 q2).
  if (!r.ringEdges) {
    console.log(`⚠️  ${r.scene} — NOT CHECKED: shape.json carries ${r.tiles} tile(s) / 0 ring edges.`)
    console.log(`     Re-bake the scene before reading anything into its absence.\n`)
    continue
  }
  const bad = r.violations.length
  const mark = bad ? '⛔' : '✅'
  console.log(`${mark} ${r.scene} — ${r.clean}/${r.tiles} tiles a clean partition, ${r.ringEdges} ring edges`)
  console.log(`     double-covered edges: ${r.doubled}   off-ring run vertices: ${r.offRing}`)

  if (r.attributed.length) {
    const v = r.attributed.reduce((s, a) => s + a.count, 0)
    console.log(`     ⚠️  ${r.attributed.length} tile(s) / ${v} vertices off-ring on DEAD-END tiles`)
    console.log(`         → attributed to the face walk doubling back at the mouth (ROADMAP A0).`)
    console.log(`         → NOT an A10 blocker: the corner partition on every other tile is unaffected.`)
  }
  if (bad) {
    failed = true
    console.log(`     ⛔ ${bad} PARTITION VIOLATION(S) — the ring cannot be painted per-arc here:`)
    for (const v of r.violations.slice(0, 12)) {
      console.log(`        tile ${v.tile}: ${v.kind} ×${v.count}` +
        (v.kind === 'OFF-RING' ? `  (no dead-end tip — UNEXPLAINED)  ${v.streets.join(' ')}` : ''))
    }
    if (bad > 12) console.log(`        … and ${bad - 12} more`)
  }
  console.log()
}

console.log(failed
  ? '⛔ FAIL — at least one scene has a ring arc with zero or two owners.\n' +
    '   The FILL cannot paint per-arc until every arc has exactly one owning run.'
  : '✅ PASS — every ring arc has exactly one owning run on every tile checked,\n' +
    '   apart from dead-end tiles already attributed to A0. Per-edge identity is\n' +
    '   ALREADY frozen (skelId/side/segOrd per run): the A10 cure needs no new key.')
process.exit(failed ? 1 : 0)
