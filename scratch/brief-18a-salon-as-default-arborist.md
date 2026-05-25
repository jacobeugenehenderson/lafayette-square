# Brief 18A — Salon as the Arborist's default surface

You are the dispatched baby agent for Brief 18A. Pick a name for yourself — **it must be a name that has not already been used in this project**. We find it helps to give each baby an identity (it keeps the trail of who-shipped-what readable in the log), but name collisions destroy that, and babies in this project have a strong tendency to pattern-match to names already in the code/NOTES.

**Names already claimed in the Salon arc and adjacent work — do NOT reuse any of these:** Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Hazel, Olmsted, Wren, Penzias, Nimbus, Sorrel, Boz. If you find yourself reaching for one of these (especially Holm or Cambium — these are repeat offenders), stop and pick again.

**Pick something novel.** Anything — a word, a symbol, a string of sounds, something in another language, something invented, a non-plant noun, a mineral, a tool, a star name, a piece of weather, a body of water, an architectural term, a verb conjugation — whatever feels like you. Avoid the obvious plant-adjacent reflex; the project has saturated that namespace. State your chosen name in your first message back and sign your commits with it.

The current Arborist landing page (a flat 68-row species list with a row of workspace-arrow buttons) is the pointless stopoff. The operator's real mental model is: **Salon is the authoring surface, period.** Procedural and LiDAR are sources that should ultimately live inside Salon's slot card (Brief 18B). Grove is the destination, not a parallel workspace. This brief lands the architectural pivot — retire the Library page; ArboristApp opens directly into Salon — and leaves the source-picker merge to 18B.

## Read first

- `arborist/BACKLOG.md` — Brief 18A/B/C entries; recent Salon-arc context (Brief 13, 15, 16)
- `arborist/NOTES.md` — Brief 15 entry (Salon picker exclusion logic, load-bearing for the dev-fallback story below)
- `src/arborist/ArboristApp.jsx` — the file losing the most code; lines 26–53 are the mode-route ladder, 54–193 are the Library view (retiring), 201+ is LookPicker (lifting into Salon)
- `src/arborist/SalonWorkstage.jsx` — lines 163–213 are the existing header (gaining Grove button + LookPicker; losing the `← Library` button); lines 187–206 are the species `<select>` (stays put; this is now the primary navigation)
- `src/arborist/stores/useArboristStore.js` — the `salonOpen` / `proceduralOpen` / `lidarOpen` / `groveOpen` flags (`salonOpen` becomes default-true; others reachable only via legacy URL fallback)
- Memory: `[[feedback_baby_must_surface_scope_drift]]`, `[[project_doped_artifact_placecard_edit_pattern]]`, `[[feedback_salon_preview_is_authoring_surface]]`

## Goal — and what this phase explicitly does NOT do

**Goal:** Arborist opens directly into Salon. Top-level chrome reads `Arborist / Salon` left, species picker mid, Grove `→` right. Procedural + LiDAR workstages remain reachable only via dev-fallback URL params during the transition; they retire properly in 18B when their guts merge into Salon's slot card.

**Do NOT:**
- Touch Salon's body content below the header strip (slot tabs, slot card, chassis/bark/leaves panels, preview viewport) — all out of scope
- Touch any of `ProceduralWorkstage.jsx`, `LidarWorkstage.jsx`, `Workstage.jsx`, `Grove.jsx` internals — they stay reachable, just not in the default chrome
- Touch `arborist/serve.js` or any backend file — pure client-side pivot
- Touch `useArboristStore` slices except to set the default state of `salonOpen` to `true` (the other `*Open` flags stay; they're how legacy URL fallback opens those workstages)
- Add UI for source-picking (vendor chassis / procedural / LiDAR sources) inside Salon's slot card — that is 18B's job
- Add empty-species rows, "add to library" affordances, or N.A. landscape catalog plumbing — backlog only

## Architecture

**The Library view retires entirely.** ArboristApp's flat species list block (today the default route when no mode flag is set) is deleted. The new default route is the Salon workstage. ArboristApp's job collapses to: (a) initialize legacy-URL dev fallback on mount, (b) render exactly one workstage based on the mode flag ladder, (c) hold no chrome of its own.

**Header consolidation.** The global header in ArboristApp.jsx (today's title + LookPicker + 4 mode buttons + species count) goes away. SalonWorkstage's existing internal header strip becomes the only chrome. It gains:

- LookPicker (lift from ArboristApp.jsx lines ~73 + the LookPicker function definition starting ~201; either move the whole function into SalonWorkstage.jsx, OR keep it where it is and import — your call)
- Grove `→` button on the right side, same green color identity it has today (`#bce0a0` / `rgba(106,154,74,0.15)` / `rgba(106,154,74,0.4)`)
- `← Library` button retires (lines ~176–178 in SalonWorkstage.jsx) — no Library to return to

The header's left-side brand changes from `Salon · compose chassis · bark · leaves (Brief 1)` to `Arborist / Salon` (matching the operator's stated mental model). The `Brief 1` parenthetical retires — version chatter belongs in commits, not the operator's chrome.

**Dev-fallback URL params for legacy workstages.** A single `useEffect` in ArboristApp at mount reads `window.location.search` and routes:
- `?legacy=procedural` → `setProceduralOpen(true)`
- `?legacy=lidar` → `setLidarOpen(true)`
- `?legacy=workstage&species=<id>` → `setActiveSpeciesId('<id>')` (the pre-existing Workstage path for legacy single-species browse + bake)
- `?legacy=grove` → `setGroveOpen(true)` (also reachable via the Grove → button, but URL access is useful for bookmarks)

These are dev affordances — no UI hints them. They exist so the operator doesn't lose access to Procedural / LiDAR authoring during the transition. Order of precedence in the ladder is unchanged (Salon last, behind the others), so a legacy URL wins on mount.

**Brief 15's filter stays as-is.** Salon's species picker continues to exclude procedural-suffix and LiDAR-seedlings species. That means Sugar Maple (`acer_saccharum`, LiDAR-only) is unreachable from default chrome until 18B's source-picker lands. Operator has accepted this as a known scope wall for 18A — Sugar Maple etc. reachable via `?legacy=lidar` during the transition. Surface this loudly in your commit body.

**`salonOpen` default flips to true.** In the store slice initial value, `salonOpen: false` becomes `salonOpen: true`. The mode-route ladder in ArboristApp.jsx (today lines 48–52) collapses — Salon is the default, so the `if (salonOpen) return <SalonWorkstage/>` branch becomes the fallback at the bottom of the ladder.

Be careful: if other code reads `salonOpen` expecting it to be `false` on cold-start, flipping the default could cause regressions. Grep for `salonOpen` across the repo before committing. Likely fine — the flag was added in Brief 1 as a "is Salon currently the active workstage" indicator, which is now structurally always-true.

**The Library button on every workstage that has one.** SalonWorkstage's `← Library` retires. Grove, Procedural, LiDAR, Workstage each have their own variant. Reframe each: rename to `← Salon` and route via `setSalonOpen(true)` + clear the relevant `*Open` flag. The mental model: there's no Library — everything goes back to Salon. (Grove's button still says `← Salon` for the same reason; LookPicker stays in Salon's header so Grove doesn't need its own.)

Wait — Grove also needs LookPicker access, since it's the per-Look roster curation UX. Today it has its own LookPicker copy in its header. **Leave Grove's LookPicker alone.** It's a self-contained workspace; don't refactor it. Just make sure the `← Salon` button works.

## File-by-file plan

| File | Δ | Notes |
|---|---|---|
| `src/arborist/ArboristApp.jsx` | -130 LOC | Delete Library view block (54–193); delete the 3 retiring header buttons; delete LookPicker function if you lift it into Salon (or leave as imported); add `useEffect` for legacy-URL routing; collapse mode-route ladder so Salon is the default at the bottom |
| `src/arborist/SalonWorkstage.jsx` | +60 LOC, -8 LOC | Retire `← Library` button (8 LOC); add LookPicker block in header (existing component, reused); add Grove `→` button right-aligned; rename brand to `Arborist / Salon` |
| `src/arborist/ProceduralWorkstage.jsx` | ~5 LOC | `← Library` → `← Salon`; route via `setSalonOpen(true)` + `setProceduralOpen(false)` |
| `src/arborist/LidarWorkstage.jsx` | ~5 LOC | Same pattern |
| `src/arborist/Workstage.jsx` | ~5 LOC | Same pattern (clear `activeSpeciesId` to fall back to Salon) |
| `src/arborist/Grove.jsx` | ~5 LOC | `← Library` → `← Salon`; route via `setSalonOpen(true)` + `setGroveOpen(false)` |
| `src/arborist/stores/useArboristStore.js` | 1 LOC | `salonOpen: false` → `salonOpen: true` initial value |

Estimated total: ~95 LOC net deletion. The Library view is most of the savings.

## Acceptance criteria

1. `npm run dev` cold-boot at `localhost:5173/arborist.html` (or whatever the dev URL is — check `vite.config.js` if uncertain) lands directly in Salon. No Library list visible. No 4-button mode row visible.
2. Header reads `Arborist / Salon` left, species picker middle, LookPicker + Grove `→` right. Color identity preserved on Grove button.
3. Species picker shows the same set of species as today's Brief-15-filtered Salon dropdown. Picking a species loads its compositions in the slot tabs below.
4. Grove `→` button opens Grove; Grove's `← Salon` button returns to Salon. Round-trip clean.
5. `?legacy=procedural` URL opens ProceduralWorkstage. Its `← Salon` button returns to Salon.
6. `?legacy=lidar` URL opens LidarWorkstage. `← Salon` returns to Salon.
7. `?legacy=workstage&species=acer_saccharum` opens the legacy Workstage for Sugar Maple. `← Salon` returns to Salon and clears `activeSpeciesId`.
8. No console warnings, no broken React keys, no fetch errors. PerfGauge / SpecimenViewport / canary chip etc. all still mount cleanly in Salon.
9. The pre-pivot `salonOpen=false` cold-start path can no longer be reached through the UI (because the only path was `← Library`, now gone). Verify nothing else reads `salonOpen===false` as a meaningful signal.

## Constraints

- **Stash-isolate.** Brief 6.2 is dispatching in parallel and touches `arborist/publish-glb.js` + `arborist/decimate-tree.mjs` + atlas baking. Zero file overlap with this brief — confirm `git status` shows only the seven files above before you commit. Use a worktree if one was prepared for you.
- **One commit.** Keep it atomic — the pivot is a single architectural move, not a series of refactors. Title: `arborist: Salon — Brief 18A (<your-name>) — Arborist opens directly into Salon`.
- **Don't optimistically delete `salonOpen`.** The flag stays; only its initial value changes. Future briefs may need it as a "is Salon active" check (e.g. when 18B's source-picker decides what panels to mount). Treat as a real piece of state, just with a different default.
- **Don't unify LookPicker.** Salon and Grove each have their own; don't refactor into a shared hook or context just because the surface area cleaned up. Leave the duplication; sibling discipline to `[[feedback_load_bearing_files_serial_dispatch.md]]` — refactors land in their own commits.
- **No backend changes.** `arborist/serve.js` stays untouched. The species-list payload, Salon endpoints, etc., are stable.
- **Salon body content untouched.** Slot tabs, slot card, chassis/bark/leaves panels, preview viewport, perf gauge — none of these change. The pivot is chrome-only.

## Surface anything not in this brief

Per `[[feedback_baby_must_surface_scope_drift.md]]`, watch for and disclose in your commit body:

- Anything load-bearing in ArboristApp.jsx that I missed when prescribing deletions (a side-effect on mount, a global keybinding, a data fetch that downstream code depends on, etc.).
- Mode-flag collisions on cold-start (e.g. a user with `salonOpen=true` AND `groveOpen=true` in localStorage from an earlier session — does the ladder behave?). If you find one, fix in passing or surface.
- The Sugar Maple roster-gap is the operator-known limitation; if any other LS-square species accidentally falls into the same gap that wasn't surfaced in the brief, call it out.
- LookPicker mounting twice (once in Salon, once in Grove) — there's a `looksError` state and a fetch that might race. If you see double-fetching, surface it.
- If you see opportunity for a cleaner ladder collapse (e.g. switching to an explicit `mode` enum in the store instead of N boolean flags) — surface as a follow-up, **don't ship it in 18A**. The N-boolean ladder is fine for now.
- If the `Arborist / Salon` brand reads awkwardly visually compared to e.g. just `Salon` with a small `Arborist` superscript or breadcrumb-style — you have authority to refine the typography. Commit body documents the choice.

## Out of scope

- Source-picker inside Salon's slot card (vendor chassis / procedural / LiDAR sources) — that's Brief 18B
- Bark + leaf picker library browsers (thumbnail browsers, cousin-swap UI) — Brief 18C
- Empty-species rows / "add to library" entrypoint — separate future brief
- N.A. landscape catalog data plumbing — future
- Common-name authoring beyond what `species-map.json#label` already provides — `label` is the common name today; leave it
- Workstage internal refactor or feature work
- Backend / serve.js / classifier changes
- Atlas, bake, geometry, shader work
- Brief 15's filter — keep the exclusion as-is; the dev-fallback URL is the transition story

## Dispatch posture

Cold dispatch. Pure UI architectural pivot; no need for warm context from a prior baby. Expected wall-time: ~3 baby hours including legacy-URL routing + verifying round-trips from all four workstages. Single atomic commit when AC 1–9 pass.

— Boz
