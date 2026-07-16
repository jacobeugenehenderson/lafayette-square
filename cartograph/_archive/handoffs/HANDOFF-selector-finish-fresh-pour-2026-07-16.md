# HANDOFF — finish the neighborhood-boundaries SELECTOR (make it drop-in-and-pour)

> **Dispatch-ready brief. Drafted by Boz 2026-07-09 with Jacob.** Destination = the full §10/§11 selector spec (Jacob's call), **phased** so the fresh-pour gate opens first and nothing strands. The proving ground is the next real hood, **Altadena CA** (pre-onboarding — only raw terrain DEM exists; no scene yet).

## Who you are + the call

You are the agent dispatched to finish the Extent tool / neighborhood-boundaries selector. **Name yourself** (one word, your pick — it joins the trail).

- **Agent: FRESH.** Why: self-contained tool-completion against precise anchors + a locked scope; no prior warm context is load-bearing.
- **Route first (universal path):** `ORIENTATION.md` → `README.md §⭐ START HERE` (the "Extent / intake tool + the Pour" row) → **`cartograph/INTAKE.md §0.5`** → **`NEIGHBORHOOD-INPUTS.md §10/§11`** (the selector spec) → **`HANDOFF-neighborhood-perimeter-builder.md`** (the as-built brief). Read to the section before touching code.
- The tool: **`src/cartograph/ExtentApp.jsx`** (~1000 lines, the `◎ Extent` destination). Backend: **`cartograph/serve.js`**. Client calls: **`src/cartograph/api.js`**.

## What "finished" means (locked with Jacob)

Today the selector frames a hood, names streets, resolves corners from skeleton junctions, commits, and pours — **but it is NOT self-contained for a fresh place**: "Fetch this view" pulls OSM only, timezone is hardcoded to St. Louis, and there's no name/blurb capture. Those are the true blockers to pouring **Altadena**. Destination is the full spec; **Phase 1 opens the gate and is independently landable.**

## Phase 1 — the fresh-pour blockers (opens the Altadena gate)

**1. Make "Fetch this view" pull the FULL bundle, not just OSM.**
- Now: `fetch-extent` (serve.js:840) runs `node fetch.js` + `node skeleton.js` only (serve.js:866–867) → `fetch.js` writes `data/raw/osm.json`. The building **roster/overlay** and **addresses** read `msbf.json` + `*_parcels.json`, which are fetched by **separate CLI steps the tool never invokes** — `fetch-msbf.js` and the parcel scripts `03/03b-fetch-*-parcels.py` (`HANDOFF-neighborhood-perimeter-builder.md:50–51`). So on a fresh drop-in the roster + addresses are empty/wrong.
- **Do:** extend `fetch-extent` to also run the msbf fetch + the parcel fetch for the bbox, scene-generically. **Cheap acquisition-status (Jacob's call — NOT the full §11 grid):** surface a per-source result in the panel — **OSM ✓ / buildings ✓ / parcels ✓** (with error state per source) — so the operator sees the bundle landed. Do *not* build the elaborate WHAT→WHERE→Go→Result grid; satisfy §11's intent cheaply.
- ⚠️ **Frame-alignment gate (2026-07-09 canon, `INTAKE.md:37`):** parcels are now reprojected on re-center (`reproject-raw.js` emits `centroid_ll`/`rings_ll`, commits `fc7de128`/`d703e284`). **After any pour, verify parcel↔building frame alignment** — this is the standing gate; honor it.

**2. Derive the timezone from the location — stop hardcoding St. Louis.**
- Now: `provisionalGeo` hardcodes `'America/Chicago'` (ExtentApp.jsx:693); `commit-extent` preserves existing `geo.timezone`. **Wrong for Altadena (Pacific)** → weather/TOD wrong for any non-Central hood.
- **Do:** derive tz from the hood's lat/lon at commit (Altadena → `America/Los_Angeles`) and persist it in `neighborhood.json`. Keep it scene-generic (a lat/lon→tz resolution), not a per-city special-case.

**3. Build name + blurb capture (backend already accepts it).**
- Now: `commit-extent` reads `{name, blurb}` and writes them to `neighborhood.json` (serve.js:953/977), but the panel (ExtentApp.jsx:915–992) has **no inputs**, and `onBuild` calls `commitExtent(scene, {center, radius, sides})` (:777) without them — so every hood persists `name:'', blurb:''`.
- **Do:** add name + short-blurb inputs to the panel; thread them through `onBuild` → `commitExtent` → the existing backend. (Blurb doubles as SEO/description per the spec.)

**➡️ END OF PHASE 1 — the gate:** the selector can now drop in a fresh hood and pour it end-to-end with no hand-CLI. **Validate on Altadena** (see §Altadena validation), then continue to Phase 2.

## Phase 2 — the finish work (same branch, after the gate)

**4. Live radius re-scope (the §11 "living boundary").** Editing radius after commit updates `radiusM` + draft-autosaves `neighborhood.json` (ExtentApp.jsx:669) but does **not** rewrite `neighborhood_boundary.json` (the circle the bake/stencil actually use) or re-bake — so re-scoping today means re-running the whole Pour. Add a lightweight **"re-scope radius"** path: rewrite the boundary + re-bake **without** re-naming streets. *(Doc nuance to respect: `INTAKE.md:37` says the radius/zip **draft**-persist bug is fixed; the **committed circle** re-scope is the part still missing — don't conflate.)*

**5. Directional-street semantics.** Sides render as placeholders `['west side','north side',…]` (ExtentApp.jsx:941) but persist as a **flat ordered `sides[]`** with no W/N/E/S meaning. Capture the directional identity structurally (the spec's directional border-street fields), keeping the in-order-around-perimeter adjacency the corner solver needs.

**6. Rollback on partial Pour failure.** A throw mid-`onBuild` leaves geography **re-centered** + `committed:true` but the slab unbaked — a half-committed scene (only `seedError` shown, :804). Make the sequence atomic or roll back on failure.

**7. Kill the lying docstring.** ExtentApp.jsx:19–22 still says "STEP 1 — the screen shell… land in later steps" — all of it is built. Correct the header to what's actually there. *(This is a source-file docstring, so it's yours; canonical docs are Boz's — see below.)*

## Altadena validation (prove the tool, hand the framing to Jacob)

- **State:** Altadena is pre-onboarding — no scene/look/instance. Only raw terrain exists (untracked `cartograph/data/altadena/terrain/`, `sangabriel.obj`). **The mountains are a SEPARATE future thread** (a "brought-GLB hero prop" per `NEIGHBORHOOD-INPUTS §10`, native materials, own slab artifact) — **out of scope here.** Pour Altadena as a **flat-ground** scene; the Pour already runs `pipeline.js --skip-elevation` (serve.js:1003), so no terrain is expected.
- **Your validation:** drive the tool's backend path end-to-end for an Altadena bbox (ZIP **91001**, the San Gabriel foothills) — `fetch-extent` (full bundle) → `commit-extent` → pour — and **confirm msbf + parcels land, tz resolves to Pacific, name/blurb persist, the scene builds, and parcel↔building frames align.** This proves the plumbing scene-generically.
- **The operator framing is Jacob's**, in the UI (naming the real boundary streets, eye-framing the extent). Hand back cleanly for that pass — do **not** guess the final boundary.
- **Bonus for Jacob's eye-gate:** when Altadena pours and drops into 3D, that is the natural eye-gate for the **"3D browse framing off (too high & left)"** contradiction (4 docs disagree on whether it's resolved). Note in your build log whether the poured scene came up centered or off — **do not chase or "fix" it**; Jacob rules by eye and Boz reconciles the docs.

## Boundaries + discipline

- **Work in a git worktree off `curb-offset-draw`** on a feature branch (e.g. `selector-finish`). Commit **per phase**. A sibling agent is concurrently editing `src/components/*` tree code — **you touch `src/cartograph/*` + `cartograph/serve.js` + fetch scripts**, no overlap; keep it that way.
- **Canonical docs are OFF-LIMITS** (`INTAKE.md`, `NEIGHBORHOOD-INPUTS.md`, `README.md`, `PIPELINE.md`, the HANDOFF you're reading) — **Boz folds the canon on trunk** when this lands, and reconciles the framing-bug contradiction after Jacob's eye-gate. Keep your running notes in a **"Build log" section appended to THIS file** or a `scratch/` co-journal. Correcting the ExtentApp source docstring (#7) is code, not canon — that's yours.
- **Surface scope drift immediately** (`feedback_baby_must_surface_scope_drift`). If Phase 1 uncovers that the msbf/parcel fetch is bigger than a wiring job, stop and flag rather than widening silently.

## Definition of done

**Phase 1:** a fresh hood drops in and pours with no hand-CLI — full bundle fetched (with per-source ✓ status), tz correct, name/blurb captured — **validated by an Altadena test pour** with parcel↔building frames aligned. **Phase 2:** live radius re-scope, directional-street semantics, atomic/rollback Pour, corrected docstring. Altadena handed back to Jacob for the operator framing pass + the framing-bug eye-gate.
