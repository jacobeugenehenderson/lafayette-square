# HANDOFF — Phase 2: Reconceived Survey (the asymmetric stroke + rounding/AA)

**You are the dispatched agent.** Pick a name (one word, yours); sign your commits + final report with it. This is **Phase 2 of the reconceived-pipeline program** (`HANDOFF-pipeline-reconception.md`) — the **first VISIBLE phase**: it draws the LS street hardscape attractively from the clean frame, and it moves the footprint + corner authoring into Survey. Phase 1 (`1f89b86`) committed the enriched frame you build on.

**Reads first:** `HANDOFF-pipeline-reconception.md` (the program + locked decisions) · `HANDOFF-stroke-construction.md` (the construction model — §"The model, precisely", §"de-risking keystone", §design-resolutions) · `cartograph/RIBBONS.md §1` (regime) · FEATURES §"Corner-authoring kit" + §"Legacy render.js knobs NOT wired into JSX Designer".

**Agent: FRESH (cold).** Marrow's frame context isn't load-bearing here — 2a is new construction ground; a fresh agent avoids dragging frame-phase assumptions into the geometry.

---

## Goal (one line)

Survey draws the LS street hardscape — **asymmetric stroke + live smoothing/AA + clean rounded joins** — *correctly and attractively the first time*, rendered live in Survey **and** baked identically (WYSIWYG), unflagged on LS; **and** the footprint (`pavementHW`) + corner-radius authoring now live in the **Survey** panel and are **removed** from the Section (Measure) panel — no detritus left floating.

## The split this phase makes real

**Footprint in Survey, profile in Section** (the locked decision — the responsiveness hinge). `pavementHW` (asphalt half-width) is a *Survey* concern: you author it where you stroke the chain. The corner-radius kit is *Survey* (it shapes the hardscape silhouette). Section (formerly Measure) will author only the ped profile — and that's Phase 4, so in *this* phase Section simply **loses** the footprint + corner controls.

---

## Two workstreams — dispatch SERIALLY (2a lands + Jacob's eye, then 2b)

> They touch different files (geometry vs panels) and 2a is the risky one. Land + eyeball 2a before starting 2b so a UI churn can't confound a geometry regression (`[[feedback_load_bearing_files_serial_dispatch]]`, `[[feedback_d3_bundling_failure_modes]]`).

### 2a — The construction (the visible win)

Evolve the existing **outward stroke** (don't rebuild — *retrofit*, Jacob's hard constraint). Today `emitChain` (`src/lib/buildBlockGeometryV2.js ~2620`) offsets each chain ±`pavementHW` into asphalt rectangles → `unionRings` → `asphaltSharp`. Make it:

1. **Stroke the SMOOTHED curve.** Fit an **interpolating Catmull-Rom** through each chain's mid-vertices (interpolating = the curve passes *through* authored points, only rounding the facets between them), render it live in Survey, and stroke *that* — so it bakes smooth and shows smooth. Real corners at **nodes/junctions keep their authored R** (the enriched frame now types junctions — use them); only mid-chain facets auto-smooth. Expose **one global smoothing-tension dial**; default to WYSIWYG-smooth with zero operator work. ⚠️ The `render.js` `smoothPolyline`/Catmull code is **dead** (not wired to JSX); build this in the JSX path. Check `BlockGeometryV2Debug.jsx` / `animatedParam.js` / `streetProfiles.js` for reusable smoothing helpers before writing new.
2. **Asymmetric per-side widths**, authored in Survey (see 2b). Asymmetric stroke about the centerline = **symmetric stroke about a re-centered line** (half-width `(wL+wR)/2`, center shifted `(wR−wL)/2`) — reuse the existing cap; the `anchor:'inner-edge'`/`innerSign` scaffolding likely already does the shift.
3. **Rounded joins via the R-kit.** The corner-radius kit (`applyRoundCornersToRing` + `defaultR` + `cornerRadiusOverrides`) is the join control. Reuse the existing round machinery to get an attractive silhouette; you may lean on the current round-the-block path to land a visible result — the full "corner = stroke join, figure-ground retires" is the Wall (Phase 3), **not** this phase.

**WYSIWYG is the gate mechanism:** the Survey live render (`BlockGeometryV2Debug.jsx`) and the bake (`bake-ground.js`) must produce the *same* silhouette — author it, see it, bake it identically.
**2a gate:** Survey draws the LS street map — smooth where it should be, sharp/authored-R at junctions, asymmetric where measured — and **Jacob calls it attractive**. Bake: `node cartograph/bake-ground.js` (unflagged → lafayette-square, ~8s).

### 2b — The authoring migration + detritus discipline

This is the part Jacob explicitly flagged: **move the tools into Survey AND retire them from Section in the same arc** — a vestigial control left floating in Section is a wall violation (`[[feedback_vestigial_ux_is_a_wall_violation]]`).

1. **Surface in Survey** (`SurveyorPanel.jsx` + `SurveyorOverlay.jsx`): the `pavementHW` footprint authoring (the asphalt-edge drag handle, currently in `MeasureOverlay.jsx`) and the corner-radius kit (Corners slider + Edit-corners toggle + per-IX/per-corner dots, currently surfaced via `Panel.jsx`/`CartographApp.jsx` + `CornerEditHandles.jsx`).
2. **Remove from Section** (`MeasurePanel.jsx` + `MeasureOverlay.jsx`): the `pavementHW` handle/controls and the corner kit are **gone** from the Section panel/overlay — not hidden behind a flag, **retired**. Trace every place they mount and pull them; leave no orphaned toggle, dead state field, or stale label.
3. **Mind the detritus:** grep for vestigial references after the move (panel sections, store actions, overlay handles, MeasurePanel rows) and clean them in this same commit. If something is load-bearing for Section's *future* profile authoring (Phase 4), leave it and **flag it** — don't delete blindly.

**2b gate:** footprint + corner authoring works in the **Survey** panel; the **Section** panel is clean of both (no detritus); Jacob's eye confirms the controls are where they belong and nothing dangles.

---

## Boundaries — do NOT cross in Phase 2

- ❌ Do **not** freeze the hardscape / kill chains downstream — that's the Wall (Phase 3). Chains stay live this phase.
- ❌ Do **not** build the inward ribbon stroke / touch the Section ped-profile construction — that's Phase 4.
- ❌ Do **not** retire `silhouetteStraightEmitter`/`buildFrontageBandsV2`/the figure-ground path — Phase 5 cleanup, after the construction proves out.
- ❌ Do **not RENAME** code identifiers (`MeasurePanel`→`SectionPanel`, etc.) — the rename rides a later step and lands when behavior is fully true (stale-label rule). Use the current names; move the *controls*, not the *names*.
- ❌ Do **not** touch `design.json` customs; do **not** edit the canonical docs (Boz folds your report in).

## Write / commit boundaries

- **May edit:** `src/lib/buildBlockGeometryV2.js`, `src/cartograph/BlockGeometryV2Debug.jsx`, `cartograph/bake-ground.js` (2a); `src/cartograph/SurveyorPanel.jsx`, `SurveyorOverlay.jsx`, `MeasurePanel.jsx`, `MeasureOverlay.jsx`, `CornerEditHandles.jsx`, `Panel.jsx`, `CartographApp.jsx`, the cartograph store (2b). Plus regenerated bake artifacts.
- Two commits (2a, then 2b), each signed, each ending with the Co-Authored-By line. Branch `cartograph-looks-pass-ab`.

## Open decision to surface (don't guess silently)

- **Smoothing-tension default + per-chain override at v1?** Pick a sensible default, ship it, and **name the value in your report** so Jacob can tune on his eye. (Stroke-brief Open Decision #4.)

## Deliverable / final report

- Commit hashes + one-line outcomes (2a, 2b).
- 2a: what the stroke now does (smoothing approach, asymmetric handling, join control); the smoothing-tension default you chose; a before/after on LS attractiveness.
- 2b: exactly what moved to Survey, what was removed from Section, and the detritus grep result (what you cleaned, what you left-and-flagged for Phase 4).
- Anything that fought the retrofit constraint (where you had to lean on existing machinery vs build new).

*Provenance: Boz, 2026-06-01. Phase 2 of `HANDOFF-pipeline-reconception.md`. Construction model: `HANDOFF-stroke-construction.md`.*
