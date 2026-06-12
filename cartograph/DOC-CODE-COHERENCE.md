# Doc ↔ Code Coherence — the corpse-lie ledger

**State doc.** Tracks where the **docs and the code disagree** — so the two can be driven back into sync. The campaign rule (Jacob, 2026-06-05): **if a truth lives in only ONE place, that's a smell.** Code must reflect the docs; the docs must reflect the code.

> Sibling to `RENDER-PATH-CENSUS.md` / `_archive/SECTION-CENSUS-2026-06-03.md` (archived — Section is built) — the same census discipline, aimed at divergence. The deep "why": `[[project_the_palimpsest_code_path_multiplicity]]` (the code-side palimpsest). Method memory: `[[feedback_docs_effluvium_buried_the_answer]]`.

---

## The three divergence types

- **Corpse-lie** — code that *contradicts* an established truth: a stale comment, a dead path still mounted, a vestigial field/flag. Actively misleads (it has already misled agents this campaign). → **excise.**
- **Aspiration** — a truth that lives only in the docs (a target the code doesn't do yet). Not a lie *if marked* current-vs-target; a lie if presented as done. → **mark, don't assert.**
- **Landmine** — a truth that lives only in the code (undocumented). → **document it** (in the right topic-doc).

**How it's used:** each truth we land in a topic-doc, we hunt the contradicting code and log it here. **Identification happens in the doc phase; excision happens via specialist briefs at the code phase.** A row goes ✅ only when both places agree.

**Status legend:** 🔎 identified · 📝 brief-drafted · ✅ excised+synced · ⚠️ re-verify before trusting.

---

## Code corpse-lies (→ excise via briefs)

| # | Corpse-lie (code) | The truth it contradicts | Locus | Status |
|---|---|---|---|---|
| C1 | Header: *"TRANSITIONAL: wired for TOY only; LS stays on figure-ground… NOT a kept scene-flag"* | LS runs tiles unflagged (`isTileScene=true`) | `tileGround.js:6-10` | ✅ excised 2026-06-05 (`e3ec84a`, Lye) — header now states LS runs tiles unflagged |
| C2 | Import comment *"T1 — toy tiles (transitional)"* | same as C1 | `bake-ground.js:30` | ✅ excised 2026-06-05 (`e3ec84a`, Lye) |
| C3 | Figure-ground (`buildBlockGeometryV2`/`fbMemo`) **still computed every Designer frame** to feed overlays | tiles are the live path; this is dead + a per-frame perf drag | `BlockGeometryV2Debug.jsx` | 🔎 (T4 / authoring-migration first) |
| C4 | `buildBlockGeometryV2.js` + `cornersAtIx` — the whole dead module | the dead figure-ground path | `src/lib/buildBlockGeometryV2.js` | 🔎 (delete at T4) |
| C5 | Two-source seam: faces polygonized from **raw OSM** (`nodeEdges`/`polygonize`/3 m-snap), used only for LU | one source for faces = the skeleton (`PREBAKE.md §5`) | `derive.js:1056-1178` | 🔎 (Layer-2 / prebake polygon-ization) |
| C6 | `ribbons.intersections` emitted with near-zero live consumers | legacy | `derive.js` serializer · `ribbons.json` | ⚠️ re-verify consumers |
| C7 | `useRingBandEmitter` flag (default-true; "legacy else removed") — likely vestigial plumbing | LS=tiles, no scene branch | `BlockGeometryV2Debug` · `bake-ground` | ⚠️ re-verify |
| C8 | Vestigial `medians[]` ring (`A.points + B.points.reversed`) — the median is an emergent face | `[[project_truman_divided_road_knot]]` | `derive.js` · `ribbons.json` | ⚠️ re-verify (may be addressed) |
| C9 | The old `simplify()` (junction-blind local filter) is **dead** — replaced by `simplifyRDP`, only referenced in a comment. The forensics *blame this function*; it still sits in the file (landmine). | replaced by `simplifyRDP` (`SKELETON §3.8`) | `skeleton.js:593-632` | ✅ excised 2026-06-05 (`e3ec84a`, Lye) — function deleted (no caller existed); Step-4 header + `:973` comment rewritten to name `simplifyRDP`/protected-keys |
| C10 | `skeleton.js` writes `skeleton.json` via plain `writeFileSync`, **not** `writeIfChanged` | the dirty-skip discipline (`ARCHITECTURE §7`) | `skeleton.js:1193` | ✅ excised 2026-06-05 (`e3ec84a`, Lye) — `writeIfChanged(…, {touch:false})`: plain `writeIfChanged` would NOT have fixed it (io.js job-2 bumps mtime even on identical content — right for chain OUTPUTS, but `skeleton.json` is a chain INPUT, so the bump itself forces the rebuild); added the `touch` opt-out to `io.js`, default unchanged for every other caller. Verified: output byte-identical (sha256 `f102a906…`), mtime frozen across re-run, serve's `needsRebuild` predicate skips |
| C11 | stale comment header `R-CLAMP:` describes a per-tile corner-R clamp the code explicitly does **not** do (`:898` "NO clamp — the operator's R is the dial") | the no-corner-R-clamp doctrine | `tileGround.js:893-895` | ✅ excised 2026-06-05 (`e3ec84a`, Lye) — also caught + trimmed a SECOND orphaned R-clamp comment at `:246-249` (above `circlePoly`; described a clamp helper that no longer exists) |
| C12 | `capStart`/`capEnd` are **point-order-keyed and unguarded** — same hazard class as the D1 measure scramble: a future longitudinal weld that flips a *capped* chain's point order silently swaps start↔end caps | the reversal-proof side/end-keying discipline (`[[feedback_perp_side_convention]]`) | `skeleton.js` caps · `derive.js` · `tileGround.js` deadEndTips | 🔎 flagged by Gunter (D1); fix by the same reversal-proof keying when caps next move |
| C13 | **Non-street ribbons (alleys + footway/cycleway/steps/path) baked ONLY in the dead V2 path** (`buildV2BakeShape` → `buildPathRibbons`); the live tile bake (`buildTileBakeShape`) never carried the call, so **the slab shipped with NO alley/footway/path groups** even with `layerVis.alley/footway === true` — they rendered in the Designer (live `buildPathRibbons`) but vanished in the bake/Stage/Preview/runtime. they vanished in the bake/Stage/Preview/runtime. A tile-migration orphan, same class as C2/C3 — and it had a TWIN on the render side (C14). | the bake mirrors the Designer's live geometry; `layerVis` gates *what* bakes, not *whether the path exists* (`BAKE.md §2/§3`) | `bake-ground.js` `buildTileBakeShape` (was: only `buildV2BakeShape:458`) | ✅ fixed 2026-06-12 (Boz) — added the `buildPathRibbons` call to `buildTileBakeShape` (clip to parcel interiors = block − curb − treelawn − sidewalk; park excluded; `layerVis` gating downstream at PAINT_ORDER). Re-bake: slab now carries `mat:alley` (910 v) + `mat:footway` (1581 v); path/cycleway/steps follow when toggled on. |
| C14 | **Non-street ribbon MESHES rendered ONLY in the dead V2 render branch.** In `BlockGeometryV2Debug`, `{PATH_KINDS.map(...)}` (the alley/footway path meshes) sat in the non-tile `return`; on a tile scene (`isTileScene=true`, i.e. LS) the component returns earlier inside the `if (isTileScene)` block (the default tile render + the frozen Section + the Survey render) and NEVER reached it. So `buildPathRibbons` computed the geometry every frame but there was **no `<mesh>` to draw it** — the layers were toggled-on-but-invisible in the Designer. The render twin of C13. *(Boz's C13 note "they rendered in the Designer" was a wrong assumption — they didn't; this was the bug Jacob actually saw.)* | the tile render is the live path for LS; everything that draws must be in the `isTileScene` branch | `BlockGeometryV2Debug.jsx` (path meshes only in the post-`isTileScene` V2 return) | ✅ fixed 2026-06-12 (Boz, `543bdeb`) — added the path meshes to the tile renders (default + frozen Section). Paired with `996cef1` (the `parcelInteriors` clip now uses tile geometry — `tileGeos`/`sectionGeos` — not the dead V2 bands), so the live Designer path render matches the bake. |

## Doc corpse-lies (→ fix in the doc campaign)

| # | Corpse-lie (doc) | Locus | Status |
|---|---|---|---|
| D1 | Body describes dead figure-ground as the primary construction | `RIBBONS.md` §1 / §3.1-3.8 / §6 / §7 | 🔎 |
| D2 | prong-4 "skeleton-consolidation / `osm2streets`" red herring for the false corner | `BACKLOG.md` ✅ (reshaped 2026-06-05) · `PIPELINE.md §Wall` 🔎 | 🔎 partial |
| D3 | figure-ground-as-live passages (`cornersAtIx` / "V2 curb" / treelawn-LU) | `FEATURES.md` | 📝 MARKED 2026-06-10 — the §17 banner now names them **superseded** (Section is built; SSOT = `SECTION.md`); prose excision rides **T4** (the figure-ground deletion). The treelawn-matches-abutting-LU *behaviour* is kept (still true); only its figure-ground *plumbing* is superseded. |
| D4 | `SURVEY.md` cross-ref still lists the killed `HANDOFF-divided-false-corner.md` as open work | `SURVEY.md` §Cross-references | ✅ fixed 2026-06-05 |
| D5 | `SKELETON.md` §2/§3 drift (junctions "degree ≥3" / divided-id "-0/-1" / `spineAt*` missing from schema / unnamed "no seed" / `continuesAs` missing / write "via writeIfChanged") | `SKELETON.md` §2, §3 | ✅ conformed 2026-06-05 (the skeleton audit) |
| D6 | `SURVEY.md` §3 **block/asphalt INVERTED** ("Block = tile − iA" — that's asphalt; block = iA), contradicting §1; + §3 overstated the capacity guard (it's full-collapse only) + line-ref drift | `SURVEY.md` §3 | ✅ conformed 2026-06-05 (the survey audit) |
| D7 | `SURVEY.md` §4 migration note stale — said asphalt-edge "still in Measure"; it **moved to Survey** (`SurveyorOverlay`; `MeasureOverlay:147` confirms) | `SURVEY.md` §4 | ✅ conformed 2026-06-05 |
| D8 | `HANDOFF-tile-feature-ledger.md` **A2 "no work"** likely stale — corner-R is now wired to the tile render (`buildTileGround`, `:610`) | `tile-feature-ledger` A2 | 🔎 verify on Jacob's eye (code-read ≠ operator eye), then update the ledger |
| D9 | **Divided-carriageway CHAIN POSITION contradiction** — `FEATURES §371` said the chain stays at the carriageway **center**; `PREBAKE-PLAN §2` + D1 assumed the **inner edge**. | `FEATURES §371` | ✅ **RESOLVED 2026-06-05 (Alidade, measured vs the operator's traces): chains sit at the INNER edge** (`chainGap` = median width; a center reading → negative medians; spike matches traces <1m). `FEATURES §371` was the corpse-lie → **corrected**; D1's inner-edge emit was right. (The "emits from the left of the lane" symptom is a *different* defect — the north-void, C13.) |
| C13 | **North-void** — a street edging the **unbounded outer face** (e.g. I-44, grade-sep-excluded from `extractFaces`) emits **nothing outboard** → "asphalt emits from the left of the lane, not center." Pre-dates D1; NOT the chain-position issue. | the outer-face/boundary handling | `tileGround.extractFaces` outer face | 🔎 flagged by Alidade — its own brief (F); meshes with G9 perimeter / boundary-trio |

## Bake / Stage divergences (seeded 2026-06-10, the BAKE.md/STAGE.md keystone session)

> Found while writing the two missing keystones (`BAKE.md`, `STAGE.md`) against the live bake chain (`serve.js:461`, `bake-scene.js`, `bake-ground.js`). The bake **mechanism** is mature and honest; the divergences are mostly **aspiration** (roadmap artifacts that never shipped) + two now-cured **landmines** (the stages had no Reference home).

| # | Divergence | Type | The truth | Locus | Status |
|---|---|---|---|---|---|
| B1 | `ARCHITECTURE.md §1` publish-loop diagram shows **`stage-config.json (future)`** as a planned slab artifact; §3 layer-3 implies a runtime shader-param layer to come | **Aspiration** (presented as roadmap; never shipped) | every Stage channel folded into `scene.json` field-by-field; there is **no** `stage-config.json` and none is pending | `ARCHITECTURE.md §1` diagram · `§3` layer 3 | 🔎 retire the placeholder from the diagram; noted as dead intent in `BAKE.md §5` |
| B2 | `STAGE_MIGRATION.md` describes Meteorologist cloud-authoring living **inside a Stage right-panel card** | **Aspiration / historical** | Meteorologist shipped **standalone** (`/meteorologist.html`); the Stage's only cloud surface is the forward-compat `scene.json.clouds` ref | `STAGE_MIGRATION.md` | 🔎 mark historical (corrected in `STAGE.md §5`); doc itself is a Diary-grade plan, retire-or-stamp |
| B3 | SC.4 time defaults persist nothing; SC.5 bakes only Browse heading (Hero keyframes/altitude stay live) | **Aspiration — correctly marked** (not a lie) | `bake-scene.js` header + `:115`/`:139` honestly note "pending"; tracked as "Slab completeness" in `BACKLOG.md` | `bake-scene.js` · `BACKLOG.md` | ⚠️ honest gap, not divergence; track to close, don't excise |
| B4 | `bake-ground.js:28` imports dead `buildBlockGeometryV2` alongside live `buildTileGround` | **Corpse-lie** (= C3/C4) | tiles are the live path; figure-ground is dead weight | `bake-ground.js:28` | 🔎 excise at T4 (cross-ref C3/C4) |
| B5 | The bake **chain + `shape.json` emission** had no keystone Reference doc — its home was "README · ARCHITECTURE · FEATURES" (BOZ §0 Suite) | **Landmine** (truth lived only in code/orchestration) | now documented | → **`BAKE.md`** | ✅ documented 2026-06-10 |
| B6 | The Stage tool + the SC.1–SC.7 channel inventory had no keystone Reference doc | **Landmine** | now documented | → **`STAGE.md`** | ✅ documented 2026-06-10 |

---

*Seeded 2026-06-05 from the front-half spec session (Skeleton/Prebake/Survey), all code rows code-verified except ⚠️. Bake/Stage rows added 2026-06-10 (the keystone session). Add a row whenever a landed truth exposes a contradiction; clear a row only when both places agree.*
