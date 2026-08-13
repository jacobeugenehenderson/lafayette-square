#!/usr/bin/env node
// ── Is the COUPLER RELATION TOTAL?
//
// derive.js E3.1 (~:4351-4381) claims, in a comment: "Emitted here so the
// coupler relation is TOTAL — every directed side-chain has a successor at
// every node it touches, which is what a half-edge walk requires."
//
// It emits at dirs.length === 1 (via:'cap'), then `if (dirs.length < 3) continue`.
// This probe RE-DERIVES `dirs` per node exactly as E3.1 does, from the frozen
// ribbons.json, and checks the claim against the persisted `cornersAdjacent`.
//
// TOTALITY, stated precisely: at a node, each incident direction ("dir") owns
// two directed side-chains. In every emitted pair a dir appears as `a` on one
// side and as `b` on the other. So the relation is total at a node iff EVERY
// dir appears exactly once in the `a` role and exactly once in the `b` role.
//
//   node scratch/claims-coupler-totality.mjs [--scene <name>] [--verbose]
//
// ⛔ MEASUREMENT ONLY. This says nothing about whether any absence is visible.
import { readFileSync, existsSync } from 'node:fs'

const argv = process.argv.slice(2)
const VERBOSE = argv.includes('--verbose')
const sceneArg = argv.includes('--scene') ? argv[argv.indexOf('--scene') + 1] : null

// LS proper has no cartograph/data/lafayette-square/clean/ribbons.json — the
// operator's LS map is the BUNDLED artifact. Named so the difference is visible.
const SCENES = [
  ['lafayette-square (bundled)', 'src/data/ribbons.json'],
  ['lafayette-square-staging', 'cartograph/data/lafayette-square-staging/clean/ribbons.json'],
  ['altadena', 'cartograph/data/altadena/clean/ribbons.json'],
  ['centrum', 'cartograph/data/centrum/clean/ribbons.json'],
  ['hipointe-demun', 'cartograph/data/hipointe-demun/clean/ribbons.json'],
  ['ksi-y-m-yn', 'cartograph/data/ksi-y-m-yn/clean/ribbons.json'],
].filter(([n]) => !sceneArg || n.startsWith(sceneArg))

const vKey = (p) => p[0].toFixed(3) + ',' + p[1].toFixed(3)
const curbed = (s) => !s.gradeSeparated && !s.disabled

const NM = 'NOT MEASURED'

function analyse(ribbons) {
  const streets = (ribbons.streets || []).filter(curbed)
  const nodes = ribbons.junctionMap?.nodes || []
  const byKey = new Map(nodes.map(n => [n.key, n]))

  // ── Re-derive `dirs` for EVERY vertex any curbed chain touches (E3.1's rule:
  // an END contributes 1 dir; an INTERIOR pass contributes 2, fwd + back).
  const dirsAt = new Map()   // vKey -> [{chain, end, half}]
  const push = (k, d) => { if (!dirsAt.has(k)) dirsAt.set(k, []); dirsAt.get(k).push(d) }
  for (const s of streets) {
    const p = s.points
    if (!p || p.length < 2) continue
    push(vKey(p[0]), { chain: s.skelId, end: 'start', half: null })
    push(vKey(p[p.length - 1]), { chain: s.skelId, end: 'end', half: null })
    // E3.1 takes only the FIRST interior vertex matching the node key — mirror it.
    const seen = new Set()
    for (let i = 1; i < p.length - 1; i++) {
      const k = vKey(p[i])
      if (seen.has(k)) continue
      seen.add(k)
      if (!byKey.has(k)) continue     // interiorAt is keyed off existing nodes
      push(k, { chain: s.skelId, end: 'through', half: 'fwd' })
      push(k, { chain: s.skelId, end: 'through', half: 'back' })
    }
  }

  // ⛔ THE SCOPING GATE — found 2026-08-13, and it invalidates any naive read of
  // these artifacts. `junctionMap` is built over the UNCLIPPED chain set; the
  // serialized `streets[]` is CLIPPED to the scene. So a committed ribbons.json
  // carries nodes whose incident chains are not in its own streets array
  // (hipointe: 1530 of 1930 such nodes, median r 2480 m against a 1441 m street
  // set). Those nodes cannot be re-derived here at all. Three buckets:
  //   OUT-OF-CLIP — no serialized curbed chain touches the node (dirs === 0)
  //   PARTIAL     — some chain named in cornersAdjacent is not serialized
  //   CORE        — fully resolvable; the only bucket any count is taken over.
  const rows = []
  for (const n of nodes) {
    const dirs = dirsAt.get(n.key) || []
    const ca = n.cornersAdjacent || []
    const isCap = ca.length === 1 && ca[0].via === 'cap'

    // totality bookkeeping: dir -> {a:count, b:count}
    const slot = (d) => `${d.chain}|${d.end}|${d.half || ''}`
    const roles = new Map(dirs.map(d => [slot(d), { a: 0, b: 0 }]))
    let unknownRef = 0
    for (const pr of ca) {
      for (const role of ['a', 'b']) {
        const r = pr[role]
        const k = `${r.chain}|${r.end}|${r.half || ''}`
        if (roles.has(k)) roles.get(k)[role]++
        else unknownRef++
      }
    }
    let missA = 0, missB = 0, dupA = 0, dupB = 0
    for (const v of roles.values()) {
      if (v.a === 0) missA++; else if (v.a > 1) dupA++
      if (v.b === 0) missB++; else if (v.b > 1) dupB++
    }
    // # of distinct dirs the emitted pairs actually reference — for a node that
    // emitted, derive's own dirs count. If this equals my re-derived dirs.length
    // the reconstruction is validated at that node; if not, the node is PARTIAL.
    const refDirs = new Set()
    for (const pr of ca) for (const role of ['a', 'b']) refDirs.add(`${pr[role].chain}|${pr[role].end}|${pr[role].half || ''}`)

    const bucket = dirs.length === 0 ? 'OUT-OF-CLIP'
      : (unknownRef > 0 || (ca.length > 0 && refDirs.size !== dirs.length)) ? 'PARTIAL'
        : 'CORE'

    rows.push({
      key: n.key, at: n.at, kinds: n.kinds || [], nDirs: dirs.length,
      nPairs: ca.length, isCap, hasCA: ca.length > 0, bucket,
      missA, missB, dupA, dupB, unknownRef, refDirs: refDirs.size,
      orphanSides: missA + missB,          // directed side-chains with no successor
      totalSides: dirs.length * 2,
    })
  }

  // ── Vertices that carry dirs but NO node at all — the relation cannot be
  // total over a node that does not exist. E3.1 already prints the degree-1
  // half of this; count every degree.
  const nodeless = []
  for (const [k, d] of dirsAt) {
    if (byKey.has(k)) continue
    nodeless.push({ key: k, nDirs: d.length })
  }

  return { rows, nodeless, dirsAt, nStreets: streets.length, nNodes: nodes.length }
}

function pct(a, b) { return b ? `${(100 * a / b).toFixed(1)}%` : NM }

for (const [name, path] of SCENES) {
  if (!existsSync(path)) { console.log(`\n■ ${name}\n  ${NM} — no ribbons.json at ${path}`); continue }
  const { rows: allRows, nodeless, dirsAt, nStreets, nNodes } = analyse(JSON.parse(readFileSync(path, 'utf8')))

  const nOut = allRows.filter(r => r.bucket === 'OUT-OF-CLIP').length
  const nPart = allRows.filter(r => r.bucket === 'PARTIAL').length
  const rows = allRows.filter(r => r.bucket === 'CORE')

  console.log(`\n■ ${name}   (${path})`)
  console.log(`  ${nStreets} curbed chains · ${nNodes} junction nodes`)
  console.log(`  ⛔ SCOPING: ${nOut} node(s) OUT-OF-CLIP (no serialized curbed chain touches them) · ` +
    `${nPart} PARTIAL (an incident chain is not serialized) · ${rows.length} CORE.`)
  console.log(`     Every count below is over CORE only. OUT-OF-CLIP + PARTIAL are ${NM}, not zero.`)
  if (!rows.length) { console.log(`     ⛔ nothing resolvable — no measurement from this artifact.`); continue }

  // 1 ── degree distribution × emission
  const byDeg = new Map()
  for (const r of rows) {
    if (!byDeg.has(r.nDirs)) byDeg.set(r.nDirs, { n: 0, withCA: 0, cap: 0, kinds: new Map() })
    const b = byDeg.get(r.nDirs)
    b.n++; if (r.hasCA) b.withCA++; if (r.isCap) b.cap++
    for (const k of r.kinds) b.kinds.set(k, (b.kinds.get(k) || 0) + 1)
  }
  console.log(`  ── 1. NODE DEGREE (dirs) × coupler emission`)
  console.log(`     dirs  nodes  w/ cornersAdjacent   kinds`)
  for (const deg of [...byDeg.keys()].sort((a, b) => a - b)) {
    const b = byDeg.get(deg)
    const kinds = [...b.kinds].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(', ')
    const hole = deg >= 2 && deg < 3 ? '  ⛔ THE HOLE' : ''
    console.log(`     ${String(deg).padStart(4)}  ${String(b.n).padStart(5)}  ${String(b.withCA).padStart(6)} (${pct(b.withCA, b.n).padStart(6)})${b.cap ? ` [${b.cap} cap]` : '        '}   ${kinds}${hole}`)
  }

  // which KINDS live in the dirs<3 hole
  const hole = rows.filter(r => r.nDirs < 3 && !r.hasCA)
  const holeKinds = new Map()
  for (const r of hole) for (const k of r.kinds) holeKinds.set(k, (holeKinds.get(k) || 0) + 1)
  console.log(`     ⇒ ${hole.length} node(s) emit NOTHING via the dirs<3 path` +
    (holeKinds.size ? ` — kinds: ${[...holeKinds].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''))

  // 1b ── WHAT IS A DEGREE-2 NODE? Two structurally different things land in the
  // dirs<3 hole, and they want different answers:
  //   END-TO-END   two distinct chain ENDS weld (a name/width seam). 2 dirs, 2 chains.
  //   THROUGH-PASS one chain's INTERIOR vertex, contributing fwd + back. 1 chain.
  // ⚠️ On a through-pass the CCW loop's same-arm guard would NOT fire (A.half
  // 'fwd' vs B.half 'back' differ), so those two pairs are lost purely to the
  // `dirs.length < 3` early-continue. Stated as structure, not as a proposal.
  const deg2 = rows.filter(r => r.nDirs === 2)
  if (deg2.length) {
    let e2e = 0, thru = 0, selfWeld = 0
    for (const r of deg2) {
      const d = dirsAt.get(r.key) || []
      const chains = new Set(d.map(x => x.chain))
      if (d.some(x => x.end === 'through')) thru++
      else if (chains.size === 2) e2e++
      else selfWeld++          // one chain's two ends meeting itself (a closed loop)
    }
    console.log(`  ── 1b. THE dirs===2 POPULATION (${deg2.length}): ` +
      `${e2e} end-to-end weld of 2 chains · ${thru} interior through-pass of 1 chain · ${selfWeld} chain welded to itself`)
  }

  // 2 ── divided-transition nodes
  const dt = rows.filter(r => r.kinds.includes('divided-transition'))
  const dtWith = dt.filter(r => r.hasCA)
  console.log(`  ── 2. DIVIDED-TRANSITION nodes: ${dt.length} in CORE, ${dtWith.length} carry cornersAdjacent (${pct(dtWith.length, dt.length)})`)
  if (dt.length) {
    const dtDeg = new Map()
    for (const r of dt) dtDeg.set(r.nDirs, (dtDeg.get(r.nDirs) || 0) + 1)
    console.log(`     dirs distribution: ${[...dtDeg].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}→${c}`).join(', ')}`)
    const dtOrphan = dt.reduce((a, r) => a + r.orphanSides, 0)
    const dtSides = dt.reduce((a, r) => a + r.totalSides, 0)
    console.log(`     directed side-chains with NO successor: ${dtOrphan} of ${dtSides} (${pct(dtOrphan, dtSides)})`)
  }

  // 3 ── is the TOTAL claim true?
  const totalSides = rows.reduce((a, r) => a + r.totalSides, 0)
  const orphan = rows.reduce((a, r) => a + r.orphanSides, 0)
  const dup = rows.reduce((a, r) => a + r.dupA + r.dupB, 0)
  const unknown = rows.reduce((a, r) => a + r.unknownRef, 0)
  const badNodes = rows.filter(r => r.orphanSides > 0)
  console.log(`  ── 3. IS THE RELATION TOTAL?  ${orphan === 0 && nodeless.length === 0 ? '✅ TRUE' : '⛔ FALSE'}`)
  console.log(`     directed side-chains at existing nodes : ${totalSides}`)
  console.log(`     …with NO successor (orphan)            : ${orphan}  (${pct(orphan, totalSides)})`)
  console.log(`     …claimed twice (duplicate role)        : ${dup}`)
  console.log(`     pair refs to a dir not in the node     : ${unknown}`)
  console.log(`     nodes with ≥1 orphan side-chain        : ${badNodes.length} of ${rows.length} CORE  (${pct(badNodes.length, rows.length)})`)
  // orphans split by why
  const byWhy = new Map()
  for (const r of badNodes) {
    const why = r.nDirs < 3 ? `dirs<3 (deg ${r.nDirs})` : `dirs≥3 same-chain skip`
    if (!byWhy.has(why)) byWhy.set(why, { nodes: 0, sides: 0 })
    const b = byWhy.get(why); b.nodes++; b.sides += r.orphanSides
  }
  for (const [why, b] of [...byWhy].sort((a, b) => b[1].sides - a[1].sides))
    console.log(`       · ${why.padEnd(24)} ${String(b.nodes).padStart(4)} nodes, ${String(b.sides).padStart(4)} orphan sides` +
      (why.includes('deg 1') ? `   ⚠️ STALE ARTIFACT — see note` : ''))
  // ⚠️ PROVENANCE. `a2e0f6c4` (2026-08-12) emits a via:'cap' coupler at every
  // degree-1 node. NO committed ribbons.json carries one (grep '"via":"cap"' →
  // 0 in all six). So every degree-1 row above is the PRE-CAP state: it measures
  // the artifact, not the code. The degree-2 path is untouched by a2e0f6c4, so
  // the deg-2 rows DO reflect live code.
  const capsInArtifact = rows.filter(r => r.isCap).length
  if (!capsInArtifact) console.log(`     ⚠️ 0 via:'cap' couplers in this artifact though a2e0f6c4 emits them ⇒ artifact predates the cap landing; deg-1 rows above are ${NM} for live code. deg-2 rows are live.`)

  // vertices with no node at all
  const nlByDeg = new Map()
  for (const v of nodeless) nlByDeg.set(v.nDirs, (nlByDeg.get(v.nDirs) || 0) + 1)
  console.log(`     ⛔ vertices touched by a curbed chain but carrying NO node: ${nodeless.length}` +
    (nlByDeg.size ? `  (dirs: ${[...nlByDeg].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}→${c}`).join(', ')})` : ''))
  console.log(`        the coupler relation cannot be total over a node that does not exist.`)

  if (VERBOSE && badNodes.length) {
    console.log(`  ── orphan nodes (first 40)`)
    for (const r of badNodes.slice(0, 40))
      console.log(`     ${r.at.map(v => v.toFixed(1)).join(',').padEnd(18)} dirs ${r.nDirs} pairs ${r.nPairs} orphan ${r.orphanSides}/${r.totalSides}  [${r.kinds.join(' ')}]`)
  }
}
console.log('')
