#!/usr/bin/env node
/**
 * ⛔ THE POST-WALL PROVENANCE GATE — RED until the FILL decides ownership from
 *    the POLYGON alone.
 *
 * Jacob, 2026-08-11: "THERE SHOULD BE NO CHAINS AFTER THE SURVEY TOOL."
 *
 * WHAT THIS IS NOT. It is not the wall's *signature* check — that one already
 * passes (`scratch/hadrian-wall-open-proof.mjs`: sectionPass/sectionOpen have no
 * lexical handle on streets/ribbons/measures). Nothing reaches back. The chains
 * were FROZEN INTO the artifact and are re-read as DECISIONS, which a signature
 * scan and a word scan are both blind to.
 *
 * WHAT IT MEASURES. Every ownership decision `sectionPassTile` makes — who owns
 * this arc of the band, does this end mint a corner, which fillet is a corner,
 * where does this leg stop — classified by WHERE THE ANSWER CAME FROM:
 *
 *   ✅ PARTITION      the frozen ring partition (`iaEdge` → span owner). The only
 *                     acceptable source: every ring edge lands in exactly one run,
 *                     so a gap is not constructible (SECTION §7, A10 ③).
 *   ✅ FROZEN-SCALAR  the run's own frozen measure (`noPed` = this edge owes no
 *                     asphalt = the RIM). WALL §3 freezes it deliberately; it is a
 *                     property of the edge, not a traversal of a graph.
 *   ⛔ CHAIN          a `skelId` / `roadId` comparison decided ownership.
 *   ⛔ NODE           run-ends bucketed by shared COORDINATE (`tipKey`) — the graph
 *                     rebuilt out of the artifact. `A15`: "nodes = chains, this is
 *                     a stink."
 *   ⛔ PROXIMITY      a TUNED DISTANCE picked the owner (nearest apex, `< 1 m`,
 *                     `>= 1.5 m`, `r + trim + 1`). `A15`'s forbidden recovery, in
 *                     `src/` rather than a probe.
 *   ⛔ UNMEASURABLE   the tile carries NO `iaEdge` stamp, so the partition cannot
 *                     decide anything here at all. Reported as its OWN failing
 *                     class with a count, never folded into a magnitude
 *                     (POLYGON-FIRST §5 Rule 2 — an unmeasurable sample is a loud
 *                     failure, never a skipped one).
 *
 * ⭐ A CHAIN-GATED DECISION COUNTS WHETHER OR NOT IT FIRED. The five suppressors
 *   are the DECISION PROCEDURE for every run-end; an end that mints a corner got
 *   there by the same chain reasoning as one that doesn't. Counting only firings
 *   would make the gate go green on a town whose chains happen to be tidy — blind
 *   exactly where the map is least worked-on, the mirror of the Check A blindness
 *   this suite was written after (POLYGON-FIRST §5 Rule 1). Both numbers print.
 *
 * ⭐ RUNS WITH THE SCENE'S AUTHORED `blockCustoms` (Rule 1). A gate run on bare
 *   defaults reports the operator's own decisions as defects.
 *
 * ⛔ Read-only w.r.t. the repo. Instruments a COPY of tileGround.js; every anchor
 *   is asserted to match an exact count, so the patch can never be silently
 *   unapplied and print a FALSE GREEN.
 *
 * Usage: node scratch/claims-postwall-provenance.mjs [--scene <name>] [--sites]
 * Exit:  0 = every decision is PARTITION/FROZEN-SCALAR and every tile is stamped
 *        1 = RED (the expected state today)
 *        2 = the instrument itself failed — NOT a measurement
 *
 * → CLAUDE.md Layer 0 · WALL.md · SECTION §7 · POLYGON-FIRST §2.1/§5 · ROADMAP A06/A07/A10/A15
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRCDIR = path.join(ROOT, 'src/lib')
const TG = path.join(SRCDIR, 'tileGround.js')

// ── the instrumented sites ──────────────────────────────────────────────────
// Each entry: an EXACT source string, how many times it must appear, and the
// replacement that records the decision. A drifted count aborts the run.
const SITES = [
  {
    id: 'corner-mint',
    n: 1,
    find: `          const suppressed = e.noPed || tipped[i] || through[i] || isNameTransition(p, run) || isThruNode(p, run)`,
    repl: `          const suppressed = e.noPed || tipped[i] || through[i] || isNameTransition(p, run) || isThruNode(p, run)
          __prov && __prov('corner-mint', {
            noPed: !!e.noPed, tipped: !!tipped[i], through: !!through[i],
            nameTransition: !!isNameTransition(p, run), thruNode: !!isThruNode(p, run),
          })`,
  },
  {
    id: 'leg-trim-nearest-fillet',
    n: 1,
    find: `          if (!best || bestD > best.r + e.a + 4) return e.a + nearestVertR(p, ring, vertR)`,
    repl: `          __prov && __prov('leg-trim-nearest-fillet', { fellBack: !best || bestD > best.r + e.a + 4 })
          if (!best || bestD > best.r + e.a + 4) return e.a + nearestVertR(p, ring, vertR)`,
  },
  {
    id: 'corner-fillet-pairing',
    n: 1,
    find: `          if (bf && bd <= bf.r + c.trim + 1) cornerFillet.set(bf, c)`,
    repl: `          __prov && __prov('corner-fillet-pairing', { paired: !!(bf && bd <= bf.r + c.trim + 1) })
          if (bf && bd <= bf.r + c.trim + 1) cornerFillet.set(bf, c)`,
  },
  {
    id: 'mouth-trim',
    n: 1,
    find: `            const m = mouths.find(mm => mm.spurSkel !== run.skelId && Math.hypot(end[0] - mm.mid[0], end[1] - mm.mid[1]) < 1)`,
    repl: `            const m = mouths.find(mm => mm.spurSkel !== run.skelId && Math.hypot(end[0] - mm.mid[0], end[1] - mm.mid[1]) < 1)
            __prov && __prov('mouth-trim', { hit: !!m })`,
  },
  {
    id: 'cap-axis-scan',
    n: 2,   // the cap-axis mean and the cap-slope post-pass run the same 1.5 m scan
    find: `          if (Math.hypot(run.poly[ix][0] - t.p[0], run.poly[ix][1] - t.p[1]) >= 1.5) continue`,
    repl: `          __prov && __prov('cap-axis-scan', { hit: Math.hypot(run.poly[ix][0] - t.p[0], run.poly[ix][1] - t.p[1]) < 1.5 })
          if (Math.hypot(run.poly[ix][0] - t.p[0], run.poly[ix][1] - t.p[1]) >= 1.5) continue`,
  },
  {
    id: 'pendant-pairing',
    n: 1,
    find: `          capOwner.set(ta, a.run.side === 'left' ? a : b.run.side === 'left' ? b : a)`,
    repl: `          __prov && __prov('pendant-pairing', {})
          capOwner.set(ta, a.run.side === 'left' ? a : b.run.side === 'left' ? b : a)`,
  },
  {
    id: 'arc-ownership',
    n: 1,
    find: `          const a = runSpans.get(s.owner) || []`,
    repl: `          __prov && __prov('arc-ownership', {})
          const a = runSpans.get(s.owner) || []`,
  },
]

// site → the provenance class it belongs to, and the one-line reason.
const CLASS = {
  'arc-ownership':          ['PARTITION',  'span owner read from the frozen iaEdge partition'],
  'corner-mint':            ['CHAIN/NODE', 'five predicates: skelId+roadId compares over a tipKey coordinate bucket'],
  'leg-trim-nearest-fillet':['PROXIMITY',  'nearest fillet apex, accepted within r + asphalt + 4 m'],
  'corner-fillet-pairing':  ['PROXIMITY',  'nearest fillet apex, accepted within r + trim + 1 m'],
  'mouth-trim':             ['CHAIN/PROX', 'spurSkel !== run.skelId AND within 1 m of the mouth midpoint'],
  'cap-axis-scan':          ['PROXIMITY',  'run endpoints within 1.5 m of the tip define the cap axis'],
  'pendant-pairing':        ['CHAIN',      'two runs are one dead-end finger iff they share a skelId'],
}
const OK = new Set(['PARTITION', 'FROZEN-SCALAR'])

// ── build the instrumented copy ─────────────────────────────────────────────
let src = fs.readFileSync(TG, 'utf8')
for (const s of SITES) {
  const hits = src.split(s.find).length - 1
  if (hits !== s.n) {
    console.error(`⛔ INSTRUMENT ANCHOR DRIFTED — site '${s.id}' matched ${hits}×, expected ${s.n}.`)
    console.error(`   The patch would be silently unapplied and every number below would be a FALSE GREEN.`)
    console.error(`   Re-anchor against src/lib/tileGround.js before trusting anything this prints.`)
    process.exit(2)
  }
  src = src.split(s.find).join(s.repl)
}
// the recorder, injected at module scope
src = `globalThis.__provRows = globalThis.__provRows || []
const __prov = (site, why) => { globalThis.__provOn && globalThis.__provRows.push({ site, why }) }
` + src
src = src.replace(/(from\s*['"])(\.[^'"]*)(['"])/g, (_, a, sp, z) => a + path.resolve(SRCDIR, sp) + z)

const dir = path.join(ROOT, 'scratch/.prov-probe')
fs.mkdirSync(dir, { recursive: true })
const f = path.join(dir, 'tileGround.prov.mjs')
fs.writeFileSync(f, src)
const { sectionPassTile } = await import(f)

// ── run it ──────────────────────────────────────────────────────────────────
const argScene = process.argv.includes('--scene') ? process.argv[process.argv.indexOf('--scene') + 1] : null
const showSites = process.argv.includes('--sites')
const scenes = (argScene ? [argScene] : fs.readdirSync(path.join(ROOT, 'public/baked')))
  .filter(s => fs.existsSync(path.join(ROOT, 'public/baked', s, 'shape.json')))

console.log(`POST-WALL PROVENANCE GATE — where every FILL ownership decision came from`)
console.log(`RED until all of them come from the polygon. Run WITH each scene's authored blockCustoms.\n`)

let anyRed = false
for (const scene of scenes) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/baked', scene, 'shape.json'), 'utf8'))
  const tiles = Array.isArray(raw) ? raw : raw.tiles
  if (!Array.isArray(tiles) || !tiles.length) { console.log(`── ${scene}: no tiles — NOT MEASURED\n`); anyRed = true; continue }
  const lp = path.join(ROOT, 'public/looks', scene, 'design.json')
  const bc = fs.existsSync(lp) ? (JSON.parse(fs.readFileSync(lp, 'utf8')).blockCustoms || null) : null

  const bySite = {}, fired = {}
  let stamped = 0, unstamped = 0, threw = 0
  globalThis.__provOn = true
  for (const st of tiles) {
    const isStamped = Array.isArray(st.iaEdge) && st.iaEdge.length
    isStamped ? stamped++ : unstamped++
    globalThis.__provRows = []
    try { sectionPassTile(st, 0.381, { outer: 'LU', inner: 'SW' }, bc) }
    catch { threw++; globalThis.__provRows = []; continue }
    for (const r of globalThis.__provRows) {
      bySite[r.site] = (bySite[r.site] || 0) + 1
      // "fired" = the decision actually changed the outcome
      const w = r.why
      const didFire = r.site === 'corner-mint'
        ? !!(w.tipped || w.through || w.nameTransition || w.thruNode)
        : r.site === 'leg-trim-nearest-fillet' ? !w.fellBack
        : ('hit' in w) ? w.hit : ('paired' in w) ? w.paired : true
      if (didFire) fired[r.site] = (fired[r.site] || 0) + 1
    }
    globalThis.__provRows = []
  }
  globalThis.__provOn = false

  const tot = {}
  for (const [site, n] of Object.entries(bySite)) {
    const [cls] = CLASS[site] || ['?', '']
    tot[cls] = (tot[cls] || 0) + n
  }
  const bad = Object.entries(tot).filter(([c]) => !OK.has(c)).reduce((s, [, n]) => s + n, 0)
  const red = bad > 0 || unstamped > 0
  if (red) anyRed = true

  console.log(`── ${scene} ──  ${tiles.length} tiles · ${stamped} stamped · ${unstamped} UNSTAMPED${threw ? ` · ${threw} threw` : ''}`)
  for (const [cls, n] of Object.entries(tot).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${OK.has(cls) ? '✅' : '⛔'} ${cls.padEnd(12)} ${String(n).padStart(6)} decisions`)
  }
  if (unstamped) {
    console.log(`   ⛔ UNMEASURABLE ${String(unstamped).padStart(5)} tiles carry no iaEdge — the partition cannot decide here AT ALL`)
    console.log(`      (its own failing class, never folded into a magnitude — POLYGON-FIRST §5 Rule 2)`)
  }
  if (showSites) {
    console.log(`   ── by site (decisions / of them, fired) ──`)
    for (const [site, n] of Object.entries(bySite).sort((a, b) => b[1] - a[1])) {
      const [cls, why] = CLASS[site] || ['?', '']
      console.log(`      ${OK.has(cls) ? '✅' : '⛔'} ${site.padEnd(24)} ${String(n).padStart(6)} / ${String(fired[site] || 0).padStart(5)}  ${why}`)
    }
  }
  console.log(`   ⇒ ${red ? '⛔ RED' : '✅ GREEN'}\n`)
}

// ══ PART 2 · THE AUTHORING SURFACE ═════════════════════════════════════════
// The runtime half above can only see what it can EXECUTE. `sectionPassTile` runs
// headless; the Measure tool does not (React + three). ⛔ That limit is not a pass —
// leaving the authoring surface out is how a gate reports green over the layer the
// operator actually touches. So this half is a SITE INVENTORY: every decision site
// named explicitly, anchored to exact source text with a required match count.
//
// ⛔ IT IS NOT A WORD SCAN. A word scan over `skelId` would flag the legitimate
// authoring key (`blockCustoms[skelId][side][segOrd]`, ruled fine 2026-08-04) and
// miss a proximity test that mentions no chain at all. Every entry below is a
// specific decision, read and classified by hand, and a drifted anchor ABORTS.
const AUTH_SITES = [
  // file, anchor, required matches, class, what it decides
  ['src/cartograph/MeasureOverlay.jsx', 'centerlineData?.streets?.[streetIdx]', 3, 'CHAIN', 'the selected element IS a chain, not an arc'],
  ['src/cartograph/MeasureOverlay.jsx', 'const pr = projectOntoPolyline(fe.points, px, pz)', 1, 'PROXIMITY', 'the clicked block-edge = nearest frontage polyline'],
  ['src/cartograph/MeasureOverlay.jsx', 'const idMatches = idKey && fe.chainSkelId === idKey', 1, 'CHAIN', 'candidate edges filtered by chain identity'],
  ['src/cartograph/MeasureOverlay.jsx', 'const rotY = Math.atan2(ax, az)', 1, 'CHAIN', "the handle's ORIENTATION is the chain's tangent — never the band's"],
  ['src/cartograph/MeasureOverlay.jsx', 'rayHitCurb(cx, cz, sign * nx, sign * nz, sectionCurbRings, pavHW + cwSide + RAY_CURB_MARGIN)', 1, 'CHAIN/PROX', 'handle anchor: ray FROM the chain, ALONG the chain normal, capped at 8 m'],
  ['src/cartograph/MeasureOverlay.jsx', 'const base = curb || { x: cx + sign * nx * pavHW, z: cz + sign * nz * pavHW }', 1, 'FALLBACK', '⛔ ray missed → place the handle by chain ruler ANYWAY, silently'],
  ['src/cartograph/MeasureOverlay.jsx', 'const signedPerp = dx * frame.nx + dz * frame.nz', 1, 'CHAIN', "which SIDE a click landed on, from the chain's normal"],
  ['src/cartograph/MeasureOverlay.jsx', "if (r > curbEnd && r <= oEnd && oD > 1e-6) slot = 'outer'", 1, 'CHAIN', 'which STRIP a click landed in — radii measured out from the chain'],
  ['src/cartograph/MeasureOverlay.jsx', "if (sd.terminal !== 'sidewalk') return null", 1, 'FALLBACK', '⛔ 169 of 418 street-sides: the gesture silently does nothing'],
  ['src/cartograph/MeasureOverlay.jsx', 'resolveChainSegmentation(centerlineData?.streets || [])', 1, 'CHAIN', 'the edit unit is a chain segmentation'],
  ['src/cartograph/measureModel.js', 'const fromPipeline = _sceneMeasure.get(st.skelId) || _sceneMeasure.get(st.name)', 1, 'CHAIN', "the edge's measure, looked up by chain id then by NAME"],
  ['src/cartograph/measureModel.js', 'const idMatches = idKey && fe.chainSkelId === idKey', 2, 'CHAIN', 'fe resolution by chain identity (findFeForSide, feesForChainSide)'],
  ['src/cartograph/measureModel.js', 'next.pavementHW = Math.min(MAX_PAVEMENT_HW, Math.max(0.5, r))', 1, 'CHAIN', 'the drag writes a radius measured FROM THE CENTERLINE'],
  ['src/cartograph/MeasurePanel.jsx', 'const st = centerlineData.streets[selectedStreet]', 1, 'CHAIN', 'the panel edits a chain'],
]

console.log(`\n══ PART 2 · THE AUTHORING SURFACE (site inventory — not executable headless) ══\n`)
const authTot = {}
let authDrift = 0
const byFile = new Map()
for (const [file, anchor, n, cls, why] of AUTH_SITES) {
  const p = path.join(ROOT, file)
  if (!fs.existsSync(p)) { console.error(`⛔ missing source: ${file}`); authDrift++; continue }
  const hits = fs.readFileSync(p, 'utf8').split(anchor).length - 1
  if (hits !== n) {
    console.error(`⛔ SITE ANCHOR DRIFTED — ${file}: expected ${n}, found ${hits}`)
    console.error(`   "${anchor.slice(0, 70)}…"`)
    authDrift++
    continue
  }
  authTot[cls] = (authTot[cls] || 0) + hits
  if (!byFile.has(file)) byFile.set(file, [])
  byFile.get(file).push([hits, cls, why])
}
if (authDrift) {
  console.error(`\n⛔ ${authDrift} anchor(s) drifted — PART 2 IS NOT A MEASUREMENT. Re-anchor before trusting it.`)
  process.exit(2)
}
for (const [file, rows] of byFile) {
  console.log(`── ${file}`)
  for (const [n, cls, why] of rows.sort((a, b) => a[1].localeCompare(b[1]))) {
    console.log(`   ${OK.has(cls) ? '✅' : '⛔'} ${cls.padEnd(11)} ×${n}  ${why}`)
  }
}
const authBad = Object.entries(authTot).filter(([c]) => !OK.has(c)).reduce((s, [, n]) => s + n, 0)
console.log(`\n   authoring-surface sites: ${Object.entries(authTot).map(([c, n]) => `${c} ${n}`).join(' · ')}`)
console.log(`   ⇒ ${authBad ? '⛔ RED' : '✅ GREEN'} — ${authBad} site(s) decide from the chain, a node, a tuned distance, or fail silently`)
console.log(`\n   ⭐ 0 of these ask the polygon. \`tile.runs[].poly\` names every arc and \`iaEdge\` binds`)
console.log(`      every inset vertex to its owning ring edge — the handle's arc, the click's arc and`)
console.log(`      the edit's extent are all already there, frozen, and none of them is consulted.`)
if (authBad) anyRed = true

console.log(`\n⭐ HOW TO READ IT. A decision is not a defect because it is WRONG — it is a defect
   because of WHERE THE ANSWER CAME FROM. The polygon already carries the answer:
   \`tile.runs\` names every arc (skelId · side · segOrd) and \`iaEdge\` binds every inset
   vertex to its owning ring edge. Asking a coordinate bucket or a 1 m radius instead is
   rebuilding the street graph out of the artifact — A15's stink — and it is what breaks
   the sidewalk at a corner, a mouth or a cap while the curb stays perfectly correct.

   GREEN means: every arc of the band has exactly one owner, taken from the partition, so
   an interrupted sidewalk is NOT CONSTRUCTIBLE. That is the acceptance, not a lower count.
   → A06 stamps the carve tiles (the UNMEASURABLE class) · A07 stops the chain-gated
     suppression dropping a leg where the curb is perfectly good.`)

process.exit(anyRed ? 1 : 0)
