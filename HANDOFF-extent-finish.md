# HANDOFF — Extent tool: the finish work (successor to the concerted-logic redesign)

> **The big redesign SHIPPED** (`HANDOFF-extent-tool-concerted-logic.md`, now archived → `cartograph/_archive/handoffs/HANDOFF-extent-tool-concerted-logic-2026-07-11.md`). Visual boundary-segment selection, empty workspace, official best-guess pass, commit/reproject/atomic-Pour/rollback, living-boundary re-scope, metadata (name/blurb/tz), panel grouping, and the **divided-road weld** (the Altadena close-blocker) are all done. What's left is finish work, not a redesign.

## What shipped (do not re-open)
- **Visual boundary selection** (`computeBoundaryFromSelection`, `serve.js`) — click real streets, ring resolves by shared skeleton junctions; the 4-cardinal model is retired.
- **Empty workspace / ＋New**, official-boundary best-guess, commit→Pour (atomic + rollback), §11 living-boundary re-scope, name/blurb/tz.
- **Cold-restart persistence** — Extent reappears on the working hood, else blank, never LS (`ExtentApp.jsx` + store `_loadLooks`).
- **Browser tab = authored Neighborhood Name.**
- **Divided-road weld (2026-07-11)** — corridor label now propagates along the whole physical road in `skeleton.js`, so a divided arterial (Woodbury) is one selectable edge that closes. See `[[project_extent_altadena_divided_road_weld]]` + the invariant in the archived handoff. **This is the source fix; do NOT add a resolver-side corridor-merge.**

## Still live — the finish punch-list
1. **Legible labels (the enabler — was "failure #1").** `ExtentLabels` (`ExtentApp.jsx`) just filters to `l.major`; there's no dedup / collision / declutter, so the aerial is a jumble. You can't visually select a boundary you can't read. Legibility work centers on `src/lib/streetLabels.js` (`getStreetLabels`) + `ExtentLabels`.
2. **"End the selected street at corners" (Jacob, 2026-07-11).** Today we draw each selected street's ENTIRE polyline → it overshoots miles past the hood. Clip each selected street's drawn line to the span between its two ring-corners (the outermost junctions it shares with other selected streets). Kills the overshoot; leftover stubs make gaps legible. Graphical layer (`ExtentClickableStreets` / the boundary render), rides on the resolved corners.
3. **§11 canon reconciliation (Boz fold, still owed).** `NEIGHBORHOOD-INPUTS.md §11` still describes the retired name-derive box model; reconcile it to the shipped visual-selection + auto-radius + divided-road-weld reality.

## Deferred follow-ons (flag, don't conflate)
- **Favicon** — generate per-hood from the boundary polygon silhouette (Look accent fill; monogram fallback). NOT an upload. Reusable as the hood's icon on Place Cards / pins / selector. (Noted in the archived handoff.)
- **Oversized extent** — Altadena's official CDP (r≈4483) includes forest/mountain; operator tightens by eye (r≈1400 placeholder). Not a bug.
- **Elevation** — pour runs `--skip-elevation` (flat); DEM terrain is a separate annulus thread.
- **LA-County parcels** (Altadena addresses) — separate assessor-well thread.

## Invariants (carried from the redesign — still binding)
- Operator's eye on a LEGIBLE aerial is the capability; never name-geocoding for geometry.
- Visual multi-segment selection, not cardinal slots.
- **Divided roads weld to ONE corridor before the boundary tool consumes them** — fix in the skeleton, not the resolver (`[[project_truman_divided_road_knot]]`, `[[feedback_fix_at_source_never_hack_the_symptom]]`).
- Installation-agnostic; **LS stays byte-identical**; frame north=−z (`config.js`).
