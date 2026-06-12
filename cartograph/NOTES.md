# Cartograph — Operator Handoff

This document explains how to (re)build the Lafayette Square neighborhood map from
scratch, the principles behind the pipeline, and the work-in-progress problems the
next operator should pick up. Read this top-to-bottom before touching any code.

> Part of the **cartograph quintet** (`FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md` / `RIBBONS.md`). **Ribbon / corner / curb / intersection / block-geometry doctrine and pipeline** live in `RIBBONS.md` — the living doc that evolves every session. The Diary is kept lean: aged entries lift to `_archive/notes/` (below); settled facts live in the Reference docs.

---

## 2026-06-11 → 06-12 — Loops land, the FILL-tail polish, two over-attributions caught, alleys un-stranded.

A long polish run on `curb-offset-draw`. **Loops:** the median is the **emergent enclosed face** (`LOOP-STREETS.md`) — the fix was an **endpoint-weld** in `extractFaces` (`e8cc310`) closing Benton/Saint-Vincent's ~3 cm gap so the interior face forms (Park Place, gap 0.000, always worked — the tell); then the §2 body (`ed250b3`) drops the inner sidewalk (grass to the curb). **Dead-ends:** the pendant-prune was **reverted** (`dd4ddb6`) — it deleted tile-sourced curbs; un-pruned, dead-ends render clean woven (bollard was right; the cap is a free per-dead-end choice, no prune discriminator). **Cap-wrap (`f908143`):** round fat-pad → uniform wrap (clip the reclaim to `fullBand`); blunt circle-cut → bands run to the end (drop the tip-disk). **Cap/clamp forensic (`SECTION-CAP-CLAMP-FORENSIC.md`):** the region is NOT deranged — the confused June-1 acute/clamp thrash (`b464297`→`7a2e2db` revert→`6aa1ad2`) left residue since repaired; **G12 = two subclasses, the self-int fix STRANDED on `8e1e414` (never landed), the band-neck clamp the orphaned `thinTile`→`cap` wiring**; docs reconciled (`8b216ac`). **Handle float (`646b8b1`):** `rayHitCurb` had no max-distance → grabbed far curbs at junction gaps (100–217 m); capped it. **18th-loop brief OBE'd:** dispatched **Spline**, whose forensic-first gate (which I'd written into the brief) **correctly tripped** — 18th isn't a broken loop; the symptoms were transient (prune + un-capped ray). **Ped-band junction family** filed (`SECTION §7`, `273fe23`) — the weird-street FILL mess (Dolman/18th/Carroll) is width-steps + ordering-flips + no constructed junction ped-silhouette; a deliberate family pass, not one-street patches. **Alleys/paths** were two tile-migration orphans — `buildPathRibbons` stranded in the dead V2 path on BOTH the bake (`735f02c`, C13) and the **render** branch (`543bdeb`, C14, the one Jacob saw: the path meshes only in the non-tile `return`, never reached on the tile scene).

> **Lessons (the throughline of the night): distrust the proxy sims; verify against the running app.** I over-attributed **twice** — the dead-end prune (built before reading the canon) and the 18th "curb absent" (a crude-per-vertex-perpendicular artifact on the snaking 18th-3 chain). And I burned many cycles tracing the alley bug headless — geometry/clip/render-order/visibility all computed correct — when the failure was *where the mesh JSX sat in the render tree*; Jacob pointing me at the running `/cartograph` is what cracked it. **When the app is running, frame it as "the live render isn't drawing despite correct geometry" and go there first.** [[feedback_read_canon_before_forensics]] · [[feedback_proxy_render_is_not_the_operator_eye]].

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
