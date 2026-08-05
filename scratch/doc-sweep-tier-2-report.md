# Doc sweep — TIER 2 report

**Agent: Wren.** Fresh. Routed `CLAUDE.md` → `ORIENTATION.md` → `README §⭐ START HERE` → `BOZ.md §2/§3`,
then `_handoffs/HANDOFF-doc-sweep-corrections.md` (Tier 1's closed list) and all six sweep reports.
No pours, no bakes, no dev server. Docs only. `PIPELINE-CLAIMS.md` untouched.

**Commits:** `0459beeb` (cluster 4) · `f72b5824` (cluster 6) · `ec5154ed` (cluster 3) · `9cd65990`
(cluster 5) · `5996c875` (cluster 2) · `c28e8597` (cluster 1) · `ae8ff532` (the accord sweep).
Each message states what I checked and how.

---

## 1. ⭐⭐ WRONG BELIEFS, AND WHERE THEY LIVE IN CODE

*Ranked. These are the deliverable. Each is a place the docs and the code appear to share a model that
does not match the machine — or where two docs disagree and the code quietly picked a side.*

### W1 — ⭐⭐ "Prebake is authoring-blind" is FALSE, and it is the structural argument the spine rests on

- **The belief:** `ORIENTATION` step 3, stamped **"verified in code: zero reads"** — *"prebake never
  reads the operator's edits … that is why 'freeze the curb in prebake' was an impossible instruction."*
- **The code:** `derive.js` **loads `clean/overlay.json`** (`overlayById` / `overlayLoops`) and prefers
  `ov.measure` over the computed default. It is populated, not theoretical: **LS 52 authored streets ·
  LS-staging 177 · toy 9 · hipointe-demun 5.** What prebake genuinely does not read is
  `design.json` / `blockCustoms` (3 hits in `derive.js`, **all inside comments**; 0 in `pipeline.js` /
  `promote-ribbons.js`).
- **Was it ever true?** No — not as a general statement. It is true of **one of two** authoring channels.
- **Why it matters, concretely:** the belief made "freeze anything in prebake" read as categorically
  impossible. It is only impossible for things that depend on **per-fe SHAPE intent**. Chain measures,
  caps and anchors are already there. **A03/A06's rescoping rests on this distinction**, and the
  "verified in code" stamp actively suppressed re-checking. Corrected in `ORIENTATION`; the handoff had
  already flagged it as an "overgeneralisation" without the doc being changed.
- **What a fix would establish:** for each thing we want frozen at prebake, *which channel does it
  depend on?* That question is answerable today and was being skipped.

### W2 — ⭐⭐ The membership formula in ELEVEN docs was not the formula the code runs. ✅ **RULED 2026-08-04.**

> **RULING (Jacob asked for it; `8205a48a`): the formula is ORDERED and THE FINEST GESTURE WINS.**
> `hide` ⇒ OUT · `activate` ⇒ IN · exclusion loop ⇒ OUT · polygon (or disc). As algebra,
> **`((polygon − exclusions) ∪ activate) − hide`.** So a per-building `activate` **beats** an exclusion
> loop — **the code was right and eleven documents were wrong.** No behaviour changed. Rationale lives at
> the SSoT (`NEIGHBORHOOD-INPUTS §5.2`); all eleven sites corrected; the three code sites carry a
> comment naming the precedence and the ⛔ against "fixing" it back. Layer 0 decided it: under the flat
> formula, an operator who lassos a strip out and clicks the corner bakery back in gets **nothing**, and
> **a per-building override silently demoted to a no-op is q3's named failure** — plus q2's, because the
> map redraws plausibly and nothing says the gesture was discarded. Every other layered override in the
> kit already resolves by specificity; membership stops being the exception.
>
> ⚠️ **Found while ruling, surfaced not fixed → `ROADMAP A08`:** the three sites **disagree on degenerate
> footprints** (<3 vertices — pipeline pre-clip *keeps*, pipeline post-derive *centroid-tests*,
> `bake-buildings` *drops*), while `bake-buildings`'s own comment claims it "must match `pipeline.js`
> exactly." The 2D Designer can therefore show a building the slab does not.

<details><summary>The original finding, as reported before the ruling</summary>


- **The belief:** `Membership = (polygon ∪ activate) − (exclusions ∪ hide)` — stated in `README`,
  `ORIENTATION`, `PIPELINE`, `ARCHITECTURE`, `OPERATIONS`, `PREBAKE`, `INTAKE`, `BAKE`,
  `NEIGHBORHOOD-INPUTS`, `EXTENT-EXCAVATION`, `NOTES`.
- **The code, in all three implementations** (`pipeline.js` pre-clip, `pipeline.js` post-derive,
  `bake-buildings.js` — I read each): `hide` → **`if (activate.has(id)) return true`** → exclusion loops
  → polygon-or-disc. **`activate` short-circuits *above* the exclusion test.**
- **The divergence:** a building both **activated** and **inside an exclusion loop** is **IN** in code
  and **OUT** under the formula. The honest algebra is `((polygon − exclusions) ∪ activate) − hide`.
- **Was it ever true?** The formula has never described the precedence. `EXTENT-EXCAVATION §D8` recorded
  exactly this — *"the code does not implement the canon's governing formula … it is the one sentence
  the whole subsystem is described by, in nine documents"* — and **it has sat unruled ever since.**
  That is the cross-doc seam the brief points at: one doc knows, eleven don't, and the code picked.
- **⛔ I did not rule it.** The code's behaviour is defensible (a per-building activate is a deliberate
  later gesture; an exclusion loop is a coarse sweep). But it is a doctrine call. I added a **precedence
  footnote at the SSoT** (`NEIGHBORHOOD-INPUTS §5.2`) and a pointer from `ORIENTATION`, both saying
  neither side should be changed unilaterally.
- **What a fix must establish:** which gesture wins. Then *one* of the two moves — reword the formula
  everywhere, or move the `activate` test below the exclusion loop in all three sites.

</details>

### W3 — ⭐ "The SHAPE pass is nearly chain-free" — there are TWO reach-backs, and one is geometric

- **The belief:** `SURVEY §3`, as the pull-quote under the construction list: *"**The only** chain
  reach-back in the SHAPE pass is `runMeasure`/`runSegOrd` … That is **authoring identity, not
  geometry**."*
- **The code:** `freezeCurbEdgeFacts({ ring, runs, streetsOrig, measures, segOrdOf, curbWidth,
  isMedianTile })` (`tileGround.js:185`) is a **second, geometric** reach-back inside the shape loop. It
  reads `streetsOrig[].outerHWProfile`, `phase.role`, `throughId`/`roadId` and per-run base half-widths
  to stamp one fact per ring edge — **and those facts are exactly what the curb producer offsets from**
  (`buildCurbRings`, called at `:3280`).
- **Was it ever true?** Not since A03 split the producer. The chain-freeness that *is* structural is
  `buildCurbRings`'s signature, one step later — which `POLYGON-FIRST §3` states correctly.
- **Why it matters:** this sentence is cited as evidence for **where the Wall effectively sits**. It is
  weaker than it reads, and it is the kind of claim that makes "is this chains again?" answer *no* when
  the honest answer is *at the facts stage, yes*.

### W4 — ⭐ The "d" bulge's named mechanism is the branch that tile never enters

- **The belief:** `SURVEY §6` — the residual bulge *"is the curb PRODUCED by stroking the chains
  (`buildTileGround`: `iA = tile.ring − asphalt-union`, and that union swells at the transition)."*
- **The code:** that is the **legacy carve**. Since D6a the default is the per-edge parallel offset;
  the carve runs only where `opts.iaOffset !== false && !isMedianTile && ringArea > 1500` fails.
- **The consequence:** on an ordinary **large, non-median** tile the bulge is produced by the **offset**,
  not by a swelling union — so a fix reasoned from the union is reasoning about code that tile does not
  execute. This is a **defect that has resisted repeated attempts**, which is precisely the profile
  §0 says to look for. `RIBBONS §2` had the D6a statement correct; the two docs disagreed.
- **What a fix must establish, first:** *which producer built the bulging tile.* Today that is
  unrecorded — which is `ROADMAP A07`. **A07 is a prerequisite for diagnosing the bulge, not a sibling
  of it.**

### W5 — LOOP-STREETS carries two thresholds for `isMedianTile`; the code has neither

- **The belief:** `§4` — *"`isMedianTile`, **>40%** median-facing boundary → ped zeroed"*; `§6 L.5` —
  *"independent of the **>50%** area ratio."* Two numbers, one doc, two sections apart.
- **The code:** `tileGround.js:3241-3242` — `isLoopInterior = runs.length === 1`;
  `isMedianTile = isDividedMedian || (isLoopInterior && medArea > 0.5)`. **No boundary-fraction test at
  all**; `0.5` is an absolute **m²** floor.
- **Was it ever true?** I can find no version in which either percentage was the test. This is the
  cross-doc-contradiction tell: two authoritative-sounding numbers, nobody ruled, the code has a third
  thing entirely. Anyone tuning why a loop interior did or didn't zero its ped band was hunting a
  threshold that does not exist.

### W6 — The same doc contradicts itself on the loop inset, and the difference IS the mechanism

- `LOOP-STREETS §4`: the loop interior insets *"pavement+curb+sidewalk ≈ **5.6 m**"*.
  `LOOP-STREETS §6 L.5`: *"insets to the CURB's inner edge (`hw + curb`, not past a sidewalk)."*
- **The code:** `derive.js:3678` — `const inset = hw + STANDARDS.curb.width` (≈ hw + 0.15 m), with the
  comment citing §2 as the reason **not** to inset past a sidewalk.
- **Why it is a belief and not a typo:** the whole §2 body cross-section turns on this. `hw + curb`
  makes the grass ring cover the interior face so `isMedianTile` fires and the inner ped band zeros;
  **5.6 m would not**. The doc simultaneously states the mechanism and a number that would break it.

### W7 — `sides` is called vestigial in the as-built record and is the mechanism in the design record

- `ARCHITECTURE §Extent`: *"the `sides` draft field is **vestigial**."* `INTAKE §0.5`: the street-
  selection machinery *"is NOT dead, it **is** the mechanism."* `EXTENT-EXCAVATION §B5` lists it under
  "what I would DELETE." Altadena persists a third name, `borderStreets: []`.
- **The code decides:** 22 references in `ExtentApp.jsx` — declared, written into the auto-saved draft,
  hydrated from `nb.sides`, resolved to geometry, driving `<ExtentClickableStreets selected={sides}>`
  and the boundary-street picker UI.
- **Why it is dangerous rather than untidy:** "vestigial" in the engineering record is a **deletion
  invitation**, and deleting it removes the street-selection path the *same section* calls "the primary
  authoring surface." Corrected in both docs; the residual is the naming collision, not the field.

### W8 — A frame capability shipped that no doc in its own cluster describes

- **`CURVE_FIT` is ON by default** (`skeleton.js:855`, `process.env.CURVE_FIT !== '0'`), it is the only
  writer of `street.segments`, and **it mutates `s.points`** — so on 52 of 217 LS streets, `points` are
  **bezier control points, not a polyline**. `SKELETON.md` did not mention it at all; three other docs
  said the flag was OFF, i.e. they disagreed with the committed artifact.
- **Downstream belief it invalidated:** `SKELETON §3.5`'s *"the skeleton is never densified or smoothed
  in place"* and its regression datum *"West 18th↔Dolman ≈ 15.6°/vertex."* The curvature now lives in
  the bezier, so a per-vertex turn measurement on today's frame is **not the same quantity** — 27.2° on
  West 18th reads as a regression when it is the primitive working. Documented; datum struck.
- **Adjacent, and it cost weeks according to the handoff:** the detector's gate is *named* "curve-fit"
  and *tests* `STREET_SMOOTH`. Two different things, one name. Written down in `SKELETON §3.5` now.

---

## 2. ⛔ THE SWEEP WAS WRONG — and so, once, was TIER 1

Per BRIEF §2. I verified before acting; these did not survive.

| Claim | Verdict |
|---|---|
| **`POLYGON-FIRST §3`'s "9 small" row is wrong, actual 30** (sweep 2) | ⛔ **THE SWEEP MISREAD THE TABLE.** The row is *small **AND NOT ALREADY MEDIAN***. 30 is the count of tiles with `ringArea ≤ 1500` **including** the medians. The table has been internally correct since 2026-07-31. I left the `9` and annotated it. |
| **A07's floor is 30 tiles** (Tier 1's correction of the sweep's "41–42") | ⛔ **UNDER-CORRECTION — the floor is 41.** 30 is the **area term alone**, discarding 11 large divided-median tiles. Re-derived off `shape.json`: 30 `ringArea ≤ 1500` · 30 `isMedian` · 19 both ⇒ **41 fail the gate, 60 eligible**. And **41 is itself a floor**: the artifact's `isMedian` is written from `isDividedMedian` alone (`tileGround.js:3627`) while the gate tests the composite `isMedianTile`. ⭐ `POLYGON-FIRST §3` has said **42** (30 + 3 loop-body + 9 small-not-median) the whole time — the two independent instruments agree to one tile, and Tier 1's 30 was the outlier. Both prior numbers are now recorded in A07 so the wobble is visible. |
| **"Both checks POLYGON-FIRST §5 calls 'neither built' are unbuilt"** (sweep 2, restated in the brief) | ⚠️ **Half.** The *Sieve* blockquote says "neither built"; the **Loom blockquote immediately below it says "built both."** The doc was not wrong so much as it *ended on the older quote*. The real defect is that §5 had **no current-state line** — fixed by adding one (recall 30/31, re-run). |
| **PREBAKE §4.0 "up to 13 m"** (sweep 2) | ✅ Sweep right — re-ran `coupler-slit-universal.mjs`: **max 6.24 m** over 37 displaced tips (next 6.00, 5.49). ~2×. |
| **ROADMAP "88 trees 404"** (sweep 6) | ✅ Sweep right — **184** on `origin/main` (platanus 88 + betula 48 + acer 48), 0 `skeleton-4` files. |

---

## 3. What I could not verify — LEFT AND LISTED

Per BRIEF §2: an unverified edit to canon is worse than a stale line. These stayed in the docs.

1. **Every eye-verdict claim.** A02's banner eye-gate, `WALL §5(b)`, the tree impostor rows,
   `LOOP-STREETS §5–§6`'s render confirmations, all `AWAITING JACOB`. By construction the operator's eye
   is the test. Correct doctrine, no action — but note that ~a third of BACKLOG's status field reduces
   to it, and several rows have sat "eye-pending" for five weeks.
2. **`ROADMAP A01`'s downstream half** — *"the committed `ribbons.json` does not reproduce from a fresh
   `pipeline.js` run (233 vs 228 junction nodes)."* Confirming it requires the re-derivation the brief
   forbids. I confirmed the committed side only (`junctionMap.nodes` = 233). This is the highest-stakes
   open claim in the corpus and it is *deliberately* untestable inside these bounds.
3. **Altadena's figures** (26.3M tris / 457 MB / 88 min; 180 s → 18 s) and the HPDM re-fetch
   *"13,427→8,460 with zero renumbers — verified."* The mechanism that would make the latter true is now
   in the code (registry + high-water), so it is plausible; I did not confirm the measurement.
4. **`INTAKE-CATALOGUE`'s external URLs and licences**, which the doc marks `[unverified]` honestly.
5. **`RIBBONS §6.2`'s park-attribution numbers** (512/895 overlay split, 92,869 m² phantom) — needs
   replaying `classify.js`'s overlay loop against `raw/osm.json`. The *mechanism* is confirmed
   (`classify.js` buckets `landuse=grass` → `park`, first match wins) and that is what the correction
   rests on.
6. **Anything counted off `raw/osm.json`.** It is a live, re-fetchable input. This is a structural point
   worth keeping: `OSM-FORENSICS`'s closing promise that "every numeric claim here is reproducible" is
   **false as written** — `surface 261/333`, `oneway 250/333` and the `vh = 333` denominator do not fall
   out of any subset I could construct. Banner added rather than numbers invented.

---

## 4. What was done — the rot, by cluster

Evictions and corrections, all verified first. Full detail in the commit messages.

- **Cluster 1 (Frame).** `CURVE_FIT` documented (§8 above) · schema table completed (`segments`,
  `throughId`, `through`) · junction counts 103/141/84 → measured 100/136/83/Y10 (the old numbers were
  **raw-OSM** counts presented as skeleton output) · `STREET_SMOOTH` marked pinned-0/dormant · the
  custom `survey.json` width tier struck as an open "kit move" — it is **built**, 139/217 streets carry
  `seed.widthSource === 'survey'` · overlay.json 108K → 5.3K, shape.json 64K → 1.03 MB · LOOP-STREETS'
  two phantom thresholds and the 5.6 m inset (§5, §6 above) · dated accord banners on the three
  forensics (the 18th mis-pair is fixed; intersection-everywhere landed and `SKELETON` was the right
  side of that contradiction; `phase.medianWidth` → `chainGap`, 0 vs 38 chains; every row of EVAL's
  bake-layer table superseded).
- **Cluster 2 (Polygon & Wall).** `POLYGON-FIRST §5` given a live scoreboard (30/31, one miss — Vail
  Place) · PREBAKE's "LS has no `neighborhood_boundary.json`, is untouched" — it **has** one, the clip
  **does** fire on LS at `keepR = 1030 m`; what LS lacks is a `polygon` key · 13 m → 6.24 m ·
  `PREBAKE-POLYGONIZATION-PLAN` bannered: **D1's datum is gone** (`lafayette-avenue-5`/`-6` are
  4.6738/4.6738 per side, not 0 / 6.70 / 10.56), so the §5 spike table and §6.1's push-back are not
  actionable · `intersections[]` re-sourcing is done by attrition (the array is `length 0` in all six
  scenes).
- **Cluster 3 (The tools).** §3, §4, §6 above, plus: `isTileScene` gone · `sectionPass` is 4-arg with
  `blockCustoms` (SURVEY contradicted SECTION; SECTION was right) · the per-frame figure-ground perf
  drag was **paid at T4** (285 s → ~0.5 s, memoized and gated) · SECTION's corner construction is
  **LANDED**, contradicting itself in §7/§8 · the dead-end mouth rule is **9 of 50**, not all 50 (sizing
  off "all 50" overstates ~5×) · the `n=951` treelawn distribution struck as unreproducible (treelawn-Y
  is a 30 % minority, not the stated 53 % majority — the DEFAULT-FILL front is sized off it) · RIBBONS'
  spur-outline "both halves built (flag-off)" → **reverted, no flag exists** · `ribbons.json` schema
  gained `tiles` and marked `intersections` as shipped-empty · T3 does **not** end with "the file dies"
  · park fallback 65-vertex → 41 · shape.json 64K → 1.03 MB.
- **Cluster 4 (Spine).** §1 above, plus: the wall's silent fallback is **built** (A02) · "the ground
  bake is irrelevant to the 2D screen" is true of **Survey only** — Section, Measure and Design consume
  baked `shape.json`, and PIPELINE contradicted its own §Wall 30 lines later · `ground.svg` / `SvgGround`
  / `bake-svg.js` — none exist · `buildRibbonGeometry` — no such symbol · bloom is `platform: 'desktop'`,
  not "(all)" · `fetchExtentCorners` excised · the `BRIEF-intake-manifest.md` pointer repointed to the
  gitignored `_handoffs/`.
- **Cluster 5 (Intake & extent).** The **commit path does not re-center and never runs `reproject-raw`**
  — the most-followed procedure in the cluster described a destructive frame move that does not happen,
  and made INTAKE contradict the very doc that caused the change · the **re-center guard was removed**
  (three docs gave three thresholds; the code has none) · the **msbf identity lock landed**, and the
  open half is `osm-` (both Polish pours) · HPDM 2089/212 → 1281/192 · the tree-census row cited a path
  that does not exist and merged two distinct wells · `EXCAVATION §B4` closed (the retraction gap **was**
  swept; left standing it manufactures distrust of correct docs) · `street-index.json` exists for 2 of 6
  scenes, not as a given.
- **Cluster 6 (State & bake).** 88 → 184 trees · the resolved build blocker struck · the
  MountainBackdrop crash guard **is applied** · B6's "LS has no `neighborhood_boundary.json`" is the
  wrong diagnosis (it exists; it lacks a `polygon` — "create the file" vs "author a polygon into it") ·
  the Milky Way renderer **exists** (`CelestialBodies.jsx`, 1369 lines, `MilkyWaySphere` at `:363`),
  resized M→S · the enumerated active-brief roster replaced with `ls BRIEF-*.md` (it was wrong in both
  directions) · **25 worktrees → 2**, so the standing deterrent against `isolation: worktree` is spent ·
  the intake manifest's three LS-data fallbacks are excised · `484 commits behind` → the command, not a
  number · `BAKE.md` line numbers → symbols (its handler citation was off by ~1,400 lines) ·
  `DOC-CODE C6` — `ribbons.intersections` is not "near-zero consumers", it is **length 0**.
- **The accord sweep** (`ae8ff532`). The re-center claim was repeated in five more docs; the membership
  formula in eleven; the `SvgGround` pointer in `arborist/`; the unreproducible "6 of 50" in `README`.
  All handled in one pass.

---

## 5. ⚠️ Scope drift, surfaced not absorbed

**Tier 2 was scoped at ~25 facts. It was closer to 55 distinct facts across 26 docs.** I did not expand
the job's *kind* — every edit is a doc edit, verified, no code touched — but the volume is roughly 2×
the brief's estimate and worth knowing before the next one is sized.

Three things I found and did **not** act on, per §0's "you are not authorised to fix the code":

1. **The membership precedence divergence (W2).** A code change in three files, or a wording change in
   eleven docs. Needs your ruling.
2. **`tileGround.js`'s header comment — *"the IX is never constructed"*** — is quoted by
   `OSM2STREETS-GROUNDING` as evidence of a live architectural divergence from the standard. The code
   has outgrown its own comment (the IX **is** constructed by leg-adjacency at every node; `junctionMap`
   = 233 nodes). **Doc-rot inside the source**, on a load-bearing verdict. One-line comment fix; I left
   it because §4 bounds writes to `src/` to comments that state something false — this one qualifies,
   but `tileGround.js` may have another session live in it.
3. **`7b5b87a3`'s commit message asserts "the probes … are kept."** It deleted `stamp-mouth-audit.mjs`
   and `stamp-predicts-fill.mjs`. A load-bearing false claim sitting in immutable git history, which is
   why `POLYGON-FIRST` and `README` cited the probes in good faith. Nothing to fix — worth knowing that
   commit messages are part of the corpus and are not audited by anything.

---

## 6. Verdict — plain language, for Jacob

**The corpus is in good shape and the six sweepers' headline was right: the doctrine held, the status
layer rotted.** I found no case where a *principle* was wrong. But the framing "it's all just stale
counts" undersold it — **eight items were wrong beliefs, not rot**, and the two that matter are
structural. The first is that "prebake is authoring-blind," stamped *verified in code*, is only true of
one of the two authoring channels; that single overgeneralisation is what made "freeze the curb in
prebake" look categorically impossible when it is only impossible for per-fe SHAPE intent — and A03/A06
are scoped off it. The second is the membership formula: eleven documents state
`(polygon ∪ activate) − (exclusions ∪ hide)`, all three code sites let `activate` beat an exclusion
loop, one excavation doc noticed in July, and **nobody ever ruled** — the textbook shape of the thing
you asked us to look for. Also worth knowing: Tier 1's own correction of the curb-carve count was itself
an under-correction (the floor is 41, not 30, and `POLYGON-FIRST §3` had 42 right all along), which is
the third time in this arc that a correction over- or under-swung — the pattern is real and it argues
for citing the method, not just the number, every time.

**✅ The membership precedence was ruled the same day** (`8205a48a`) — ordered, finest gesture wins, the
code was right, eleven docs corrected, and the three code sites now carry the rule as a comment. It also
turned up a sibling: those three sites disagree on degenerate footprints, so the 2D Designer can show a
building the slab does not (`ROADMAP A08`, XS, unfixed).

**The one thing I would do next:** **A07 is a
prerequisite for the "d" bulge**, not a sibling — until the producer choice is recorded per tile, every
diagnosis of that bulge is a coin flip about which of two code paths built the tile you are looking at.

---

*Wren, 2026-08-04. Input: `scratch/doc-sweep-1..6-*.md` (`d8cdeaad`); Tier 1 closed in `d8c4fee7` /
`c6d36fa7` / `426e01c1`.*
