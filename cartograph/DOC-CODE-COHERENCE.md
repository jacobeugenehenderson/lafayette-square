# Doc ↔ Code Coherence — the corpse-lie ledger

**State doc.** Tracks where the **docs and the code disagree** — so the two can be driven back into sync. The campaign rule (Jacob, 2026-06-05): **if a truth lives in only ONE place, that's a smell.** Code must reflect the docs; the docs must reflect the code.

> Sibling to `_archive/RENDER-PATH-CENSUS.md` / `_archive/SECTION-CENSUS-2026-06-03.md` (both archived — Section is built) — the same census discipline, aimed at divergence. The deep "why": `[[project_the_palimpsest_code_path_multiplicity]]` (the code-side palimpsest). Method memory: `[[feedback_docs_effluvium_buried_the_answer]]`.

---

## The three divergence types

- **Corpse-lie** — code that *contradicts* an established truth: a stale comment, a dead path still mounted, a vestigial field/flag. Actively misleads (it has already misled agents this campaign). → **excise.**
- **Aspiration** — a truth that lives only in the docs (a target the code doesn't do yet). Not a lie *if marked* current-vs-target; a lie if presented as done. → **mark, don't assert.**
- **Landmine** — a truth that lives only in the code (undocumented). → **document it** (in the right topic-doc).

**How it's used:** each truth we land in a topic-doc, we hunt the contradicting code and log it here. **Identification happens in the doc phase; excision happens via specialist briefs at the code phase.** A row goes ✅ only when both places agree.

**Status legend:** 🔎 identified · 📝 brief-drafted · ✅ excised+synced · ⚠️ re-verify before trusting.

> ⭐ **Mapping to `CLAUDE.md`'s three causes**, because both vocabularies are live and they are the same
> three things: **corpse-lie ≈ ROT** (evict) · **landmine ≈ REGRESSION or an undocumented truth** (fix or
> document) · **aspiration = ASPIRATION** (⛔ neither evict nor "correct" — surface it as work).

---

## ⭐⭐⭐ The 2026-09-06 progression survey — nodes and chains → the drawn surface

**Commissioned by Jacob:** *"We have a huge corpus of docs, and I think that's the problem. The agents
self-confuse. The technical issues frequently expose themselves when you just drop the jargon and say
logically what we're trying to do."* The scrub produced the rewritten `PIPELINE.md`; this is the
divergence half — **where we are off, and on which side.**

⛔ **Scope:** the eight docs that describe the progression — `SKELETON` · `PREBAKE` · `SURVEY` ·
`SECTION` · `RIBBONS` · `POLYGON-FIRST` · `PIPELINE` · the retired `WALL`. Docs-only pass; **no code was
changed** beyond repointing doc citations inside comments.

### S0 · The finding that contains all the others — 445 KB of one storyline

Measured before touching anything:
▶ `wc -c cartograph/{SKELETON,RIBBONS,POLYGON-FIRST,SECTION,PIPELINE,PREBAKE,SURVEY}.md`

**Eight docs, 445 KB, one progression.** Every one of them opened by re-explaining what its stage *is*.
⭐ **The re-explanations are where they contradicted each other; the deep detail below them mostly did
not.** That is the whole diagnosis, and it is why the cure was to say the narrative **once** and leave
detail where it was, rather than to rewrite eight docs.

**Done:** the six openings excised to `_archive/stage-doc-openings-2026-09-06.md`, `WALL.md` folded
whole into `PIPELINE.md` (`_archive/WALL-2026-09-06.md`), each doc now carrying one pointer up.
✅ Type: **rot, structural.**

---

### S1 · 🔎 **CORPSE-LIE, and it is a whole class: the code citations do not resolve**

**51 of 99 `file.js:NNN` citations in those eight docs point at something else.** 13 verify; 35 name no
symbol at all and cannot be checked. *(Measured before the scrub, `WALL.md` still in the set.)*
▶ `node scratch/claims-doc-code-citations.mjs` *(new, 2026-09-06 — it READS the source, so it cannot go
stale; `SHOW_OK=1` shows the passes, `--window=N` widens the tolerance)*
⛔ **Re-run it; don't quote the figure.** The class is the finding, not the count.

⭐ **The check can only prove staleness, never freshness.** A pass means "a symbol named on the doc line
appears near the cited line." Its first version *passed* `BlockGeometryV2Debug.jsx:562` on the word
"shape" when the thing it is cited for lives at `:638` — **the instrument's own false positive, found by
inspecting its output rather than its summary.**

**Why this is the corpus's most expensive defect and not a tidiness issue:** an agent routes correctly,
follows the citation the canon gives it, lands in an unrelated comment 2,000 lines away, concludes the
canon is stale, and **re-derives from grep** — which is precisely the failure `CLAUDE.md` step 2 exists
to prevent. The gate holds and the pointer breaks.

**Worse — 14 citations point at sections that never existed.** `WALL.md §31` is cited **13 times**,
including by the previous `PIPELINE.md` as *"the accurate SSOT"* and by `README.md` as *"Accurate
SSOT"*; `WALL.md §5b` once, from a code comment. **`WALL.md` had sections 0–6.** A phantom section
cited as the authority is the purest form of this disease: **it cannot be checked, so it is believed.**

**Fix, and it is a method not a sweep:** `PIPELINE.md` now cites **symbols, not line numbers** — `grep -n`
is one keystroke and never rots. ⛔ **A line number reintroduced into a canonical doc is a regression.**
Run the check when you touch one. *(The 51 in the other seven docs are **not** repaired — repairing them
by hand re-creates the same rot on the next refactor. The right cure is to stop citing lines.)*

---

### S2 · ✅ **CORPSE-LIE, doc side, and it cost a day: the Wall's display gate**

`WALL.md:30` said the frozen artifact is what Survey/Design shows *"when no element is active"* — an
**idle-display** reading.

The code gates on **which tool is selected**: `sectionFrozen = !surveyActive && !!frozenShape`, and
`surveyActive` is `tool === 'surveyor' && inDesigner`. ⇒ **With the Survey tool selected at all — idle,
nothing picked, hands off — the frozen artifact is bypassed.**

⭐⭐ **And the correct sentence was two lines above the wrong one, in the code's own comment:** *"Frozen
whenever NOT surveying (Measure + neutral Design)."* **This was never drift. The code said it right and
nobody propagated it.**

**Cost:** an agent, reasoning from the doc, told Jacob to reload Survey to see a producer change that
**structurally could not appear there**. He did. Nothing changed. ✅ **Excised** — the claim is gone with
`WALL.md`, and `PIPELINE.md §5` does not repeat it.

> ⛔⛔ **AND THE FRAMING THAT GREW OUT OF IT IS THE MORE DANGEROUS HALF.** The same agent then wrote
> *"Survey never reads the frozen artifact; it live-builds from the chains, always"* and used it to
> explain why its work was invisible. **Jacob's correction: the axis is CHAINS vs ①, not frozen vs
> live.** ① is frozen into `ribbons.json`, which the live build already loads — so a live build can build
> **from ①**, and the frozen/live distinction is beside the point. ⭐ **Stating the gate as a constraint
> turned a defect into an excuse.** Carried into `PIPELINE.md §3a` as a standing warning.

---

### S3 · ⛔ **ASPIRATION — and this is the one a naïve sweep would have deleted**

Two answers to *"what is a block"* are alive in the corpus at once, and **both are correct sentences**:

- **Shipped:** a block is a **face of the centerline graph**. Stated as load-bearing fact #1 in the
  previous `PIPELINE.md step 3a (what a block is)`. True of the code.
- **Ruled 2026-08-12:** the substrate is a **punch-out** — blocks are the holes in one closed compound
  path (`RIBBONS §1`). Built, minted, frozen into `ribbons.json` as `protopolygon`, **and producing
  nothing that ships**: an overlay behind `?grout=1` in the app, an env flag in the bake.

⛔ **Neither doc was wrong. What was missing was any sentence saying these are two different answers and
which one is on.** A conformance pass that "brought the docs into line with the code" would have deleted
the ruling as rot — which is exactly `CLAUDE.md`'s named failure mode for this kind of work.

✅ **Fixed by naming it rather than resolving it:** `PIPELINE.md` **step 3a** is a step of its own, whose
job is to hold both and say which ships. ⛔ **Do not collapse it.**

**Why the ruling exists — the evidence, not the preference:** a graph face **cannot close around a
dead end**; the walk goes out and back over the same vertices, so **all 50 dead-end tips are zero-width
slits**, and 40 only look right because a later cosmetic step displaces the drawn edge off the ring by
up to 13 m. ⭐ `detectTileCaps` is **a slit detector wearing a cap detector's name** — its criterion is
literally *"the ring doubled back here"* — and that registry was used for months as a source of
identity.

---

### S4 · 🔎 **CORPSE-LIE, doc side: "the curb is a concentric offset, parallel everywhere"**

Printed as load-bearing fact #2 in the previous `PIPELINE.md step 3a (what a block is)`, with no mention of the carve.
`ORIENTATION.md` and `POLYGON-FIRST §1` have carried the corrected version since A07: **the curb has two
producers**, and the carved share **varies by town** — 59 of 101 offset in the first town, 19 of 77 in
another — **so no single scene reveals the split.**

**Consequence:** a reader who believes the headline debugs a carved block with reasoning that cannot
apply to it. ✅ **Fixed** — `PIPELINE.md §6` now carries the two-producer rule and the instruction to
**read the `producer` stamp before reasoning about a curb.**

---

### S5 · ⚠️ **OPEN, correctly documented, and quoted anyway: Check A is blind in both Layer-0 modes**

`litmus-curb-parallel.mjs` passes **`blockCustoms: null`** — it runs with **authoring switched off** — so
it scores the operator's own authored widths as defects (one avenue's authored 8.70 m read as a "3.13 m
bow"). And it **silently skips a block with no curb ring at all**, printing *"this block has no curb"*
as a modest bow. **A fallback inside the detector, which is the one place it must never be.**

**⚠️ Re-verified in the code 2026-09-06: both still present, at the lines `CLAUDE.md` names.** This is
**not** a doc↔code divergence — the docs describe it accurately. It is on this ledger because **its
aggregate is still quoted as evidence**, and a number from a blind instrument is worse than no number.
⛔ Until it runs **with** the scene's authoring and reports an absent ring as its own loud failure class,
**Check A's aggregate is not evidence of anything.**

---

### S6 · 🔎 **LANDMINE — a truth that existed only in one agent's measurement, on the day it was taken**

**The centerline the operator SEES is not the line ① is built from.** `ribbons.streets[].points` versus
the simplified skeleton: **median 1.00 m apart, p90 7.50 m, max 20.8 m — 4,781 of 9,547 points more than
a meter off.** ⇒ **The curb is a perfect offset of a line nobody can see** (② is parallel to ① at the
authored width on 101/101 blocks, max error 0.00 m — `scratch/claims-proto-curb-is-parallel.mjs`).

Also landmined, same day: **the authored corner radius is not built** on the ① path. It belongs in the
node's bezier handles; a rounding pass was written, grew four guards each propping up the last, and was
excised. On that path, corners are sharp.

✅ **Documented** in `PIPELINE.md §3a`. ⛔ Neither is a defect *in the docs* — they are live work, and the
defect was that the docs did not know about them.

---

### S7 · ⭐⭐⭐ **THE STRUCTURAL FAULT, diagnosed from outside: the corpus is strong on RULINGS and weak on HOW TO MEASURE**

An agent arrives, finds a ruling with no instrument attached, **invents an instrument, and the instrument
is where the errors live.**

**Evidence, one agent, one day, seven findings — every one a measurement error wearing a defect's
clothes:** a copied-sign `signedArea` · gross `|area|` over an annulus · area-over-perimeter on an
annulus outer ring · outer-minus-holes on a pooled band · a compound-path SVG renderer painting holes
solid · centroid block-assignment (which `RIBBONS §1`'s own reconcile gate documents as misfiling
non-convex islands) · nearest-segment instead of perpendicular-to-line. **Every one produced a plausible
number.** ⭐ **And this scrub reproduced the failure in miniature** — S1's own instrument passed a
citation on the word "shape."

**Scale of the invention:** `ls scratch/*.mjs | wc -l` → **664**. The answer is almost never the 665th.

> ### ⭐⭐⭐ AND HERE IS THE SHAPE OF IT, WHICH IS WORTH MORE THAN THE LIST
> **The recurring failure is not *"the measurement was wrong."* It is *"the measurement answered a
> different question than the one asked — and nothing in the number says so."*** *(The agent's own
> formulation, offered against itself.)*
>
> ⛔ That is why these survive review: a wrong number looks wrong, and **a number answering the wrong
> question looks exactly like the right answer.** Gross `|area|` over an annulus is a perfectly good
> area — of the wrong region. `Object.keys(tiles[0])` is a perfectly good field list — of one block.
> **The eighth instance that day was sampling one and reporting the population**, and it reached this
> very survey (S9).
>
> ▶ **The move: before trusting a number, say out loud what question it answers, and check that against
> the question you asked.** ⭐ And prefer an instrument that fails loudly on the wrong region — that is
> the same Law-2 discipline as `--proto`'s throw-and-refuse, applied to measurement.

✅ **Fixed structurally, not by exhortation:** every stage in `PIPELINE.md` now carries a **"how you would
tell it was wrong"** line **naming an existing instrument**. ⛔ **A ruling without an instrument is half a
ruling** — when you land one, land the check with it.

⭐ **And the sharpest one is free:** *a seam between two bands is not constructible* — tree-lawn and
sidewalk are offsets of one contour. **So a visible seam is a real defect, at a glance, with no probe at
all.** ⭐⭐ **The unit is the BLOCK** (`scratch/draw-one-block.mjs --street NAME`). Every whole-map total
used during this arc hid a localised defect: a mean over 101 blocks cannot tell you one of them is inside
out.

---

### S8 · 🔎 **The disease under S1–S4: the same truth stated in five places, in five scopes**

The wall's producer/consumer split was stated in `WALL`, `PIPELINE`, `PREBAKE`, `POLYGON-FIRST`, `BAKE`,
`SKELETON`, `SURVEY`, `BACKLOG` and `README` — each with its own precision-fix banner stacked on top of
its own earlier wording. **That is how the overgeneralisation *"prebake is authoring-blind"* entered
circulation**, when the accurate statement is narrower and load-bearing: prebake **does** read the
street-keyed overlay and **does not** read `design.json`/`blockCustoms`.

⛔ **A correction banner sitting next to the sentence it corrects is the anti-pattern** — the false
sentence outlives its correction because it is shorter and reached first. ✅ Partially cured: the wall is
now stated **once**, in `PIPELINE.md §5`, and eight files point at it. **Still owed:** the same
consolidation for the producer/Check-C language in `BAKE` · `BACKLOG` · `README`, which still carry their
own paraphrases.

---

### S9 · ⚠️ **Two errors this survey itself introduced, caught by review within the hour**

Recorded because S7's whole point is that plausible-looking statements are the failure mode, and a
survey that hid its own would be arguing against itself.

- ⛔ **"① is a drawn overlay behind `?grout=1`" — wrong object.** `?grout=1` strokes each chain at the
  **authored half-width** and unites them: offset-then-polygonize, the old order. **It builds the curb,
  not the protopolygon** (`RIBBONS §1` says so explicitly). Two constructions sharing a block of code and
  a nearly-identical flag name — `grout: true` from the URL versus `grout: 'proto'` from the bake. The
  true statement is stronger: **① has no app surface at all.**
- ⛔ **"behind an environment flag" — it is a CLI flag**, `--proto` on `bake-ground.js`, read from argv.
  This codebase gates on argv rather than `process.env` on purpose. **"Environment flag" sends a reader
  hunting for something that does not exist — the same class of error as `WALL.md §31`.**

✅ Both corrected in `PIPELINE.md §3a`, verified in the code before the edit.

**And three more, from the other side of the same conversation — logged here at that agent's own
request, because a survey that records its author's errors and not its sources' is only half honest:**

- ⛔ **"a real frozen tile carries 17 fields" — read off `tiles[0]` and reported as the contract.** The
  union across all 101 LS tiles is **20**, and — the fact that actually matters — **only 14 are on every
  tile; 6 are optional** (`iaEdge`, `iaEdgeReason`, `isMedian`, `med`, `mouths`, `producerReason`).
  ⭐ **The contract is a union with optional members, which is a materially different thing to plan
  against than a fixed list.** Neither 17 nor 20 is the useful answer; the *shape* is.
- ⛔ **"the proto tile carries 5 fields" — there are TWO proto-side tile objects and the sentence named
  neither.** `tilesFromProto` returns `{ring, edges}` and is called by **nothing** in `src/`;
  `protoShapeTiles` — what `--proto` actually freezes — carries five. Both counts were right about
  different objects. **The defect was the ambiguity, not the arithmetic.**
- ⭐ **Both are the eighth and ninth instances of one error in a single day: sample one, report the
  population.** That is the evidence for S7's second sentence above, and it is why that sentence is
  phrased as *answering a different question* rather than as *being wrong*.

⭐⭐⭐ **AND THE RESOLUTION IS THE BEST ILLUSTRATION OF S7 IN THIS WHOLE SURVEY.** Four counts were
produced across two sessions — **17, 20, 5, 2** — and **every one was a correct count of something.**
The question none of them answered, and the only one worth asking, is: **how many REQUIRED fields does
the proto tile fail to supply?**

**Answer: it satisfies 3 of the 14 required fields** (`ring`, `iA`, `producer`); `producerReason` is
optional and `bands` is an addition. **The eleven unsupplied are `vertR` · `tl` · `sw` · `lu` ·
`roundTips` · `bluntTips` · `roundTipKeys` · `runs` · `bandJoin` · `cap` · `fillets`.**

⛔ **And even that is not a to-do list.** `bands` ships the FILL **already painted** — a deliberate
change of model, not an omission — so some of the eleven may want **explicit refusal** rather than
supply. **Which must be produced and which refused is the open design question**, and it is the actual
content of "switch ① on."

⭐ **Only the required/optional split made the right question askable.** That is the whole finding: the
counts were not wrong, the question was — and *nothing in any of the four numbers said so.*

▶ Derive it, both sides, and don't sample one block — the one-liner is in `PIPELINE.md §3a`.

---

### S10 · ⭐⭐⭐ **THE REGIME CENSUS — 10 places where two representations of the same thing coexist**

**Jacob, 2026-09-06:** *"I find it hard to believe we have so many 'regimes' layered in there (but
'disconnected') and none of them are causing trouble."* He is right, and the mechanism of harm is now
named: **they do not crash anything — they make measurement uninterpretable.** Nothing errors, the map
renders, and you cannot tell whether it is correct. `SKELETON §0.1` on the two partitions: **"Both
render. Neither can be seen to be wrong."**

▶ `node scratch/claims-regime-census.mjs [scene]` — reads the artifacts and the source, so it cannot go
stale. **Runs unchanged on a second town** (kit-level, not an LS instance patch). ⛔ **Re-run it; do not
quote its figures here** — that is what let four "9 of 50"s circulate.

**The ten, by subject:** the geometry of a street · the partition into blocks · the producer of the curb
· the tile object · who paints the pavement · where a corner comes from · what closes a dead end · what
bounds the map · where authoring lives · which path draws the map.

⭐⭐ **The single most useful column is "which one SHIPS."** In every row but three, one representation
is live and the other is correct-but-unwired. That is the shape of the debt: **not dead code — live
compensations for a defect one layer upstream.** No linter finds them; they present as features.

⛔ **Two rows the census itself got wrong on the first run, both fixed and both commented in the
script** — and both are S7 again: the boundary row looked for rim edges in `shape.json`'s runs, found
none, and printed **0** against a doc saying **31**. *Both were right:* the rim edge is in the frozen
**topology** and **absent from the frozen shape**. ⭐ **That gap is itself a finding** — the rim is an
edge of the drawing upstream and invisible downstream, which is the *"the rim is never an absence"*
doctrine failing at an artifact boundary. And the tile-object row took **four attempts** (0 → 4 → 6 →
5): a truncating window, then a missing shorthand property, then a comment read as a field. **Each was
a good count of the wrong thing, produced by the instrument built to find exactly that.**

---

### What this survey did NOT do

- ⛔ **No code changed.** The only edits inside `src/` and `cartograph/*.js` were **doc pointers in
  comments** that would otherwise have become dead links to the retired `WALL.md`.
- ⛔ **The 51 stale citations in the other seven docs are not repaired** (S1 — repairing them by hand
  re-creates the rot; the cure is to stop citing lines).
- ⛔ **S3 is not resolved, deliberately.** Which substrate ships is a decision about where the project is
  going, and it is Jacob's.

---

## ⭐ Landed-claim forensic (2026-06-13) — code-landed ≠ done ≠ eye-verified

Triggered by Jacob: *"we can't take the BACKLOG's word for it; we need a forensic pass."* A git/code pass over the ~27 "landed" claims (ancestor-of-HEAD **+** code-path-live). The test for a "done" claim is now **three-tier** — never a bare "done":

- **eye-verified** — confirmed on the **lit app** (the only real "done"; proxy renders don't count — proven 2026-06-13).
- **code-landed** — commit is an ancestor of HEAD **and** the code path is live (*folded* counts: the original commit can be orphaned yet re-implemented into HEAD). **Necessary, not sufficient — code-landed ≠ works.**
- **un-landed** — claimed done but the code is **absent** from HEAD (a corpse-lie).

**Findings (HEAD `a4e5a9b`, `curb-offset-draw`):**
- **~24 items code-landed** (ancestor of HEAD) — e1, d1, e2, e3.1/.2, divided-data-first, intersection-everywhere, loops, dead-ends, cap-wrap, handle-float, alleys, the datum repair…
- **D2 prebake face-freeze** (`55e5b8e`/`dee5c20`): commits **orphaned (non-ancestor)** but the code is **folded-live** (`tilesFromFrozen` + 103 frozen `tiles[]` in `ribbons.json`) → **code-landed; relabel the BACKLOG's "awaiting land" → live.** (The orphaned-but-folded palimpsest pattern, `[[feedback_audit_then_cut_git_palimpsest]]`.)
- **band-fold-fix** (`8e1e414`): **NOT landed.** Stranded (non-ancestor) **and** the clamp is absent — `thinTile` is computed but wired **only to `bandJoin`** (`tileGround.js:2383-84`), never to a depth clamp. **Confirmed corpse-lie**; it is open work (NOW), any "done" framing is false.
- **e3.4 datum-repair**: `c49a4e6` orphaned but **landed via `8452c31`** ("land datum repair … Vernier c49a4e6"). code-landed.
- **AWAITING-EYE (code-landed, visually unconfirmed — by the BACKLOG's own words):** `e3.3-fillet`, `intersection-everywhere` — both say *"Pending Jacob's eye."*

**Doctrine:** the forensic is **layer 1** (git/code); the operator's eye is **layer 2** (the real gate). BACKLOG carries `code-landed` / `awaiting-eye` / `un-landed`, never a bare "done."

---

## Code corpse-lies (→ excise via briefs)

| # | Corpse-lie (code) | The truth it contradicts | Locus | Status |
|---|---|---|---|---|
| C1 | Header: *"TRANSITIONAL: wired for TOY only; LS stays on figure-ground… NOT a kept scene-flag"* | LS runs tiles unflagged (`isTileScene=true`) | `tileGround.js:6-10` | ✅ excised 2026-06-05 (`e3ec84a`, Lye) — header now states LS runs tiles unflagged |
| C2 | Import comment *"T1 — toy tiles (transitional)"* | same as C1 | `bake-ground.js:30` | ✅ excised 2026-06-05 (`e3ec84a`, Lye) |
| C3 | Figure-ground (`buildBlockGeometryV2`/`fbMemo`) **still computed every Designer frame** to feed overlays | tiles are the live path; this is dead + a per-frame perf drag | `BlockGeometryV2Debug.jsx` | 🔎 (T4 / authoring-migration first) |
| C4 | `buildBlockGeometryV2.js` + `cornersAtIx` — the whole dead module | the dead figure-ground path | `src/lib/buildBlockGeometryV2.js` | 🔎 (delete at T4) |
| C5 | Two-source seam: faces polygonized from **raw OSM** (`nodeEdges`/`polygonize`/3 m-snap), used only for LU | one source for faces = the skeleton (`PREBAKE.md §5`) | `derive.js:1056-1178` | 🔎 (Layer-2 / prebake polygon-ization) |
| C6 | `ribbons.intersections` is emitted **EMPTY** — `length 0` in the shipped artifact, so it is not merely unread, it carries nothing. `tileGround.js` records that corners now come from the tile graph, not `ribbons.intersections`. ⚠️ A consumer written from the documented `[{point, streets}]` schema silently gets zero. | legacy, resolved by attrition | `derive.js` serializer · `ribbons.json` | ✅ re-verified 2026-08-04 — retire the key or document it as empty |
| C7 | `useRingBandEmitter` flag (default-true; "legacy else removed") — likely vestigial plumbing | LS=tiles, no scene branch | `BlockGeometryV2Debug` · `bake-ground` | ⚠️ re-verify |
| C8 | Vestigial `medians[]` ring (`A.points + B.points.reversed`) — the median is an emergent face | `[[project_truman_divided_road_knot]]` | `derive.js` · `ribbons.json` | ⚠️ re-verify (may be addressed) |
| C9 | The old `simplify()` (junction-blind local filter) is **dead** — replaced by `simplifyRDP`, only referenced in a comment. The forensics *blame this function*; it still sits in the file (landmine). | replaced by `simplifyRDP` (`SKELETON §3.8`) | `skeleton.js:593-632` | ✅ excised 2026-06-05 (`e3ec84a`, Lye) — function deleted (no caller existed); Step-4 header + `:973` comment rewritten to name `simplifyRDP`/protected-keys |
| C10 | `skeleton.js` writes `skeleton.json` via plain `writeFileSync`, **not** `writeIfChanged` | the dirty-skip discipline (`ARCHITECTURE §7`) | `skeleton.js:1193` | ✅ excised 2026-06-05 (`e3ec84a`, Lye) — `writeIfChanged(…, {touch:false})`: plain `writeIfChanged` would NOT have fixed it (io.js job-2 bumps mtime even on identical content — right for chain OUTPUTS, but `skeleton.json` is a chain INPUT, so the bump itself forces the rebuild); added the `touch` opt-out to `io.js`, default unchanged for every other caller. Verified: output byte-identical (sha256 `f102a906…`), mtime frozen across re-run, serve's `needsRebuild` predicate skips |
| C11 | stale comment header `R-CLAMP:` describes a per-tile corner-R clamp the code explicitly does **not** do (`:898` "NO clamp — the operator's R is the dial") | the no-corner-R-clamp doctrine | `tileGround.js:893-895` | ✅ excised 2026-06-05 (`e3ec84a`, Lye) — also caught + trimmed a SECOND orphaned R-clamp comment at `:246-249` (above `circlePoly`; described a clamp helper that no longer exists) |
| C12 | `capStart`/`capEnd` are **point-order-keyed and unguarded** — same hazard class as the D1 measure scramble: a future longitudinal weld that flips a *capped* chain's point order silently swaps start↔end caps | the reversal-proof side/end-keying discipline (`[[feedback_perp_side_convention]]`) | `skeleton.js` caps · `derive.js` · `tileGround.js` deadEndTips | 🔎 flagged by Gunter (D1); fix by the same reversal-proof keying when caps next move |
| C13 | **Non-street ribbons (alleys + footway/cycleway/steps/path) baked ONLY in the dead V2 path** (`buildV2BakeShape` → `buildPathRibbons`); the live tile bake (`buildTileBakeShape`) never carried the call, so **the slab shipped with NO alley/footway/path groups** even with `layerVis.alley/footway === true` — they rendered in the Designer (live `buildPathRibbons`) but vanished in the bake/Stage/Preview/runtime. they vanished in the bake/Stage/Preview/runtime. A tile-migration orphan, same class as C2/C3 — and it had a TWIN on the render side (C14). | the bake mirrors the Designer's live geometry; `layerVis` gates *what* bakes, not *whether the path exists* (`BAKE.md §2/§3`) | `bake-ground.js` `buildTileBakeShape` (was: only `buildV2BakeShape:458`) | ✅ fixed 2026-06-12 (Boz) — added the `buildPathRibbons` call to `buildTileBakeShape` (clip to parcel interiors = block − curb − treelawn − sidewalk; park excluded; `layerVis` gating downstream at PAINT_ORDER). Re-bake: slab now carries `mat:alley` (910 v) + `mat:footway` (1581 v); path/cycleway/steps follow when toggled on. |
| C14 | **Non-street ribbon MESHES rendered ONLY in the dead V2 render branch.** In `BlockGeometryV2Debug`, `{PATH_KINDS.map(...)}` (the alley/footway path meshes) sat in the non-tile `return`; on a tile scene (`isTileScene=true`, i.e. LS) the component returns earlier inside the `if (isTileScene)` block (the default tile render + the frozen Section + the Survey render) and NEVER reached it. So `buildPathRibbons` computed the geometry every frame but there was **no `<mesh>` to draw it** — the layers were toggled-on-but-invisible in the Designer. The render twin of C13. *(Boz's C13 note "they rendered in the Designer" was a wrong assumption — they didn't; this was the bug Jacob actually saw.)* | the tile render is the live path for LS; everything that draws must be in the `isTileScene` branch | `BlockGeometryV2Debug.jsx` (path meshes only in the post-`isTileScene` V2 return) | ✅ fixed 2026-06-12 (Boz, `543bdeb`) — added the path meshes to the tile renders (default + frozen Section). Paired with `996cef1` (the `parcelInteriors` clip now uses tile geometry — `tileGeos`/`sectionGeos` — not the dead V2 bands), so the live Designer path render matches the bake. |
| C15 | **`derive.js` claimed to read St. Louis City AND County parcels; it read the City file only.** The comment under the parcel load said *"Parcels are St. Louis City/County only"* — the author believed both were covered — while the line above opened `stl_parcels.json` and nothing ever opened `stlco_parcels.json`. hipointe-demun spans the City/County line (DeMun is County), so **14,597 County parcels sat on disk unread**. Twinned with a second corpse-lie in the same function: `classifyLandUse(code)` knew only the City's 4-digit ranges and ended `return 'residential'`, so **14,587 of those County codes would have mapped to a confident wrong answer** had the file simply been unioned in. | *"The inputs are real, not guessed… grounded in the actual record, block by block"* (`ORIENTATION.md`, `FEATURES.md`) · ⛔ NO FALLBACKS (`CLAUDE.md` Layer 0) | `derive.js:1020` (the read) · `derive.js:691` (the city-only mapper) | ✅ excised 2026-08-01 (Cadastre) — both files loaded jurisdiction-tagged; mapping moved to `cartograph/parcel-landuse.mjs` (City 4-digit ranges + County resolved through the assessor's own 189-row `county-land-use-codes.csv` bucket table), **no catch-all** — an unreadable code returns `null` and becomes the honest `underived` class, counted in a pour-time report. `bake-content.js:297 classifyUse()` carries a pointer comment: same codes, different vocabulary, deliberately separate. |
| C16 | **`derive.js`'s third classification rung was the bare constant `use = 'residential'`.** A block face with no OSM land-use polygon and no overlapping parcel — nothing that classified it — was painted residential in the same voice as a face backed by 40 single-family parcels. Measured 2026-08-01 before the fix: **121 of hipointe-demun's 302 faces (17.6% of area, largest 97,393 m²)** and **19 of lafayette-square's 173 (2.6%)**. ⚠️ This is *also* the correction to `BRIEF-land-use-derivation.md`'s headline, which blamed `pickLuFromHash` — that function is effectively dead (1/101 LS tiles, 2/196 HPDM), because `ribbons.faces` and `ribbons.tiles` are walked from the same centreline graph so `luForRing`'s probe essentially always hits. | ⛔ NO FALLBACKS — a fallback turns a failure into a plausible-looking success (`CLAUDE.md` Layer 0 q2) | `derive.js` `faceFills` loop (was `:2989`) · `blockMeta` dominant-use (was `:1878`) | ✅ excised 2026-08-01 (Cadastre) — both default to `underived`, wired through all five vocabulary consumers (`lu-policy.mjs` soft · `bake-ground.js` PAINT_ORDER + TREELAWN_LU_VARIANTS · `ribbonsGeometry.js` · `m3Colors.js` · `CartographSurfaces.jsx`) so it cannot silently drop from the slab. Detectors: `scratch/lu-provenance-census.mjs`, `scratch/invented-lu-census.mjs`. ⚠️ Colour is a **placeholder pending Jacob's palette call**. |
| C17 | **`unknown` is ratified HARD in `lu-policy.mjs`, but it is a face *TYPE*, not a land-use verdict** — derive.js assigns it when it cannot classify a face as block/park/island/parking at all. So a face the pipeline failed to *type* is painted as hardscape: grey, no grass, no trees, and it reads as a deliberate design choice. **This is the actual grey Jacob saw**, not the invented land use: hipointe-demun bakes 17 `unknown` faces at 69,129 verts — its largest non-park class. | a data/typing gap must not be routed into a hardscape class — the exact reasoning `lu-policy.mjs` states for its own soft default | `lu-policy.mjs:75` (`unknown: 'hard'`) · `derive.js` `classify()` face typing | 🔎 **identified 2026-08-01 (Cadastre), NOT fixed — its own gate.** Deliberately not folded into C15/C16: flipping it soft is a one-line change with a neighborhood-wide visual result, and `unknown` was eye-gated hard at LS (4 tiles) where it happened to be right. Needs the eye + a decision on whether the real fix is upstream in face typing. |

## Doc corpse-lies (→ fix in the doc campaign)

| # | Corpse-lie (doc) | Locus | Status |
|---|---|---|---|
| D1 | Body describes dead figure-ground as the primary construction | `RIBBONS.md` §1 / §3.1-3.8 / §6 / §7 | 🔎 |
| D2 | prong-4 "skeleton-consolidation / `osm2streets`" red herring for the false corner | `BACKLOG.md` ✅ (reshaped 2026-06-05) · `PIPELINE.md §5 (the Wall)` 🔎 | 🔎 partial |
| D3 | figure-ground-as-live passages (`cornersAtIx` / "V2 curb" / treelawn-LU) | `FEATURES.md` | ✅ **RESOLVED 2026-06-14** — the figure-ground passages were **removed** from FEATURES in the purification (FEATURES is now the pure pitch; the engineer/figure-ground content → `ARCHITECTURE.md §8` or git history). The treelawn-matches-abutting-LU *behaviour* survives where still true; the figure-ground *plumbing* prose is gone. (The doc-side T4 code deletion of `buildBlockGeometryV2`/`cornersAtIx` is still pending — separate from this doc cleanup.) |
| D4 | ✅ **FIXED 2026-09-06** — was: `SURVEY.md`/`SKELETON.md` cited the killed `HANDOFF-divided-false-corner.md`, a dead pointer since June; repointed to `_archive/handoffs/HANDOFF-divided-false-corner-KILLED-2026-06-05.md` | `SURVEY.md` §Cross-references | ✅ fixed 2026-06-05 |
| D5 | `SKELETON.md` §2/§3 drift (junctions "degree ≥3" / divided-id "-0/-1" / `spineAt*` missing from schema / unnamed "no seed" / `continuesAs` missing / write "via writeIfChanged") | `SKELETON.md` §2, §3 | ✅ conformed 2026-06-05 (the skeleton audit) |
| D6 | `SURVEY.md` §3 **block/asphalt INVERTED** ("Block = tile − iA" — that's asphalt; block = iA), contradicting §1; + §3 overstated the capacity guard (it's full-collapse only) + line-ref drift | `SURVEY.md` §3 | ✅ conformed 2026-06-05 (the survey audit) |
| D7 | `SURVEY.md` §4 migration note stale — said asphalt-edge "still in Measure"; it **moved to Survey** (`SurveyorOverlay`; `MeasureOverlay:147` confirms) | `SURVEY.md` §4 | ✅ conformed 2026-06-05 |
| D8 | `HANDOFF-tile-feature-ledger.md` **A2 "no work"** likely stale — corner-R is now wired to the tile render (`buildTileGround`, `:610`) | `tile-feature-ledger` A2 | 🔎 verify on Jacob's eye (code-read ≠ operator eye), then update the ledger |
| D9 | **Divided-carriageway CHAIN POSITION contradiction** — the old `FEATURES` divided section said the chain stays at the carriageway **center**; `PREBAKE-PLAN §2` + D1 assumed the **inner edge**. | `RIBBONS.md §3.1` (live home) | ✅ **RESOLVED 2026-06-05 (Alidade, measured vs the operator's traces): chains sit at the INNER edge** (`chainGap` = median width; a center reading → negative medians; spike matches traces <1m). The corpse-lie was **corrected**; D1's inner-edge emit was right. *(2026-06-14: that FEATURES divided section has since been removed — the live model is `RIBBONS.md §3.1`.)* (The "emits from the left of the lane" symptom is a *different* defect — the north-void, C13.) |
| C13 | **North-void** — a street edging the **unbounded outer face** (e.g. I-44, grade-sep-excluded from `extractFaces`) emits **nothing outboard** → "asphalt emits from the left of the lane, not center." Pre-dates D1; NOT the chain-position issue. | the outer-face/boundary handling | `tileGround.extractFaces` outer face | 🔎 flagged by Alidade — its own brief (F); meshes with G9 perimeter / boundary-trio |

## Bake / Stage divergences (seeded 2026-06-10, the BAKE.md/STAGE.md keystone session)

> Found while writing the two missing keystones (`BAKE.md`, `STAGE.md`) against the live bake chain (`serve.js:461`, `bake-scene.js`, `bake-ground.js`). The bake **mechanism** is mature and honest; the divergences are mostly **aspiration** (roadmap artifacts that never shipped) + two now-cured **landmines** (the stages had no Reference home).

| # | Divergence | Type | The truth | Locus | Status |
|---|---|---|---|---|---|
| B1 | `ARCHITECTURE.md §1` publish-loop diagram shows **`stage-config.json (future)`** as a planned slab artifact; §3 layer-3 implies a runtime shader-param layer to come | **Aspiration** (presented as roadmap; never shipped) | every Stage channel folded into `scene.json` field-by-field; there is **no** `stage-config.json` and none is pending | `ARCHITECTURE.md §1` diagram · `§3` layer 3 | ✅ excised 2026-06-30 (Boz, doc-canon sweep) — diagram box → `scene.json`, §3 layer-3 rewritten, §1 note added; dead intent also in `BAKE.md §5` |
| B2 | `STAGE_MIGRATION.md` describes Meteorologist cloud-authoring living **inside a Stage right-panel card** | **Aspiration / historical** | Meteorologist shipped **standalone** (`/meteorologist.html`); the Stage's only cloud surface is the forward-compat `scene.json.clouds` ref | `STAGE_MIGRATION.md` · `ARCHITECTURE.md §1` note | ⚠️ partial — `ARCHITECTURE.md §1` note fixed 2026-06-30 (Boz); `STAGE_MIGRATION.md` itself is in the meteorologist doc sweep (Diary-grade plan, banner/retire) |
| B3 | SC.4 time defaults persist nothing; SC.5 bakes only Browse heading (Hero keyframes/altitude stay live) | **Aspiration — correctly marked** (not a lie) | `bake-scene.js` header + `:115`/`:139` honestly note "pending"; tracked as "Slab completeness" in `BACKLOG.md` | `bake-scene.js` · `BACKLOG.md` | ⚠️ honest gap, not divergence; track to close, don't excise |
| B4 | `bake-ground.js:28` imports dead `buildBlockGeometryV2` alongside live `buildTileGround` | **Corpse-lie** (= C3/C4) | tiles are the live path; figure-ground is dead weight | `bake-ground.js:28` | 🔎 excise at T4 (cross-ref C3/C4) |
| B5 | The bake **chain + `shape.json` emission** had no keystone Reference doc — its home was "README · ARCHITECTURE · FEATURES" (the retired BOZ §0 Suite — `cartograph/_archive/BOZ-full-2026-08-06.md`) | **Landmine** (truth lived only in code/orchestration) | now documented | → **`BAKE.md`** | ✅ documented 2026-06-10 |
| B6 | The Stage tool + the SC.1–SC.7 channel inventory had no keystone Reference doc | **Landmine** | now documented | → **`STAGE.md`** | ✅ documented 2026-06-10 |

### Extent tool + the Pour (seeded 2026-07-04; boundary authoring is the **INCLUSION POLYGON** — `EXTENT-DESIGN.md` is the design of record, `INTAKE §0.5` the as-built. ⛔ The "excluder pen" model this heading used to name was retracted 2026-07-20.)

| # | Divergence | Type | The truth | Locus | Status |
|---|---|---|---|---|---|
| B7 | bake-route skips `pipeline` with the message *"scene-specific pipeline not yet implemented"* | **Corpse-lie (conservative — now known FALSE)** | the **Pour** runs `pipeline.js` + `promote-ribbons.js` + the whole bake **scene-generically** for a non-default scene (verified 2026-07-04 — hipointe-demun poured scene-generically: clipped buildings + full slab). The comment is over-cautious; the scene-generic path works. | `cartograph/serve.js`, the `skipped.push('pipeline …')` call in the bake handler | 🔎 update the message — the pour is scene-generic |
| B8 | **Poured-scene 3D browse camera framing is off-center** ("too high & slightly left"); the `CameraRig` poured-scene perspective override does not produce a centered frame | **Open bug (landmine — not a done feature)** | LANDED context: baked ground is a centered ±1461 disc + the ribbons content bounds are symmetric after the street polyline-clip; browse still frames off-center — **root cause NOT found** (Jacob: *"don't correct the wrong symptom"* — do not just tweak the altitude factor). | `src/cartograph/CartographApp.jsx` `CameraRig` (poured-scene branch) | ⚠️ **STATUS UNCERTAIN (re-verify 2026-07-16)** — Altadena's browse has since been eye-gated ("stunning"), so this may be resolved for real poured hoods; the root cause was never formally found, so **don't flip to DONE without driving a fresh pour's browse frame.** (Handoff archived → `cartograph/_archive/handoffs/HANDOFF-neighborhood-perimeter-builder-2026-07-16.md`.) |

---

*Seeded 2026-06-05 from the front-half spec session (Skeleton/Prebake/Survey), all code rows code-verified except ⚠️. Bake/Stage rows added 2026-06-10 (the keystone session). Add a row whenever a landed truth exposes a contradiction; clear a row only when both places agree.*
