// SLICE 2 — the substrate walk, run and reported. (Tally, 2026-08-13)
//
// Consumer for src/lib/substrateWalk.js. The walk has NO live call site; this
// probe is its only caller, which is what "default off" means structurally
// rather than conditionally.
//
// ⛔ Authoring loaded. ⛔ Boundary passed as an ARGUMENT. ⛔ Nothing suppressed.
//
//   node scratch/slice2-walk-report.mjs [--orientation=b-to-a]
//
import fs from 'fs'
import crypto from 'crypto'
const o = console.log; console.log = () => {}
const { walkSubstrate } = await import('../src/lib/substrateWalk.js')
console.log = o

const ARG = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d }
const H = (f) => { try { return 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 10) } catch { return 'ABSENT' } }

const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const nb = JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json', 'utf8'))
const design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8'))

o('═══ SCENE + ARTIFACTS (an eye-gate must record its scene; so must a probe) ═══')
o(`  scene ........................ lafayette-square  (⛔ NOT lafayette-square-staging)`)
o(`  src/data/ribbons.json ........ ${H('src/data/ribbons.json')}`)
o(`  design.json .................. ${H('public/looks/lafayette-square/design.json')}   ${Object.keys(design.blockCustoms || {}).length} authored streets`)
o(`  neighborhood_boundary.json ... ${H('cartograph/data/lafayette-square/neighborhood_boundary.json')}   (read HERE, passed as an argument — the walk never opens it)`)

const streets = (ribbons.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
const bc = design.blockCustoms || {}
const byId = new Map(streets.map(s => [s.skelId, s]))

// ⚠️ WIDTH RESOLUTION LIVES HERE, NOT IN THE WALK — deliberately, so the walk
// carries no second widths mechanism. This mirrors buildBlockGeometryV2's
// resolveSide (a custom LAYERS onto the measure, field by field) but resolves
// PER CHAIN, not per segOrd: mapping a vertex index to a segOrd needs
// naturalSegments, which is not exported. The walk inherits that coarseness and
// this line is the record of it.
const hwCache = new Map()
function widthAt(skelId, side) {
  const k = skelId + '|' + side
  if (hwCache.has(k)) return hwCache.get(k)
  const s = byId.get(skelId)
  if (!s) { hwCache.set(k, NaN); return NaN }
  const base = s.measure?.[side] || {}
  const cust = bc[skelId]?.[side]
  let hw = base.pavementHW || 0
  if (cust) for (const segOrd of Object.keys(cust)) {
    const v = { ...base, ...cust[segOrd] }.pavementHW
    if (Number.isFinite(v)) hw = v
  }
  hwCache.set(k, hw)
  return hw
}

const [cx, cz] = nb.center
const outerRing = nb.boundary.map(([x, z]) => [cx + (x - cx), cz + (z - cz)])

const orientation = ARG('orientation', 'a-to-b')
o(`\n═══ RUN ═══`)
o(`  orientation = ${orientation}   (which member of a coupler pair is the successor)`)

const R = walkSubstrate({ streets, junctionMap: ribbons.junctionMap, widthAt, outerRing, orientation })

o(`\n═══ STRUCTURE ═══`)
for (const [k, v] of Object.entries(R.stats)) o(`  ${k.padEnd(20)} ${v}`)

o(`\n═══ FAILURES, BY CLASS — ⛔ none of these is suppressed, none is repaired ═══`)
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
    o(`     ⭐ 'no-node' is the 81 LS vertices that carry no junction node (74 deg-1,`)
    o(`        7 deg-2). Phase 1 made the relation total over the nodes that EXIST;`)
    o(`        it did not mint the missing ones, and this is where that shows.`)
  }
  for (const f of list.slice(0, 10)) o(`     ${(f.skelId + '|' + f.side).padEnd(34)} ${f.detail}`)
  if (list.length > 10) o(`     … and ${list.length - 10} more`)
}

o(`\n═══ FACES ═══`)
const good = R.faces.filter(f => !f.degenerate)
o(`  closed faces ................. ${R.faces.length}`)
o(`    non-degenerate ............. ${good.length}`)
o(`    degenerate (EMITTED, not deleted) ${R.faces.length - good.length}`)
o(`  half-edges in no closed face . ${R.stats.halfEdges - R.faces.reduce((s, f) => s + f.edges.length, 0)}`)
o(`  ⭐ IDENTITY CHECK — every ring edge must name an owner, by construction:`)
{
  let edges = 0, named = 0, boundary = 0
  for (const f of R.faces) for (const e of f.edges) { edges++; if (e.skelId) named++; if (e.skelId === '__boundary__') boundary++ }
  o(`     ring edges ${edges} · carrying (skelId, side) ${named} (${edges ? (100 * named / edges).toFixed(1) : '—'}%) · __boundary__ ${boundary}`)
  o(`     ⛔ 100% is required and is structural: identity is attached when the`)
  o(`        half-edge is built, never recovered from ring geometry afterward.`)
}

o(`\n═══ THE RIM — an open class, stated not hidden ═══`)
o(`  Measured 2026-08-12 (Tessel): a walk over the street graph does NOT close`)
o(`  the perimeter — LS 14 of 31 rim tiles close on real streets alone. That is`)
o(`  WHY the boundary is a stencil. This walk therefore produces INTERIOR faces;`)
o(`  perimeter faces are not produced and are not faked.`)
o(`  ⛔ A rim coupler would make the rim a side-chain, which RIBBONS §1's`)
o(`     2026-08-12 retraction forbids: "it BOUNDS, it does not own."`)
o(`  faces touching a __boundary__ half-edge: ${R.faces.filter(f => f.onRim).length}`)

o(`\n═══ COMPARAND (context only — ⛔ NOT an acceptance) ═══`)
o(`  frozen ribbons.tiles ......... ${(ribbons.tiles || []).length}`)
o(`  punch-out islands (case C) ... 93   (node scratch/reconcile-punchout-vs-faces.mjs)`)
o(`  ⛔ RIBBONS §1, RULED 2026-08-13: the acceptance is "the silhouette is smooth`)
o(`     AND no step in the pipeline smooths it" — NOT a ring count. 39 / 4 / 14 all`)
o(`     count rings in the OUTPUT, which is the wrong end of the pipe. A matching`)
o(`     face count here would not be a pass and a differing one is not a fail.`)
