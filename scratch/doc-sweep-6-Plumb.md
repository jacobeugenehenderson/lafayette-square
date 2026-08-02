# Doc sweep — CLUSTER 6 (State & bake) — agent **Plumb**

Docs: `ROADMAP.md` · `cartograph/BACKLOG.md` · `cartograph/BAKE.md` · `cartograph/DOC-CODE-COHERENCE.md`

**Claims extracted (load-bearing, consequence filter): 34.**
Verdict split: **CONFIRMED 13 · FALSE 15 · UNVERIFIABLE 6.**

Checked at HEAD `40c7e2e5` (branch `land-use-derivation`); the ls-bleed/land-use excisions below were confirmed present on `curb-offset-draw` too (`git branch --contains`), so these are not branch artifacts.

⚠️ **The dominant pattern: this cluster's "live / open / measured" lists have been overtaken by work that landed 2026-07-31 → 2026-08-01 and was never struck.** Six separate open tickets describe defects the code no longer has. Per the brief's own thesis — doctrine ages slowly, status lists age fast — every FALSE below is a status claim, and none is a doctrine claim.

⛔ **Pure line-number drift is NOT reported** per §3 of the brief. It is nonetheless severe and worth one aggregate note: `BAKE.md`'s header claims it was "grounded against the live orchestration in `serve.js` (the `/looks/:id/bake` handler, ~L461–623)". The handler is now at ~L1860–2160; `runIfDirty` is `serve.js:1945` (doc: 531), the `bakedAt` stamp `:2159` (doc: 616), the bake-svg note `:1898` (doc: 493), `shape.json` emission `bake-ground.js:1027` (doc: 887), the B7 corpse-lie message `serve.js:1979` (DOC-CODE says `:1171`). Anyone opening the cited lines lands nowhere near the code.

---

## A. Status claims that are no longer true

### ROADMAP.md:34 (Live/blocking defects) — CONFIRMED (with an understatement)
CLAIM: "Prod: 88 trees 404 — `origin/main` census requests `platanus/skeleton-4` ×88, no such GLB ships."
ACTUAL: `origin/main:public/baked/default.json` contains exactly **88** `platanus_acerifolia/skeleton-4` refs — and also **48** `betula_pendula/skeleton-4` + **48** `acer_saccharum_procedural/skeleton-4`, i.e. **184** requests total. `git ls-tree -r origin/main public/trees | grep skeleton-4` → **zero** files; the working tree has them (`public/trees/platanus_acerifolia/skeleton-4-lod{0,1,2}.glb`).
IMPACT: the defect is real and the "do NOT `git restore public/baked/**`" instruction is sound, but a fixer sizing the blast radius from "88" is off by 2×.

### ROADMAP.md:35 — FALSE
CLAIM: "Build blocker: dangling symlink `public/photos/lafayette-square/other` fails `npm run build`. Blocks every prod build → blocks baking."
ACTUAL: there is **no `other` entry** in `public/photos/lafayette-square/`. The directory holds 7 symlinks (benton-place, benton-statue, dolman-st, lafayette-ave, lafayette-park, mississippi-ave, missouri-ave) and a `[ -e ]` test over all of them reports **zero dangling**.
IMPACT: an agent told "every prod build is blocked" will either chase a nonexistent file or refuse to attempt a build. The stated blocker to the whole bake path does not exist.

### ROADMAP.md:36 — FALSE
CLAIM: "Latent prod crash: `MountainBackdrop.jsx:68` white-screens any Look that opts into landscape without overrides — one-line guard (`.values ?? LANDSCAPE_FLAT_DEFAULTS`) **drafted, unapplied**."
ACTUAL: the guard is applied. `src/components/MountainBackdrop.jsx:68`:
`const channel = (landscapeOverride ?? scene?.landscape ?? LANDSCAPE_DEFAULT_CHANNEL).values`
with `LANDSCAPE_DEFAULT_CHANNEL = Object.freeze({ values: { ...LANDSCAPE_FLAT_DEFAULTS } })` at `:43`.
IMPACT: a listed prod crash-risk is spent. Someone "applying the one-liner" would be re-landing existing code.

### ROADMAP.md:37 (⭐ Land use is INVENTED for most of the map) — FALSE as written
CLAIM: "`luForRing` decides a whole block's LU from one point sample; on a miss it falls to `pickLuFromHash`, a weighted random palette… **Root for HPDM: `derive.js:1020` reads only `stl_parcels.json`; the 14,597 County parcels are… ignored by the land-use join.**"
ACTUAL: fixed at `40c7e2e5` and logged in this cluster's own sibling doc as `DOC-CODE-COHERENCE` **C15 ✅ excised 2026-08-01**. `derive.js:1038` now loops `[['stl_parcels.json','city'], ['stlco_parcels.json','county']]` jurisdiction-tagged; mapping moved to `cartograph/parcel-landuse.mjs`; the third rung is `underived`, not `'residential'` (C16), with a pour-time report at `derive.js:3059-3066`. `pickLuFromHash` is the mechanism C16 explicitly retracts as the headline cause.
`blockLandUse` = **0 entries in all 7 scenes** — CONFIRMED (broader than "both scenes").
IMPACT: **ROADMAP's #1 starred live defect and DOC-CODE-COHERENCE C15/C16 directly contradict each other, in the same cluster.** Anyone reading ROADMAP dispatches `BRIEF-land-use-derivation.md` at work that already landed.
⚠️ **Residual that survives the excision, and is not tracked anywhere:** `tileGround.js:3079` still ends `return best || pickLuFromHash(hashKey(blockKeyFromRing(ring)))` — the hash palette is *still wired as a live fallback* on the FILL side. C16 marks its row ✅; the fallback it names is only half gone.

### ROADMAP.md:51 (A00 · RIP OUT THE LS FALLBACKS) — FALSE for 4 of its 5 measured sites
CLAIM: "**Measured, live:** `measureModel.js` seeds street widths in EVERY scene from LS's `ribbons.json` keyed by street NAME… Other silent substitutions found the same day: `config.js:26` `SCENE = env || DEFAULT_SCENE`; `serve.js:902`; `serve.js:765` (a Look with no scene is *assigned* LS); `serve.js:1906` (a bake with no scene ⇒ **bakes over** LS)."
ACTUAL, site by site:
- `measureModel.js` — **excised.** `:24-40` carries an `⛔⛔ EXCISED 2026-07-31` banner; the seed is now `setSceneMeasureSource(ribbons, sceneId)` (`:43`), registered per-scene by `useCartographStore.js:2173`, empty when unregistered.
- `config.js:26` — **excised.** The `SCENE = env || DEFAULT_SCENE` line is replaced by a `⛔⛔ NO SILENT DEFAULT ON ANYTHING THAT WRITES` block.
- `serve.js:765` (Look assignment) — **excised**; comment: "Was: `entry.scene = DEFAULT_SCENE`… Leave it unset and let the consumer refuse."
- `serve.js:1906` (bake) — **excised**; comment: "Was: `|| DEFAULT_SCENE` — a bake whose Look carried no scene BAKED OVER…".
- `serve.js:902` — **still live**: `const scene = sceneRouteMatch[1] || DEFAULT_SCENE`. A *read* route, but it is the one site of the five that remains.
The Altadena-24 / Hi-Pointe-6 / Polish-0 measurement is the *pre-fix* measurement.
IMPACT: A00 is sized "S · rip out five fallbacks" when four are gone and one read-path remains. More seriously, **the same stale evidence is quoted verbatim as "the standing evidence that this is real, not rhetoric" in `CLAUDE.md` Layer 0 and in MEMORY** — so the repo's mandatory gate document is citing a fixed defect as its live proof. (Cluster 4 owns `CLAUDE.md`; flagging the cross-cluster consequence because this cluster is where it originates.)

### ROADMAP.md:112 (B6 · Placement / census correctness) — FALSE as to cause
CLAIM: "LS has **no `neighborhood_boundary.json`**, so tree membership falls back to the disc."
ACTUAL: `cartograph/data/lafayette-square/neighborhood_boundary.json` **exists** and is read by `tree-bake-inputs.mjs:141`. Its keys are `version, description, center, radius, innerFadeOffset, fade, streetFade, boundary` — there is **no `polygon` key**, which is what `bake-trees.js:933`'s `membership.hasPolygon` tests before printing `⚠️ no boundary-street polygon`.
IMPACT: the symptom is real, the diagnosis is not. An agent told "the file is missing" will try to *create* the file; the actual work is authoring a `polygon` into the file that is already there. (Also relevant: `bake-buildings.js:671` gates the boundary read on `scene !== 'lafayette-square'` — a surviving hardwire the BAKE doc does not mention.)

### ROADMAP.md:126 (Milky Way re-enable) — FALSE
CLAIM: "the `CelestialBodies.jsx:~1194` pointer is STALE; **that file no longer exists** and the runtime celestial renderer isn't grep-locatable — 2026-07-18."
ACTUAL: `src/components/CelestialBodies.jsx` exists, 1369 lines, and contains the renderer: `MilkyWaySphere` at `:363`, `MILKYWAY_FLAT_DEFAULTS` import at `:19`, `MILKYWAY_DEFAULT_CHANNEL` at `:37`, resolution through `resolveGroupAtMinute` at `:405`, mount at `:486`.
IMPACT: the item is sized **M · "needs a talk-out investigation to locate/revive the missing renderer"** when the renderer is present and named. This is exactly the failure the brief's preamble describes (a doc claiming working infrastructure does not exist).

### BACKLOG.md:106 (🧹 Prune the stale worktrees) — FALSE
CLAIM: "**25 worktrees**, most on branches months old (`t4-figure-ground`, `roster-editor`, `milkyway-investigation`, `spline-18th-loop`…). Any future worktree dispatch is unreliable until this is cleaned."
ACTUAL: `git worktree list` → **2** entries: the main tree, and `.claude/worktrees/pipeline-repro` (`repro-a01`). `ls .claude/worktrees` → 1 directory. None of the four named branches has a worktree.
IMPACT: a live warning that *worktree dispatch is unreliable* — which would deter using `isolation: worktree` at all — no longer applies, and a whole ticket is spent.

### BACKLOG.md:104 (Intake Manifest) — FALSE
CLAIM: "three absent inputs today fall back to **Lafayette Square's** data rather than to nothing (`bake-lamps.js:99`, `bake-trees.js:427/:430`); the known Altadena wrong-lamps bug is a *class*."
ACTUAL: both excised. `bake-lamps.js:96` reads the authored well **only** `if (scene === 'lafayette-square')`, with `:80-82` explicitly stating it is not a fallback for a lampless town. `bake-trees.js:458-463`: "⭐ Defaults resolve against THIS SCENE, never a literal 'lafayette-square'. Both of these used to fall back to LS's files… for every other scene absence now means absence. (`BRIEF-ls-bleed-excision.md` sites 2 + 3.)"
IMPACT: same as A00 — the class was closed; the brief entry still asks for it.

---

## B. Cross-doc contradictions (the code decides)

### ROADMAP C4 / DOC-CODE C3+C4+B4 / BAKE §5 vs `tileGround.js:6-8` — the docs are FALSE, the code is right
CLAIM (three docs, one story): the figure-ground path is still live and awaiting T4. ROADMAP C4: "extract the still-live helpers from `buildBlockGeometryV2.js` (**3,371 lines**, ~13 importers) → … → **delete the builder** + `BlockGeometryV2Debug.jsx` + the `bake-ground.js:28` import (T4)". DOC-CODE **C3** 🔎: "Figure-ground (`buildBlockGeometryV2`/`fbMemo`) **still computed every Designer frame** to feed overlays"; **C4** 🔎: "`buildBlockGeometryV2.js` + `cornersAtIx` — **the whole dead module**"; **B4** 🔎 + `BAKE.md:143`: "`bake-ground.js:28` still `import`s `buildBlockGeometryV2` (the dead figure-ground). **Dead weight** pending the T4 excision."
ACTUAL:
- `src/lib/tileGround.js:6-8` — "This is THE live ground construction for every scene — and since **T4 (2026-07-15)** the ONLY one. **Figure-ground, its predecessor, is deleted**; what remains of `buildBlockGeometryV2` is the frontage-edge identity builder."
- The file is **1,846 lines**, not 3,371.
- The single caller is `BlockGeometryV2Debug.jsx:414`, inside a `useMemo` that **returns early unless `surveyActive || measureActive`** (`:409`) and destructures **only `{ frontageEdges }}` (`:399`). Its own comment `:403-407`: "Pre-T4 this pass also built the figure-ground meshes and cost 285 s on Altadena… That geometry is gone and the build is now ~0.5 s." So "computed every Designer frame" is false twice over — it is memoized *and* gated off in the Design view.
- `bake-ground.js` imports `differenceRings` — a live boolean-ops helper (`buildBlockGeometryV2.js:614`), not the dead builder. Not dead weight.
- 10 code importers (`smoothCenterline`, `mergeLiveRibbons`, `buildPathRibbons`, `SurveyorOverlay`, `MeasureOverlay`, `BlockGeometryV2Debug`, `useCartographStore`, `bake-ground`, `tileGround`, `derive-toy`) — "~13" counts doc files.
IMPACT: **the largest single miscalibration in the cluster.** Three docs carry a ~3,400-line deletion + a per-frame perf drag as open work; the deletion happened, the perf drag is gone, and the surviving module is load-bearing identity code. C4/B4's "delete the builder" framing, followed literally, breaks the live Survey/Measure fe-identity path and the bake's ring boolean ops.

### ROADMAP.md:16 vs BACKLOG.md:150 — the active-brief roster disagrees, and both are wrong
CLAIM (ROADMAP): "The **6** *active* dispatch briefs stay tracked at root (`BRIEF-land-use-derivation`, `-terminal-node-sweep`, `-street-labels`, `-ls-bleed-excision`, `-arborist-slab-weight`, `-extent-excavation-and-design`)."
CLAIM (BACKLOG:150): `BRIEF-extent-excavation-and-design` is "✅ **DELIVERED** — fully superseded by its own outputs."
ACTUAL: root holds **8** briefs — the 5 ROADMAP names that survive, plus **`BRIEF-dead-end-mouth-junction.md`**, **`BRIEF-hpdm-curve-fit.md`**, **`BRIEF-pair-free-edge-anchor.md`**. `BRIEF-extent-excavation-and-design.md` does **not** exist (BACKLOG is right, ROADMAP is wrong). Zero root `HANDOFF-*.md` — that half of the relocation claim CONFIRMED.
IMPACT: the index of what is dispatchable is not the set of what is dispatchable, in either direction.

### BACKLOG.md:5 — trunk CONFIRMED, count stale
CLAIM: "Active trunk `curb-offset-draw`… `origin/main` = `7b2ae01e`… **484 commits behind head** as of 2026-07-23."
ACTUAL: `.github/workflows/staging.yml:5` → `branches: [curb-offset-draw]` ✅. `origin/main` = `7b2ae01ea755…` ✅. `git rev-list --count origin/main..HEAD` = **548**. Doc dates its own number, so this is honest drift, not a lie — recorded because "the gap is widening" is the load-bearing part and it is still widening.

---

## C. Claims that hold

### BAKE.md §4.5 (a census is the union of its wells) — CONFIRMED
OSM well `cartograph/data/lafayette-square/raw/osm_street_lamps.json` = **641**; authored `src/data/street_lamps.json` = **80**; the doc's 688 pre-clip / "~583 after the boundary clip" matches the shipped `public/baked/lafayette-square/lamps.json` = **583** exactly. The `bake-lamps.js:128-129` comment independently narrates the regression the section is named for.

### BAKE.md §4.6 (tree gates) — partially CONFIRMED
"LS bakes **5001**" — `public/baked/lafayette-square/trees.json` `count` = **5001** ✅. `scratch/tree-lu-exclusion-census.mjs` exists ✅. The gate breakdown (1707 / 637 / 4423 of 6767) is **UNVERIFIABLE (b)** — reproducing it means running the census harness against a re-derived shape, which the brief bounds out.

### ROADMAP.md:74 (A05 · the curb check measures the operator's authoring) — CONFIRMED
`cartograph/litmus-curb-parallel.mjs:77` is literally `blockCustoms: null,` inside the `buildTileGround` call at `:74-78` — authoring OFF, exactly as claimed. `:86` is `if (!tile?.iA?.length) continue` — the unmeasurable-tile skip the ticket says must become its own failing class. (Note: the doc cites a bare basename; the file is in `cartograph/`, **not** `scratch/`, which cost a search.)

### ROADMAP.md:81 (A0 · the spur construction was reverted) — CONFIRMED
`grep -rn SPUR_OUTLINE src cartograph` → **zero hits**. "`SPUR_OUTLINE` is gone from the code" holds.

### ROADMAP.md:52 (A02 · the wall no longer falls back silently) — CONFIRMED as built
`useCartographStore.js:1775-1777` carries `shapeFreezeMissing` as a *reason string*; `BlockGeometryV2Debug.jsx:594-600` sets door 1 with a `[ROADMAP A02]` tag and an explicit message; `StatusBar.jsx:6` reads it. The "⚠️ eye-gate owed / cannot fire on any of the 7 scenes that have a freeze" caveat is consistent with `cartograph/data/` holding 8 scene dirs. The eye-gate itself is **UNVERIFIABLE (b)**.

### ROADMAP.md:53 (A03 · the producer is split at the chain boundary) — CONFIRMED as built
`tileGround.js:185 freezeCurbEdgeFacts(...)` and `:224 buildCurbRings({ ring, facts, authoredHW, capAtVertex, curved })` — the second signature takes no streets/runs/measures/ribbons, which is the lexical-scope guard the ticket claims (`:167` "buildCurbRings' SIGNATURE IS THE GUARD"). Call sites `:3280` / `:3337`. `scratch/a03-curb-identity.mjs` exists. The 58% / 42-tile split and byte-identity are **UNVERIFIABLE (b)** without running the harness.

### ROADMAP.md:59 (A06 · the stroke's polyline is already chain-free) — CONFIRMED
`tileGround.js:1074-1076` builds `run.poly` purely from ring vertices:
`const poly = []; for (let k = 0; k <= len; k++) poly.push(ring[(i0 + k) % n]); runs.push({ streetIdx…, side…, poly })`. No `streetsOrig`/`points` in scope. The retraction of the "freezing the run polylines = freezing the chain" objection is correct.

### ROADMAP.md:101 / BACKLOG.md:98 — LS-frame literals + the Hero camera pin — CONFIRMED
`src/lib/heroSubject.js:32` `export const FALLBACK_HERO_SUBJECT = [400, 45, -100]`, returned at `:54/:79/:83/:87`. `HeroPreview` is `src/stage/StageApp.jsx:1108` with "3) Always aim at the subject (every frame, animating or not)" at `:1165`; the OrbitControls gate is `CartographApp.jsx:486` `enabled={shot !== 'hero' || heroAuthoring}`. (BACKLOG says `StageApp.jsx:1162` without the `src/stage/` path — the file is not at repo root or `src/cartograph/`.)

### ROADMAP.md:91 / DOC-CODE C6, C8, C9, C10, C11 — CONFIRMED
`tileGround.js:865` — "⛔ The persisted `innerSign` side-key is UNRELIABLE" ✅ (doc cites `:742`).
C9 ✅ — no `function simplify(` in `skeleton.js`; `simplifyRDP` at `:800`, called `:1925`.
C10 ✅ — `skeleton.js:2309` `writeIfChanged(…, { touch: false })`.
C11 ✅ — zero `R-CLAMP` occurrences in `tileGround.js`.
C6 ⚠️ resolves *further* than the row says: `src/data/ribbons.json` emits `intersections: []` — **0 entries**, not "near-zero live consumers". C8's `medians[]` is still emitted (52). Counts: `tiles 101 · faces 173 · streets 209`.

### DOC-CODE C7 — CONFIRMED still vestigial
`useRingBandEmitter` survives in 3 live places (`buildBlockGeometryV2.js:1468` default `false`, `CartographApp.jsx:1098` hardcoded `true`, `BlockGeometryV2Debug.jsx:242` default `true`) with comments saying the legacy else-branch was removed. A flag with one reachable branch. The ⚠️ re-verify is discharged: it *is* vestigial.

### DOC-CODE B7 — CONFIRMED still open
`serve.js:1979` still pushes `skipped.push('pipeline (scene-specific pipeline not yet implemented)')`. The row's "🔎 update the message" is accurate. `BAKE.md §1`'s claim that the comment is "conservative — it works" is consistent with `serve.js` running the pour path separately.

### BACKLOG.md:79 (the phantom park) — CONFIRMED at the mechanism
`cartograph/classify.js:60-61` still buckets `leisure=park || leisure=garden || landuse=grass || landuse=recreation_ground` → `type='park'`. The "fix = drop grass AND garden" direction is unexecuted. The 512/895 and 25-of-29 measurements are **UNVERIFIABLE (b)** (need an overlay pass).

### BACKLOG.md:77 / DOC-CODE band-fold row — CONFIRMED
`tileGround.js:3471-3472`: `thinTile` is computed and consumed **only** by `bandJoin`; no depth clamp. "⚠️ NOT landed" holds.

---

## D. Not checkable as written (finding in itself)

- **`ROADMAP` A01 — "the pipeline does not reproduce its own committed output (233 vs 228 junction nodes; 75 vs 71 asphalt rings)."** **UNVERIFIABLE (b)** by construction: confirming it requires the re-derivation the brief (and the ticket) forbid. Worth saying plainly — this is the cluster's highest-stakes claim and it is *deliberately* untestable inside the sweep's bounds. A worktree named `pipeline-repro` on branch `repro-a01` exists, which is consistent with someone else holding this.
- **`ROADMAP` A03/A05/A06 — every "byte-identical", "Check C green for 58%", "30 divided median · 3 loop-body · 9 small", "`tClip` 2541 → 2021 m²".** **UNVERIFIABLE (b)** — all require running `buildTileGround` in both authored and bare-defaults states. The harnesses named (`scratch/a03-curb-identity.mjs`, `cartograph/litmus-curb-parallel.mjs`) exist and are the right instruments; I confirmed the *code shape* they describe but not the numbers.
- **Every "⏳ eye-gate owed / eye-pending" claim** (A02's banner, B1/B2's impostors, the 7-slot TOD look, the Grove axis, `AWAITING JACOB`). **UNVERIFIABLE (a)** — by their own definition the test is the operator's eye. This is correct doctrine, not a defect; noting it because roughly a third of BACKLOG's status field reduces to it, and "eye-pending" has in several rows sat unchanged for five weeks.
- **`ROADMAP` C9(a) sizing** — "`deriveLayers()` a single ~3,465-line function (L1009→~4474), 75% of the 4,607-line file." ACTUAL: `derive.js:1008` → `:4731` = **~3,724 lines**, **77% of 4,866**. Direction and conclusion intact; the numbers moved ~8%. Same for C9(c) "`scratch/` — 1,048 files" → **1,171**, and `BAKE.md §2` "derive.js… (185 KB)" → **228 KB**. Reported as one aggregate rather than three findings, per the consequence filter.

---

## Scope note

One pass covered all four documents. `ROADMAP.md` and `cartograph/BACKLOG.md` are each ~160–170 lines of extremely dense index prose carrying well over a hundred discrete assertions; I applied the "would someone do something different" filter hard and checked 34. What I deliberately did **not** attempt: the ~40 arborist / meteorologist / ls-app / security pointers in ROADMAP's Horizon (H1–H8) and Close-out (S1–S3), and BACKLOG's 🔥 NOW render-frontier block (`Scene.jsx`/`PostProcessing.jsx`/`PreviewApp.jsx` post-FX history) — those are other domains' code and a second sweep's worth of work. **If one more pass is bought for this cluster, spend it on BACKLOG §🔥 NOW**, which is the oldest untouched block in either file (most entries dated 2026-06-26 → 06-30) and by this sweep's own base rate is where the next stale-status cluster will be.
