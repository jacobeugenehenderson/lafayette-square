#!/usr/bin/env node
/**
 * ⛔ RED-UNTIL-TRUE INVARIANT — A10.
 *
 *   ⭐ NO PART OF `fullBand` REACHES `luRemainder`,
 *      EXCEPT THE AUTHORED-SHALLOWER RESIDUAL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT IS STATED ON THE OUTPUT AND NOT ON THE DECISION. A10's agreed sentence
 * (ratified 2026-08-08) settled that the symptom is the BAND, not the corner:
 * "the ring is already partitioned correctly… ends exist only because we make
 * areas out of lines that have ends." A corner declining is a MECHANISM. Band
 * arriving in land-use is THE SYMPTOM THE OPERATOR CAN SEE — an unhonoured
 * takeover is a MISLABEL, not a hole: the released band falls to `luRemainder`
 * and RENDERS AS LAND USE (SECTION §7). So this invariant reads the paint.
 *
 * ⛔ NO CENTERLINE IS READ, NAMED OR REPORTED ANYWHERE IN THIS FILE. The
 * admissible evidence is the asphalt/curb polygon and what the FILL painted on
 * it; every location printed below is a coordinate in the tile's own frame.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐⭐ `luRemainder` HAS MORE THAN ONE ARRIVAL AND ONLY ONE IS A DEFECT. The
 * whole difficulty of this invariant is telling them apart, and it must be told
 * apart FROM THE CONSTRUCTION ITSELF, never from a heuristic about which corner
 * "should" have claimed:
 *
 *   ✅ THE AUTHORED-SHALLOWER RESIDUAL — `luExtra` (tileGround.js, the
 *      `g.total < TLmax + SWmax` route) and, on a single-run tile, `bandRem`
 *      set to `iWrun − iW`. The envelope is per-BLOCK (`WB = cw + max(TL) +
 *      max(SW)` over the tile's edges) while depth is per-EDGE, so an edge
 *      AUTHORED SHALLOWER than the block's envelope legitimately routes its
 *      residual to LU. ⛔ THIS IS THE OPERATOR'S OWN GESTURE — CLAUDE.md
 *      Layer 0 q3. Calling it a defect is the exact failure this file exists
 *      downstream of.
 *
 *   ⛔ THE DEFECT — band the legs released that no corner claimed
 *      (`differenceRings(bandRem, cornerClaimed)`, the final union). This is
 *      the ribbon painted green.
 *
 * ⭐ THE PROPERTY THAT MAKES THIS CHEAP AT GENUINE DEFAULT: with no authoring,
 * every run resolves to the same depths, so `g.total === TLmax + SWmax`, so
 * there IS no authored residual and EVERY arrival is a defect. The invariant is
 * strictly cleanest on the state a fresh town pours into — which is the state
 * town #2 gets. The exclusion only starts earning its keep once authoring is
 * loaded, and the report prints the excluded area every time so it can never
 * quietly swallow a defect.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔⛔ THREE POPULATIONS SHARE EVERY FRAME AND THEY ARE NOT ONE NUMBER
 * (POLYGON-FIRST §5 RULE 3 — one invariant, one defect).
 *
 *   A10   — a tile where every run has ped frontage and no dead-end tip/mouth
 *           exists. Any band in land use here is A10's, exactly. THIS IS THE
 *           NUMBER THE CURE MUST DRIVE TO ZERO.
 *   A0    — a tile carrying a dead-end tip or a mouth. A0's tips are zero-width
 *           slits and the band legitimately WRAPS a cul-de-sac bulb, so a naive
 *           "does this band have an end" test attributes A0's failures to A10
 *           and makes the cure look broken. ⛔ Reported as its own class, never
 *           folded in. (ROADMAP A10: "two failures share every frame — two
 *           tickets, not one.")
 *   NO-PED — a tile with a run whose asphalt edge is zero (a boundary edge, a
 *           median-facing side): no street, so no ped band is owed, but the
 *           mono-width annulus still runs the whole ring and that arc lands in
 *           LU. NOT attributable from outside the construction ⇒ its own LOUD
 *           class with an area, never a skip and never a magnitude
 *           (POLYGON-FIRST §5 RULE 2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW IT MEASURES WITHOUT TOUCHING `src/` — and without RESTATING it.
 * `fullBand`, the authored residual and the no-ped run count are internal to
 * `sectionPassTile` and are not returned. Re-deriving them out here would be a
 * restatement that drifts (CLAUDE.md: "a check must READ the source, never
 * restate it"). So this file copies `src/lib/tileGround.js` to `scratch/.band-
 * probe/`, applies a declared list of source edits — EACH ASSERTED TO MATCH
 * EXACTLY ONCE, a zero- or multi-match aborts rather than measuring a silently
 * unapplied instrument — and imports the copy. Nothing under `src/` is written.
 * The Clipper ops are re-EXPORTED from that same copy rather than reimplemented,
 * so the arithmetic here is the construction's own.
 *
 * ⭐ THE INSTRUMENT IS PROVEN INERT: `--inert` re-measures the FILL through the
 * untouched module and through the instrumented copy and asserts the outputs are
 * byte-identical. An instrument that changes what it measures is worse than none.
 *
 * ⛔ READ-ONLY except `scratch/.band-probe/`. Reads `public/baked/<scene>/
 *    shape.json`, `public/looks/index.json`, `public/looks/<look>/design.json*`.
 *
 * USAGE
 *   node scratch/claims-band-reaches-lu.mjs              # every state, all classes
 *   node scratch/claims-band-reaches-lu.mjs --only lafayette-square/lafayette-square/default
 *   node scratch/claims-band-reaches-lu.mjs --rows 40    # the worst offenders, located
 *   node scratch/claims-band-reaches-lu.mjs --inert      # prove the instrument changes nothing
 *
 * EXIT 0 only when the A10 class is empty on every state measured.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

const ROOT   = new URL('..', import.meta.url).pathname
const BAKED  = join(ROOT, 'public/baked')
const LOOKS  = join(ROOT, 'public/looks')
const SRCDIR = join(ROOT, 'src/lib')
const TG     = join(SRCDIR, 'tileGround.js')
const TMP    = join(ROOT, 'scratch/.band-probe')

// ── the instrument: a declared list of source edits ──────────────────────────
// Each entry names WHAT it exposes and WHY the construction cannot be asked from
// outside. All are pure additions — no existing expression is altered, which is
// what `--inert` then proves rather than asserts.
export const BAND_PROBE_EDITS = [
  { why: 'export a band dump channel + the module\'s OWN Clipper ops (never a second implementation)',
    find: /export const cornerDump = \{ on: \(typeof process !== 'undefined' && process\.env\?\.CORNER_DUMP === '1'\), rows: \[\] \}/,
    to: (m) => `${m}\nexport const bandDump = { on: true, rows: [] }\nexport const bandOps = { intersectRings, differenceRings, unionRings, circlePoly }` },

  { why: 'count the runs with NO ped frontage — the third population, invisible from outside',
    find: /^    const rr = \[\]$/m,
    to: '    let _noPed = 0\n    const rr = []' },
  { why: 'the no-asphalt predicate is where that population is decided (it no longer DROPS the run — the run stays in the partition at zero ped depth; the population is still counted here)',
    find: /^      const noPed = aBase <= 1e-6$/m,
    to: '      const noPed = aBase <= 1e-6; if (noPed) _noPed++' },

  { why: 'capture the AUTHORED-SHALLOWER residual of a single-run tile (iWrun − iW)',
    find: /^    const luExtra = \[\] +\/\/ authored-shallower band residual along legs → LU$/m,
    to: '    const luExtra = []; let _singleResidual = []   // authored-shallower band residual along legs → LU' },
  { find: /^      bandRem = differenceRings\(iWrun, iW\) +\/\/ authored-shallower residual → LU$/m,
    why: 'the single-run tile routes its whole residual through bandRem, not luExtra',
    to: '      bandRem = differenceRings(iWrun, iW); _singleResidual = bandRem   // authored-shallower residual → LU' },

  { why: 'emit fullBand, the authored residual and the FINAL land-use paint, in one place, in scope',
    find: /^    pushLu\(luByLu, lu, luRemainder\) +\/\/ land-use remainder \(per class\)$/m,
    to: `    pushLu(luByLu, lu, luRemainder)                 // land-use remainder (per class)
    if (bandDump.on) bandDump.rows.push({
      fullBand,
      authored: unionRings([...luExtra, ..._singleResidual]),
      lu: [].concat(...Object.values(luByLu)),
      noPed: _noPed,
      nRuns: runs.length,
      // A0's OWN footprint, in the construction's own radii — never a tuned
      // distance. Per dead-end tip: the cap disc \`hw + cw + tl + sw + 1\` that
      // the G8 reclaim itself uses (:1693). Per mouth: the frozen mouth disc
      // (ctr, R) the shape pass wrote. Anything under these is A0's population.
      a0: [...(roundTips || []), ...(bluntTips || [])].map(t => ({ c: t.p, r: t.hw + cw + (t.tl || 0) + (t.sw || 0) + 1 }))
        .concat((mouths || []).filter(m => m.ctr && Number.isFinite(m.R)).map(m => ({ c: m.ctr, r: m.R }))),
    })` },
]

/**
 * Build + import an instrumented copy of tileGround.js.
 * `extraEdits` lets D2 compose its own mutation on top of the instrument, so the
 * mutant roster and this invariant never diverge in how they load the module.
 */
export async function loadInstrumented(extraEdits = [], tag = 'probe') {
  const src = readFileSync(TG, 'utf8')
  let out = src
  for (const e of [...BAND_PROBE_EDITS, ...extraEdits]) {
    const hits = out.match(new RegExp(e.find.source, e.find.flags.includes('m') ? 'gm' : 'g')) || []
    if (hits.length !== 1) {
      console.error(`⛔ INSTRUMENT ANCHOR DRIFTED — pattern matched ${hits.length} time(s), expected exactly 1:`)
      console.error(`   ${e.find}`)
      console.error(`   ${e.why || '(mutant)'}`)
      console.error(`   The edit would be silently unapplied and every number below would be a FALSE GREEN.`)
      console.error(`   Re-anchor against src/lib/tileGround.js before trusting any run.`)
      process.exit(2)
    }
    out = out.replace(e.find, typeof e.to === 'function' ? e.to : e.to)
  }
  // relative specifiers → absolute, so the copy resolves from scratch/
  out = out.replace(/(from\s*['"])(\.[^'"]*)(['"])/g, (_, a, spec, z) => a + resolve(SRCDIR, spec) + z)
  mkdirSync(TMP, { recursive: true })
  const p = join(TMP, `tileGround.${tag}.mjs`)
  writeFileSync(p, out)
  return await import(p)
}

// ── geometry helpers that are NOT restatements of the construction ───────────
// (area/centroid of a ring is plane geometry, not a tileGround decision.)
const ringArea = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
const areaOf = (rings) => (rings || []).reduce((s, r) => s + ringArea(r), 0)
const centroid = (r) => { let a = 0, cx = 0, cy = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; const f = p[0] * q[1] - q[0] * p[1]; a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f } a /= 2; return a ? [cx / (6 * a), cy / (6 * a)] : r[0] }

// The mm grid Clipper quantises to (SCALE = 1000 in tileGround) puts a floor on
// what any area here can mean. Stated, printed, and NEVER used to skip: area
// below it is reported on its own line, not silently dropped.
export const NOISE_M2 = 1e-4

// ⭐ THE FLOOR AT WHICH A REGION IS CALLED "AN END", and why it is not a knob.
// The boolean ops between concentric offset rings throw off sliver artifacts —
// and they are a SEPARATE POPULATION, not a tail. Measured across all 8 states
// (`node -e` over the ring areas): Lafayette Square carries 140 positive regions
// above 1e-4 m² but only 41 above 1e-3 and 38 above 1e-2 — a hundred of them are
// crammed into a 0.1–1 cm² band and the count is FLAT either side of 1e-3. The
// floor therefore sits in a gap, not on a slope, and moving it by a factor of
// ten changes the end count by three.
// ⛔ IT IS NOT A SKIP (POLYGON-FIRST §5 RULE 2): every m² below it is still in
// the area totals and is printed on its own line. Only the NAMING of a discrete
// end is gated — an artifact 3 cm on a side is not a sidewalk that stopped.
export const END_M2 = 1e-3

/**
 * Classify one tile's band-in-land-use into the three populations. Pure; shared
 * with D2 so the two files cannot drift on what "a band end" is.
 *
 * ⭐ THE SPLIT IS GEOMETRIC, NOT PER-TILE. An earlier cut of this file sent a
 * whole tile to A0 the moment it carried one dead-end tip — which HIDES every
 * A10 defect on that tile, i.e. it fails toward "fine" (POLYGON-FIRST §5 RULE
 * 1b's exact shape). The defect region is instead SUBTRACTED against A0's own
 * frozen footprint: the cap disc the G8 reclaim itself uses, and the mouth disc
 * the shape pass froze. No tuned distance appears anywhere.
 *
 *   NO-PED  a tile carrying a run with no asphalt edge. The mono-width annulus
 *           still runs the whole ring but no ped band is owed there, and WHICH
 *           arc that is cannot be recovered from outside ⇒ the tile's whole
 *           defect is unattributable. ⛔ Its own LOUD class, never a skip and
 *           never folded into A10 (RULE 2). Takes precedence: nothing on such a
 *           tile is attributable.
 *   A0      defect inside a frozen dead-end/mouth disc — the band faithfully
 *           wrapping a bulb, or the zero-width slit. ⇒ ticket A0.
 *   A10     everything else. ⭐ THIS is the number the cure must drive to zero.
 *
 *   ends    the connected components of the A10 region — the "band ends" the
 *           agreed sentence is about. A cure REMOVES an end; shrinking one is
 *           not a service.
 */
export function classifyTile(row, ops) {
  const bandInLu = ops.intersectRings(row.fullBand, row.lu)
  const defect = row.authored.length ? ops.differenceRings(bandInLu, row.authored) : bandInLu
  const comps = (rings) => rings.filter(r => ringArea(r) > END_M2)
    .map(r => ({ c: centroid(r).map(v => +v.toFixed(2)), a: +ringArea(r).toFixed(3) }))
    .sort((x, y) => y.a - x.a)

  const out = {
    bandArea: areaOf(row.fullBand),
    authoredArea: areaOf(row.authored),
    defectArea: areaOf(defect),
    noPed: row.noPed, nRuns: row.nRuns,
    // the envelope fingerprint — a cure that MOVES fullBand is not painting from
    // the partition, it is re-architecting the sacrosanct mono-width envelope.
    fullBandKey: `${row.fullBand.length}:${areaOf(row.fullBand).toFixed(4)}`,
    a0Discs: row.a0.length,
    a10: [], a0: [], noPedArea: 0, ends: [],
  }
  if (row.noPed > 0) { out.noPedArea = out.defectArea; out.a0 = []; out.ends = []; return out }

  const zone = row.a0.length ? ops.unionRings(row.a0.map(d => ops.circlePoly(d.c[0], d.c[1], d.r))) : []
  const inA0 = zone.length ? ops.intersectRings(defect, zone) : []
  const rest = zone.length ? ops.differenceRings(defect, zone) : defect
  out.a0 = comps(inA0)
  out.ends = comps(rest)
  // The regions themselves, for D2's end-matching. A "band end that no longer
  // exists" is decided by OVERLAP against the other run's region — never by a
  // centroid-distance tolerance, which would be a tuned knob deciding the verdict.
  out.a10Rings = rest.filter(r => ringArea(r) > END_M2)
    .map(r => r.map(p => [+p[0].toFixed(3), +p[1].toFixed(3)]))   // mm — Clipper's own grid, lossless
  out.a0Area = areaOf(inA0)
  out.a10Area = areaOf(rest)
  out.dust = out.a10Area - out.ends.reduce((s, e) => s + e.a, 0)
  return out
}

// ═════════════════════════════════════════════════════════════════════════════
// Everything below runs only when this file is the entry point; D2 imports the
// pieces above.
// ═════════════════════════════════════════════════════════════════════════════
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('claims-band-reaches-lu.mjs')) {
  const argv = process.argv.slice(2)
  const opt = (n) => { const i = argv.indexOf(`--${n}`); return i < 0 ? null : (argv[i + 1] ?? '') }
  const ONLY = opt('only')
  const ROWS = argv.includes('--rows') ? (+opt('rows') || 20) : 0
  const INERT = argv.includes('--inert')

  const mod = await loadInstrumented()
  const { sectionPassTile, bandDump, bandOps } = mod
  if (!bandDump?.on) { console.error('⛔ the band dump is not armed — the instrument did not apply. Nothing measured.'); process.exit(2) }

  // ── states, by predicate (claims-corner-delta's method, unchanged) ─────────
  const readBake = (scene) => {
    const p = join(BAKED, scene, 'shape.json')
    if (!existsSync(p)) return null
    const raw = JSON.parse(readFileSync(p, 'utf8'))
    const tiles = Array.isArray(raw) ? raw : (raw.tiles || [])
    const triples = new Set()
    for (const t of tiles) for (const r of (t.runs || [])) triples.add(`${r.skelId}|${r.side}|${r.segOrd}`)
    return { scene, tiles, triples }
  }
  const bakes = new Map()
  for (const d of readdirSync(BAKED)) {
    if (!statSync(join(BAKED, d)).isDirectory()) continue
    const b = readBake(d); if (b) bakes.set(d, b)
  }
  const idx = JSON.parse(readFileSync(join(LOOKS, 'index.json'), 'utf8'))
  const states = [], notChecked = []
  for (const l of idx.looks) {
    const dir = join(LOOKS, l.id)
    if (!existsSync(dir)) { notChecked.push([l.id, 'registered in index.json but has no look directory']); continue }
    if (!l.scene || !bakes.has(l.scene)) { notChecked.push([l.id, `no bake for scene "${l.scene}"`]); continue }
    const variants = readdirSync(dir).filter(f => f === 'design.json' || f.startsWith('design.json.'))
    if (!variants.length) { notChecked.push([l.id, 'no design.json — the authored state cannot be loaded']); continue }
    for (const f of variants.sort()) {
      const variant = f === 'design.json' ? 'default' : f.slice('design.json.'.length)
      let design = null
      try { design = JSON.parse(readFileSync(join(dir, f), 'utf8')) } catch (e) { notChecked.push([`${l.scene}/${l.id}/${variant}`, `${f} unreadable — ${e.message}`]); continue }
      states.push({ id: `${l.scene}/${l.id}/${variant}`, scene: l.scene, design, file: f })
    }
  }
  const selected = states.filter(s => !ONLY || s.id.includes(ONLY))
  if (!selected.length) { console.error(`⛔ no state matched${ONLY ? ` --only "${ONLY}"` : ''}. Nothing measured — this is NOT a pass.`); process.exit(2) }

  // ── --inert: the instrument must not change what it measures ──────────────
  if (INERT) {
    const clean = await import(TG)
    const { createHash } = await import('crypto')
    const h = (o) => createHash('sha256').update(JSON.stringify(o, (k, v) => (typeof v === 'number' ? +v.toFixed(6) : v))).digest('hex').slice(0, 16)
    let bad = 0
    console.log('\nINERT CHECK — the same tiles through the untouched module and the instrumented copy.\n')
    for (const s of selected) {
      const bake = bakes.get(s.scene), cw = s.design?.curbWidth
      if (!Number.isFinite(cw)) continue
      const bc = s.design.blockCustoms || null
      const A = [], B = []
      for (const st of bake.tiles) {
        bandDump.rows.length = 0
        A.push(h(clean.sectionPassTile(st, cw, { outer: 'LU', inner: 'SW' }, bc)))
        B.push(h(sectionPassTile(st, cw, { outer: 'LU', inner: 'SW' }, bc)))
        bandDump.rows.length = 0
      }
      const ok = h(A) === h(B)
      if (!ok) bad++
      console.log(`  ${ok ? '✅' : '⛔'} ${s.id.padEnd(52)} ${bake.tiles.length} tiles  ${ok ? 'byte-identical' : 'THE INSTRUMENT CHANGED THE OUTPUT'}`)
    }
    console.log(bad ? '\n⛔ THE INSTRUMENT IS NOT INERT — every number it produces is suspect.'
                    : '\n✅ INERT — the instrument observes and changes nothing.')
    process.exit(bad ? 1 : 0)
  }

  // ── measure ───────────────────────────────────────────────────────────────
  console.log('\n⛔ RED-UNTIL-TRUE — "no part of fullBand reaches luRemainder, except the authored-shallower residual."')
  console.log('   A10 is the only class the cure owns. A0 (dead-end tips / mouths) and NO-PED are separate tickets')
  console.log('   and are NEVER folded into A10\'s count — two failures share every frame (ROADMAP A10).\n')

  let redStates = 0, measured = 0
  for (const s of selected) {
    const bake = bakes.get(s.scene)
    const cw = s.design?.curbWidth
    if (!Number.isFinite(cw)) { notChecked.push([s.id, `${s.file} has no numeric curbWidth — the construction cannot be run`]); continue }
    if (!bake.tiles.length) { notChecked.push([s.id, 'shape.json carries 0 tiles']); continue }
    const bc = s.design.blockCustoms || null

    // slot resolution, at the TRIPLE — the definition, never the street proxy
    let slots = 0, resolved = 0
    for (const sk in (bc || {})) for (const sd in bc[sk]) for (const so in bc[sk][sd]) {
      slots++; if (bake.triples.has(`${sk}|${sd}|${so}`)) resolved++
    }

    const rows = []
    for (const [i, st] of bake.tiles.entries()) {
      bandDump.rows.length = 0
      try { sectionPassTile(st, cw, { outer: 'LU', inner: 'SW' }, bc) }
      catch (e) { bandDump.rows.length = 0; console.log(`   ⛔ LOUD — tile ${i} threw (${e.message}); never a skip.`); continue }
      for (const row of bandDump.rows) {
        const c = classifyTile(row, bandOps)
        if (c.bandArea <= NOISE_M2) continue      // no band on this tile ⇒ nothing to say about the band
        rows.push({ i, ...c })
      }
      bandDump.rows.length = 0
    }
    measured++

    const sum = (a, f) => a.reduce((s, x) => s + f(x), 0)
    const noPedT = rows.filter(t => t.noPed > 0)
    const attr   = rows.filter(t => t.noPed === 0)
    const a0T    = attr.filter(t => t.a0.length)
    const redT   = attr.filter(t => t.ends.length)

    console.log(`── ${s.id} ──  ${bake.tiles.length} tiles · cw=${cw} · from ${s.file}`)
    console.log(`   authoring: ${resolved}/${slots} blockCustoms slot(s) resolve at the skelId|side|segOrd TRIPLE` +
                (slots ? '' : '   (genuine default — every arrival at luRemainder is a defect, the exclusion below MUST be 0)'))
    console.log(`   ✅ authored-shallower residual EXCLUDED: ${sum(rows, t => t.authoredArea).toFixed(2)} m²` +
                `  ← the operator's own gesture (Layer 0 q3), never a defect`)
    console.log(`   ⛔ A10   ⭐ THIS TICKET, the number the cure must zero      tiles ${String(redT.length).padStart(4)} · ends ${String(sum(redT, t => t.ends.length)).padStart(4)} · ${sum(attr, t => t.a10Area).toFixed(1).padStart(9)} m²`)
    console.log(`   ·  A0    dead-end/mouth disc — OTHER TICKET, never folded  tiles ${String(a0T.length).padStart(4)} · rgns ${String(sum(a0T, t => t.a0.length)).padStart(4)} · ${sum(attr, t => t.a0Area).toFixed(1).padStart(9)} m²`)
    console.log(`   ⛔ NO-PED a run with no asphalt edge — UNATTRIBUTABLE, LOUD tiles ${String(noPedT.length).padStart(4)} ·             ${sum(noPedT, t => t.noPedArea).toFixed(1).padStart(9)} m²`)
    console.log(`      A10 area not in a NAMED end — sub-${END_M2} m² boolean slivers + interior holes (counted above, never dropped): ${sum(attr, t => t.dust).toFixed(4)} m²`)

    if (redT.length) {
      redStates++
      const worst = redT.slice().sort((x, y) => y.a10Area - x.a10Area)
      console.log(`   ⛔ RED — band reaches land use on ${redT.length} A10 tile(s), ${sum(attr, t => t.a10Area).toFixed(1)} m². WHERE:`)
      for (const t of worst.slice(0, ROWS || 6)) {
        console.log(`      tile ${String(t.i).padStart(4)}  ${t.a10Area.toFixed(1).padStart(7)} m² in ${String(t.ends.length).padStart(2)} end(s)` +
                    `   at ${t.ends.slice(0, 3).map(x => `(${x.c[0]}, ${x.c[1]})=${x.a}m²`).join('  ')}`)
      }
      if (!ROWS && worst.length > 6) console.log(`      … ${worst.length - 6} more — \`--rows 40\` for the full list.`)
    } else {
      console.log(`   ✅ GREEN on the A10 class — every m² of fullBand is claimed by a run or a corner.`)
    }
    console.log('')
  }
  for (const [id, why] of notChecked) console.log(`⛔ NOT CHECKED — ${id}: ${why}\n   Read nothing into its absence.`)

  console.log('══ VERDICT ══')
  if (!measured) { console.log('⛔ nothing was measured. That is not a pass.'); process.exit(2) }
  if (redStates) {
    console.log(`⛔ RED on ${redStates} of ${measured} state(s). The invariant is FALSE: band is reaching luRemainder`)
    console.log(`   with no authored-shallower gesture to explain it. This is the sidewalk the operator sees stop.`)
    process.exit(1)
  }
  console.log(`✅ GREEN on all ${measured} state(s) — every m² of fullBand is claimed by a run or a corner.`)
  process.exit(0)
}
