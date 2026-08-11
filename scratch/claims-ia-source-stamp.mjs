#!/usr/bin/env node
/**
 * "DOES EVERY iA VERTEX KNOW WHICH RING EDGE MADE IT — AND DOES THE STAMP
 *  PARTITION THE RING?"  (ROADMAP A10 ③ · A15 · project_polygon_must_ask_the_stamp)
 *
 * WHY THIS EXISTS. A15 measured the hole: the partition lives on `tile.ring`, the
 * band is concentric to `tile.iA`, and NOTHING connects them — `filletRings`
 * densifies 1.5×–8.9× and 0 tiles carried iA-side ownership on any scene. That is
 * why `sectionPassTile` re-strokes each run's polyline into an area: it is the only
 * route it has from a ring-side owner to an iA-side arc, and re-stroking a line is
 * what gives the band ENDS. `tileGround.js` now carries a source ring-edge INDEX
 * from `tile.ring` through to `iA` and freezes it as `iaEdge`. This is the check
 * that the carry is true, on a town nobody has looked at.
 *
 * ⛔ IT IS NOT THE CURE. Nothing here paints from the partition; the A10 invariant
 *    (`claims-band-reaches-lu.mjs`) must still be RED at exactly its old numbers.
 *
 * WHAT IT ASSERTS — read out of the artifact, never restated from the source:
 *   1. EXACTLY ONE OF `iaEdge` / `iaEdgeReason` on every tile. ⛔ A tile that
 *      carries neither, or both, fails. An EMPTY `iaEdge` fails — "no owners" must
 *      never be spelled the same way as "owners: none of them".
 *   2. SHAPE — one label array per iA ring, one integer label per iA vertex.
 *   3. RANGE — every label is a valid index into that tile's `ring`.
 *   4. ⭐ WALK STRUCTURE — a SPLIT ASSERTION, never a skip. Which branch a tile
 *      takes is decided by THIS FILE's own crossing test on the pre-union walk,
 *      ⛔ never by anything the repair path says about itself — a population that
 *      can nominate itself for exemption grows invisibly.
 *        SIMPLE (the offset never crossed itself): CONTIGUITY — one cyclic run per
 *          source edge — and SEQUENCE — the runs in ring order, one wrap — asserted
 *          strictly, exactly as before folds were stamped.
 *        REPAIRED (the offset crossed itself; the boolean removed a lobe): the walk
 *          legitimately stops being monotone, so what IS true for them is asserted
 *          instead — a source edge owning more than one arc must coincide with the
 *          repaired ring GENUINELY REVISITING A COORDINATE, by exact equality on
 *          Clipper's own grid, at the union output where the repair happened.
 *          ⚠️ Tested there and NOT on `iA`: filletRing can dissolve the pinch vertex
 *          into arc points, so 2 of 12 multi-arc rings carry no exact repeat by the
 *          time they reach iA. Measured before it was asserted.
 *      Both populations are printed every run — a silent partition is how a check
 *      shrinks without anyone noticing.
 *   6. ARTIFACT IDENTITY — the frozen artifact MINUS the two new keys hashes
 *      exactly as it did before the change (the A07 precedent,
 *      `a07-producer-disclosure.mjs`). `a03-curb-identity.mjs`'s `artifact` hash
 *      necessarily moves: the deliverable is a new key IN that artifact. Every
 *      other hash it checks — iA, block, curb, asphalt, sidewalk, fillets — must
 *      not move, and that gate is a03's, not this one's.
 *
 * ⚠️ COVERAGE IS REPORTED, NOT ASSERTED. A ring edge can legitimately end up with
 *    no iA vertex: a fillet's inset swallows the vertices inside it, and a
 *    near-coincident pair collapses. That is the geometry, not a hole in the
 *    stamp — so it is counted and printed, never failed. ⛔ Do not turn it into a
 *    gate without deciding what a swallowed edge MEANS first.
 *
 * ⚠️ PROVEN ON WHAT IT RUNS. It builds the shape pass live per scene, so it does
 *    not depend on a re-bake. LS is the only scene with authored state to run in
 *    both directions; the rest are bare defaults, which is what town #2 pours into.
 *
 * Usage:
 *   node scratch/claims-ia-source-stamp.mjs
 *   node scratch/claims-ia-source-stamp.mjs --only lafayette-square
 *   node scratch/claims-ia-source-stamp.mjs --mutate <shape|range|silent|empty|order|split>
 *        ⭐ MUTATION-VERIFY. Breaks the carry deliberately in the artifact and
 *        requires the check to FAIL. A check that has never failed is not a check.
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRCDIR = path.join(ROOT, 'src/lib')
const TG = path.join(SRCDIR, 'tileGround.js')

// ── THE INDEPENDENT CROSSING DETECTOR — the design constraint of the split ──
// ⛔⛔ THE "WAS THIS REPAIRED?" MARK MUST NEVER COME FROM THE REPAIR PATH'S OWN
// SAY-SO. If the repairing code declared its own exemptions, a tile could mark
// itself out of the strict branch and the exempt population would grow invisibly —
// a skip list that writes itself. So the instrument dumps only RAW INPUTS (the
// pre-union walk W) and this file decides, with its own segment-crossing test, which
// population a tile is in. The repair contributes no opinion about itself.
const EDITS = [{
  why: 'dump the pre-union walk + the returned rings/labels (non-clean path)',
  find: /    return keep\.map\(k => uni\[k\]\)\n/,
  to: `    if (globalThis.__stampDump) globalThis.__stampDump.set(ring, { W, rings: keep.map(k => uni[k]), labels: (stamp && uniL) ? keep.map(k => uniL[k]) : null })
    return keep.map(k => uni[k])
`,
}, {
  why: 'same on the clean (curved-tile) path',
  find: /  if \(stamp && uniL\) stamp\.labels = outL\n  return out\n/,
  to: `  if (stamp && uniL) stamp.labels = outL
  if (globalThis.__stampDump) globalThis.__stampDump.set(ring, { W: W0, rings: out, labels: uniL ? outL : null })
  return out
`,
}]
const loadInstrumented = async () => {
  let out = fs.readFileSync(TG, 'utf8')
  for (const e of EDITS) {
    const hits = out.match(new RegExp(e.find.source, 'g')) || []
    if (hits.length !== 1) {
      console.error(`\u26d4 INSTRUMENT ANCHOR DRIFTED \u2014 matched ${hits.length}\u00d7, expected 1:\n   ${e.why}`)
      console.error('   The edit would be silently unapplied and every number below would be a FALSE GREEN.')
      process.exit(2)
    }
    out = out.replace(e.find, e.to)
  }
  out = out.replace(/(from\s*['"])(\.[^'"]*)(['"])/g, (_, a, sp, z) => a + path.resolve(SRCDIR, sp) + z)
  fs.mkdirSync(path.join(ROOT, 'scratch/.stamp-probe'), { recursive: true })
  const f = path.join(ROOT, 'scratch/.stamp-probe/tileGround.stamp.mjs')
  fs.writeFileSync(f, out)
  return await import(f)
}
const { buildTileGround } = await loadInstrumented()

// this file's own crossing test — the 18 ms one, independent of the repair
const segX = (p1, p2, p3, p4) => {
  const ax = p2[0] - p1[0], ay = p2[1] - p1[1], bx = p4[0] - p3[0], by = p4[1] - p3[1]
  const den = ax * by - ay * bx
  if (Math.abs(den) < 1e-12) return false
  const t = ((p3[0] - p1[0]) * by - (p3[1] - p1[1]) * bx) / den
  const u = ((p3[0] - p1[0]) * ay - (p3[1] - p1[1]) * ax) / den
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9
}
const selfIntersects = (W) => {
  const n = W.length
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue
    if (segX(W[i], W[(i + 1) % n], W[j], W[(j + 1) % n])) return true
  }
  return false
}
// EXACT repeated coordinate — no tolerance. The union output sits on Clipper's own
// 1/SCALE integer grid, which is the same exactness the label carry already relies
// on. ⚠️ Deliberately tested HERE and not on `iA`: filletRing runs after the repair
// and can dissolve the pinch vertex into arc points, so 2 of 12 multi-arc rings have
// no exact repeat by the time they reach iA (altadena 313 ring 3, staging 59 ring 0).
// Measured before it was asserted.
const revisitsACoordinate = (ring) => {
  const seen = new Set()
  for (const p of ring) { const k = `${p[0]},${p[1]}`; if (seen.has(k)) return true; seen.add(k) }
  return false
}

const argv = process.argv.slice(2)
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null }
const ONLY = opt('only')
const MUTATE = opt('mutate')
const MUTANTS = ['shape', 'range', 'silent', 'empty', 'order', 'split']
if (MUTATE && !MUTANTS.includes(MUTATE)) {
  console.error(`⛔ unknown mutant "${MUTATE}". One of: ${MUTANTS.join(' · ')}`)
  process.exit(2)
}

const OPTS = {
  stencil: null, curbWidth: 0.15, smooth: 0, blockLandUse: null,
  cornerRadiusScale: 1, cornerRadiusOverrides: null, cornerCornerRadiusOverrides: null,
  emitArtifact: true,
}
const quiet = (fn) => { const w = console.log; console.log = () => {}; try { return fn() } finally { console.log = w } }
const round = (v) => (typeof v === 'number' ? +v.toFixed(6) : v)
const canon = (o) => JSON.stringify(o, (k, v) => round(v))
const h = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)

// ── the states to run ───────────────────────────────────────────────────────
// LS twice (authored + bare defaults — Layer 0 q3: a defaults-only measurement is
// blind exactly where the map is most worked-on), every other poured scene once at
// its genuine default, which is what a fresh pour gets.
const lsRibbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const lsDesign = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/looks/lafayette-square/design.json'), 'utf8'))
const states = [
  { id: 'lafayette-square (authored)', ribbons: lsRibbons, blockCustoms: lsDesign.blockCustoms || {} },
  { id: 'lafayette-square (defaults)', ribbons: lsRibbons, blockCustoms: null },
]
// ⛔ A scene that cannot be run is NAMED, never silently absent from the list —
// "not measured" reads as "fine" the moment it is invisible (POLYGON-FIRST §5 R2).
const notChecked = []
// toy's ribbons do not live under cartograph/data — it is the construction spike
// surface, and prod runs on it (`feedback_toy_is_the_construction_spike_surface`),
// so it is named here rather than dropping out of the loop below unremarked.
const TOY = path.join(ROOT, 'src/data/toy/toy-ribbons.json')
if (fs.existsSync(TOY)) states.push({ id: 'toy (defaults)', ribbonsPath: TOY, blockCustoms: null })
else notChecked.push(['toy', 'src/data/toy/toy-ribbons.json missing'])
for (const d of fs.readdirSync(path.join(ROOT, 'cartograph/data')).sort()) {
  if (d === 'toy') continue                                    // handled above
  if (d === 'lafayette-square' || d === 'clean' || d === 'raw') continue
  const p = path.join(ROOT, 'cartograph/data', d, 'clean/ribbons.json')
  if (!fs.existsSync(p)) { notChecked.push([d, 'no clean/ribbons.json — the shape pass cannot be run']); continue }
  states.push({ id: `${d} (defaults)`, ribbonsPath: p, blockCustoms: null })
}
const selected = states.filter(s => !ONLY || s.id.includes(ONLY))
if (!selected.length) { console.error(`⛔ no state matched --only "${ONLY}". Nothing measured — this is NOT a pass.`); process.exit(2) }

// ── the mutation, applied to the ARTIFACT, so it exercises the check itself ──
// ⭐ Each one is a way the carry could be silently wrong. If the check passes a
// mutant, the check does not test what it claims to test.
const nRuns = (lab) => new Set(lab).size
const runsOf = (lab) => { const o = []; for (let i = 0; i < lab.length; i++) if (lab[i] !== lab[(i - 1 + lab.length) % lab.length]) o.push(lab[i]); return o }
const mutate = (tiles, kind, dumps) => {
  const isRep = (t) => { const d = dumps.get(t.ring); return d ? selfIntersects(d.W) : false }
  let victim, k
  if (kind === 'order') {
    // ⭐ RESTORED, and pointed at the branch that asserts sequence: a SIMPLE tile.
    victim = tiles.find(t => Array.isArray(t.iaEdge) && !isRep(t) && t.iaEdge.some(a => a && nRuns(a) >= 4))
    if (!victim) return false
    k = victim.iaEdge.findIndex(a => a && nRuns(a) >= 4)
    const lab = victim.iaEdge[k], seq = runsOf(lab)
    const a = seq[0], b = seq[Math.floor(seq.length / 2)]
    victim.iaEdge[k] = lab.map(v => v === a ? b : v === b ? a : v)
    return true
  }
  if (kind === 'split') {
    // ⭐ NEW, for the REPAIRED branch: manufacture a split arc on a repaired tile
    // whose union output has NO pinch, so nothing explains the split. Must fail.
    victim = tiles.find(t => Array.isArray(t.iaEdge) && isRep(t)
      && !(dumps.get(t.ring)?.rings || []).some(revisitsACoordinate)
      && t.iaEdge.some(a => a && nRuns(a) >= 3))
    if (!victim) return false
    k = victim.iaEdge.findIndex(a => a && nRuns(a) >= 3)
    const lab = victim.iaEdge[k], seq = runsOf(lab)
    const far = seq[Math.floor(seq.length / 2)]
    if (lab[0] === far || lab[1] === far) return false
    lab[0] = far                                   // `far` now owns two separated arcs
    return true
  }
  const want = (a) => a && a.length > 3
  victim = tiles.find(t => Array.isArray(t.iaEdge) && t.iaEdge.some(want))
  if (!victim) return false
  k = victim.iaEdge.findIndex(want)
  if (kind === 'shape') victim.iaEdge[k] = victim.iaEdge[k].slice(0, -1)          // one label short
  if (kind === 'range') victim.iaEdge[k] = victim.iaEdge[k].map((v, i) => i === 0 ? victim.ring.length : v)
  if (kind === 'silent') { delete victim.iaEdge; delete victim.iaEdgeReason }     // stamp vanishes, nothing says why
  if (kind === 'empty') { victim.iaEdge = [] }                                    // "no owners", the forbidden spelling
  return true
}

// ── the assertions ──────────────────────────────────────────────────────────
// Cyclic runs of equal labels, first/last merged. Returns the run labels in walk
// order; `.length` is the run COUNT, which must equal the distinct-label count for
// contiguity to hold.
const cyclicRuns = (lab) => {
  const n = lab.length
  if (!n) return []
  const runs = []
  for (let i = 0; i < n; i++) if (lab[i] !== lab[(i - 1 + n) % n]) runs.push({ start: i, v: lab[i] })
  if (!runs.length) return [lab[0]]                                  // all one label
  // walk from the first boundary so the runs come out in ring order
  const out = []
  for (const r of runs) out.push(r.v)
  return out
}

const checkTile = (t, ti, fail, walk, repaired, dump, unowned) => {
  const has = Array.isArray(t.iaEdge)
  const why = typeof t.iaEdgeReason === 'string' && t.iaEdgeReason.length > 0
  if (has && why) return fail(ti, 'BOTH iaEdge and iaEdgeReason — the tile cannot say two things at once')
  if (!has && !why) return fail(ti, 'NEITHER iaEdge nor iaEdgeReason — an absent stamp with no reason is the silent failure this check exists to refuse')
  if (why) return 'refused'
  const iA = t.iA || []
  if (!t.iaEdge.length && iA.length) return fail(ti, `iaEdge is EMPTY on a tile with ${iA.length} iA ring(s) — "no owners" must be a NAMED refusal, never an empty array`)
  if (t.iaEdge.length !== iA.length) return fail(ti, `iaEdge has ${t.iaEdge.length} ring(s), iA has ${iA.length}`)
  const nRing = (t.ring || []).length
  for (let r = 0; r < iA.length; r++) {
    const lab = t.iaEdge[r], ring = iA[r]
    if (!Array.isArray(lab) || lab.length !== ring.length) return fail(ti, `ring ${r}: ${Array.isArray(lab) ? lab.length : 'no'} label(s) for ${ring.length} vertices`)
    // [A10-③] `null` = THIS VERTEX HAS NO OWNER — the keyhole splice mints
    // vertices inside the bulb disc, and the ruling is that an arc with no owner
    // is simply never walked. ⛔ NOT gated on "did this tile take the splice":
    // that would be the repair path nominating its own exemption, which §"THE
    // SPLIT ASSERTION" forbids. It is gated on the STRUCTURE of the unowned set,
    // which this file can see for itself and which needs no constant:
    //   (a) unowned vertices form CONTIGUOUS cyclic runs — a scattered null
    //       pattern is a broken carry, not a localized splice;
    //   (b) every such run is BOUNDED ON BOTH SIDES by an owned vertex — so a
    //       wholesale carry failure (all null) cannot pass as "a splice";
    //   (c) with them excised, the rest is asserted STRICTLY, unchanged.
    for (const v of lab) if (v !== null && (!Number.isInteger(v) || v < 0 || v >= nRing)) return fail(ti, `ring ${r}: label ${v} is not a valid index into a ${nRing}-vertex tile.ring`)
    const nUn = lab.filter(v => v === null).length
    if (nUn) {
      if (nUn === lab.length) return fail(ti, `ring ${r}: EVERY label is unowned — that is a carry failure, not a splice, and it must refuse by name`)
      const L = lab.length
      let unRuns = 0
      for (let i = 0; i < L; i++) if (lab[i] === null && lab[(i - 1 + L) % L] !== null) unRuns++
      unowned.rings++; unowned.verts += nUn; unowned.runs += unRuns
    }
    // (c) the branch assertions below run on the OWNED walk. ⛔ Not a skip: with
    // nulls left in, `cyclicRuns` treats "no owner" as an owner and the monotone
    // test compares `null` to integers, which is meaningless — it reported 31
    // ascents on a tile with 2. Excising the unowned vertices asserts exactly the
    // invariant that is true of the rest, which is the SPLIT-ASSERTION pattern
    // this file already uses for REPAIRED.
    const walkLab = nUn ? lab.filter(v => v !== null) : lab
    // ⭐⭐ THE SPLIT ASSERTION. Walk structure is asserted STRICTLY where it is true
    // and asserted DIFFERENTLY — never skipped — where it is not. ⛔ There is no
    // skip list: which branch a tile takes is decided by THIS FILE's own crossing
    // test on the pre-union walk (`selfIntersects`), never by anything the repair
    // path says about itself. A population that can nominate itself for exemption
    // grows invisibly.
    //
    //  SIMPLE (the offset never crossed itself) — the majority. CONTIGUITY (one
    //     cyclic run per source edge) and SEQUENCE (the runs in ring order, one
    //     wrap) hold strictly, exactly as they did before folds were stamped.
    //  REPAIRED (the offset crossed itself and the boolean removed a lobe) — the
    //     walk legitimately stops being monotone, so the invariant that IS true for
    //     them is asserted instead: a source edge owning more than one arc must
    //     coincide with the repaired ring GENUINELY REVISITING A COORDINATE — a
    //     pinch, tested by exact equality on Clipper's own grid, at the union output
    //     where the repair happened. ⛔ If a label owns two arcs with no pinch to
    //     explain it, that is a real partition defect and it FAILS.
    const runs = cyclicRuns(walkLab)
    const distinct = new Set(walkLab).size
    let asc = 0, desc = 0
    for (let i = 0; i < runs.length; i++) { const a = runs[i], b = runs[(i + 1) % runs.length]; if (b > a) asc++; else desc++ }
    const monotone = runs.length <= 1 || asc === 1 || desc === 1
    if (repaired) {
      walk.repaired++
      if (runs.length !== distinct) {
        walk.multiArc++
        const uRings = dump?.rings || []
        const pinched = uRings.some(revisitsACoordinate)
        if (!pinched) return fail(ti, `ring ${r}: ${runs.length} run(s) for ${distinct} source edge(s) on a REPAIRED tile, and NO union-output ring revisits a coordinate — a split arc with no pinch to explain it`)
      }
    } else {
      walk.simple++
      if (runs.length !== distinct) return fail(ti, `ring ${r}: ${runs.length} cyclic run(s) for ${distinct} distinct source edge(s) on a tile whose offset never crossed itself — a source edge owns two separated arcs (CONTIGUITY)`)
      if (!monotone) return fail(ti, `ring ${r}: the runs are not in ring sequence on a tile whose offset never crossed itself (${asc} ascent(s) / ${desc} descent(s); a single wrap is required)`)
    }
  }
  return 'stamped'
}

// ── run ─────────────────────────────────────────────────────────────────────
console.log('\n⭐ A10 ③ — THE SOURCE-EDGE STAMP. "Every iA vertex knows which ring edge made it,')
console.log('   and the stamp partitions the ring: one contiguous arc per source edge, in ring order."')
if (MUTATE) console.log(`\n⚠️  MUTATION-VERIFY: "${MUTATE}" — this run MUST fail. A pass here means the check is blind.\n`)
else console.log('')

let bad = 0, statesRun = 0
const artifactHashes = {}
for (const s of selected) {
  let pr
  try {
    const rb = s.ribbons || JSON.parse(fs.readFileSync(s.ribbonsPath))
    globalThis.__stampDump = new Map()
    pr = quiet(() => buildTileGround(rb, { ...OPTS, blockCustoms: s.blockCustoms }))
  } catch (e) { console.log(`  ⛔ ${s.id.padEnd(30)} NOT MEASURED — ${e.message.slice(0, 70)}`); bad++; continue }
  const tiles = pr._shapeArtifact || []
  const dumps = globalThis.__stampDump || new Map()
  if (!tiles.length) { console.log(`  ⛔ ${s.id.padEnd(30)} NOT MEASURED — 0 tiles`); bad++; continue }
  statesRun++

  // artifact identity, the A07 way: strip ONLY the new keys and hash the rest
  artifactHashes[s.id] = h(canon(tiles.map(t => { const { iaEdge, iaEdgeReason, ...rest } = t; return rest })))

  if (MUTATE && !mutate(tiles, MUTATE, dumps)) { console.log(`  ⚠️  ${s.id.padEnd(30)} no stampable tile to mutate — skipped`); continue }

  const failures = []
  const fail = (ti, msg) => { failures.push(`tile ${ti}: ${msg}`); return 'FAIL' }
  let stamped = 0, refused = 0
  const byReason = new Map()
  const coverage = { edges: 0, covered: 0 }
  const walk = { simple: 0, repaired: 0, multiArc: 0 }
  const unowned = { rings: 0, verts: 0, runs: 0 }   // [A10-③] keyhole-minted, never painted
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]
    const dump = dumps.get(t.ring)
    const repaired = dump ? selfIntersects(dump.W) : false
    const v = checkTile(t, i, fail, walk, repaired, dump, unowned)
    if (v === 'stamped') {
      stamped++
      const seen = new Set()
      for (const lab of t.iaEdge) for (const x of lab) seen.add(x)
      coverage.edges += (t.ring || []).length
      coverage.covered += seen.size
    } else if (v === 'refused') {
      refused++
      byReason.set(t.iaEdgeReason, (byReason.get(t.iaEdgeReason) || 0) + 1)
    }
  }
  const ok = failures.length === 0
  if (!ok) bad++
  const pct = tiles.length ? (100 * stamped / tiles.length).toFixed(0) : '0'
  console.log(`  ${ok ? '✅' : '⛔'} ${s.id.padEnd(30)} ${String(stamped).padStart(4)}/${String(tiles.length).padStart(4)} tiles stamped (${pct}%) · ${refused} refused`)
  if (byReason.size) console.log(`     ${' '.repeat(28)} refusals: ${[...byReason].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(' · ')}`)
  if (stamped) console.log(`     ${' '.repeat(28)} walk: ${walk.simple} SIMPLE (contiguity+sequence asserted strictly) · ${walk.repaired} REPAIRED (pinch-explains-split asserted), of which ${walk.multiArc} carry a split arc`)
  if (stamped && unowned.verts) console.log(`     ${' '.repeat(28)} unowned: ${unowned.verts} vertex/vertices in ${unowned.runs} contiguous run(s) on ${unowned.rings} ring(s) — keyhole-minted, NEVER painted (A10 ③ ruling). Structure asserted: contiguous, bounded by owners, rest strict.`)
  if (stamped) console.log(`     ${' '.repeat(28)} coverage (reported, not gated): ${coverage.covered}/${coverage.edges} ring edges have an iA vertex — the rest were swallowed by a fillet inset or a coincident-point collapse`)
  for (const f of failures.slice(0, 8)) console.log(`     ⛔ ${f}`)
  if (failures.length > 8) console.log(`     ⛔ … ${failures.length - 8} more`)
}

// ── the artifact-identity half (A07 precedent) ──────────────────────────────
console.log('\n── ARTIFACT IDENTITY — the frozen shape MINUS the two new keys ──')
const BASE = path.join(ROOT, 'scratch/.iastamp-artifact.json')
if (argv.includes('--save-artifact')) {
  fs.writeFileSync(BASE, JSON.stringify(artifactHashes, null, 2))
  console.log(`  saved ${Object.keys(artifactHashes).length} hash(es) → scratch/.iastamp-artifact.json`)
  console.log('  ⚠️  A baseline saved from CHANGED code proves nothing. Save this from a clean tree only.')
} else if (fs.existsSync(BASE)) {
  const base = JSON.parse(fs.readFileSync(BASE, 'utf8'))
  let moved = 0
  for (const [k, v] of Object.entries(artifactHashes)) {
    const b = base[k]
    if (b === undefined) { console.log(`  ⚠️  ${k.padEnd(30)} not in the baseline — not proven`); continue }
    const same = b === v
    if (!same) { moved++; bad++ }
    console.log(`  ${same ? '✅' : '⛔'} ${k.padEnd(30)} ${same ? 'identical' : `${b} → ${v}`}`)
  }
  if (moved) console.log('  ⛔ the stamp changed the frozen shape. It is a RECORD of the geometry, never a input to it.')
} else {
  console.log('  ⚠️  no baseline on disk (scratch/.iastamp-artifact.json — TRACKED in git, so it should')
  console.log('      be here; if it is missing, something deleted it). Regenerate from a')
  console.log('      CLEAN tree with --save-artifact, then re-run here. Until then this half is UNPROVEN,')
  console.log('      which is not the same as passed. (a03-curb-identity.mjs proves the geometry itself.)')
}

if (notChecked.length) {
  console.log('\n── NOT CHECKED (named, so it cannot read as a pass) ──')
  for (const [k, why] of notChecked) console.log(`  ⚠️  ${k.padEnd(30)} ${why}`)
}

console.log('\n══ VERDICT ══')
if (MUTATE) {
  if (bad) { console.log(`✅ MUTATION-VERIFIED — the "${MUTATE}" mutant was caught. The check has teeth.`); process.exit(0) }
  console.log(`⛔ THE "${MUTATE}" MUTANT PASSED. The check is blind to it — every green it has ever printed is suspect.`)
  process.exit(1)
}
console.log(bad ? `⛔ FAIL — ${bad} state(s) with a broken or unexplained stamp, of ${statesRun} measured.`
                : `✅ ${statesRun} state(s): every iA vertex carries exactly one in-range source edge index —\n   no vertex unowned, none owned twice. SIMPLE tiles additionally assert contiguity +\n   ring order; REPAIRED tiles assert that a split arc coincides with a genuine pinch.\n   Every unstamped tile names its reason.`)
process.exit(bad ? 1 : 0)
