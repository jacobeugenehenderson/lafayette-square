/**
 * claims-nodeless-tip-classifier — WHY do degree-1 tips carry no junction node?
 *
 * BRIEF 1 (2026-08-21). ⛔ A READ. Writes nothing, re-runs no pour, edits no src/.
 *
 * THE QUESTION: junctionMap has seven node sources. For each degree-1 tip vertex
 * that carries NO junction node in the artifact — which source(s) should have
 * minted it, why did each decline, and IS THE DECLINE CORRECT?
 *
 * ⭐ THE CONDITIONS ARE READ OUT OF THE SOURCE, NEVER RESTATED. Every gate below
 * is extracted from cartograph/derive.js / cartograph/pipeline.js as TEXT at
 * runtime and compiled. If a gate is edited or renamed this probe DIES LOUDLY
 * rather than silently measuring a stale copy of the rule.
 *   · derive.js  curbed() · vKey() · Source 6's gate · Source 0's gate
 *   · pipeline.js  keepR (the boundary clip radius) · the clipped-key list
 *
 * ⛔ NO FALLBACK, and NO DEFAULT INPUT — the instrument-input guard of
 * claims-node-pair-key-parity.mjs (191fb61d) is inherited verbatim: there are two
 * ribbon artifacts per scene and they are not the same node population.
 *
 * usage: node scratch/claims-nodeless-tip-classifier.mjs --source=pour [scene ...]
 *        default scenes: lafayette-square hipointe-demun
 *        (ksi-y-m-yn / centrum / altadena are CHILLERED — do not size on them.)
 */
import { readFileSync } from 'fs'

const ROOT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const rd = p => readFileSync(`${ROOT}/${p}`, 'utf8')

// ── READ THE RULES OUT OF THE SOURCE ───────────────────────────────────────
const DERIVE_SRC = rd('cartograph/derive.js')
const PIPELINE_SRC = rd('cartograph/pipeline.js')

function grab(src, file, label, re) {
  const m = src.match(re)
  if (!m) throw new Error(
    `LOUD FAIL: could not read "${label}" out of ${file}. The probe's source-read is stale — ` +
    `the rule moved or was rewritten. FIX THE PROBE against the new source; do not guess the rule.`)
  return m
}

// derive.js:4003 — const curbed = (s) => !s.gradeSeparated && !s.disabled
const curbed = new Function('return ' + grab(DERIVE_SRC, 'derive.js', 'curbed()',
  /const curbed = (\(s\) => [^\n]+)/)[1])()

// derive.js:3444 — const vKey = (p) => p[0].toFixed(3) + ',' + p[1].toFixed(3)
const vKey = new Function('return ' + grab(DERIVE_SRC, 'derive.js', 'vKey()',
  /const vKey = (\(p\) => [^\n]+)/)[1])()

// derive.js Source 6 (pendant tips) — the loop's own skip condition.
//   for (const [k, list] of endsAt) { if (<GATE>) continue ... }
const S6_GATE = grab(DERIVE_SRC, 'derive.js', "Source 6's gate",
  /if \((list\.length !== 1 \|\| \(interiorAt\.get\(k\) \|\| \[\]\)\.length)\) continue/)[1]
const s6Skips = new Function('list', 'interiorAt', 'k', `return (${S6_GATE})`)

// derive.js Source 0 (plain / "EVERY junction node") — its skip condition.
const S0_GATE = grab(DERIVE_SRC, 'derive.js', "Source 0's gate",
  /if \((ends\.length \+ thrs\.length \* 2 < 3 && ends\.length < 2)\) continue/)[1]
const s0Skips = new Function('ends', 'thrs', `return (${S0_GATE})`)

// pipeline.js:172 — the boundary clip radius applied to layers.ribbons.streets
//   const keepR = Math.max(fadeOuter ?? 0, discR ?? 0) + 30
const KEEP_R = grab(PIPELINE_SRC, 'pipeline.js', 'keepR (the clip radius)',
  /const keepR = (Math\.max\(fadeOuter \?\? 0, discR \?\? 0\) \+ \d+)/)[1]
const keepRFn = new Function('fadeOuter', 'discR', `return (${KEEP_R})`)

// pipeline.js — which ribbon keys the clip touches, and (load-bearing) which it does NOT.
const CLIP_KEYS = grab(PIPELINE_SRC, 'pipeline.js', "the clip's ribbon key list",
  /for \(const key of \[('streets'[^\]]*)\]\)/)[1].split(',').map(s => s.trim().replace(/'/g, ''))
const POLYLINE_KEYS = grab(PIPELINE_SRC, 'pipeline.js', "the clip's POLYLINE set",
  /const POLYLINE = new Set\(\[([^\]]*)\]\)/)[1].split(',').map(s => s.trim().replace(/'/g, ''))
const CLIP_TOUCHES_JUNCTIONMAP = CLIP_KEYS.includes('junctionMap')
const CLIP_TRIMS_STREETS = POLYLINE_KEYS.includes('streets') && CLIP_KEYS.includes('streets')

// The FLOOR: the clip's loud named class. Its presence is a claim like any other —
// checked in source, never assumed. `armed` = has it been flipped to a refusal yet.
const FLOOR_PRESENT = /\[clip\/frozen-index\]/.test(PIPELINE_SRC)
const FLOOR_ARMED = /\[clip\/frozen-index\][\s\S]{0,4000}?process\.exit\(/.test(PIPELINE_SRC)

// ── the instrument-input guard (inherited from claims-node-pair-key-parity) ─
const SOURCES = {
  pour: scene => `cartograph/data/${scene}/clean/map.json`,
  bundle: scene => scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`,
}
const argv = process.argv.slice(2)
const SOURCE = (argv.find(a => a.startsWith('--source=')) || '').split('=')[1]
const SCENES = argv.filter(a => !a.startsWith('--'))
if (!SOURCE || !SOURCES[SOURCE]) {
  console.error(`LOUD FAIL: no input source. Pass --source=pour or --source=bundle.
  pour   = cartograph/data/<scene>/clean/map.json (layers.ribbons) — the fresh pour
  bundle = what artifact production reads (LS src/data/ribbons.json)
  There is deliberately NO DEFAULT: silently reading the stale one is the failure this guard exists to stop.`)
  process.exit(2)
}
const scenes = SCENES.length ? SCENES : ['lafayette-square', 'hipointe-demun']

console.log(`RULES READ FROM SOURCE (never restated):`)
console.log(`  derive.js   Source 6 skip : if (${S6_GATE}) continue`)
console.log(`  derive.js   Source 0 skip : if (${S0_GATE}) continue`)
console.log(`  pipeline.js clip radius   : keepR = ${KEEP_R}`)
console.log(`  pipeline.js clip TRIMS ribbons.streets geometry : ${CLIP_TRIMS_STREETS ? 'YES' : 'NO'}`)
console.log(`  pipeline.js clip touches ribbons.junctionMap    : ${CLIP_TOUCHES_JUNCTIONMAP ? 'YES' : 'NO'}`)
if (!CLIP_TRIMS_STREETS) console.log(`  ⚠️  the clip no longer trims street geometry — the CLIP-MANUFACTURED class below cannot arise. Re-read.`)
if (CLIP_TOUCHES_JUNCTIONMAP) console.log(`  ⚠️  the clip now reaches junctionMap — this probe's root-cause finding may be CLOSED. Re-read.`)

const RIM_EPS = 0.5   // m. resolveChainSegmentation's IX_EPS — the repo's own coordinate-identity scale.

for (const scene of scenes) {
  const ribPath = SOURCES[SOURCE](scene)
  const raw = JSON.parse(rd(ribPath))
  const ribbons = raw.layers?.ribbons || raw
  if (!ribbons.streets) throw new Error(`LOUD FAIL: ${ribPath} has no .streets — wrong shape for source '${SOURCE}'.`)
  if (!ribbons.junctionMap?.nodes) throw new Error(`LOUD FAIL: ${ribPath} has no junctionMap.nodes — nothing to classify.`)
  const nb = JSON.parse(rd(`cartograph/data/${scene}/neighborhood_boundary.json`))

  const S = ribbons.streets
  const N = ribbons.junctionMap.nodes
  const fadeOuter = Number.isFinite(nb.streetFade?.outer) ? nb.streetFade.outer : null
  const discR = Number.isFinite(nb.radius) ? nb.radius : null
  const keepR = keepRFn(fadeOuter, discR)
  const [cx, cz] = nb.center
  const rad = p => Math.hypot(p[0] - cx, p[1] - cz)

  // derive.js's own endpoint / interior indexes, over CURBED chains only.
  const endsAt = new Map(), interiorAt = new Map()
  for (const s of S) {
    if (!curbed(s)) continue
    const p = s.points
    for (const [end, pt] of [['start', p[0]], ['end', p[p.length - 1]]]) {
      const k = vKey(pt)
      if (!endsAt.has(k)) endsAt.set(k, [])
      endsAt.get(k).push({ s, end })
    }
    for (let i = 1; i < p.length - 1; i++) {
      const k = vKey(p[i])
      if (!interiorAt.has(k)) interiorAt.set(k, [])
      const a = interiorAt.get(k); if (!a.includes(s)) a.push(s)
    }
  }
  const jmSet = new Set(N.map(n => vKey(n.at)))
  const byLeg = new Map()
  for (const n of N) for (const l of n.legs || []) {
    const k = `${l.chain}|${l.end}`
    if (!byLeg.has(k)) byLeg.set(k, [])
    byLeg.get(k).push(n)
  }

  // ── the population: degree-1 tips (Source 6's OWN predicate, inverted) ──
  const tips = []
  for (const [k, list] of endsAt) {
    if (s6Skips(list, interiorAt, k)) continue     // not a pendant tip by derive's own gate
    tips.push({ k, ...list[0] })
  }
  const nodeless = tips.filter(t => !jmSet.has(t.k))

  console.log(`\n${'='.repeat(96)}`)
  console.log(`${scene}   [source: ${SOURCE}]   ${ribPath}`)
  console.log(`${'='.repeat(96)}`)
  console.log(`junctionMap.nodes ${N.length} · curbed streets ${S.filter(curbed).length}/${S.length} · clip radius keepR ${keepR} m (fadeOuter ${fadeOuter} · radius ${discR}) about ${nb.center}`)
  console.log(`degree-1 tips (Source 6's predicate): ${tips.length} · of them WITHOUT a junction node: ${nodeless.length}`)

  // ── per-tip: what each source saw, and why it declined ──────────────────
  const rows = []
  for (const t of nodeless) {
    const ends = endsAt.get(t.k) || [], thrs = interiorAt.get(t.k) || []
    const pt = t.end === 'start' ? t.s.points[0] : t.s.points[t.s.points.length - 1]
    const r = rad(pt)
    const onRim = Math.abs(r - keepR) < RIM_EPS
    // the same (chain,end) carried by a junction node OUTSIDE the clip circle =
    // the chain's PRE-CLIP endpoint, i.e. the node the mint actually made.
    const preClip = (byLeg.get(`${t.s.skelId}|${t.end}`) || []).filter(n => rad(n.at) > keepR)
    rows.push({
      skel: t.s.skelId, end: t.end, key: t.k, r, onRim,
      // Source 1 needs a carriageway with phase.spineAt{Start,End} at this end.
      s1: t.s.phase?.[t.end === 'start' ? 'spineAtStart' : 'spineAtEnd']
        ? 'spineAt* PRESENT — should have fired' : 'no phase.spineAt* at this end',
      // Sources 2-4 pair two chain ENDS at one vertex.
      s24: ends.length >= 2 ? `${ends.length} ends — should have been considered` : `only ${ends.length} chain end here — no partner to join`,
      // Source 5 needs another curbed chain passing THROUGH this vertex.
      s5: thrs.length ? `${thrs.length} through-chain(s) — should have been considered` : 'no curbed chain passes through — nothing to land on',
      // Source 6 — its gate already selected this vertex, so it holds by construction.
      s6: 'PREDICATE HOLDS — Source 6 mints unconditionally for this vertex',
      // Source 0 — deliberately declines a tip.
      s0: s0Skips(ends, thrs) ? `declined: ends ${ends.length} + thrs ${thrs.length}*2 fails the gate` : 'gate passes — should have fired',
      preClipNode: preClip[0] ? { key: vKey(preClip[0].at), r: rad(preClip[0].at), kinds: preClip[0].kinds.join('+') } : null,
    })
  }

  // ── verdict per row ────────────────────────────────────────────────────
  for (const row of rows) {
    if (row.onRim && row.preClipNode) {
      row.class = 'CLIP-MANUFACTURED'
      row.verdict = 'CORRECT'
      row.why = `vertex did not exist at derive time; the mint stamped this chain-end at ${row.preClipNode.key} (r ${row.preClipNode.r.toFixed(1)} m, ${row.preClipNode.kinds}), then pipeline.js's clip cut the chain at r=${keepR} and left a NEW endpoint no source ever saw`
    } else if (row.onRim) {
      row.class = 'CLIP-MANUFACTURED (both ends cut)'
      row.verdict = 'CORRECT'
      row.why = `vertex did not exist at derive time; no out-of-rim node carries this chain-end either — clipRun kept a MIDDLE run, so BOTH endpoints are the clip's`
    } else {
      row.class = 'UNEXPLAINED'
      row.verdict = 'GAP'
      row.why = `off the clip circle (r=${row.r.toFixed(2)} vs keepR ${keepR}) — Source 6's predicate holds and no node exists. Not explained by the clip.`
    }
  }

  const W = [30, 6, 24, 11, 30, 9]
  console.log(`\n─ ONE ROW PER NODELESS TIP ─`)
  console.log(`${'chain'.padEnd(W[0])}${'end'.padEnd(W[1])}${'vertex'.padEnd(W[2])}${'radius'.padEnd(W[3])}${'class'.padEnd(W[4])}${'verdict'}`)
  for (const row of rows.sort((a, b) => a.skel < b.skel ? -1 : 1)) {
    console.log(`${row.skel.padEnd(W[0])}${row.end.padEnd(W[1])}${row.key.padEnd(W[2])}${row.r.toFixed(2).padEnd(W[3])}${row.class.padEnd(W[4])}${row.verdict}`)
    if (row.verdict === 'GAP') console.log(`   ⛔ ${row.why}`)
  }
  if (rows.length) {
    const ex = rows.find(r => r.preClipNode) || rows[0]
    console.log(`\n─ SOURCE-BY-SOURCE, worked on ${ex.skel}/${ex.end} (every row's shape is identical) ─`)
    console.log(`   Source 1  divided transitions (spineAt*)   : ${ex.s1}`)
    console.log(`   Source 2-4 end-to-end joins                : ${ex.s24}`)
    console.log(`   Source 5  endpoint-on-interior             : ${ex.s5}`)
    console.log(`   Source 6  pendant tip                      : ${ex.s6}`)
    console.log(`   Source 0  plain / "every junction node"    : ${ex.s0}`)
    console.log(`   ⇒ Source 6 IS the owner and its gate holds — so the artifact contradicts the code,`)
    console.log(`     UNLESS the vertex did not exist when derive ran. It did not: see the class column.`)
  }

  // ── counts per class ───────────────────────────────────────────────────
  const tally = new Map()
  for (const row of rows) tally.set(row.class, (tally.get(row.class) || 0) + 1)
  console.log(`\n─ COUNTS PER CLASS ─`)
  for (const [c, n] of [...tally].sort()) console.log(`   ${String(n).padStart(4)}  ${c}`)

  // ── the reciprocal half: nodes stranded by the same clip ───────────────
  const stranded = N.filter(n => rad(n.at) > keepR)
  const orphanTips = N.filter(n => (n.kinds || []).includes('pendant-tip'))
    .filter(n => { const k = vKey(n.at); const e = endsAt.get(k) || []; return !(e.length === 1 && !(interiorAt.get(k) || []).length) })
  console.log(`\n─ THE RECIPROCAL HALF — the frozen index describes geometry the artifact no longer carries ─`)
  console.log(`   junctionMap nodes beyond keepR ${keepR} m: ${stranded.length} of ${N.length} (${(100 * stranded.length / N.length).toFixed(0)}%)`)
  console.log(`   pendant-tip nodes whose key is no longer a degree-1 tip of the serialized streets: ${orphanTips.length}`)
  console.log(`   ⇒ the clip trims ribbons.streets (POLYLINE) but never reaches ribbons.junctionMap${CLIP_TOUCHES_JUNCTIONMAP ? ' — WAIT: the key list now includes it. Re-read.' : ` (its key list is [${CLIP_KEYS.join(', ')}])`}.`)

  // ── the declined-by-design population, stated so it is never re-litigated ─
  let interiorNodeless = 0
  for (const [k, list] of interiorAt) {
    if (jmSet.has(k)) continue
    if ((endsAt.get(k) || []).length) continue
    if (!s0Skips(endsAt.get(k) || [], list)) continue
    interiorNodeless++
  }
  console.log(`\n─ DECLINED BY DESIGN (not part of the question, stated so it is not re-counted as a gap) ─`)
  console.log(`   ${interiorNodeless} mid-chain interior vertices carry no node. Source 0's gate refuses them by name`)
  console.log(`   ("would put a node on every vertex of every street"). CORRECT.`)

  // ── THE FLOOR — is it still in pipeline.js, is it armed, and what will it print? ──
  // ⭐ A DRY RUN, not a restatement: the census's own predicate is EXTRACTED from
  // pipeline.js and evaluated here against the pre-clip endpoints (clean/skeleton.json,
  // the chains deriveLayers consumed) and the post-clip artifact. So this predicts the
  // next pour's line WITHOUT pouring, and it dies loudly if the floor is edited away.
  console.log(`\n─ THE FLOOR (pipeline.js [clip/frozen-index]) — present? armed? what will it print? ─`)
  if (!FLOOR_PRESENT) {
    console.log(`   ⛔ ABSENT — the clip's [clip/frozen-index] census is not in pipeline.js. It was removed or renamed.`)
    console.log(`      The clip is silent again. This is the failure the floor exists to stop; fix the source or fix this probe.`)
  } else {
    console.log(`   present · refusal ARMED (exit on a nonzero count): ${FLOOR_ARMED ? 'YES' : 'NO — prints only, by design, until the count is 0'}`)
    let dry = null
    try {
      const sk = JSON.parse(rd(`cartograph/data/${scene}/clean/skeleton.json`))
      const pre = new Map()
      for (const s of sk.streets || []) {
        const p = s.points
        if (!p || p.length < 2) continue
        pre.set(s.id, { start: vKey([p[0].x, p[0].z]), end: vKey([p[p.length - 1].x, p[p.length - 1].z]) })
      }
      const severed = [], manufactured = []
      for (const it of S) {
        const was = pre.get(it.skelId), p = it.points
        if (!was || !p || p.length < 2) continue
        for (const [end, now] of [['start', vKey(p[0])], ['end', vKey(p[p.length - 1])]]) {
          if (now === was[end]) continue
          if (jmSet.has(was[end])) severed.push(`${it.skelId}/${end}`)
          if (curbed(it) && !jmSet.has(now)) manufactured.push(`${it.skelId}/${end}`)
        }
      }
      dry = { severed: severed.length, manufactured: manufactured.length }
      console.log(`   DRY RUN against clean/skeleton.json (the geometry deriveLayers consumed):`)
      console.log(`      severed chain-ends whose frozen node the clip strands : ${dry.severed}  ⚠️ LOWER BOUND — see below`)
      console.log(`      NEW endpoints manufactured with no junction node      : ${dry.manufactured}`)
      console.log(`   ⇒ the pour will print the manufactured count exactly; the census captures pre-clip endpoints`)
      console.log(`     IN PROCESS, while this dry run substitutes clean/skeleton.json for them. derive collapses`)
      console.log(`     micro-segments at intersection vertices, so a skeleton endpoint is not always the ribbon`)
      console.log(`     endpoint — that is why SEVERED reads low here. ⛔ Cause of the residual not established;`)
      console.log(`     quote the pour's line for severed, this one only for manufactured.`)
      // ⛔ The two predicates are NOT the same and are never merged: the census asks
      // "did this endpoint move and is it nodeless"; the table above asks "is this a
      // degree-1 tip with no node". A severed end landing among other chains is in the
      // first and not the second. Report the relation; do not assert equality.
      const rel = dry.manufactured === rows.length ? 'EQUAL' : dry.manufactured > rows.length
        ? `census is LARGER by ${dry.manufactured - rows.length} — severed ends that are not degree-1 tips`
        : `census is SMALLER by ${rows.length - dry.manufactured} — ⛔ a nodeless tip the census does not see. Investigate.`
      console.log(`   vs this probe's ${rows.length} nodeless degree-1 tip(s): ${rel}`)
    } catch (e) {
      console.log(`   ⛔ DRY RUN NOT MEASURED — ${e.message}. Absence of a number here means nothing.`)
    }
    console.log(`   ⭐ THE GATE: when a cure lands, both counts go to 0 while the interior population is unmoved`)
    console.log(`      (node scratch/claims-deadend-populations.mjs). 0/0 is when arming the refusal becomes safe.`)
  }
}
