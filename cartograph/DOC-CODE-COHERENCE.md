# Doc ↔ Code Coherence — the corpse-lie ledger

**State doc.** Tracks where the **docs and the code disagree** — so the two can be driven back into sync. The campaign rule (Jacob, 2026-06-05): **if a truth lives in only ONE place, that's a smell.** Code must reflect the docs; the docs must reflect the code.

> Sibling to `RENDER-PATH-CENSUS.md` / `SECTION-CENSUS.md` — the same census discipline, aimed at divergence. The deep "why": `[[project_the_palimpsest_code_path_multiplicity]]` (the code-side palimpsest). Method memory: `[[feedback_docs_effluvium_buried_the_answer]]`.

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
| C1 | Header: *"TRANSITIONAL: wired for TOY only; LS stays on figure-ground… NOT a kept scene-flag"* | LS runs tiles unflagged (`isTileScene=true`) | `tileGround.js:6-10` | 🔎 |
| C2 | Import comment *"T1 — toy tiles (transitional)"* | same as C1 | `bake-ground.js:30` | 🔎 |
| C3 | Figure-ground (`buildBlockGeometryV2`/`fbMemo`) **still computed every Designer frame** to feed overlays | tiles are the live path; this is dead + a per-frame perf drag | `BlockGeometryV2Debug.jsx` | 🔎 (T4 / authoring-migration first) |
| C4 | `buildBlockGeometryV2.js` + `cornersAtIx` — the whole dead module | the dead figure-ground path | `src/lib/buildBlockGeometryV2.js` | 🔎 (delete at T4) |
| C5 | Two-source seam: faces polygonized from **raw OSM** (`nodeEdges`/`polygonize`/3 m-snap), used only for LU | one source for faces = the skeleton (`PREBAKE.md §5`) | `derive.js:1056-1178` | 🔎 (Layer-2 / prebake polygon-ization) |
| C6 | `ribbons.intersections` emitted with near-zero live consumers | legacy | `derive.js` serializer · `ribbons.json` | ⚠️ re-verify consumers |
| C7 | `useRingBandEmitter` flag (default-true; "legacy else removed") — likely vestigial plumbing | LS=tiles, no scene branch | `BlockGeometryV2Debug` · `bake-ground` | ⚠️ re-verify |
| C8 | Vestigial `medians[]` ring (`A.points + B.points.reversed`) — the median is an emergent face | `[[project_truman_divided_road_knot]]` | `derive.js` · `ribbons.json` | ⚠️ re-verify (may be addressed) |
| C9 | The old `simplify()` (junction-blind local filter) is **dead** — replaced by `simplifyRDP`, only referenced in a comment. The forensics *blame this function*; it still sits in the file (landmine). | replaced by `simplifyRDP` (`SKELETON §3.8`) | `skeleton.js:593-632` | 🔎 (excise) |
| C10 | `skeleton.js` writes `skeleton.json` via plain `writeFileSync`, **not** `writeIfChanged` | the dirty-skip discipline (`ARCHITECTURE §7`) | `skeleton.js:1193` | 🔎 **real teeth** — `skeleton.json` is a `needsRebuild` input (`serve.js:57,532`), so every run forces a full downstream rebuild even byte-identical → drift/stale-bake confusion |
| C11 | stale comment header `R-CLAMP:` describes a per-tile corner-R clamp the code explicitly does **not** do (`:898` "NO clamp — the operator's R is the dial") | the no-corner-R-clamp doctrine | `tileGround.js:893-895` | 🔎 (minor; trim comment) |

## Doc corpse-lies (→ fix in the doc campaign)

| # | Corpse-lie (doc) | Locus | Status |
|---|---|---|---|
| D1 | Body describes dead figure-ground as the primary construction | `RIBBONS.md` §1 / §3.1-3.8 / §6 / §7 | 🔎 |
| D2 | prong-4 "skeleton-consolidation / `osm2streets`" red herring for the false corner | `BACKLOG.md` ✅ (reshaped 2026-06-05) · `PIPELINE.md §Wall` 🔎 | 🔎 partial |
| D3 | figure-ground-as-live passages (`cornersAtIx` / "V2 curb" / treelawn-LU) | `FEATURES.md` | 🔎 |
| D4 | `SURVEY.md` cross-ref still lists the killed `HANDOFF-divided-false-corner.md` as open work | `SURVEY.md` §Cross-references | ✅ fixed 2026-06-05 |
| D5 | `SKELETON.md` §2/§3 drift (junctions "degree ≥3" / divided-id "-0/-1" / `spineAt*` missing from schema / unnamed "no seed" / `continuesAs` missing / write "via writeIfChanged") | `SKELETON.md` §2, §3 | ✅ conformed 2026-06-05 (the skeleton audit) |
| D6 | `SURVEY.md` §3 **block/asphalt INVERTED** ("Block = tile − iA" — that's asphalt; block = iA), contradicting §1; + §3 overstated the capacity guard (it's full-collapse only) + line-ref drift | `SURVEY.md` §3 | ✅ conformed 2026-06-05 (the survey audit) |
| D7 | `SURVEY.md` §4 migration note stale — said asphalt-edge "still in Measure"; it **moved to Survey** (`SurveyorOverlay`; `MeasureOverlay:147` confirms) | `SURVEY.md` §4 | ✅ conformed 2026-06-05 |
| D8 | `HANDOFF-tile-feature-ledger.md` **A2 "no work"** likely stale — corner-R is now wired to the tile render (`buildTileGround`, `:610`) | `tile-feature-ledger` A2 | 🔎 verify on Jacob's eye (code-read ≠ operator eye), then update the ledger |

---

*Seeded 2026-06-05 from the front-half spec session (Skeleton/Prebake/Survey), all code rows code-verified except ⚠️. Add a row whenever a landed truth exposes a contradiction; clear a row only when both places agree.*
