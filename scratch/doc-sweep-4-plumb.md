# DOC SWEEP — CLUSTER 4 (Spine & entry) — agent: PLUMB

Docs: `ORIENTATION.md` · `README.md` · `CLAUDE.md` · `cartograph/PIPELINE.md` · `cartograph/ARCHITECTURE.md`

**Extracted:** ~55 load-bearing claims (filter = "would someone act differently?").
**Verdict split:** 9 FALSE · 2 CROSS-DOC CONTRADICTIONS · 22 CONFIRMED · ~22 UNVERIFIABLE.
**Changed nothing.** Read-only on trunk `curb-offset-draw` (no worktree needed — no writes, no bakes).

⭐ **The headline:** the spine's *doctrine* held up well. What failed is exactly what the brief predicted —
**status claims and known-open lists**. Three of the four worst findings are defects the docs still call
"live, unfixed" that were **fixed on 2026-07-31**, and one is a data field the docs still call live that was
**reverted on 2026-07-31**. The routing gate itself (`CLAUDE.md` Layer 0) cites as its single piece of
standing evidence a defect that no longer exists.

---

## FALSE

### ORIENTATION.md §"The dependency chain" step 3 (prebake) — FALSE
CLAIM:  "prebake never reads the operator's edits (**verified in code: zero reads**). So anything that
        freezes geometry here freezes the to-code default instead of the actual town. That is why
        *'freeze the curb in prebake'* was an impossible instruction."
ACTUAL: `cartograph/derive.js:2500-2530` loads `clean/overlay.json` — *"Operator-intent overlay: skelId-keyed
        measure/caps/segmentMeasures/couplers/anchor overrides **written by Survey + Measure**"* — and
        `:2528-2532` prefers `ov.measure` over the computed default. It is populated, not theoretical:
        **LS 52 authored streets, lafayette-square-staging 177, toy 9, hipointe-demun 5.**
        What prebake genuinely does not read is `design.json` `blockCustoms` (the per-fe SHAPE SSOT) — no
        `design.json` read exists in `pipeline.js`/`promote-ribbons.js`.
IMPACT: The strongest structural argument in the spine ("freeze-the-curb-in-prebake is impossible") rests on
        a claim that is true only of *one* of the two authoring channels. An agent reading this will not look
        for the overlay at all — and the overlay is where caps/anchors/chain measures actually live. It is
        also stamped "verified in code," which suppresses re-checking.

### CLAUDE.md §Layer 0 "standing evidence" + ORIENTATION.md §"How it ships" (NO FALLBACKS bullet) — FALSE
CLAIM:  "**The standing evidence that this is real, not rhetoric:** `measureModel.js` seeds street widths in
        every scene from LS's `ribbons.json`, keyed by street NAME — so 24 Altadena streets silently inherit
        St. Louis measurements … (Measured 2026-07-31; **open** — `ROADMAP` A-tier.)" / ORIENTATION:
        "**Measured, live, unfixed.**"
ACTUAL: Excised the same day, commit **`08d61ce1`** *("fix(kit): excise the LS fallbacks")*.
        `src/cartograph/measureModel.js:23-53` now carries the excision note and a **scene-scoped** seed
        (`setSceneMeasureSource(ribbons, sceneId)`), registered per scene at
        `useCartographStore.js:2173`. With no registration the seed is **empty** and `chainMeasure` falls to
        the generic type default. The static LS import is gone.
IMPACT: The mandatory routing gate's only concrete proof is stale — and it is stale in the direction that
        matters most (a fixed thing listed as open). An agent will either re-fix it, or cite it to Jacob as
        live. Note `ROADMAP.md:51` (A00) carries the same stale text — outside my cluster, flagging for merge.

### cartograph/PIPELINE.md §Wall, 4th bullet — FALSE
CLAIM:  "⛔ **NEW, live, unfixed (2026-07-31) — a FALLBACK inside the wall itself.** If the `shape.json` fetch
        fails, the consumer **silently** falls back to a live build … the operator sees a plausible map and
        **never learns the freeze did not happen**."
ACTUAL: Built the same day (`ROADMAP.md:52`, A02). The store carries `shapeFreezeMissing` as a *reason*
        (`useCartographStore.js:1775-1777`); it is set at **both** doors —
        `BlockGeometryV2Debug.jsx:598-600` (absent/404 freeze) and `:610` (fetch/parse FAILED) — cleared in
        Survey (`:568`), and rendered as a non-dismissable banner by `StatusBar.jsx:6`. The live build still
        *draws* by design; the silence is what was cured.
IMPACT: Someone routing on "NO FALLBACKS" reads the spine doc, believes the wall still degrades silently, and
        rebuilds a banner that exists. ⚠️ The one true residual is that A02 is **not eye-verified** (it cannot
        fire on any of the 7 scenes that have a freeze) — that is the accurate open item, and PIPELINE does
        not say it.

### README.md §START HERE, "Corners / thorns" row — FALSE
CLAIM:  "data: `junctionMap.nodes[].corners.{all, outer, apex, stub}` — **`all` is the registry (261/261)**,
        the rest divided-construction bookkeeping."
ACTUAL: `corners.all` **exists nowhere** — 0 hits across `src/` and `cartograph/`. `derive.js:3978` constructs
        `corners: { outer: [], apex: [], stub: [] }` only. Measured on the committed artifact
        (`src/data/ribbons.json`): **233 `junctionMap.nodes`, 0 carrying `corners.all`.** The registry landed
        in `152e7734` and was **reverted by `7b5b87a3`** ("the eye says no"), which restored `ribbons.json`,
        `map.json` and `shape.json` to pre-session bytes.
IMPACT: This is the routing table's "route by SYMPTOM to here" column — an agent told to drive corner work
        off `corners.all` will grep, find nothing, and conclude the pipeline is broken or the artifact stale.
        It also **contradicts README's own WALL row**, which correctly records the whole arc as reverted.

### README.md §"Architecture at a glance" (helper table) — FALSE
CLAIM:  "**Cartograph** … Publishes `public/looks/<id>/ground.svg` (per Look) … Consumed by **Stage's
        `SvgGround`**."
ACTUAL: No `SvgGround` component and no `bake-svg.js` exist anywhere in the repo (`find`, whole tree, minus
        node_modules). The only trace is a stale artifact file `public/looks/lafayette-square/ground.svg`.
        `ARCHITECTURE.md §2` half-corrects this ("`bake-svg.js` is demoted to CLI-only QA") — **also false;
        the script is gone.** The real Cartograph→runtime artifact is `public/baked/<id>/ground.{json,bin}`.
IMPACT: The first architecture diagram a newcomer reads names a non-existent producer and a non-existent
        consumer for the kit's primary output.

### cartograph/PIPELINE.md §prebake + README.md §START HERE "Prebake" row — FALSE
CLAIM:  "The 2D Survey/Design view renders **LIVE from `ribbons.json`** via `buildTileGround` — **the ground
        bake is irrelevant to the 2D screen; only `ribbons.json` + `tileGround.js` matter there.**"
ACTUAL: True for **Survey only**. Every non-Survey 2D view (Section/Measure *and* the neutral Design view)
        fetches `public/baked/<scene>/shape.json` (`BlockGeometryV2Debug.jsx:581`;
        `sectionFrozen = !surveyActive && !!frozenShape`, `:618`) — a **bake output**
        (`bake-ground.js:1027`) or the Survey-exit freeze POST (`serve.js:1023`).
IMPACT: Direct operational cost: someone debugging "the 2D map is wrong" is told a re-bake cannot matter,
        when for 2 of the 3 tools it is exactly what matters. **PIPELINE contradicts itself** — §Wall (same
        file, 30 lines later) states the frozen-consumer rule correctly.

### cartograph/ARCHITECTURE.md §Extent (ExtentApp bullet) — FALSE
CLAIM:  "the `sides` draft field is **vestigial**."
ACTUAL: `sides` is the live boundary-street selection: declared `ExtentApp.jsx:968`, written into the
        auto-saved draft `:1339`, hydrated from `nb.sides` `:1282`, resolved to geometry `:1701-1707`, and
        drives `<ExtentClickableStreets selected={sides}>` `:1758` plus the whole boundary-street picker UI
        `:1990-2008`. 22 references.
IMPACT: Marked vestigial in the as-built engineering record, it is a deletion candidate — and deleting it
        removes the street-selection path that the *same section* calls "the primary authoring surface, not a
        corrector for the gazetteer's answer."

### cartograph/ARCHITECTURE.md §8 "Render pipeline — one manifest" (table) — FALSE
CLAIM:  Manifest row `40 | bloom | CustomBloom | bloom | **(all)**`.
ACTUAL: `src/components/renderPipeline.jsx:221` — `{ id: 'bloom', pass: CustomBloom, channel: 'bloom',
        order: 40, platform: '**desktop**' }`. (The doc's own next bullet — "mobile currently drops
        ao/pyramid/dof/bloom/aerial" — agrees with the code, so the table is the wrong half.)
        All other 7 rows verified correct against the manifest.
IMPACT: The doc calls the manifest "the literal ship list"; a mobile-budget decision made off this table
        assumes bloom already ships on phones.

### cartograph/ARCHITECTURE.md §5 (runtime entry points) — FALSE
CLAIM:  "the shared `src/lib/ribbonsGeometry.js:buildRibbonGeometry()` face-clip helper now has
        `cartograph/bake-ground.js` as its sole consumer."
ACTUAL: No `buildRibbonGeometry` symbol exists anywhere. `bake-ground.js:33` imports
        `{ clipAllToStencil, LAND_USE_COLORS }` from that module.
IMPACT: Low blast radius, but it is a "where does X live" pointer to a function that isn't there.

---

## CONTRADICTIONS ACROSS THE CLUSTER

### PIPELINE.md §Wall ↔ ARCHITECTURE.md §2.1
PIPELINE's correction note credits the other docs: *"`WALL.md §31` and **`ARCHITECTURE.md §79` carried the
accurate version the whole time**; this one was never updated."* But `ARCHITECTURE.md:79` **opens with the
exact false sentence** — *"the **curb geometry is still re-stroked live from chains every frame**"* — and only
corrects it after an em-dash ("every NON-Survey view now consumes the frozen `shape.json`"). A reader
skimming for the headline gets the false version, and PIPELINE has told them not to check.
⭐ Per the brief, the code decides: `BlockGeometryV2Debug.jsx:618` + `tileGround.js:1907` (chain-free
`sectionOpen` signature) confirm the corrected reading. `ARCHITECTURE §2.1`'s lead clause should not be cited
as an accurate source.

### README.md cross-cutting feature index ↔ the file system
The "Intake manifest" row names **`BRIEF-intake-manifest.md`** as a home doc (bolded, root-relative). It is
not at root — it was swept into the **gitignored** `_handoffs/` (commit `f559e4ea`). README's own State-layer
section says root `BRIEF-*.md` are git-tracked and `_handoffs/` is not, so the pointer implies a durability
the file does not have.

---

## CONFIRMED (checked, true — cite these)

- **`shape.json` frozen `iA` on 93 of 101 LS tiles** — measured directly on
  `public/baked/lafayette-square/shape.json`: 101 tiles, 93 with non-empty `iA`. (README WALL row + PIPELINE §Wall.)
- **Producer side is genuinely open** — `shape.json` is a *snapshot*: written by `bake-ground.js:1027` from the
  live `buildTileGround` artifact, or POSTed wholesale by the client freeze (`serve.js:1011-1023`). Check C RED is real.
- **`sectionOpen` is chain-free by signature** — `tileGround.js:1907`: `(shapeTiles, cw, stripMat, stencil,
  blockCustoms, cache, selectedTileSet)`. No streets/chains/ribbons handle.
- **live == bake for SHAPE** — `bake-ground.js:37,343` imports and calls the same `buildTileGround`.
- **Membership = `(polygon ∪ activate) − (exclusions ∪ hide)`** — implemented twice as documented:
  `pipeline.js:100-117` (pre-derive) and `:237-258` (post-derive, `map.json` the single filtered source), and
  re-applied belt-and-suspenders in `bake-buildings.js:673-693`. Disc is the fallback only when `poly` is null.
- **`keepR = streetFade.outer + 30`** — `pipeline.js:168`, exactly as written.
- **The 9.2° firebreak holds** — the only surviving park-rotation constants are
  `LafayettePark.parkAxisToCompass` and its call sites. No `GRID_ROTATION`/`0.1605` in the math or data layer.
- **`V_EXAG = 1.5`** — `src/lib/terrainCommon.js:18`.
- **`SPUR_OUTLINE` is gone from the code** — 0 code hits; only docs and `_archive/`. (README WALL row correct.)
- **`StreetRibbons.jsx`, `BakedBuildings`, `PreviewPostFx` are all absent** from the tree, as claimed.
- **`InstancedTrees` has no global fallback** — `placementsUrl = bakeUrl || baked/${lookName}/trees.json`
  (`InstancedTrees.jsx:609`), with the removed `baked/default.json` fallback documented in place.
- **Installation config is `src/instances/<look>.js` with a `modules` manifest** — 4 instances present
  (`lafayette-square`, `hipointe-demun`, `centrum`, `ksi-y-m-yn`); `modules:` at `lafayette-square.js:79`.
- **Dev topology** — `npm run dev` = concurrently web/carto/arb/met; ports 3333 / 3334 / 3335 confirmed in
  each `serve.js`. Trunk is `curb-offset-draw`; `.github/workflows/staging.yml` exists.
- **"The Ward" appears in no older doc** — only `ORIENTATION.md` (+ one untracked root file written today).
- **Extent as-built details** — `makeCircleBoundary(radius, center = [0,0])` at `serve.js:616`; commit path
  passes `discCenter` (`:1459`); rescope now preserves it (`:1619`); client short-circuit
  `if (committed) return { x: 0, z: 0 }` at `ExtentApp.jsx:1145` — all exact.
- **ExtentApp "~730 lines" is self-flagged stale** — actual 2169. (Doc already says so; not reported as a defect.)
- **`.claude/worktrees/` is the worktree home** — one present (`pipeline-repro`); no Desktop siblings.
- **`scratch/` "200+ probes"** — 1171 entries. Understated, not wrong.
- **`corners.{outer,apex,stub}`** (minus `all`) **do** exist and are built at `derive.js:3978,4074-4133`.

---

## UNVERIFIABLE

**(a) Not checkable as written — no test exists.** Most of the doctrine layer, and that is fine, *except*
where it is dressed as a verified fact. Flagged instances:
- `ORIENTATION`: "Aesthetics and performance are co-equal and non-negotiable"; "the override is the product";
  "a neighborhood is a collection of buildings connected by people-run accounts."
- `README` WALL row: "⭐ **these gates do not predict the eye**" — an anti-metric claim with, by construction,
  no metric. It is the single most consequential sentence in my cluster and it reduces to Jacob's judgement.
  ⚠️ That is a finding in itself: the corpus now records a *reason to distrust every green probe in that row*,
  and nothing downstream can re-derive it.
- `ARCHITECTURE` §Extent: the SHOWN/ACTIVATED tri-state and the "coordinator inference" beneath it are
  explicitly labelled untested — correctly labelled, no action.

**(b) Checkable, but I lacked the means (bounded by the brief's no-pours/no-bakes rule):**
- "The committed `ribbons.json` does not reproduce from a fresh `pipeline.js` run (233 vs 228 junction nodes)"
  — requires running the pipeline over the committed artifact. I confirmed the committed side (233 nodes) only.
- Every reverted-branch measurement in the README WALL / Dead-ends rows (slits 50→9, blocks 101→101, junction
  band 101→110, spurs 43/52→45/52) — the artifacts they were measured on were restored by `7b5b87a3`.
- Altadena figures (26.3M tris / 457 MB / 88 min; 180 s → 18 s load; "first hood poured fully end-to-end").
- All eye-verdict claims ("the eye said WORSE on both scenes"), by definition.
- `ls/` and `arborist/`-side claims quoted by ORIENTATION (module manifest behaviour, the 80 park lamps) —
  out of cluster; left to sweepers 5/6.

---

## ONE HOUSEKEEPING NOTE (not a doc claim)

`PIPELINE-CLAIMS.md` (15.6 KB) sits **untracked at the repo root**, written today 12:40. I did not open it
(brief §3: sweepers must not read each other). Flagging only because (a) it is a stray root file under
`CLAUDE.md`'s "no stray folders/files" rule, and (b) if it is another sweeper's deliverable it is in the wrong
place — the brief specifies `scratch/doc-sweep-<N>-<name>.md`.
