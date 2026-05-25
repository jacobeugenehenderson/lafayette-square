# Brief 18 — Arborist Library page: centered category navigation

You are the dispatched baby agent for Brief 18 in the Arborist Salon arc. Before you start work, pick a name for yourself (one word, plant/wood/forestry-adjacent, your call) and use it in your commit message + status updates. We find it helps to give each baby an identity — it keeps the trail of who-shipped-what readable in the log.

Operator wants the Arborist landing page to read as a **workflow surface** instead of an inventory dump. Today it's a flat 68-row species list with header arrow buttons (PROCEDURAL / SALON / LIDAR / GROVE) crowded into the top-right. Replace the three workspace-arrow buttons with a centered category-nav row in the page body; the active category filters the species list. Keep Grove where it is — it's per-Look roster curation, a different kind of work.

## Read first

- `arborist/BACKLOG.md` — Brief 18 entry + Brief 15 (just-shipped server-side classifier this brief reuses)
- `arborist/NOTES.md` — most recent entries (Brief 13, Brief 10A pivots, session housekeeping)
- `src/arborist/ArboristApp.jsx` — the file you'll change; lines 54–193 are the Library view; 130–183 are the flat-list rendering you'll be filtering
- `arborist/serve.js#listSpecies` (lines 211–262) — species list payload, you'll extend this with one field
- `arborist/generate-salon.js#isProceduralSpecies` + `hasLidarSeedlings` (lines 348–356) — the classifier helpers you'll lift up to a shared module
- Memory: `[[feedback_baby_must_surface_scope_drift]]`, `[[feedback_salon_preview_is_authoring_surface]]`

## Goal — and what this phase explicitly does NOT do

**Goal:** centered category nav at the top of the Library body; clicking a category filters the species list to that category AND (when its workspace exists) lands the operator in the right workspace via the existing per-row click. Default landing = Salon (today's authoring focus). Last-active category persisted to `localStorage.lastArboristCategory` for return-trips.

**Do NOT:**
- Touch any of the four workstage files (`SalonWorkstage.jsx`, `ProceduralWorkstage.jsx`, `LidarWorkstage.jsx`, `Workstage.jsx`) — workstage internals are out of scope
- Touch Grove or its arrow button — leave it on the right side of the header where it is
- Change the per-row click behavior — `setActiveSpecies(s.id)` stays; downstream `if (salonOpen) return <SalonWorkstage/>` ladder stays
- Animate category transitions — snap-only, like the Brief 13 preset cameras
- Add a thumbnail browser — v1.6 backlog item

## Architecture

**Server: one field added to the species list payload.**

`arborist/serve.js#listSpecies` already merges declared + baked species. Add a `category: 'procedural' | 'lidar' | 'salon'` field per row, classifier precedence matching Brief 15's filter precedence:

1. `isProceduralSpecies(id)` → `'procedural'`
2. else if `seedlingCount > 0` (LiDAR Scan-mode seedlings present, same signal as Brief 15's `hasLidarSeedlings` but sync — `listSpecies` already reads the seedlings file at line 218) → `'lidar'`
3. else → `'salon'`

Lift `isProceduralSpecies` out of `generate-salon.js` into a tiny shared classifier module (`arborist/species-category.js`) and import from both `serve.js` + `generate-salon.js`. `hasLidarSeedlings` (async fs.access) stays put — `serve.js`'s loop already has the sync seedlings read at hand, no second-source-of-truth concern as long as the precedence rule matches.

**Client: category state + filter pass + a centered nav row.**

In `src/arborist/ArboristApp.jsx`:

- New state: `const [category, setCategory] = useState(() => localStorage.getItem('lastArboristCategory') || 'salon')`. Persist on change.
- Filter pass at render time: `const visibleSpecies = species.filter(s => s.category === category)`. Render that instead of `species` in the flat-list `.map`.
- New `<CategoryTabs>` component placed inside `<main>`, ABOVE the species grid. Three pill buttons: `Procedural | Salon | LiDAR`. Color tint per category matching the existing header-button identity:
  - Procedural → amber (`#e8c878` text, `rgba(232,184,96,0.15)` background, `rgba(232,184,96,0.4)` border)
  - Salon → purple (`#c89cf0` / `rgba(192,140,232,0.15)` / `rgba(192,140,232,0.4)`)
  - LiDAR → cyan (`#7fc8e0` / `rgba(126,200,224,0.12)` / `rgba(126,200,224,0.4)`)
  - Active state: same color at full saturation; inactive: 40% opacity wash. Same `letterSpacing: '0.08em', textTransform: 'uppercase'` typography as the header buttons.
- **Header cleanup**: remove the `Procedural →`, `Salon →`, `LiDAR →` buttons (lines 74–112). Keep `LookPicker`, keep `Grove →` (line 113–125), keep `{species.length} species`.
- Optional but recommended: the species-count chip becomes `{visibleSpecies.length} of {species.length}` to make filter clarity obvious. Operator can tell us "drop it" if it reads noisy.

**Workspace entry: do NOT auto-open a workstage on category click.**

This is the subtle design call. The existing flow is: click a species row → `setActiveSpecies(id)` → the `if` ladder at line 48 routes to Workstage. Category change just filters the row list; it does NOT call `setSalonOpen(true)`. Why: clicking a category should not yank you out of the Library view if you're trying to scan rosters. The operator enters a workstage by clicking a species, same as today — only what's visible changes. (This diverges from the BACKLOG entry's "Clicking a category button navigates into the corresponding workspace" line; surface this divergence in your commit body so we can flip the behavior if the operator preferred the auto-open semantics.)

## File-by-file plan

| File | Δ | Notes |
|---|---|---|
| `arborist/species-category.js` (new) | ~15 LOC | Lifts `isProceduralSpecies` + exports a `classifyCategory(id, seedlingCount)` helper |
| `arborist/serve.js` | ~5 LOC | Import classifier; add `category:` field in both `listSpecies` push blocks (declared + baked-undeclared) |
| `arborist/generate-salon.js` | ~3 LOC | Replace local `isProceduralSpecies` with import |
| `src/arborist/ArboristApp.jsx` | ~120 LOC | `category` state + localStorage persist + filter pass + `<CategoryTabs>` component + remove 3 header buttons |

Estimated total: ~140 LOC. Well inside the BACKLOG's 150–200 budget.

## Acceptance criteria

1. Library page loads with one of `Procedural | Salon | LiDAR` highlighted (Salon by default first-mount; last-active on return-trips via localStorage).
2. Clicking a category filters the species grid to only that category's rows. The grid layout + per-row chrome is unchanged — same `s.label`/`s.scientific`/`s.source` chip rendering.
3. Header now shows only `LookPicker` + `Grove →` + species count chip. The three workspace-arrow buttons are gone.
4. Color identity preserved: Procedural=amber, Salon=purple, LiDAR=cyan. Active tab pops, inactive tabs read dim.
5. `arborist/serve.js GET /species` payload now carries `category` per row. Curl-test:
   ```
   curl -s localhost:3334/species | jq '.species[] | {id, category}' | head -20
   ```
   should show one of three categories per species; procedural-suffix IDs are `'procedural'`, IDs with seedlings are `'lidar'`, rest are `'salon'`.
6. Clicking a species row still routes correctly — Salon-category click lands in the existing flat-list per-row click handler (`setActiveSpecies` → `Workstage`), no auto-open of workstages.
7. `npm run dev` clean console; no React key warnings; no fetch errors when switching categories.

## Constraints

- **No workstage edits.** All four workstage files untouched. This brief lives in `ArboristApp.jsx` + `serve.js` + one new tiny `species-category.js`.
- **No store changes.** `useArboristStore` stays exactly as-is. Category state is local to `ArboristApp` — no slice, no action, no persisted side-effect beyond `localStorage`. (Pattern matches `previewLod`'s pre-Brief-16 local-state lifetime.)
- **Stash-isolate.** Brief 6.2 is dispatching in parallel and touches `publish-glb.js` + `decimate-tree.mjs` + atlas-pack code. Zero file overlap with this brief — confirm `git status` shows only the four files above before you commit. If a worktree was set up for you, work there; if not, just be tidy.
- **Deterministic classifier.** No race conditions on the lidar-detection signal. Use `seedlingsPicked > 0` (already in the payload) rather than re-reading the disk. If you find a case where `seedlingsPicked` is stale vs the actual `seedlings.json` content, surface it — don't paper over.

## Surface anything not in this brief

Per `[[feedback_baby_must_surface_scope_drift]]`, watch for and disclose in your commit body:

- Stale or duplicate species rows (e.g. a baked-undeclared species that classifies awkwardly) — fix in passing if trivial, surface either way.
- Visual collisions between the new category nav row and existing chrome (e.g. the species-count chip in the header reading double-info now that the filter also displays a count).
- localStorage hydration edge cases (first-mount with no value, value of `'grove'` from a hypothetical earlier session, etc.). Guard with the three-valid-categories check.
- If the auto-open-workstage-on-category-click behavior reads better to you while iterating, surface it as a follow-up — don't ship it unless the operator asks (they may, after seeing the filter-only version).
- Any other small wins you spot in `ArboristApp.jsx` (the file has accumulated mode-toggle history) that would fit naturally — but don't volunteer big refactors.

## Out of scope

- Workstage internals (all four)
- Grove's button or position
- Thumbnails / preview chips per species (v1.6)
- Keyboard navigation between categories (could be a follow-up if the operator wants it)
- Animated category transitions
- Per-category empty-state messaging (the filter just produces an empty grid; that's fine for v1)
- Touching `species-map.json` or any species declarations
- Any shader, bake, or atlas work

## Dispatch posture

Cold dispatch. Pure UI + tiny server-side classifier surface; no need for warm context from a prior baby. Expected wall-time: ~1.5 baby hours. Single commit when AC 1–7 pass.

— Boz
