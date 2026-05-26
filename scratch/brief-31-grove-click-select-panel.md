# Brief 31 — Grove: click-to-select → fixed editor panel (fix the chasing hover-card)

**You are the dispatched agent executing this brief.** Not the orchestrator. Boz drafted it; Jacob dispatched it. Do the work yourself.

**Name yourself — a name NOT already used.** Claimed: Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Mullion, Adze, Plumb, Vellum, Lintel, Gnomon, Corbel, Quartz, Sextant, Mistral, Hazel, Olmsted, Wren, Penzias, Nimbus, Sorrel, Cant, Cadastre, Scion, Sift, Boz. Pick something genuinely novel (a verb, a current, a knot, an invented sound) — not a near-neighbor of those.

## ⚠️ Write/commit boundaries (read before you touch anything)

- **You own + commit:** `src/arborist/Grove.jsx` and any small new component you add (e.g. a `GroveEditorPanel`). `git add` **only those files** (never `git add -A`/`.`), commit signed with your name.
- **OFF-LIMITS — do NOT edit or commit:** the canonical quartet (`FEATURES`/`ARCHITECTURE`/`BACKLOG`/`NOTES`), living docs (`ROSTER-COVERAGE`), operator in-flight files (`public/looks/*`, `public/baked/.../scene.json`, `arborist/state/_chassis-curation.json`), the slab, the LS runtime/shaders, and `serve.js`/`generate-salon.js` (you shouldn't need them — see below).
- **Check in at the doc seam:** Boz (coordinator) is active in the shared tree. So **do not write the `FEATURES`/`NOTES` updates yourself** — instead, in your final report, hand Boz the exact doc deltas (the Grove-section rewrite + a one-line NOTES entry) and Boz applies them. This keeps the canonical docs race-free. (Per the Agent-brief boundaries doctrine, 2026-05-25.)

## The bug (already diagnosed — don't re-derive, confirm + fix)

The Grove's per-tile editor is a drei `<Html position={[0,0.05,0]}>` card anchored to each tile, **rendered only while `hovered`** (`Grove.jsx` ~362). Three symptoms, one root cause:
- **"Chase it around"** — the Html card follows the tile's *screen projection* as the camera orbits.
- **"Not sure which tree it's attached to"** — many tiles, small offset, ambiguous anchor.
- **"Click does nothing"** — moving the cursor off the tile mesh to reach the card fires the tile's `onPointerOut` → `hovered` goes null → **the card unmounts before the click lands.**

**The handler is fine:** `toggleInLook` (`useArboristStore.js:87`) correctly filters the entry out of `looksRosters` + persists via `_saveLookRoster`, and `activeLookId` is set (the button reads "Remove from Lafayette Square"). So this is purely the card's **lifecycle + positioning** — not the action.

## The fix

Replace the transient, tile-anchored hover-card with **click-to-select → a fixed editor panel**, per `[[feedback_focus_one_over_grid_for_3d_inspection]]` (a focused panel beats a grid of chasing hover-cards):

- **Click a tile → it becomes the selected tile** (local Grove `selected` state keyed by `{speciesId, variantId}`), with a clear visual highlight on the selected tile in the 3D scene.
- **The editor renders in a STABLE fixed panel** (a side rail or bottom bar in the Grove's DOM chrome — NOT a drei `<Html>` anchored to the tile). It doesn't move with the camera and is unambiguously bound to the selected tile (show the tile's species/variant label in the panel header).
- **Reuse the existing `EditorCard` controls verbatim** — rating ladder (`onSetOverride`), category, notes, **Remove/Add-to-Look toggle (`onToggleInLook`)**, set-canary. Same handlers, same store actions; you're changing *where it renders and what drives it* (click-selection, fixed position), not the logic.
- Hover may keep a *light* highlight as a cheap preview, but **the editor is selection-driven**, not hover-driven — so it never vanishes mid-interaction.
- Clicking empty space (or a close affordance) deselects.

## What this does NOT do (scope walls)

- **No data/logic changes** — reuse `toggleInLook` / `onSetOverride` / the store actions unchanged. No `serve.js`, no `generate-salon.js`, no roster/publish/bake changes.
- **Don't touch** the Gallery↔Coverage view toggle, the scope controls, or `CoverageView.jsx` (Brief 24) — only the per-tile editor presentation.
- **No runtime/shader/slab touch.** Grove is an authoring UI.
- Don't fix the separate "syncLookRoster is additive-only" gap (that's a different brief).

## Read first

- `src/arborist/Grove.jsx` — `Tile` (~284), the `hovered` state (~62), the `<Html>` card (~362), `EditorCard` (~384) + its controls (rating ~433, category ~453, Remove toggle ~487, canary ~516). This is your whole surface.
- `src/arborist/stores/useArboristStore.js` — `toggleInLook` (~87) + the other actions the card calls. **Read-only — reuse, don't change.**
- Memory: `[[feedback_focus_one_over_grid_for_3d_inspection]]`, `[[feedback_baby_briefs_need_identity_framing]]`, `[[feedback_baby_must_surface_scope_drift]]`.

## Inspection points (surface before building)

1. **How `EditorCard` is parameterized today** — confirm all its controls can render unchanged in a fixed panel fed by `selected` instead of `hovered` (they should; they take props + callbacks).
2. **Tile click vs OrbitControls drag** — make sure a tile *click* (select) is distinguished from a camera *drag* (don't select on drag-release). Surface how you disambiguate.
3. **Multi-instance / mesh picking** — confirm tile `onClick` reliably identifies the right `{speciesId, variantId}` (the existing `onPointerOver` already resolves it; reuse that identity path).

## Acceptance criteria

1. The per-tile editor no longer chases the camera — it's a **fixed panel** that stays put.
2. **Clicking a tile selects it** (visible highlight) and opens its editor in the panel, unambiguously labeled with the tile's species/variant.
3. **Remove-from-Look works on click** — toggling removes/adds the entry (verify the tile's `inLook` state + the roster update); the click never lands on a vanishing element.
4. All existing EditorCard controls (rating / category / notes / canary) work from the panel.
5. Gallery↔Coverage + scope controls + `CoverageView` untouched; no `serve.js`/runtime/slab changes.
6. vite build clean. **You commit only `Grove.jsx` (+ any new panel component), signed with your name; you hand Boz the FEATURES/NOTES deltas rather than editing them.**

## Surface anything not in this brief

Per `[[feedback_baby_must_surface_scope_drift]]`: if making the panel fixed requires touching shared layout/chrome beyond `Grove.jsx`, or if the tile-click vs orbit-drag disambiguation needs a library affordance you didn't expect, surface it. If you find the dead-click has a *second* cause beyond the hover-unmount (e.g. Html pointer-event swallowing), report it — don't silently paper over it.

## Dispatch posture

Focused Grove-UX fix, ~100–200 LOC in `Grove.jsx` (+ maybe a small panel component). Solo. No dependency gate — dispatch anytime. Authoring-UI only; no slab/runtime risk. Boz applies the doc deltas from your report + marks it in BACKLOG.
