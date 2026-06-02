# PROGRAM BRIEF — The Reconceived Pipeline (one arc, four phases + cleanup)

**Status:** PROGRAM / brief-zero. **DRAFT — Boz for Jacob**, from the strategic session 2026-06-01.
This is the **umbrella** that sequences the whole arc. It **absorbs** two prior briefs as detail children:
- `HANDOFF-stroke-construction.md` — the *construction model* (the HOW: stroke out → union → complement → stroke in → defer collapse to Clipper). Still canonical for the geometry; this doc sequences it.
- `HANDOFF-wall-move.md` — the *decomposition* under the older incremental (W1–W5) framing. **Its sequencing is now subsumed here**; W1 (identity) already shipped and carries. Retire the wall-move brief to NOTES once Phase 3 lands.

**Reads first:** this doc → `HANDOFF-stroke-construction.md` → `cartograph/RIBBONS.md §1` + `cartograph/PIPELINE.md §Wall`. Memory: `[[project_skeleton_is_the_first_bake]]`, `[[project_two_bakes_two_walls]]`, `[[project_ribbon_three_representations]]`, `[[project_the_palimpsest_code_path_multiplicity]]`, `[[project_gather_to_center_construction_model]]`.

---

## The thesis (Jacob, 2026-06-01)

> "Troubleshooting the ribbons is a waste of time until we formalize the intake & skeleton and re-deploy the tool split with the reconceived flow. We're really just working with **rules** — get the rules right and the street draws right the first time, with nothing to troubleshoot."

The ribbon is broken because it is the *last link* in a chain whose first two links — a **formalized, visible frame** and the **reconceived Survey/Section tool split** — do not exist yet. We stop patching the last link and build the first two. This is the stroke-model and the wall-move, unified into one program.

**Three doctrines that govern the whole arc:**
1. **One pipeline, unflagged.** No `scene === 'toy'` branches, no dual emitters. A scene is a *dataset*, not a code path (`ARCHITECTURE §7`). The live `useRingBandEmitter` flag is itself the §7 violation that produced the "toy works / LS 0%" tax all session — it dies in this arc.
2. **LS-direct, Toy retired as the dev surface.** We build and eyeball on the real map. Toy stays in the tree but we stop developing around it — it was "a parallel thing that doesn't carry into the product" (Jacob). Map size is a red herring for *correctness* (the rules are map-invariant) and for *amount of work* (zero per-map labor). It costs only ~8s/bake of wall-clock and a denser edge-case surface — both worth paying to kill the divergence tax. (Overturns `[[feedback_toy_is_the_construction_spike_surface]]` — memory rewritten 2026-06-01.)
3. **WYSIWYG is the only success metric.** The three representations of a ribbon (authoring handles / live preview / committed bake — `[[project_ribbon_three_representations]]`) collapse to one. A phase is done only on **Jacob's eye, on the LS production path** — never a proxy render (`[[feedback_proxy_render_is_not_the_operator_eye]]`).

---

## Decisions locked (do not re-litigate)

- **Construction = stroke a path.** Survey strokes chains **outward** into frozen hardscape; Section strokes the complement **inward**; LU = remainder; **never compute the medial axis** — defer collapse to Clipper. (`HANDOFF-stroke-construction.md`.)
- **Section = full-flood, full-width ribbon — no internal ring.** (Jacob, today.) This *answers* stroke-brief open decisions #2 (LU meaning) and #3 (narrow-block rule): the ped strips flood to the remainder; there is no preserved inner-ring dataset.
- **`pavementHW` moves to Survey.** Footprint authored where you stroke the chain; Section authors only the ped profile. This is the hinge for the live-responsiveness win (Section inside-strokes a *frozen* edge). (Stroke-brief Open Decision #1 — resolved: yes.)
- **W1 chain-anchored fe identity** (`(skelId, side, segOrd)`, `src/lib/feCustomKey.js`) — ✅ shipped (`6b83798`), carries. The inward strokes hang on it.
- **Dead-ends included now** (no chain-tether; both the real-cap and edge-of-map cutoff cases absorbed by the stroke/complement). "Reads as two blocks" stays an explicit authoring mark, never auto-detected.
- **Rename Survey/Section/Stage rides with the arc** — name lands when behavior is true; no stale-label renames mid-flight.
- **Bake-target wiring fixed** (2026-06-01) — unflagged `bake-ground.js` → `lafayette-square`; missing-look bakes throw instead of writing a phantom. No more ghost evals.

**Still genuinely open** (decide at the phase that needs it, informed by what the prior phase shows):
- Smoothing-tension default + whether per-chain override ships at v1 (stroke-brief #4).
- Whether the protoslab freeze persists to disk as a new artifact or stays an in-memory freeze re-derived each bake (wall-move Q1 — lean in-memory + persist-to-slab).
- LS customs disposition: the clean-tree snapshot already trimmed `design.json` (−330 lines); confirm what remains is valid-new-shape before Phase 2 strokes over it. **Do not wipe reflexively** — last night's near-miss.

---

## Current-state truth (verified 2026-06-01, not from the handoff)

- **Frame enrichment is reverted out of the live tree, preserved in scratch.** Live `skeleton.js` (601 ln) runs the old junction-blind `simplify` (L375). The enriched versions — junction-aware `protectedKeys` simplify (79 Ts → 0), node typing, tags carried — are in `scratch/vesalius-skeleton-js-P1ENRICHED.js` (796 ln) + `scratch/vesalius-derive-js-P1ENRICHED.js` (3181 ln). **Not committed. Recoverable.**
- **The emitter already collapsed (~80%).** `useRingBandEmitter` is hardcoded `true` at every live site (`bake-ground.js:610`, `CartographApp.jsx:890`, `buildBlockGeometryV2.js:2907`). LS runs `emitBlockRingBands` (mono-width) today — so "LS broken wall-to-wall" is the *mono-width construction* failing on LS's real shape, which is precisely why we pivot. The legacy `silhouetteStraightEmitter` + `buildFrontageBandsV2` + dead `buildFrontageBands` still sit in the file as the dead else-branch.
- **`derive.js` is the two-source spine** (the palimpsest's structural seam): streets come from the **skeleton** (`skelStreets` L2316 → serializer L2899), but faces + intersections come from **raw OSM** (`osm.json` L1010). The serializer at L2899 (`ribbonStreets.map(st => …)`) is the whitelist that **strips enriched fields** — why P1 was invisible.

---

## The four phases + cleanup

> Altitude: each phase gives Goal / Build / Reuse / Retire / Gate. Per-phase mechanics live in a sub-brief Boz drafts when we reach it, informed by the prior phase's result. Phases gate on Jacob's eye; they do not all need to be in flight at once.

### Phase 1 — Formalize the Protobake (the First Bake) — TIGHT (boundary locked 2026-06-01)
**Goal:** the enriched skeleton is committed and is the canonical frame Survey consumes; take the street-shape improvements it gives for free. The "very nice clean data."
**Build:** (a) recover the enrichment from `scratch/vesalius-*-P1ENRICHED.js`; diff against live to confirm the delta is *purely* the enrichment (junction-aware simplify, node typing, tag-carry) and not entangled with reverted ribbon/customs work; re-apply to `skeleton.js`/`derive.js`; **commit**. (b) Widen the `derive.js` streets serializer (L2899 `ribbonStreets.map(st => ({…}))`) so enriched fields *survive* into `ribbons.json` (stop the strip — the data is now present, even before a consumer reads it).
**Boundary (TIGHT — do NOT cross in Phase 1):** do **not** rewire faces/intersections to read the frame — they stay raw-OSM-sourced until the Wall (Phase 3). Do **not** build a new frozen-artifact format — "freeze" here = the committed enriched frame *is* the stable input; the formal protoslab-artifact decision rides with intake/the Wall. Do **not** touch `design.json` customs.
**Reuse:** the enriched `simplify` (`protectedKeys`), the census collapse plan.
**Retire:** the junction-blind `simplify`; the two `derive.js` frame-thinness hacks (West-18th densify, LaSalle magic-coord) **only if** Dolman→18th resolves cleanly in-frame; else flag and leave.
**Gate:** the enriched frame renders visibly on LS — Dolman→18th correct, the 79 interior Ts present, node count sane. Frame-only A/B against the preserved old `skeleton.json`.

> **⟳ RE-POURED 2026-06-01 around the TILE model** (spike-validated, `HANDOFF-spike-pure-ribbon.md` + Tessera's report). The construction is no longer "stroke out / take complement / stroke in" — it's: **tiles = faces of the centerline graph; paint strips inward per tile (`asphalt | curb | treelawn | sidewalk | LU-flood`); round the strips, not the tile.** No figure-ground, no asphalt/block distinction, no complement boolean. Corners, the open/3-point edge cases, and figure-ground's whole bug class all dissolve into "inward-offset a graph face." The old stroke-out/Wall/Section phases (in git history of this file) are superseded by T1–T4 below. **Phase 1 (frame) is now revealed as the prerequisite** — face extraction needs the clean typed planar graph it built.

### T1 — Tile construction in the LIVE path (WYSIWYG, toy) — ✅ DISPATCHABLE NOW
**Goal:** the tile model renders in **both** the live Designer (`BlockGeometryV2Debug`) and the bake, identically, on toy — so Jacob gates WYSIWYG on his actual 3-D screen (the spike was bake-only → invisible in Design).
**Build:** promote `spike-pure-ribbon.js` from throwaway to a real module; wire into `BlockGeometryV2Debug` (live) + `bake-ground`; minimal uniform-inset (what the spike proved).
**Brief:** `HANDOFF-tile-T1-live-path.md`. **Agent: WARM → Tessera** (built the spike; this promotes it).
**Gate:** Jacob opens toy in Design → sees the tile model live, matching the bake.

### T2 — The real-work pieces (LS-direct, unflagged)
**Goal:** tiles correct on LS's real topology. The genuinely-new geometry work (Tessera's three flags).
**Build:** (a) **per-edge asymmetric widths** — each grout edge inset by *its own* side's widths (not one offset per tile); the divided-carriageway **median falls out** of this. (b) **Curb R authored independently** of inset depth (round at R, not at hw). (c) **Map-boundary + median edges tagged** so they sprout no asphalt — the DCEL already knows each edge's origin (free). Run **unflagged on LS**, iterate on Jacob's eye.
**Reuse:** Clipper inward-offset + difference; the R-kit at the strip level; the DCEL face-walk.
**Gate:** LS hardscape draws correctly — asymmetric widths, medians, clean boundary — Jacob's eye on LS production.

### T3 — Authoring in Survey (the tool migration)
**Goal:** author the tile params in Survey; retire them from Section (no detritus — `[[feedback_vestigial_ux_is_a_wall_violation]]`).
**Build:** per-edge width handles + corner-R controls live in `SurveyorPanel`/`SurveyorOverlay`, **removed** from `MeasurePanel`/`MeasureOverlay`. Same handles, same corner controls (Jacob confirmed) — the asphalt-edge handle now sets the tile-edge inset; R lands at the curb. (Absorbs the old "2b" migration.)
**Gate:** footprint + corner authoring in Survey; Section clean; WYSIWYG drag.

### T4 — Cleanup: delete figure-ground (the "not preserving prior work" license)
**Goal:** one construction; figure-ground gone; docs honest.
**Build:** with LS on tiles, **delete figure-ground wholesale** — `asphaltSharp`/`blockSharp`/`blockRounded`, the `emitChain` assembly, `silhouetteStraightEmitter`/`buildFrontageBandsV2`/`emitBlockRingBands`/`buildFrontageBands`, the two-pass machine, the `useRingBandEmitter` flag, the temporary toy/LS split, the `blockCustoms` graveyard. **Evidence before excision** (grep dead, don't delete-and-hope — `ARCHITECTURE §7`). Rewrite RIBBONS §1/§Ribbon + PIPELINE §Ribbon from figure-ground → tiles; close §6.8/6.9/6.10 *honestly*. Retire landed HANDOFFs to NOTES per `BOZ.md`.
**Gate:** one path frame→tiles→pixels; `RENDER-PATH-CENSUS` re-run clean; docs match code.

---

## Reuse inventory (the "retrofit, not whole cloth" anchors)

| Surface | Where | Role in the reconception |
|---|---|---|
| `emitChain` perp-offset | `buildBlockGeometryV2.js ~2620` | → "stroke out" (Survey) |
| `dilateRings` / `differenceRings` / `intersectRings` | `buildBlockGeometryV2.js` 2418 / 880 / 2433 | Clipper offset+boolean — carries everywhere |
| `applyRoundCornersToRing` + `defaultR` + `cornerRadiusOverrides` | `buildBlockGeometryV2.js` 716 / 215, `CornerEditHandles.jsx:201` | R kit → stroke join + AA |
| `feCustomKey` / `readFeCustom` | `src/lib/feCustomKey.js` 38 / 49 | W1 identity — the strokes hang on it |
| `triangulateAndRefine` | `bake-ground.js:441` | ring → triangles, carries |
| `buildChainBandsLive` | `buildBlockGeometryV2.js` (live path) | must migrate in lockstep at Phase 4 |
| enriched `simplify(…protectedKeys)` | `scratch/vesalius-skeleton-js-P1ENRICHED.js:385` | Phase 1 recovery target |

---

## Dispatch order + how Boz runs it

1. **Phase 1 (frame)** — ✅ DONE (`1f89b86`, Marrow). Now the face-extraction prerequisite.
2. **T1 now** — `HANDOFF-tile-T1-live-path.md`, **WARM → Tessera**. Gets the tile model into the live path so Jacob gates WYSIWYG on his screen. The first re-pour swing.
3. T2 → T3 dispatch **in sequence**, unflagged + LS-direct, each gated on Jacob's eye; Boz drafts the sub-brief at the seam, informed by the prior.
4. T4 cleanup is **closed at the end** (delete figure-ground + doc rewrite) — once LS is on tiles. Mark-dead-in-place until then (`ARCHITECTURE §7`); commit an untracked HANDOFF before retiring it (`BOZ.md`).

*Provenance: Boz, 2026-06-01, from Jacob's four-phase framing. Construction spec = `HANDOFF-stroke-construction.md`. This is a draft for Jacob to shape, not a canonical edit.*
