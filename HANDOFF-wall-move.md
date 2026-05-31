# HANDOFF — The Wall-Move ("the Skeleton is the First Bake")

**Status:** SCOPING / brief-zero (DRAFT for Jacob to shape — this is "the project," not a one-shot ticket). **Author:** Boz, 2026-05-31.
**Reads first:** `HANDOFF-chain-consumer-census.md` (Plumb — the dependency map; this brief is its execution plan), `cartograph/PIPELINE.md §Wall`, `cartograph/RIBBONS.md §1`. Memory: [[project_two_bakes_two_walls]], [[project_skeleton_is_the_first_bake]], [[project_ribbon_three_representations]].

---

## The goal, in one sentence

Run figure-ground + corner rounding + per-edge measure resolution **once, at Survey-exit, as "the First Bake,"** freeze the result by value, and make every downstream consumer (Stage / Preview / production bake) read **that frozen artifact and zero chains.**

## ⭐ THE EVENTUAL PICTURE — Feature Restoration Ledger (the definition of done)

We are deliberately accepting a period of **severe regression** during this arc (Jacob, 2026-05-31: "we can accept a period of severe regression — but we're expecting all of these features to return"). This ledger is the blueprint Boz holds so the breakage stays *temporary*. **The governing invariant is WYSIWYG: the render shows what the authoring tools show, across all four surfaces — authoring handles ↔ live preview ↔ committed bake ↔ production.** No row is marked ✅ RESTORED until **Jacob's eye confirms it in the real app** ([[feedback_proxy_render_is_not_the_operator_eye]]). The arc is not done until every row is green.

| # | Feature (eventual behavior) | Status (2026-05-31) | Restored by |
|---|---|---|---|
| F1 | **Ribbon band widths** — drag sidewalk/treelawn/pavement handle → bands render to match, live + bake | 🔴 BROKEN (bands don't follow the edit; polygon does) | live-band fix (current) + W2/W3 freeze |
| F2 | **Block silhouette / polygon shape** — drag curb → block reshapes | 🟢 WORKING (must stay working) | hold through arc |
| F3 | **Corner rounding** — per-corner radius (gold dots), per-IX, global scale → corners round to match | 🟠 REGRESSED by W1 | corner-regression fix (current) |
| F4 | **Customs stick (no drift)** — edits persist + render, keyed by chain-anchored identity | 🟡 storage FIXED (W1); live application BROKEN | live-band fix + W2 |
| F5 | **Per-block land-use coloring** — treelawn tinted per parcel LU | 🟢 was working — WATCH it stays | hold through arc |
| F6 | **Per-leg material swap** (LU↔SW, V1.5) | ⚪ unverified — must return | verify; W3 |
| F7 | **The four representations agree** (handles ↔ live preview ↔ bake ↔ production) — the WYSIWYG invariant itself | 🔴 BROKEN (they diverge) | the whole arc — this IS the purpose |
| F8 | **LS at visual parity with toy** | 🔴 BROKEN (LS ~0%) | W5 (LS bring-across, post-wall) |
| F9 | **Dead-end / endpoint caps** | ⏸ deferred (H3, stubbed) | separate dead-end-typology arc |
| F10 | **Stage / Preview / production render = authored** (downstream consumes the frozen artifact) | ⚪ to-verify post-wall | W3 + W5 |

**How we use this ledger:** every W-phase closes by re-checking the affected rows against Jacob's eye and updating status here. `FEATURES.md` (the Reference doc) tracks *current reality* and must never claim a row works before it does (stale-label rule); this ledger tracks the *target*. When all rows are 🟢, the wall-move is done and the ledger retires into `FEATURES.md`.

## Why now — the three convergent arguments

1. **The standing debt** ([[project_skeleton_is_the_first_bake]]): chains read too late cause nearly every "back to the drawing board" moment. The wall-move pays it down structurally.
2. **The reliability win** (census §2): freezing the polygon **kills the `blockKey` rounded-vs-sharp + pass1-vs-pass2 drift fault class outright** — the single biggest reliability gain available. The two-pass re-emit machine + carry-forward join evaporate.
3. **WYSIWYG** ([[project_ribbon_three_representations]]): a ribbon today has **three representations** (authoring handles / live preview / committed render) that drift apart — *that drift IS Jacob's "the render doesn't match the authoring tools."* The wall-move collapses them toward **one frozen source of truth**. **Success metric for the whole arc: the render shows what the authoring tools show.** Not "geometry abstractly right" — operator-eye WYSIWYG ([[feedback_proxy_render_is_not_the_operator_eye]]).

## Validation surface: TOY-FIRST, always

Build and prove every step on **toy** — the spike surface ([[feedback_toy_is_the_construction_spike_surface]]); it renders correctly and authoring works there. LS is an **open post-wall question**, not a build-time gate (LS is currently broken on the pre-wall architecture — see `HANDOFF-ls-bespoke-corners.md`; do NOT use it as a correctness oracle). LS gets re-baked + re-evaluated through the production render path *after* the wall lands.
**Bake reminder** ([[feedback_bake_ground_scene_clobbers_default_look]], corrected): unflagged `node cartograph/bake-ground.js` bakes **LS only**; toy needs **both** `--scene=toy --look=toy`.

---

## What "The First Bake" must PRODUCE (the frozen artifact — census §1)

Freeze, **by value**, so nothing downstream needs a chain:

1. **`blockRounded[]` + `arcMeta[]`** — rounded block polygons + per-vertex corner identity / `arcPositionFrac`. The central artifact; `asphaltRounded`, `curbBands`, LU clips all derive from it chain-free.
2. **Per-edge `fe` records with `measure` baked in** — `{points, stable-block-id, edgeOrd, owner-id, side, measure:{pavementHW, treelawn, sidewalk, terminal, curb, materials:{outer,inner}}}`. The cheap, proven half (`bakeFeScalars` already does this internally — it just needs to *persist*). ⚠️ must absorb `segmentMeasures` + `couplers` (H6).
3. **Corner records, by value** — `{Vc, V, theta, d_min, R (resolved post-override + post-scale), T_A, T_B, swCornerDepth, flankingFes as frozen ids}`. The hard geometry (H5).
4. **Per-span fe ownership** — which fe owns each span of each rounded ring, so the P10 `probeFeForRun` chain fallback never runs.
5. **Asphalt + caps with material tags** — per-chain `asphaltRings` + round-cap rings, each tagged `highway`|`asphalt` so bake-ground's `streets[chainIdx].highway` read retires (H2).
6. **The fillet residual** — pre-attributed per-corner fillet polygons (or the `perChainAsphalt` union). The one piece `blockRounded` alone **cannot** regenerate (H1).
7. **A stable cross-reference id scheme** — block ↔ fe ↔ corner ↔ span by explicit ids, replacing `blockKey` / ring-index-parity joins (H4).

`stencil` + `ribbons.faces[]` (parcels) are already non-chain — pass through unchanged.

## What ELIMINATES (the payoff)

- The entire **pass-1/pass-2 two-pass emit + blockKey carry-forward** → the drift fault class **dies**.
- `probeFeForRun` adjacency fallback → frozen per-span fe ownership.
- bake-ground highway re-lookup → frozen per-ring material tag.
- `resolveIxRef` stale-ix matching + `intersections[].ix` fallback → corners frozen by value.
- ring-index-parity workaround → explicit ids (artifact #7).

## What stays SURVEY-TOOL-ONLY (the sanctioned exception)

The chain reads that live **inside the Survey authoring tool** forever — they author + preview, never feed the downstream slab: the live `buildBlockGeometryV2` (#26), the whole `buildChainBandsLive` preview path, the corner-radius kit (`R_authored` / `cornerRadiusScale`), and the Measure affordances. The First Bake **is** the thing the Survey tool pours on every shape/corner edit (H5 — it re-pours, block-locally, on each edit; re-bake is block-local + verified independent).

---

## The 6 HARD residuals — where the real difficulty lives (census §4)

- **H1 — fillet residual needs the per-chain asphalt rectangles** `blockRounded` threw away. Freeze the **pre-attributed fillet rings + `cornerOrphanAsphalt`** directly onto corner/orphan records (recommended path (a)).
- **H2 — `byChain.asphaltRings` carries chain *identity* past the wall twice** (fillet + highway routing). Asphalt artifact must be richer than one merged polygon — tagged by material + grouped enough to compute the fillet.
- **H3 — chain-endpoint round caps have no fe** (the Dead-end/Spike typology). Least-settled corner of the artifact; couples to `HANDOFF-dead-end-typology`. Needs a Survey authoring model for endpoint type (Spike / Stub-with-cap / Stub-no-cap).
- **H4 — identity scheme** (subsumes the LS-customs finding). Assign explicit stable ids at First-Bake time; **migrate `blockCustoms` keying off `(blockKey, edgeOrd)` onto them.** ⚠️ This is also where **LS's two-regime customs graveyard gets cleaned/migrated** (`HANDOFF-ls-bespoke-corners.md` §LS-blockCustoms) — LS never got V1.6's cleanup. Get H4 wrong and the artifact reintroduces the exact drift the wall-move exists to kill.
- **H5 — corner geometry is irreducible + R-coupled.** Must run in the First Bake (cannot eliminate); re-pours on R-change. The artifact is frozen *relative to a Survey state*, re-poured when Survey changes — block-locally.
- **H6 — `segmentMeasures` / `couplers` coverage gap** in the metadata freeze. Inert on toy; **LS unknown — audit before relying on per-fe measure as SSOT.** Adjacent to [[feedback_customs_resolver_wholesale_not_merge]].

## Free wins to fold in (census §N)

- Delete dead `chainPavementRing` (N1) + `buildFrontageBands` (N2) — the C5 sweep that was deferred.
- Delete the legacy LS emitters (`silhouetteStraightEmitter`, `buildFrontageBandsV2`) — also the deferred C5 Commit 3, safe to do once the First Bake replaces them.

---

## Design decisions (Jacob + Boz, 2026-05-31)

**✅ Q2 — the id scheme (H4): CHAIN-ANCHORED IDENTITY.** Key customs + all cross-links off the *stable authored input*, not the derived block. Ribbon fes → `(skelId, side, segOrd)`; corners → `(ixPoint, sorted leg-keys)` — *the scheme `CornerEditHandles` already uses, and why corners work while ribbons drift.* The block becomes an **ephemeral computed grouping** the First Bake recalculates each pour — never a stored key. `blockKey` is retired *as a key* (the polygon it named is kept — it's the frozen geometry). **Rationale:** the chain *name* is metadata (freezes trivially as a label, like the measure); the chain *geometry* is what dies at the wall — so chain-anchored identity is fully consistent with the wall-move (it's the metadata half), and it's what makes the freeze deliver WYSIWYG instead of freezing the drift in place. **Contract:** customs hold under width/shape edits; invalidate only under *topology* edits (add/remove IX, split chain) — rare, deliberate, and legible (streets are stable + mostly additive). See NOTES 2026-05-31 for the full reasoning.

**✅ Q4 — LS customs: CLEAN-SLATE.** Clear LS `blockCustoms` → `{}`; LS falls back to pipeline-derived per-fe measure (toy's proven V1.6 baseline), re-author forward on the stable scheme. **Rationale:** both legacy regimes (integer/per-side + coordinate/per-fe) are keyed by the scheme we're abandoning and aren't rendering correctly anyway — there's no working authoring to preserve, and migrating the coordinate keys would mean running the drift-match we're abolishing. No migrator; just a wipe.

## Open design questions — provisional leans (not gating the first sub-brief)

1. **Where does the First Bake physically live?** (persisted on-disk slab vs in-memory freeze the Designer holds vs the existing bake promoted to SSOT). *Lean:* in-memory freeze at Survey-exit that can also persist to the slab — but this gates W3 (geometry freeze), not the identity keystone below, so defer the call.
3. **Dead-end typology (H3)** — *Lean:* **stub it** — freeze caps as-is, defer the Spike/Stub authoring UI to its own arc (`HANDOFF-dead-end-typology`). Don't expand this arc's scope.
5. **Survey · Section · Stage rename** — *Lean:* **separate follow-on.** Stale-label rule holds; don't rename mid-arc.

## Decomposition (revised post-decisions)

- **W1 — THE IDENTITY KEYSTONE** *(first; the linchpin — Q2 + Q4 fused).* Replace `blockKey`-based customs keying with chain-anchored `(skelId, side, segOrd)` across **all three representations** (store/`MeasureOverlay` write · `bakeFeScalars`/emitter read · `buildChainBandsLive` preview), unifying them on one stable key. Clean-slate LS `blockCustoms`. **Delivers an early, visible WYSIWYG win** (edits stop drifting → render follows the handles) AND validates the keystone in code before the heavy geometry freeze builds on it. Toy-first (no regression), then confirm LS edits-now-render through the production path. See `HANDOFF-wall-W1-identity.md`.
- **W2 — metadata freeze**: persist `bakeFeScalars`' per-fe `measure` as the frozen artifact, keyed by the W1 identity; downstream reads the attribute. (Folds in once W1 lands.)
- **W3 — geometry freeze**: `blockRounded` + corner records + per-span ownership + fillet (H1) + asphalt tags (H2), frozen by value; downstream consults zero chains. (Gated on Q1.)
- **W4 — eliminate**: delete the two-pass machine, `probeFeForRun`, highway re-lookup, ring-index parity, legacy emitters + dead fns.
- **W5 — LS bring-across**: re-bake LS on the post-wall architecture, evaluate through the production render path (Jacob's eye), re-catalog the surviving Axis-C riff-raff.

## Boundaries / doctrine

- Toy-first; LS is a post-wall gate, not a build oracle. Operator-eye is the visual authority; no proxy-render claims ([[feedback_proxy_render_is_not_the_operator_eye]]).
- No new emit clamps ([[feedback_no_corner_radius_clamps_in_emit]]). No Survey/Section/Stage renames until built (stale-label rule).
- Canonical docs (quintet, BOZ.md, this HANDOFF, RIBBONS) are Boz/operator-owned — agents report back, check in at seams.
- Verify edits applied before trusting output ([[feedback_verify_edits_applied_before_trusting_output]]); render real before/after ([[feedback_render_guard_against_real_data_not_synthetic]]).
