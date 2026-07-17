# BRIEF — bring statistical tree planting to Lafayette Square

**To:** a fresh agent (or Boz). **From:** Boz + Jacob, 2026-07-16 standup. **Trunk:** `curb-offset-draw` (solo — push/merge freely; PROD = `origin/main`).
**Route first** (CLAUDE.md, non-negotiable): `ORIENTATION.md` → `README §⭐ START HERE` → `arborist/README §⭐ START HERE` → **`TREE-INTAKE.md`** (the whole census→bake join; read it start to finish) → `HANDOFF-tree-spokes-and-census.md` (the 2026-07-15 census forensic — the jurisdiction findings) → this.
**Memory:** [[project_tree_placement_frozen_curb_and_hood_rule]] · [[project_census_is_per_hood_and_isolated]] · [[project_hpdm_tree_census_jurisdiction_gap]] · [[project_arborist_operating_model_and_tree_bake_state]].

---

## The mission in one line

**LS today gets only a hand-authored, park-only census and forbids trees with the wrong (legacy) mask. Bring it to full HPDM-style intake — real data first, statistical fill in the gaps — on the frozen-curb zone mask, keeping the park census as its literal core.** The park is the gem ([[park-is-the-gem]]); do not regress it.

## Why now — the dependency that just cleared

**LS is poured.** `public/baked/lafayette-square/shape.json` exists and is current (2026-07-16). That is the *only* geometry dependency: the good hardscape mask (`makeZoneTester`) reads the frozen curb from `shape.json`. LS could not use it before because it had no pour. It does now.

## ⭐ NORMALIZE the park/tree data, THEN plant (decided with Jacob, 2026-07-16, and audited)

**We are moving to production, and LS's `DEFAULT_SCENE` special-casing is a documented-owed footgun — clean it up here rather than build statistical planting on top of the vestige and rip it out later.** Canon already calls for it (`project_census_is_per_hood_and_isolated`: *"Closing it = LS goes through the same explicit args as HPDM and bake-trees stops knowing what Lafayette Square is."*).

The wiring audit (2026-07-16) makes the scope precise and **safe**:
- The cross-hood **leak is DORMANT, not active** — every LS park reader self-guards on `INSTANCE.lookId` (`LafayettePark.jsx:848` returns null for non-LS; `MapLayers` is swapped for `SceneMapLayers` at `CartographApp.jsx:1121-1129`). Nothing bleeds into HPDM/Altadena today. So we clean carefully, not urgently.
- **The render consumers are just shaders reading a file** (Jacob's framing) — `LafayettePark.jsx`, `MapLayers.jsx`, `BlockGeometryV2Debug.jsx` import park data by hardcoded path. Moving the data → repointing those imports to the new home is a **glance-at-the-render repoint**, NOT async-seam surgery. Do it in this project.
- The per-hood convention already exists and LS is the lone exception: trees at `cartograph/data/<scene>/clean/park_trees.json`, species routing at `cartograph/data/<scene>/tree-species-map.json`, water at `src/data/<scene>/park_water.json`, polygon at `cartograph/data/<scene>/clean/park-polygon.json`. Scripts `13`/`14` already write the poured path; only LS's `scripts/12` and the resolver branch are the holdouts.
- Output path is *already* per-scene (`baked/lafayette-square/trees.json`; `baked/default.json` retired, **no live reader**).

**Genuinely OUT of scope** (different subsystems, not park/tree data): full `DEFAULT_SCENE` retirement across **buildings/ground/terrain**; and generalizing the water *render* so future hoods show pools/patches (a decoupled shader/feature for when a hood actually carries water — the normalization just lands the data in the right per-hood home so that shader can find it later). See Out of scope.

---

## Settled doctrine (decided with Jacob at standup — do NOT relitigate)

1. **Real placements first, ALWAYS — a hard precedence, not just intake order.** Every position we can source from a real record — city forestry inventory, park census, address/parcel — is planted literally, laid **first**, and is **never displaced by a synthetic one**. Synthetic fill occupies **only** the ground real data doesn't cover; on any conflict the synthetic yields (relocate or drop), the real never does; and if richer real data arrives later, it **supersedes** synthetic in those spots. Corollary: **the park census is real → every park position is preserved, full stop.** Only where no record exists do we synthesize positions from local statistics (canopy %, empirical species mix). LS sits **inside St. Louis City**, so `13-fetch-city-trees.py` should return real *street* trees across the whole neighborhood — LS's synthetic fraction should be **small** (mostly block interiors the inventory doesn't reach), unlike HPDM which straddles the city limit and is ~92% filler.

2. **The allow-model, stated positively — "exposed Land Use."** A tree may stand on exactly two surface types and nothing else:
   - **interior (exposed) Land Use** — the yard / park lawn / parcel, *where nothing hard covers it*, and
   - **the swappable treelawn strip** (curb-to-sidewalk planting strip).

   Everything else is disallowed *by not being one of those two*: the carriageway (outside the curb — no LU there), the sidewalk band, and any building / water / parking / path footprint sitting on top of LU ("exposed" = topmost, nothing covering it). **There is no Land Use outside tiles**, so the poured extent is *definitionally* the entire universe of plantable ground — there is no un-poured annulus to chase. **This is exactly what `makeZoneTester` already computes** (`ALLOWED = {treelawn, lu}` minus footprints). Nothing about the rule needs inventing; LS just needs to be *on* it.

3. **Provenance baked, runtime toggle DEFERRED.** The census-vs-derived distinction stays a **data-layer fact**: emit a per-tree `source` field at bake so literal-vs-mathematical is a permanent property of every instance. **Do NOT** add a second runtime UI toggle now — that's UI ahead of the need. The meaningful treatment asymmetry already exists and is right: **surveyed trees are nudged** onto legal ground, **invented trees are dropped** (`bake-trees.js` + `forbidden-surface.mjs:245` `nudge`). A future "show only what we truly know" view is cheap once `source` is baked.

---

## The work — four moves, in dependency order

### Move 1 — Give LS a real scene intake
Today LS's tree data is special-cased at `src/data/park_trees.json` (+ `park_species_map.json`, `park_water.json`); its `cartograph/data/lafayette-square/clean/` has **no tree files**, and the numbered scripts **refuse to run for LS** via `DEFAULT_SCENE` guards (`scripts/14-fetch-osm-trees.py:74`, `scripts/15-derive-tree-mix.py:121`, `scripts/17-fill-canopy-trees.mjs:31`).

- **Unblock the guards for LS** (LS is now a first-class poured scene, no longer the special case) and run the intake per `TREE-INTAKE.md §Run order` with `CARTOGRAPH_SCENE=lafayette-square`:
  - `13-fetch-city-trees.py` → `clean/park_trees.json` — **the big win**: STL City Forestry, whole-neighborhood street trees (LS is fully inside the city; verify the fetch covers the full disc, unlike HPDM's SE-wedge clip).
  - `14-fetch-osm-trees.py` → `clean/osm_trees.json` — LS is single-jurisdiction, so **drop the City/County divide clip** (that step exists only because HPDM straddles the limit). Dedup against the city census at 3 m.
  - `15-derive-tree-mix.py` → roster (`public/looks/lafayette-square/design.json#/trees`) + `tree-species-map.json` + `tree-mix.json`, and drapes OSM species. **Audit the `EXACT`/`keyword_collapse` tables** — they're STL-flavored (LS *is* STL, so they should fit, but confirm the roster it writes is broadleaf-appropriate and doesn't stale the atlas — see Traps).
  - `16-fetch-canopy.py` + `17-fill-canopy-trees.mjs` → `clean/derived_trees.json` (NLCD scatter, gap-fill only). This should be a **small** layer for LS.
- **Keep the park census as a DISTINCT authored well — decided (Jacob, do not merge it away).** LS's park is its literal gem and is hand-sourced. It stays a **first-class authored surface**, its own well/file, **never folded into the fetched inventory or the derived stream.** Rationale: LS arborists care about the park specifically and *will* want to hand-update park coordinates in future — that authoring must not collide with the statistical machinery. So the park is authored → city-inventory is fetched → OSM/derived is synthetic; separable wells, each with its own `source` (Move 4). **Do not lose park positions**; give the park its own `source` tag so it's addressable on its own.
- **⚠️ NAMING COLLISION to resolve — LS is the first hood with BOTH an authored park census AND a city-inventory fetch.** In HPDM, `park_trees.json` confusingly *is* the City Forestry census (the file name is a fossil). For LS these are two different real sources: the hand-authored **park** (from `scripts/12`) and the **city street inventory** (from `scripts/13`, whole-neighborhood). Keep them as **separate addressable wells with distinct filenames + distinct `source` tags** (don't let `scripts/13` clobber the authored park file). **Dedup the overlap** — the city fetch may include park trees; under real-first the **authored park wins inside the park footprint**, the city inventory owns the streets. The agent picks the exact filenames; the invariant is: authored-park and city-inventory are distinct, deduped, park-wins-in-park.

### Move 2 — Normalize LS's park/tree data into the per-hood convention
Retire the special-case so LS bakes through the same poured path as every other hood. **Relocate the data, delete the special branch, repoint every reader (bake + tooling + render).** `park_water.json` renders LS's lake, so its readers include a production shader — repoint it, glance at the LS render, done (not surgery).

**Relocate the files** (per-hood convention from the audit):
- `src/data/park_trees.json` → `cartograph/data/lafayette-square/clean/park_trees.json`
- `src/data/park_species_map.json` → `cartograph/data/lafayette-square/tree-species-map.json` (note the rename to the poured convention)
- `src/data/park_water.json` → `src/data/lafayette-square/park_water.json`

**Delete the special branches:**
- `cartograph/tree-bake-inputs.mjs:77-96` — remove the `if (scene === DEFAULT_SCENE)` branch so LS falls through to the poured branch (`:110-159`). That branch already unions `park/osm/derived`, passes `speciesMapPath`, `forbiddenMapPath`=`clean/map.json`, `zoneShapePath`=`shape.json`, `boundaryPath`=`neighborhood_boundary.json`.
- `cartograph/bake-ground.js:723-725` — collapse the LS water ternary so LS uses `src/data/<scene>/park_water.json` like everyone else.

**Repoint every reader** (audit's checklist):
- Writers: `scripts/12-process-park-trees.py:188,191` (+ header `:5`); Salon `arborist/serve.js:1099`; `src/arborist/stores/useArboristStore.js:578`.
- Render/runtime (the "just a shader" repoints — LS-gated, low-stakes, glance at render): `src/components/LafayettePark.jsx:15,17,27`; `src/data/loadInstanceData.js:53,54,58` (thunk strings only); `src/cartograph/MapLayers.jsx:7-8`; `src/cartograph/BlockGeometryV2Debug.jsx:29-30`.
- Tooling: `arborist/serve.js:1056` (`/inventory`); `arborist/roster-coverage.js:40-41`; `arborist/merge-london-plane.js:30`; `scripts/17-fill-canopy-trees.mjs:80`; doc refs in `arborist/ROSTER-COVERAGE.md`, `arborist/FEATURES.md`, `src/arborist/CoverageView.jsx:6-9,88`.

**Consequences that light up once LS is on the poured branch (all WANTED — verify):**
- **`zoneShapePath` → the frozen-curb mask** (`makeZoneTester`), the fix for "forbids poorly." See Move 3 for the one-button flag gap.
- **`boundaryPath` → the hood-membership dissolve** (`bake-trees.js:436-438,530-533`) + a per-tree `inHood` field. Only thins **derived** trees outside the hood — real (park/city-inventory) trees are never dropped, consistent with real-first. Matches HPDM (watch for side effects like HPDM's lamps 33→110).
- **The multi-well union + `__kind` split** (`bake-trees.js:399-418`). **⚠️ The park census file MUST carry `meta.kind:'census'`** (or its own `park` tag) or it's mis-bucketed as derived and wrongly dropped/dissolved. Single most important correctness detail.
- ✅ **Arborist Salon bake needs no field change** — `arborist/serve.js:959-960,1041-1042` spread the whole resolver, so the poured branch's fields flow through automatically.
- ✅ **Tripwire (`tripwire-ls-reads.cjs`)** is not in CI/hooks and only logs; the relocation *reduces* its concern (LS data leaves the global `src/data/*` root).

**⛔ Do NOT delete `makeForbiddenTester`'s callers blindly** — after LS is on the zone tester the legacy tester is unused *for trees*, but confirm no other consumer before removing it (`forbidden-surface.mjs:63`).

### Move 3 — Flip the mask AND close the one-button flag gap
Adding `zoneShapePath` (Move 2) flips the mask automatically for callers that forward it: `bake-trees.js:439-449` selects `makeZoneTester` (frozen curb, `ALLOWED={treelawn,lu}`, road-aware, with `.nudge()`) when `zoneShapePath` is present, else falls to the legacy no-arg `makeForbiddenTester()` (`:452`, LS's current blind path).
- **The Salon path** spreads the resolver → gets the flip for free.
- **⚠️ The one-button pour does NOT** — `cartograph/serve.js:1898-1904` builds the CLI flag string by hand and forwards only `--scene/--placements/--species-map/--forbidden-map/--output`. It **drops `--zone-shape` and `--boundary`** (both are accepted by `bake-trees.js` CLI parse at `:733,745-746`). **Fix:** extend that flag builder to forward `treeInputs.zoneShapePath` → `--zone-shape` and `treeInputs.boundaryPath` → `--boundary`. Without this, the one-button pour silently under-bakes LS on the legacy mask. **This gap affects every poured scene, not just LS** — verify HPDM's one-button bakes aren't already regressing through it (HPDM's good result may have come via the Salon path or a direct CLI run).
- **Verify** after the fix: LS's bake takes the `makeZoneTester` branch (`bake-trees.js:440`) from *both* the Salon and one-button paths.
- `makeForbiddenTester` becomes unused once LS is on the zone tester (LS was its only caller per the audit). **Deleting it is a reasonable finish to the normalization** — do it *after* the eye-gate, once you've confirmed no other consumer (`forbidden-surface.mjs:63`). Optional; don't let it block the trees.

### Move 4 — Bake provenance (the enabling change; no UI)
`bake-trees.js` currently tags each tree internally with `__kind` (`:414-417`, census|derived — drives nudge-vs-drop and the dissolve) but **throws it away**: the per-instance emit at `:561-591` writes no source field. **Add a `source` field** there (e.g. `park` / `city-inventory` / `osm` / `derived`, from `__kind` + the originating well — note `park` is distinct from `city-inventory` so the authored park is addressable on its own, per Move 1). That's the whole of Move 4 — **no runtime toggle, no store change, no InstancedTrees change.** The runtime keeps its single `layerVis.tree` boolean (`InstancedTrees.jsx:902`).

---

## Verify (eye-gate — proxy renders do NOT count: [[feedback_proxy_render_is_not_the_operator_eye]])
- **Composition count:** capture `[bake-trees] placed X/Y (Z unmatched)` and the per-well split. Expect a **large real fraction** for LS (city street inventory + park), a **small** derived fill. If derived dominates, the city fetch under-covered — investigate before shipping.
- **Zero illegal:** no trunk in the carriageway, on a sidewalk, or inside a building/water/parking footprint (this is the whole point of Move 3). Spot-check the residential blocks that the legacy mask used to get wrong.
- **Park intact:** the park census still reads as authored — the gem didn't regress.
- **Jacob's eye on the lit app** in the Grove and in prod LS before merge. Nothing is "confirmed" until he says so ([[feedback_dont_claim_confirmed_without_verifying]]).

## Dispatch
**One agent, serial** (decided) — not parallel babies. Moves 2–4 all touch `arborist/bake-trees.js` and `cartograph/tree-bake-inputs.mjs` (load-bearing shared files → serialize, [[feedback_load_bearing_files_serial_dispatch]]); Move 1 is Python/data intake that feeds them. One agent carries the whole chain in dependency order.

## Commit bounds
- All on trunk `curb-offset-draw`. Reasonable to split into commits per move (intake / resolver / mask / provenance). Baked artifacts (`public/baked/lafayette-square/*`) get committed but **surface the re-bake to Jacob** — he pushes when happy ([[feedback-commit-everything-solo-repo]]). **Never `git restore public/baked/**`** ([[project_census_is_per_hood_and_isolated]]).
- Worktree isolation if dispatched as a baby; docs land on trunk ([[feedback_dispatch_agents_in_worktrees]]).

## Traps (measured, live)
- **`15-derive-tree-mix.py` rewrites `design.json#/trees` as a side effect** and can restate the roster (e.g. 26→21 variants), **staling the atlas** → a stale atlas **blanks the WHOLE grove** (one unresolvable variant throws in `treeAtlasMaterial.js`). After running the mix, **`node arborist/bake-look.js --look lafayette-square`** to re-pack the atlas, and confirm every `design.json#/trees` entry has a key in the atlas' `canopyByVariant`.
- **`bake-lamps.js`/`bake-*` default `--look=default`** → phantom `baked/default/*`. Always pass `--scene=lafayette-square --look=lafayette-square`.
- **Committed LS slabs were already stale** vs their inputs before this work — a fresh bake will differ; that's expected, not a regression.
- **`clean/*` is gitignored** (`.gitignore:99`) — the fetched census is **local-only**; the shippable artifact is the baked `trees.json`.
- **LS roster is broadleaf-only** and hasn't been through the classification gauntlet ([[project_chassis_tagging_gauntlet]]); conifer/columnar/weeping species will substitute-within-category or drop. That's queued work, not a defect to fix here.

## Docs to reconcile when done
- **`TREE-INTAKE.md §Hardscape mask` is STALE** — it still describes `makeForbiddenTester` as the shared mask and says "LS's tester is unchanged." Rewrite it to the frozen-shape `makeZoneTester` model and the positive "exposed Land Use" allow-rule above; note LS is migrated and the legacy tester retired.
- **`TREE-INTAKE.md §Generalizing to a new town`** — fold in that LS is no longer special-cased (one intake path for all scenes now).
- Retire this brief into `TREE-INTAKE.md` / the arborist canon once landed ([[feedback-retire-briefs-into-canon]]).

## Out of scope (don't scope-creep) — named, not "imaginary future"
- **Full `DEFAULT_SCENE` retirement across buildings / ground / terrain.** This brief normalizes only the **park/tree data** half of the special-case. The constant still gates other subsystems (`cartograph/config.js:25` + gates in `pipeline.js`, `derive.js`, `bake-terrain.js`, `promote-ribbons.js`, `serve.js` — see the wiring audit). Killing it entirely is a separate cross-subsystem campaign.
- **Generalizing the water RENDER** so non-LS hoods show their pools/patches. It's a decoupled shader/feature; trigger = the first hood that actually carries water data. This brief only ensures park/water *data* lands in the right per-hood home so that shader can find it later.
- **`bake-ground-ao.js:169,279` `isDefaultScene` lamp/tree fallbacks** — same "LS reads global `src/data`" pattern but for lamps, not park/tree data. Adjacent sibling cleanup; fold in only if cheap, otherwise leave named.
- The un-poured annulus / coverage holes (a separate SHAPE topic; the allow-model makes it a non-issue for planting).
- The `heroTier` cull consumer (do NOT ship it — [[project_tree_placement_frozen_curb_and_hood_rule]]).
- Per-scene hero camera authoring, overhead/browse impostor work, ambient-wind knobs — separate lanes.
- Any runtime literal-vs-math toggle (deferred by decision; Move 4 only bakes the `source` field that would enable it later).
