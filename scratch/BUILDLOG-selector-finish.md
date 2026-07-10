# Build log — selector-finish (the fresh-pour selector)

Agent: **Wren** (fresh). Branch: `selector-finish` (worktree off `curb-offset-draw`).
Scope held: `src/cartograph/*` + `cartograph/serve.js` + fetch scripts + `package.json` (tz dep). No `src/components/*` (sibling agent). Canonical docs untouched (Boz folds on trunk).

## Design evolution (standup with Jacob, 2026-07-09)
The brief's Phase-1 #1 ("make Fetch pull the full bundle") grew, in standup, into the real Setup story:
- **ZIP is the wrong seed** — a hood spans several ZIPs; a ZIP spans several hoods (Jacob). Retired.
- **Search-first** — a place search (`+`-joined anchors → union bbox) frames the aerial; the carve-out stays the explicit "Fetch this view" over the framed viewport. Composite hoods (HiPointe + De Mun) are searched as the sum of their parts.
- **Official boundary does the lifting** (Jacob's steer — platform §0.0 applied to the extent): a single named place returns its OSM boundary polygon as the **best-guess membership boundary**, overridden by naming ≥3 streets. Verified the real geocoder returns usable polygons: LS 26 verts, Altadena 543, Provincetown 93. Composite anchors are imperfect (De Mun → a park) but the union still frames the corridor; town anchors (Brewster/Orleans 14–24 km) are too big to *fetch* but fine to *frame* — which is why search only frames, Fetch carves out.
- **Parcels: degrade + flag** — scripts 03/03b are St. Louis City/County ArcGIS only; LA County (Altadena) returns 0. MSBF buildings ARE generic. So parcels degrade (addresses absent), scene still pours. **LA-County parcels = a separate thread (open).**

## Phase 1 — shipped (commit c8ef2949)
- `POST /geocode` (Nominatim, server-side): `+`-anchors → union bbox + a single place's official boundary (largest ring, shoelace centroid).
- `fetch-extent` now runs the FULL bundle: OSM+skeleton (required) + fetch-msbf (generic) + 03/03b parcels (best-effort), each reported per-source (✓/count/error) in the panel. 0 parcels = expected regional degradation, not a fault.
- `commit-extent` derives the IANA timezone from the committed centroid (`tz-lookup`, offline) → geography.json + neighborhood.json. Accepts an official `polygon` (lon/lat), projected into the re-centered frame as `boundary.polygon` (best-guess membership), overridden by named streets.
- ExtentApp: ZIP field → place search (matched-name feedback); per-source status; "Use official boundary" toggle; name + blurb inputs threaded onBuild → commitExtent. Corrected the stale "STEP 1" docstring (was Phase-2 #7).
- Dep: `tz-lookup` added.

### Altadena validation (fresh drop-in, LA County — no prior scene)
Full backend path driven end-to-end on port 3344:
- Search "Altadena" → 543-vert official CDP polygon + centroid. "Hi-Pointe + De Mun" → 1596×1150 m union, no official (composite) — correct.
- Bundle: OSM ✓ 23,439 · MSBF ✓ 27,890 · parcels ✗ (degraded, "no authority for region").
- Commit: geography.timezone = **America/Los_Angeles** (Pacific ✓); neighborhood.json name/blurb/tz/committed ✓; boundary center [0,0], radius 4483, `polygonSource: official` 543 verts ✓.
- Pour: `Building membership: poly=true — kept 18,718 / dropped 9,172` (official boundary culled to the real CDP shape). map.json (86 MB) + ribbons (795 streets, 601 faces) built.
- Frame alignment: buildings x[-3335,3681]/z[-2850,2720] inside street/face extent x[-4483,5163]/z[-4483,4603], centered near origin — **no offset bug** (parcels absent → no parcel layer to check).

### Framing eye-gate (the bonus)
Numerically centered (building centroid mean ≈ (83, 418) m, well inside r=4483). **Proxy read only — Jacob's eye is the gate.** Not chased.

### Bake gap found + fixed
`bake-ground.js` (and siblings) had a **60 s** per-step timeout in serve.js — fine for LS/HPDM, too short for a large hood. Altadena's full-CDP bake timed out. Bumped the scene-size-sensitive steps (ground/buildings/AO → 300 s, content → 180 s). *Symptom also signals the CDP extent is oversized (includes forest/mountains) — the operator tightens by eye.*

## Open / handoff
- **The extent is the CDP (r=4483 m) — oversized** (Angeles NF + mountain slopes). Jacob tightens by eye for the real neighborhood; official boundary is the *starting* best-guess, not the answer.
- **Mountain model available** — `cartograph/data/altadena/terrain/`: `sangabriel.obj` (328,812-vert San Gabriel front DEM mesh, 286–1880 m) + `heights.f32`/`heightmap.png` (ground DEM, peak 1880 m) + meta. Per §10 this is the brought-mesh/hero-backdrop thread (native materials, own slab artifact) — **out of scope for the selector; noted as the natural next thread for Altadena's identity.** The ground DEM also means Altadena *could* pour with real elevation (currently flat, `--skip-elevation`).
- **LA-County parcels** (addresses for Altadena) — a separate assessor-well thread.

## Interlude — viewability fixes (while Jacob eye-gated Altadena)
- **`?look=` deep-link** (`useCartographStore`) — open any installation's baked Look by URL, symmetric with `?scene=`. Enabled a single-URL handoff.
- **Bake-timeout lift** (serve.js) — ground/buildings/AO → 300s, content → 180s. The 60s cap falsely killed a large hood's ground bake. *The full CDP (r=4483) is separately too big — 397MB ground, groundSampler overflow — so Altadena was re-committed as a tight r=1600 placeholder circle for viewing; the operator frames the real extent by eye.*
- **Camera pullback clamps** (`CartographApp`) — Designer minZoom 0.5→0.03, browse/shot maxDistance 4000/5000→20000. Recurring "can't scroll back far enough" on any hood bigger than LS. Purely additive; LS unaffected. Eye-gated ✓.
- Served the whole thing on `:5199` (worktree vite, `CARTO_API=:3344`) so Jacob could open `cartograph.html?scene=altadena&look=altadena` with no local setup.

## Phase 2 — shipped (this branch)
All in `src/cartograph/*` + `serve.js`. Backend endpoints + client wiring + UI.
- **#7 docstring** — corrected in the Phase 1 commit. ✓
- **#4 live radius re-scope** — `POST /:scene/rescope {radius}`: rewrite `neighborhood_boundary.json` at the new radius (membership polygon PRESERVED) → pipeline re-clip → ribbons; client re-bakes. No re-name, no re-center. UI: a "Re-scope radius → N m" button appears when a committed hood's radius is dragged off its baked value (`committedRadius`). **Validated e2e** on Altadena 1600→1400 (boundary + neighborhood.radius synced, re-clipped faces 601→243).
- **#5 directional-street semantics** — `computeExtentCorners` derives each side's cardinal (`cardinalOf`, 8-way, data frame +x=E/+z=S → N=−z; **note: contradicts the stale `reference_ls_local_frame_axes` memory which says +x=W — the CODE + rendered aerial say +x=E**). Persisted as structural `borderStreets:[{name,direction}]` in neighborhood.json (flat ordered `sides[]` kept for the corner solver). UI: a direction chip on each resolved side. Field + math verified; `borderStreets` written (empty for official/no-sides hoods).
- **#6 atomic/rollback Pour** — commit-extent snapshots geography/boundary/neighborhood → `.prebak` before the destructive re-center; `POST /:scene/rollback-extent` restores them + re-projects raw + skeleton back to the pre-commit frame. `onBuild` calls it on any post-commit failure (rolls back + clears the committed marker + reloads), so a failed Pour never strands a re-centered-but-slab-less scene. Also fixed a latent clobber: the `neighborhood` POST now MERGES (draft autosaves were replacing the file wholesale, dropping committed/timezone/borderStreets). Backup creation + graceful rollback verified; full failure-injection not run (would downgrade the good committed state).

## Open / deferred
- Mountains / hero-prop = a dedicated later session (Boz drafts a §10 brought-GLB brief); NOT in this branch. `src/components` is the tree-sibling's live lane — untouched.
- Proper camera follow-up: derive zoom clamps + auto-fit-on-open from the boundary radius (loosened statically for now).
- The full Altadena CDP is oversized; the r=1400 placeholder is for viewing — Jacob frames the real extent by eye. LA-County parcels (addresses) still a separate assessor-well thread.
