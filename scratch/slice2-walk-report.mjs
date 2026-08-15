// SLICE 2 — the substrate walk, run and reported. (Tally, 2026-08-13 · Wren, 2026-08-14)
//
// Consumer for src/lib/substrateWalk.js. The walk has NO live call site; this
// probe is its only caller, which is what "default off" means structurally
// rather than conditionally.
//
// ⛔ Authoring loaded. ⛔ Boundary passed as an ARGUMENT. ⛔ Nothing suppressed.
//
//   node scratch/slice2-walk-report.mjs
//     [--scene=<name>]       lafayette-square (default) | hipointe-demun
//     [--ribbons=<path>]     the scene's promoted bundle (default) | a clean/map.json
//     [--widths=segord|chain|both]   default both — segord is the product
//
// ⛔ ksi-y-m-yn · centrum · altadena are CHILLERED. This probe refuses them by
//    name and prints CHILLERED rather than a number.
//
import { loadScene, banner, ARG, CHILLERED } from './_substrate-feed.mjs'

const o = console.log; console.log = () => {}
const { walkSubstrate, completeness } = await import('../src/lib/substrateWalk.js')
console.log = o

const SCENE = ARG('scene', 'lafayette-square')
if (CHILLERED.includes(SCENE)) { o(`  ${SCENE}: CHILLERED (2026-08-13) — made for a pitch, pitch made. ⛔ No number is printed for it.`); process.exit(0) }
const WIDTH_MODE = ARG('widths', 'both')

// ⭐ The scene + the per-segOrd width feed live in ONE module, shared with
// scratch/slice2-unclaimed-classes.mjs. Two probes each carrying their own copy
// of the resolution is the parallel-mechanism anti-pattern one level up.
const S = await loadScene(SCENE, ARG('ribbons', null))
banner(S, o)
const { ribbons, streets, bc, byId, segOrdAt, ixByChain, widthAtSegOrd, widthAtChain, outerRing } = S

o(`\n═══ THE WIDTH FEED — what per-segOrd resolution actually changes ═══`)
{
  let slots = 0, live = 0, distinct = 0, misfedSides = 0, misfedSlots = 0
  const worst = []
  for (const skelId of Object.keys(bc)) {
    for (const side of Object.keys(bc[skelId])) {
      const entries = Object.entries(bc[skelId][side])
      const vals = entries.map(([so, c]) => [Number(so), c?.pavementHW]).filter(([, v]) => Number.isFinite(v))
      slots += entries.length
      if (!vals.length) continue
      live += vals.length
      const uniq = new Set(vals.map(([, v]) => v.toFixed(4)))
      distinct += uniq.size
      const chainVal = widthAtChain(skelId, side)
      const wrong = vals.filter(([, v]) => Math.abs(v - chainVal) > 1e-9).length
      if (uniq.size > 1 || !byId.has(skelId)) misfedSides++
      misfedSlots += wrong
      if (uniq.size > 1) worst.push({ skelId, side, n: vals.length, uniq: uniq.size, kept: chainVal, vals: [...uniq].sort() })
    }
  }
  o(`  authored (skelId, side) groups ....... ${Object.values(bc).reduce((s, v) => s + Object.keys(v).length, 0)}`)
  o(`  segOrd slots / with a finite pavementHW  ${slots} / ${live}`)
  o(`  ⛔ slots the CHAIN-LEVEL feed got wrong  ${misfedSlots} of ${live}, across ${misfedSides} (skelId, side) group(s)`)
  o(`     — it keeps ONE value per (chain, side); every other authored half-width was discarded,`)
  o(`       and the kept one was also applied to segOrds the operator never authored.`)
  for (const w of worst.sort((a, b) => b.uniq - a.uniq).slice(0, 6)) {
    o(`     ${(w.skelId + '|' + w.side).padEnd(30)} ${w.uniq} distinct authored HW over ${w.n} slots — chain feed kept ${w.kept.toFixed(3)}  [${w.vals.map(v => (+v).toFixed(2)).join(' ')}]`)
  }
}

// A width STEP inside an arc cannot be expressed by one offset polyline — the
// producer butts two rectangles at the IX. If it happens the vertices of one arc
// straddle two authored widths, so it is REPORTED, never smoothed over.
{
  const straddle = []
  for (const s of streets) {
    const ix = ixByChain.get(s.skelId) || []
    if (!ix.length) continue
    const nodeAt = new Set((ribbons.junctionMap?.nodes || []).map(n => n.key || (n.at[0].toFixed(3) + ',' + n.at[1].toFixed(3))))
    const cuts = [0]
    for (let i = 1; i < s.points.length - 1; i++) if (nodeAt.has(s.points[i][0].toFixed(3) + ',' + s.points[i][1].toFixed(3))) cuts.push(i)
    cuts.push(s.points.length - 1)
    for (let c = 0; c + 1 < cuts.length; c++) {
      const inside = ix.filter(i => i > cuts[c] && i < cuts[c + 1])
      if (inside.length) straddle.push({ skelId: s.skelId, arcIdx: c, i0: cuts[c], i1: cuts[c + 1], ix: inside })
    }
  }
  o(`  arcs straddling an IX (a width STEP inside one arc) ... ${straddle.length}`)
  if (straddle.length) {
    o(`     ⛔ NOT repaired. Each takes its lower segment's width, exactly as the producer's`)
    o(`        runSegOrd does on a through-junction's far side (tileGround.js:2736).`)
    for (const s of straddle.slice(0, 8)) o(`     ${(s.skelId + '|' + s.arcIdx).padEnd(30)} vertices ${s.i0}..${s.i1} contain IX ${s.ix.join(',')}`)
    if (straddle.length > 8) o(`     … and ${straddle.length - 8} more`)
  } else {
    o(`     ⭐ ZERO — every arc lies inside one natural segment, so per-vertex and per-arc`)
    o(`        resolution are the SAME number here. The arc cut set is a refinement of the IX set.`)
  }
}

// Which authored slots the walk can actually READ. ⛔ Not a defect count — an
// operator authors part of a chain all the time, and `segOrd` slots beyond the
// authored span are the product working (CLAUDE.md Layer 0 q3). What it does
// name is a slot no arc can ever resolve to, i.e. authoring the walk cannot honour.
{
  const reachable = new Map()
  for (const s of streets) {
    const ix = ixByChain.get(s.skelId) || []
    reachable.set(s.skelId, new Set(Array.from({ length: ix.length + 1 }, (_, i) => i)))
  }
  let total = 0, live = 0, negative = 0, absentChain = 0
  const orphans = []
  for (const skelId of Object.keys(bc)) {
    for (const side of Object.keys(bc[skelId])) {
      for (const so of Object.keys(bc[skelId][side])) {
        total++
        if (!Number.isFinite(bc[skelId][side][so]?.pavementHW)) continue
        live++
        if (Number(so) < 0) { negative++; continue }
        if (!byId.has(skelId)) { absentChain++; continue }
        if (!reachable.get(skelId).has(Number(so))) orphans.push(`${skelId}|${side}|${so}`)
      }
    }
  }
  o(`  authored pavementHW slots the walk can resolve ... ${live - negative - absentChain - orphans.length} of ${live}`)
  o(`     reserved negative segOrd (the cap fe — on RIBBONS §1's retirement list) ... ${negative}`)
  o(`     chain absent from this pour ................................................ ${absentChain}`)
  o(`     segOrd beyond the chain's natural segment count ............................ ${orphans.length}${orphans.length ? '  ' + orphans.slice(0, 6).join(' ') : ''}`)
}

const MODES = WIDTH_MODE === 'both' ? ['segord', 'chain'] : [WIDTH_MODE]
const ORIENTATIONS = ['a-to-b', 'b-to-a']
const feed = { segord: widthAtSegOrd, chain: widthAtChain }
const RUNS = {}
for (const mode of MODES) {
  RUNS[mode] = {}
  for (const orientation of ORIENTATIONS) {
    RUNS[mode][orientation] = walkSubstrate({ streets, junctionMap: ribbons.junctionMap, widthAt: feed[mode], outerRing, orientation })
  }
}
const PRIMARY = MODES.includes('segord') ? 'segord' : MODES[0]

o(`\n═══ STRUCTURE — every mode × orientation, side by side ═══`)
{
  const keys = Object.keys(RUNS[PRIMARY]['a-to-b'].stats)
  const cols = []
  for (const m of MODES) for (const or of ORIENTATIONS) cols.push([`${m}/${or}`, RUNS[m][or].stats])
  o(`  ${''.padEnd(20)}${cols.map(([n]) => n.padStart(16)).join('')}`)
  for (const k of keys) o(`  ${k.padEnd(20)}${cols.map(([, s]) => String(s[k]).padStart(16)).join('')}`)
  // Degeneracy split by KIND. ⭐ This is what settles b-to-a: opposite winding
  // is the signature of a traversal enumerating the complementary faces, and a
  // negative area is winding. Self-intersection is NOT — selfCrossings is
  // winding-agnostic — so the two must never be summed into one verdict.
  const runOf = (n) => RUNS[n.split('/')[0]][n.split('/')[1]]
  const row = (label, pred) => o(`  ${label.padEnd(20)}${cols.map(([n]) => String(runOf(n).faces.filter(pred).length).padStart(16)).join('')}`)
  row('  negative-area', f => f.area <= 0)
  row('  self-intersecting', f => f.selfIntersections > 0)
  row('  both at once', f => f.area <= 0 && f.selfIntersections > 0)
}

// ⭐ THE INSTRUMENT'S OWN PROOF: does the per-segOrd feed reach the geometry at
// all? If no face area moves between the two feeds, every comparison below is
// vacuous and would read as "the widths made no difference" when in fact the
// widths never arrived.
if (MODES.length > 1) {
  const sigOf = (f) => f.edges.map(e => e.key).sort().join('|#|')
  for (const or of ORIENTATIONS) {
    const bm = new Map(RUNS.chain[or].faces.map(f => [sigOf(f), f]))
    let moved = 0, same = 0, maxd = 0
    for (const f of RUNS.segord[or].faces) {
      const g = bm.get(sigOf(f)); if (!g) continue
      const d = Math.abs(f.area - g.area)
      if (d > 1e-6) { moved++; maxd = Math.max(maxd, d) } else same++
    }
    o(`  feed reaches geometry (${or}): ${moved} face area(s) MOVED between segord and chain feeds, ${same} identical, max |Δ| ${maxd.toFixed(1)} m²`)
  }
}

o(`\n═══ COMPLETENESS — ⭐⭐ THE ACCEPTANCE. Every half-edge claimed by exactly one`)
o(`    face per traversal; no face produced by both. Unclaimed = a hole. ═══`)
o(`  ⛔ This replaces "84 of 101". A complete partition measured against a BLOCK-ONLY`)
o(`     tile list was never a comparison — the walk emits gussets the tile list cannot name.`)
o(`  ⚠️ orientation is a choice of COUPLER PERMUTATION, not blocks-vs-gussets: both sides`)
o(`     of every arc are built before any orientation is consulted (substrateWalk §2/§3).`)
for (const mode of MODES) {
  const C = completeness(ORIENTATIONS.map(or => ({ label: or, result: RUNS[mode][or] })))
  o(`\n  ── widths = ${mode}`)
  if (C.universeMismatch.length) o(`     ⛔⛔ HALF-EDGE UNIVERSE DIFFERS ACROSS TRAVERSALS (${C.universeMismatch.length}) — every count below is void.`)
  o(`     half-edges the arcs OWE .... ${C.expected}   (2 per arc — the honest denominator)`)
  o(`     ⛔ NEVER BUILT ............. ${C.unbuilt.length}   ${C.unbuilt.length ? '(' + [...new Set(C.unbuilt.map(u => u.reason))].join(', ') + ') — ABSENT, not unclaimed; they can never be claimed by anything' : ''}`)
  o(`     universe actually built .... ${C.universe}`)
  for (const r of C.perRun) {
    o(`     ${r.label.padEnd(10)} faces ${String(r.faces).padStart(4)} · claimed once ${String(r.claimedOnce).padStart(4)} — ${(100 * r.claimedOnce / C.expected).toFixed(1)}% of OWED / ${(100 * r.claimedOnce / C.universe).toFixed(1)}% of built · UNCLAIMED ${String(r.unclaimed.length).padStart(4)} · MULTI-CLAIMED ${r.multi.length}`)
  }
  o(`     joint claim pattern (${ORIENTATIONS.join(', ')}):`)
  for (const j of C.joint) {
    const verdict = j.pattern === '1,1' ? '✅ claimed exactly once in EACH traversal'
      : /(^0,)|(,0$)|(^0$)/.test(j.pattern) ? '⛔ HOLE — unclaimed in at least one traversal; that arc bounds nothing there'
        : '⛔ OVERLAP — more than one face over one arc within a single traversal'
    o(`       [${j.pattern}]  ${String(j.count).padStart(4)}  ${verdict}`)
  }
  const holes = C.joint.filter(j => /(^0)|(,0)/.test(j.pattern)).flatMap(j => j.members)
  if (holes.length) {
    const byChain = new Map()
    for (const h of holes) byChain.set(h.skelId, (byChain.get(h.skelId) || 0) + 1)
    o(`     unclaimed half-edges NAMED — ${holes.length} on ${byChain.size} chain(s), worst first:`)
    for (const [sk, n] of [...byChain.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) o(`       ${sk.padEnd(32)} ${n}`)
    if (byChain.size > 12) o(`       … and ${byChain.size - 12} more chains`)
  }
  o(`     faces produced by BOTH traversals (same half-edge cycle) ... ${C.sharedFaces.length}`)
  for (const s of C.sharedFaces.slice(0, 5)) o(`       ${s.edges} edges · ${s.hits.map(h => `${h.label} area ${h.area.toFixed(1)}`).join(' · ')}`)
}

o(`\n═══ FAILURES, BY CLASS (widths=${PRIMARY}, orientation=a-to-b) — ⛔ none suppressed, none repaired ═══`)
{
  const R = RUNS[PRIMARY]['a-to-b']
  const byKind = new Map()
  for (const f of R.failures) { if (!byKind.has(f.kind)) byKind.set(f.kind, []); byKind.get(f.kind).push(f) }
  if (!byKind.size) o('  (none)')
  for (const [kind, list] of [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const chains = new Set(list.map(f => f.skelId))
    o(`\n  ── ${kind}   ${list.length} failure(s) on ${chains.size} chain(s)`)
    if (kind === 'offset-cusp') {
      o(`     ⭐ THIS IS THE PRE-EXISTING SKELETON CLASS, NOT THE WALK FAILING.`)
      o(`     Measured on LS before this walk existed (scratch/phase0-zero-separation.mjs):`)
      o(`     20 of 152 chains carry one-sided offset cusps, 16 of the 20 from DUPLICATED`)
      o(`     CENTRELINE VERTICES. unionRings swallows them today. ⛔ No guard is added`)
      o(`     to quiet them — that would be the forbidden cleanup patch.`)
    }
    if (kind === 'perp-collapse') {
      o(`     ⭐ buildBlockGeometryV2:110 substitutes a CONSTANT [0,1] in this case.`)
      o(`     This walk reports instead. Under the fail-loud rule the silent version`)
      o(`     should not exist; noted, not fixed here.`)
    }
    if (kind === 'no-successor') {
      const byReason = new Map()
      for (const f of list) byReason.set(f.reason, (byReason.get(f.reason) || 0) + 1)
      o(`     attribution: ${[...byReason.entries()].map(([r, n]) => `${r} ${n}`).join(' · ')}`)
      o(`     ⭐ 'no-node' is a vertex on a curbed chain that carries no junction node.`)
      o(`        The 2026-08-14 mint closes most of them ON THE POUR and reaches a PROMOTED`)
      o(`        bundle only after a promote — ⛔ so re-run this on both artifacts and read`)
      o(`        the hash above before quoting the count. It is a property of the bytes.`)
    }
    for (const f of list.slice(0, 10)) o(`     ${(f.skelId + '|' + f.side).padEnd(34)} ${f.detail}`)
    if (list.length > 10) o(`     … and ${list.length - 10} more`)
  }
}

o(`\n═══ IDENTITY — every ring edge must name an owner, by construction ═══`)
{
  const R = RUNS[PRIMARY]['a-to-b']
  let edges = 0, named = 0, boundary = 0
  for (const f of R.faces) for (const e of f.edges) { edges++; if (e.skelId) named++; if (e.skelId === '__boundary__') boundary++ }
  o(`  ring edges ${edges} · carrying (skelId, side) ${named} (${edges ? (100 * named / edges).toFixed(1) : '—'}%) · __boundary__ ${boundary}`)
  o(`  ⛔ 100% is required and is structural: identity is attached when the`)
  o(`     half-edge is built, never recovered from ring geometry afterward.`)
}

o(`\n═══ DEGENERATE FACES, RE-ATTRIBUTED AGAINST THE AUTHORED WIDTHS ═══`)
if (MODES.length < 2) {
  o(`  (needs --widths=both — a re-attribution is a COMPARISON)`)
} else {
  const sigOf = (f) => f.edges.map(e => e.key).sort().join('')
  for (const orientation of ORIENTATIONS) {
    const S = RUNS.segord[orientation], C = RUNS.chain[orientation]
    const degS = new Map(S.faces.filter(f => f.degenerate).map(f => [sigOf(f), f]))
    const degC = new Map(C.faces.filter(f => f.degenerate).map(f => [sigOf(f), f]))
    const allS = new Map(S.faces.map(f => [sigOf(f), f]))
    const allC = new Map(C.faces.map(f => [sigOf(f), f]))
    o(`\n  ── orientation ${orientation}:  degenerate under segord ${degS.size} · under chain ${degC.size}`)
    const real = [], artifact = [], exposed = [], unmatched = []
    for (const [sig, f] of degS) {
      if (degC.has(sig)) real.push(f)
      else if (allC.has(sig)) exposed.push(f)
      else unmatched.push(f)
    }
    for (const [sig, f] of degC) if (!degS.has(sig) && allS.has(sig)) artifact.push(f)
    o(`     REAL — degenerate under the operator's own per-segOrd widths ......... ${real.length}`)
    o(`     ARTIFACT OF THE WIDTH FEED — degenerate only under the chain feed .... ${artifact.length}`)
    o(`     EXPOSED — degenerate only once the authored widths were fed properly .. ${exposed.length}`)
    o(`     face has no counterpart in the other feed (different cycle) .......... ${unmatched.length}`)
    const show = (label, list) => {
      if (!list.length) return
      o(`     ${label}`)
      for (const f of list.slice(0, 8)) {
        // The width EACH BOUNDING ARC was actually built at, both feeds, so the
        // re-attribution names the number that moved — not a chain average.
        const bits = f.edges.map(e => {
          const seg = segOrdAt(e.skelId, e.i0)
          const a = widthAtSegOrd(e.skelId, e.side, e.i0, e)
          const b = widthAtChain(e.skelId, e.side)
          const moved = Math.abs(a - b) > 1e-9
          return `${e.skelId}|${e.side}|seg${seg} ${a.toFixed(2)}${moved ? `←${b.toFixed(2)}` : ''}`
        })
        const authored = bits.filter(s => s.includes('←'))
        o(`       area ${f.area.toFixed(1).padStart(11)} m²  ${f.edges.length} arc(s), ${f.owners.length} owner(s)`)
        for (const s of (authored.length ? authored : bits).slice(0, 4)) o(`          ${s}`)
        if ((authored.length ? authored : bits).length > 4) o(`          … ${(authored.length ? authored : bits).length - 4} more arc(s)`)
      }
      if (list.length > 8) o(`       … and ${list.length - 8} more`)
    }
    show('REAL:', real)
    show('ARTIFACT:', artifact)
    show('EXPOSED:', exposed)
  }
  o(`\n  ⛔ Degenerate faces are EMITTED, never deleted and never repaired — a`)
  o(`     self-intersecting or negative-area face is the walk saying the two`)
  o(`     side-chains bounding that land have crossed, at a named (skelId, side).`)
}

o(`\n═══ WHAT IS *NOT* AN ACCEPTANCE ═══`)
o(`  frozen ribbons.tiles ......... ${(ribbons.tiles || []).length}   (blocks only — no gussets, no perimeter)`)
o(`  ⛔ RIBBONS §1: the acceptance is the completeness invariant above, not a ring`)
o(`     count. 39 / 4 / 14 and "84 of 101" alike count rings in the OUTPUT of a`)
o(`     different producer, which is the wrong end of the pipe.`)
o(`\n═══ THE RIM — an open class, stated not hidden ═══`)
o(`  A walk over the street graph does NOT close the perimeter (Tessel, 2026-08-12:`)
o(`  LS 14 of 31 rim tiles close on real streets alone) — that is WHY the boundary`)
o(`  is a stencil. Perimeter faces are not produced here and are not faked.`)
o(`  ⛔ A rim coupler would make the rim a side-chain, which RIBBONS §1's`)
o(`     2026-08-12 retraction forbids: "it BOUNDS, it does not own."`)
o(`  faces touching a __boundary__ half-edge: ${RUNS[PRIMARY]['a-to-b'].faces.filter(f => f.onRim).length}`)
o(`\n  ⛔ CHILLERED, and a number is never printed for them: ksi-y-m-yn · centrum · altadena.`)
