# HANDOFF — De-Parking Session

**Created:** 2026-05-03 evening
**For:** A fresh agent picking up a discrete refactor task in parallel with other sprint work.
**Branch policy:** Create a new branch off `main` (NOT off `cartograph-looks-pass-ab`) — the visual sprint is in flight on that branch. Suggested name: `de-parking`. When done, open a PR; do not merge without operator review.

---

## What this session is

A discrete architectural refactor: **eliminate the "park-local" coordinate frame** so all spatial data lives in one neighborhood/world frame. Strategic decision is already made — your job is to execute it cleanly. Don't re-litigate the decision; do read the strategic memo to understand WHY before you change anything:

- `~/.claude/projects/-Users-jacobhenderson-Desktop-lafayette-square/memory/project_de_parking_decision.md` — strategic alignment + rationale + step-by-step
- `~/.claude/projects/-Users-jacobhenderson-Desktop-lafayette-square/memory/project_terrain_elevation_consolidation_audit.md` — audit findings, consolidation target schema
- `~/.claude/projects/-Users-jacobhenderson-Desktop-lafayette-square/memory/project_terrain_buildings_foundations_architecture.md` — terrain + buildings + foundations canonical model

Read those three before touching code. They contain the "why" for every decision below.

## Working directory

```
/Users/jacobhenderson/Desktop/lafayette-square.nosync/
```

(NOT `~/Desktop/lafayette-square` — that is a stub. The `.nosync` folder is the real repo, deliberately excluded from iCloud sync.)

## What "done" looks like

A merged PR (or PR-ready branch) that achieves all of:

1. **Single source of truth for the four spatial primitives:**
   - `V_EXAG`
   - `getElevation(x, z)` and `getElevationRaw(x, z)`
   - The terrain heightmap data + bounds
   - The historical park-rotation constant (if it survives at all)

   All four exported from one shared module, importable by both runtime (vite/ESM) and bake scripts (node/CJS-compatible).

2. **Zero `PARK_GRID_ROTATION` (or equivalent rotation by `-9.2°`) in any production rendering or bake code path.**
   The five known callsites (see audit doc) are eliminated. Any rotation surviving lives in a one-shot data-migration script, not in render/bake.

3. **All spatial data agrees on one frame.**
   Trees, buildings, ground, ribbons, park assets — same XZ frame, no internal rotations to align them with each other.

4. **Visual: Stage AND Preview both render the neighborhood correctly after the migration.**
   - Trees on streets (not 9° offset).
   - Buildings on streets (not floating, not offset).
   - Park water inside park (not displaced).
   - Verify in `/cartograph.html` (Stage view, Hero shot) and `/preview.html` (Preview, Hero shot).

5. **Foundations work.** The floating-buildings symptom that triggered this refactor is resolved without needing the universal-deep-burial fallback. Buildings sit on terrain at correct heights; foundations bury naturally at hillside corners.

6. **Memory + backlog updated to reflect new state.** When done, update `project_de_parking_decision.md` with "completed YYYY-MM-DD" plus a short "what we found" summary. Update `cartograph/BACKLOG.md` to remove the de-parking item.

## What "in scope" / "out of scope"

**In scope:**
- Anything related to coordinate frames, the −9.2° rotation, V_EXAG centralization, getElevation centralization, terrain bounds, terrain shader uniforms.
- Migrating data files in `src/data/` if their coords are in park-local frame.
- Modifying bake scripts (`cartograph/bake-buildings.js`, `cartograph/bake-ground.js`, `arborist/bake-trees.js`, etc.) to use the new shared module.
- Modifying runtime components (LafayetteScene, BakedBuildings, BakedGround, MapLayers, InstancedTrees, LafayettePark) to consume the new shared module.
- Re-running bakes after data migration to regenerate `public/baked/<look>/`.

**Out of scope (do not touch):**
- The Arch (`src/stage/StageArch.jsx`, `src/components/GatewayArch.jsx`).
- Trees pipeline beyond coordinate-frame fixes (atlas, LOD, culling, bake schema additions). Per `project_arborist_*` memory.
- Building roof shape / wall material / personalization. Per `project_house_personalization_via_placecards.md`, this work belongs in LS-app PlaceCards, not here.
- Cloud renderer.
- The Stage panel re-org (`project_panel_reorg_set_umbrella.md`).
- StripChart / GpuPanel / profiler UI.
- Any Cary / non-LS work.

If a fix in your scope reveals a bug outside your scope, document it in a memory note and continue. Do not expand the diff.

## The audit you're inheriting

Already done — don't re-do.

**Hardcoded `-9.2°` (or `9.2 * Math.PI / 180`) currently appears in:**
- `src/components/InstancedTrees.jsx:25` — `PARK_GRID_ROTATION`
- `src/components/LafayettePark.jsx:18` — `GRID_ROTATION` (different name; verify same usage)
- `src/components/GroundExport.jsx:43-44` — `PARK_COS`, `PARK_SIN`
- `src/cartograph/MapLayers.jsx:26` — `PARK_GRID_ROTATION`
- `arborist/bake-trees.js:38` — `PARK_GRID_ROTATION`, used at lines 38, 61, 92, 131, 132, 291

**Hardcoded `V_EXAG = 5` currently appears in:**
- `src/utils/elevation.js:5` (canonical export)
- `cartograph/bake-ground.js:40` (duplicate)
- `cartograph/bake-buildings.js:31, 57` (comment + magic `* 5`)

**`getElevation` / `getElevationRaw` is implemented in:**
- `src/utils/elevation.js:15`
- `cartograph/bake-ground.js:67`
- `cartograph/bake-buildings.js:42, 57`

**Other relevant pre-existing facts:**
- The "floating buildings" visual bug exists in BOTH Stage and Preview. `bake-trees.js` rotates park-local→world before elevation lookup; `bake-buildings.js:594-595` does NOT. Strong working hypothesis: `buildings.json` footprints are in park-local frame, and bake-buildings + LafayetteScene both sample elevation at the wrong heightmap location.
- Stage = source authoring (`LafayetteScene.jsx`); Preview = mirror that consumes the bake (`BakedBuildings.jsx`). They are sequential, not parallel.
- `src/components/GatewayArch.jsx` (legacy, 318 lines) is orphaned — Preview was patched to import `src/stage/StageArch.jsx` instead. Don't get confused by it; just leave it alone.

## Recommended order of operations

### Step 1 — Diagnostic (do not change anything yet)

Determine, with evidence, the current frame of every spatial data source. For each of:

- `src/data/buildings.json` (footprints)
- `src/data/terrain.json` (heightmap)
- Whatever feeds `InstancedTrees` — likely a per-Look bake at `public/baked/default.json` or similar
- `src/data/skeleton.json` or whatever feeds streets / ribbons
- Park assets (water, paths, perimeter) wherever those live

Pick a known landmark (e.g., `bldg-0019`, the SE corner of Lafayette Park, the intersection of Lafayette Ave + Park Ave) and verify which frame the coords are in by comparing data values against the apparent on-screen position.

Write findings to a fresh memory note: `project_de_parking_inventory.md`. Specifically:
- Which datasets are in park-local frame (need rotation to convert to world)
- Which datasets are in world frame (no conversion)
- Which datasets are ambiguous and how you broke the tie

Do not skip this step. Every subsequent decision depends on it.

### Step 2 — Pick the canonical frame

The canonical frame should be the one MORE existing data is already in (cheapest migration). Strong prior: the canonical frame is "world / neighborhood-aligned with streets," because terrain.json + ribbons + likely buildings.json all live there. Trees and park assets are the suspects for being in park-local.

Confirm this from your inventory before proceeding.

### Step 3 — Build `terrainCommon.js` (or your preferred name)

Per the consolidation target in `project_terrain_elevation_consolidation_audit.md`:

```
src/lib/terrainCommon.js  (or src/data/parkConstants.js + helpers)
   exports:
     - V_EXAG (number)
     - PARK_GRID_ROTATION (kept ONLY if data-migration script needs it; else delete)
     - getElevationRaw(x, z) → number, no V_EXAG applied
     - getElevation(x, z) → getElevationRaw × V_EXAG
     - terrainBounds = { minX, maxX, minZ, maxZ }
     - displaceGeometry(geometry) → mutates Y in place
```

Must be importable from BOTH:
- vite-ESM runtime (`src/...`, `src/cartograph/...`, `src/preview/...`, etc.)
- node-CJS bake scripts (`cartograph/...`, `arborist/...`)

The current obstacle (per `bake-buildings.js:28-30`) is "node ESM can't import the JSON directly without `with { type: 'json' }`." Choose your strategy:
- (a) Make `terrainCommon.js` a `.js` file that uses `readFileSync` of the JSON. Both ESM and CJS friendly.
- (b) Use `.mjs` with `import { ... } with { type: 'json' }` and require Node 22+.
- (c) Pre-bake constants into a generated `.js` file at build time.

Pick whatever is least intrusive on the project's existing tooling. (a) is probably the right answer.

### Step 4 — Migrate data (if step 1 shows park-local data exists)

One-shot migration script in `scripts/de-park-data.mjs` (or wherever scripts live). Reads each park-local data file, rotates each XZ pair park→world (using `+9.2°` to undo the `-9.2°` that's currently applied at render time), writes back. Commit the migrated data files as a SEPARATE commit so the diff is reviewable.

Verify by visual diff: after the data migration, the data values should look approximately like the data is now in the same frame as terrain.json bounds.

### Step 5 — Delete rotation code paths

For each of the 5+ callsites listed above, delete the `PARK_GRID_ROTATION` constant and the `<group rotation>` / coordinate-rotating math that uses it.

Verify each deletion by:
- (a) Hard reload `/cartograph.html` and `/preview.html`.
- (b) Confirm trees still in park, buildings still on streets, water still in pond, etc.
- (c) Build is clean (no JS errors).

If any deletion breaks the visual, the data migration in step 4 missed something. Don't paper over with a partial rotation; fix the data migration.

### Step 6 — Consolidate getElevation / V_EXAG

Now that there's no rotation issue masking the elevation lookup math, replace:
- `cartograph/bake-ground.js`'s local `V_EXAG` + `getElevation` with imports from terrainCommon.
- `cartograph/bake-buildings.js`'s local `getElevationRaw` + magic `* 5` with imports.
- `arborist/bake-trees.js`'s elevation logic if it has one.
- `src/utils/elevation.js` becomes a thin re-export of terrainCommon (or terrainCommon REPLACES elevation.js — author's choice).

Verify by:
- Rebake everything that bakes (trigger via `POST /looks/lafayette-square/bake` on cartograph backend port 3333 — or `node cartograph/bake-buildings.js --look=lafayette-square`).
- Hard reload Stage and Preview, confirm visual matches.

### Step 7 — Verify foundations work

The "floating buildings" symptom should be GONE without further intervention. If it persists, the rotation hypothesis was wrong and there's a different bug. In that case, stop and write up findings; don't bury foundations deeper as a workaround.

If foundations look right at hillside corners across Browse / Hero / Street modes — the de-parking work is structurally complete.

### Step 8 — Update memory + backlog

- Mark `project_de_parking_decision.md` as completed with a date and a short "what was actually in park-local frame" summary.
- Remove the de-parking item from `cartograph/BACKLOG.md`.
- Add a new memory note `project_de_parking_completed.md` summarizing what consolidated to where, so future operators know.

## How to run + verify

The project has three dev servers; launch all three with:

```bash
cd /Users/jacobhenderson/Desktop/lafayette-square.nosync
npm run dev
```

This starts:
- vite on `http://localhost:5173`
- cartograph backend on port 3333
- arborist backend on port 3334

Entry pages on 5173:
- `/cartograph.html` — Stage + Preview live inside this single app (toolbar switches between authoring and Preview view)
- `/preview.html` — standalone Preview (mobile canary, has GPU profiler)

Stage and Preview are NOT separate routes; they're modes inside `/cartograph.html`. The standalone `/preview.html` is the one with the StripChart + GpuPanel.

To trigger a fresh bake:
```bash
curl -X POST 'http://localhost:3333/looks/lafayette-square/bake'
```

Or for the tree atlas / per-Look tree bake:
```bash
curl -X POST 'http://localhost:3334/atlas/bake?look=lafayette-square'
```

## Working with the user

The user is busy on parallel sprint work. Don't request input unless you genuinely need a strategic decision. Things to surface:
- If your inventory in step 1 reveals data is in a different frame than expected (e.g., terrain itself is in compass-N, not world).
- If a consumer of `PARK_GRID_ROTATION` is doing something semantically meaningful (not just "convert frame") that you can't safely delete.
- If the visual verification in step 7 still shows floating buildings — STOP, write findings, don't paper over.

Things to NOT surface:
- Naming questions (`terrainCommon.js` vs `terrain.js` vs `parkConstants.js` — pick one).
- Refactor opportunities tangential to the audit.
- Code style / formatting.

## Memory you should write while working

Keep notes in:
- `project_de_parking_inventory.md` (step 1 output)
- `project_de_parking_completed.md` (step 8 output)

If you discover anything that contradicts the existing memory docs (e.g., the audit got something wrong), update those docs in place — do not let stale memory persist.

## Commits

Branch off `main`. Pattern:

```
1. Inventory + memory notes only (no code change yet)
2. terrainCommon.js extracted, no consumers migrated yet
3. Data migration (ONE commit, just the JSON edits + the migration script)
4. Each consumer migrated to terrainCommon (one commit per consumer or per area is fine)
5. Rotation deletions (one commit per file or per area)
6. Final cleanup (memory updates, backlog, completion note)
```

Atomic commits with clear messages. Do not amend. Do not force-push. Do not merge to main.

When ready, push the branch and open a PR. Do not auto-merge.

## Caveats / known gotchas

- **iCloud:** the working directory is `~/Desktop/lafayette-square.nosync/` (note the `.nosync` suffix — this is INTENTIONAL, excludes the folder from iCloud sync). Do NOT move the folder. Do NOT remove the suffix.
- **External backup:** there's a mirror clone of the repo on `/Volumes/Today/lafayette-square-backup.git`. You don't need to push there; it's a safety net.
- **Dev servers:** if `npm run dev` reports port conflicts, kill any leftover node processes (likely PIDs holding 3333/3334/5173 from a prior session) before retrying.
- **Bake duration:** a full LS bake (`POST /looks/lafayette-square/bake`) takes ~30 seconds. The atlas/tree bake takes ~8–10 seconds. Plan accordingly.

## Done condition checklist

- [ ] Step 1 inventory written to `project_de_parking_inventory.md`
- [ ] `terrainCommon.js` (or chosen name) extracted, importable from ESM and CJS
- [ ] All 5+ rotation callsites deleted
- [ ] All 3 V_EXAG hardcodings deleted (now imported)
- [ ] All 3 getElevation implementations deleted (now imported)
- [ ] Data migration committed (if needed per step 1 findings)
- [ ] Bakes regenerated and committed
- [ ] Visual verification: Stage Hero, Preview Hero, all camera modes — buildings sit on streets, no floating, no offset
- [ ] Foundation symptom resolved without resorting to deep-burial workaround
- [ ] Memory updated, BACKLOG updated
- [ ] PR opened against main (NOT merged)
- [ ] PR description includes: what was in park-local frame, what's in the new shared module, screenshot proof of Stage + Preview alignment

Good luck. The clear answer is somewhere in step 1; the rest is mechanical execution.
