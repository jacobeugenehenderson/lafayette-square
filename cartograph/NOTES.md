# Cartograph — Operator Handoff

This document explains how to (re)build the Lafayette Square neighborhood map from
scratch, the principles behind the pipeline, and the work-in-progress problems the
next operator should pick up. Read this top-to-bottom before touching any code.

> Part of the **cartograph quintet** (`FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md` / `RIBBONS.md`). **Ribbon / corner / curb / intersection / block-geometry doctrine and pipeline** live in `RIBBONS.md` — the living doc that evolves every session. The Diary is kept lean: aged entries lift to `_archive/notes/` (below); settled facts live in the Reference docs.

---

## 2026-06-09 → 06-10 — D6a curb-as-offset lands; Section FINISHED + documented; the 2D tools go flat.

**The curb became a polygon (D6a).** The curb `iA` is now the per-edge parallel-offset of the tile ring (`offsetRingVariable`, default on) — `chain ⊕ pavementHW`, corners as offset-intersections — not the asphalt-union carve that bowed at junction windows (the cross-street "d" dies: tile 11 2.80→0.78 m). Dead-end caps are built **into** the offset polygon (semicircle/flat between the two legs' offset endpoints), tangent to the authored per-fe width by construction — after four grafts all seamed, the lesson is *never graft a clean cap onto the offset; build it as part of the offset*. Gated to legacy on medians/slivers/degenerate. Detail → `[[project_d6a_curb_offset]]`, `SKELETON.md §5f`, `POLYGON-FIRST.md §3`.

**Section is finished.** The per-edge FILL (`resolvePedDepths` → `sectionPass`), the bent-`fullBand`-slice corner (the disk primitive is gone; `circlePoly` survives only as a sector mask), the two-strips-always ordering, corner = `cw + max-adjacent`, the live material + depth overrides, and the handles riding the achieved curb (`sectionCurbRings` — one *geometry* truth) all ship. **Revert UI** landed (`919c5f3`): Section · Revert to Default (whole-scene, footer button) + ⌃-click a ped handle (per-edge) → the calc re-seeds (gleaned treelawn + ADA); field-scoped so it never wipes Survey. Detail → `[[project_revert_buttons]]`.

**The docs caught up to the code (this pass).** `SECTION.md` → **v0.3 (LANDED + finished)**: the three stale forensic corrections folded in, §3.3 reframed from dispatch-target to landed, the Revert control + §5.1 added, §7 rewritten to the real open tail + a folded SHAPE/FILL diagnostic frame (§7.1). The pre-build forensic census `SECTION-CENSUS.md` did its job and was **archived** → `_archive/SECTION-CENSUS-2026-06-03.md`. `README` / `PIPELINE` / `BACKLOG` "~70% built" claims corrected; `FEATURES §17` banner sharpened (figure-ground mechanism passages named superseded, excision rides T4); `DOC-CODE-COHERENCE` D3 → marked. The Diary itself was archived (this entry).

**The 2D tools went flat (UI).** Dropped the glass from the 2D Designer (Survey/Section/Marker) — opaque crisp-bordered cards on a solid canvas, scoped to `.carto-flat` (root, inDesigner only) so the **Stage keeps its glass** and the 2D→3D crossing reads as a deliberate material shift (Jacob: "we were being trendy"). The Section **Revert to Default** button got a prominent on-brand (Measure-accent) style — it was a ghost `carto-btn-sm` at 0.4 opacity.

**OPEN (the FILL tail — polish, not a build):** perf/D6d block-local rebuild (gates interactive handle validation — the "sticky drag") · cap ped-wrap (G8 + Bentley Pl round-cap bug) · capacity guard G12 (~100 thorns) ported to `sectionPass` · delete the still-mounted figure-ground (T4) · rename Measure→Section · D6b freeze the offset `iA` into `ribbons.tiles[]` · divided carriageways (gated to legacy). See `SECTION.md §7`, `[[project_d6a_curb_offset]]`. Branch `curb-offset-draw`.

---

## Older entries → archive

The Diary is kept lean — aged, settled entries are lifted (nothing deleted, moved for legibility):

- 2026-05-27 → 2026-06-08 → [`_archive/notes/NOTES-2026-05-27_to_2026-06-08.md`](../_archive/notes/NOTES-2026-05-27_to_2026-06-08.md) (V1 ribbon-corner ship · the tile pivot · the SKELETON home doc · the §Wall/better-bones day · the DataWall Phase-D · the deep-night sky · the datum repair) — lifted 2026-06-10.
- 2026-04-07 → 2026-05-18 → [`_archive/notes/NOTES-2026-04-07_to_2026-05-18.md`](../_archive/notes/NOTES-2026-04-07_to_2026-05-18.md) — lifted 2026-06-05.
