#!/usr/bin/env node
/**
 * SEAM-CORNER FORENSIC — Phase 1 measurement only. Builds nothing.
 *
 * QUESTION: at a MATERIAL SEAM sitting on a THROUGH-NODE, what does the FILL do?
 * The reported symptom (Dolman x Carroll, ~(495.8, 115.4)) is "no corner
 * construction at all — no ADA ramp, a hard radial abutment."
 *
 * ⛔ MEASURED WITH THE AUTHORED STATE LOADED. `public/looks/<look>/design.json`'s
 * blockCustoms is passed to every sectionPassTile call. Jacob has authored
 * dolman-street-1 | left | segOrd 4 -> materials {outer:'SW', inner:'LU'};
 * a run without it is measuring a different map (CLAUDE.md Layer 0 q3).
 *
 * ⛔ NO LYING ZEROS. Every input this file depends on is asserted non-empty and
 * THROWS if absent. A field that does not exist is a crash, never a printed 0.
 * The instrument itself reuses claims-band-reaches-lu.mjs's `loadInstrumented`,
 * whose anchor-drift guard exits(2) if a patch site moved.
 *
 * RUN:  node scratch/seam-corner-forensic.mjs [--scene lafayette-square]
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { loadInstrumented } from './claims-band-reaches-lu.mjs'

const ROOT  = new URL('..', import.meta.url).pathname
const BAKED = join(ROOT, 'public/baked')
const LOOKS = join(ROOT, 'public/looks')

const argv  = process.argv.slice(2)
const SCENE = argv[argv.indexOf('--scene') + 1] || 'lafayette-square'
const TARGET = [495.8, 115.4]
const TOL    = 3.0          // m — generous; we report the ACTUAL distance found

const must = (v, what) => { if (v == null || (Array.isArray(v) && !v.length)) throw new Error(`⛔ ABSENT INPUT: ${what} — refusing to print a zero`); return v }
const f2 = (x) => (Math.round(x * 100) / 100).toFixed(2)

// ── the seam instrument: expose the five terms at the corner-bid gate ────────
const SEAM_EDITS = [
  { why: 'a seam dump channel + the per-tile partition/stamp facts',
    find: /^export const partitionDump = \{ rows: \[\] \}$/m,
    to: `export const partitionDump = { rows: [] }
export const seamDump = { on: true, ends: [], tiles: [] }` },

  { why: 'THE LOAD-BEARING EDIT. Record each of the five terms at the corner-bid gate SEPARATELY, per run-end, before the return. Nothing is inferred from the CORNER_DUMP row.',
    find: /^          if \(e\.noPed \|\| tipped\[i\] \|\| through\[i\] \|\| isNameTransition\(p, run\) \|\| isThruNode\(p, run\)\) return   \/\/ no asphalt \/ tip \/ T-continuation \/ thru-node \/ name-transition → no corner bid$/m,
    to: `          const _t = { noPed: !!e.noPed, tipped: !!tipped[i], through: !!through[i], nameTransition: !!isNameTransition(p, run), thruNode: !!isThruNode(p, run) }
          const _sup = _t.noPed || _t.tipped || _t.through || _t.nameTransition || _t.thruNode
          if (seamDump.on) seamDump.ends.push({ tile: seamDump.tiles.length - 1, p: [p[0], p[1]], key: k, ri: e.ri,
            skelId: run.skelId, side: run.side, segOrd: run.segOrd, mat: { ...e.mat },
            o: e.o, inn: e.inn, total: e.total, aBase: e.aBase, a: e.a,
            terms: _t, bid: !_sup, partitioned })
          if (_sup) return   // no asphalt / tip / T-continuation / thru-node / name-transition → no corner bid` },

  { why: 'per-tile: does the stamp exist, did the partition establish, how many spans, and what each span owns',
    find: /^    const partitioned = !!spansRaw\?\.length$/m,
    to: `    const partitioned = !!spansRaw?.length
    if (seamDump.on) seamDump.tiles.push({
      hasIaEdge: !!(st.iaEdge && Array.isArray(st.iaEdge)),
      iaEdgeRings: Array.isArray(st.iaEdge) ? st.iaEdge.length : null,
      iaRings: Array.isArray(st.iA) ? st.iA.length : null,
      single: !!single, partitioned, nSpans: spansRaw ? spansRaw.length : 0,
      spans: (spansRaw || []).map(s => ({ r: s.r, i0: s.i0, len: s.len, owner: s.owner, fillet: !!s.fillet })),
      runs: runs.map((r, i) => ({ i, skelId: r.skelId, side: r.side, segOrd: r.segOrd })),
      ring: st.ring,
    })` },
]

// ── load the scene: baked shape + the AUTHORED design ────────────────────────
const shapeP = join(BAKED, SCENE, 'shape.json')
if (!existsSync(shapeP)) throw new Error(`⛔ no shape.json for scene "${SCENE}" at ${shapeP}`)
const bake = JSON.parse(readFileSync(shapeP, 'utf8'))
must(bake.tiles, `${SCENE}/shape.json .tiles`)

const idx = JSON.parse(readFileSync(join(LOOKS, 'index.json'), 'utf8'))
const looks = (idx.looks || idx).filter ? (idx.looks || idx) : []
const look = (Array.isArray(looks) ? looks : []).find(l => l.scene === SCENE && l.id === SCENE)
  || (Array.isArray(looks) ? looks : []).find(l => l.scene === SCENE)
const lookId = look?.id || SCENE
const designP = join(LOOKS, lookId, 'design.json')
if (!existsSync(designP)) throw new Error(`⛔ no design.json at ${designP} — cannot measure with authoring loaded`)
const design = JSON.parse(readFileSync(designP, 'utf8'))
const bc = must(design.blockCustoms, `${lookId}/design.json .blockCustoms (authoring MUST be loaded — Layer 0 q3)`)

// ⛔ prove the specific authored fact this measurement turns on
const DOLMAN = bc['dolman-street-1']?.left?.['4']
if (!DOLMAN?.materials) throw new Error('⛔ dolman-street-1|left|4 .materials is ABSENT from the loaded design — this is the wrong authored state; refusing to measure')

const cw = design.curbWidth      // the construction's curb width lives on the DESIGN, not the bake
if (!Number.isFinite(cw)) throw new Error(`⛔ ${lookId}/design.json carries no numeric curbWidth — the construction cannot be run`)

console.log(`SCENE ${SCENE}  look ${lookId}  tiles ${bake.tiles.length}  cw ${cw}`)
console.log(`AUTHORED (loaded): dolman-street-1|left|4 = ${JSON.stringify(DOLMAN.materials)}  +hw ${DOLMAN.pavementHW}`)
console.log(`blockCustoms: ${Object.keys(bc).length} street(s), ` +
  `${Object.values(bc).flatMap(s => Object.values(s).flatMap(d => Object.keys(d))).length} slot(s)\n`)

const mod = await loadInstrumented(SEAM_EDITS, 'seam')
const { sectionPassTile, seamDump } = mod
if (!seamDump) throw new Error('⛔ seamDump not exported — the instrument did not apply')

for (const st of bake.tiles) sectionPassTile(st, cw, { outer: 'LU', inner: 'SW' }, bc)

if (!seamDump.tiles.length) throw new Error('⛔ 0 tiles reached the partition gate — the instrument is not on the executed path')
if (!seamDump.ends.length) throw new Error('⛔ 0 run-ends reached the corner-bid gate — the instrument is not on the executed path')
console.log(`instrument live: ${seamDump.tiles.length} tile(s) through the partition gate, ${seamDump.ends.length} run-end(s) through the bid gate\n`)

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

// ═══ M0 · THE BRIEF'S PREMISE: IS THERE A MATERIAL SEAM AT ALL? ══════════════
// A premise is a claim, not a fact (CLAUDE.md route step 2). The brief asserts a
// "material seam" at this node. Before measuring what the corner does about it,
// measure whether it exists — i.e. do the two adjacent segments RESOLVE to
// different materials once the authored override is applied over the default?
console.log('═'.repeat(78))
console.log('M0 · PREMISE CHECK — does the authored override CREATE a material seam?')
console.log('═'.repeat(78))
{
  const dolman = seamDump.ends.filter(e => e.skelId === 'dolman-street-1' && e.side === 'left')
  const bySeg = new Map()
  for (const e of dolman) if (!bySeg.has(e.segOrd)) bySeg.set(e.segOrd, e)
  console.log('  dolman-street-1 | left — resolved materials per segOrd, WITH authoring loaded:')
  for (const s of [...bySeg.keys()].sort((a, b) => a - b)) {
    const e = bySeg.get(s)
    const authored = bc['dolman-street-1']?.left?.[String(s)]
    console.log(`      seg${s}: mat = ${e.mat.outer}/${e.mat.inner}   ` +
      `authored materials: ${authored?.materials ? JSON.stringify(authored.materials) : '— (default ordering)'}`)
  }
  const s3 = bySeg.get(3), s4 = bySeg.get(4)
  if (s3 && s4) {
    const same = s3.mat.outer === s4.mat.outer && s3.mat.inner === s4.mat.inner
    console.log(`\n  seg3 = ${s3.mat.outer}/${s3.mat.inner}   seg4 = ${s4.mat.outer}/${s4.mat.inner}   ` +
      `⇒ ${same ? '⛔ IDENTICAL — THERE IS NO MATERIAL SEAM HERE' : '✅ they differ — a real seam'}`)
    if (same) console.log('     The override wrote the materials the §3.1 default ordering already gave.')
  } else console.log('\n  ⛔ seg3 and/or seg4 did not reach the bid gate — cannot compare.')
}

// ═══ M1 · WHICH TERM FIRES AT THE TARGET NODE ════════════════════════════════
console.log('═'.repeat(78))
console.log('M1 · WHICH OF THE FIVE TERMS FIRES AT (495.8, 115.4), PER SIDE')
console.log('═'.repeat(78))
const near = seamDump.ends.map(e => ({ ...e, d: dist(e.p, TARGET) })).filter(e => e.d <= TOL).sort((a, b) => a.d - b.d)
if (!near.length) {
  const closest = seamDump.ends.map(e => ({ ...e, d: dist(e.p, TARGET) })).sort((a, b) => a.d - b.d)[0]
  console.log(`⛔ NO run-end within ${TOL} m of the target. Closest run-end is ${f2(closest.d)} m away`)
  console.log(`   at (${f2(closest.p[0])}, ${f2(closest.p[1])}) — ${closest.skelId}|${closest.side}|${closest.segOrd}`)
  console.log('   ⇒ the brief\'s coordinate does not name a run-end in this build. FLAG, do not proceed on it.')
} else {
  for (const e of near) {
    const fired = Object.entries(e.terms).filter(([, v]) => v).map(([k]) => k)
    console.log(`  tile ${e.tile}  d=${f2(e.d)}m  ${e.skelId}|${e.side}|seg${e.segOrd}  mat=${e.mat.outer}/${e.mat.inner}  o=${f2(e.o)} inn=${f2(e.inn)}`)
    console.log(`      terms: ${JSON.stringify(e.terms)}`)
    console.log(`      ⇒ ${e.bid ? 'BID a corner' : `SUPPRESSED by [${fired.join(', ')}]`}   (tile partitioned: ${e.partitioned})`)
  }
}

// ═══ M2 · DOES THE STAMP EXIST ON THE TILES IN PLAY ══════════════════════════
console.log('\n' + '═'.repeat(78))
console.log('M2 · iaEdge STAMP ON THE TILES IN PLAY (is ③ even executing there?)')
console.log('═'.repeat(78))
const tilesInPlay = [...new Set(near.map(e => e.tile))]
const showTiles = tilesInPlay.length ? tilesInPlay : [10, 19]
if (!tilesInPlay.length) console.log('  (no tile from M1 — falling back to the brief\'s named tiles 10 and 19)')
for (const ti of showTiles) {
  const t = seamDump.tiles[ti]
  if (!t) { console.log(`  tile ${ti}: OUT OF RANGE (only ${seamDump.tiles.length} tiles)`); continue }
  console.log(`  tile ${ti}: hasIaEdge=${t.hasIaEdge} iaEdgeRings=${t.iaEdgeRings} iaRings=${t.iaRings} ` +
    `single=${t.single} partitioned=${t.partitioned} spans=${t.nSpans} runs=${t.runs.length}`)
  if (t.runs.length <= 12) for (const r of t.runs) console.log(`      run ${r.i}: ${r.skelId}|${r.side}|seg${r.segOrd}`)
}
const stamped = seamDump.tiles.filter(t => t.hasIaEdge).length
const part = seamDump.tiles.filter(t => t.partitioned).length
console.log(`  map-wide: ${stamped}/${seamDump.tiles.length} tiles carry iaEdge; ${part}/${seamDump.tiles.length} established a partition`)

// ═══ M3 · DOES bandSpans CUT AT THE SEAM? ════════════════════════════════════
console.log('\n' + '═'.repeat(78))
console.log('M3 · DOES bandSpans EMIT A CUT AT THAT SEAM TODAY? (the load-bearing one)')
console.log('═'.repeat(78))
// The right test is not "is an iA vertex near the node a cut" — iA is the INSET
// curb, displaced from the ring node by the asphalt half-width, so proximity
// proves nothing. The exact question: do the two runs meeting at this node get
// ADJACENT SPANS with DIFFERENT OWNERS — i.e. does bandSpans hand them separate
// arcs, with a cut between?
for (const ti of showTiles) {
  const t = seamDump.tiles[ti]
  if (!t) continue
  if (!t.partitioned) { console.log(`  tile ${ti}: NOT partitioned — bandSpans never ran here. ③ is not executing.`); continue }
  const here = seamDump.ends.filter(e => e.tile === ti && dist(e.p, TARGET) <= TOL)
  if (!here.length) { console.log(`  tile ${ti}: no run-end at the node`); continue }
  const wanted = new Map(here.map(e => [e.ri, e]))
  const st = bake.tiles[ti]
  const m = st.iA[0].length
  const ordered = t.spans.filter(s => s.r === 0).slice().sort((x, y) => x.i0 - y.i0)
  console.log(`  tile ${ti}: ${ordered.length} spans on iA ring 0 (${m} verts). Runs meeting at the node: ` +
    here.map(e => `#${e.ri} ${e.skelId}|${e.side}|seg${e.segOrd}`).join(', '))
  let found = 0
  for (let i = 0; i < ordered.length; i++) {
    const A = ordered[i], B = ordered[(i + 1) % ordered.length]
    if (A.owner === B.owner) continue
    if (!wanted.has(A.owner) || !wanted.has(B.owner)) continue
    found++
    const ea = wanted.get(A.owner), eb = wanted.get(B.owner)
    console.log(`      ✅ CUT between span(owner ${A.owner}) and span(owner ${B.owner}) at iA idx ${(A.i0 + A.len) % m}`)
    console.log(`         ${ea.skelId}|${ea.side}|seg${ea.segOrd} [mat ${ea.mat.outer}/${ea.mat.inner}, asphalt ${f2(ea.a)}m]` +
      `  →  ${eb.skelId}|${eb.side}|seg${eb.segOrd} [mat ${eb.mat.outer}/${eb.mat.inner}, asphalt ${f2(eb.a)}m]`)
    const fillet = ordered.find(s => s.fillet && s.i0 === ((A.i0 + A.len) % m))
    console.log(`         is a fillet arc interposed here? ${fillet ? 'yes' : 'no — a direct abutment'}`)
  }
  if (!found) console.log('      ❌ NO cut between the runs meeting at this node in this tile.')
}

// ═══ M4 · DOES ③'s PATH REACH THE MATERIALS ORDERING? ════════════════════════
console.log('\n' + '═'.repeat(78))
console.log('M4 · DOES ③\'s PARTITION PATH REACH THE MATERIALS ORDERING (:1535)?')
console.log('═'.repeat(78))
console.log('  Answered by source, and it is unambiguous — no probe can say it better:')
console.log('    :1531-1543  every run in `rr` resolves `mat` from runCustom(run).materials over')
console.log('                the :1535 defMat ordering. This loop is BEFORE and OUTSIDE the')
console.log('                `partitioned` branch, so it runs on every tile.')
console.log('    :1867-1873  the PARTITION path groups each run\'s span sectors under')
console.log('                `{ mat: e.mat, ... }` keyed by gkOf(e).')
console.log('    :1672       gkOf(e) = `o|total|mat.outer|mat.inner` — materials ARE in the key.')
console.log('  ⇒ YES. ③\'s band path carries the per-run materials. It is the CORNER path that')
console.log('    never runs, not the materials.')

// ═══ M5 · THE POPULATION ═════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(78))
console.log('M5 · POPULATION — nodes where a MATERIALS CHANGE meets a SUPPRESSED corner bid')
console.log('═'.repeat(78))
// group run-ends by (tile, vertex key); a "seam" = >=2 ends at one vertex whose
// resolved materials differ. Report which of those bid a corner and which did not.
const byNode = new Map()
for (const e of seamDump.ends) {
  const k = `${e.tile}|${e.key}`
  let a = byNode.get(k); if (!a) { a = []; byNode.set(k, a) }
  a.push(e)
}
const matKey = (e) => `${e.mat.outer}/${e.mat.inner}`
const fired = (e) => Object.entries(e.terms).filter(([, v]) => v).map(([t]) => t)

// ⛔ THE NAIVE PREDICATE IS A BAD PROXY AND IS REPORTED ONLY TO KILL IT.
// "two run-ends at one vertex with different materials" is dominated by LEFT vs
// RIGHT of the SAME street (LU/SW vs SW/LU is just the §3.1 treelawn-Y vs
// treelawn-N strip ORDERING). Those two runs face each other across the road;
// they are not adjacent along the band and there is no seam between them.
let naive = 0
for (const [, ends] of byNode) if (ends.length >= 2 && new Set(ends.map(matKey)).size > 1) naive++
console.log(`  [bad proxy, reported to discard it] vertices where ANY two ends' materials differ: ${naive}`)
console.log('     ⇒ dominated by left-vs-right of one street (LU/SW = treelawn-Y ordering,')
console.log('       SW/LU = treelawn-N). Facing runs, not adjacent ones. NOT a seam.\n')

// THE REAL SHAPE: two runs ADJACENT ALONG THE BAND — same skelId, same side,
// different segOrd — meeting at one vertex. That is the along-the-band seam the
// brief is about, and the only place a materials change can abut in the ribbon.
let nAdj = 0, nAdjMat = 0, nAdjSup = 0
const byTerm = {}, examples = [], adjAll = []
for (const [, ends] of byNode) {
  for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
    const a = ends[i], b = ends[j]
    if (a.skelId == null || a.skelId !== b.skelId || a.side !== b.side || a.segOrd === b.segOrd) continue
    nAdj++
    const sup = [a, b].filter(e => !e.bid)
    const matDiff = matKey(a) !== matKey(b)
    adjAll.push({ a, b, matDiff, sup })
    if (matDiff) nAdjMat++
    if (!sup.length) continue
    if (matDiff) {
      nAdjSup++
      for (const e of sup) for (const t of fired(e)) byTerm[t] = (byTerm[t] || 0) + 1
      if (examples.length < 15) examples.push({ a, b })
    }
  }
}
console.log(`  ALONG-BAND adjacencies (same skelId+side, different segOrd, one vertex): ${nAdj}`)
console.log(`  ...of those, where the two segments' resolved MATERIALS DIFFER:         ${nAdjMat}`)
console.log(`  ...of those, where at least one side's corner bid is SUPPRESSED:        ${nAdjSup}`)
console.log(`  suppressing term tally over those ends: ${JSON.stringify(byTerm)}`)
if (!nAdjMat) {
  console.log('\n  ⛔⛔ ZERO along-band material seams exist in this scene — on ANY node, authored or not.')
  console.log('     The population the brief describes has NO members. See M0.')
}
for (const x of examples) {
  console.log(`   · (${f2(x.a.p[0])}, ${f2(x.a.p[1])})  ${x.a.skelId}|${x.a.side}`)
  for (const e of [x.a, x.b]) console.log(`       seg${e.segOrd} mat=${matKey(e)} ` +
    `${e.bid ? 'BID' : 'suppressed[' + fired(e).join(',') + ']'}`)
}
// how the along-band adjacencies resolve overall — the honest denominator
const supNoMat = adjAll.filter(x => !x.matDiff && x.sup.length).length
console.log(`\n  (of the ${nAdj} along-band adjacencies: ${nAdjMat} differ in materials, ` +
  `${supNoMat} are suppressed with IDENTICAL materials — a continuous band, which is correct.)`)
// ═══ M6 · THE SEAM THAT ACTUALLY EXISTS HERE — ASPHALT WIDTH ═════════════════
// M5 found zero material seams. The authored slot on dolman-street-1|left|4
// carries `pavementHW: 5.49` and seg3 carries none, so if a seam exists at this
// node it is a WIDTH seam. Measured here, separately, because it is a different
// class with a different owner.
console.log('\n' + '═'.repeat(78))
console.log('M6 · WIDTH SEAMS along the band (the seam the authored slot actually makes)')
console.log('═'.repeat(78))
let nW = 0, nWSup = 0
const wTerm = {}, wEx = []
for (const [, ends] of byNode) {
  for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
    const a = ends[i], b = ends[j]
    if (a.skelId == null || a.skelId !== b.skelId || a.side !== b.side || a.segOrd === b.segOrd) continue
    if (Math.abs(a.a - b.a) < 0.01) continue
    nW++
    const sup = [a, b].filter(e => !e.bid)
    if (sup.length) { nWSup++; for (const e of sup) for (const t of fired(e)) wTerm[t] = (wTerm[t] || 0) + 1 }
    if (wEx.length < 15) wEx.push({ a, b, sup: sup.length })
  }
}
console.log(`  along-band adjacencies where the ASPHALT half-width differs (>1 cm): ${nW} of ${nAdj}`)
console.log(`  ...of those, with at least one corner bid SUPPRESSED:                ${nWSup}`)
console.log(`  suppressing term tally: ${JSON.stringify(wTerm)}`)
for (const x of wEx) {
  console.log(`   · (${f2(x.a.p[0])}, ${f2(x.a.p[1])})  ${x.a.skelId}|${x.a.side}  ` +
    `seg${x.a.segOrd} a=${f2(x.a.a)}m  vs  seg${x.b.segOrd} a=${f2(x.b.a)}m   ` +
    `Δ=${f2(Math.abs(x.a.a - x.b.a))}m  ${x.sup ? 'corner SUPPRESSED' : 'corner bid'}`)
}
console.log('\n  ⚠️ CLAUDE.md Layer 0, sharpened form: A DIFFERENCE BETWEEN BLOCKS IS THE PRODUCT.')
console.log('     A width change at a cross-street, on the operator\'s own authored slot, is the')
console.log('     authoring gesture working. Reported here as STATE, explicitly NOT as a defect.')

console.log('\n(Phase 1 measurement only. Nothing built, nothing under src/ written.)')
