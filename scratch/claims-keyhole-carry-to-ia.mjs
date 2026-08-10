#!/usr/bin/env node
/**
 * "DO THE KEYHOLE SPLICE'S SURVIVORS REACH `iA` STILL OWNED — AND DO THEY DIE ANY
 *  FASTER THAN AN ORDINARY TILE'S?"        (ROADMAP A10 ③, the keyhole pair)
 *
 * WHY THIS EXISTS. `claims-keyhole-splice-survival.mjs` (agent Quoin) measured the
 * splice itself: on LS's two keyhole tiles, every pre-splice labelled vertex lying
 * OUTSIDE every bulb disc survives the boolean bit-for-bit, and 100% of those tiles'
 * A10 defect area lies outside the discs. It then stated ONE THING AS INFERRED, NOT
 * MEASURED: that those survivors are still there, still owned, by the time the tile
 * reaches `iA`. Between the splice and `iA` sit three more constructions that can
 * eat a vertex — the pre-fillet spur strip, `filletRing` (dedupe · inset-swallow ·
 * corner→arc dissolve), and the post-fillet needle strip. `claims-ia-source-stamp`
 * already records that hazard in its own words: *"filletRing can dissolve the pinch
 * vertex into arc points, so 2 of 12 multi-arc rings carry no exact repeat by the
 * time they reach iA."* This file measures that carry instead of assuming it.
 *
 * ⛔ IT IS NOT THE CURE AND IT CHANGES NOTHING UNDER `src/`. To observe the carry at
 *    all, the wholesale refusal at `tileGround.js:3676` must be suppressed — that is
 *    INSTRUMENTATION, applied to an in-memory copy, never landed. The suppression is
 *    an APPENDED line guarded by a globalThis flag; the original expression is left
 *    verbatim, exactly as `claims-band-reaches-lu.mjs`'s instrument does it.
 *
 * ⛔ NO TOLERANCES. Every identity below is exact on Clipper's own 1/SCALE integer
 *    grid. ⛔ NO PROXIMITY RECOVERY: the vertices the splice MINTS are minted, and
 *    they refuse — including the eight that sit sub-millimetre outside a disc. The
 *    receipt is `tileGround.js:3578-3594`, whose own comment records the predecessor
 *    matcher that "collided 93× and orphaned 77×".
 *
 * ⛔ THE MINTED MARKER IS NOT A PROPOSED REFUSAL TOKEN. `-1` is this probe's own
 *    bookkeeping so an unowned vertex can be COUNTED; what a real cure should write
 *    for a minted vertex is a ruling the operator owes, and nothing here takes it.
 *    (The artifact itself refuses the tile — `_iaShape` rejects a negative label —
 *    so the probe reads its own dump, never `iaEdge`.)
 *
 * WHAT IT MEASURES
 *   (1) CARRY — of Quoin's survivors (pre-splice, outside every disc, bit-for-bit
 *       through the splice), how many are still in `iA` bit-for-bit, and how many of
 *       those carry a valid source ring-edge index. Every loss is ATTRIBUTED to the
 *       construction that ate it, by bracketing dumps at each stage plus a per-input-
 *       vertex fate record inside `filletRing` itself.
 *   (2) THE CONTROL — the same pre-fillet→`iA` carry rate on every LS tile that
 *       stamps TODAY. A loss that also happens there is the existing machinery's
 *       known behaviour, not a keyhole property.
 *   (3) ⭐ THE DECISION NUMBER — of these tiles' A10 defect area, how much a cure
 *       painting from the partition could actually reach. Attribution uses the
 *       CONSTRUCTION'S OWN band depth (`cw + tl + sw`) as the reach of an unowned
 *       arc, dilated conservatively, so the answer can only UNDER-claim ownership.
 *       ⛔ Never a tuned distance and never "nearest owner".
 *
 * ⛔ IDENTITY IS ASSERTED, NOT ASSUMED: the label carry must not move one byte of
 *    geometry, so the whole artifact's `iA` is hashed with the carry OFF and ON and
 *    the two must be identical; and each keyhole tile's live `ring` AND `iA` must
 *    match the frozen `shape.json` exactly, or the A10 half aborts LOUDLY.
 *
 * USAGE
 *   node scratch/claims-keyhole-carry-to-ia.mjs
 *   node scratch/claims-keyhole-carry-to-ia.mjs --scene lafayette-square
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { loadInstrumented, classifyTile, NOISE_M2 } from './claims-band-reaches-lu.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const argv = process.argv.slice(2)
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i < 0 ? null : (argv[i + 1] ?? '') }
const SCENE = opt('scene') || 'lafayette-square'

// ── the instrument. Every entry is a PURE ADDITION: the anchored source line is
//    reproduced verbatim and new lines are added around it. Each must match once
//    (loadInstrumented aborts otherwise), so a drifted anchor can never read as a
//    false green.
const EDITS = [
  { why: 'capture the pre-splice labelled rings + the discs, before blockRings is reassigned',
    find: /^      const spliced = unionRings\(\[\.\.\.differenceRings\(blockRings, _cdDisks\), \.\.\.intersectRings\(keyhole, _cdDisks\)\]\)$/m,
    to: `      const spliced = unionRings([...differenceRings(blockRings, _cdDisks), ...intersectRings(keyhole, _cdDisks)])
      const __khPre = blockRings, __khPreLabels = _iaLabels
      if (globalThis.__khDump) globalThis.__khDump.push({ ring: tile.ring, pre: __khPre, labels: __khPreLabels, discs: _cdDisks, post: spliced })` },

  { why: 'SUPPRESS the wholesale per-tile refusal and re-attach the labels across the splice by EXACT integer-grid identity. Appended: the refusal line itself is untouched, and this only fires under the probe flag.',
    find: /^        if \(_iaLabels\) \{ _iaLabels = null; _iaNo = 'keyhole-splice' \}$/m,
    to: `        if (_iaLabels) { _iaLabels = null; _iaNo = 'keyhole-splice' }
        if (globalThis.__khCarry && __khPreLabels) {
          const __m = new Map()
          for (let __k = 0; __k < __khPre.length; __k++) for (let __i = 0; __i < __khPre[__k].length; __i++)
            __m.set(Math.round(__khPre[__k][__i][0] * SCALE) + ',' + Math.round(__khPre[__k][__i][1] * SCALE), __khPreLabels[__k][__i])
          _iaLabels = blockRings.map(r => r.map(p => {
            const v = __m.get(Math.round(p[0] * SCALE) + ',' + Math.round(p[1] * SCALE))
            return v === undefined ? -1 : v
          }))
          _iaNo = null
        }` },

  { why: 'stage A — the rings + labels handed to filletRings (i.e. after the pre-fillet spur strip)',
    find: /^    const _fLabs = _iaLabels \? \[\] : null$/m,
    to: `    if (globalThis.__khStage) globalThis.__khStage.set(tile.ring, { preF: blockRings.map(r => r.map(p => p.slice())), preFLab: _iaLabels ? _iaLabels.map(a => a.slice()) : null, fillStart: (globalThis.__khFate || []).length })
    const _fLabs = _iaLabels ? [] : null` },

  { why: 'stage B — the rings + labels filletRings returned, before the post-fillet needle strip',
    find: /^    if \(_fLabs\) _iaLabels = _fLabs$/m,
    to: `    if (_fLabs) _iaLabels = _fLabs
    if (globalThis.__khStage) { const __s = globalThis.__khStage.get(tile.ring); if (__s) { __s.postF = iA.map(r => r.map(p => p.slice())); __s.postFLab = _iaLabels ? _iaLabels.map(a => a.slice()) : null; __s.fillEnd = (globalThis.__khFate || []).length } }` },

  { why: 'stage C — the final iA + labels + refusal reason, at the freeze',
    find: /^    let _iaShape = false$/m,
    to: `    if (globalThis.__khStage) { const __s = globalThis.__khStage.get(tile.ring); if (__s) { __s.iA = iA.map(r => r.map(p => p.slice())); __s.lab = _iaLabels ? _iaLabels.map(a => a.slice()) : null; __s.no = _iaNo } }
    let _iaShape = false` },

  { why: 'filletRing\'s OWN per-input-vertex fate — which mechanism ate a vertex, read from the construction rather than re-derived outside it',
    find: /^    else if \(!drop\[i\]\) \{ out\.push\(ring\[i\]\.slice\(\)\); if \(outLab && lab\) outLab\.push\(lab\[i\]\) \}\n  \}\n  return out\n\}$/m,
    to: `    else if (!drop[i]) { out.push(ring[i].slice()); if (outLab && lab) outLab.push(lab[i]) }
  }
  if (globalThis.__khFate) globalThis.__khFate.push({ in: ring0, kept: dd.src, drop: drop.slice(), arc: [...arcAt.keys()], out })
  return out
}` },
]

const SCALE = 1000                                   // tileGround.js:44 — Clipper's grid
const key = (p) => `${Math.round(p[0] * SCALE)},${Math.round(p[1] * SCALE)}`
const ringArea = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
const areaOf = (rings) => (rings || []).reduce((s, r) => s + ringArea(r), 0)
const sameRing = (a, b) => a.length === b.length && a.every((p, i) => key(p) === key(b[i]))
const sameRings = (A, B) => A.length === B.length && A.every((r, i) => sameRing(r, B[i]))
const inPoly = (p, poly) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c
  }
  return c
}
const keysOf = (rings) => { const s = new Set(); for (const r of rings || []) for (const p of r) s.add(key(p)); return s }
const h = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)

// ── load ONE instrumented copy ───────────────────────────────────────────────
const mod = await loadInstrumented(EDITS, 'khcarry')
const { buildTileGround, sectionPassTile, bandDump, bandOps } = mod
if (!bandDump?.on) { console.error('⛔ the band dump is not armed — the instrument did not apply. Nothing measured.'); process.exit(2) }

// ── the scene, WITH its authored state (Layer 0 q3) ──────────────────────────
const ribbonsPath = SCENE === 'lafayette-square'
  ? join(ROOT, 'src/data/ribbons.json')
  : join(ROOT, 'cartograph/data', SCENE, 'clean/ribbons.json')
const designPath = join(ROOT, 'public/looks', SCENE, 'design.json')
if (!existsSync(ribbonsPath) || !existsSync(designPath)) {
  console.error(`⛔ NOT MEASURED — ${SCENE} is missing ribbons.json or design.json. Read nothing into its absence.`)
  process.exit(2)
}
const design = JSON.parse(readFileSync(designPath, 'utf8'))
const ribbons = JSON.parse(readFileSync(ribbonsPath))
const cw = design.curbWidth
if (!Number.isFinite(cw)) { console.error('⛔ design.json has no numeric curbWidth — the construction cannot be run.'); process.exit(2) }

const quiet = (fn) => { const w = console.log; console.log = () => {}; try { return fn() } finally { console.log = w } }
const OPTS = {
  stencil: null, curbWidth: cw, smooth: 0, blockLandUse: null,
  cornerRadiusScale: 1, cornerRadiusOverrides: null, cornerCornerRadiusOverrides: null,
  emitArtifact: true, blockCustoms: design.blockCustoms || null,
}
const run = (carry) => {
  globalThis.__khCarry = carry
  globalThis.__khDump = []
  globalThis.__khFate = []
  globalThis.__khStage = new Map()
  const pr = quiet(() => buildTileGround(ribbons, OPTS))
  return { tiles: pr._shapeArtifact || [], dumps: globalThis.__khDump, fate: globalThis.__khFate, stage: globalThis.__khStage }
}

console.log(`\n⭐ THE KEYHOLE CARRY — splice ⟶ iA.   scene: ${SCENE} (authored, cw=${cw})`)

// ── ⛔ THE LABEL CARRY MAY NOT MOVE GEOMETRY. Asserted, not assumed. ──────────
const OFF = run(false)
const ON = run(true)
const iaHash = (tiles) => h(JSON.stringify(tiles.map(t => (t.iA || []).map(r => r.map(p => [+p[0].toFixed(6), +p[1].toFixed(6)])))))
const hOff = iaHash(OFF.tiles), hOn = iaHash(ON.tiles)
console.log(`   geometry identity: iA over ${OFF.tiles.length} tiles — carry OFF ${hOff} · carry ON ${hOn} ` +
            `${hOff === hOn ? '✅ IDENTICAL (the instrument observes; it does not draw)' : '⛔ THE INSTRUMENT MOVED THE CURB — every number below is void'}`)
if (hOff !== hOn) process.exit(1)

const { tiles, dumps, fate, stage } = ON
if (!dumps.length) { console.error('⛔ NO TILE TOOK THE SPLICE — nothing measured. That is not a pass.'); process.exit(2) }
console.log(`   live shape pass: ${tiles.length} tiles · ${dumps.length} tile(s) took the splice\n`)

// ── the frozen bake, for the A10 half ────────────────────────────────────────
const bakePath = join(ROOT, 'public/baked', SCENE, 'shape.json')
if (!existsSync(bakePath)) { console.error(`⛔ no bake at ${bakePath} — the A10 half cannot be measured.`); process.exit(2) }
const rawBake = JSON.parse(readFileSync(bakePath, 'utf8'))
const frozen = Array.isArray(rawBake) ? rawBake : (rawBake.tiles || [])

let bad = 0
const T = { surv: 0, atIA: 0, owned: 0, a10: 0, a10owned: 0, survE: 0, keptE: 0 }
const lossBy = new Map()
const note = (m, n = 1) => lossBy.set(m, (lossBy.get(m) || 0) + n)
const keyholeRings = new Set(dumps.map(d => d.ring))

for (const [n, d] of dumps.entries()) {
  const liveIdx = tiles.findIndex(t => t.ring === d.ring)
  const t = tiles[liveIdx]
  const s = stage.get(d.ring)
  console.log(`── splice #${n} · live tile ${liveIdx} · ring ${d.ring.length} vertices · ${d.discs.length} disc(s) ──`)
  // ⛔ read the refusal from the UNINSTRUMENTED run, never from the carry run — with
  // the carry on, the tile's own shape gate rejects this probe's -1 bookkeeping and
  // relabels the refusal 'shape-mismatch', which is the instrument, not the product.
  const off = OFF.tiles[liveIdx]
  const offSame = off && sameRing(off.ring, d.ring)
  console.log(`   today's artifact says: ${!offSame ? '⛔ tile order differs between runs — not read' : off.iaEdge ? 'stamped' : `refused "${off.iaEdgeReason}"`}`)
  if (!d.labels) {
    console.log('   ⚠️  NOT APPLICABLE — this tile carried NO labels even BEFORE the splice. The keyhole is not')
    console.log('       what refused it, so a per-vertex keyhole rule has nothing here to recover.')
    console.log('       Named, never silently dropped.')
    console.log('')
    continue
  }
  if (!s?.iA) { console.log('   ⛔ NOT MEASURED — no stage dump for this tile; the instrument did not reach it.'); bad++; console.log(''); continue }

  // ── Quoin's survivor population, re-derived here from the same construction ──
  const postKeys = keysOf(d.post)
  const surv = []                                       // { k, lab }
  for (let ri = 0; ri < d.pre.length; ri++) for (let vi = 0; vi < d.pre[ri].length; vi++) {
    const p = d.pre[ri][vi]
    if (d.discs.some(disc => inPoly(p, disc))) continue  // inside a disc — legitimately replaced
    if (!postKeys.has(key(p))) continue                  // destroyed by the splice (Quoin measured 0)
    surv.push({ k: key(p), lab: d.labels[ri][vi] })
  }
  const survKeys = new Map(surv.map(v => [v.k, v.lab]))
  console.log(`   (1) survivors of the splice, outside every disc: ${survKeys.size} distinct` +
              ` (${surv.length} pre-splice vertex slots)`)

  // ── stage keys ───────────────────────────────────────────────────────────
  const kPreF = keysOf(s.preF), kPostF = keysOf(s.postF), kIA = keysOf(s.iA)
  // final label lookup, per key: valid = an in-range index into tile.ring
  const nRing = d.ring.length
  const labAt = new Map()
  for (let ri = 0; ri < s.iA.length; ri++) for (let vi = 0; vi < s.iA[ri].length; vi++) {
    const v = s.lab ? s.lab[ri][vi] : undefined
    labAt.set(key(s.iA[ri][vi]), Number.isInteger(v) && v >= 0 && v < nRing ? v : null)
  }

  // ── filletRing's own fate records for THIS tile, by input index ──────────
  const mine = fate.slice(s.fillStart, s.fillEnd)
  const fateOf = new Map()                              // key → mechanism
  for (const f of mine) {
    const keptSet = new Set(f.kept)
    const arcSet = new Set(f.arc)
    // dd.src is the index list of the DEDUPED ring; drop/arc are indexed on it.
    for (let i = 0; i < f.in.length; i++) {
      const kk = key(f.in[i])
      const pos = f.kept.indexOf(i)
      let m
      if (pos < 0) m = 'coincident-point collapse (dedupeRing, <2 cm)'
      else if (arcSet.has(pos)) m = 'dissolved into arc points (filletRing corner)'
      else if (f.drop[pos]) m = 'swallowed inside a fillet inset (filletRing)'
      else m = 'kept'
      if (!fateOf.has(kk) || fateOf.get(kk) !== 'kept') fateOf.set(kk, m)
      void keptSet
    }
  }

  let atIA = 0, owned = 0
  const stageLoss = new Map()
  for (const [kk] of survKeys) {
    if (!kPreF.has(kk)) { stageLoss.set('the pre-fillet spur strip (dropFoldSpursTracked on blockRings)', (stageLoss.get('the pre-fillet spur strip (dropFoldSpursTracked on blockRings)') || 0) + 1); continue }
    if (!kPostF.has(kk)) {
      const m = fateOf.get(kk) || 'filletRing — mechanism not recorded (LOUD: the fate dump did not cover it)'
      stageLoss.set(m, (stageLoss.get(m) || 0) + 1); continue
    }
    if (!kIA.has(kk)) { stageLoss.set('the post-fillet needle strip (dropFoldSpursTracked on iA)', (stageLoss.get('the post-fillet needle strip (dropFoldSpursTracked on iA)') || 0) + 1); continue }
    atIA++
    if (labAt.get(kk) !== null && labAt.get(kk) !== undefined) owned++
    else stageLoss.set('⛔ reached iA UNOWNED — the label was lost while the vertex survived', (stageLoss.get('⛔ reached iA UNOWNED') || 0) + 1)
  }
  console.log(`       ⟶ still in iA bit-for-bit: ${atIA}/${survKeys.size} · of those, carrying a valid ring-edge index: ${owned}`)
  for (const [m, c] of [...stageLoss].sort((a, b) => b[1] - a[1])) { console.log(`         − ${c} lost to: ${m}`); note(m, c) }
  T.surv += survKeys.size; T.atIA += atIA; T.owned += owned

  // ⭐ THE CARRY IS PER-EDGE, NOT PER-VERTEX — and losing the COORDINATE is not
  // losing the OWNER. filletRing's own header says an arc minted at corner i
  // inherits ring vertex i's label, so a survivor "dissolved into arc points" hands
  // its ownership to the arc that replaced it. The cure paints from the PARTITION,
  // so this is the quantity it actually consumes.
  const survEdges = new Set([...survKeys.values()].filter(v => Number.isInteger(v) && v >= 0 && v < nRing))
  const iaEdges = new Set()
  for (const [, v] of labAt) if (v !== null && v !== undefined) iaEdges.add(v)
  let kept = 0
  for (const e of survEdges) if (iaEdges.has(e)) kept++
  console.log(`       ⭐ per-EDGE: the survivors name ${survEdges.size} distinct source ring edges; ${kept} of them still own` +
              ` an arc of iA (${(100 * kept / survEdges.size).toFixed(1)}%) — an arc inherits the vertex's label, so a` +
              ` dissolved coordinate is NOT a lost owner.`)
  T.survE += survEdges.size; T.keptE += kept

  // ── the whole ring, not just the survivors: how much of iA is owned ───────
  let nIA = 0, nOwned = 0, unownedIn = 0, unownedOut = 0
  for (let ri = 0; ri < s.iA.length; ri++) for (let vi = 0; vi < s.iA[ri].length; vi++) {
    const p = s.iA[ri][vi]; nIA++
    const v = s.lab ? s.lab[ri][vi] : undefined
    if (Number.isInteger(v) && v >= 0 && v < nRing) { nOwned++; continue }
    if (d.discs.some(disc => inPoly(p, disc))) unownedIn++; else unownedOut++
  }
  console.log(`       whole ring: ${nOwned}/${nIA} iA vertices owned (${(100 * nOwned / nIA).toFixed(1)}%)` +
              ` · unowned: ${unownedIn} inside a disc · ${unownedOut} outside every disc (MINTED — they refuse, and must)`)

  // ── (3) THE DECISION NUMBER ──────────────────────────────────────────────
  const fi = frozen.findIndex(f => Array.isArray(f.ring) && sameRing(f.ring, d.ring))
  if (fi < 0) {
    console.log('   (3) ⛔ NOT MEASURED — this tile\'s ring has no EXACT match in the frozen shape.json.')
    bad++; console.log(''); continue
  }
  if (!sameRings(frozen[fi].iA || [], s.iA)) {
    console.log(`   (3) ⛔ NOT MEASURED — frozen tile ${fi}'s iA is NOT bit-for-bit the live iA, so the live`)
    console.log('       ownership map does not describe the frozen geometry the A10 figure is measured on.')
    bad++; console.log(''); continue
  }
  const tl = frozen[fi].tl || 0, sw = frozen[fi].sw || 0
  const depth = cw + tl + sw                       // the construction's OWN inward reach
  // The reach of an UNOWNED arc: every iA edge with an unowned endpoint, dilated by
  // `depth`. ⛔ Not a tuned distance — it is the band's own depth, and the sampling
  // is deliberately over-inclusive (spacing/2 added to the radius), so this can only
  // UNDER-claim ownership. Anything outside it cannot have been drawn by an unowned arc.
  const SP = 0.5
  const cover = []
  for (let ri = 0; ri < s.iA.length; ri++) {
    const R = s.iA[ri], L = s.lab ? s.lab[ri] : null
    const ok = (i) => { const v = L ? L[i] : undefined; return Number.isInteger(v) && v >= 0 && v < nRing }
    for (let i = 0; i < R.length; i++) {
      const j = (i + 1) % R.length
      if (ok(i) && ok(j)) continue
      const a = R[i], b = R[j], len = Math.hypot(b[0] - a[0], b[1] - a[1])
      const steps = Math.max(1, Math.ceil(len / SP))
      for (let q = 0; q <= steps; q++) {
        const u = q / steps
        cover.push(bandOps.circlePoly(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, depth + SP / 2, 24))
      }
    }
  }
  const unownedZone = cover.length ? bandOps.unionRings(cover) : []

  bandDump.rows.length = 0
  try { sectionPassTile(frozen[fi], cw, { outer: 'LU', inner: 'SW' }, design.blockCustoms || null) }
  catch (e) { console.log(`   (3) ⛔ LOUD — frozen tile ${fi} threw (${e.message}); never a skip.`); bad++; bandDump.rows.length = 0; console.log(''); continue }
  let a10 = 0, a10Owned = 0
  for (const row of bandDump.rows) {
    const c = classifyTile(row, bandOps)
    if (c.bandArea <= NOISE_M2) continue
    a10 += c.a10Area
    const rings = (c.a10Rings || []).map(r => r.map(p => [p[0], p[1]]))
    if (!rings.length) continue
    a10Owned += unownedZone.length ? areaOf(bandOps.differenceRings(rings, unownedZone)) : areaOf(rings)
  }
  bandDump.rows.length = 0
  // ⛔ the zone's own size is printed so a "100% owned" cannot be produced by an
  // accidentally EMPTY zone — the failure mode that would make this number a lie.
  console.log(`   (3) A10 defect on frozen tile ${fi}: ${a10.toFixed(1)} m² · reachable from an OWNED iA arc:` +
              ` ${a10Owned.toFixed(1)} m² (${a10 > 0 ? (100 * a10Owned / a10).toFixed(1) : '0.0'}%)`)
      console.log(`       unowned-arc reach = the tile's own band depth ${depth.toFixed(2)} m, dilated over every iA edge with an` +
              ` unowned endpoint ⇒ a ${Math.abs(areaOf(unownedZone)).toFixed(1)} m² exclusion zone (${unownedZone.length} ring(s)).`)
  T.a10 += a10; T.a10owned += a10Owned
  console.log('')
}

// ── (2) THE CONTROL — every tile that stamps TODAY, same measurement ─────────
// ⛔ Decided by the tile's OWN refusal state with the carry OFF, never by anything
// this probe did to it: a control that could nominate itself would prove nothing.
const offStamped = new Set()
for (const t of OFF.tiles) if (Array.isArray(t.iaEdge)) offStamped.add(t.ring)
const rateOf = (s, nRing) => {
  const kPre = keysOf(s.preF), kIA = keysOf(s.iA)
  let hit = 0
  for (const k of kPre) if (kIA.has(k)) hit++
  const ePre = new Set(), eIA = new Set()
  for (const a of s.preFLab || []) for (const v of a) if (Number.isInteger(v) && v >= 0 && v < nRing) ePre.add(v)
  for (const a of s.lab || []) for (const v of a) if (Number.isInteger(v) && v >= 0 && v < nRing) eIA.add(v)
  let eHit = 0
  for (const e of ePre) if (eIA.has(e)) eHit++
  return { v: kPre.size, vHit: hit, e: ePre.size, eHit }
}
let ctlTiles = 0, ctlPre = 0, ctlIA = 0, ctlE = 0, ctlEHit = 0
const spread = []
for (const t of OFF.tiles) {
  if (!offStamped.has(t.ring) || keyholeRings.has(t.ring)) continue
  const s = OFF.stage.get(t.ring)
  if (!s?.iA || !s.preF) continue
  const r = rateOf(s, t.ring.length)
  ctlTiles++; ctlPre += r.v; ctlIA += r.vHit; ctlE += r.e; ctlEHit += r.eHit
  spread.push(r.vHit / r.v)
}
spread.sort((a, b) => a - b)

// the same two rates on the keyhole pair, computed IDENTICALLY (pre-fillet ⟶ iA)
let khPre = 0, khHit = 0, khE = 0, khEHit = 0
const khRates = []
for (const d of dumps) {
  const s = stage.get(d.ring)
  if (!s?.iA || !s.preFLab) continue
  const r = rateOf(s, d.ring.length)
  khPre += r.v; khHit += r.vHit; khE += r.e; khEHit += r.eHit
  khRates.push(r.vHit / r.v)
}
const pctile = (x) => (100 * spread.filter(v => v <= x).length / spread.length).toFixed(0)

console.log('══ (2) THE CONTROL — pre-fillet ⟶ iA, measured identically on both populations ══')
console.log(`   VERTEX carry (bit-for-bit)`)
console.log(`     ordinary stamped tiles (${ctlTiles}): ${ctlIA}/${ctlPre} (${(100 * ctlIA / ctlPre).toFixed(1)}%)` +
            ` · per-tile min ${(100 * spread[0]).toFixed(1)}% · median ${(100 * spread[Math.floor(spread.length / 2)]).toFixed(1)}%` +
            ` · max ${(100 * spread[spread.length - 1]).toFixed(1)}%`)
console.log(`     the keyhole tiles       : ${khHit}/${khPre} (${(100 * khHit / khPre).toFixed(1)}%)` +
            ` · per tile ${khRates.map(r => `${(100 * r).toFixed(1)}% (${pctile(r)}th pct of the control)`).join(' · ')}`)
console.log(`   ⭐ EDGE carry (does the source ring edge still own an arc of iA — what a cure consumes)`)
console.log(`     ordinary stamped tiles  : ${ctlEHit}/${ctlE} (${(100 * ctlEHit / ctlE).toFixed(1)}%)`)
console.log(`     the keyhole tiles       : ${khEHit}/${khE} (${(100 * khEHit / khE).toFixed(1)}%)`)

console.log('\n══ TOTALS ══')
console.log(`  (1) of ${T.surv} splice survivors outside every disc, ${T.atIA} reach iA bit-for-bit` +
            ` and ${T.owned} carry a valid source ring-edge index.`)
if (lossBy.size) for (const [m, c] of [...lossBy].sort((a, b) => b[1] - a[1])) console.log(`      − ${c}: ${m}`)
else console.log('      no losses — every survivor arrives owned.')
console.log(`      ⭐ per-EDGE: ${T.keptE}/${T.survE} of the source ring edges the survivors name still own an arc of iA` +
            ` (${(100 * T.keptE / T.survE).toFixed(1)}%).`)
console.log(`  (3) ⭐ A10 defect on these tiles: ${T.a10.toFixed(1)} m², of which ${T.a10owned.toFixed(1)} m²` +
            ` (${T.a10 > 0 ? (100 * T.a10owned / T.a10).toFixed(1) : '0.0'}%) is reachable from an OWNED iA arc.`)
console.log('\n⚠️  THIS FILE ASSERTS NOTHING AND GATES NOTHING. It measures the carry Quoin inferred, for a')
console.log('    ruling on whether the keyhole refusal can be per-VERTEX. Exit 0 = it ran and every')
console.log('    identity it needed held.')
process.exit(bad ? 1 : 0)
