# Morning brief — FOR BOZ (2026-06-03). Refine with Jacob, THEN dispatch.

> **This is a Boz-facing working note, not an agent dispatch.** Jacob's instruction (2026-06-02 night): draft the morning plan *for myself*; he + I revisit the logic + writing/consistency together in the morning, and only *then* convert it to the dispatch brief(s) and dispatch (warm → Tessera). Don't hand this to an agent as-is.

## The goal (Jacob, last night)
**Finish Survey, then finish Section** — the two lagging GEOMETRY tools — so the **3 bakes run clean → prep the slab** (Intake✓ → geometry freeze (Survey shape + Section cross-section) → Stage slab). Front-to-back fill of the operator UX; each tool *finishes & freezes*, you don't go back. Stage is a different category (look/optics) + already more polished — not the worry. He thinks it's doable in a day.

## What's already TRUE (verified in code last night — don't re-theorize)
- **Survey EXISTS as a tab:** `Panel.jsx` `ToolPill` = **Survey | Measure | Design** → `SurveyorPanel.jsx`. The move is **consolidation, not build-from-scratch.**
- **Survey already owns:** hero-pick · **Smoothing** (global slider, `streetSmooth`; the comment calls it "Phase-2 stroke construction… shapes the hardscape silhouette… live==bake WYSIWYG") · street metadata (name/type/oneway) · anchor · **Caps** (Cap Start/End: round/blunt/none).
- **Designer renders LIVE** via `buildTileGround` (`BlockGeometryV2Debug.jsx:544`, "live == bake"). Eyeball surface = **Toy Designer, hard-refresh, no bake needed** (toy Stage is a not-hooked-up stub). [AGENT-VALIDATION-SURFACES §"Live vs baked"]

## The Survey work — CONSOLIDATE shape authoring into the Survey tab
Grounded in the design spine **`HANDOFF-survey-section-tool-design.md` §"Survey"** (Jacob-resolved 2026-06-01) + code locations:

| Move INTO Survey | Lives today at | Note |
|---|---|---|
| **Corner-R kit** (global × per-IX × per-corner) | `cornerRadiusScale` (global) + `cornerRadiusOverrides` (per-IX) + `cornerCornerRadiusOverrides` (per-corner); on-canvas `CornerEditHandles.jsx`; global slider in `Panel.jsx` "Blocks › Shape" | Survey concern (shapes the corner). "Corner IS the handle" (magenta curb arc). |
| **Curb width** | `Panel.jsx:247-280` global slider (`curbWidth`/`setCurbWidth`, def 0.1524) | Global + editable + **own shader/material** (Jacob). |
| **Asphalt-edge handle** (`pavementHW`) | the Measure stack (`MeasureOverlay.jsx`) | The outward-stroke handle → Survey. Section keeps the ped handles. |

Already in Survey (keep / polish): **caps**, **smoothing** (design wants → auto + render-raw-when-selected + jack curve fineness on all béziers = ledger P3; possibly a stretch — see open Qs).

**Handle visibility (Jacob, resolved):** each tool shows **ONLY its own** handles — Survey = asphalt-edge + corner; Section = ped (`treelawnOuter`/`propertyLine`). Not the other tool's as context.

**Survey correctness (the real bug, from last night's images):** the corner handle detached from the curb on most corners (magenta floating in the street — Image 3 TL/LR). The "one corner truth" (`cornerFillets` → handle reads achieved at rest) is broken/incomplete. Fixing the handle↔curb correspondence is a **Survey-shape** task. [project_f3_corner_editor]

## The Section work (next, after Survey freezes)
Refit Measure → Section (`MeasurePanel.jsx`): ped handles (treelawn/sidewalk widths), strip LU↔SW swap (ctrl-click, `materials:{outer,inner}`), LU emergent (no internal ring). **Last night's broken images ARE the Section punch-list — fixed on a FROZEN Survey shape:** the bad ADA pad (Img 1, 3-BL), the lost dead-end sidewalk cut-across + treelawn-flooded caps (Img 4). Grammar carries as-is (RIBBONS §5 — "Measure is elegant when it works"; translucency-focus is BY DESIGN, not a bug).

## Canon to cite in the dispatch brief (per BOZ.md §1 rule)
- `cartograph/ARCHITECTURE.md §2.1` — the three-tool taxonomy (SHAPE=Survey / FILL=Section).
- `RIBBONS.md §3.9a` + the "invariants that survive the rewrite" block — corner = band-bent, **jtMiter** (now in tileGround), ADA = band-slice.
- `RIBBONS.md §5` — the Measure operator grammar (carry as-is into Section).
- `HANDOFF-survey-section-tool-design.md` — the Jacob-resolved tool design (THE spec).
- memory `project_f3_corner_editor` — the corner editor / cornerFillets convergence + the detachment.
- `AGENT-VALIDATION-SURFACES.md` — Designer=live; eyeball Toy Designer.

## Open questions to settle with Jacob BEFORE dispatch
1. **Scope of "finish Survey":** just the tool consolidation + corner-handle correctness on the live `tileGround` (my lean) — OR also the hard **freeze/wall** (chains-die)? The existing ground bake already freezes geometry; the deep chains-die wall is a bigger downstream arc. I think tomorrow = tool consolidation + correctness; wall later.
2. **One agent or two?** Survey first → confirm/freeze → then Section. Likely two sequential briefs (matches finish-and-don't-go-back), or one warm agent across both.
3. **Smoothing:** implement auto + render-raw-when-selected + fine-curves (P3) now, or keep the working global slider and defer? (Scope-control — Jacob flagged sprawl risk.)
4. **Agent:** warm → Tessera (holds tile + corner-editor + measure context). Confirm.

## Process
Refine logic + writing/consistency with Jacob → convert to dispatch brief(s) citing the sections above → dispatch warm→Tessera → eyeball in Toy Designer (live), Jacob's eye gates. Parked & committed: jtMiter + canon (`5293f84`). Definition-of-done census: `HANDOFF-tile-feature-ledger.md`.

*Provenance: Boz, 2026-06-02 ~2am, for morning-Boz. Grounded in code reads + the design spine; NOT yet dispatch-ready by design.*
