# HANDOFF — Extent tool: concerted logic redesign (the neighborhood shape-definer)

> ✅ **EXECUTED — ARCHIVED 2026-07-11.** The redesign shipped: visual boundary-segment
> selection, empty workspace, official best-guess, commit/reproject/atomic-Pour/rollback,
> §11 living-boundary re-scope, metadata, panel grouping. The last headline blocker —
> **Altadena's divided-road (Woodbury) wouldn't close** — was fixed this session via the
> **skeleton corridor-propagation weld** (`skeleton.js`; commit `38b2b887`;
> `[[project_extent_altadena_divided_road_weld]]`). **Live remnants moved to the successor
> `HANDOFF-extent-finish.md`** (legible labels · end-at-corners trim · §11 canon fold ·
> favicon). Kept here for the full diagnosis, the target model, and the invariants.
>
> _Original framing:_ **Dispatch-ready brief. Drafted by Boz 2026-07-10 with Jacob.** Superseded `HANDOFF-extent-altadena-wrong.md` (that framed it as diagnose-one-bug; it wasn't — the tool's logic was wrong across the board). Supervised live by Jacob.

## Who you are + the call

You are the agent redesigning the Extent tool. **Name yourself** (one word).

- **Agent: FRESH.**
- **Route (mandatory, in order):** `CLAUDE.md` → `ORIENTATION.md` → `README §⭐ START HERE` → then the **canon grounding** below, **to the section**, before you design. This is a re-grounding job — read *why the tool exists* before touching it.

## The core problem — the tool was built AGAINST its own doctrine

**Symptom (Altadena, 2026-07-10):** the panel's "Boundary streets" are four **empty cardinal placeholders** (west/north/east/south side); the "Shape of Altadena" renders as an **illegible jumble of ~every street label** with a **generic radius circle** dropped on a point. It "sucks and doesn't work."

**Root cause — the build inverted the design intent.** `HANDOFF-neighborhood-perimeter-builder.md` is explicit:
- **"Why this exists" (line 21):** deriving a boundary from **street-NAME data is UNRELIABLE** — "a full session was lost" to it (fragmented/duplicate segments, "Wydown Terrace vs Boulevard", **East/West inverted**). **"The only reliable definer is the operator's eye on a LABELED aerial."**
- **"Street labels are the load-bearing missing piece" (line 61)** — a *legible* labeled aerial is the whole enabler.
- Border-street fields were meant as **descriptive metadata (SEO), NOT geometry** (line 70).

The build did the **opposite**: a **4-cardinal street-name derive-model** (name W/N/E/S → corners), with the labels — the load-bearing enabler — rendered as an **unreadable word-cloud**. So it forces a model reality doesn't fit (a real perimeter is **~20 segments that don't map to N/S/E/W**) *and* breaks the one thing that was supposed to work (seeing the streets).

## The target model (Jacob, 2026-07-10) — build THIS

1. **Fetch = hydrate EVERY neighborhood street with perfect fidelity, rendered LEGIBLY.** The labeled aerial is *the* capability — the operator must be able to **read street names** to work. Fixing label legibility (dedup / declutter / place / collision-avoid — the current jumble) is **failure #1 and the enabler for everything else.**
2. **Selection = the operator VISUALLY selects the real boundary segments** (~20, off the legible map) — **NOT 4 cardinal name-slots, NOT name-geocoding.** Visual selection on hydrated data sidesteps exactly the name-unreliability the doc warns about. The selected segments form the perimeter polygon.
3. **Radius AUTO-computes to contain the selected boundary** (the containing circle of the polygon). **The slider is a breathing-room override ONLY** (more/less margin) — not the manual value it is today (2110 m dropped on nothing).
4. **Drop the "place search · A+B to combine"** — unhelpful.

*(This supersedes both the built 4-cardinal model AND the older "direct circle handles + streets-as-metadata" decision in the perimeter HANDOFF line 68 — Jacob has evolved the model to visual-segment-selection + auto-radius. The perimeter HANDOFF is still the canon for the JSON contracts + the re-pour chain + the labeled-aerial doctrine; only its *geometry-control* decision is superseded.)*

## The full element set — "concerted" means all of it coherent, not one fix

The legible fetch/labels (#1) and visual boundary selection (#2) are the headline; they sit inside the whole pipeline the tool drives — get the *system* right:

- **Legible street hydration + labels** (the enabler) · **visual boundary-segment selection** → **the perimeter polygon**.
- **The membership polygon** — the boundary polygon decides which *buildings* are in (not the circle); per-building activate/hide for edge fuzz (`§5.2`, already built — keep it working).
- **Auto-radius containing circle + the stencil/fade** it produces (`SLAB-CONTRACT §2.1`); slider = margin only.
- **Commit / re-center / reproject** — re-center geography to the boundary centroid → reproject **all** frame-dependent raw (OSM + msbf + parcels + admin) via `reproject-raw.js` → re-derive skeleton → write the two JSONs; **verify parcel↔building alignment after** (the standing gate).
- **The Pour** — pipeline → promote → bake, scene-generic; the **Data-Wall boundary clip** neuters overshooting arterials.
- **The living boundary (`§11`)** — re-editable anytime; re-scope must re-fetch/re-clip/re-bake and be re-runnable against a *changed* extent (data entering acquired, leaving dropped).
- **Poured-scene framing** — content centered on `[0,0]` (the old "too high & left" — verify it's actually resolved now).
- **Elevation** — the pour runs `--skip-elevation` (flat). A DEM-driven hood/margin terrain is a **separate follow-on thread** (the annulus) — flag, don't conflate.
- **Metadata** — name / blurb / timezone (Phase-1 selector landed these; keep them). **Browser tab now = the authored Neighborhood Name** (verbatim; prettified-slug fallback while un-named) — `ExtentApp.jsx` `document.title` effect.
  - **Follow-on idea (favicon, deferred polish):** give each hood a favicon **GENERATED from its boundary polygon silhouette** (fill = Look accent; monogram fallback before a shape exists) — NOT an upload field (a neighborhood has no logo; upload = authoring overhead + storage for marginal value). On-brand with "the shape IS the instance identity"; the same generated mark is reusable as the hood's icon on Place Cards / map pins / selector rows / share cards (generate once, use everywhere).

## Canon grounding (read before you design)

- **`HANDOFF-neighborhood-perimeter-builder.md`** — the design bible: "Why this exists" (line 21, the name-unreliability), the labeled-aerial doctrine (line 61), **the two JSON artifacts + exact contract** (lines 29–45), **the re-pour chain** (lines 47–57).
- **`NEIGHBORHOOD-INPUTS.md §10` (Box/Circle) + `§11`** (living boundary, acquisition re-runnable). ⚠️ **These docs DIVERGE from the target model** (they describe the name-derive box) — part of this work is that the **doc↔code accord is broken**; the outcome must be folded back into `§11` (Boz folds canon; flag what changed).
- **`cartograph/INTAKE.md §0.5`** · **`SLAB-CONTRACT.md §2.1`** (the stencil the circle produces).
- **The frame:** `cartograph/config.js wgs84ToLocal` — **+x=EAST, +z=SOUTH, north=−z** (authoritative; the `reference_ls_local_frame_axes` memo was wrong — do NOT trust it).
- **`scratch/BUILDLOG-selector-finish.md`** — what the Phase-1+2 selector pass actually landed (fetch bundle, tz, name/blurb, repopulate) so you don't redo it.

## Anchors (so you don't spelunk)

- **`src/cartograph/ExtentApp.jsx`** — the panel (the 4-cardinal `SideInput`s to retire, the radius slider, "Fetch this view", "Edit buildings").
- **`cartograph/serve.js`** — `fetch-extent` (~:840), `computeExtentCorners` (~:244, the junction-corner logic), `commit-extent` (~:938), the pour (~:989, `--skip-elevation` :1003).
- **`src/lib/streetLabels.js`** (`getStreetLabels`) — the label computer; **the legibility work centers here** (declutter/collision/placement).
- **`src/cartograph/AerialTiles.jsx`** — the aerial canvas + exported projection helpers (`wgs84ToLocal`/`localToWgs84`/tile helpers).
- Artifacts: `cartograph/data/<scene>/{geography.json, neighborhood_boundary.json}` (contracts in the perimeter HANDOFF).

## Phased plan (supervised — reviewable steps)

**Phase 0 — propose the UX, get approval (do NOT build yet).** Sketch how the operator: opens a scene → sees a **legible** labeled aerial → **visually selects the boundary segments** → gets the **auto-radius** circle (slider = margin) → commits → pours. 2–3 interaction options (how selection *feels* — click segments? lasso? hover-confirm?) + a recommendation. **Supervised gate with Jacob.**
1. **Legible fetch/labels** — perfect-fidelity street hydration + a **readable** label layer (fix the jumble). This is the enabler; land it first.
2. **Visual boundary selection** — select real segments → perimeter polygon. Retire the 4-cardinal `SideInput`s + the place search.
3. **Auto-radius** — containing circle from the polygon; slider → margin override only.
4. **Commit / reproject / pour / living-boundary** — keep `§11` re-runnable; **verify Altadena pours correct (centered, right boundary/data) AND LS stays byte-identical.**

## Invariants (violating any is how this stays broken)

- **The operator's eye on a LEGIBLE aerial is the capability** — never name-geocoding for geometry.
- **Visual multi-segment selection**, not 4 cardinal slots, not typed names driving geometry.
- **Auto-radius contains the boundary; the slider is margin only.**
- **Installation-agnostic** — no hood named in shared code (`lafayette-square` = default fast-path, `toy` = fixture). A Provincetown/Altadena drop-in uses the same tool, zero kit edits.
- **Lafayette Square stays byte-identical** — its extent doesn't change; verify its pour/render is unaffected.
- **Frame: north=−z** (`config.js`).
- **Divided roads must weld to ONE centerline before the boundary tool consumes them.** A dual-carriageway (≥~40% one-way ways under a shared name-root) must resolve to a single skeleton chain per physical road. **Weld-failure signature:** duplicate near-parallel *reversed* chains under one name (the two carriageways), and/or one boulevard surfacing under multiple directional names ("East/West X"). An unwelded divided road that won't close is a **SKELETON defect to fix upstream** (`project_truman_divided_road_knot`) — **NOT** a boundary-resolver tolerance knob (corridor-merge in the resolver papers over the source: `feedback_fix_at_source_never_hack_the_symptom`). Detectable pre-pour: flag any name whose chains include a reversed-duplicate pair. **Verified on Altadena 2026-07-11** — "Woodbury Road" is 76 raw OSM ways, 84% one-way (divided), left unwelded → surfaces as West/East/mid-stub across ~15 fragments → resolver sees degree 3–4 → won't close. Full forensic: `[[project_extent_altadena_divided_road_weld]]`.

## Commit boundaries + DoD

- ⚠️⚠️ **DO NOT SPAWN NEW DEV SERVERS WITHOUT EXPLICIT PERMISSION.** The dev stack is already running — `npm run dev` gives you **`:5173` web · `:3333` cartograph · `:3334` arborist · `:3335` meteorologist** (the cartograph backends run `node --watch`, so `serve.js` edits hot-reload). **Use the running servers.** Starting your own `vite`/`serve.js` on new ports is the exact port-juggling friction this project is trying to kill — if you think you need a fresh server, **ask Jacob first.**
- Worktree off `curb-offset-draw`; lane = `src/cartograph/*` + `cartograph/serve.js` + `src/lib/streetLabels.js` + fetch/pour scripts. **Supervised** (Jacob live; propose before building). Commit per phase. **Canon docs off-limits — Boz folds the outcome, including the `§11` rewrite the divergence requires.** Build log in this file or `scratch/`.
- **Definition of done:** an operator opens Altadena, sees a **legible** labeled aerial, **visually selects the ~20 real boundary segments**, the **radius auto-fits** (slider only for breathing room), commits, and it **pours correct to Jacob's eye** (centered, right boundary, aligned data). LS byte-identical. The place-search + 4-cardinal model are gone. `§11` reconciled to the built reality (Boz).
