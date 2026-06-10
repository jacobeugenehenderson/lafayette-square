> 📦 **ARCHIVED 2026-06-10.** A pre-build forensic census (Stratum, 2026-06-03) that proved Section was a *wiring* job, not a from-scratch build — and set the build direction. **Section is now built** (`SECTION.md` v0.3 is the live SSOT). Kept for the forensic trail; do not read it as current state — its D1 (per-fe dropped), §3.3 "dispatch target," and most of the §6 gap list are **resolved in code**. The two enduring pieces — the still-open FILL tail (perf/D6d, cap-wrap G8, thorns G12, delete figure-ground T4) and the SHAPE/FILL defect-attribution frame — are folded into `SECTION.md §7`.

---

# SECTION-CENSUS — the Measure→Section tool, forensically mapped

**A State/forensic doc** (the `RENDER-PATH-CENSUS.md` precedent). Read-only census of the cartograph **Section** tool (the FILL tool; today's "Measure" surface) **before** it gets built/consolidated. Measures the tool-as-it-exists against the 3-S doctrine target: **Survey = SHAPE · Section = FILL · Stage = LOOK** (`ARCHITECTURE.md §2.1`).

**Authored by Stratum, 2026-06-03.** Forensic specialist (Vesalius / Plumb lineage). No code touched. Sources: `MeasurePanel.jsx` · `MeasureOverlay.jsx` · `measureModel.js` · `buildBlockGeometryV2.js` (figure-ground) · `tileGround.js` (the live construction) · `useCartographStore.js` · `HANDOFF-survey-section-tool-design.md` · `HANDOFF-tile-feature-ledger.md` · RIBBONS.md §1/§3.9a/§5/§6.9.

> 🔄 **UPDATE 2026-06-07 — read `SECTION.md` (v0.2) first; it is now the SSOT model.** Since this census: the **best-effort fill** landed (treelawn Y/N gleaned + ADA depths — `SECTION.md §3.1`), the **material override** landed live off the frozen silhouette (`§3.2`), and **D1 is resolved** — not "accept the average vs thread per-fe," but *populate best-effort, then override per-edge* (`§3.3`, the dispatch target: per-edge depth + divider + corner = `cw + max-adjacent`, built to `RIBBONS §3.9a` step 10). The defect catalogue (§4) + the wall audit (§2) below stand; the *resolution path* now lives in SECTION.md.

> **The single most important finding, up front:** the doctrine-target Section FILL construction **already exists** — `tileGround.js:sectionPass` (line 487). It strokes ped strips **inward off the FROZEN per-tile shape**, and is **structurally chain-incapable** (no lexical handle on the chain graph — the wall is enforced by closure, line 480-486). Section is **not a from-scratch build; it is wiring an authoring surface onto a construction that already obeys the wall.** The current "Measure" *authoring* surface, by contrast, still runs on the **dying figure-ground path** and reaches the live chain in several places — and **its two main authored values (treelawn/sidewalk per-fe) are silently dropped before they reach the tile render.** That disconnect, not the wall, is Section's real build problem.

---

## 0. The target rubric (from the brief — what the census measures against)

**Section = FILL.** Reads the **frozen Survey hardscape** (curb edge / asphalt silhouette). Strokes **ped ribbons INWARD** from that frozen edge. Authors: **ped widths** (treelawn / sidewalk), **ribbon corner FILLS**, **ADA pads**, **caps (ped wrap)**. Freezes → the **ground bake** (wall #2 → Stage).

**The line that resolves the defects:** corner **SHAPE** (how round the curb silhouette is) = **Survey** (frozen input, NOT Section's job). Corner **FILL** (how the ped ribbons bend around it — bent rectangles, ADA pad) = **Section**. Every defect attributes to one side.

---

## 1. Current-Measure inventory — the tool as it exists

### 1.1 The three surfaces

| Surface | File | Role |
|---|---|---|
| **Panel** | `src/cartograph/MeasurePanel.jsx` | Numeric cross-section editor. Per-side rows: **Curb · Treelawn · Sidewalk** (asphalt width row *removed* — "authored in Survey", L110-112). Asymmetric toggle, whole-chain/per-block ModeToggle, reset/wipe customs. |
| **Overlay** | `src/cartograph/MeasureOverlay.jsx` | On-canvas interaction. Royal-blue clickable centerlines; **2 draggable ped handles per side** (`treelawnOuter`, `propertyLine`); ctrl/right-click strip → LU↔SW material flip. The `pavementHW` (asphalt-edge) handle is **gone from Measure** (moved to Survey; kept read-only as the reference the ped bands position off — L146-151). |
| **Model** | `src/cartograph/measureModel.js` | Shared pure helpers: `chainMeasure` (seed), `findFeForSide` / `feesForChainSide` (fe resolution), `applyKindToMeasure` (drag math). |

### 1.2 The handles & what each authors

RIBBONS §5 "up to 3 handles per side" — **Measure now shows only 2** (the split already started, per the design handoff):

| Handle | `kind` | Authors | Owner today | Doctrine owner |
|---|---|---|---|---|
| asphalt-edge | `pavementHW` | asphalt half-width | **Survey** (removed from Measure) | Survey (SHAPE) ✅ already split |
| treelawn-outer | `treelawnOuter` | treelawn depth (splits the tl/sw total) | Measure | **Section (FILL)** |
| property-line | `propertyLine` | sidewalk depth | Measure | **Section (FILL)** |

`applyKindToMeasure` (`measureModel.js:104`) is the pure drag math: `treelawnOuter` re-splits the (tl+sw) total around the dragged radius; `propertyLine` sets sidewalk = `r − inner`. Clamps: `MAX_STRIPE=20`, `STRIPE_MIN=1.0`, `MAX_PAVEMENT_HW=30`.

### 1.3 Where the data lands

- **Write target:** `design.blockCustoms[skelId][side][segOrd] = { pavementHW, treelawn, sidewalk, curb, terminal, materials }` — keyed by the fe's chain-anchored identity via `feCustomKey` (`src/lib/feCustomKey.js`).
- **Store actions:** `writeBlockEdgeCustoms(entries)` (`useCartographStore.js:595`) batches `{fe, measure}` writes → one `set` → `_saveDesignDebounced()` → `design.json`. `clearBlockEdgeCustomsForChain(streetIdx)` (`:628`) wipes a chain's customs.
- **Mode = selection scope, not write scope** (the post-couplers doctrine, MeasurePanel L268-273): whole-chain fans a per-fe write across `feesForChainSide`; per-block writes the one fe at the click anchor. **No path writes `chain.measure`** — that stays a READ-only inherited default. This part of the doctrine is **clean**.

### 1.4 The render/bake paths (TWO live constructions, coexisting)

| Path | Function | File:line | Reads | Status |
|---|---|---|---|---|
| **Tile render (LIVE, the real map)** | `buildTileGround` → `sectionPass` | `tileGround.js:591` / `:487` | frozen per-tile shape + `blockCustoms.pavementHW` only | **the doctrine-target construction; what LS actually shows** |
| Tile bake | `buildTileGround({emitArtifact:true})` | `bake-ground.js:289` | same | live==bake (G11 ✅) |
| Figure-ground full (DYING) | `buildBlockGeometryV2` → `emitBlockRingBands` | `buildBlockGeometryV2.js:2541` / `:2316` | frozen `ribbons.streets[].points` + `blockCustoms` | **meshes early-return; still COMPUTED to feed the authoring overlays** |
| Figure-ground live-drag (DYING) | `buildChainBandsLive` | `buildBlockGeometryV2.js:3163` | **live `chain.points`** + `chain.measure` + `blockCustoms` | the ~1ms drag preview; feeds legacy overlays only |
| Figure-ground bake (DYING) | `buildBlockGeometryV2` | `bake-ground.js:322` | frozen ribbons | superseded by tile bake |

**Coexistence (the A-note, ledger L59):** `BlockGeometryV2Debug.jsx` mounts BOTH — `buildBlockGeometryV2` (L404, figure-ground, for the Measure/Corner overlays) AND `buildTileGround` (L605, the visible tiles). The figure-ground *meshes* early-return (L250-253) but the build still runs every Designer frame — a real perf drag AND the reason the authoring tools (handles/translucency/strip-swap) misbehave: **they author against figure-ground while tiles render.** T3/T4 retire this.

---

## 2. Wall-compliance audit — THE key question

**Two answers, because there are two surfaces.**

### 2.1 The CONSTRUCTION already passes the wall ✅ (the architectural win)

`tileGround.js:sectionPass(shapeTiles, cw, stripMat)` is the option-B deep wall, **achieved**:

> *"Its parameters carry ONLY the artifact (shapeTiles) + design params (cw, stripMat) — there is NO lexical handle on the chain graph (streets / streetsOrig / measures / centerlineData / ribbons), so it CANNOT reach back. That impossibility is the wall."* (`tileGround.js:480-486`)

The shape pass (Phase A, `:822`) freezes per-tile `{ring, iA, vertR, tl, sw, lu, runs, bandJoin, cap, roundTips, bluntTips}`; `sectionPass` (Phase B) strokes the ped strips off that frozen `iA` via concentric `offsetRings` and Clipper differences. **This is the doctrine-target FILL, running today, chain-incapable by closure.** Section's construction is done; it needs an authoring front-end.

### 2.2 The AUTHORING surface reaches the chain — every site

These all live on the **figure-ground** authoring layer (the dying path T3 migrates). Classified **(a) READ-only seed/handle-placement** vs **(b) geometry-driving consume**:

| # | Site | file:line | Reads | Class |
|---|---|---|---|---|
| W1 | `measureModel.js` imports `ribbons.json` + `toy-ribbons.json` → `PIPELINE_MEASURE` | `measureModel.js:16-17, 34-44` | scene fixtures (the scene-blind pattern, but here disjoint-keyed & READ-only — `[[feedback_scene_blind_fixture_latent_fault]]` mitigated) | **(a) seed** |
| W2 | `chainMeasure(st)` cascade `st.measure → PIPELINE_MEASURE → type default` | `measureModel.js:49-62` | chain-level measure | **(a) seed** — the handle-placement fallback after "reset neighborhood" |
| W3 | Overlay handle seed `chainMeasure(st)` | `MeasureOverlay.jsx:316-321` | chain measure | **(a) seed** |
| W4 | Drag-write seed `innerEdgeMeasure(chainMeasure(st), …)` | `MeasureOverlay.jsx:423-426` | chain measure → seeds the per-fe write | **(a) seed-of-a-write** (the *write* is the geometry driver, lands in blockCustoms) |
| W5 | Material-flip seed | `MeasureOverlay.jsx:603, 644-645` | `st.measure?.[side]` | **(a) seed** |
| W6 | `buildChainBandsLive(chain, …)` live-drag preview | `buildBlockGeometryV2.js:3181-3219` | **live `chain.points` + `chain.measure`** | **(b) consume** — but feeds the *figure-ground* overlay, not the tile render |
| W7 | `naturalSegmentOrdinal` fallback to `street.intersections[].ix` | `MeasureOverlay.jsx:184-201` | live chain intersections | **(b) latent** — never fires today (`ixSet` always passed at L301/441/597); a stale-data trap to delete, not a live bug |
| W8 | `CornerEditHandles` gates corner existence + Q-geometry on `chain.measure.pavementHW` | `CornerEditHandles.jsx:157-158, 168-169` | live chain measure | **(b) consume** — *Survey's* corner-SHAPE editor, but currently chain-driven (SHAPE-side, noted for Survey) |

**Verdict:** The authoring reach-backs W1-W5 are **READ-only seeds** (handle placement / write-seeding) — they don't drive the rendered polygon; the tile render ignores them. W6/W8 are real geometry consumes but on the **figure-ground overlay** that T3 deletes. **No reach-back blocks Section from being chain-incapable** — the construction already is; the seeds get re-pointed at the frozen artifact when the handles migrate onto tiles. **W7 should just be deleted** (dead fallback).

---

## 3. Three-representations drift — WYSIWYG audit

The ribbon's three representations (`[[project_ribbon_three_representations]]`): authoring handles / live preview / committed bake. On Section they **diverge hard** because the authoring + live-preview live on figure-ground while the bake+render moved to tiles.

| # | Divergence | Detail | Severity |
|---|---|---|---|
| **D1** ⭐ | **Per-fe treelawn/sidewalk authored → DROPPED before the tile render** | `MeasurePanel`/handles write `blockCustoms[…].treelawn/.sidewalk` per-fe. `tileGround.runMeasure` reads **only `pavementHW`** from customs (`:657-664`); ped depths come from **`repDepth` = a per-tile AVERAGE of the per-chain base measure** (`:778-786`, `:875-876`). So a ped-width drag is dropped **twice**: per-fe→per-chain, then per-chain→tile-average. **Deliberate** (the concentric-corner trade, comment `:775-777` + ledger **G2** ⚠️), but it means **the two handles Measure still owns are largely WYSIWYG-void on the live map.** | **HEADLINE** |
| D2 | **Live drag preview ≠ render** | `buildChainBandsLive` paints figure-ground rect bands off the live centerline during a drag; the tile render rebuilds via `sectionPass` on release. Two different constructions → drag-preview-vs-bake mismatch by design. (`[[feedback_live_drag_preview_migrates_with_main_emitter]]` — the live path never migrated to tiles.) | High |
| D3 | **No tile live-drag fast path** | Tiles have no `buildChainBandsLive` equivalent; every `blockCustoms` edit triggers a full `buildTileGround` (Clipper over all tiles, 250ms-debounced, `BlockGeometryV2Debug.jsx:604`). The "Section drags are live and cheap because they stroke a frozen edge" promise (design handoff §18) is **not yet realized** — `sectionPass` is cheap but isn't wired to a per-edge incremental drag. | Med |
| D4 | per-side ped width **uniformized at corners** | ledger **G2**: per-edge on straights, per-block-average at corners. The `repDepth` averaging. Matches the mono-ped spirit; deferred unless Jacob's eye flags it. | Low (accepted) |
| D5 | strip-material swap (M3) | `materials:{outer,inner}` is data-driven through `stripMat` in `sectionPass` (`:578-585`) — **ready**, but the ctrl-click *gesture* still lands on the figure-ground overlay (M3-gesture = T3). Authoring↔render disconnect until migrated. | Med |

---

## 4. Defect catalogue + SHAPE/FILL attribution (the prize)

Every visible defect (from the ledger + the recent images + RIBBONS open fronts), classified **SHAPE** (Survey — frozen input, out of Section's scope), **FILL** (Section's job), or **TBD-with-Survey** (hinges on the unsettled frozen contract).

| Defect | What's seen | Attribution | Note |
|---|---|---|---|
| **Square R=0 corners broken** | R=0 ADA ramps don't square cleanly | **SHAPE** (Survey) | Corner-R is the curb silhouette round; jtMiter pass-through. The FILL inherits it. ([[project_f3_corner_editor]] "square R=0" open.) |
| **Corners slider doesn't reshape (A2)** | dragging global Corners does nothing live | **SHAPE** (Survey) | Authoring-channel-on-figure-ground; T3/Survey wires it. Not Section. |
| **ADA tangent weirdness (G5)** | the tA/tB treelawn→all-SW transition glitches | **FILL** (Section) | **Construction defect in `sectionPass` itself** (the `tlSlabs`/`zone`/`cornerPad` clip, `tileGround.js:515-550`). Ledger: "authoring tools will NOT fix it — a real G5 residual." **Section's to fix.** |
| **Corner comes to a point / no ramp** | inner sidewalk arc collapses to a point | **FILL** (Section) | The `cornerPad = differenceRings(differenceRings(iC,iW), zone)` must stay a SOLID all-SW pad (RIBBONS §6.9). Section construction. |
| **"Thorns" on thin tiles (G12)** | ~100 thin loops/medians/slivers sprout spurs | **FILL** (Section) | Capacity guard exists in figure-ground, **NOT ported to `sectionPass`'s inward offsets**. The `cap` clamp is partly there (`:503`) but G12 says the general per-tile guard isn't complete. **Section's to finish.** ⛔ not a corner-R clamp. |
| **Exterior roads stop short (G9)** | whole outer street-arms have no asphalt | **SHAPE** (Survey) | Asphalt comes from a tile's grout strip; exterior streets lack an outer tile. Survey/shape-pass fix (DCEL outer face). Not Section. |
| **Median treelawn sliver (G3a)** | residual treelawn in divided medians | **SHAPE** (Survey) ✅ fixed | Was the global side-convention bug (`84e6bd3`); median zero-ped is a shape/anchor fact. Resolved. |
| **Per-fe ped widths have no effect (D1)** | dragging treelawn/sidewalk barely moves the map | **FILL** (Section) | The headline drift; Section-wiring decision (accept the tile trade, or thread per-fe into `repDepth`). |
| **Dead-end cap ped wrap (G8)** | round vs blunt cap | **SHAPE** for the asphalt cap typology (Survey/`capEnds`) · **FILL** for the ped wrap | Split defect: the cap *shape* is Survey; the treelawn-wraps-the-round-cap vs all-SW-blunt ped behavior is `sectionPass` (`:535-561`) = Section. |
| **Translucency "messed up" (A9)** | selected-chain focus wrong | **neither — shared grammar** | RIBBONS §5 by-design; rebuild on tiles in T3. ⚠️ misdiagnosed-as-bug before; not a Section construction defect. |
| **Strip LU↔SW swap not live (M3)** | ctrl-click flip no-ops on render | **FILL** (Section) | Data path ready (`stripMat`); gesture must move onto tiles. |

**SHAPE / FILL tally:** 5 SHAPE (Survey: R=0, A2 slider, exterior G9, median G3a✅, cap typology) · 6 FILL (Section: ADA tangents, point-ramp, thorns/G12, per-fe drop D1, cap ped-wrap, strip-swap) · 1 shared (translucency) · 0 hard `TBD-with-Survey` blockers (the corner FILL defects depend on Survey *freezing a stable corner shape*, but each is independently characterizable now — see §5 seam).

---

## 5. The one open seam (scope guard)

Section's **input** is the frozen Survey artifact (`tileGround` Phase-A `shapeTiles` / the `_shapeArtifact`), and that schema is **still settling**. The live unsettled piece: **divided-pair station-overlap** (`HANDOFF-divided-pair-station-overlap.md`) — a Survey/SHAPE concern, part of getting Survey to 0. **Do not over-specify the frozen contract.** Everything in §§1-4 is stable-now (current Measure, the wall audit, the drift, the defect attribution). The precise frozen `shapeTiles` schema is the **single flagged TBD input** — when Survey freezes its corner shape differently, the FILL defects (ADA tangents, point-ramp) re-test against the new edge, but their *attribution to Section* doesn't change.

---

## 6. Gap list — the Section build backlog (ordered)

What Section must **gain / lose / fix** to become the doctrine-target FILL tool. This is the brief-after-this.

1. **Wire the authoring onto the tile construction (the core move).** Migrate the 2 ped handles (`treelawnOuter`, `propertyLine`) + the strip-swap gesture OFF the figure-ground overlay ONTO the frozen tile shape — the T3 authoring-channel migration. Re-point the W2-W5 seeds at the frozen artifact instead of `chain.measure`. *(Depends on: T3 channel; shared with Survey's handle migration.)*
2. **Resolve D1 — per-fe ped widths.** Decide & implement: either (a) accept the tile concentric-corner trade and **make the Panel/handles honest** (show/edit per-tile representative, drop the dead per-fe tl/sw fields), or (b) thread per-fe `treelawn/sidewalk` into `runMeasure`/`repDepth` so the authored value renders. **Jacob's call** — this is the WYSIWYG-vs-clean-corner tradeoff. Until resolved, the two handles Section owns don't WYSIWYG.
3. **Fix the FILL construction defects in `sectionPass`** (Section's own geometry, not authoring): **ADA tangents (G5)** · **point-ramp** (keep the corner pad a solid all-SW region) · **port the capacity guard (G12)** as a general per-tile clamp on the inward offsets (kills the ~100 thorns in one move). These are independent of the authoring migration and can start now.
4. **Caps ped-wrap (G8 FILL half).** Confirm/finish the round-cap-wraps-treelawn vs blunt-cap-all-SW behavior (`:535-561`) once Survey's cap *shape* selector is live.
5. **Strip-material swap live (M3-gesture).** Bring the ctrl-click LU↔SW flip into the Section surface against tiles (data path already ready via `stripMat`).
6. **Delete the dead figure-ground authoring layer (T4).** Once 1-5 land, remove `buildBlockGeometryV2`/`buildChainBandsLive` from the Designer mount — kills the per-frame figure-ground compute (perf) and deletes W6/W7/W8.
7. **Rename Measure → Section** (rides the stale-label rule; cosmetic, last).

**The shape of the work:** Section is **~70% built** — the construction (`sectionPass`) obeys the wall and renders today. The build is (i) **wiring** an authoring front-end onto it (gaps 1, 5), (ii) one **product decision** (gap 2, D1), and (iii) **finishing three FILL geometry defects** (gap 3). The wall is not the obstacle; the authoring-on-the-dying-path is.

---

*Provenance: Stratum, 2026-06-03. Read-only forensic census per `HANDOFF-section-census.md`. The doctrine-target rubric (§0) graduates to canon — OPERATIONS (the Section panel/knobs) + RIBBONS (the FILL construction) — when Section **builds**, per the per-touch gate, not before.*
