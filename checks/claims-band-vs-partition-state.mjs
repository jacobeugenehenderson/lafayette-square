#!/usr/bin/env node
/**
 * ⛔ THE QUESTION: where a street's TWO SIDES land in different PARTITION STATES,
 *    does the ped band differ on the two sides at the same station — and is
 *    `0-no-stamp` / `3-spans-empty` the predictor?
 *
 * ⭐ THE CONTROLLED COMPARISON IS ALREADY IN THE ARTIFACT AND IS NOT CONSTRUCTED.
 * Every street chain derives TWO runs — `left` and `right` — at the SAME `skelId`
 * and `segOrd`, spanning the SAME block, and they live in DIFFERENT tiles. So each
 * (skelId, segOrd) pair is a matched pair: one centreline, one authored width pair,
 * two tiles, two partition states. Nothing here is fabricated and nothing is a
 * per-street constant.
 *
 * ⛔⛔ THE TRAP THIS CHECK IS BUILT AROUND — a divided MEDIAN tile correctly has NO
 * BAND. The shape pass freezes `tl = sw = 0` on a median tile (`tileGround.js:4002`)
 * and `sectionPassTile` reads that as `pedOff` (`:1635`). That is a FROZEN FACT in
 * the artifact, not an inference, so this check separates:
 *    NO-BAND-OWED   the tile froze ped at zero, or the run's own `pavementHW` is 0
 *                   (edge of the drawing / a median face) → NEITHER pass nor fail
 *    OWED           the tile owes this run a band → measurable
 * A run in the first bucket is never summed with the second. Folding them is what
 * makes a legitimate absence hide inside a broken one
 * (`project_band_continuity_is_the_acceptance`).
 *
 * WHAT IT MEASURES, per run, from the REAL fill (`sectionPassTile`, authoring on):
 *   at N stations along the run, march the WHOLE inward normal, find the painted
 *   extent, and compare its THICKNESS to the depth the run is OWED
 *   (`resolvePedDepths` — the same resolver the builder uses). `cover` = painted
 *   thickness / owed; a `break` is a station under 50%. ⛔ The depth owed is read
 *   per-run from the scene's own frozen measure + its own blockCustoms, never a
 *   constant — and the metric never assumes WHERE the band starts (see below).
 *
 * ⛔ A DIFFERENCE BETWEEN THE TWO SIDES IS THE PRODUCT (CLAUDE.md Layer 0). This
 *    check does NOT report that sides differ. It reports whether the SIGN of the
 *    difference tracks PARTITION STATE — i.e. whether the unpartitioned side is the
 *    one that loses band. A symmetric spread across states is a NULL result and is
 *    printed as one.
 *
 * ⛔ NOT MEASURED, never zero: a scene whose artifact carries no `iaEdge`/`producer`
 *    stamp cannot be staged at all and exits 2.
 *
 * Usage: node scratch/claims-band-vs-partition-state.mjs [--scene <name>] [--all]
 *                                                       [--pairs] [--stations N]
 * Exit 0 = measured   1 = partition state predicts band loss   2 = NOT MEASURED
 * → RIBBONS §1 (invariant 4, diagnostic step 3) · SECTION §3.3 · ROADMAP A10
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ringRunOwners, bandSpans, sectionPassTile, resolvePedDepths } from '../src/lib/tileGround.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const arg = (f) => argv.includes(f) ? argv[argv.indexOf(f) + 1] : null
const showPairs = argv.includes('--pairs')
const NSTA = Number(arg('--stations') || 9)
const NDEP = 8
const scenes = argv.includes('--all')
  ? fs.readdirSync(path.join(ROOT, 'public/baked')).filter(s => fs.existsSync(path.join(ROOT, 'public/baked', s, 'shape.json')))
  : [arg('--scene') || 'lafayette-square']

// ── the ladder, imported not restated (same gate as claims-producer-does-not-decide) ──
const stageOf = (st) => {
  if (!Array.isArray(st.iaEdge)) return `0-no-stamp`
  if ((st.runs || []).length === 1) return '1-single-run-bypass'
  const own = ringRunOwners(st)
  if (!own) return '2-owners-null'
  const sp = bandSpans(st, own)
  return (sp && sp.length) ? '4-PARTITIONED' : '3-spans-empty'
}

// even-odd containment — the parity clipper itself means
const inRings = (rings, p) => {
  let c = false
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const yi = r[i][1], yj = r[j][1]
    if ((yi > p[1]) !== (yj > p[1])) {
      const x = r[i][0] + (p[1] - yi) / (yj - yi) * (r[j][0] - r[i][0])
      if (x > p[0]) c = !c
    }
  }
  return c
}
const cumLen = (poly) => {
  const c = [0]
  for (let i = 1; i < poly.length; i++) c.push(c[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]))
  return c
}
const atFrac = (poly, cl, f) => {
  const target = cl[cl.length - 1] * f
  let i = 1; while (i < cl.length - 1 && cl[i] < target) i++
  const t = (target - cl[i - 1]) / ((cl[i] - cl[i - 1]) || 1)
  const p = [poly[i - 1][0] + (poly[i][0] - poly[i - 1][0]) * t, poly[i - 1][1] + (poly[i][1] - poly[i - 1][1]) * t]
  const dx = poly[i][0] - poly[i - 1][0], dy = poly[i][1] - poly[i - 1][1]
  const L = Math.hypot(dx, dy) || 1
  return { p, dir: [dx / L, dy / L] }
}

let worstExit = 0
for (const scene of scenes) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/baked', scene, 'shape.json'), 'utf8'))
  const tiles = Array.isArray(raw) ? raw : (raw.tiles || [])
  const designP = path.join(ROOT, 'public/looks', scene, 'design.json')
  const design = fs.existsSync(designP) ? JSON.parse(fs.readFileSync(designP, 'utf8')) : {}
  const bc = design.blockCustoms || null
  const CW = design.curbWidth ?? 0.1524

  console.log(`\n═══ ${scene} — ${tiles.length} tiles · blockCustoms: ${bc ? `${Object.keys(bc).length} authored` : 'NONE'} · curbWidth ${CW}`)
  if (!tiles.length || !tiles.some(t => t.producer) || !tiles.some(t => Array.isArray(t.iaEdge))) {
    console.log(`   ⛔ NOT MEASURED — this artifact carries no \`producer\`/\`iaEdge\` stamp, so no tile can be`)
    console.log(`      staged. It is NOT "0 partitioned"; it is unanswerable. Re-freeze before quoting.`)
    worstExit = Math.max(worstExit, 2); continue
  }

  // ── per-run measurement ──
  const byRun = new Map()   // `${skelId}|${segOrd}|${side}` → record
  for (const [ti, st] of tiles.entries()) {
    const stage = stageOf(st)
    const tilePedOff = ((st.tl || 0) + (st.sw || 0)) <= 1e-6    // FROZEN median fact (:4002/:1635)
    let out = null
    try { out = sectionPassTile(st, CW, { outer: 'LU', inner: 'SW' }, bc) } catch (e) { out = null }
    const SW = out ? out.Wacc : [], TL = out ? Object.values(out.tlByLu).flat() : []
    const iA = st.iA || []
    for (const run of (st.runs || [])) {
      if (!run.skelId || run.segOrd == null || !run.poly || run.poly.length < 2) continue
      const aBase = Math.max(0, run.baseMeasure?.[run.side]?.pavementHW ?? 0)
      const noPed = aBase <= 1e-6
      const c = bc?.[run.skelId]?.[run.side]?.[run.segOrd] || null
      const ped = (tilePedOff || noPed) ? { tl: 0, sw: 0, hasTL: false } : resolvePedDepths(run.baseMeasure, run.side, c)
      const owed = (ped.tl || 0) + (ped.sw || 0)
      const rec = {
        ti, stage, side: run.side, skelId: run.skelId, segOrd: run.segOrd,
        owed, aBase, tilePedOff, noPed, sectionThrew: !out,
        len: cumLen(run.poly).at(-1), cover: null, breaks: null, stations: 0, normal: null, byStation: {},
      }
      byRun.set(`${run.skelId}|${run.segOrd}|${run.side}`, rec)
      if (owed <= 1e-6 || !out) continue          // NO-BAND-OWED → not measurable, not a fail

      const cl = cumLen(run.poly)
      if (cl.at(-1) < 1) continue
      let covSum = 0, brk = 0, n = 0, nrm = null
      for (let k = 0; k < NSTA; k++) {
        const f = (k + 0.5) / NSTA
        const { p, dir } = atFrac(run.poly, cl, f)
        // inward normal: the side on which the band lives is the side INSIDE `iA`
        // (the frozen inner-curb ring). Decided per station from the artifact.
        const cand = [[dir[1], -dir[0]], [-dir[1], dir[0]]]
        let nn = null
        for (const v of cand) {
          const q = [p[0] + v[0] * (aBase + CW + Math.min(0.3, owed / 2)), p[1] + v[1] * (aBase + CW + Math.min(0.3, owed / 2))]
          if (iA.length && inRings(iA, q)) { nn = v; break }
        }
        if (!nn) continue
        nrm = nrm || (nn === cand[0] ? 'R' : 'L')
        // ⛔⛔ PLACEMENT-INDEPENDENT BY CONSTRUCTION. An earlier version of this
        // check sampled a FIXED window [aBase+cw, aBase+cw+owed] and reported 112
        // of 392 runs "broken" — every one of which turned out to carry a FULL
        // band a couple of metres inboard of where `baseMeasure.pavementHW` put
        // it. The window was wrong, not the map. So do NOT assume where the band
        // starts: march the whole normal, find the painted extent, and compare its
        // THICKNESS to the depth owed. Thickness cannot be faked by a bad datum.
        let first = null, last = null, tot = 0
        const STEP = 0.05
        for (let d = STEP; d < aBase + CW + owed + 12; d += STEP) {
          const q = [p[0] + nn[0] * d, p[1] + nn[1] * d]
          if (inRings(SW, q) || inRings(TL, q)) { if (first === null) first = d; last = d; tot += STEP }
        }
        const cov = Math.min(1, tot / owed)
        covSum += cov; if (cov < 0.5) brk++; n++
        rec.byStation[k] = cov
      }
      if (n) { rec.cover = covSum / n; rec.breaks = brk; rec.stations = n; rec.normal = nrm }
    }
  }

  // ── the matched pairs: one centreline, two sides, two tiles ──
  const pairs = []
  for (const [k, L] of byRun) {
    if (L.side !== 'left') continue
    const R = byRun.get(k.replace(/\|left$/, '|right'))
    if (!R) continue
    pairs.push({ id: `${L.skelId}|${L.segOrd}`, L, R })
  }

  // bucket every pair BEFORE any comparison
  const owedBoth = [], owedOne = [], owedNeither = [], unmeasured = []
  for (const pr of pairs) {
    const lo = pr.L.owed > 1e-6, ro = pr.R.owed > 1e-6
    if (!lo && !ro) owedNeither.push(pr)
    else if (lo !== ro) owedOne.push(pr)
    else if (pr.L.cover == null || pr.R.cover == null) unmeasured.push(pr)
    else owedBoth.push(pr)
  }
  console.log(`\n   matched (skelId,segOrd) pairs: ${pairs.length}`)
  console.log(`      ${String(owedBoth.length).padStart(4)}  band OWED on BOTH sides and measurable   ← the only comparable population`)
  console.log(`      ${String(owedOne.length).padStart(4)}  band owed on ONE side only               ← asymmetric by construction, reported apart`)
  console.log(`      ${String(owedNeither.length).padStart(4)}  NO BAND OWED either side                 ← legitimately bandless, NEITHER pass nor fail`)
  console.log(`      ${String(unmeasured.length).padStart(4)}  owed both but a side could not be sampled (no iA / short run)`)

  // ── the actual test: does band loss track partition state? ──
  const bad = (r) => r.stage === '0-no-stamp' || r.stage === '3-spans-empty'
  const split = owedBoth.filter(pr => bad(pr.L) !== bad(pr.R))     // sides in DIFFERENT states
  const same = owedBoth.filter(pr => bad(pr.L) === bad(pr.R))
  console.log(`\n   of the comparable pairs: ${split.length} straddle the state boundary (one side 0/3, the other not), ${same.length} do not`)
  if (!split.length) {
    console.log(`   ⛔ NO STRADDLING PAIR EXISTS — the question as posed is NOT ANSWERABLE on this scene.`)
    console.log(`      Reporting this rather than a zero. The two sides of a street land in the SAME`)
    console.log(`      partition state, so partition state cannot be tested as a per-side predictor here.`)
  } else {
    let lower = 0, higher = 0, tied = 0
    for (const pr of split) {
      const badSide = bad(pr.L) ? pr.L : pr.R, okSide = bad(pr.L) ? pr.R : pr.L
      const d = badSide.cover - okSide.cover
      if (d < -0.02) lower++; else if (d > 0.02) higher++; else tied++
    }
    console.log(`      unpartitioned side has LOWER cover: ${lower}   HIGHER: ${higher}   tied(±0.02): ${tied}`)
    // ⛔ The label must match the numbers. A consistent sign over 2 pairs is a
    // consistent sign over 2 pairs — not a predictor, and not "mixed" either.
    if (lower === 0 && higher === 0) {
      console.log(`   ✅ NULL RESULT — straddling pairs show no cover difference. State does not predict.`)
    } else if (lower > 0 && higher === 0 && split.length >= 8) {
      console.log(`   ⛔ PARTITION STATE PREDICTS BAND LOSS on this scene (n=${split.length}).`)
      worstExit = Math.max(worstExit, 1)
    } else if (lower > 0 && higher === 0) {
      console.log(`   ⚠️  SIGN CONSISTENT BUT n=${split.length} — TOO FEW PAIRS TO CALL IT. Not a predictor,`)
      console.log(`      and not a refutation either: the straddling population is too small to test on.`)
    } else {
      console.log(`   ⚠️  SIGN INCONSISTENT (${lower} lower / ${higher} higher) — not a predictor.`)
    }
  }

  // ── cover by stage, over OWED runs only ──
  console.log(`\n   mean band cover by tile partition state (OWED runs only; ⛔ no-band-owed excluded):`)
  const byStage = new Map()
  for (const r of byRun.values()) {
    if (r.owed <= 1e-6 || r.cover == null) continue
    const a = byStage.get(r.stage) || []; a.push(r); byStage.set(r.stage, a)
  }
  for (const s of [...byStage.keys()].sort()) {
    const a = byStage.get(s)
    const mean = a.reduce((x, r) => x + r.cover, 0) / a.length
    const brk = a.reduce((x, r) => x + (r.breaks > 0 ? 1 : 0), 0)
    console.log(`      ${s.padEnd(20)} runs ${String(a.length).padStart(4)}   mean cover ${mean.toFixed(3)}   runs with ≥1 break ${String(brk).padStart(3)} (${(100 * brk / a.length).toFixed(0)}%)`)
  }
  // ⛔ IS `cover` A GOOD PROXY? The corner pad legitimately takes the band at a run's
  // ENDS (RIBBONS §1 invariant 1 — the corner is a band SLICE, owned by the corner,
  // not by the leg), so a metric that loses cover only at stations 0 and N-1 is
  // measuring corner pull-back, not a break. Print cover BY STATION POSITION: if the
  // loss is at the ends it is expected and the middle is the signal.
  {
    const acc = Array.from({ length: NSTA }, () => [])
    for (const r of byRun.values()) {
      if (r.owed <= 1e-6 || r.cover == null) continue
      for (const k of Object.keys(r.byStation)) acc[k].push(r.byStation[k])
    }
    console.log(`\n   ⚠️  PROXY CHECK — mean cover by station position along the run (0 and ${NSTA - 1} abut corners):`)
    console.log(`      ` + acc.map((a, i) => `s${i}:${(a.reduce((x, v) => x + v, 0) / (a.length || 1)).toFixed(2)}`).join('  '))
    const ends = [...acc[0], ...acc[NSTA - 1]], mid = acc.slice(1, -1).flat()
    const m = (a) => a.reduce((x, v) => x + v, 0) / (a.length || 1)
    console.log(`      ends ${m(ends).toFixed(3)}   interior ${m(mid).toFixed(3)}   ⇒ ` +
      (m(mid) - m(ends) > 0.1 ? `the loss is CONCENTRATED AT THE ENDS — corner pull-back. Use the INTERIOR figure.`
                              : `loss is NOT end-concentrated — the metric is not just corner pull-back.`))
  }

  // The residual: OWED runs that still lose ≥half the band at ≥1 station, with the
  // metric that cannot be fooled by a bad start datum. This is a LEAD, not a finding
  // — no mechanism is established for it here.
  {
    const b = [...byRun.values()].filter(r => r.owed > 1e-6 && r.breaks > 0)
      .sort((x, y) => x.cover - y.cover)
    console.log(`\n   residual — OWED runs with ≥1 station under half the owed depth: ${b.length}`)
    for (const r of b.slice(0, 15))
      console.log(`      t${String(r.ti).padStart(3)} ${r.stage.padEnd(16)} ${(r.skelId + '|' + r.side + '|' + r.segOrd).padEnd(34)} owed ${r.owed.toFixed(2)}  cover ${r.cover.toFixed(2)}  breaks ${r.breaks}/${r.stations}`)
  }

  // and how many OWED runs live on a no-stamp / spans-empty tile at all
  const owedBad = [...byRun.values()].filter(r => r.owed > 1e-6 && bad(r))
  console.log(`\n   OWED runs sitting on a 0-no-stamp or 3-spans-empty tile: ${owedBad.length}`)

  if (showPairs) {
    console.log(`\n   pair                          L(tile/stage/cover)              R(tile/stage/cover)`)
    for (const pr of owedBoth.sort((a, b) => Math.abs(b.L.cover - b.R.cover) - Math.abs(a.L.cover - a.R.cover)).slice(0, 25))
      console.log(`   ${pr.id.padEnd(28)}  ${String(pr.L.ti).padStart(3)} ${pr.L.stage.padEnd(18)} ${pr.L.cover.toFixed(2)}   ${String(pr.R.ti).padStart(3)} ${pr.R.stage.padEnd(18)} ${pr.R.cover.toFixed(2)}`)
  }
}
console.log(`\n⭐ A tile that froze ped at zero owes NO band; it is neither pass nor fail and is never`)
console.log(`   summed with a tile that owes one. ⛔ A difference between two sides is the PRODUCT —`)
console.log(`   what is tested here is only whether the difference's SIGN tracks partition state.`)
process.exit(worstExit)
