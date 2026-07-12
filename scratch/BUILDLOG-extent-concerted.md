# Build log — Extent concerted-logic redesign

Agent: **Meridian** (fresh). Branch: `curb-offset-draw` (this checkout, direct — solo, no worktree per Jacob).
Brief: `HANDOFF-extent-tool-concerted-logic.md`. Supervised live by Jacob.

## Design steer (standup with Jacob, 2026-07-10) — SUPERSEDES the handoff's "drop place search"
The handoff said drop search + build pure visual selection. In standup Jacob surfaced the
chicken/egg ("no bbox → no street names → no fetch") and the resolution:
- The global aerial (ArcGIS World_Imagery) renders from a lat/lon alone — **no data fetch**. So
  framing rides the PHOTO, not our street data. The first fetch is a **generous drag-net**, and
  **precision moves to the post-fetch refine**, not fetch-time. That breaks the cycle.
- **Search STAYS and gets EMPOWERED** (Jacob: "when the user searches, the system knows the
  boundaries and does a best-guess first pass"). Geocode already returns the official boundary
  (Altadena = 543-vtx ring). Search → adopt that boundary as the best-guess (§0.0), **bound the
  fetch to it**, draw it → operator **refines visually** (the handoff's real demand, now a refine
  of a real starting shape, not a blank 4-slot form). The 4-cardinal name-derive is what dies.
- Cape Cod (63×70 km, no official boundary) → refuse the giant fetch with a clear message.

## Environment
Live `:3333/:4/:5` were serving a STALE worktree (`lafayette-altadena-render` @ 7186e23b,
branch altadena-mountain-render — behind trunk). Jacob restarted all 4 against THIS checkout
(`curb-offset-draw`). Confirmed cwd = main checkout. Building directly on trunk (solo).

## Slice 1 — backend crash fix (DONE, verified live)
`cartograph/serve.js` `fetch-extent`:
- **bbox area guard** — reject > 200 km² BEFORE writing anything, with an actionable message
  ("Framed area is N km² — too large… Search a specific neighborhood, or frame a smaller area").
  LS ≈ 10 km², Altadena CDP ≈ 40 km², Cape Cod ≈ 4422 km². Verified: Cape Cod bbox → clean 400,
  geography.json untouched.
- **surfaced stderr** — OSM/skeleton steps switched `runShell` → `runCapture`; a non-zero exit now
  throws with fetch.js's OWN last line (Overpass rate-limit / oversized / network) instead of
  runShell's generic "Command failed (code=1)". (runShell used stdio:'inherit' → real error went
  only to the server console.)

## Slice 2 — fetch bounded to the official boundary (DONE, e2e verified; awaiting Jacob's eye)
`src/cartograph/ExtentApp.jsx` `onFetchView`:
- When `useOfficial && official.ring`, derive the fetch bbox from the boundary's lon/lat extent
  (+8% pad) instead of the camera viewport → "search Altadena → Fetch" pulls exactly the hood.
  No-official → falls back to the framed camera viewport (guarded by the 200 km² cap above).
- e2e: geocode Altadena → 543-vtx ring → padded bbox (~40 km²) → fetch OK: OSM 30,508 · buildings
  33,171 · parcels degraded (expected, LA County). Re-centered to boundary midpoint.
- ExtentApp.jsx bundles clean (esbuild) — no JSX parse / dark-screen risk.

### Verify path for Jacob (in the app, :5173 → Extent → altadena)
Search "Altadena" → official boundary adopts + draws (best-guess first pass) → "Fetch this view"
→ bounded fetch → streets/buildings hydrate, boundary + auto-radius drawn. Refine next.

## Slice 3 — LS clobber fixed + empty workspace + per-search scene (DONE, awaiting Jacob's eye)
The screenshot bug: panel showed scene `lafayette-square` (the store default) while authoring
Altadena. So labels/buildings/fetch all keyed to LS → St. Louis names + LS buildings on the
Altadena aerial, AND "Fetch this view" wrote Altadena into `lafayette-square/{geography.json,
raw/osm.json}` — **LS clobbered on disk.**
- **LS restored** from git (geography back to StL 38.616,-90.216); cleared the leaked
  `lafayette-square/neighborhood.json` draft (had Altadena radius 4603).
- **Backend relocation guard** (`serve.js` fetch-extent): refuse to overwrite an existing
  installation's geography with a bbox >50 km from its current center. Verified: LS-scene +
  Altadena-bbox → `Refusing to relocate the existing 'lafayette-square' installation 2617 km…`,
  LS untouched. Belt-and-suspenders — the clobber can't recur.
- **Empty workspace + per-search scene** (`ExtentApp.jsx`, Jacob's steer — "a gray workspace grid,
  an empty workspace"): the Extent tool no longer binds to the store's render scene. A new local
  `scene` state starts `null` → a gray `WorkspaceGrid` (plane + grid), panel header "New
  neighborhood" + hint. **Search establishes the scene** via `sluggifyPlace` (Altadena → `altadena`)
  + `setStoreScene(slug)`; everything scene-keyed follows it, so no other installation is read or
  written. All scene-keyed effects guarded on `!scene`.
- **Race-proofed** the reset/hydrate effect: it no longer clears official/name/blurb/located
  (which the search sets right before it fires); it only clears transient geometry and restores a
  COMMITTED hood's own extent from disk (preferring its boundary over the official best-guess).
- `sluggifyPlace`, `WorkspaceGrid` added. ExtentApp.jsx bundles clean (esbuild). Slug passes the
  store's `isValidSceneId`.

### Verify path for Jacob (:5173 → ◎ Extent)
Open Extent → **empty gray workspace** (NOT Lafayette Square). Search "Altadena CA" → opens scene
`altadena`, official boundary best-guess drawn, NO St. Louis names/buildings. Fetch → scoped
hydrate. LS elsewhere unaffected.

## Slice 4 — healed boundary-street process: ORDER-INDEPENDENT visual selection (DONE, awaiting eye)
Replaces the 4-cardinal name-typing with clicking the real boundary streets on the aerial.
- **Backend** (`serve.js`):
  - `computeBoundaryFromSelection(scene, names)` — order-independent perimeter resolver. A corner
    is a degree≥3 junction two selected streets share; adjacency = shared corner; a clean ring is
    degree-2 everywhere. Walks the cycle to order them; returns `{corners, centroid, radius, closed,
    ordered, gaps, streets[{name,polylines,direction,connected}]}`. **Verified on LS's known
    boundary** (Jefferson/Lafayette/Truman/Chouteau) SHUFFLED → closes, 4 corners, r=644; drop one
    → not closed + names the 2 dangling streets.
  - `streetsGeomFor` → `GET /:scene/streets` (all named chains for the clickable layer; 920 for
    Altadena). `POST /:scene/boundary-from-streets` drives the resolver.
  - **commit-extent** re-resolves via `computeBoundaryFromSelection` (was ordered `computeExtentCorners`)
    so the committed membership polygon matches the visual selection.
- **Frontend** (`ExtentApp.jsx`):
  - `ExtentClickableStreets` — every hydrated street drawn as a clickable `<Line>`; selected = cyan,
    a selected-but-disconnected street = amber (gap), majors brighter. Click toggles the whole
    (corridor) name. Gated `!curating` so it doesn't fight the building roster clicks.
  - `sides` now starts EMPTY (no cardinal slots); it's the selected-street list. `toggleStreet` /
    `removeStreet`. Debounced resolve → `fetchBoundaryFromStreets`. Panel: selected-street chips
    (amber border = not-yet-connected) + hint; status shows closed/corners or the named gaps; while
    only the official best-guess is up, "click boundary streets to refine, or pour as-is".
  - `allStreets` fetched per scene/seedToken. ExtentApp.jsx bundles clean.
- **Dead code left** (retire in a cleanup pass once the flow is eye-confirmed): `SideInput`,
  `onHoverStreet`, `previewStreet`, `dirByName`, the `names`/`fetchStreetNames` pool, `fetchExtentCorners`.

### Verify path for Jacob (:5173 → ◎ Extent → search Altadena → Fetch)
Streets appear as thin lines. **Click the boundary streets (any order)** → they light cyan;
when they form a ring the status says "✓ closed · N corners" and the yellow circle auto-fits the
polygon. A selected street that doesn't connect shows amber + is named in the status. Remove via
the chip ×. Pour as before.
⚠️ Perf watch: ~920 `<Line>` objects — if the pan janks, switch the layer to a merged/instanced draw.

## Slice 5 — Extent = the neighborhood HUB (entry populates; New button; hoods navigable) (DONE)
Jacob: entering Extent FROM an extant hood must load its SEED (not blank); where's "New
neighborhood"; Altadena isn't in the Look pulldown so it's unreachable.
- **`GET /scenes`** (serve.js) — lists neighborhoods that exist (scene data dirs) with
  {id,name,committed,hasData}, so the hub can open a fetched-but-unpoured hood the Look pulldown
  can't reach. Verified: altadena, hipointe-demun, lafayette-square.
- **Entry loads the active hood** — ExtentApp's `scene` now initializes from the active render
  scene (not null); the [scene] hydrate was generalized to load geography+boundary for ANY hood
  with data (committed OR in-progress like Altadena), so the aerial + circle show on entry.
  Empty workspace is now reached explicitly via **"＋ New"**, not on every open.
- **Hub UI** — when no scene is loaded: an "Open a neighborhood" row (buttons per existing hood,
  ✓=committed) + the search. `openScene(id)` sets it active + loads its seed; `newNeighborhood()`
  clears to the empty workspace. Header shows the hood's name.
- Fresh-search path preserved (store geo already set → hydrate keeps it, doesn't touch
  official/located). ExtentApp bundles clean; LS data untouched.

### Answers to Jacob
- "New neighborhood" lives in **Extent** (the ＋ New button + the empty workspace/search).
- Altadena is now openable from the **Extent hub list** (no Look required). (Adding scenes to the
  Designer's Look pulldown is a separate IA choice — flagged, not done.)

## Open / next slices
- **Persistence across refresh** — search/best-guess state lives only in the in-memory store; a
  fresh (uncommitted) fetched scene shows blank on reload. Persist the best-guess (official ring +
  frame) so refresh restores it. (Jacob: "neither persist after refresh.")
- **Legible labels** — `skeletonLabelsFor` (serve.js) + `ExtentLabels` (NOT `src/lib/streetLabels.js`,
  which is the runtime LS path). Fixed world-size text, no collision avoidance → jumble on a big
  fetch. Zoom-responsive sizing + greedy declutter/collision pass.
- **Visual refine** — trace/toggle to adjust the best-guess boundary (segment selection).
- **Auto-radius semantics** — slider as breathing-room margin (both directions) around the auto-fit,
  not the current fit..2.5× range.
- **Retire the 4-cardinal SideInputs** once visual refine lands.
- **Verify** Altadena pours centered + LS byte-identical. §11 reconciled (Boz folds canon).

## Note
Left `cartograph/data/altadena/{geography.json,raw/,clean/}` populated from the e2e bounded fetch
(real Altadena data). Uncommitted working data; Jacob can re-search/fetch to reframe.
