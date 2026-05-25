# Brief 19 — Persist + bake the authored chassis transform (gizmo → composition → baked geometry)

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

**Name yourself — and it MUST be a name that has not already been used in this project.** Babies here pattern-match to names in NOTES.md / commits and pick collisions (Holm, Cambium were repeat misfires). This brief touches `generate-salon.js` (Sorrel's transform-bake) + `SalonWorkstage.jsx` (Sequoia/Vellum/Lintel) + `SpecimenViewport.jsx` (Vantage/Cork) — those names will be in your field of view. **Do not reach for any name you see in the code.**

**Names already claimed — do NOT reuse any of these:** Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Mullion, Adze, Plumb, Vellum, Lintel, Gnomon, Hazel, Olmsted, Wren, Penzias, Nimbus, Sorrel, Boz.

**Pick something novel** — a non-plant noun, a mineral, a tool, a star, a weather term, an architectural term, an invented word. The plant-adjacent namespace is saturated; reach further. State your name in your first message; sign your commits with it.

---

## Why this brief exists — a real authoring-loss bug, blocking the deformer

The Salon viewport's gnomon gizmo (drag handles + floor rotate-ring + `TopDownSchematic` pivot indicator) lets the operator **stand up, center, and scale** chassis — load-bearing because many chassis are extracted from group kits that were broken apart, arriving mis-oriented (Z-up instead of Y-up, off-center, leaning). The "Y-up trunk (90° X)" button (`SalonWorkstage.jsx` ~952) is exactly this correction.

**The bug:** that authored transform is **inspection-only and evaporates.** In `SlotCard` (SalonWorkstage.jsx:501-509) `rotationY` / `posOffset` / `scaleOverride` / `tiltX` / `tiltZ` are local `useState`, reset on every `[species, slot, chassis]` change, and **never written to the composition** — the tilt handlers are `onTiltXChange={setTiltX}` (local only, line 617-618), no `onParams` call carries them, and on-disk `compositions.json` has no transform field. Line 497 literally comments `// Inspection-only transforms`. So the operator corrects a model's orientation, sees it right in the viewport, then on adopt/publish/slot-switch **the correction is thrown away** and the chassis ships mis-oriented. Operator confirmed 2026-05-25 this was a surprise, not a known limitation.

**Why it blocks Brief 3A (deformer):** a per-instance lean is only meaningful on a chassis that's first standing upright about a correct base. The deformer's pivot is computed from the *published* geometry at merge time — so if the orientation correction never bakes in, the deformer would lean already-crooked trees about already-crooked pivots. **This brief is 3A's prerequisite.** Once the authored transform bakes into the published GLB, 3A's merge-time pivot lands on the corrected base automatically.

## Read first

- `src/arborist/SalonWorkstage.jsx`:
  - lines ~497-509 — the inspection-only gizmo state (your persistence target)
  - lines ~536-541 — how the gizmo flows to `<SpecimenViewport>` (`effectiveScale` / `positionOffset` / `rotationOffset` + the `onScaleChange`/`onPositionChange`/`onRotationChange` callbacks)
  - lines ~614-618 — `onParams` + tilt handlers passed to the controls panel
  - lines ~345 — the `onParams` → `setSlotParams` persistence path you'll extend
- `src/arborist/SpecimenViewport.jsx`:
  - lines ~1000-1045 — `<Skeleton>` receives `scale`/`positionOffset`/`rotationOffset`; `TreeGizmo` + `TopDownSchematic` read the same. **Inspect the `<Skeleton>` component's internal transform composition — this is load-bearing** (see Architecture).
- `arborist/generate-salon.js`:
  - `bakeAllNodeTransforms` (~664-755, Sorrel's Brief 2.1c) — the 4×4-into-POSITION + upper-3×3-into-NORMAL bake you'll mirror for the authored transform. Runs at ~753.
  - `patchManifestForSalon` — where per-composition specs get written; consider whether the transform needs to surface here too.
- `src/arborist/stores/useArboristStore.js` — `setSlotParams` (handles nested `bark`/`leaves` patches; verify it cleanly handles a new `transform` nested patch).
- Memory: `[[feedback_baby_briefs_need_identity_framing]]`, `[[feedback_baby_must_surface_scope_drift]]`, `[[feedback_geometry_briefs_need_artifact_inspection]]` (inspect the viewport transform order FIRST), `[[project_preview_equals_ls_literally]]` + `[[feedback_salon_preview_is_authoring_surface]]` (the bake MUST replicate what the viewport displays — that's the whole point), `[[feedback_json_stringify_loses_handauthored_format]]`, `[[project_doped_artifact_placecard_edit_pattern]]`.

## Goal — and what this phase explicitly does NOT do

**Goal:** the authored gizmo transform (`posOffset`, `rotation [tiltX, rotationY, tiltZ]`, `scale`) persists to `composition.transform`, hydrates back into the gizmo on load, and **bakes into the published GLB geometry** so the chassis ships oriented/positioned/scaled exactly as the operator saw it in the viewport. Identity transform (no authoring) → byte-identical to today (regression-safe).

**Do NOT:**
- Touch the deformer (3A — paused, separate brief). This brief is its foundation, not the deformer itself.
- Change the gizmo's *interaction* (drag handles, rotate ring, TopDownSchematic) — they work; you're persisting + baking their output, not rebuilding them.
- Re-recenter after the authored bake. The authored transform IS the operator's final placement — recentering would undo their posOffset. (survey-deleaf's chassis-creation recenter is upstream + unchanged.)
- Apply the transform as a runtime per-instance transform. It bakes into geometry at publish (so the deformer's merge-time pivot reads corrected geometry, and the slab carries the correction statically). **Bake-time, not runtime.**
- Touch `forestryRotation` (the LS-runtime forestry orientation, separate concern — note how it composes downstream but don't author it here).
- Add per-Look transform overrides or PlaceCard transform binding (out of scope; this is per-composition authoring).

## Architecture

**Schema (`composition.transform`):**
```json
"transform": {
  "posOffset": [0, 0, 0],
  "rotation":  [0, 0, 0],   // [tiltX, rotationY, tiltZ] radians, matching the gizmo
  "scale":     1.0
}
```
Default identity → no-op. Absent → identity (back-compat: every existing composition renders unchanged).

**Persistence (client):**
1. The gizmo `onChange` callbacks (`onScaleChange`/`onPositionChange`/`onRotationChange` + the tilt handlers) must, in addition to setting local state, **fire `onParams({ transform: {...} })`** so the value persists via `setSlotParams` → `compositions.json`. Mark the slot dirty (same as any param edit → adopt required).
2. **Hydration:** the current reset-to-defaults effect (lines 506-509) must instead **hydrate the gizmo state FROM `composition.transform`** on `[species, slot, chassis]` change (default to identity if absent). This is the read-back that makes authored corrections reload instead of vanishing. ⚠️ Get this right — naive "keep the reset" leaves persistence write-only (saves but never reloads).

**Bake (producer — the load-bearing correctness requirement):**

The bake MUST replicate the viewport's transform composition **exactly**, or the baked geometry won't match what the operator authored (violates `[[project_preview_equals_ls_literally]]`). So **inspect the `<Skeleton>` component first** (per `[[feedback_geometry_briefs_need_artifact_inspection]]`):
- What order does three.js compose `scale` + `position` + `rotation`? (Standard is `M = T · R · S`, rotation as Euler in the object's declared order — confirm the Euler order the `rotationOffset` array maps to: `[tiltX, rotationY, tiltZ]` → is it XYZ?)
- What is the **rotation pivot**? (The model-group's local origin. Where does the GLB geometry sit relative to that origin — is the trunk base at origin, or offset? This determines whether rotation tilts about the base or about a floating point. The operator uses posOffset to place the base after rotating — so replicate: rotate about group origin, THEN translate by posOffset.)

Then, in `generate-salon.js`, AFTER `bakeAllNodeTransforms` flattens the chassis nodes (so geometry is in chassis-root-local space — the same space the viewport's `<Skeleton>` renders), build the authored transform's 4×4 matrix replicating the viewport's `T · R · S` and bake it into POSITION + NORMAL using the existing `bakeInto`-style helper (upper-3×3 for normals + renormalize; the authored `scale` is uniform so this is exact). No re-recenter afterward.

**Deformer-compatibility guarantee:** because the transform bakes into the published geometry, 3A's merge-time per-chassis pivot will read the *corrected* base — no coordination needed beyond "this lands first." Document this in the commit so the (paused) 3A baby knows its premise is now sound.

## File-by-file plan

| File | Status | ~LOC |
|---|---|---|
| `src/arborist/SalonWorkstage.jsx` | edit — gizmo onChange → `onParams({transform})`; replace reset-to-defaults with hydrate-from-`composition.transform`; mark dirty | +50 |
| `arborist/generate-salon.js` | edit — build authored-transform 4×4 + bake into POSITION/NORMAL after `bakeAllNodeTransforms`, no re-recenter | +60 |
| `src/arborist/stores/useArboristStore.js` | verify/extend — `setSlotParams` handles a `transform` nested patch | +0-10 |
| `arborist/state/<species>/compositions.json` (+ schema doc) | data — `transform` field | — |
| `arborist/FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md` | edit — document the persist+bake path + the bug it fixes | +40 |

Estimated ~200 LOC.

## Acceptance criteria

1. **Authored transform persists.** Tilt/rotate/reposition/scale a chassis in the Salon viewport → the values write to `composition.transform` in `compositions.json` (verify on disk). Slot goes dirty; Adopt persists.
2. **Hydration round-trips.** Switch away from the slot/chassis and back → the gizmo reloads the authored transform (not reset to defaults). Reload the page → still there.
3. **Bake matches viewport (load-bearing).** Author a correction (e.g. the 90° X "Y-up trunk" flip + a posOffset to center), Re-publish, then load the published GLB — its geometry is oriented/positioned/scaled **identically to what the viewport showed**. Per `[[project_preview_equals_ls_literally]]`. The Z-up kit model now ships Y-up.
4. **Identity is a no-op.** A composition with no `transform` (or identity values) publishes byte-identical geometry to today. Every existing composition unchanged. Regression-safe.
5. **No double-transform.** The transform bakes once into geometry; the viewport still applies it for live display (authoring), but the *published* GLB has it baked and is NOT re-transformed at runtime. Confirm the published tree in LS/Grove isn't double-rotated.
6. **Normals correct.** After a rotation bake, lighting reads correctly (upper-3×3 normal transform + renormalize; uniform scale). No inverted/flat normals on flipped models.
7. **No re-recenter regression.** The authored posOffset survives the bake (not cancelled by a recenter). A model the operator pushed off-center stays where they put it.
8. **Determinism.** Same composition + transform → byte-identical published GLB across two runs.
9. **Deformer premise restored.** Document (commit body) that 3A's merge-time pivot now reads corrected geometry — the prerequisite is satisfied.

## Surface anything not in this brief

Per `[[feedback_baby_must_surface_scope_drift]]`:
- **Viewport transform order + pivot** — the exact `<Skeleton>` composition (T·R·S order, Euler order, rotation pivot, where geometry sits vs group origin). If it's not a clean T·R·S-about-origin, surface the actual shape BEFORE writing the bake — the bake must match it exactly. This is the alignment-check point.
- **`forestryRotation` interaction** — there's a `forestryRotation` prop (false in Salon). Confirm it doesn't double-apply with the authored rotation at LS runtime. Surface how they compose.
- **survey-deleaf recenter vs authored transform** — the 141 Whittle chassis weren't recentered (the lean offset); the authored transform corrects on top. Confirm the authored bake composes correctly with whatever recenter state the chassis arrives in.
- **Existing compositions with mis-oriented chassis** — operator may have live compositions whose chassis are currently shipping mis-oriented (the bug). After this lands, they'll need to re-author the correction (it was never saved). Flag that the fix is forward-only — past lost corrections don't auto-restore.
- **`scaleOverride` semantics** — is it uniform scale only, or could it ever be non-uniform? The normal bake assumes uniform. Confirm + guard.
- **Adopt vs live-edit** — whether the transform should persist on every gizmo drag (debounced) or only on Adopt. Match the existing param-edit pattern; surface your choice.

## Out of scope

- Brief 3A deformer (paused; this is its prerequisite)
- Per-Look transform override / PlaceCard transform binding
- Rebuilding the gizmo interaction (handles/ring/schematic work)
- `forestryRotation` authoring
- Runtime per-instance transform (this is bake-time)
- Retroactively restoring corrections lost to the bug (forward-only fix)

## Dispatch posture

Cold dispatch. Touches `SalonWorkstage.jsx` + `generate-salon.js` + store + `SpecimenViewport.jsx` (inspection only). Currently parallel-safe with Brief 14.1 (`serve.js` / `ProceduralWorkstage.jsx` — zero overlap); **but it shares `SalonWorkstage.jsx` with any future 18B/3A work — serial-dispatch those** per `[[feedback_load_bearing_files_serial_dispatch]]`. Single commit when AC 1-9 pass. Title: `arborist: Salon — Brief 19 (<your-name>) — persist + bake authored chassis transform`.

Per `[[feedback_geometry_briefs_need_artifact_inspection]]`: inspect the `<Skeleton>` viewport transform composition BEFORE writing the bake. If the order/pivot isn't the clean T·R·S-about-origin this brief assumes, surface it in an alignment check — the bake-matches-viewport AC (#3) is the load-bearing correctness requirement and it hinges entirely on replicating the viewport exactly.

— Boz
