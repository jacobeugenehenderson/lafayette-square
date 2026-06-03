# Dispatch brief — BUILD THE SURVEY TOOL (cartograph)

**For a COLD agent.** Assume no prior context — everything you need is cited below with exact file:line. This is brief **#1 of 2** (Survey → freeze → Section). When this lands and Jacob's eye confirms, the Survey hardscape shape is *frozen* and the Section brief refits the ped profile on top of it. **Finish-and-don't-go-back:** Survey's job is to make the hardscape shape correct and author it cleanly; you do not reach forward into ped widths / ADA / strip materials (that is Section).

---

## 0. Name yourself, then read the canon (required)

Pick a name, sign your commits with it. Then read, in order:
- **`src/cartograph/ARCHITECTURE.md §2.1`** — the three-tool taxonomy: **Survey = SHAPE** (hardscape silhouette), **Section = FILL** (ped profile), **Stage = LOOK**. This brief is the SHAPE half.
- **`HANDOFF-survey-section-tool-design.md`** — the Jacob-resolved tool design (the spec). Read §"The organizing principle", §"Survey", §"Shared interaction grammar", §"Resolved (Jacob, 2026-06-01)". **One amendment lands on it (2026-06-02):** §"Survey" item 4 (curb width in Survey) is REVERSED — **curb width moves to Section as a cosmetic material lip, not Survey.** See §3 below.
- **`RIBBONS.md §5`** — the Measure operator grammar (click-select-centerline → fe; translucency-focus; edit-row vs edit-block). The translucency-focus (selected chain/block ~0.55, context opaque) **is by design — do not "fix" it toward all-translucent.**
- **`RIBBONS.md §3.9a`** + the "invariants that survive the rewrite" block — corner = band-bent (jtMiter, now in tileGround).
- **`AGENT-VALIDATION-SURFACES.md`** — how to eyeball (see §6 below).

---

## 1. What Survey is and where it lives today

The tool-selector pill is `ToolPill` in **`src/cartograph/Panel.jsx:500-529`**: tool ids `'surveyor'` (label "Survey"), `'measure'` (→ becomes Section, brief #2), `'design'`. Active tool in `useCartographStore(s => s.tool)`. Panel renders `<SurveyorPanel />` when `tool === 'surveyor'` (**`Panel.jsx:581`**).

**`src/cartograph/SurveyorPanel.jsx:70-172`** currently owns: hero-pick (`HeroSubjectPicker`, 15-45), **smoothing** (`SmoothingControl`, 54-68, store `streetSmooth` default 0.5), street metadata name/type/oneway (103-123), anchor (130-140), **caps** Cap Start/Cap End = none|round|blunt (144-163, store `capStart`/`capEnd`).

The geometry is built LIVE by `buildTileGround` (`src/cartograph/lib/tileGround.js`), called at **`BlockGeometryV2Debug.jsx:544`** inside a `useMemo` — same inputs → **live == bake** (WYSIWYG). It already consumes `curbWidth, smooth: streetSmooth, cornerRadiusScale, cornerRadiusOverrides, cornerCornerRadiusOverrides`. You do not need to touch the construction for the consolidation; you DO touch the corner-handle reader for the bug.

---

## 2. THE WORK — two parts

### Part A — Consolidate shape authoring INTO the Survey tab

Today the controls that shape the hardscape are scattered. Bring the SHAPE controls into `SurveyorPanel.jsx`, next to smoothing + caps, and make the on-canvas handles obey the tool.

**A1 — Corner-R kit → Survey.** The 3-tier corner radius (global `cornerRadiusScale` × per-IX `cornerRadiusOverrides` × per-corner `cornerCornerRadiusOverrides`) currently lives in `Panel.jsx` `CornersSubsection:104-244` under "Blocks › Shape" (global "Corners" slider min 0 / max 11 / step 0.01 at 153-162; edit-mode toggle `setCornerEditMode` at 191-197). **Move this subsection's controls into `SurveyorPanel`.** Store keys/setters (in `src/cartograph/stores/useCartographStore.js`): `cornerRadiusScale` (default 289, setter `setCornerRadiusScale:736`), `setIxCornerRadius:763-781` (per-IX, clamp 0-50m), `setCornerCornerRadius:809-821` (per-corner). The on-canvas editor is `CornerEditHandles.jsx` (toggled by `cornerEditMode`).

**A2 — Asphalt-edge handle (`pavementHW`) → Survey.** This handle (how far the chain strokes outward = the asphalt silhouette) lives in the Measure stack today: `MeasureOverlay.jsx:154` emits `{ r: asph.outerR, kind: 'pavementHW' }` from `sideBoundaries():149`; rendered 734-751; drag wired `onPointerDown/Move/Up:454-550` writing `blockCustoms` via `writeBlockEdgeCustoms()`. **The asphalt-edge handle must show + be editable when `tool === 'surveyor'`.**

**A3 — Handle visibility (Jacob, resolved — `HANDOFF-survey-section-tool-design.md` §Resolved #1):** each tool shows **ONLY its own** handles. **Survey shows: the asphalt-edge handle + the corner handles. It does NOT show the ped handles** (`treelawnOuter`/`propertyLine` — those are Section's, brief #2). The map geometry still renders fully; only the tool's own handles are interactive/visible. (Symmetrically, Section will hide the asphalt-edge + corner handles and show ped handles — but that is brief #2; just make sure your gating is by `tool` so #2 can mirror it.)

### Part B — FIX the corner-handle ↔ curb detachment (the correctness centerpiece)

**Symptom (Jacob's eye, 2026-06-02 night):** the magenta corner handle detaches from the curb on **most** corners — it floats out in the street instead of lying on the achieved curb arc. The intent ("one corner truth"): the handle IS the achieved fillet arc, so what you grab is exactly what's baked.

**Where:** `CornerEditHandles.jsx`. It reads the **achieved** geometry from the store: `tileCornerFillets` (line 251), published by the live builder at `BlockGeometryV2Debug.jsx:561-563` (`setTileCornerFillets(tileGeos?.cornerFillets || {})`; `tileGround` returns `cornerFillets` ~line 555). The handle's at-rest position is computed in `grabTarget(entry, c):282-290`: with an achieved fillet `{apex, C, r, tA, tB}` it places the handle at the **arc midpoint** `[C[0]+(ax/al)*r, C[1]+(az/al)*r]` (284-288); **on a missing/incomplete fillet it falls back to the apex `c.Q`** (290). Rendering mirrors this at 474-476.

**Because it detaches on MOST corners — not a few — suspect a SYSTEMATIC key/lookup mismatch, not rare incomplete fillets:**
- Does the key `CornerEditHandles` uses to index `tileCornerFillets` (`sortedCornerKey(...)`) match the key `tileGround.js` uses when it *writes* `cornerFillets`? Grep both sides; compare canonicalization (leg order, IX id, rounding).
- Is `tileCornerFillets` actually populated when the editor renders (effect ordering / the `useMemo` rebuild)? If most lookups miss, every handle falls back to `c.Q` (the apex out in the street) — which is exactly the reported symptom.
- Are `tA/tB` present and valid (the render guard at 474-476)? A populated-but-`tA/tB`-less fillet also degrades.

**Diagnose first, then fix the join** so the handle sits on the achieved curb arc on every corner, including after a drag/re-bake. Don't paper over it by always drawing an idealized `cornerArc()` — the point is the handle reads the ACHIEVED fillet (`cornerFillets`), the same geometry the curb is built from. That correspondence IS the deliverable.

---

## 3. EXPLICIT NON-SCOPE (do not do these here)

- **Curb width is NOT consolidated into Survey.** Jacob's call (2026-06-02): curb thickness is an *aesthetic* choice → it becomes a **Section** cosmetic material lip with its own shader, not an authored Survey width. Leave the existing `curbWidth` slider (`Panel.jsx CurbSubsection:252-299`, store default 0.1524) where it is; the Section brief relocates/reframes it. Do not move it into `SurveyorPanel`.
- **No ped handles, no treelawn/sidewalk widths, no ADA pad, no strip LU↔SW swap, no dead-end fill** — all Section (brief #2), on the frozen shape.
- **Smoothing P3 is DEFERRED** (Jacob's scope-control call). Keep the working global `streetSmooth` slider exactly as-is. Do NOT implement auto-smoothing, render-raw-when-selected, or jacked-up curve fineness now.
- **No chains-die wall.** The ground bake already freezes geometry; the deep wall is a later, separate arc.

---

## 4. Definition of done

1. With the Survey tool active in the Designer: the **corner-R kit** (global slider + edit-mode + per-IX/per-corner overrides) and the **asphalt-edge handle** are present and functional from the Survey surface; **only** Survey's own handles (asphalt-edge + corner) show — ped handles are hidden.
2. The **magenta corner handle lies on the achieved curb arc on every corner** (not floating), at rest and after a drag/re-author.
3. **WYSIWYG preserved:** live Designer == bake (same `buildTileGround`). Smoothing, caps, metadata, anchor still work.
4. No regressions to Measure/Section's existing handles (you're gating by `tool`, not deleting).

---

## 5. Constraints / gotchas (banked lessons)

- **Validation is Jacob's EYE on the live Designer, not a proxy render.** A self-built rasterizer/math reading that disagrees with the app is void. (`AGENT-VALIDATION-SURFACES.md`; banked: proxy-render-is-not-the-operator's-eye.)
- **Verify edits actually applied** before trusting any test/build output (Edit-then-Bash can race) — Read or `git diff` to confirm.
- **`scratch/` is git-tracked** shared project files — don't `rm -rf` it; delete throwaways by exact name only.
- **Don't recreate retired defenses.** The corner construction has no radius clamps in emit (Clipper/jtMiter handle degeneracy); don't import old clamp patterns.
- Translucency-focus is **by design** (RIBBONS §5) — not a bug.

---

## 6. How to eyeball (validation surface)

The Designer renders LIVE via `buildTileGround` — **no bake needed.** Eyeball in the **Toy Designer**: run the dev server, open the Toy scene's Designer, select the **Survey** tool, **hard-refresh** after code changes. (Toy's Stage is a not-hooked-up stub; the Designer is the live surface.) When the toy looks right, Jacob confirms on his eye; then a real bake check on LS (`node cartograph/bake-ground.js --look=lafayette-square` — ⚠️ you MUST pass `--look=lafayette-square`; an unflagged bake writes a phantom `baked/default/` that nothing reads).

---

## 7. Commit ladder (suggested)

1. A1+A3 — relocate corner-R kit into `SurveyorPanel`; gate handle visibility by `tool` (corner handles Survey-only).
2. A2 — asphalt-edge handle shows/edits under Survey.
3. B — corner-handle↔curb detachment fix (the centerpiece). Likely the most diagnostic effort; commit the diagnosis finding in the message.

Stop and report after the construction is consolidated + the corner bug is fixed on toy. Jacob's eye gates the freeze; then Section (brief #2) begins.

*Provenance: Boz, 2026-06-02. Grounded in HANDOFF-survey-section-tool-design.md + a fresh code-location sweep. Cold-start self-contained per the new dispatch model (no warm agent).*
