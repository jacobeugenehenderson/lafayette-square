# REPORT 02 — `cartograph/` doc ↔ code coherence

**Scope:** 26 active docs (6,361 lines), 51 JS/mjs/cjs (20,612 lines), `_archive/` (67 `.md`,
7,876 lines). Branch `land-use-derivation` @ `5a0bdaea`. **Zero edits made.**

Disambiguation used throughout: **CURB** = the drawn roadway edge (`iA`, the owner's "polygon") ·
**TILE** = the block face of the centerline graph (the code's "polygon").

---

## EXECUTIVE SUMMARY

**H1 — The A07 producer disclosure exists on Lafayette Square only.** `CLAUDE.md`'s gate says the
fallback receipt closed because "`producer` + `producerReason` are stamped on every tile." The
*mechanism* is live and correct (`src/lib/tileGround.js:4748`, gate at `:4289`). The *artifacts*
are not: LS carries 101/101 `producer` and 42/101 `producerReason`; **altadena (694 tiles),
hipointe-demun (196), lafayette-square-staging (116) and toy (12) carry zero.** Layer 0's
signature shape exactly — the instrument works on the one town everybody has looked at and is
silent on 1,018 tiles across four towns nobody has. **ASPIRATION, not rot:** the stamp was built,
the re-bake was never run.

⭐ `cartograph/SURVEY.md:136` already carries the honest caveat verbatim (*"`shape.json` on disk
is pre-A07 until a re-bake… an unstamped artifact means re-bake, not offset"*); `CLAUDE.md`'s
receipt does not, and the receipt is what a fresh agent reads.

**Two precision corrections:** the stamp is at `:4748`, **not `:3749`**; and `producerReason` is
*conditional* (`...(_reason ? { producerReason: _reason } : {})`), so "on every tile" is true of
`producer` and false of `producerReason`.

**H2 — 51% of code citations land nowhere near what they name, and every one is in-bounds.** Two
runnable checks disagree, and the gap is the finding: a bounds check passes 170/170, while a
semantic check (does any backticked identifier on the doc line appear within ±12 lines of the
cited code line?) **misses 82 of 161**. An out-of-bounds ref fails loudly; an in-bounds wrong one
hands the reader real, plausible, unrelated code — **a plausible-looking success in the
documentation layer**. A further **115 bare `:NNN` refs** are unresolvable by any script,
including the whole of `SURVEY.md §3`, whose eight sentences are all correct and whose eight
addresses are all dead.

⭐ The remedy is already written, in one doc, and never generalized: `BAKE.md:3` — *"Cite the
SYMBOL, never the line — this doc's line numbers had drifted by ~1,400 lines."* **BAKE.md then
breaks its own rule four lines later** and cites `serve.js:461` as the bake handler four times;
the handler is at `serve.js:1979`. **~1,518 lines — the exact drift its banner named.**

**H3 — `cartograph/README.md` (last touched 2026-05-12, the oldest doc here) documents a
pre-scene, single-town world.** Both headline rebuild commands now `process.exit(2)`; it names a
`render.js` that does not exist; its paths point at a flat `data/clean/` while every scene's real
data lives at `data/<scene>/clean/`; it omits `derive.js`, `promote-ribbons.js` and five bake
scripts. **This is the file an outside developer opens first.**

**The through-line:** the substance of this canon is unusually good — `SECTION.md`, `SURVEY.md`,
`RIBBONS.md`, `PIPELINE.md` and `WALL.md` are accurate, self-correcting and often verbatim-right
about the code. What has rotted is almost entirely **addressing and signage**. `NOTES.md:24` names
the disease in the opposite direction: *"a retraction is not done when the headers change. Fix the
steps, not the signage."* **Here the steps were fixed and the signage was not.**

---

## 1 · Doc inventory

```bash
for f in cartograph/*.md; do printf "%-45s %5s %s\n" "$f" "$(wc -l < $f)" \
  "$(git log -1 --format='%ad' --date=short -- $f)"; done | sort -k3 -r
```

| Doc | Lines | Last touch | SSoT for | KIND | Disposition |
|---|---|---|---|---|---|
| `OPERATIONS.md` | 321 | 08-29 | every operator knob, by panel | CANON | KEEP |
| `PREVIEW.md` | 174 | 08-28 | the publish-confidence gate | CANON + honestly-marked unbuilt v0.2 | KEEP |
| `BACKLOG.md` | 180 | 08-28 | forward state | CANON drifting to DIARY | KEEP + PRUNE (§3d) |
| `PREBAKE.md` | 276 | 08-21 | chains → frozen substrate | CANON, §1 rotten | KEEP, fix §1 (L2) |
| `SKELETON.md` | 345 | 08-14 | the frame + `skeleton.json` schema | CANON | KEEP |
| `SECTION.md` | 477 | 08-14 | the ped FILL | **CANON — best-maintained doc here** (L11) | KEEP |
| `RIBBONS.md` | 926 | 08-14 | geometry doctrine, tile model | CANON | KEEP |
| `POLYGON-FIRST.md` | 561 | 08-12 | doctrine as red-until-true checks | CANON | KEEP |
| `PIPELINE.md` | 231 | 08-12 | the execution spine + §Wall | CANON, branch ROT | KEEP (L3) |
| `OSM2STREETS-GROUNDING.md` | 157 | 08-12 | our road model vs the standard | CANON (self-scoped) | KEEP |
| `ARCHITECTURE.md` | 415 | 08-12 | file layout, publish loop, §8 | CANON | KEEP |
| `OSM-FORENSICS.md` | 296 | 08-11 | the skeleton's evidence base | CANON w/ accord banner | KEEP |
| `INTAKE.md` | 163 | 08-11 | data provenance | CANON | KEEP |
| `WALL.md` | 88 | 08-06 | the freeze | CANON; header stamped v0.1 over a body amended 4× | KEEP, restamp (L18) |
| `SURVEY.md` | 170 | 08-06 | the SHAPE tool | CANON, substantively excellent; all `:NNN` dead | KEEP, symbol-ize |
| `NOTES.md` | 224 | 08-06 | the Diary | **DIARY — working correctly** | KEEP |
| `FEATURES.md` | 103 | 08-06 | the pitch | CANON w/ a model error + dead pointer | KEEP, fix 2 lines (L5, L6) |
| `DOC-CODE-COHERENCE.md` | 99 | 08-06 | the corpse-lie ledger | **PART-ROTTEN** (§2) | KEEP + TRIAGE |
| `PREBAKE-POLYGONIZATION-PLAN.md` | 123 | 08-04 | self-declared "CLOSED SCOPE+SPIKE" | DIARY held by one un-lifted fact | ARCHIVE after lifting §1 into `PREBAKE.md` |
| `OSM-FORENSICS-EVAL.md` | 101 | 08-04 | build eval before/after | DIARY; every baseline superseded | ARCHIVE |
| `LOOP-STREETS.md` | 96 | 08-04 | Benton/Waverly | OVERLAP; self-demotes | MERGE-INTO-SKELETON |
| `BAKE.md` | 173 | 08-04 | the bake chain | CANON w/ 2 material errors | KEEP, fix (L4, L7) |
| `STAGE.md` | 152 | 07-04 | the Look tool | CANON | KEEP |
| `TOY_AUTHORING_PLAN.md` | 246 | 06-30 | toy fixture coverage | **ROTTEN body, banner-corrected** — ~230 lines describe the dead figure-ground path as live | **EXCISE body → ARCHIVE** |
| `SECTION-CAP-CLAMP-FORENSIC.md` | 104 | 06-22 | G8/G12 keep-vs-revert map | DIARY | ARCHIVE |
| `README.md` | 160 | **05-12** | the front door | **ROTTEN** (H3) | **REWRITE — highest ROI here** |

---

## 2 · Is `DOC-CODE-COHERENCE.md` current? **No.**

A 2026-06 artifact wearing a 2026-08 timestamp, and now itself a source of the thing it tracks.

- **Structurally it is the best thing in the directory.** Its taxonomy — **corpse-lie /
  aspiration / landmine** — is *better* than ROT/REGRESSION/ASPIRATION for this corpus, because
  it names the **landmine** (a truth living only in code), the dominant class here. **Keep the
  taxonomy.**
- `:29` pins the whole findings block to `HEAD a4e5a9b, curb-offset-draw` — not the trunk.
  Everything under "Findings" is a 3-month-old snapshot in the present tense.
- **Every code ref in the C-table is dead.** `sed -n '28p' cartograph/bake-ground.js` → a blank
  line (C2/B4 cite it); `sed -n '894p' src/lib/tileGround.js` → a comment about `circlePoly`, not
  the R-CLAMP header C11 says was excised there.
- ⛔ **Duplicate row id.** `grep -n "^| C13"` → two hits, `:56` (✅ fixed) and `:75` (🔎 open).
  Two states share one address.
- ⛔ **C4 is stale in a way that would cause damage if acted on.** It calls
  `src/lib/buildBlockGeometryV2.js` "the whole dead module… delete at T4." `SURVEY.md:89` has the
  corrected later reading and is right: it is also a live utility module (`pickLuFromHash`,
  `hashKey`, `blockKeyFromRing`, `resolveChainSegmentation`, `differenceRings`, `intersectRings`)
  imported by `tileGround`, `buildPathRibbons` and both overlays. **Do not act on C4.**
- **C1/C14 narrate `isTileScene=true` in the present tense.** `grep -rn "isTileScene" src/
  cartograph/*.js` → exactly two hits, both comments recording its removal.
- **C6/C7/C8/D8/B8 have carried "⚠️ re-verify before trusting" since June.** A permanently-
  unverified row is indistinguishable from a false one.

---

## 3 · The four standing claims, verified in live code

### 3a · `litmus-curb-parallel.mjs` — ⭐ BOTH RECEIPTS HOLD, AT THE EXACT CITED LINES

```
grep -n "blockCustoms: null\|iA?.length" cartograph/litmus-curb-parallel.mjs
→ 77:  blockCustoms: null, emitArtifact: true,
→ 86:  if (!tile?.iA?.length) continue
```

- **`:77` CONFIRMED verbatim.** Full opts (`sed -n '74,78p'`): `stencil: null, curbWidth: 0.15,
  smooth: 0, blockLandUse: null, cornerRadiusScale: 1, cornerRadiusOverrides: null,
  cornerCornerRadiusOverrides: null, blockCustoms: null`. **The flagship curb checker builds its
  comparison map with authoring switched off.** Layer 0 q3, committed by an instrument.
- **`:86` CONFIRMED verbatim.** A tile with no curb ring is skipped silently and never enters the
  denominator. Layer 0 q2, inside the detector.
- ⚠️ **A third silent skip nobody has flagged:** `:90` `if (Math.hypot(xx-xn, yx-yn) >
  MAX_TILE_SPAN) continue`. The perimeter-megatile filter is a **geometric size heuristic, not an
  identity test** — on a town whose blocks genuinely exceed `MAX_TILE_SPAN`, real blocks drop out
  and the aggregate still prints. **I did not run the litmus; magnitude not established.**

⭐⭐ **The fix already exists in the same directory, in seventeen lines.**
`cartograph/forbidden-surface.mjs`:

```
124:  * @param {string}  designPath  the Look's design.json — its blockCustoms + curbWidth
140:  const blockCustoms = (design.blockCustoms && typeof design.blockCustoms === 'object') ? design.blockCustoms : null
148:  const pr = sectionOpen(shape.tiles || [], cw, { outer: 'LU', inner: 'SW' }, null, blockCustoms)
```

Second reader of the same idiom: `bake-ground.js:355`. **Not a design problem; a two-line port.**
⚠️ `grep -l "forbidden-surface" cartograph/*.md` → **nothing**: the one file that models the
correct pattern is referenced by no doc.

### 3b · Zero `design.json`/`blockCustoms` reads in derive/pipeline/promote-ribbons — ⭐ CONFIRMED

```
grep -n "design\.json\|blockCustoms\|looks/" cartograph/derive.js cartograph/pipeline.js cartograph/promote-ribbons.js
→ derive.js:2619  // …(Per-fe blockCustoms
→ derive.js:2620  // overrides are reconciled separately in design.json, the Survey SHAPE SSoT.)
→ derive.js:3995  // identities; widths resolve at shape time (runMeasure/blockCustoms) and the
```

**All three hits are comments. Zero reads.** Corroborated by every `readFileSync` in the two
orchestrators: `osm.json`, project buildings, MSBF, `neighborhood_boundary.json`,
`building-overrides.json`, the elevation cache, `map.json`. **No `looks/` path.**

⛔ **This is NOT by itself a defect.** The prebake chain is *architecturally* upstream of
authoring; widths resolve at shape time in `tileGround`, exactly as `derive.js:2620` says. **The
consequence is downstream:** any measurement taken by running these three and reading their output
is **authoring-blind by construction**, and therefore wrong in Layer 0's signature direction. The
litmus is one instance. **Nothing in the corpus warns about the class.**

### 3c · Producer stamps — partially refuted. See H1.

### 3d · `BACKLOG.md` and `NOTES.md`

**`NOTES.md` = a correct DIARY.** Reverse-chronological, dated, superseded entries banner-marked
*in place* with the live home named (`:26`, `:30`, `:36`); aged entries lift to `_archive/notes/`.
**This one works.**

**`BACKLOG.md` = a live board that has accreted into a log, in explicit breach of its own header.**
`:3` reads *"STATE + forward-work only. No diary… When an arc lands it LEAVES here. Landed work is
NOT logged here."* The file then contains at least four blocks that are exactly that — `:59`
*"Landed 2026-06-29 → Reference (not logged further)"* plus `:61`, `:63`, `:65`.
`grep -c "Landed\|LANDED\|✅" cartograph/BACKLOG.md` → **57**.

**Staleness:** the "🔥 NOW" section (`:29–:57`) is dominated by 2026-06-26/30 items. The actual
live front does not appear: `grep -c "A17" cartograph/BACKLOG.md` → **0**, while `ROADMAP.md:80`
carries A17 and was touched 2026-08-29. ⭐ The *substance* is in canon (`RIBBONS.md:39` carries the
2026-08-12 substrate ruling) — **only the board is stale.** An outside developer told to "grep
BACKLOG for the feature name first" (root `README.md:160`) works the June board.

⛔ Do **not** delete the parked/retracted entries — several (`:128`, `:177`) exist specifically to
stop an agent redoing a damaging excision.

---

## 4 · The coherence ledger — 18 evidenced items

*Confidence: HIGH = both sides quoted verbatim · MED = mechanism confirmed, one side inferred.*

**L1 · `README.md:87` + `serve.js:2589`: a live route shells a file that does not exist.
ROT + CORPSE-LIE. HIGH.**
Doc `:87` `| node cartograph/render.js | Legacy preview renderer |`; `:72` `| POST | /rebuild |`.
Code `serve.js:2589` `await runShell('node render.js', …)`. `ls cartograph/render.js` → *No such
file*. Route mounted (`:2587`), reserved (`:987`). **It returns 500 on every call.**

**L2 · `PREBAKE.md:38` describes a `pipeline.js` less than half the current length; all four
anchors wrong. ROT. HIGH.**
Doc: *"`pipeline.js` (`:1`–`171`)… Reads `data/raw/osm.json` (`:28`)… runs `deriveLayers(...)`
(`:78`) and writes `data/clean/map.json` (`:158`)."* Code: `wc -l` → **367**; osm.json at `:32`;
`deriveLayers` at `:111`; write at `:354`. And **`data/clean/map.json` is the wrong path** —
`pipeline.js:21` itself says `requireExplicitScene('pipeline.js (writes
data/<scene>/clean/map.json)')`.

**L3 · Six active docs name `curb-offset-draw` as the trunk; the trunk is `land-use-derivation`.
ROT. HIGH.**
`grep -c "curb-offset-draw" cartograph/*.md` → BACKLOG 3 · OPERATIONS 5 · PIPELINE 3 ·
DOC-CODE-COHERENCE 1 · SECTION 1 · NOTES 3 · SECTION-CAP-CLAMP-FORENSIC 2 = **18 mentions**.
`staging.yml:5` → `branches: [land-use-derivation]`. Load-bearing because `PIPELINE.md:52`/`:70`
use it to state deployment status — *"LANDED (on trunk `curb-offset-draw`; not yet in prod)"* —
which an outside reader takes as "unshipped." NOTES' three are correct as Diary; **the other 15
are live claims.**

**L4 · `BAKE.md` steps 1–2 say "LS-only"; `PIPELINE.md` says scene-generic. ROT (BAKE). HIGH.
⭐ Cross-doc contradiction.**
`BAKE.md:49` *"clean/map.json | **LS-only**"*; `:50` *"**LS-only.**"* vs `PIPELINE.md:63`
*"STATUS: working, and now **scene-generic** — the whole prebake→bake arc runs for a fresh non-LS
neighborhood (hipointe-demun poured a full slab)."* Code settles it: `pipeline.js:13` imports
`SCENE/CLEAN_DIR`, `:21` refuses without `--scene`; `promote-ribbons.js:9,13` the same; six scene
data dirs exist. **BAKE.md is rot — and it is the doc a developer reads to learn the bake chain.**

**L5 · `FEATURES.md:22` assigns street WIDTH to Section. Every other doc and the code assign it to
Survey. ROT. HIGH. ⭐ Load-bearing for an outsider's mental model.**
Doc: *"**+ thickness** (Section) → provable truth: this street is N meters wide on each side."*
Contradicted by `PIPELINE.md:75` (*"⛔ Survey = SHAPE ONLY. No ped depth in Survey"*),
`SURVEY.md:13`, and `SURVEY.md:80` — the asphalt-edge drag writes
`blockCustoms[skelId][side][segOrd].pavementHW`, **in Survey**. Code: `pavementHW` resolves in the
SHAPE pass (`freezeCurbEdgeFacts` at `tileGround.js:200`, producer gate `:4289`); Section's
`resolvePedDepths` (`:1373`) resolves **only** `treelawn`/`sidewalk`. **FEATURES has the two
tools' jobs swapped in the one paragraph that teaches the conceptual model.**

**L6 · `FEATURES.md:103` points at `arborist/SPEC.md`, which does not exist. ROT. HIGH.**
`ls arborist/*.md` → ARCHITECTURE, BACKLOG, FEATURES, LEDGER-exorcism-wren, NOTES, ORIENTATION,
README. (`meteorologist/SPEC.md` does exist — half the line is fine.)

**L6b · Two further dead pointers into `_archive/notes/`, one accompanied by a false claim that
the file is in git. ROT. HIGH.**
`cartograph/_archive/notes/NOTES-2026-04-07_to_2026-05-18.md` cited from `LOOP-STREETS.md:7`,
`:95`, `NOTES.md:224`; `…NOTES-2026-05-27_to_2026-06-08.md` from `NOTES.md:223`. **Neither exists
and `git log --all` shows neither was ever committed.** Aggravating: `LOOP-STREETS.md:7` says
*"The archive copy stays in git"* — measurably false. ⛔ **Three dead pointers.**

**L7 · `BAKE.md`'s step table omits five bake steps the live handler runs. LANDMINE. HIGH.**
`grep -n "bake-landscape\|bake-labels\|bake-content\|bake-terrain\|bake-tree-anchors"
cartograph/serve.js` → `:2110 bake-terrain` · `:2154 bake-tree-anchors` · `:2185 bake-landscape` ·
`:2210 bake-content` · `:2240 bake-labels`, all inside `/looks/:id/bake`. **Three production bake
steps appear in zero cartograph docs**, while `BAKE.md §3` is the declared SSoT.

**L8 · `requireExplicitScene()` — a hard `process.exit(2)` on five CLI entry points — is
documented NOWHERE. LANDMINE. HIGH. ⭐⭐ The #1 blocker for town #2.**

```js
// config.js:50-66
export function requireExplicitScene(who = 'this command') {
  if (SCENE_IS_EXPLICIT) return SCENE
  console.error(`⛔ ${who} refuses to run without an explicit scene. …`)
  process.exit(2)
}
```

Callers: `skeleton.js:23`, `pipeline.js:21`, `promote-ribbons.js:13`, `bake-terrain.js:42`.
`grep -ln "requireExplicitScene" cartograph/*.md` → **nothing**. Meanwhile `README.md:86`
documents the rebuild as bare `node cartograph/skeleton.js` then `node cartograph/pipeline.js` —
**both exit(2) today.** ⭐ `config.js:25-37` carries the *reason* — thirteen lines of first-rate
Layer 0 doctrine (*"`SCENE = env || DEFAULT_SCENE` meant forgetting the variable silently
redirected the whole run onto Lafayette Square… On 2026-07-31 that cost a full day"*) — **and it
exists only as a code comment.**

**L9 · `derive.js:4632-4648` (the `__boundary__` injection) is cited in six places; it is at
`:4753–4823`. ROT (address only). HIGH.**
`grep -ohE 'derive\.js:[0-9]+' cartograph/*.md | sort | uniq -c | sort -rn | head -1` → **6
`derive.js:4632`**. Code: `:4758 const BOUNDARY_SKEL = BOUNDARY_EDGE_SKEL`, `:4807 faceStreets =
[...clipped, { points: ring, skelId: BOUNDARY_SKEL }]`, `tileGround.js:1033 export const
BOUNDARY_EDGE_SKEL = '__boundary__'`. The mechanism is described *accurately*. **The canonical
instance of H2.**

**L10 · `PIPELINE.md:177` cites `tileGround.js:984` for the face-area filter; it is `:1014`.
ROT. HIGH.**
Predicate verbatim correct (`return faces.filter(f => signedArea(f.ring) > 1e-3)`), address 30
lines off. **This line carries a ⛔ CORRECTED banner dated 2026-08-12** — it was actively
re-verified three weeks ago and the number still drifted. **Line numbers cannot be maintained by
re-verification; only symbols survive.**

**L11 · `SECTION.md` is the counter-example — refs accurate to ~3 lines, facts verbatim. NO
DEFECT. ⭐ The pattern to copy.**
`:91` cites `gleanTreelawn` + `resolvePedDepths` and three tunables: `TREELAWN_YN_THRESHOLD=0.6`,
`STD_TREELAWN=1.5`, `ADA_SIDEWALK=1.5`. Code: `:1294 = 0.6`, `:1295 = 1.5`, `:1296 = 1.5`,
`:1316 gleanTreelawn`, `:1373 resolvePedDepths` — **all three constants exact**. `:97` cites
`MeasureOverlay.jsx:717-753 tryFlipStripMaterial` → actual `:720`, **three lines.**

**L12 · `SURVEY.md:136`'s producer-gate quote is verbatim correct. NO DEFECT.**
Doc: *"takes the per-edge parallel offset (`buildCurbRings`) whenever `iaOffset !== false &&
!isMedianTile && ringArea > 1500`."* Code `tileGround.js:4289`: character-for-character. Recorded
so H1's recommendation is *propagate SURVEY's caveat*, not *write a new one*.

**L13 · The phantom-park defect is still open exactly as described; line ref off by 15.**
Doc: *"phantom park from `classify.js:60` — `landuse=grass` mis-stamp, 25 of 29 `use='park'` faces
are residential yards."* Code `classify.js:75-77`: `if (tags.leisure === 'park' || tags.leisure ===
'garden' || tags.landuse === 'grass' || tags.landuse === 'recreation_ground') { type = 'park'`.
Both offenders still in the bucket. ⛔ The fix is in `classify.js`, **not** by deleting
`layers.park[0]`.

**L14 · `BACKLOG.md:102`'s A09 claim is verbatim correct.** `fetch.js:123-124`: `nodes[el.id] =
[el.lon, el.lat]` / `} else if (el.type === 'way' && el.tags) {`. Tags read for ways, discarded for
nodes. ⚠️ I did not re-run the "489 crossing nodes" count.

**L15 · `SURVEY.md:54`'s `isTileScene` claim confirmed; `DOC-CODE-COHERENCE` still narrates the
flag as live.** The cleanest evidence that the ledger is now a source of the thing it tracks.

**L16 · `WALL.md:32`'s A02 mechanism fully CONFIRMED; the eye-gate it declares owed is still owed.**
`grep -rn "shapeFreezeMissing" src/` → `useCartographStore.js:1793`/`:1795` · `StatusBar.jsx:6` ·
`BlockGeometryV2Debug.jsx:543/569/599/623`. **Both doors present** — `:623` carries a full reason
string: *"Frozen shape for '<scene>' FAILED to load… The Data Wall is not holding."* Line refs
`:589`/`:595` are ~30 off.

**L17 · `FEATURES.md:100` sells `PIPELINE.md` as "P1–P15"; it has P1–P10.**
`grep -cE "^### P[0-9]+ ·" cartograph/PIPELINE.md` → **10**. Implies five undocumented stages.

**L18 · `WALL.md:5` and `SURVEY.md:5` still stamp "v0.1 (2026-06-05) — new" over bodies amended
through 2026-08-04. ROT (signage). MED.**
WALL carries dated corrections at `:11`, `:30`, `:32`, `:78`; SURVEY at `:69`, `:105`. **A reader
date-triaging by header discards two of the most current docs in the directory.**

---

## 5 · Dead code — the census

⚠️ **Method correction worth recording:** a basename grep alone misclassifies this directory.
Every CLI entry point is dispatched as a **shell string** (`runShell('node skeleton.js')`), never
imported — `skeleton.js` (2,375 lines) shows **0 importers and is entirely live**.
`package.json` references exactly one cartograph file (`dev:cartograph → node --watch
cartograph/serve.js`).

**Totals: 17 LIVE-CLI · 24 LIVE-IMPORTED · 8 DOC-ONLY (hand-run) · 2 ORPHAN.**

| File | Lines | Evidence |
|---|---|---|
| `migrate-overlay.js` | 119 | **Zero refs.** Only repo-wide hit is a prose aside at `derive.js:2397`. Self-described one-shot; last touched 2026-05-08. **The sole clean EXCISE candidate.** |
| `probe-feature-elevation.js` | 62 | **Zero refs of any kind.** But its output `src/data/park-feature-elev.json` **is** live-imported (`LafayettePark.jsx:28`, `loadInstanceData.js:54`). ⛔ Deleting it makes a shipped artifact unregenerable. |

**The DOC-ONLY eight** (`survey.js`, `litmus-curb-parallel.mjs`, `seed-centerlines.js`,
`rejoin-splits.js`, `derive-ls-render-ledger.js`, `derive-toy.js`, `tripwire-ls-reads.cjs`,
`pipeline/hydrate-anchor-cards.js`) are **not dead** — hand-run tools whose *outputs are live*.
⛔ Deleting any would break nothing running and make a committed artifact unregenerable.

**Also dead:** `serve.js:2589`'s `/rebuild` handler (L1) — the route, not a file.

**Duplication:** `pointInPolygon` is written **six times** inside `cartograph/` alone —
`bake-content.js:57` · `classify.js:19` · `sceneStencil.js:51` · `neighborhood-membership.mjs:29` ·
`forbidden-surface.mjs:76` · `membership.mjs:60`. `membership.mjs` (144 lines) and
`neighborhood-membership.mjs` (95) have **zero importer overlap** — buildings use one,
trees/lamps/labels the other.

**One flag, not a diagnosis:** `bake-buildings.js:142` reads `// 'lafayette-square' proper noun —
the hardwire retired.` — but `:658-662` still carries `if (scene !== 'lafayette-square' &&
existsSync(nbP))` under its own comment *"The `scene !== 'lafayette-square'` gate is a HARDWIRE."*
**Whether the second gate is in scope for the same ticket: not established.**

---

## 6 · Could an outsider pour a new town from `cartograph/`'s docs alone? **No. Five blockers.**

1. **The `--scene` contract is undocumented and the documented commands hard-exit.** (L8.)
   Stops them at minute one — and the error message routes them to `BRIEF-ls-bleed-excision`, a
   root-level brief, not to any cartograph doc.
2. **The front door describes a one-town filesystem.** (H3/L2.) The real layout —
   `cartograph/data/<scene>/{raw,clean,content}/` — appears in **no** cartograph doc's file tree.
3. **Nothing tells them the prebake chain is authoring-blind, or what that costs.** (3b.) The one
   file that models the correct idiom (`forbidden-surface.mjs:124-148`) is referenced by no doc.
4. **The bake chain they are told to run is five steps shorter than the real one, and two of its
   eight documented steps say "LS-only."** (L4/L7.)
5. **Every third citation lands on unrelated code.** (H2.) For a reader with no context a wrong
   citation is worse than none — they cannot tell.

⭐ **Cheapest fix that moves all five:** rewrite `cartograph/README.md` against today's reality and
adopt `BAKE.md`'s own rule — **cite the symbol, never the line** — corpus-wide.

---

## 7 · The archive — design record, with a dumping-ground tail

**Size:** 67 `.md` (47 top-level + 19 `handoffs/` + 1 `notes/`), **7,876 lines**. Filename dates
2026-06-03 → 2026-08-29. ⚠️ 33 of 67 carry git date `2026-07-31` or `2026-07-22` — the archive was
populated in two sweeps, so **git date is not authoring date; the filename date is the honest one.**

**Inbound pointers:** **44 of 67 are pointed into.** Top: 9 `BRIEF-polygon-asks-the-stamp-2026-07-30`
· 8 `RIBBONS-figureground-emitter-2026-06-15` · 7 `HANDOFF-real-dof-2026-06-27` · 6
`JUNCTION-CURE-PLAN`, `BOZ-full-2026-08-06` · 5 `TRUMAN-FORENSICS`.

**Zero inbound: 23 of 67 (34%)** — and the pattern is diagnostic: **all 8 retired BRIEFs are
zero-inbound.** Delivered briefs get moved and then never referenced. **That is the dumping-ground
segment.**

**Naming discipline:** disposition token **34/67 (51%)**; date in filename **55/67 (82%)**;
**neither — you cannot tell from the name whether it is live thinking or dead — 11/67 (16%)**:
`CORNER_HANDOFF`, `SHADOW_HANDOFF`, `DEAD-END-MOUTH-FORENSIC`, `TRUMAN-FORENSICS`,
`SPAR-SKELETON-FORENSIC`, `DIVIDED-CORRIDOR-PLAN`, `SPLINE-18TH-FINDINGS`, `CORNER_DEBUG`,
`JUNCTION-CURE-PLAN`, `HANDOFF-section-perf`, `RENDER-PATH-CENSUS`. Separately, **22/67 have no
archived banner in the first 8 lines.**

⛔ **The one evidenced reverse-risk case.** `CORNER_DEBUG.md` and `CORNER_HANDOFF.md` (2026-04-13
content, undated names, zero inbound, **no banner**) state as "Core principles":

> `CORNER_HANDOFF.md:15` — *"Both streets' sidewalk arms merge at the corner into a single
> surface — **no ownership, no 'which street's sidewalk wins.'**"*
> `CORNER_HANDOFF.md:18` / `CORNER_DEBUG.md:37` — *"**Curb is aesthetic, not measured**… not part
> of the measurement tool scheme."*

Live canon says the opposite on both counts: root `README.md:35` — *"ring ownership is a
**partition**… `groupRuns` gives every ring edge exactly one owning run"*; `RIBBONS.md:688` — *"the
curb is the per-edge parallel offset of the centerline: `iA = chain ⊕ pavementHW` per side."*
**An agent grepping `curb` or `corner ownership` hits `CORNER_DEBUG.md` with nothing on screen
marking it retired — and "there is no ownership" is precisely the belief the live corner cure
exists to reverse.**

**Also orphaned:** `BANNERS-excised-2026-08-06` is the auditable record of which false sentences
were removed and what falsified each; it correctly self-labels *"⛔ Nothing in this file is true"*,
and **nothing points at it**, so the audit trail is unreachable except by directory listing.

---

## 8 · What I would do first

1. **Port `forbidden-surface.mjs:140`'s two lines into `litmus-curb-parallel.mjs:77`**, and make an
   absent/degenerate `iA` a loud named failure class instead of `:86`'s `continue`.
2. **Re-bake the four unstamped scenes**, then write `SURVEY.md:136`'s caveat into `CLAUDE.md`'s
   receipt. ⛔ Do not edit the receipt without the re-bake.
3. **Fix the three dead pointers** and strike `LOOP-STREETS.md:7`'s false claim.
4. **Rewrite `cartograph/README.md`** against the scene-keyed reality.
5. **Adopt "cite the symbol, never the line" corpus-wide, and make it a check.**
6. **Excise `serve.js`'s `/rebuild` handler** and both README rows; excise `migrate-overlay.js`.
7. **Triage `DOC-CODE-COHERENCE.md`** — archive the June forensic, renumber C13, retract C4,
   re-verify or retire the five ⚠️ rows.
8. **Document `requireExplicitScene` + the scene layout.** The doctrine is already written at
   `config.js:25-37`; it just needs to exist outside a code comment.
9. **Banner `CORNER_DEBUG.md` and `CORNER_HANDOFF.md`.**

---

## 9 · What this audit did NOT measure

- I did not **run** `litmus-curb-parallel.mjs`. **Cause and magnitude not established.**
- I did not **re-derive** any count quoted from a doc (489 crossing nodes, 25-of-29 park faces,
  50 dead-end slits). 82/161 is mine; the doc-sourced numbers are attributed.
- I did not audit `ARCHITECTURE §§2–8`, `OPERATIONS`, `RIBBONS`, `POLYGON-FIRST`, `SKELETON`,
  `INTAKE` or `STAGE` line-by-line. **Their absence from the ledger is not a clean bill.**
- ⛔ **No difference between blocks, towns, or authored values was treated as evidence of a bug.**
  The one place this mattered — H1's 42-of-101 `producerReason` — is reported as the *conditional
  stamp working as written*, not as a partial write.
