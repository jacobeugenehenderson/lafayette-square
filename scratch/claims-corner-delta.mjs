#!/usr/bin/env node
/**
 * "DID THE CURE REMOVE THE BAND ENDS — AND ONLY THOSE?" — A10 / D2, the
 * classified-delta gate. Written BEFORE the cure, to judge it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS (2026-08-08). D1 (`scratch/claims-corner-takeover.mjs`) named
 * the population: of every corner that BIDS, which ones the takeover DECLINES,
 * and by which of four gates. D1 answers "where is it broken." It cannot answer
 * "did the fix fix it," because a decline count going down is not evidence — a
 * cure that serves 400 declining corners while quietly moving 900 corners that
 * were already correct is a REGRESSION wearing a green number.
 *
 * ⭐⭐ THE UNIT OF SERVICE IS A BAND END, NOT A CORNER SERVED (restated
 * 2026-08-08, after A10's agreed sentence was ratified). This file's first cut
 * defined `served` as "a corner that DECLINED now gets a pad" — a MECHANISM.
 * The agreed sentence settles that the symptom is the BAND: "ends exist only
 * because we make areas out of lines that have ends." So:
 *
 *      ⭐ served = A BAND END THAT EXISTED NO LONGER EXISTS.
 *
 * ⛔ That is not a rewording. A corner can be served — pad built, decline gone —
 * while the band it was supposed to close STILL reaches `luRemainder` a metre
 * away; under the old definition that scored as a cure. And a real cure that
 * closes the band WITHOUT ever building a corner pad (painting from the ring
 * partition, which is exactly what A10's cure is) scored as NOTHING under the
 * old definition. The old bucket was wrong in both directions.
 *
 * ⭐ AN END IS "GONE" BY GEOMETRIC OVERLAP, NEVER BY A DISTANCE TOLERANCE. A
 * baseline end is served iff the current run's defect region does not overlap
 * it (above the Clipper noise floor). A tuned proximity knob would be the thing
 * deciding the verdict; overlap is the definition itself. An end that merely
 * SHRANK is still an end — it stays `unchanged` and the shrink is printed.
 *
 * ⭐ SO THIS FILE CLASSIFIES, IT DOES NOT SCORE. A magnitude is not a verdict;
 * a bucket is. Every band end, and every tile whose FILL geometry moves, lands
 * in exactly one of three:
 *
 *   ✅ served      — a band end present at baseline is gone. The fix, working.
 *   ·  unchanged   — the end is still there (same area, or smaller — still an end).
 *   ⛔ regression  — a band end that did NOT exist at baseline exists now · an
 *                    end that GREW · geometry moved on a tile where no end was
 *                    removed.
 *
 * ⛔ NO FOURTH SILENT BUCKET. A corner that appears or disappears between runs,
 * a tile whose verdicts changed while its geometry did not, a scene whose bake
 * moved under the comparison, A TILE WHOSE MONO-WIDTH ENVELOPE (`fullBand`)
 * MOVED — each is its own LOUD class with a count, never folded into a magnitude
 * and never skipped (POLYGON-FIRST §5 RULE 2). The envelope class is new and it
 * is load-bearing: `SECTION §7` lists the mono-width envelope among the things
 * the cure must PRESERVE, so a change to it is a re-architecture, not a cure —
 * and a narrower band makes ends vanish for the wrong reason.
 *
 * ⛔⛔ A0's TILES ARE NOT A10's. Dead-end tips and mouths are ticket A0: the band
 * legitimately wraps a cul-de-sac bulb and A0's tips are zero-width slits, so a
 * naive "does this band have an end" test attributes A0's failures here and
 * makes the cure look broken. The split is geometric and uses A0's OWN frozen
 * radii (`claims-band-reaches-lu.mjs`); A0 regions are counted and printed on
 * their own line and NEVER bucketed. ⭐ A RIM TILE IS NOT ONE OF THOSE: a run with
 * no asphalt owes no band, so its ZERO-DEPTH ARC is excluded by name and printed
 * on its own line, but everything else on that tile is bucketed like anywhere
 * else. (This file used to drop the whole tile — the same "one feature, whole
 * tile to one bucket" failure it had already fixed for A0.)
 *
 * ⛔ THE CORNER VERDICTS ARE KEPT — AS DIAGNOSIS, NOT AS THE GATE. D1's dump
 * still runs and the corner-set-changed loud class still fires (the bid set is
 * upstream of the takeover; a cure must not move it). What no longer decides
 * anything is the decline COUNT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STATE DISCIPLINE (CLAUDE.md Layer 0 q3; A0's rule for eye verdicts, here
 * for measurements). An unlabelled measurement is the same defect as an
 * unlabelled eye verdict: it looks authoritative and cannot be re-checked. So
 * every row this file records carries `scene` AND `state`, and the states are
 * DERIVED FROM DISK BY PREDICATE — there is no scene name, no look id and no
 * street name anywhere in this source. The predicate is:
 *
 *   a STATE = (a baked scene) × (one `design.json*` file in a Look bound to it)
 *
 * `design.json` → state `default`; `design.json.<suffix>` → state `<suffix>`.
 * The Look→scene binding comes from `public/looks/index.json`, NEVER from the
 * directory name (a hand-named Look would be mis-attributed otherwise — the
 * method is `claims-override-provenance.mjs`'s, unchanged).
 *
 * ⭐ WHICH STATES CAN GENUINELY TEST AUTHORING — asked, never assumed. Two
 * things must both be true, and the report prints both:
 *   1. the state's `blockCustoms` slots RESOLVE against THIS scene's own bake
 *      (the resolver does `blockCustoms[skelId][side][segOrd]` and nothing else,
 *      so a slot that names no run in this bake is never read), and
 *   2. loading them actually MOVES the FILL versus bare defaults.
 * The five verdicts: DEFAULTS ONLY (no slots — "this state IS the bare-defaults
 * map") · FIXTURE DEAD (slots, none readable) · INERT (readable, but no field
 * reaches this construction) · PARTIAL AUTHORING (some slots stranded — the
 * READABLE SUBSET is what is under test) · LIVE AUTHORING. ⛔ Only the last is
 * an unqualified yes. None of the others is a pass, and none is evidence that
 * authoring is irrelevant — they are evidence that nothing was measured.
 *
 * ⭐ AND THE FIELD, NOT JUST THE SLOT. `blockCustoms` is ONE map shared by two
 * authoring channels — Survey fields (`pavementHW`, `terminal`) are consumed
 * upstream and are already frozen into `iA`, Section fields (`treelawn`,
 * `sidewalk`, `materials`) are read here. A scene can be full of resolving,
 * operator-written authoring and still be INERT for A10. So each field name is
 * replayed ALONE and the FILL says whether this construction reads it. No field
 * list in this source — a field added tomorrow is covered.
 *
 * ⛔ FIXTURE RE-VERIFICATION IS NOT OPTIONAL, AND THE STREET IS A BAD PROXY FOR
 * IT. A `design.json.<suffix>` fixture is a snapshot of an OLD authoring
 * session; a re-skeleton keeps every street name and renumbers `segOrd`
 * underneath. So "all its streets still resolve" can read 16/16 while a third
 * of the slots are never read again (exactly what this measured on 2026-08-08).
 * Every state is re-resolved against the CURRENT bake on every run, at slot
 * granularity, and both figures print side by side. ⛔ Never quote a previously
 * measured resolution figure — including one printed by this file.
 * A stranded fixture STOPS a `--save`; `--accept-partial` baselines the
 * readable subset knowingly, and every later report keeps printing the counts.
 *
 * ⛔ THE BAKE IS PART OF THE COMPARISON. A10's cure lives in the FILL
 * (`sectionPassTile`); the SHAPE (`shape.json`) is frozen upstream. If the bake
 * moved between baseline and now, the delta is not a FILL delta and every
 * bucket below would be a lie — so the baseline stores a per-scene and per-tile
 * shape hash and the comparison reports ⛔ UNCOMPARABLE rather than a number.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ WHAT "GEOMETRY MOVED" MEANS, AND THE HONEST LIMIT OF IT.
 *   · the VERDICT unit is the BAND END — a connected region of `fullBand` that
 *     reached `luRemainder` with no authored-shallower gesture behind it,
 *     recovered by the shared instrument in `claims-band-reaches-lu.mjs`,
 *   · the GEOMETRY unit is the tile — `sectionPassTile` returns `{ Wacc,
 *     tlByLu, luByLu }` for the whole tile (hash + area of the three).
 * A tile that moved with NO band end removed in it is a regression by
 * definition — that is "moved where nothing was closed". The coarseness is
 * stated rather than hidden: two ends inside one tile that moved in opposite
 * directions still report that tile as a regression (the strict reading),
 * never as a wash.
 *
 * ⭐ AND THE DIRECTION IS EVIDENCE, not decoration. An unhonoured takeover is a
 * MISLABEL: the released band falls to `luRemainder` and RENDERS AS LAND USE
 * (SECTION §7). So a real cure moves area OUT of `luByLu` and INTO concrete. A
 * "served" tile whose land-use area GREW is flagged — it changed in the wrong
 * direction and the bucket says so.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MUTATION-VERIFIED, AND THE VERIFICATION IS ITSELF RUNNABLE. A gate nobody has
 * seen fail is not a gate — and a sentence in a report saying "I mutation-tested
 * it" goes stale the day someone edits the gate. `--mutant` rides the shared
 * loader in `claims-band-reaches-lu.mjs`: it copies `src/lib/tileGround.js`,
 * applies the band instrument plus one declared mutation (each asserted to match
 * EXACTLY once — a silently-unapplied edit would be a false green), rewrites its
 * relative imports to absolute, and measures the copy. `--selftest` replays every mutant and asserts the bucket signature it
 * MUST produce, then exercises the LOUD classes (bake moved · corner set changed
 * · frozen iA moved) by tampering with a COPY of the baseline. ⛔ Nothing under
 * `src/` is ever written, and a baseline measured under a mutant cannot be saved.
 *
 * ⛔ READ-ONLY except `scratch/.d2-*` and `scratch/.band-probe/`. Reads `public/baked/<scene>/shape.json`,
 *    `public/looks/index.json`, `public/looks/<look>/design.json*`. Writes only
 *    its own baseline + mutant scratch files (the transient ones are cleaned up).
 *    Removes no authoring from anything — the `.pre-reset` fixture is read-only
 *    input, and deleting authoring is the operator's call, never a detector's.
 *
 * USAGE
 *   node scratch/claims-corner-delta.mjs                         # measure + state audit
 *   node scratch/claims-corner-delta.mjs --save before [--accept-partial]
 *   node scratch/claims-corner-delta.mjs --selftest before       # prove the gate can fail
 *   ...build the cure...
 *   node scratch/claims-corner-delta.mjs --against before        # the three buckets
 *
 * ▶ THE RED-UNTIL-TRUE INVARIANT ITSELF (run this first — it needs no baseline):
 *     node scratch/claims-band-reaches-lu.mjs
 *     node scratch/claims-band-reaches-lu.mjs --inert   (the instrument is inert)
 *
 *   --mutant list · --mutant <name> --against <baseline>
 *   --only <substring of a state id>   ·   --rows   (every non-unchanged row)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
// The band instrument lives in ONE place — the RED-until-true invariant — so the
// gate and the invariant cannot drift on what `fullBand`, the authored-shallower
// residual, or "a band end" mean. It also owns the source-copy machinery this
// file's mutants ride on.
import { loadInstrumented, classifyTile, NOISE_M2, END_M2 } from './claims-band-reaches-lu.mjs'

const ROOT   = new URL('..', import.meta.url).pathname
const BAKED  = join(ROOT, 'public/baked')
const LOOKS  = join(ROOT, 'public/looks')
const TMP    = join(ROOT, 'scratch/.band-probe')   // the shared instrument's scratch dir

const argv = process.argv.slice(2)
const opt  = (name) => { const i = argv.indexOf(`--${name}`); return i < 0 ? null : (argv[i + 1] ?? '') }
const has  = (name) => argv.includes(`--${name}`)
const SAVE    = opt('save')
const AGAINST = opt('against')
const ONLY    = opt('only')
const MUTANT  = opt('mutant')
const ROWS    = has('rows')

// ── the mutation roster ─────────────────────────────────────────────────────
// Each mutant is a source edit + the bucket it MUST land in. If a mutant stops
// producing its expected bucket, the gate has gone blind — that is the point of
// running them. `find` must match exactly once; a zero- or multi-match aborts.
const MUTANTS = [
  { name: 'noop',
    why: 'the cry-wolf control — an inert comment, no behaviour change. A gate that reports damage here reports damage always.',
    expect: 'ends served 0 · regression 0 · loud 0',
    assert: (r) => r.eServed === 0 && r.eReg === 0 && r.tServed === 0 && r.tReg === 0 && r.loud === 0,
    find: /const iC = ringAt\(0\)/,
    to:   'const iC = /* d2-noop */ ringAt(0)' },
  { name: 'serve-everything',
    why: 'a FALSE cure — widen the fillet-range tolerance until `no-fillet-in-range` stops declining. The decline COUNT plummets and REAL band ends do close, which is exactly the green number a scoring gate would swallow. Must be SEEN as service AND still FAIL.',
    expect: 'ends served > 0 AND (regression > 0 or loud > 0) — caught despite the improvement',
    assert: (r) => r.eServed > 0 && (r.eReg > 0 || r.tReg > 0 || r.loud > 0),
    find: /bestD > best\.r \+ c\.trim \+ 1\b/,
    to:   'bestD > best.r + c.trim + 1000' },
  { name: 'move-the-band',
    why: 'a pure REGRESSION — shift the band inner edge 5 cm on EVERY tile, including tiles with no corner and nothing declining. It also makes small band ends VANISH by narrowing the band, which is the trap: the ends go away without a single one being CLAIMED. The envelope loud class exists for exactly this.',
    expect: 'ends served 0 · tile regression > 0 (the mono-width envelope moved — nothing is bucketable)',
    assert: (r) => r.eServed === 0 && r.tServed === 0 && r.tReg > 0,
    find: /const iW = ringAt\(TLmax \+ SWmax\)/,
    to:   'const iW = ringAt(TLmax + SWmax - 0.05)' },
]

if (MUTANT === 'list' || MUTANT === '') {
  console.log('\nMUTANTS — feed the gate a broken change and watch it go red.\n')
  for (const m of MUTANTS) console.log(`  ${m.name.padEnd(18)} ${m.why}\n  ${''.padEnd(18)} expect: ${m.expect}\n`)
  process.exit(0)
}

// ── --selftest: prove the gate can fail ─────────────────────────────────────
// ⭐ A gate nobody has SEEN fail is not a gate — and a paragraph in a report
// saying "I mutation-tested it" goes stale the day someone edits the gate. So
// the mutation verification is itself runnable: each mutant declares the bucket
// signature it MUST produce, this replays them all against a baseline, and it
// goes red if the gate has gone blind. Run it before trusting any verdict.
if (has('selftest')) {
  const { execFileSync } = await import('child_process')
  const name = opt('selftest') || AGAINST
  if (!name || !existsSync(join(ROOT, `scratch/.d2-${name}.json`))) {
    console.error('⛔ --selftest needs a baseline: `--save <name> [--accept-partial]` first, then `--selftest <name>`.')
    process.exit(2)
  }
  console.log(`\nD2 SELF-TEST — replaying ${MUTANTS.length} mutants against baseline "${name}".`)
  console.log('A gate that cannot be made to fail is not measuring anything.\n')
  let bad = 0
  for (const m of MUTANTS) {
    let out = ''
    try { out = execFileSync(process.execPath, [new URL(import.meta.url).pathname, '--mutant', m.name, '--against', name], { encoding: 'utf8' }) }
    catch (e) { out = (e.stdout || '') + (e.stderr || '') }
    const num = (re) => { const x = out.match(re); return x ? +x[1] : NaN }
    const r = {
      eServed: num(/band ends\s+served (\d+)/), eReg: num(/band ends\s+served \d+ · unchanged \d+ · regression (\d+)/),
      tServed: num(/tiles\s+served (\d+)/),     tReg: num(/tiles\s+served \d+ · unchanged \d+ · regression (\d+)/),
      loud:    num(/loud\s+(\d+)/),
    }
    const ok = Object.values(r).every(Number.isFinite) && m.assert(r)
    if (!ok) bad++
    console.log(`  ${ok ? '✅' : '⛔'} ${m.name.padEnd(18)} ends ${r.eServed}/${r.eReg} · tiles ${r.tServed}/${r.tReg} · loud ${r.loud}   (served/regression)`)
    console.log(`     ${''.padEnd(16)} expected: ${m.expect}`)
    if (!ok) console.log(`     ⛔ THE GATE HAS GONE BLIND TO THIS CLASS — do not trust a green verdict from it.`)
  }
  // ── the LOUD classes, proven too ──────────────────────────────────────────
  // A mutant can only exercise the buckets. The loud classes fire on conditions
  // no source edit produces (the bake moving under the comparison, the bid set
  // changing), so they are exercised by TAMPERING WITH A COPY OF THE BASELINE —
  // the only honest way to see them go red without corrupting a real artifact.
  console.log('\nLOUD CLASSES — exercised by tampering with a COPY of the baseline (the real one is untouched).\n')
  const orig = JSON.parse(readFileSync(join(ROOT, `scratch/.d2-${name}.json`), 'utf8'))
  const tamper = [
    { id: 'selftest-bakemoved', what: 'a scene whose frozen shape hash no longer matches',
      expect: /the BAKE MOVED/,
      edit: (s) => { s.states[0].shapeHash = 'deadbeefdeadbeef'; return s } },
    { id: 'selftest-cornerset', what: 'a corner present now that the baseline never bid',
      expect: /the CORNER SET changed/,
      edit: (s) => { s.states[0].corners = s.states[0].corners.slice(1); return s } },
    { id: 'selftest-tilemoved', what: 'a tile whose frozen iA moved under a FILL comparison',
      expect: /frozen iA moved/,
      edit: (s) => { s.states[0].tiles[0].ia = 'deadbeefdeadbeef'; return s } },
  ]
  for (const t of tamper) {
    const p = join(ROOT, `scratch/.d2-${t.id}.json`)
    writeFileSync(p, JSON.stringify(t.edit(JSON.parse(JSON.stringify(orig)))))
    let out = ''
    try { out = execFileSync(process.execPath, [new URL(import.meta.url).pathname, '--against', t.id], { encoding: 'utf8' }) }
    catch (e) { out = (e.stdout || '') + (e.stderr || '') }
    const fired = t.expect.test(out) && /loud\s+[1-9]/.test(out)
    if (!fired) bad++
    console.log(`  ${fired ? '✅' : '⛔'} ${t.id.padEnd(20)} ${t.what}`)
    if (!fired) console.log(`     ⛔ the loud class did NOT fire — this failure would be silently bucketed as a number.`)
  }

  // the tamper copies and the mutant sources are transient — leave only the
  // operator's own named baseline behind (scratch/ is git-tracked).
  for (const t of tamper) rmSync(join(ROOT, `scratch/.d2-${t.id}.json`), { force: true })
  rmSync(TMP, { recursive: true, force: true })

  console.log(bad ? `\n⛔ SELF-TEST FAILED — ${bad} case(s) did not produce their declared signature.`
                  : `\n✅ SELF-TEST PASSED — every mutant and every loud class produced its declared signature.\n   The gate can fail, and it fails for the right reason.`)
  process.exit(bad ? 1 : 0)
}

// ── load the construction (instrumented; real, or mutated) ──────────────────
// ⭐ ONE loader, shared with the invariant. It copies src/lib/tileGround.js,
// applies the band instrument + (optionally) this run's declared mutation —
// each asserted to match EXACTLY once, a zero- or multi-match aborts rather
// than measuring a silently unapplied edit — and imports the copy. Nothing
// under src/ is ever written. The band instrument is proven inert by
// `node scratch/claims-band-reaches-lu.mjs --inert`.
process.env.CORNER_DUMP = '1'          // must precede the import — read at module init
let mutantNote = null
if (MUTANT) {
  mutantNote = MUTANTS.find(x => x.name === MUTANT)
  if (!mutantNote) { console.error(`⛔ unknown mutant "${MUTANT}". Run --mutant list.`); process.exit(2) }
}
const mod = await loadInstrumented(mutantNote ? [mutantNote] : [], mutantNote ? `d2.${mutantNote.name}` : 'd2')
const { sectionPassTile, cornerDump, bandDump, bandOps } = mod
if (!cornerDump?.on) {
  console.error('⛔ CORNER_DUMP is not armed — the construction did not pick up the flag. Nothing measured.')
  process.exit(2)
}
if (!bandDump?.on) {
  console.error('⛔ the band instrument did not apply — `served` cannot be measured. Nothing measured.')
  process.exit(2)
}

// ── vocabulary ──────────────────────────────────────────────────────────────
// `BUILT` alone is a served arc. `built-empty-concrete` is a takeover honoured
// in NAME ONLY (D1's distinction, from the construction itself at :1653) — the
// whole pad went to the inner LU ring. It is never counted as service.
const SERVED_REASON  = 'BUILT'
const HOLLOW_REASON  = 'built-empty-concrete'
const isDecline = (r) => r !== SERVED_REASON && r !== HOLLOW_REASON
const STRIP_MAT = { outer: 'LU', inner: 'SW' }   // sectionOpen's default

const h = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const round6 = (v) => (typeof v === 'number' ? +v.toFixed(6) : v)
const canon = (o) => JSON.stringify(o, (k, v) => round6(v))
const ringArea = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
const areaOf = (rings) => (rings || []).reduce((s, r) => s + ringArea(r), 0)
const areaMap = (m) => Object.values(m || {}).reduce((s, rings) => s + areaOf(rings), 0)
const canonMap = (m) => canon(Object.keys(m || {}).sort().map(k => [k, m[k]]))

// ── discover the states, by predicate ───────────────────────────────────────
// A baked scene with no Look bound to it, and a Look whose scene has no bake,
// are both reported NOT CHECKED with a reason. Neither is silently dropped.
const readBake = (scene) => {
  const p = join(BAKED, scene, 'shape.json')
  if (!existsSync(p)) return null
  const raw = JSON.parse(readFileSync(p, 'utf8'))
  const tiles = Array.isArray(raw) ? raw : (raw.tiles || [])   // a bare array is a legal freeze
  const triples = new Set(), streets = new Set()
  for (const t of tiles) for (const r of (t.runs || [])) {
    triples.add(`${r.skelId}|${r.side}|${r.segOrd}`); streets.add(String(r.skelId))
  }
  return { scene, tiles, triples, streets, shapeHash: h(canon(tiles.map(t => t?.iA ?? null))) }
}

const bakes = new Map()
for (const d of readdirSync(BAKED)) {
  if (!statSync(join(BAKED, d)).isDirectory()) continue
  const b = readBake(d); if (b) bakes.set(d, b)
}

const idx = JSON.parse(readFileSync(join(LOOKS, 'index.json'), 'utf8'))
const states = [], notChecked = []
const scenesWithLook = new Set()
for (const l of idx.looks) {
  const dir = join(LOOKS, l.id)
  if (!existsSync(dir)) { notChecked.push({ id: l.id, why: 'registered in index.json but has no look directory' }); continue }
  if (!l.scene)          { notChecked.push({ id: l.id, why: 'index.json entry carries no scene binding' }); continue }
  if (!bakes.has(l.scene)) { notChecked.push({ id: l.id, why: `scene "${l.scene}" has no public/baked/<scene>/shape.json` }); continue }
  scenesWithLook.add(l.scene)
  const variants = readdirSync(dir).filter(f => f === 'design.json' || f.startsWith('design.json.'))
  if (!variants.length) { notChecked.push({ id: l.id, why: 'look directory carries no design.json — the authored state cannot be loaded' }); continue }
  for (const f of variants.sort()) {
    const variant = f === 'design.json' ? 'default' : f.slice('design.json.'.length)
    let design = null, err = null
    try { design = JSON.parse(readFileSync(join(dir, f), 'utf8')) } catch (e) { err = String(e.message) }
    const id = `${l.scene}/${l.id}/${variant}`
    if (err) { notChecked.push({ id, why: `${f} unreadable — ${err}` }); continue }
    states.push({ id, scene: l.scene, look: l.id, variant, file: f, design })
  }
}
for (const s of bakes.keys()) if (!scenesWithLook.has(s)) notChecked.push({ id: s, why: 'baked scene bound to no Look in index.json — no authored state exists to measure' })

const selected = states.filter(s => !ONLY || s.id.includes(ONLY))
if (!selected.length) { console.error(`⛔ no state matched${ONLY ? ` --only "${ONLY}"` : ''}. Nothing measured — this is not a pass.`); process.exit(2) }

// ── the authoring audit (claims-override-provenance's method, unchanged) ────
// ⭐ THE UNIT IS THE SLOT, NEVER THE STREET. The resolver reads
// `blockCustoms[skelId][side][segOrd]` — the whole triple. "This street still
// exists in the bake" is a PROXY that correlates with resolution and is not it:
// a re-skeleton keeps every street name and renumbers `segOrd` underneath, so a
// street-level check reports 16/16 while a third of the slots are never read
// (measured 2026-08-08 on the `.pre-reset` fixture — 16/16 streets, 48/79
// slots). POLYGON-FIRST §5 RULE 1b: measure the definition, not the proxy. Both
// figures are printed so the gap itself is on the page.
const auditAuthoring = (design, bake) => {
  const bc = design?.blockCustoms
  const out = { slots: 0, resolved: 0, stranded: 0, renumbered: 0, orphan: 0,
                streets: 0, streetsPresent: 0, unclassifiable: 0, strandedStreets: new Set() }
  if (bc == null) return out
  if (typeof bc !== 'object' || Array.isArray(bc)) { out.unclassifiable = 1; return out }
  for (const skelId in bc) {
    const bySide = bc[skelId]
    out.streets++
    if (bake.streets.has(skelId)) out.streetsPresent++
    if (typeof bySide !== 'object' || bySide === null) { out.unclassifiable++; continue }
    for (const side in bySide) {
      const byOrd = bySide[side]
      if (typeof byOrd !== 'object' || byOrd === null) { out.unclassifiable++; continue }
      for (const segOrd in byOrd) {
        out.slots++
        if (bake.triples.has(`${skelId}|${side}|${segOrd}`)) out.resolved++
        else {
          out.stranded++; out.strandedStreets.add(skelId)
          // provenance's two conditions: the street survived and its ords moved
          // (a re-skeleton), or the street is unknown to this bake entirely.
          if (bake.streets.has(skelId)) out.renumbered++; else out.orphan++
        }
      }
    }
  }
  return out
}

// ── measure one state ───────────────────────────────────────────────────────
// One pass of the REAL construction per tile, with THIS state's blockCustoms.
// Records the corner verdicts (the dump) and the tile's FILL fingerprint.
const measure = (bake, cw, blockCustoms) => {
  const tiles = [], corners = []
  for (const [i, st] of bake.tiles.entries()) {
    cornerDump.rows.length = 0
    bandDump.rows.length = 0
    let r = null, threw = null
    try { r = sectionPassTile(st, cw, STRIP_MAT, blockCustoms) }
    catch (err) { threw = String(err?.message || err) }
    if (threw) {
      // ⛔ never a skip: a tile that cannot be measured is its own failing class.
      tiles.push({ i, ia: h(canon(st?.iA ?? null)), threw })
      corners.push({ tile: i, k: `<tile ${i}>`, reason: 'PROBE-ERROR', err: threw })
      cornerDump.rows.length = 0; bandDump.rows.length = 0
      continue
    }
    // ⭐ THE BAND ENDS — the unit `served` is now defined on. Classified into
    // A10 / A0 / ZERO-DEPTH by the invariant's own code, so the two files cannot
    // disagree about which ticket an end belongs to.
    const band = bandDump.rows[0] ? classifyTile(bandDump.rows[0], bandOps) : null
    tiles.push({
      i, ia: h(canon(st?.iA ?? null)),
      w: h(canon(r.Wacc)), tl: h(canonMap(r.tlByLu)), lu: h(canonMap(r.luByLu)),
      aW: +areaOf(r.Wacc).toFixed(3), aTl: +areaMap(r.tlByLu).toFixed(3), aLu: +areaMap(r.luByLu).toFixed(3),
      // the mono-width envelope's fingerprint — SECTION §7 lists it among the
      // things the cure must PRESERVE, so a change here is its own loud class.
      fb: band ? band.fullBandKey : null,
      noPed: band ? band.noPed : 0,
      a10Rings: band ? (band.a10Rings || []) : [],
      a10Area: band ? +(band.a10Area ?? 0).toFixed(3) : 0,
      a0Area: band ? +(band.a0Area ?? 0).toFixed(3) : 0,
      zeroArea: band ? +(band.zeroArea ?? 0).toFixed(3) : 0,
    })
    for (const row of cornerDump.rows) {
      corners.push({ tile: i, k: row.k, reason: row.reason, T: round6(row.T), legs: row.legs ?? null, p: (row.p || []).map(round6), skel: row.skel || [] })
    }
    cornerDump.rows.length = 0; bandDump.rows.length = 0
  }
  return { tiles, corners, fill: h(canon(tiles.map(t => [t.w, t.tl, t.lu]))) }
}

// ── the served test, stated exactly ─────────────────────────────────────────
// A band end that existed no longer exists ⇔ the other run's defect region does
// not overlap it above the Clipper noise floor. ⛔ No distance tolerance: a
// proximity knob would be the thing deciding the verdict.
const overlapArea = (ring, rings) => (!rings.length ? 0 : areaOf(bandOps.intersectRings([ring], rings)))

// ── run every selected state ────────────────────────────────────────────────
const snapshot = { states: [] }
let fixtureStale = 0, hardFail = 0, partial = 0

console.log('\nA10 / D2 — THE CLASSIFIED-DELTA GATE.  Classify, never score.')
console.log('States are derived from disk by predicate: (baked scene) × (each design.json* in a bound Look).')
if (mutantNote) console.log(`\n⚠️  MUTANT ACTIVE: "${mutantNote.name}" — ${mutantNote.why}\n    expect: ${mutantNote.expect}`)
console.log('')

for (const s of selected) {
  const bake = bakes.get(s.scene)
  const cw = s.design?.curbWidth
  if (!Number.isFinite(cw)) { notChecked.push({ id: s.id, why: `${s.file} has no numeric curbWidth — the construction cannot be run` }); hardFail++; continue }
  if (!bake.tiles.length)   { notChecked.push({ id: s.id, why: 'shape.json carries 0 tiles' }); hardFail++; continue }

  const a = auditAuthoring(s.design, bake)
  const own = measure(bake, cw, s.design.blockCustoms || null)
  // the liveness probe: does loading this state's authoring actually move the FILL?
  const bare = a.resolved ? measure(bake, cw, null) : null
  const live = a.resolved ? own.fill !== bare.fill : false

  // ⭐ PER-FIELD LIVENESS — derived, never asserted. `blockCustoms` is ONE map
  // shared by two authoring channels: Survey fields are consumed upstream at the
  // SHAPE pass and are already frozen into `iA`, while Section fields are read by
  // this construction. A state can therefore be full of real, resolving,
  // operator-written authoring and still be INERT for A10 — which reads as
  // "authoring changed nothing" when the truth is "none of it was Section's."
  // So: replay each field name ALONE and let the FILL say whether it is read
  // here. No field list in this source — a field added tomorrow is covered.
  const fieldLive = []
  if (a.resolved) {
    const names = new Set()
    for (const sk in s.design.blockCustoms) for (const sd in s.design.blockCustoms[sk]) for (const so in s.design.blockCustoms[sk][sd])
      if (bake.triples.has(`${sk}|${sd}|${so}`)) for (const f in (s.design.blockCustoms[sk][sd][so] || {})) names.add(f)
    for (const f of [...names].sort()) {
      const only = {}
      for (const sk in s.design.blockCustoms) for (const sd in s.design.blockCustoms[sk]) for (const so in s.design.blockCustoms[sk][sd]) {
        const v = s.design.blockCustoms[sk][sd][so]
        if (v && f in v) (((only[sk] ||= {})[sd] ||= {})[so] = { [f]: v[f] })
      }
      fieldLive.push({ field: f, live: measure(bake, cw, only).fill !== bare.fill })
    }
  }

  let verdict, note
  if (!a.slots) { verdict = 'DEFAULTS ONLY'; note = 'proves nothing about authoring — this state IS the bare-defaults map' }
  else if (!a.resolved) { verdict = 'FIXTURE DEAD'; note = `all ${a.slots} slot(s) name no run in this bake — the authored state is never read` }
  else if (!live) { verdict = 'INERT'; note = `${a.resolved} slot(s) resolve but NOT ONE of their fields is read by this construction — a comparison here is VACUOUS` }
  else if (a.stranded) { verdict = 'PARTIAL AUTHORING'; note = `only ${a.resolved} of ${a.slots} slot(s) are ever read — the state under test is the READABLE SUBSET, not the authoring the operator wrote` }
  else { verdict = 'LIVE AUTHORING'; note = `all ${a.resolved} slot(s) resolve AND move the FILL — this state can genuinely test authoring` }
  if (verdict === 'FIXTURE DEAD') fixtureStale++
  if (verdict === 'PARTIAL AUTHORING') partial++
  if (a.unclassifiable) hardFail++

  const bid = own.corners.length
  const declined = own.corners.filter(c => isDecline(c.reason)).length
  const hollow = own.corners.filter(c => c.reason === HOLLOW_REASON).length
  const mark = verdict === 'LIVE AUTHORING' ? '✅' : verdict === 'DEFAULTS ONLY' ? '⚠️ ' : '⛔'

  console.log(`── ${s.id} ──  ${bake.tiles.length} tiles · cw=${cw} · from ${s.file}`)
  console.log(`   ${mark} ${verdict} — ${note}`)
  if (a.unclassifiable) console.log(`   ⛔ ${a.unclassifiable} blockCustoms node(s) are not the documented shape — UNCLASSIFIABLE, not skipped.`)
  if (a.slots) {
    console.log(`      slots ${a.resolved}/${a.slots} read by this bake` +
                (a.stranded ? `  ·  stranded ${a.stranded} (${a.renumbered} renumbered, ${a.orphan} orphan)` : '') +
                `   ⚠️ streets ${a.streetsPresent}/${a.streets} present — a PROXY, not the resolution`)
  }
  if (a.stranded) console.log(`      stranded street(s): ${[...a.strandedStreets].slice(0, 8).join(', ')}${a.strandedStreets.size > 8 ? ' …' : ''}`)
  if (fieldLive.length) {
    console.log(`      fields in readable slots — does THIS construction read them?`)
    console.log(`        ${fieldLive.map(f => `${f.live ? '✅' : '⛔'} ${f.field}`).join('   ')}`)
    if (!fieldLive.some(f => f.live)) console.log(`        ⛔ every field is consumed elsewhere (upstream at the SHAPE pass, or by another tool). This is real authoring that A10 cannot test.`)
  }
  console.log(`   corners bid ${bid} · declined ${declined} (${bid ? (100 * declined / bid).toFixed(1) : '0.0'}%) · hollow ${hollow}` +
              ` · FILL ${own.fill}   (diagnosis)`)
  // ⭐ the gate's own unit, printed at measure time so a baseline can never be
  // saved without its band-end census on the page.
  // ⭐ RIM TILES ARE IN, not skipped. `noPed` used to disqualify a whole tile
  // here; the invariant now excludes only the ZERO-DEPTH ARC and measures the
  // rest, so the census covers the whole map (Jacob's ruling, 2026-08-08 — the
  // eye can never witness the rim, so a gate that skips it is not a gate).
  const ok = own.tiles.filter(t => !t.threw)
  const nEnds = ok.reduce((n, t) => n + (t.a10Rings || []).length, 0)
  console.log(`   ⭐ band ends (A10) ${nEnds} on ${ok.filter(t => (t.a10Rings || []).length).length} tile(s) · ${ok.reduce((s, t) => s + t.a10Area, 0).toFixed(1)} m²` +
              `   ·  not bucketed: A0 ${own.tiles.reduce((s, t) => s + (t.a0Area || 0), 0).toFixed(1)} m² · ZERO-DEPTH ${own.tiles.reduce((s, t) => s + (t.zeroArea || 0), 0).toFixed(1)} m² (owes no band)`)

  snapshot.states.push({
    id: s.id, scene: s.scene, look: s.look, variant: s.variant, file: s.file, cw,
    shapeHash: bake.shapeHash, authoring: { ...a, strandedStreets: [...a.strandedStreets] },
    verdict, live, fieldLive, fill: own.fill, tiles: own.tiles, corners: own.corners,
  })
}
for (const n of notChecked) console.log(`⛔ NOT CHECKED — ${n.id}: ${n.why}\n   Read nothing into its absence.`)

// ── save ────────────────────────────────────────────────────────────────────
if (SAVE) {
  if (mutantNote) { console.error('\n⛔ refusing to save a baseline measured under a MUTANT. A poisoned baseline makes every later run a lie.'); process.exit(2) }
  if (fixtureStale) { console.error(`\n⛔ refusing to save: ${fixtureStale} state(s) are FIXTURE DEAD — every slot names a run this bake does not contain. A baseline built on unread authoring is defaults wearing a fixture's name.`); process.exit(2) }
  if (hardFail) { console.error(`\n⛔ refusing to save: ${hardFail} state(s) could not be measured.`); process.exit(2) }
  if (partial && !has('accept-partial')) {
    console.error(`\n⛔ STOPPING — ${partial} state(s) are PARTIAL AUTHORING: the fixture has gone stale under the`)
    console.error(`   current bake and only its readable subset would be measured. That is a real narrowing of`)
    console.error(`   what the baseline proves, and it is the OPERATOR's call to accept, never the detector's.`)
    console.error(`   Re-author or re-resolve the fixture, OR re-run with --accept-partial to baseline the`)
    console.error(`   readable subset knowingly. Either way every later report keeps printing the slot counts.`)
    process.exit(2)
  }
  const p = join(ROOT, `scratch/.d2-${SAVE}.json`)
  writeFileSync(p, JSON.stringify(snapshot))
  console.log(`\n✅ baseline "${SAVE}" saved — ${snapshot.states.length} state(s), ${snapshot.states.reduce((n, s) => n + s.corners.length, 0)} corner rows.`)
  console.log(`   ${p}`)
  process.exit(0)
}
if (!AGAINST) {
  console.log('\n(no --against: this was a measurement, not a gate. `--save <name>` to baseline, then `--against <name>` to classify.)')
  process.exit(fixtureStale || hardFail || partial ? 1 : 0)
}

// ── classify the delta ──────────────────────────────────────────────────────
const basePath = join(ROOT, `scratch/.d2-${AGAINST}.json`)
if (!existsSync(basePath)) { console.error(`\n⛔ no baseline "${AGAINST}" at ${basePath}. Nothing to compare — this is not a pass.`); process.exit(2) }
const base = JSON.parse(readFileSync(basePath, 'utf8'))
const baseById = new Map(base.states.map(s => [s.id, s]))

const T = { served: 0, unchanged: 0, regression: 0 }
const E = { served: 0, unchanged: 0, regression: 0 }   // BAND ENDS — the unit of service
const C = { served: 0, unchanged: 0, regression: 0 }   // corner verdicts — DIAGNOSIS ONLY
let loud = 0
const loudLines = []
let a0Seen = 0, zeroSeen = 0

console.log('\n══ THE THREE BUCKETS ══')
console.log('⭐ served = A BAND END THAT EXISTED NO LONGER EXISTS (overlap, not proximity).')
console.log('   regression = a band end that did not exist now does · an end that GREW · geometry')
console.log('   moved on a tile where no end was removed.')
console.log('⛔ A0 (dead-end/mouth) regions and ZERO-DEPTH arcs are printed on their own lines and are')
console.log('   NEVER bucketed — they are other tickets. The corner verdicts below are DIAGNOSIS.\n')

for (const cur of snapshot.states) {
  const b = baseById.get(cur.id)
  console.log(`── ${cur.id} ──  [${cur.verdict}]`)
  if (!b) { console.log(`   ⛔ LOUD — state absent from baseline "${AGAINST}". Not comparable; not a pass.`); loud++; continue }
  if (b.shapeHash !== cur.shapeHash) {
    console.log(`   ⛔ LOUD — the BAKE MOVED (shape hash ${b.shapeHash} → ${cur.shapeHash}).`)
    console.log(`      This is not a FILL comparison. Every bucket below would be a lie; refusing to bucket this state.`)
    loud++; continue
  }
  if (cur.verdict === 'PARTIAL AUTHORING') {
    console.log(`   ⚠️  partial authoring — only ${cur.authoring.resolved}/${cur.authoring.slots} slot(s) are read by this bake.`)
    console.log(`      What follows tests the READABLE SUBSET. The stranded ${cur.authoring.stranded} are not under test at all.`)
  } else if (cur.verdict !== 'LIVE AUTHORING') {
    console.log(`   ⚠️  ${cur.verdict.toLowerCase()} — a clean result here says nothing about authoring.`)
  }

  // corners, keyed by the construction's own cornerT key within its tile
  const bMap = new Map(b.corners.map(c => [`${c.tile}|${c.k}`, c]))
  const cMap = new Map(cur.corners.map(c => [`${c.tile}|${c.k}`, c]))
  const servedTiles = new Map(), lostTiles = new Map()

  const appeared = [...cMap.keys()].filter(k => !bMap.has(k))
  const vanished = [...bMap.keys()].filter(k => !cMap.has(k))
  if (appeared.length || vanished.length) {
    console.log(`   ⛔ LOUD — the CORNER SET changed: ${appeared.length} appeared, ${vanished.length} vanished.`)
    console.log(`      The bid set is upstream of the takeover; a cure must not move it. Own class, not a bucket.`)
    loud++
    if (ROWS) for (const k of [...appeared.slice(0, 10), ...vanished.slice(0, 10)]) console.log(`        ${bMap.has(k) ? 'vanished' : 'appeared'} ${k}`)
  }

  const rows = []
  for (const [k, cc] of cMap) {
    const bc = bMap.get(k); if (!bc) continue
    let bucket, why
    if (bc.reason === cc.reason) { bucket = 'unchanged'; why = cc.reason }
    else if (isDecline(bc.reason) && cc.reason === SERVED_REASON) { bucket = 'served'; why = `${bc.reason} → BUILT` }
    else if (isDecline(bc.reason) && cc.reason === HOLLOW_REASON) { bucket = 'regression'; why = `${bc.reason} → built-empty-concrete (arc in name only — NOT a service)` }
    else if (!isDecline(bc.reason) && isDecline(cc.reason)) { bucket = 'regression'; why = `${bc.reason} → ${cc.reason} (a takeover that worked, LOST)` }
    else if (bc.reason === SERVED_REASON && cc.reason === HOLLOW_REASON) { bucket = 'regression'; why = 'BUILT → built-empty-concrete (concrete emptied)' }
    else if (bc.reason === HOLLOW_REASON && cc.reason === SERVED_REASON) { bucket = 'served'; why = 'built-empty-concrete → BUILT (arc filled)' }
    else { bucket = 'regression'; why = `${bc.reason} → ${cc.reason} (still declined, different gate — the corner is no better)` }
    C[bucket]++
    if (bucket === 'served') servedTiles.set(cc.tile, (servedTiles.get(cc.tile) || 0) + 1)
    if (bucket === 'regression') lostTiles.set(cc.tile, (lostTiles.get(cc.tile) || 0) + 1)
    if (bucket !== 'unchanged') rows.push({ k, bucket, why, p: cc.p, skel: cc.skel })
  }

  // ── THE BAND ENDS — the unit `served` is defined on ───────────────────────
  // servedTiles/lostTiles are now driven by ENDS, not by corner verdicts: a tile
  // "served" is a tile that lost a band end. The corner buckets above stay, but
  // they no longer decide what a served tile is.
  const bT = new Map(b.tiles.map(t => [t.i, t]))
  servedTiles.clear(); lostTiles.clear()
  const endRows = []
  for (const t of cur.tiles) {
    const bt = bT.get(t.i); if (!bt || t.threw || bt.threw) continue
    a0Seen += (t.a0Area || 0); zeroSeen += (t.zeroArea || 0)
    // ⛔ LOUD — the mono-width envelope moved. SECTION §7 lists it among what the
    // cure must PRESERVE; and a narrower band makes ends vanish without a single
    // one being CLAIMED, which is exactly the false green this class exists for.
    if (bt.fb !== t.fb) {
      loud++
      loudLines.push(`tile ${t.i} — the MONO-WIDTH ENVELOPE (fullBand) moved, ${bt.fb} → ${t.fb}. Its band ends are not bucketable: ends can vanish here for the wrong reason.`)
      continue
    }
    // ⭐ IDENTICAL FIRST, OVERLAP SECOND. An end whose ring is byte-identical is
    // trivially still there — say so without asking Clipper. That matters: at the
    // very bottom of the size range Clipper CLEANS a degenerate sliver away and
    // an intersection with itself comes back empty, which read as "served AND a
    // new end" on an unchanged map. The identity pass makes the noop mutant exact
    // instead of nearly-exact, and no threshold had to be widened to get there.
    const bR = (bt.a10Rings || []).filter(r => ringArea(r) > END_M2)
    const cR = (t.a10Rings || []).filter(r => ringArea(r) > END_M2)
    const bSet = new Set(bR.map(r => JSON.stringify(r)))
    const cSet = new Set(cR.map(r => JSON.stringify(r)))
    for (const r of bR) {
      const a = ringArea(r)
      if (cSet.has(JSON.stringify(r))) { E.unchanged++; continue }
      const ov = overlapArea(r, cR)
      if (ov <= NOISE_M2) {
        E.served++; servedTiles.set(t.i, (servedTiles.get(t.i) || 0) + 1)
        endRows.push({ bucket: 'served', tile: t.i, why: `band end of ${a.toFixed(2)} m² GONE` })
      } else if (ov < a - 0.05) {
        E.unchanged++
        endRows.push({ bucket: 'unchanged', tile: t.i, why: `band end SHRANK ${a.toFixed(2)} → ~${ov.toFixed(2)} m² — still an end, NOT a service` })
      } else E.unchanged++
    }
    for (const r of cR) {
      const a = ringArea(r)
      if (bSet.has(JSON.stringify(r))) continue
      if (overlapArea(r, bR) <= NOISE_M2) {
        E.regression++; lostTiles.set(t.i, (lostTiles.get(t.i) || 0) + 1)
        endRows.push({ bucket: 'regression', tile: t.i, why: `a NEW band end of ${a.toFixed(2)} m² — band reaching land use where it did not` })
      }
    }
    if (t.a10Area > bt.a10Area + 0.05) {
      E.regression++; lostTiles.set(t.i, (lostTiles.get(t.i) || 0) + 1)
      endRows.push({ bucket: 'regression', tile: t.i, why: `A10 band-in-LU GREW ${bt.a10Area} → ${t.a10Area} m²` })
    }
  }

  // tiles — the geometry unit
  const wrongWay = []
  for (const t of cur.tiles) {
    const bt = bT.get(t.i)
    if (!bt) { loud++; console.log(`   ⛔ LOUD — tile ${t.i} absent from baseline.`); continue }
    if (t.threw || bt.threw) { loud++; console.log(`   ⛔ LOUD — tile ${t.i} threw (${t.threw || bt.threw}) — never a skip.`); continue }
    if (bt.ia !== t.ia) { loud++; console.log(`   ⛔ LOUD — tile ${t.i}'s frozen iA moved; not a FILL delta.`); continue }
    const moved = bt.w !== t.w || bt.tl !== t.tl || bt.lu !== t.lu
    if (!moved) {
      T.unchanged++
      if (servedTiles.has(t.i) || lostTiles.has(t.i)) {
        loud++
        loudLines.push(`tile ${t.i} — a band end changed but the tile's FILL geometry did not. Impossible; the comparison is not measuring what it thinks.`)
      }
      continue
    }
    if (servedTiles.has(t.i) && !lostTiles.has(t.i)) {
      T.served++
      const dLu = t.aLu - bt.aLu, dW = t.aW - bt.aW
      if (dLu > 0.5) wrongWay.push(`tile ${t.i}: served, but LAND USE grew ${dLu.toFixed(1)} m² (concrete ${dW >= 0 ? '+' : ''}${dW.toFixed(1)} m²) — moved the wrong way`)
    } else if (lostTiles.has(t.i)) {
      T.regression++
    } else {
      // ⭐ geometry moved and NOT ONE band end was removed here. Under the old
      // corner definition this was excused whenever a corner had declined on the
      // tile; it no longer is — the cure's business is ends.
      T.regression++
      if (ROWS) console.log(`      ⛔ tile ${t.i} — geometry MOVED and no band end was removed here.`)
    }
  }

  const per = (o) => `served ${o.served} · unchanged ${o.unchanged} · regression ${o.regression}`
  console.log(`   band ends: ${per(E)}   ⭐ THE GATE   (cumulative across states)`)
  console.log(`   tiles:     ${per(T)}   (cumulative across states)`)
  console.log(`   corners:   ${per(C)}   (DIAGNOSIS ONLY — a decline count is not a verdict)`)
  console.log(`   not bucketed: A0 ${a0Seen.toFixed(1)} m² (dead-end/mouth — ticket A0) · ZERO-DEPTH ${zeroSeen.toFixed(1)} m² (rim/median — owes no band)`)
  for (const w of wrongWay) { loud++; console.log(`   ⛔ ${w}`) }
  if (ROWS) for (const r of endRows.slice(0, 60)) console.log(`      ${r.bucket.padEnd(11)} tile ${String(r.tile).padStart(4)}  ${r.why}`)
  if (ROWS) for (const r of rows.slice(0, 60)) console.log(`      corner ${r.bucket.padEnd(11)} ${r.k.padEnd(26)} ${r.why}   ${(r.skel || []).join(' + ')}`)
  console.log('')
}
for (const l of loudLines) console.log(`⛔ LOUD — ${l}`)

// ── verdict ─────────────────────────────────────────────────────────────────
console.log('══ WHICH STATES COULD GENUINELY TEST AUTHORING ══')
const full = snapshot.states.filter(s => s.verdict === 'LIVE AUTHORING')
const part = snapshot.states.filter(s => s.verdict === 'PARTIAL AUTHORING')
for (const s of full) console.log(`   ✅ ${s.id} — all ${s.authoring.resolved} slot(s) live.`)
for (const s of part) console.log(`   ⚠️  ${s.id} — PARTIAL: ${s.authoring.resolved}/${s.authoring.slots} slot(s) live; ${s.authoring.stranded} stranded and untested.`)
if (!full.length && !part.length) console.log('   ⛔ NONE — nothing in this run tested authoring at all. A clean result is not evidence.')
for (const s of snapshot.states.filter(s => s.verdict !== 'LIVE AUTHORING' && s.verdict !== 'PARTIAL AUTHORING'))
  console.log(`   ⛔ ${s.id} — ${s.verdict}: a clean result here is not evidence about authoring.`)

console.log('\n══ VERDICT ══')
console.log(`   band ends  served ${E.served} · unchanged ${E.unchanged} · regression ${E.regression}   ⭐ THE GATE`)
console.log(`   tiles      served ${T.served} · unchanged ${T.unchanged} · regression ${T.regression}`)
console.log(`   corners    served ${C.served} · unchanged ${C.unchanged} · regression ${C.regression}   (diagnosis only)`)
console.log(`   loud       ${loud}   (envelope moves · corner-set changes · bake moves · end-without-geometry · wrong-direction)`)
console.log(`   not bucketed: A0 ${a0Seen.toFixed(1)} m² · ZERO-DEPTH ${zeroSeen.toFixed(1)} m² — reported so they cannot be quietly counted as either success or failure.`)
// ⛔ The corner regressions still count against the change: losing a takeover
// that worked is damage even if no band end moved.
const bad = E.regression + T.regression + C.regression + loud + fixtureStale + hardFail
if (bad) console.log(`\n⛔ FAIL — the change is not a clean cure. Every line above is a class, not a score.`)
else if (!E.served) console.log(`\n⚠️  NO BAND END WAS REMOVED — this is not a pass, it is "the cure is not in this build".`)
else console.log(`\n✅ PASS — ${E.served} band end(s) no longer exist, ${T.served} tile(s) moved, and NOTHING moved where no end was removed.`)
process.exit(bad ? 1 : E.served ? 0 : 1)
