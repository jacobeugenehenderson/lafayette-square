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

## Doc corpse-lies (→ fix in the doc campaign)

| # | Corpse-lie (doc) | Locus | Status |
|---|---|---|---|
| D1 | Body describes dead figure-ground as the primary construction | `RIBBONS.md` §1 / §3.1-3.8 / §6 / §7 | 🔎 |
| D2 | prong-4 "skeleton-consolidation / `osm2streets`" red herring for the false corner | `BACKLOG.md` ✅ (reshaped 2026-06-05) · `PIPELINE.md §Wall` 🔎 | 🔎 partial |
| D3 | figure-ground-as-live passages (`cornersAtIx` / "V2 curb" / treelawn-LU) | `FEATURES.md` | 🔎 |
| D4 | `SURVEY.md` cross-ref still lists the killed `HANDOFF-divided-false-corner.md` as open work | `SURVEY.md` §Cross-references | ✅ fixed 2026-06-05 |

---

*Seeded 2026-06-05 from the front-half spec session (Skeleton/Prebake/Survey), all code rows code-verified except ⚠️. Add a row whenever a landed truth exposes a contradiction; clear a row only when both places agree.*
